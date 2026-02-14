import { NextResponse } from 'next/server';
import { getTokens } from '@/lib/google-calendar';
import { supabase } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
    }

    const tokens = await getTokens(code);
    if (!tokens) {
      return NextResponse.json({ error: 'Failed to exchange authorization code for tokens' }, { status: 500 });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        google_calendar_token: tokens.access_token,
        google_calendar_refresh_token: tokens.refresh_token,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('GET /api/auth/google/callback update error:', updateError);
      return NextResponse.json({ error: 'Failed to save tokens' }, { status: 500 });
    }

    const baseUrl = url.origin;
    return NextResponse.redirect(`${baseUrl}/?google=connected`);
  } catch (error) {
    console.error('GET /api/auth/google/callback error:', error);
    return NextResponse.json({ error: 'Failed to complete Google OAuth' }, { status: 500 });
  }
}
