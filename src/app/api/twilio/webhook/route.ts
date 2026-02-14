import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { parseSmsReply, generateCoachingReply } from '@/lib/claude';
import { sendSMS } from '@/lib/twilio';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const body = formData.get('Body') as string | null;
    const from = formData.get('From') as string | null;

    if (!body || !from) {
      return new NextResponse('<Response><Message>Invalid request</Message></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Look up user by phone number
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', from)
      .single();

    if (!user) {
      return new NextResponse(
        '<Response><Message>Unknown number. Please register first.</Message></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    // Fetch user's goals with subtasks
    const { data: goals } = await supabase
      .from('goals')
      .select('*, subtasks(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('position');

    const goalsWithSubtasks = (goals || []).map((goal) => ({
      ...goal,
      subtasks: (goal.subtasks || []).sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position
      ),
    }));

    // Get recent SMS conversation history (last 10 messages)
    const { data: recentMessages } = await supabase
      .from('sms_conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(10);

    const recentMessageTexts = (recentMessages || [])
      .reverse()
      .map((m) => `${m.direction === 'inbound' ? 'User' : 'Coach'}: ${m.message_text}`);

    // Parse intent using Claude
    const parsed = await parseSmsReply({
      goals: goalsWithSubtasks,
      recentMessages: recentMessageTexts,
      incomingSms: body,
    });

    // Execute the parsed intent
    if (parsed.intent === 'update_goal' && parsed.goalId && parsed.newGoalText) {
      await supabase
        .from('goals')
        .update({ title: parsed.newGoalText })
        .eq('id', parsed.goalId)
        .eq('user_id', user.id);

      await supabase
        .from('activity_log')
        .insert({ user_id: user.id, action_type: 'goal_updated_via_sms', goal_id: parsed.goalId });
    }

    if (parsed.intent === 'add_subtask' && parsed.goalId && parsed.subtasksToAdd.length > 0) {
      const goalId = parsed.goalId;

      const { data: maxPosRow } = await supabase
        .from('subtasks')
        .select('position')
        .eq('goal_id', goalId)
        .order('position', { ascending: false })
        .limit(1)
        .single();

      let position = (maxPosRow?.position ?? 0) + 1;

      for (const subtaskTitle of parsed.subtasksToAdd) {
        const { data: subtask } = await supabase
          .from('subtasks')
          .insert({ goal_id: goalId, title: subtaskTitle, is_completed: false, position })
          .select()
          .single();

        if (subtask) {
          await supabase
            .from('activity_log')
            .insert({ user_id: user.id, action_type: 'subtask_created_via_sms', goal_id: goalId, subtask_id: subtask.id });
        }
        position++;
      }
    }

    if (parsed.intent === 'complete_subtask' && parsed.subtasksToComplete.length > 0) {
      for (const subtaskId of parsed.subtasksToComplete) {
        // Verify subtask belongs to user via goal join
        const { data: subtask } = await supabase
          .from('subtasks')
          .select('*, goals!inner(user_id)')
          .eq('id', subtaskId)
          .eq('goals.user_id', user.id)
          .single();

        if (subtask) {
          await supabase
            .from('subtasks')
            .update({ is_completed: true, completed_at: new Date().toISOString() })
            .eq('id', subtaskId);

          await supabase
            .from('activity_log')
            .insert({ user_id: user.id, action_type: 'subtask_completed_via_sms', goal_id: subtask.goal_id, subtask_id: subtaskId });
        }
      }
    }

    // Generate coaching reply if the parsed one is empty or for question/other intents
    let replyText = parsed.coachingReply;

    if (!replyText && (parsed.intent === 'question' || parsed.intent === 'other')) {
      // Re-fetch goals after modifications
      const { data: updatedGoals } = await supabase
        .from('goals')
        .select('*, subtasks(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('position');

      const updatedGoalsWithSubtasks = (updatedGoals || []).map((goal) => ({
        ...goal,
        subtasks: (goal.subtasks || []).sort(
          (a: { position: number }, b: { position: number }) => a.position - b.position
        ),
      }));

      replyText = await generateCoachingReply({
        nudgeStyle: user.nudge_style,
        goals: updatedGoalsWithSubtasks,
        action: `User said: "${body}"`,
        outcomeTarget: user.outcome_target,
      });
    }

    // Log inbound message
    await supabase
      .from('sms_conversations')
      .insert({ user_id: user.id, direction: 'inbound', message_text: body, goal_context: null });

    // Log outbound message
    await supabase
      .from('sms_conversations')
      .insert({ user_id: user.id, direction: 'outbound', message_text: replyText, goal_context: null });

    // Send coaching reply via SMS
    await sendSMS(user.phone_number, replyText);

    // Return empty TwiML since we send reply via API
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('POST /api/twilio/webhook error:', error);
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
