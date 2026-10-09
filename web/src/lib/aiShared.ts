import sql from "./db";
import { DEFAULT_AI_MODEL, isAiModel, type AiModel } from "./aiKeys";
import { MAX_TOOL_ROUNDS } from "./coproducer";

// The site's own Anthropic key, shared with everyone signed in who hasn't
// brought a key of their own — so anyone can talk to the AI co-producer.
// Off unless the site sets AI_SHARED_ANTHROPIC_KEY, because the site pays
// for every call made on it. Each person gets a number of questions a day
// (AI_SHARED_DAILY_QUESTIONS, 20 by default); a question can take several
// requests (one per round of tool use), and those are capped too, so one
// question can't run up a bill. Counts reset at midnight, database time.

export type SharedAi = { apiKey: string; model: AiModel; dailyQuestions: number };

/** The shared key and its limits, or null when the site doesn't offer one. */
export function sharedAi(): SharedAi | null {
  const apiKey = process.env.AI_SHARED_ANTHROPIC_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.AI_SHARED_MODEL?.trim();
  const limit = Number(process.env.AI_SHARED_DAILY_QUESTIONS);
  return {
    apiKey,
    model: isAiModel(model) ? model : DEFAULT_AI_MODEL,
    dailyQuestions: Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 20,
  };
}

/** Requests a day's questions may make between them: every question its full run of tool rounds. */
const requestsFor = (shared: SharedAi) => shared.dailyQuestions * (MAX_TOOL_ROUNDS + 1);

let table: Promise<unknown> | null = null;

/** Makes sure the usage table exists (the same as in scripts/schema.sql) — once per server process. */
function ensureTable() {
  table ??= sql`
    CREATE TABLE IF NOT EXISTS ai_shared_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day DATE NOT NULL DEFAULT CURRENT_DATE,
      questions INTEGER NOT NULL DEFAULT 0,
      requests INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    )
  `.catch((error) => {
    table = null;
    throw error;
  });
  return table;
}

/** How many questions this person has left today. */
export async function sharedQuestionsLeft(userId: string, shared: SharedAi): Promise<number> {
  await ensureTable();
  const [row] = await sql<{ questions: number }[]>`
    SELECT questions FROM ai_shared_usage WHERE user_id = ${userId} AND day = CURRENT_DATE
  `;
  return Math.max(0, shared.dailyQuestions - (row?.questions ?? 0));
}

/**
 * Counts one request against today's allowance — a new question too, when
 * `question` — in one statement, so two tabs can't both take the last one.
 * False when today's allowance is used up (nothing is counted then).
 */
export async function takeSharedTurn(userId: string, shared: SharedAi, question: boolean): Promise<boolean> {
  await ensureTable();
  const asked = question ? 1 : 0;
  const rows = await sql`
    INSERT INTO ai_shared_usage (user_id, day, questions, requests)
    VALUES (${userId}, CURRENT_DATE, ${asked}, 1)
    ON CONFLICT (user_id, day) DO UPDATE
      SET questions = ai_shared_usage.questions + ${asked}, requests = ai_shared_usage.requests + 1
      WHERE ai_shared_usage.questions + ${asked} <= ${shared.dailyQuestions}
        AND ai_shared_usage.requests < ${requestsFor(shared)}
    RETURNING 1
  `;
  return rows.length > 0;
}

/** Gives a turn back when the call failed on Anthropic's side (it shouldn't cost the person a question). */
export async function returnSharedTurn(userId: string, question: boolean) {
  await ensureTable();
  const asked = question ? 1 : 0;
  await sql`
    UPDATE ai_shared_usage
    SET questions = GREATEST(0, questions - ${asked}), requests = GREATEST(0, requests - 1)
    WHERE user_id = ${userId} AND day = CURRENT_DATE
  `;
}
