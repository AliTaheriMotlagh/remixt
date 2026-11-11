import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_AI_MODEL, isAiModel, isModelFor, isProvider, looksLikeKey, savedAiKey, type AiModel, type AiProvider } from "@/lib/aiKeys";
import { returnSharedTurn, sharedAi, takeSharedTurn } from "@/lib/aiShared";
import { OpenRouterError, openRouterText } from "@/lib/openrouter";
import { beatSeconds, cleanAiLines, syllableTarget, type SingStyle } from "@/lib/lyrics";

// The Studio's lyrics helper: finishes a verse, rewrites lines so they fit
// the beat, or writes new ones from an idea — on the same keys as the AI
// co-producer (see api/ai/chat): the person's own Anthropic or OpenRouter
// key (saved on their account, or sent from their browser for this call
// alone), else the site's shared key, which counts as one of today's
// questions. The reply is lyric lines only, ready to go on the sheet.

export const maxDuration = 120;

const MODES = ["complete", "fit", "write"] as const;
type Mode = (typeof MODES)[number];

const SYSTEM = `You help someone write lyrics they're about to record over a beat in a music studio.
Reply with the lyric lines only: one lyric line per line of text, a blank line between sections. No title, no section labels like [Verse], no notes, no numbering, no quote marks, no time stamps.
Write in the language of the person's lyrics (or of their idea, if there are no lyrics yet). Persian, Arabic and other languages are written in their own script.
Write original words — never copy lines from published songs. Lines the person wrote or gave you may be reworked.
Make lines singable on the beat: count syllables, keep the flow even, and land rhymes or stresses on the strong beats.`;

