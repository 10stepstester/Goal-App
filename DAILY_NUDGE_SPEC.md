# Build: Daily PainReliefKC Nudge

Daily 5:30am SMS proposing the top painreliefkc task. Reply Y to approve, N to skip. Cowork executes approved tasks later via its own scheduled task and marks them complete here.

## Schema (additive migration)

Add two columns to `subtasks`:

```sql
ALTER TABLE subtasks ADD COLUMN proposed_for_daily_at TIMESTAMPTZ NULL;
ALTER TABLE subtasks ADD COLUMN daily_response TEXT NULL; -- 'approved' | 'skipped'
```

State machine:
- Both null → never proposed
- proposed_for_daily_at set, daily_response null → awaiting reply
- both set → responded; if 'approved' and `is_completed = false`, Cowork should execute it

## Endpoint 1: `POST /api/cron/daily-prompt`

Bearer-token protected via `CRON_SECRET` (match pattern of existing `/api/cron/check-goals`).

Logic:
1. Find the user's top-level "PainReliefKC" subtask (`parent_id IS NULL`, title matched case-insensitively against `painrelief` or `pain relief`)
2. Collect all incomplete descendants (recursive on parent_id)
3. Pass list to Claude Sonnet with the prompt: "Goal: drive new patients to painreliefkc.com. Pick the single highest-impact task to do today. Return the subtask id only."
4. Set `proposed_for_daily_at = NOW()` on the chosen subtask
5. Send SMS via existing Twilio integration (`src/lib/twilio.ts`): `☀️ Today's painreliefkc move: "{title}". Reply Y to approve, N to skip.`
6. Log to `activity_log` and `sms_conversations`
7. Return 200 JSON with `{ subtaskId, title }`

## Twilio webhook update

In existing `/api/twilio/webhook/route.ts`, **before** existing intent parsing:

- Query: any subtask for this user where `proposed_for_daily_at > NOW() - INTERVAL '24 hours'` AND `daily_response IS NULL` AND `is_completed = false`
- If found, parse the inbound message:
  - Matches Y / yes / approve / ok / sure / go → set `daily_response = 'approved'`, reply: `✅ Got it. I'll text when it's done.`
  - Matches N / no / skip / pass → set `daily_response = 'skipped'`, reply: `👍 Skipped. I'll pick a different one tomorrow.`
  - Anything else → fall through to existing intent parsing (don't consume the message)
- If no pending daily prompt found → fall through to existing intent parsing

## Endpoint 2: `GET /api/daily-prompt/approvals`

Bearer-token protected via `CRON_SECRET`.

Returns subtasks where `daily_response = 'approved'` AND `is_completed = false`. Include parent chain so the caller knows the category context.

Response shape:
```json
{
  "approvals": [
    {
      "subtaskId": "uuid",
      "title": "Add Overland Park location landing page",
      "categoryPath": ["PainReliefKC", "Website"],
      "proposedAt": "2026-05-18T10:30:00Z",
      "approvedAt": "2026-05-18T13:14:00Z"
    }
  ]
}
```

## Marking complete

No new endpoint needed. Cowork will use the existing `PATCH /api/goals/[id]/subtasks` route with `{ is_completed: true }`.

## Manual test

```bash
# Fire the cron manually
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://goal-app-five-beta.vercel.app/api/cron/daily-prompt

# Reply Y from your phone after the SMS arrives

# Check approvals
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://goal-app-five-beta.vercel.app/api/daily-prompt/approvals
```

## Deploy

`npx vercel --prod` (GitHub auto-deploy is broken per CLAUDE.md).

## Don'ts

- Don't add a Vercel cron for this — Cowork triggers it
- Don't modify Smart List logic
- Don't break the existing check-goals cron
- Don't drop any columns; this is additive only
