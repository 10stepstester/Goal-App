import Anthropic from '@anthropic-ai/sdk';
import type { Goal } from '@/types/index';

const anthropic = new Anthropic();

const COACHING_SYSTEM_PROMPT = `You are a goal-tracking coach that sends SMS nudges to help users stay on track with their goals.

You adapt your coaching style based on the user's preference:

- **Direct**: Be blunt, no-nonsense, and urgent. Use short sentences. Challenge them. Example: "You said you'd do X. It's been 3 hours. What's the holdup?"
- **Average**: Be friendly but firm. Encourage action with a positive tone. Example: "Hey! Ready to knock out your next step? You've got this."
- **Gentle**: Be warm, empathetic, and supportive. Acknowledge difficulty. Example: "Just checking in - no pressure. Even a small step forward counts."

Rules:
- Keep messages under 160 characters when possible (SMS limit)
- Reference the user's specific goals and subtasks
- Be aware of time of day and adjust tone accordingly
- If they've been inactive for a long time, be more direct regardless of style
- Never be passive-aggressive or guilt-tripping
- Focus on the NEXT concrete action they can take
- Reference their outcome target to connect daily tasks to bigger picture`;

interface NudgeContext {
  nudgeStyle: 'direct' | 'average' | 'gentle';
  goals: Goal[];
  firstUncompleted: { goalTitle: string; subtaskTitle: string } | null;
  outcomeTarget: string;
  hoursSinceActivity: number;
  timeOfDay: string;
  recentSMS: string[];
}

export async function generateNudge(context: NudgeContext): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Claude] API key not configured. Returning placeholder nudge.');
    if (context.firstUncompleted) {
      return `Time to work on: ${context.firstUncompleted.subtaskTitle}`;
    }
    return 'Time to make progress on your goals!';
  }

  try {
    const userMessage = `Generate a coaching nudge SMS for this user.

Style: ${context.nudgeStyle}
Time of day: ${context.timeOfDay}
Hours since last activity: ${context.hoursSinceActivity}
Outcome target: ${context.outcomeTarget}

Current goals:
${context.goals.map((g, i) => {
  const subtasks = (g.subtasks || []).map(
    (s) => `  ${s.is_completed ? '[x]' : '[ ]'} ${s.title}`
  ).join('\n');
  return `${i + 1}. ${g.title}\n${subtasks || '  (no subtasks)'}`;
}).join('\n')}

${context.firstUncompleted
  ? `Next uncompleted task: "${context.firstUncompleted.subtaskTitle}" under goal "${context.firstUncompleted.goalTitle}"`
  : 'All subtasks are completed or no subtasks exist.'}

Recent messages sent (avoid repeating):
${context.recentSMS.length > 0 ? context.recentSMS.join('\n') : '(none)'}

Reply with ONLY the SMS message text. Keep it under 160 characters.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      system: COACHING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text.trim() : 'Time to make progress on your goals!';
  } catch (error) {
    console.error('[Claude] Error generating nudge:', error);
    if (context.firstUncompleted) {
      return `Time to work on: ${context.firstUncompleted.subtaskTitle}`;
    }
    return 'Time to make progress on your goals!';
  }
}

export interface ParsedSmsReply {
  intent: 'update_goal' | 'add_subtask' | 'complete_subtask' | 'question' | 'other';
  goalId: string | null;
  newGoalText: string | null;
  subtasksToAdd: string[];
  subtasksToComplete: string[];
  needsClarification: boolean;
  coachingReply: string;
}

interface ParseSmsContext {
  goals: Goal[];
  recentMessages: string[];
  incomingSms: string;
}

export async function parseSmsReply(context: ParseSmsContext): Promise<ParsedSmsReply> {
  const fallback: ParsedSmsReply = {
    intent: 'other',
    goalId: null,
    newGoalText: null,
    subtasksToAdd: [],
    subtasksToComplete: [],
    needsClarification: true,
    coachingReply: "Got it! I'll note that down. What would you like to work on next?",
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Claude] API key not configured. Returning fallback parse.');
    return fallback;
  }

  try {
    const goalsContext = context.goals.map((g) => ({
      id: g.id,
      title: g.title,
      subtasks: (g.subtasks || []).map((s) => ({
        id: s.id,
        title: s.title,
        is_completed: s.is_completed,
      })),
    }));

    const userMessage = `Parse this incoming SMS reply from a user and determine their intent.

User's current goals:
${JSON.stringify(goalsContext, null, 2)}

Recent conversation:
${context.recentMessages.length > 0 ? context.recentMessages.join('\n') : '(none)'}

Incoming SMS: "${context.incomingSms}"

Respond with a JSON object (and ONLY the JSON, no markdown):
{
  "intent": "update_goal" | "add_subtask" | "complete_subtask" | "question" | "other",
  "goalId": "<goal id or null>",
  "newGoalText": "<new goal title if updating, or null>",
  "subtasksToAdd": ["<subtask titles to add>"],
  "subtasksToComplete": ["<subtask IDs to mark complete>"],
  "needsClarification": true/false,
  "coachingReply": "<brief coaching response under 160 chars>"
}

Guidelines:
- If they say they "did" or "finished" something, match it to a subtask and use "complete_subtask"
- If they want to add a new step/task, use "add_subtask"
- If they want to change a goal name, use "update_goal"
- If unclear, set needsClarification to true and ask in coachingReply
- Always include a helpful coachingReply
- Match goals/subtasks by semantic similarity, not exact text`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      system: 'You are a JSON parser for an SMS-based goal tracking app. Always respond with valid JSON only, no markdown code fences.',
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) return fallback;

    const parsed = JSON.parse(textBlock.text.trim()) as ParsedSmsReply;
    return parsed;
  } catch (error) {
    console.error('[Claude] Error parsing SMS reply:', error);
    return fallback;
  }
}

interface CoachingReplyContext {
  nudgeStyle: 'direct' | 'average' | 'gentle';
  goals: Goal[];
  action: string;
  outcomeTarget: string;
}

export async function generateCoachingReply(context: CoachingReplyContext): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Claude] API key not configured. Returning placeholder reply.');
    return 'Nice work! Keep the momentum going.';
  }

  try {
    const userMessage = `Generate a brief coaching reply confirming an action and suggesting next steps.

Style: ${context.nudgeStyle}
Outcome target: ${context.outcomeTarget}
Action just taken: ${context.action}

Current goals:
${context.goals.map((g, i) => {
  const subtasks = (g.subtasks || []).map(
    (s) => `  ${s.is_completed ? '[x]' : '[ ]'} ${s.title}`
  ).join('\n');
  return `${i + 1}. ${g.title}\n${subtasks || '  (no subtasks)'}`;
}).join('\n')}

Reply with ONLY the SMS message text. Keep it under 160 characters.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      system: COACHING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text.trim() : 'Nice work! Keep the momentum going.';
  } catch (error) {
    console.error('[Claude] Error generating coaching reply:', error);
    return 'Nice work! Keep the momentum going.';
  }
}