function prompt(mode: Mode, { lyrics, idea, bpm, style, lines, barsPerLine }: { lyrics: string; idea: string; bpm: number; style: SingStyle; lines: number; barsPerLine: number }) {
  const target = syllableTarget(bpm, style, barsPerLine);
  const bar = (beatSeconds(bpm) * 4).toFixed(2);
  const beat = `The beat is ${Math.round(bpm)} BPM in 4/4 (a bar is ${bar} s). The person will ${style === "rap" ? "rap" : "sing"}, one line every ${barsPerLine === 1 ? "bar" : `${barsPerLine} bars`}, so aim for about ${target} syllables a line (a few more or fewer is fine).`;
  const sheet = lyrics.trim() ? `Their lyrics so far:\n<lyrics>\n${lyrics.trim()}\n</lyrics>` : "They have no lyrics yet.";
  const theme = idea.trim() ? `What they want: ${idea.trim()}` : "";
  switch (mode) {
    case "complete":
      return `${beat}\n\n${sheet}\n${theme}\n\nWrite the next ${lines} lines, carrying on their story, voice, rhyme scheme and flow. Reply with the new lines only, not the ones they already have.`;
    case "fit":
      return `${beat}\n\n${sheet}\n${theme}\n\nRewrite every line so it fits the beat at about ${target} syllables, keeping its meaning, rhymes and as many of its words as fit. Keep exactly the same number of lines, in the same order, with blank lines where they have them — line N of your reply replaces their line N.`;
    case "write":
      return `${beat}\n\n${theme || "Write about anything that suits the beat."}\n${lyrics.trim() ? `\nFor their style, here's what they've written before:\n<lyrics>\n${lyrics.trim()}\n</lyrics>\n` : ""}\nWrite ${lines} new lines${lines >= 8 ? " (a verse, or a verse and a hook)" : ""}.`;
  }
}

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (!text || text.length > 40_000) return NextResponse.json({ error: "Too many lyrics to send at once — try a verse at a time" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const mode = MODES.includes(body.mode as Mode) ? (body.mode as Mode) : null;
  if (!mode) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const lyrics = typeof body.lyrics === "string" ? body.lyrics.slice(0, 12_000) : "";
  const idea = typeof body.idea === "string" ? body.idea.slice(0, 800) : "";
  const bpm = typeof body.bpm === "number" && body.bpm >= 40 && body.bpm <= 240 ? body.bpm : 90;
  const style: SingStyle = body.style === "sing" ? "sing" : "rap";
  const lines = typeof body.lines === "number" ? Math.min(32, Math.max(1, Math.round(body.lines))) : 8;
  const barsPerLine = body.barsPerLine === 2 || body.barsPerLine === 4 ? body.barsPerLine : 1;
  if (mode === "fit" && !lyrics.trim()) return NextResponse.json({ error: "Write or find some lyrics first, then fit them" }, { status: 400 });
  if (mode === "complete" && !lyrics.trim() && !idea.trim()) return NextResponse.json({ error: "Write a line or two first, or say what it's about" }, { status: 400 });

  const provider: AiProvider = isProvider(body.provider) ? body.provider : "anthropic";
  const fromBrowser = req.headers.get("x-ai-key")?.trim();
  const user = fromBrowser ? null : await getCurrentUser();
  const saved = user ? await savedAiKey(user.id, provider) : null;
  const own = fromBrowser && looksLikeKey(provider, fromBrowser) ? fromBrowser : saved?.apiKey;
  const who = provider === "anthropic" ? "Anthropic" : "OpenRouter";
  const shared = !own && provider === "anthropic" && user ? sharedAi() : null;
  if (shared && !(await takeSharedTurn(user!.id, shared, true))) {
    return NextResponse.json(
      { error: `That's today's ${shared.dailyQuestions} free AI questions — they come back tomorrow. Add your own key to keep going now.`, quota: true },
      { status: 429 }
    );
  }
  const apiKey = own ?? shared?.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: user ? `Add your ${who} key in the AI producer to write with AI` : "Sign in, or add an AI key in the AI producer, to write with AI", needsKey: true }, { status: 400 });
  }
  const ask = prompt(mode, { lyrics, idea, bpm, style, lines, barsPerLine });
  const reply = (raw: string) => {
    const out = cleanAiLines(raw);
    if (!out.length) return NextResponse.json({ error: "The AI didn't write anything — try again" }, { status: 502 });
    return NextResponse.json({ lines: out });
  };

  if (provider === "openrouter") {
    const model = isModelFor("openrouter", body.model) ? body.model : saved?.model;
    if (!model) return NextResponse.json({ error: "Pick an OpenRouter model in the AI producer" }, { status: 400 });
    try {
      return reply(await openRouterText(apiKey, model, SYSTEM, ask));
    } catch (error) {
      const status = error instanceof OpenRouterError ? error.status : 502;
      if (status === 401 || status === 403) return NextResponse.json({ error: "OpenRouter rejected your key — check it in the AI producer", needsKey: true }, { status: 401 });
      if (status === 402) return NextResponse.json({ error: "Your OpenRouter account is out of credits — add some at openrouter.ai/credits" }, { status: 402 });
      if (status === 429) return NextResponse.json({ error: "OpenRouter is rate-limiting this model — wait a moment, or pick another" }, { status: 429 });
      return NextResponse.json({ error: "OpenRouter had a problem — try again" }, { status: 502 });
    }
  }

  const model: AiModel = shared ? shared.model : isAiModel(body.model) ? body.model : saved && isAiModel(saved.model) ? saved.model : DEFAULT_AI_MODEL;
  try {
    const client = new Anthropic({ apiKey, maxRetries: 2 });
    const response = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: ask }],
      output_config: { effort: "low" },
    });
    if (response.stop_reason === "refusal") return NextResponse.json({ error: "The AI declined to write that one — try other words" }, { status: 400 });
    return reply(response.content.map((b) => (b.type === "text" ? b.text : "")).join("\n"));
  } catch (error) {
    if (shared && !(error instanceof Anthropic.BadRequestError)) await returnSharedTurn(user!.id, true).catch(() => {});
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return shared
        ? NextResponse.json({ error: "The site's free AI isn't working right now — add your own key to keep going" }, { status: 503 })
        : NextResponse.json({ error: "Anthropic rejected your API key — check it in the AI producer", needsKey: true }, { status: 401 });
    }
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Your Anthropic account is being rate-limited — wait a moment and try again" }, { status: 429 });
    if (error instanceof Anthropic.BadRequestError) return NextResponse.json({ error: `Anthropic couldn't use that request: ${error.message}` }, { status: 400 });
    return NextResponse.json({ error: "Couldn't reach the AI — try again" }, { status: 502 });
  }
}
