import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { subtaskId } = await request.json();
    if (!subtaskId) {
      return NextResponse.json({ error: 'subtaskId is required' }, { status: 400 });
    }

    // Look up the subtask to get goal_id
    const { data: subtask, error: findError } = await supabase
      .from('subtasks')
      .select('id, goal_id, title')
      .eq('id', subtaskId)
      .single();

    if (findError || !subtask) {
      return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
    }

    // Mark complete
    const { error: updateError } = await supabase
      .from('subtasks')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('id', subtaskId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update subtask' }, { status: 500 });
    }

    // Log to activity_log
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single();

    if (user) {
      await supabase
        .from('activity_log')
        .insert({
          user_id: user.id,
          action_type: 'daily_task_completed',
          goal_id: subtask.goal_id,
          subtask_id: subtaskId,
        });
    }

    return NextResponse.json({ success: true, title: subtask.title });
  } catch (error) {
    console.error('POST /api/daily-prompt/complete error:', error);
    return NextResponse.json({ error: 'Failed to complete task' }, { status: 500 });
  }
}
