import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET() {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('*, subtasks(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('position');

    if (goalsError) {
      console.error('GET /api/goals error fetching goals:', goalsError);
      return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
    }

    const goalsWithSubtasks = (goals || []).map((goal) => ({
      ...goal,
      subtasks: (goal.subtasks || []).sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position
      ),
    }));

    return NextResponse.json({ goals: goalsWithSubtasks });
  } catch (error) {
    console.error('GET /api/goals error:', error);
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { title } = await request.json();
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const { count } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: 'Maximum of 3 active goals allowed' }, { status: 400 });
    }

    const { data: maxPosRow } = await supabase
      .from('goals')
      .select('position')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const position = (maxPosRow?.position ?? 0) + 1;

    const { data: goal, error: insertError } = await supabase
      .from('goals')
      .insert({ user_id: user.id, title, position, is_active: true })
      .select()
      .single();

    if (insertError || !goal) {
      console.error('POST /api/goals insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
    }

    await supabase
      .from('activity_log')
      .insert({ user_id: user.id, action_type: 'goal_created', goal_id: goal.id });

    return NextResponse.json({
      goal: { ...goal, subtasks: [] },
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/goals error:', error);
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { id, title, position } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('goals')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const updateFields: Record<string, unknown> = {};
    if (title !== undefined) updateFields.title = title;
    if (position !== undefined) updateFields.position = position;

    const { data: updated, error: updateError } = await supabase
      .from('goals')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('PATCH /api/goals update error:', updateError);
      return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
    }

    await supabase
      .from('activity_log')
      .insert({ user_id: user.id, action_type: 'goal_updated', goal_id: id });

    return NextResponse.json({ goal: updated });
  } catch (error) {
    console.error('PATCH /api/goals error:', error);
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('goals')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    // Log deletion (goal_id is NULL since the goal is about to be deleted)
    await supabase
      .from('activity_log')
      .insert({ user_id: user.id, action_type: 'goal_deleted', goal_id: null });

    // Delete the goal — subtasks cascade, activity_log FK sets null automatically
    const { error: deleteError } = await supabase
      .from('goals')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('DELETE /api/goals delete error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/goals error:', error);
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }
}
