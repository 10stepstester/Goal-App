import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { answerListQuestion } from '@/lib/claude';
import type { Subtask } from '@/types/index';

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const { data: user } = await supabase.from('users').select('*').limit(1).single();
    if (!user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { data: goals } = await supabase
      .from('goals')
      .select('*, subtasks(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('position');

    const subtasks: Subtask[] = goals?.flatMap((g) => g.subtasks || []) || [];

    const reply = await answerListQuestion(subtasks, message);

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('[Chat API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
