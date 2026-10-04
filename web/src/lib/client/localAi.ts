"use client";

// A language model running on the user's own machine — Ollama, or anything
// with an OpenAI-style API (LM Studio, llama.cpp's server, Jan…) — called
// straight from the browser. Nothing goes through our server, there's no
// account or key, and the song never leaves the device: the model only
// sees the studio's measurements of it (tempos, keys, bars, sections).

export type LocalAiKind = "ollama" | "openai";

export type LocalAiSettings = {
  enabled: boolean;
  kind: LocalAiKind;
  /** Where the server listens, e.g. http://localhost:11434. */
  url: string;
  model: string;
};

const STORAGE_KEY = "remixt.localAi";

export const DEFAULT_URLS: Record<LocalAiKind, string> = {
  ollama: "http://localhost:11434",
  openai: "http://localhost:1234",
};

/** Small models that follow a JSON schema well, best first. */
export const RECOMMENDED_MODELS = ["qwen2.5:7b", "llama3.1:8b", "qwen2.5:3b", "llama3.2:3b", "gemma3:4b"];

export const DEFAULT_SETTINGS: LocalAiSettings = { enabled: false, kind: "ollama", url: DEFAULT_URLS.ollama, model: "" };

export function loadSettings(): LocalAiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LocalAiSettings>;
    return {
      enabled: !!parsed.enabled,
      kind: parsed.kind === "openai" ? "openai" : "ollama",
      url: typeof parsed.url === "string" && parsed.url ? parsed.url : DEFAULT_SETTINGS.url,
      model: typeof parsed.model === "string" ? parsed.model : "",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: LocalAiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or storage blocked: the settings last for this visit only.
  }
}

const base = (url: string) => url.trim().replace(/\/+$/, "");

export class LocalAiError extends Error {}

/** Explains the usual reasons a page can't reach a local server. */
function unreachable(settings: LocalAiSettings) {
  const origin = typeof window !== "undefined" ? window.location.origin : "this site";
  return new LocalAiError(
    settings.kind === "ollama"
      ? `Couldn't reach Ollama at ${base(settings.url)}. Make sure it's running and allows this site: quit Ollama, then start it with OLLAMA_ORIGINS="${origin}" ollama serve`
      : `Couldn't reach the model server at ${base(settings.url)}. Make sure it's running with CORS enabled (LM Studio: Developer → Settings → Enable CORS).`
  );
}

async function request(settings: LocalAiSettings, path: string, init?: RequestInit) {
  try {
    return await fetch(`${base(settings.url)}${path}`, { ...init, mode: "cors", credentials: "omit" });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw unreachable(settings);
  }
}

/** The models the server has. Throws a LocalAiError that says how to fix it when it can't be reached. */
export async function listModels(settings: LocalAiSettings): Promise<string[]> {
  if (settings.kind === "ollama") {
    const res = await request(settings, "/api/tags");
    if (!res.ok) throw new LocalAiError(`Ollama answered ${res.status}.`);
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  }
  const res = await request(settings, "/v1/models");
  if (!res.ok) throw new LocalAiError(`The model server answered ${res.status}.`);
  const data = (await res.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((m) => m.id);
}

/**
 * Pulls the JSON object out of a reply, even one wrapped in ``` fences or
 * chatter, or after a reasoning model's <think>…</think> (whose own braces
 * would otherwise be mistaken for the answer).
 */
export function parseJsonReply(text: string): unknown {
  text = text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new LocalAiError("The model's answer wasn't valid JSON — try again, or a larger model.");
  }
}

export type ChatOptions = {
  signal?: AbortSignal;
  /** Called as the answer streams in, with how much has arrived. */
  onProgress?: (characters: number) => void;
  temperature?: number;
};

/**
 * Asks for one JSON object matching `schema` (constrained decoding where
 * the server supports it) and returns it parsed — not yet validated.
 */
export async function chatJson(
  settings: LocalAiSettings,
  system: string,
  user: string,
  schema: object,
  { signal, onProgress, temperature = 0.6 }: ChatOptions = {}
): Promise<unknown> {
  if (!settings.model) throw new LocalAiError("Pick a model first.");
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  if (settings.kind === "ollama") {
    const res = await request(settings, "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        format: schema,
        options: { temperature, num_ctx: 8192 },
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new LocalAiError(
        res.status === 404 ? `Ollama doesn't have “${settings.model}” — run: ollama pull ${settings.model}` : `Ollama answered ${res.status}. ${detail.slice(0, 200)}`
      );
    }
    // NDJSON: one object per line, each with the next piece of the answer.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let content = "";
    const take = (line: string) => {
      if (!line.trim()) return;
      let chunk: { message?: { content?: string }; error?: string };
      try {
        chunk = JSON.parse(line);
      } catch {
        return; // A proxy's keep-alive or other noise between lines.
      }
      if (chunk.error) throw new LocalAiError(chunk.error);
      content += chunk.message?.content ?? "";
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      lines.forEach(take);
      onProgress?.(content.length);
    }
    // The last line, if the server didn't end it with a newline.
    take(buffered + decoder.decode());
    if (!content.trim()) throw new LocalAiError("The model gave an empty answer — try again, or another model.");
    return parseJsonReply(content);
  }

  // Servers differ in how they can be held to JSON: a schema (LM Studio,
  // llama.cpp, vLLM), JSON mode only (some proxies and older servers), or
  // not at all — so each is tried in turn when the last one is refused.
  // Without a schema the model still has the format in its instructions.
  const formats = [
    { type: "json_schema", json_schema: { name: "ideas", schema, strict: false } },
    { type: "json_object" },
    undefined,
  ];
  const withSchema = `${user}\n\nAnswer with only the JSON object, matching this JSON Schema:\n${JSON.stringify(schema)}`;
  const send = (i: number) =>
    request(settings, "/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: settings.model,
        messages: i === 0 ? messages : [messages[0], { role: "user", content: withSchema }],
        temperature,
        stream: false,
        ...(formats[i] ? { response_format: formats[i] } : {}),
      }),
    });
  let res = await send(0);
  // 400/422: the request was understood but that format wasn't — try the next.
  for (let i = 1; i < formats.length && (res.status === 400 || res.status === 422); i++) res = await send(i);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LocalAiError(
      res.status === 404
        ? `The server doesn't have “${settings.model}” loaded — load it, then press Refresh.`
        : `The model server answered ${res.status}. ${detail.slice(0, 200)}`
    );
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  onProgress?.(content.length);
  return parseJsonReply(content);
}
