-- Enable Row Level Security on all public tables.
-- The app uses the service role key (which bypasses RLS),
-- so no policies are needed — this just locks out anon/public access.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_list_items ENABLE ROW LEVEL SECURITY;
