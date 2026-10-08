import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_AI_MODEL, isAiModel, looksLikeKey, savedAiKey, type AiModel } from "@/lib/aiKeys";
import { COPRODUCER_SYSTEM, COPRODUCER_TOOLS } from "@/lib/coproducer";

// One turn of the AI co-producer: the conversation so far goes to Claude
// with the Studio's tools, on the person's own Anthropic key, and Claude's
// reply comes back as it is — text, and the tool calls the Studio then
// carries out in the browser (see components/studio/CoProducer.tsx), which
// sends the results back here for the next turn.
//
// The key is the one saved on their account, or — for someone who keeps it
// in their browser only — sent with this request (x-anthropic-key) and
// used for this call alone. It's never logged or stored from here.

export const maxDuration = 300;

/** Bigger than any real conversation; stops someone using this as a free relay for huge payloads. */
const MAX_BODY = 3_000_000;

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return NextResponse.json({ error: "The conversation is too long — start a new one" }, { status: 413 });
  let body: { messages?: unknown; model?: unknown };
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

  const fromBrowser = req.headers.get("x-anthropic-key")?.trim();
  const user = fromBrowser ? null : await getCurrentUser();
  const saved = user ? await savedAiKey(user.id) : null;
  const apiKey = fromBrowser && looksLikeKey(fromBrowser) ? fromBrowser : saved?.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: "Add your Anthropic API key to talk to the co-producer", needsKey: true }, { status: 400 });
  }
  const model: AiModel = isAiModel(body.model) ? body.model : (saved?.model ?? DEFAULT_AI_MODEL);
  // A declined request is re-run on the fallback model Anthropic picks for
  // the reason it was declined. (Not offered for Haiku.)
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
