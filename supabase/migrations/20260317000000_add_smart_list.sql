CREATE TABLE IF NOT EXISTS smart_list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  raw_subtask_id UUID REFERENCES subtasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  reasoning TEXT,
  is_completed BOOLEAN DEFAULT false,
  position INTEGER NOT NULL,
  parent_id UUID REFERENCES smart_list_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
