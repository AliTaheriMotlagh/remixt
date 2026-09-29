import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getAiCredentials, type AiProvider } from "@/lib/aiKeys";
import { PRODUCER_SYSTEM_PROMPT, toolDefinitions } from "@/lib/aiTools";

// One turn of the Studio's AI producer: the conversation so far goes to
// the signed-in user's chosen model (Claude or ChatGPT) with *their* API
// key, and its reply comes back — text, plus any tool calls for the
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
  provider: z.enum(["anthropic", "openai"]),
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
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
};

async function openaiTurn(key: string, model: string, messages: ChatMessage[]): Promise<ChatTurn> {
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
    tools: TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
  };
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProviderError("Couldn't reach OpenAI.", 502);
  }
  const data = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    model?: string;
    choices?: { finish_reason?: string; message?: OpenAIMessage }[];
  } | null;
  if (res.status === 401) throw new ProviderError("OpenAI rejected your API key — check it in AI settings.", 400);
  if (res.status === 404) throw new ProviderError(`OpenAI doesn't know the model “${model}” — change it in AI settings.`, 400);
  if (res.status === 429) throw new ProviderError("OpenAI's rate limit or quota was hit — wait, or check your OpenAI billing.", 429);
  if (!res.ok) throw new ProviderError(`OpenAI error ${res.status}: ${data?.error?.message ?? res.statusText}`, 502);
  const choice = data?.choices?.[0];
  const message = choice?.message;
  if (!message) throw new ProviderError("OpenAI sent an empty reply.", 502);
  if (message.refusal) throw new ProviderError(`ChatGPT declined: ${message.refusal}`, 400);
  if (choice?.finish_reason === "length") throw new ProviderError("ChatGPT's reply was cut off — try a smaller change.", 400);

  const toolCalls = (message.tool_calls ?? []).map((call) => {
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
    raw: { role: "assistant", content: message.content, ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) },
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
    return NextResponse.json({ error: "Add your ChatGPT or Claude API key in AI settings first.", code: "no_key" }, { status: 400 });
  }
  if (credentials.provider !== (parsed.data.provider as AiProvider)) {
    return NextResponse.json(
      { error: "Your AI settings changed provider — starting a new conversation.", code: "provider_changed" },
      { status: 409 }
    );
  }

  try {
    const turn =
      credentials.provider === "anthropic"
        ? await claudeTurn(credentials.key, credentials.model, parsed.data.messages)
        : await openaiTurn(credentials.key, credentials.model, parsed.data.messages);
    return NextResponse.json(turn);
  } catch (err) {
    const known = err instanceof ProviderError ? err : claudeError(err, credentials.model);
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    const message = err instanceof Error ? err.message : "The AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
