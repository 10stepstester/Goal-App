import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/db';
import { PLAN_V4, PLAN_AMENDMENTS, planWeek } from '@/lib/plan';

const anthropic = new Anthropic();

const ADVISORY_SYSTEM = `You are Ladd's locked strategic advisory board distilled into one voice. The plan is DECIDED — do not re-plan or suggest alternatives. Given the plan, the dated amendments (which OVERRIDE the plan where they conflict), today's date, the current plan week, and recent activity, output the single most important thing Ladd should do next as one SMS he'd actually act on. If a kill-criterion or overdue long-pole item applies, it overrides everything.

Output strict JSON, nothing else: { "recommended_focus": "<short label>", "the_text": "<the SMS, <=160 chars, no preamble>", "why": "<1 sentence for the log>" }`;

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      console.error('[MorningAdvisory] Error fetching user:', userError);
      return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
    }

    // Sprint lookup — soft fallback only. v4 (plan.ts) is now the primary content
    // source; the Sprint item just gives a snapshot of in-progress tracks if present.
    const { data: goals } = await supabase
      .from('goals')
      .select('*, subtasks(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('position');

    const sprintRegex = /sprint/i;
    let sprintTracks: { title: string; completed: boolean }[] = [];
    for (const goal of goals || []) {
      const sorted = (goal.subtasks || []).sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position
      );
      const sprintItem = sorted.find(
        (s: { title: string; parent_id: string | null }) => !s.parent_id && sprintRegex.test(s.title)
      );
      if (sprintItem) {
        sprintTracks = sorted
          .filter((s: { parent_id: string | null }) => s.parent_id === sprintItem.id)
          .map((s: { title: string; is_completed: boolean }) => ({
            title: s.title,
            completed: s.is_completed,
          }));
        break;
      }
    }

    // Compute yesterday's activity
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const { data: completedYesterday } = await supabase
      .from('subtasks')
      .select('title, completed_at')
      .eq('is_completed', true)
      .gte('completed_at', yesterday.toISOString())
      .lte('completed_at', now.toISOString());

    const { data: smsYesterday } = await supabase
      .from('sms_conversations')
      .select('direction, sent_at')
      .eq('user_id', user.id)
      .gte('sent_at', yesterday.toISOString())
      .lte('sent_at', now.toISOString())
      .order('sent_at', { ascending: true });

    const userReplies = (smsYesterday || []).filter((m) => m.direction === 'inbound');
    const outboundMessages = (smsYesterday || []).filter((m) => m.direction === 'outbound');

    // Compute median reply latency
    let medianReplyLatencyMin: number | null = null;
    if (userReplies.length > 0 && outboundMessages.length > 0) {
      const latencies: number[] = [];
      for (const reply of userReplies) {
        const replyTime = new Date(reply.sent_at).getTime();
        const precedingNudge = outboundMessages
          .filter((m) => new Date(m.sent_at).getTime() < replyTime)
          .pop();
        if (precedingNudge) {
          latencies.push((replyTime - new Date(precedingNudge.sent_at).getTime()) / 60000);
        }
      }
      if (latencies.length > 0) {
        latencies.sort((a, b) => a - b);
        const mid = Math.floor(latencies.length / 2);
        medianReplyLatencyMin = latencies.length % 2 === 0
          ? (latencies[mid - 1] + latencies[mid]) / 2
          : latencies[mid];
        medianReplyLatencyMin = Math.round(medianReplyLatencyMin);
      }
    }

    const yesterdayActivity = {
      tasks_completed: (completedYesterday || []).map((s) => s.title),
      tasks_completed_count: (completedYesterday || []).length,
      user_replies: userReplies.length,
      outbound_nudges: outboundMessages.length,
      median_reply_latency_min: medianReplyLatencyMin,
    };

    // Date context (timezone-aware)
    const todayLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: user.timezone,
    }).format(now);
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: user.timezone,
      weekday: 'long',
    }).format(now);

    const userPrompt = `# THE PLAN (locked, v4)
${PLAN_V4}

# DATED AMENDMENTS (override the plan where they conflict)
${PLAN_AMENDMENTS}

# TODAY
Date: ${todayLocal} (${weekday})
Current plan week: ${planWeek(now)}

# RECENT ACTIVITY
${JSON.stringify(yesterdayActivity, null, 2)}

# IN-PROGRESS SPRINT TRACKS (soft context; defer to the plan if they conflict)
${JSON.stringify(sprintTracks, null, 2)}

Output the JSON now.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: ADVISORY_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    let raw = textBlock?.text.trim() || '{}';
    raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    let advisory: { recommended_focus: string; the_text: string; why: string };
    try {
      advisory = JSON.parse(raw);
    } catch {
      console.error('[MorningAdvisory] Failed to parse advisory JSON:', raw);
      advisory = {
        recommended_focus: sprintTracks.find((t) => !t.completed)?.title || 'Execute the plan',
        the_text: 'Pick the highest-leverage plan item for this week and ship one concrete step today.',
        why: 'Fallback: model JSON parse failed.',
      };
    }

    // Upsert daily_advisory — schema unchanged. check-goals reads recommended_focus
    // + nudge_guidance, so the SMS (the_text) maps into nudge_guidance.
    const { data: advisoryRow, error: upsertError } = await supabase
      .from('daily_advisory')
      .upsert(
        {
          user_id: user.id,
          date: todayLocal,
          sprint_snapshot: sprintTracks,
          yesterday_activity: yesterdayActivity,
          advisor_transcript: { the_text: advisory.the_text, why: advisory.why },
          recommended_focus: advisory.recommended_focus,
          nudge_guidance: advisory.the_text,
        },
        { onConflict: 'user_id,date' }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('[MorningAdvisory] Upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to save advisory', details: upsertError }, { status: 500 });
    }

    console.log(`[MorningAdvisory] Advisory created for ${todayLocal}:`, advisory.recommended_focus);

    return NextResponse.json({
      success: true,
      advisory: advisoryRow,
    });
  } catch (error) {
    console.error('[MorningAdvisory] Error:', error);
    return NextResponse.json({ error: 'Morning advisory failed' }, { status: 500 });
  }
}
