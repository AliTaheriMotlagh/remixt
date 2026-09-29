import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { COMPATIBLE_BASE_URLS, getAiCredentials, takeFreeCall, type KeyedProvider } from "@/lib/aiKeys";
import { PRODUCER_SYSTEM_PROMPT, toolDefinitions } from "@/lib/aiTools";

// One turn of the Studio's AI producer: the conversation so far goes to
// the signed-in user's chosen model (Claude, ChatGPT, Gemini or Groq) with
// *their* API key — or the site's shared free key, within a daily allowance
// — and its reply comes back — text, plus any tool calls for the
// browser to carry out on the project. The browser runs the loop (tools
// act on the audio it holds), calling this once per model turn.
//
// Messages travel in a provider-neutral shape; an assistant turn carries
// the provider's own content ("raw") so it can be sent back unchanged —
// Claude needs its thinking blocks returned exactly as it wrote them.

export const maxDuration = 300;

const messageSchema = z.union([
  z.object({ role: z.literal("user"), text: z.string().max(20000) }),
  z.object({ role: z.literal("assistant"), raw: z.unknown() }),
  z.object({
    role: z.literal("tool"),
    results: z.array(z.object({ id: z.string(), output: z.string().max(200000), isError: z.boolean().optional() })),
  }),
]);

const requestSchema = z.object({
  /** The provider the conversation was started with; a switch starts a new one. */
  provider: z.enum(["anthropic", "openai", "gemini", "groq", "free"]),
  messages: z.array(messageSchema).min(1).max(400),
});

type ChatMessage = z.infer<typeof messageSchema>;

export type ChatTurn = {
  text: string;
  toolCalls: { id: string; name: string; input: unknown }[];
  raw: unknown;
  /** "tools" when the model is waiting on tool results, "done" when it has finished. */
  status: "tools" | "done";
  model: string;
};

const TOOLS = toolDefinitions();

async function claudeTurn(key: string, model: string, messages: ChatMessage[]): Promise<ChatTurn> {
  const client = new Anthropic({ apiKey: key });
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 16000,
    system: PRODUCER_SYSTEM_PROMPT,
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
    })),
    messages: messages.map((m): Anthropic.Beta.BetaMessageParam => {
      if (m.role === "user") return { role: "user", content: m.text };
      if (m.role === "assistant") return { role: "assistant", content: m.raw as Anthropic.Beta.BetaContentBlockParam[] };
      return {
        role: "user",
        content: m.results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.id,
          content: r.output,
          ...(r.isError ? { is_error: true } : {}),
        })),
      };
    }),
  };
  // Opus 5 / Fable 5.x can decline on a safety classifier's false
  // positive; server-side fallbacks retry on another model instead.
  if (/^claude-(opus-5|fable-5)/.test(model)) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  const response = await client.beta.messages.create(params);
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
  if (response.stop_reason === "max_tokens") throw new Error("Claude's reply was cut off — try asking for a smaller change.");

  // After a mid-output fallback, only the text before the switch point is
  // sent back; thinking and tool calls from the declined attempt are not.
  let content = response.content;
  const boundary = content.map((b) => b.type).lastIndexOf("fallback");
  if (boundary > 0) {
    content = content.filter(
      (b, i) => i >= boundary || !["thinking", "redacted_thinking", "tool_use"].includes(b.type)
    );
  }
  const toolCalls = content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, input: b.input }] : []));
  return {
    text: content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n\n"),
    toolCalls,
    raw: content,
    status: response.stop_reason === "tool_use" && toolCalls.length ? "tools" : "done",
    model: response.model,
  };
}

type OpenAIMessage = {
  role: "assistant";
  content: string | null;
  refusal?: string | null;
  tool_calls?: { id?: string; type: "function"; function: { name: string; arguments: string } }[];
};

type CompatibleService = Exclude<KeyedProvider, "anthropic">;

const SERVICES: Record<CompatibleService, { name: string; model: string; billing: string }> = {
  openai: { name: "OpenAI", model: "ChatGPT", billing: "platform.openai.com → Settings → Billing" },
  gemini: { name: "Google Gemini", model: "Gemini", billing: "aistudio.google.com (free tier limits apply)" },
  groq: { name: "Groq", model: "Groq", billing: "console.groq.com (free tier limits apply)" },
};

/** Gemini's schema dialect has no `additionalProperties`; drop it everywhere. */
function withoutAdditionalProperties(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutAdditionalProperties);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([k]) => k !== "additionalProperties")
      .map(([k, v]) => [k, withoutAdditionalProperties(v)])
  );
}

