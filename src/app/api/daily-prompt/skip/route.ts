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

    const { data: subtask, error: findError } = await supabase
      .from('subtasks')
      .select('id, title')
      .eq('id', subtaskId)
      .single();

    if (findError || !subtask) {
      return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from('subtasks')
      .update({ daily_response: 'skipped' })
      .eq('id', subtaskId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to skip subtask' }, { status: 500 });
    }

    return NextResponse.json({ success: true, title: subtask.title });
  } catch (error) {
    console.error('POST /api/daily-prompt/skip error:', error);
    return NextResponse.json({ error: 'Failed to skip task' }, { status: 500 });
  }
}
