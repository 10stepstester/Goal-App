import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

async function getUser() {
  const { data } = await supabase.from('users').select('*').limit(1).single();
  return data;
}

// Ensure a single goal exists for the user, auto-create if needed
async function ensureGoal(userId: string) {
  const { data: goals } = await supabase
    .from('goals')
    .select('*, subtasks(*)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('position')
    .limit(1);

  if (goals && goals.length > 0) {
    return {
      ...goals[0],
      subtasks: (goals[0].subtasks || []).sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position
      ),
    };
  }

  // Auto-create a single goal container
  const { data: goal, error } = await supabase
    .from('goals')
    .insert({ user_id: userId, title: 'My To-dos', position: 1, is_active: true })
    .select()
    .single();

  if (error || !goal) {
    console.error('Failed to auto-create goal:', error);
    return null;
  }

  return { ...goal, subtasks: [] };
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No user found' }, { status: 404 });

    const goal = await ensureGoal(user.id);
    if (!goal) return NextResponse.json({ error: 'Failed to initialize' }, { status: 500 });

    return NextResponse.json({ goal });
  } catch (error) {
    console.error('GET /api/goals error:', error);
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No user found' }, { status: 404 });

    const { id, title, position } = await request.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const updateFields: Record<string, unknown> = {};
    if (title !== undefined) updateFields.title = title;
    if (position !== undefined) updateFields.position = position;

    const { data: updated, error } = await supabase
      .from('goals')
      .update(updateFields)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !updated) {
      console.error('PATCH /api/goals error:', error);
      return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
    }

    return NextResponse.json({ goal: updated });
  } catch (error) {
    console.error('PATCH /api/goals error:', error);
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No user found' }, { status: 404 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', user.id);
    if (error) {
      console.error('DELETE /api/goals error:', error);
      return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/goals error:', error);
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }
}
