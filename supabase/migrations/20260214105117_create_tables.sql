CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  nudge_style VARCHAR(20) DEFAULT 'direct' CHECK(nudge_style IN ('direct', 'average', 'gentle')),
  active_hours_start TIME DEFAULT '05:00:00',
  active_hours_end TIME DEFAULT '21:00:00',
  outcome_target TEXT DEFAULT '20k/month additional income',
  google_calendar_token TEXT,
  google_calendar_refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  direction VARCHAR(10) NOT NULL CHECK(direction IN ('outbound', 'inbound')),
  message_text TEXT NOT NULL,
  goal_context JSONB,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  action_type VARCHAR(50),
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  subtask_id UUID,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default user
INSERT INTO users (phone_number, timezone, nudge_style, outcome_target)
VALUES ('+19134517500', 'America/Chicago', 'direct', '20k/month additional income')
ON CONFLICT (phone_number) DO NOTHING;
