import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Find approved but not yet completed subtasks
    const { data: approved, error } = await supabase
      .from('subtasks')
      .select('id, title, proposed_for_daily_at, daily_response, goal_id, parent_id')
      .eq('daily_response', 'approved')
      .eq('is_completed', false);

    if (error) {
      console.error('GET /api/daily-prompt/approvals error:', error);
      return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
    }

    // Build parent chain for each approval
    const approvals = [];
    for (const item of approved || []) {
      const categoryPath: string[] = [];
      let currentId = item.parent_id;

      while (currentId) {
        const { data: parent } = await supabase
          .from('subtasks')
          .select('id, title, parent_id')
          .eq('id', currentId)
          .single();

        if (!parent) break;
        categoryPath.unshift(parent.title);
        currentId = parent.parent_id;
      }

      approvals.push({
        subtaskId: item.id,
        title: item.title,
        categoryPath,
        proposedAt: item.proposed_for_daily_at,
        approvedAt: item.proposed_for_daily_at,
      });
    }

    return NextResponse.json({ approvals });
  } catch (error) {
    console.error('GET /api/daily-prompt/approvals error:', error);
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
  }
}
