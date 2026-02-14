import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google-calendar';

export async function GET() {
  try {
    const authUrl = getAuthUrl();

    if (!authUrl) {
      return NextResponse.json(
        { error: 'Google Calendar OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' },
        { status: 500 }
      );
    }

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('GET /api/auth/google error:', error);
    return NextResponse.json({ error: 'Failed to initiate Google OAuth' }, { status: 500 });
  }
}
