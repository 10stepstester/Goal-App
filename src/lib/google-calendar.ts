import { google } from 'googleapis';
import { supabase } from '@/lib/db';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string | null {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    console.log('[Google Calendar] OAuth credentials not configured.');
    return null;
  }

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function getTokens(code: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    console.log('[Google Calendar] OAuth credentials not configured.');
    return null;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      console.error('[Google Calendar] Missing tokens in response.');
      return null;
    }
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    };
  } catch (error) {
    console.error('[Google Calendar] Error exchanging code for tokens:', error);
    return null;
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    console.log('[Google Calendar] OAuth credentials not configured.');
    return null;
  }

  try {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials.access_token || null;
  } catch (error) {
    console.error('[Google Calendar] Error refreshing access token:', error);
    return null;
  }
}

export async function hasEventNow(
  accessToken: string,
  refreshToken: string,
  userId: string
): Promise<boolean> {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    return false;
  }

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      try {
        await supabase
          .from('users')
          .update({ google_calendar_token: tokens.access_token })
          .eq('id', userId);
      } catch (err) {
        console.error('[Google Calendar] Error updating token in DB:', err);
      }
    }
  });

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const now = new Date();
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: new Date(now.getTime() + 60000).toISOString(), // 1 minute window
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    // Check if any event is currently happening (started before now, ends after now)
    return events.some((event) => {
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;
      if (!start || !end) return false;
      const startTime = new Date(start);
      const endTime = new Date(end);
      return startTime <= now && endTime > now;
    });
  } catch (error) {
    console.error('[Google Calendar] Error checking events:', error);
    // If token expired, try refreshing
    try {
      const newToken = await refreshAccessToken(refreshToken);
      if (newToken) {
        await supabase
          .from('users')
          .update({ google_calendar_token: newToken })
          .eq('id', userId);

        // Retry with new token
        oauth2Client.setCredentials({
          access_token: newToken,
          refresh_token: refreshToken,
        });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const now = new Date();
        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin: now.toISOString(),
          timeMax: new Date(now.getTime() + 60000).toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });
        const events = response.data.items || [];
        return events.some((event) => {
          const start = event.start?.dateTime || event.start?.date;
          const end = event.end?.dateTime || event.end?.date;
          if (!start || !end) return false;
          return new Date(start) <= now && new Date(end) > now;
        });
      }
    } catch (retryError) {
      console.error('[Google Calendar] Retry failed:', retryError);
    }
    return false;
  }
}
