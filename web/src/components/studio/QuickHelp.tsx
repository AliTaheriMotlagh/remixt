"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Wand2 } from "lucide-react";
import type { CoproducerContext } from "@/lib/client/coproducerTools";
import { quickHelp } from "@/lib/client/quickHelp";

// The Ask box for everyone: say what you want in a few words — in English
// or Persian — and it's done with the AI producer's own tools, each change
// tried with a switch to keep or undo. No key, no account, nothing sent
// anywhere (see lib/client/quickHelp.ts).

const SUGGESTIONS = [
  "Make it sound good",
  "Why does it sound off?",
  "Put the chorus on the drop",
  "Make it a club remix",
  "Add a harmony",
  "Vocal louder",
  "بهترش کن",
  "دراپ رو قوی‌تر کن",
];

type Line = { from: "you" | "ai"; text: string };

export default function QuickHelp({ ctx, question }: { ctx: CoproducerContext; question?: { id: number; text: string } | null }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  // A question from elsewhere (a line's "Ask AI") is filled in, not sent: the person sends it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following a question asked elsewhere
    if (question) setDraft(question.text);
  }, [question]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    setLines((all) => [...all, { from: "you", text: message }]);
    try {
      const reply = await quickHelp(message, ctx);
      setLines((all) => [...all, { from: "ai", text: reply.text }]);
    } catch {
      setLines((all) => [...all, { from: "ai", text: "Something went wrong there — try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-brand/40 bg-brand/10 p-3">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Wand2 className="text-brand-strong" /> Quick help — free, on this device
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          Say what you want in a few words, in English or Persian. It uses the AI producer&apos;s own tools: every change is tried with its own switch,
          and you keep it or undo it.
        </p>
      </div>
      {lines.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} dir="auto" onClick={() => void send(s)} className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold hover:border-brand">
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2" aria-live="polite">
        {lines.map((line, i) =>
          line.from === "you" ? (
            <p key={i} dir="auto" className="ml-8 self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-xs text-white">
              {line.text}
            </p>
          ) : (
            <p key={i} dir="auto" className="mr-6 whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-xs leading-relaxed">
              {line.text}
            </p>
          )
        )}
        {busy && (
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted">
            <Loader2 className="animate-spin" /> Listening and trying it…
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          dir="auto"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={2}
          placeholder="e.g. “chorus on the drop and add a harmony”"
          className="input min-h-[2.75rem] flex-1 resize-none text-xs"
          aria-label="Ask quick help"
        />
        <button type="submit" disabled={!draft.trim() || busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white hover:bg-brand-strong disabled:opacity-40" aria-label="Send">
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
