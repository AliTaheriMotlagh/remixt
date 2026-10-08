"use client";

import type Anthropic from "@anthropic-ai/sdk";
import { MAX_TOOL_ROUNDS } from "@/lib/coproducer";
import { runCoproducerTool, type CoproducerContext } from "./coproducerTools";

// Talking to the co-producer: one conversation, sent turn by turn to
// /api/ai/chat (which calls Claude — directly, or any model through
// OpenRouter — on the person's own key), with the tool
// calls Claude makes carried out here in the Studio and their results sent
// back, until Claude answers. The history is kept exactly as Claude sent it
// (thinking blocks included) and only ever appended to.

export type Message = Anthropic.Beta.BetaMessageParam;

/** What the chat shows, in order. */
export type ChatEvent =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "tool"; name: string; summary: string; isError?: boolean }
  | { type: "error"; text: string; needsKey?: boolean };

export type Provider = "anthropic" | "openrouter";

const PROVIDER_KEY = "remixt.aiProvider";
const browserKeyName = (provider: Provider) => `remixt.aiKey.${provider}`;
const modelKeyName = (provider: Provider) => `remixt.aiModel.${provider}`;

function read(name: string) {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string | null) {
  try {
    if (value) localStorage.setItem(name, value);
    else localStorage.removeItem(name);
  } catch {
    // Private mode: kept for this visit only (in the component's state).
  }
}

/** The provider the person last talked through. */
export function savedProvider(): Provider {
  return read(PROVIDER_KEY) === "openrouter" ? "openrouter" : "anthropic";
}

export function saveProvider(provider: Provider) {
  write(PROVIDER_KEY, provider);
}

/** A key kept in this browser only (never stored on the server). */
export function browserKey(provider: Provider): string | null {
  // Keys saved before OpenRouter was added.
  return read(browserKeyName(provider)) ?? (provider === "anthropic" ? read("remixt.anthropicKey") : null);
}

export function setBrowserKey(provider: Provider, key: string | null) {
  write(browserKeyName(provider), key);
  if (provider === "anthropic" && !key) write("remixt.anthropicKey", null);
}

export function savedModelChoice(provider: Provider): string | null {
  return read(modelKeyName(provider)) ?? (provider === "anthropic" ? read("remixt.aiModel") : null);
}

export function saveModelChoice(provider: Provider, model: string) {
  write(modelKeyName(provider), model);
}

type TurnResponse = {
  content: Anthropic.Beta.BetaContentBlock[];
  stop_reason: string | null;
  stop_details: { category?: string | null; explanation?: string | null } | null;
  error?: string;
  needsKey?: boolean;
};

async function sendTurn(messages: Message[], provider: Provider, model: string, key: string | null): Promise<TurnResponse> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "x-ai-key": key } : {}) },
    body: JSON.stringify({ messages, provider, model }),
  });
  const data = (await res.json().catch(() => ({ error: "The server sent something unreadable" }))) as TurnResponse;
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { needsKey: !!data.needsKey });
  return data;
}

/** A tool call in a few words, for the chat. */
function describeCall(name: string, input: Record<string, unknown>, result: string): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(result);
  } catch {}
  const score = typeof parsed.score === "number" ? ` · score ${parsed.score}` : "";
  switch (name) {
    case "get_mix":
      return `Looked at the mix${score}`;
    case "listen_closely":
      return "Listened closely to the vocal and the beat";
    case "list_ideas":
      return "Looked through the ideas";
    case "best_versions": {
      const best = (parsed.best as { title: string; score: number }[] | undefined)?.[0];
      return best ? `Scored every version — best: ${best.title} (${best.score}, now ${parsed.current_score})` : "Scored every version";
    }
    case "try_ideas":
      return `Trying: ${((parsed.tried as string[] | undefined) ?? []).join(" + ") || "nothing fitted"}${score}`;
    case "undo_try":
      return "Took everything off";
    case "take_off":
      return `Switched a change off${score}`;
    case "keep_changes":
      return "Kept the changes";
    case "adjust_lane":
      return `Trying a change — switch it on or off below${score}`;
    case "change_speed":
      return `Trying ${parsed.project_bpm} BPM — switch it on or off below${score}`;
    case "play":
      return `Playing from ${typeof input.from_seconds === "number" ? `${Math.round(input.from_seconds)}s` : "the playhead"}`;
    default:
      return name;
  }
}

/**
 * Sends `text` and runs the conversation until Claude answers, reporting
 * each step through `onEvent`. Returns the history to keep. `shouldStop`
 * is checked between rounds (the Stop button).
 */
export async function converse(
  history: Message[],
  text: string,
  ctx: CoproducerContext,
  { provider, model, key, onEvent, shouldStop }: { provider: Provider; model: string; key: string | null; onEvent: (e: ChatEvent) => void; shouldStop: () => boolean }
): Promise<Message[]> {
  let messages: Message[] = [...history, { role: "user", content: text }];
  onEvent({ type: "user", text });
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let response: TurnResponse;
    try {
      response = await sendTurn(messages, provider, model, key);
    } catch (error) {
      onEvent({ type: "error", text: error instanceof Error ? error.message : "Couldn't reach the co-producer", needsKey: !!(error as { needsKey?: boolean }).needsKey });
      // The unanswered message is dropped, so the history stays valid to send again.
      return history;
    }
    messages = [...messages, { role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] }];
    for (const block of response.content) if (block.type === "text" && block.text.trim()) onEvent({ type: "assistant", text: block.text });

    if (response.stop_reason === "refusal") {
      onEvent({ type: "error", text: "The AI declined to help with that one." });
      return messages;
    }
    if (response.stop_reason === "pause_turn") continue;
    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || calls.length === 0) {
      if (response.stop_reason === "max_tokens") onEvent({ type: "error", text: "The answer was cut off — ask it to go on." });
      return messages;
    }
    // Every call answered in one message, in order (tools change the mix, so one at a time).
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const input = (call.input && typeof call.input === "object" ? call.input : {}) as Record<string, unknown>;
      const stopped = shouldStop();
      const result = stopped ? { content: "The person pressed Stop — don't make more changes; summarise briefly.", isError: true } : await runCoproducerTool(call.name, input, ctx);
      if (!stopped) onEvent({ type: "tool", name: call.name, summary: describeCall(call.name, input, result.content), isError: result.isError });
      results.push({ type: "tool_result", tool_use_id: call.id, content: result.content, ...(result.isError ? { is_error: true } : {}) });
    }
    messages = [...messages, { role: "user", content: results }];
  }
  onEvent({ type: "error", text: "That took a lot of steps — stopped here. Ask again to carry on." });
  return messages;
}
