import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_AI_MODEL, isAiModel, isModelFor, isProvider, looksLikeKey, savedAiKey, type AiModel, type AiProvider } from "@/lib/aiKeys";
import { COPRODUCER_SYSTEM, COPRODUCER_TOOLS } from "@/lib/coproducer";
import { OpenRouterError, openRouterTurn } from "@/lib/openrouter";

// One turn of the AI co-producer: the conversation so far goes to the model
// with the Studio's tools, on the person's own key — Claude through
// Anthropic, or any tool-using model through OpenRouter (translated, see
// lib/openrouter.ts) — and the reply comes back in the Messages API's
// shape: text, and the tool calls the Studio then carries out in the
// browser (see components/studio/CoProducer.tsx), which sends the results
// back here for the next turn.
//
// The key is the one saved on their account for that provider, or — for
// someone who keeps it in their browser only — sent with this request
// (x-ai-key) and used for this call alone. It's never logged or stored here.

export const maxDuration = 300;

/** Bigger than any real conversation; stops someone using this as a free relay for huge payloads. */
const MAX_BODY = 3_000_000;

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return NextResponse.json({ error: "The conversation is too long — start a new one" }, { status: 413 });
  let body: { messages?: unknown; model?: unknown; provider?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const messages = body.messages;
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 600 ||
    !messages.every((m) => m && (m.role === "user" || m.role === "assistant") && (typeof m.content === "string" || Array.isArray(m.content)))
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const provider: AiProvider = isProvider(body.provider) ? body.provider : "anthropic";

  const fromBrowser = (req.headers.get("x-ai-key") ?? req.headers.get("x-anthropic-key"))?.trim();
  const user = fromBrowser ? null : await getCurrentUser();
  const saved = user ? await savedAiKey(user.id, provider) : null;
  const apiKey = fromBrowser && looksLikeKey(provider, fromBrowser) ? fromBrowser : saved?.apiKey;
  const who = provider === "anthropic" ? "Anthropic" : "OpenRouter";
  if (!apiKey) {
    return NextResponse.json({ error: `Add your ${who} key to talk to the co-producer`, needsKey: true }, { status: 400 });
  }

  if (provider === "openrouter") {
    const model = isModelFor("openrouter", body.model) ? body.model : saved?.model;
    if (!model) return NextResponse.json({ error: "Pick an OpenRouter model" }, { status: 400 });
    try {
      return NextResponse.json(await openRouterTurn(apiKey, model, COPRODUCER_SYSTEM, COPRODUCER_TOOLS, messages as Anthropic.Beta.BetaMessageParam[]));
    } catch (error) {
      const status = error instanceof OpenRouterError ? error.status : 502;
      const detail = error instanceof Error ? error.message : "";
      if (status === 401 || status === 403) return NextResponse.json({ error: "OpenRouter rejected your key — check it, or add a new one", needsKey: true }, { status: 401 });
      if (status === 402) return NextResponse.json({ error: "Your OpenRouter account is out of credits — add some at openrouter.ai/credits" }, { status: 402 });
      if (status === 429) return NextResponse.json({ error: "OpenRouter is rate-limiting this model — wait a moment, or pick another" }, { status: 429 });
      if (status === 400 || status === 404) return NextResponse.json({ error: `OpenRouter couldn't use that request${detail ? `: ${detail}` : ""} — try another model` }, { status: 400 });
      return NextResponse.json({ error: `OpenRouter had a problem${detail ? ` (${detail})` : ""} — try again` }, { status: 502 });
    }
  }

  const model: AiModel = isAiModel(body.model) ? body.model : saved && isAiModel(saved.model) ? saved.model : DEFAULT_AI_MODEL;
  const fallback = model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01" as const], fallbacks: "default" as const };

  try {
    const client = new Anthropic({ apiKey, maxRetries: 2 });
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: COPRODUCER_SYSTEM,
      tools: COPRODUCER_TOOLS as unknown as Anthropic.Beta.BetaTool[],
      messages: messages as Anthropic.Beta.BetaMessageParam[],
      output_config: { effort: "medium" },
      // The system prompt, tools and history repeat every turn: cached.
      cache_control: { type: "ephemeral" },
      ...fallback,
    });
    return NextResponse.json({
      content: response.content,
      stop_reason: response.stop_reason,
      stop_details: response.stop_details ?? null,
      model: response.model,
      usage: response.usage,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return NextResponse.json({ error: "Anthropic rejected your API key — check it, or add a new one", needsKey: true }, { status: 401 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Your Anthropic account is being rate-limited — wait a moment and try again" }, { status: 429 });
    }
    if (error instanceof Anthropic.BadRequestError) {
      return NextResponse.json({ error: `Anthropic couldn't use that request: ${error.message}` }, { status: 400 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Anthropic had a problem (${error.status ?? "no response"}) — try again` }, { status: 502 });
    }
    return NextResponse.json({ error: "Couldn't reach Anthropic — try again" }, { status: 502 });
  }
}
