import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  process.env[key] = val;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const tasks: Record<string, string[]> = {
  'Website': [
    'Website re-do: AEO or GEO added',
  ],
  'Wellness Directory': [
    'Ask patient to refer — easy way to do that',
    'AEO or GEO added',
  ],
  'Booking System': [
    'What about EXISTING appt reminders?/ICS? (does matter)',
  ],
  'Openclaw': [
    'Have claw consider my patients case each site and come up with the best exercise for them to do',
    'What YouTube channels have the best comments for the specified exercise?',
    '"Future job category" websites — openclaw constantly update',
  ],
  'PF Course': [
    'Openclaw reddit PF launch',
    'Ball added',
  ],
  'Musclepractor': [
    'Figure out naming convention on macbook, etc.',
    'Under conditions, have a "resolve" button right on the header',
    'Get rid of the text box below the condition name?',
    'AI search is acting like a tool tip',
    'Expand on ortho tests for the neck — radicular stuff',
    'Major UI re-design — past visit "need to know" info on LEFT 1/3, other 2/3 reworked cards for current visit with better way to visualize issue resolution across visits',
    'Body schema — also need Freeform for decub notes',
    "A way to have the day's patients on the left in a small window that comes out so I can reference quickly what's coming up next",
    'A way to make it "full screen?" A mac app?',
    'Past issues populated automatically to easily note whether better, same, worse',
    'Portal — where patient can upload ANYTHING and ask questions about their case using a guardrailed AI model that we develop',
    'Top AI summary better',
    'Ability to go back to a visit, edit the DX code and have it also update that visit\'s superbill',
    'Ability to resend a specific superbill',
  ],
  'Other': [
    '"Eat right for your genetic type" website reels based on Claude conversation March 13 — crazy IG ideas to market it!',
    'AMAZING PDF handout relevant to each alternative provider with QR (linked to that provider so visits are tracked back to THEM)',
    'Breathing lock app — prevent phone use until 10 deep breaths detected. Track chest movement, count inhale/exhale cycles, unlock after threshold. Success: user completes exercise before opening social apps.',
    'Dashboard with "cards" for each social media person I\'m tracking or issue. Sort by interest: starlink, spacex, tesla, optimus, cybercab, or by person: trump, elon, lutnick. Does this exist already?',
    'Snippets from body book automatically posting on IG reels!',
    'AI learning app',
    'Food journal / supplement journal — app with huge button to press: "did you take your magnesium last night?"',
    'Text patients — up for an exercise/stretch rn? Grade interest overall and respond appropriately?',
    'Alan Watts "dot" that you press and it says something amazing — round of 100 amazing quotes that cycle',
    'Priorities page — way to add, drag, dropdown for priority — mobile first design',
    'Psoas relief with TCM book!',
  ],
  'Personal': [
    'Rachel: Locking into rigidity while running a volatile solo practice with no safety net is irresponsible',
  ],
};

async function main() {
  // Get user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .limit(1)
    .single();

  if (userError || !user) {
    console.error('No user found:', userError);
    process.exit(1);
  }
  console.log(`User: ${user.id}`);

  // Get or create goal
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('position')
    .limit(1);

  let goalId: string;
  if (goals && goals.length > 0) {
    goalId = goals[0].id;
  } else {
    const { data: newGoal, error } = await supabase
      .from('goals')
      .insert({ user_id: user.id, title: 'My To-dos', position: 1, is_active: true })
      .select()
      .single();
    if (error || !newGoal) {
      console.error('Failed to create goal:', error);
      process.exit(1);
    }
    goalId = newGoal.id;
  }
  console.log(`Goal: ${goalId}`);

  // Get current max root position
  const { data: maxRow } = await supabase
    .from('subtasks')
    .select('position')
    .eq('goal_id', goalId)
    .is('parent_id', null)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  let rootPosition = (maxRow?.position ?? 0) + 1;

  const categories = Object.keys(tasks);
  for (const category of categories) {
    // Insert category as parent subtask
    const { data: parent, error: parentError } = await supabase
      .from('subtasks')
      .insert({
        goal_id: goalId,
        title: category,
        is_completed: false,
        position: rootPosition++,
      })
      .select()
      .single();

    if (parentError || !parent) {
      console.error(`Failed to create category "${category}":`, parentError);
      continue;
    }
    console.log(`  Category: ${category} (${tasks[category].length} items)`);

    // Insert children
    const children = tasks[category].map((title, idx) => ({
      goal_id: goalId,
      parent_id: parent.id,
      title,
      is_completed: false,
      position: idx + 1,
    }));

    const { error: childError } = await supabase
      .from('subtasks')
      .insert(children);

    if (childError) {
      console.error(`  Failed to insert children for "${category}":`, childError);
    }
  }

  console.log('Done! All tasks seeded.');
}

main().catch(console.error);
