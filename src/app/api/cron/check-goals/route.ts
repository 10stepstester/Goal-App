import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { generateNudge } from '@/lib/claude';
import { sendSMS } from '@/lib/twilio';
import { hasEventNow } from '@/lib/google-calendar';

export async function GET(request: Request) {
  try {
    // Verify cron secret if configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (usersError || !users) {
      console.error('GET /api/cron/check-goals error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const summary: { userId: string; action: string }[] = [];

    for (const user of users) {
      try {
        // Check if current time is within active hours
        const now = new Date();
        const userTime = new Intl.DateTimeFormat('en-US', {
          timeZone: user.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(now);

        const [currentHour, currentMinute] = userTime.split(':').map(Number);
        const currentMinutes = currentHour * 60 + currentMinute;

        // active_hours_start and active_hours_end are "HH:MM:SS" strings from Postgres TIME type
        const [startHour, startMinute] = user.active_hours_start.split(':').map(Number);
        const startMinutes = startHour * 60 + startMinute;

        const [endHour, endMinute] = user.active_hours_end.split(':').map(Number);
        const endMinutes = endHour * 60 + endMinute;

        if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
          summary.push({ userId: user.id, action: 'skipped_outside_hours' });
          continue;
        }

        // Check for recent activity (last 10 minutes)
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
        const { count: recentCount } = await supabase
          .from('activity_log')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('timestamp', tenMinutesAgo);

        if ((recentCount ?? 0) > 0) {
          // 10% chance of sending brief reinforcement
          if (Math.random() > 0.1) {
            summary.push({ userId: user.id, action: 'skipped_recent_activity' });
            continue;
          }
          summary.push({ userId: user.id, action: 'reinforcement_sent' });
        }

        // Check Google Calendar if tokens exist
        if (user.google_calendar_token && user.google_calendar_refresh_token) {
          try {
            const busy = await hasEventNow(
              user.google_calendar_token,
              user.google_calendar_refresh_token,
              user.id
            );
            if (busy) {
              summary.push({ userId: user.id, action: 'skipped_calendar_event' });
              continue;
            }
          } catch (calError) {
            console.error(`[Cron] Calendar check failed for user ${user.id}:`, calError);
            // Continue anyway if calendar check fails
          }
        }

        // Get goals with subtasks
        const { data: goals } = await supabase
          .from('goals')
          .select('*, subtasks(*)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('position');

        if (!goals || goals.length === 0) {
          summary.push({ userId: user.id, action: 'skipped_no_goals' });
          continue;
        }

        const goalsWithSubtasks = goals.map((goal) => ({
          ...goal,
          subtasks: (goal.subtasks || []).sort(
            (a: { position: number }, b: { position: number }) => a.position - b.position
          ),
        }));

        // Find first uncompleted subtask
        let firstUncompleted: { goalTitle: string; subtaskTitle: string } | null = null;
        for (const goal of goalsWithSubtasks) {
          const uncompleted = (goal.subtasks || []).find((s: { is_completed: boolean }) => !s.is_completed);
          if (uncompleted) {
            firstUncompleted = { goalTitle: goal.title, subtaskTitle: uncompleted.title };
            break;
          }
        }

        // Calculate hours since last activity
        const { data: lastActivityRow } = await supabase
          .from('activity_log')
          .select('timestamp')
          .eq('user_id', user.id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();

        let hoursSinceActivity = 24; // Default if no activity
        if (lastActivityRow) {
          const lastTime = new Date(lastActivityRow.timestamp).getTime();
          hoursSinceActivity = Math.round((now.getTime() - lastTime) / (1000 * 60 * 60) * 10) / 10;
        }

        // Get recent SMS messages
        const { data: recentSmsRows } = await supabase
          .from('sms_conversations')
          .select('*')
          .eq('user_id', user.id)
          .eq('direction', 'outbound')
          .order('sent_at', { ascending: false })
          .limit(5);

        const recentSMS = (recentSmsRows || []).map((m) => m.message_text);

        // Determine time of day label
        let timeOfDay = 'morning';
        if (currentHour >= 12 && currentHour < 17) timeOfDay = 'afternoon';
        else if (currentHour >= 17) timeOfDay = 'evening';

        // Generate nudge via Claude
        const nudgeText = await generateNudge({
          nudgeStyle: user.nudge_style,
          goals: goalsWithSubtasks,
          firstUncompleted,
          outcomeTarget: user.outcome_target,
          hoursSinceActivity,
          timeOfDay,
          recentSMS,
        });

        // Send via Twilio
        await sendSMS(user.phone_number, nudgeText);

        // Log to sms_conversations
        await supabase
          .from('sms_conversations')
          .insert({
            user_id: user.id,
            direction: 'outbound',
            message_text: nudgeText,
            goal_context: JSON.stringify({ firstUncompleted, hoursSinceActivity }),
          });

        // Log to activity_log
        await supabase
          .from('activity_log')
          .insert({
            user_id: user.id,
            action_type: 'nudge_sent',
            goal_id: firstUncompleted ? goals[0]?.id : null,
          });

        summary.push({ userId: user.id, action: 'nudge_sent' });
      } catch (userError) {
        console.error(`[Cron] Error processing user ${user.id}:`, userError);
        summary.push({ userId: user.id, action: `error: ${(userError as Error).message}` });
      }
    }

    return NextResponse.json({
      success: true,
      processed: users.length,
      summary,
    });
  } catch (error) {
    console.error('GET /api/cron/check-goals error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