/** A turn on any service that speaks OpenAI's chat-completions format. */
async function compatibleTurn(
  service: CompatibleService,
  key: string,
  model: string,
  messages: ChatMessage[]
): Promise<ChatTurn> {
  const info = SERVICES[service];
  const body = {
    model,
    messages: [
      { role: "system", content: PRODUCER_SYSTEM_PROMPT },
      ...messages.flatMap((m) => {
        if (m.role === "user") return [{ role: "user", content: m.text }];
        if (m.role === "assistant") return [m.raw];
        return m.results.map((r) => ({ role: "tool", tool_call_id: r.id, content: r.output }));
      }),
    ],
    tools: TOOLS.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: service === "gemini" ? withoutAdditionalProperties(t.parameters) : t.parameters,
      },
    })),
  };
  let res: Response;
  try {
    res = await fetch(`${COMPATIBLE_BASE_URLS[service]}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProviderError(`Couldn't reach ${info.name}.`, 502);
  }
  type Completion = {
    error?: { message?: string; code?: string };
    model?: string;
    choices?: { finish_reason?: string; message?: OpenAIMessage }[];
  };
  const parsed = (await res.json().catch(() => null)) as Completion | Completion[] | null;
  // Gemini sometimes wraps its error in a one-element array.
  const data: Completion | null = Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
  const detail = data?.error?.message ?? res.statusText;
  if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(detail))) {
    throw new ProviderError(`${info.name} rejected the API key — check it in AI settings.`, 400);
  }
  if (res.status === 404) throw new ProviderError(`${info.name} doesn't know the model “${model}” — change it in AI settings.`, 400);
  if (res.status === 429 && data?.error?.code === "insufficient_quota") {
    throw new ProviderError(
      `Your ${info.name} account has no credit left. Add credit at ${info.billing}, then try again — your key is fine.`,
      402
    );
  }
  if (res.status === 429) {
    throw new ProviderError(`${info.name}'s rate limit was hit (free tiers allow only a few requests a minute) — wait a minute and try again.`, 429);
  }
  if (!res.ok) throw new ProviderError(`${info.name} error ${res.status}: ${detail}`, 502);
  const choice = data?.choices?.[0];
  const message = choice?.message;
  if (!message) throw new ProviderError(`${info.name} sent an empty reply.`, 502);
  if (message.refusal) throw new ProviderError(`${info.model} declined: ${message.refusal}`, 400);
  if (choice?.finish_reason === "length") throw new ProviderError(`${info.model}'s reply was cut off — try a smaller change.`, 400);

  // Every call needs an id to match its result to; the rest of each call is
  // sent back exactly as received (Gemini attaches signatures it needs back).
  const calls = (message.tool_calls ?? []).map((call, i) => ({ ...call, id: call.id || `call_${Date.now()}_${i}` }));
  const toolCalls = calls.map((call) => {
    let input: unknown = {};
    try {
      input = JSON.parse(call.function.arguments || "{}");
    } catch {
      input = { __invalid: call.function.arguments };
    }
    return { id: call.id, name: call.function.name, input };
  });
  return {
    text: message.content ?? "",
    toolCalls,
    raw: { role: "assistant", content: message.content ?? "", ...(calls.length ? { tool_calls: calls } : {}) },
    status: toolCalls.length ? "tools" : "done",
    model: data?.model ?? model,
  };
}

class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function claudeError(err: unknown, model: string): ProviderError | null {
  if (err instanceof Anthropic.AuthenticationError) return new ProviderError("Anthropic rejected your API key — check it in AI settings.", 400);
  if (err instanceof Anthropic.NotFoundError) return new ProviderError(`Anthropic doesn't know the model “${model}” — change it in AI settings.`, 400);
  if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message)) {
    return new ProviderError(
      "Your Anthropic account has no credit left. Add credit at platform.claude.com → Settings → Billing, then try again — your key is fine.",
      402
    );
  }
  if (err instanceof Anthropic.RateLimitError) return new ProviderError("Anthropic's rate limit was hit — wait a moment and try again.", 429);
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError("Couldn't reach Anthropic.", 502);
  if (err instanceof Anthropic.APIError) return new ProviderError(`Anthropic error ${err.status}: ${err.message}`, 502);
  return null;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to use the AI producer." }, { status: 401 });

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const credentials = await getAiCredentials(user.id);
  if (!credentials) {
    return NextResponse.json({ error: "Choose an AI and add its API key in AI settings first.", code: "no_key" }, { status: 400 });
  }
  if (credentials.provider !== parsed.data.provider) {
    return NextResponse.json(
      { error: "Your AI settings changed provider — starting a new conversation.", code: "provider_changed" },
      { status: 409 }
    );
  }

  if (credentials.provider === "free" && !(await takeFreeCall(user.id))) {
    return NextResponse.json(
      {
        error:
          "You've used today's free AI requests. Add your own free Gemini or Groq key in AI settings to keep going, or come back tomorrow.",
        code: "free_limit",
      },
      { status: 429 }
    );
  }

  try {
    const turn =
      credentials.service === "anthropic"
        ? await claudeTurn(credentials.key, credentials.model, parsed.data.messages)
        : await compatibleTurn(credentials.service, credentials.key, credentials.model, parsed.data.messages);
    return NextResponse.json(turn);
  } catch (err) {
    const known = err instanceof ProviderError ? err : claudeError(err, credentials.model);
    if (known && credentials.provider === "free" && /API key|doesn't know the model/.test(known.message)) {
      // The shared key is the site's, not the user's: nothing for them to fix.
      return NextResponse.json(
        { error: "The free AI isn't working on this site right now. Try again later, or add your own free Gemini or Groq key in AI settings." },
        { status: 503 }
      );
    }
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    const message = err instanceof Error ? err.message : "The AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
