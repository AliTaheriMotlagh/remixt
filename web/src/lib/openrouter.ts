import type Anthropic from "@anthropic-ai/sdk";

// The AI co-producer through OpenRouter (openrouter.ai), for people who'd
// rather use their OpenRouter key — and Claude or any other model it
// carries. OpenRouter speaks the OpenAI chat format, so the conversation
// (kept in the Messages API's shape, see components/studio/CoProducer.tsx)
// is translated on the way out, and the reply translated back: tool calls
// become tool_use blocks, so the Studio carries them out exactly as it does
// Claude's. Server-side only: it keeps the key off the page, and OpenRouter
// isn't reachable from every country the Studio is used in.

const BASE = "https://openrouter.ai/api/v1";

type Tool = { name: string; description: string; input_schema: object };

type OpenAiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown };

/** A tool result's content as text (it may be a string or text blocks). */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : "")).join("\n");
  return "";
}

/** The conversation, Messages API → OpenAI chat format. Thinking blocks are dropped (they're Claude's own). */
export function toOpenAi(system: string, messages: Anthropic.Beta.BetaMessageParam[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (typeof message.content === "string") {
      out.push({ role: message.role, content: message.content } as OpenAiMessage);
      continue;
    }
    const blocks = message.content as Block[];
    if (message.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
      const calls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id!, type: "function" as const, function: { name: b.name!, arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    // A user turn: tool results each become a "tool" message, in order, then any text.
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const text = resultText(b.content);
        out.push({ role: "tool", tool_call_id: b.tool_use_id!, content: (b as { is_error?: boolean }).is_error ? `Error: ${text}` : text });
      }
    }
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    if (text) out.push({ role: "user", content: text });
  }
  return out;
}

export function toOpenAiTools(tools: readonly Tool[]) {
  return tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

type Completion = {
  choices?: {
    finish_reason: string | null;
    message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] };
  }[];
  model?: string;
  usage?: unknown;
  error?: { message?: string; code?: number };
};

/** The reply, OpenAI chat format → the Messages API's content blocks and stop reason. */
export function fromOpenAi(completion: Completion) {
  const choice = completion.choices?.[0];
  const content: Block[] = [];
  if (choice?.message.content) content.push({ type: "text", text: choice.message.content });
  for (const [i, call] of (choice?.message.tool_calls ?? []).entries()) {
    let input: unknown = {};
    try {
      input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      // A model that wrote broken JSON: the tool reports the bad input back.
      input = { _unparsed: call.function.arguments };
    }
    // Some providers leave ids out; the Studio needs one to answer the call.
    content.push({ type: "tool_use", id: call.id || `call_${i}_${Date.now()}`, name: call.function.name, input });
  }
  const finish = choice?.finish_reason;
  const stop_reason =
    content.some((b) => b.type === "tool_use") ? "tool_use" : finish === "length" ? "max_tokens" : finish === "content_filter" ? "refusal" : "end_turn";
  return { content, stop_reason, stop_details: null, model: completion.model ?? null, usage: completion.usage ?? null };
}

export class OpenRouterError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // OpenRouter's app attribution (optional).
    "HTTP-Referer": process.env.PUBLIC_BASE_URL || "https://remixt-free.vercel.app",
    "X-Title": "Remixt Studio",
  };
}

/** One turn of the co-producer on OpenRouter. */
export async function openRouterTurn(apiKey: string, model: string, system: string, tools: readonly Tool[], messages: Anthropic.Beta.BetaMessageParam[]) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages: toOpenAi(system, messages), tools: toOpenAiTools(tools), tool_choice: "auto", max_tokens: 16000 }),
    signal: AbortSignal.timeout(280_000),
  });
  const data = (await res.json().catch(() => ({}))) as Completion;
  if (!res.ok || data.error) {
    throw new OpenRouterError(data.error?.message ?? `HTTP ${res.status}`, data.error?.code ?? res.status);
  }
  return fromOpenAi(data);
}

/** Whether OpenRouter accepts `apiKey`: "ok", "invalid", or "unreachable". */
export async function checkOpenRouterKey(apiKey: string): Promise<"ok" | "invalid" | "unreachable"> {
  try {
    const res = await fetch(`${BASE}/key`, { headers: headers(apiKey), signal: AbortSignal.timeout(15_000) });
    if (res.ok) return "ok";
    return res.status === 401 || res.status === 403 ? "invalid" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export type OpenRouterModel = { id: string; name: string; context: number; promptPerMillion: number | null; completionPerMillion: number | null };

let models: { at: number; list: OpenRouterModel[] } | null = null;

/** OpenRouter's models that can use tools (the co-producer needs them), by id — cached for an hour. */
export async function openRouterModels(): Promise<OpenRouterModel[]> {
  if (models && Date.now() - models.at < 3_600_000) return models.list;
  const res = await fetch(`${BASE}/models`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenRouter's model list: HTTP ${res.status}`);
  const data = (await res.json()) as {
    data: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] }[];
  };
  const perMillion = (price?: string) => (price !== undefined && Number.isFinite(Number(price)) ? Math.round(Number(price) * 1e6 * 100) / 100 : null);
  const list = data.data
    .filter((m) => m.supported_parameters?.includes("tools"))
    .map((m) => ({ id: m.id, name: m.name ?? m.id, context: m.context_length ?? 0, promptPerMillion: perMillion(m.pricing?.prompt), completionPerMillion: perMillion(m.pricing?.completion) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  models = { at: Date.now(), list };
  return list;
}
