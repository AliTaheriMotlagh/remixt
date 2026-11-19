"use client";

// "Wrong info?" — anyone can say a song's or remix's name, artist, cover or
// lyrics are wrong, and what's right. It goes to the admin's queue (Admin →
// Fix songs); nothing on the page changes until an admin approves a fix.

import { useState } from "react";
import { Check, Flag, Loader2, X } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";

const FIELDS = [
  { id: "name", en: "Song name", fa: "نام آهنگ" },
  { id: "artist", en: "Artist", fa: "خواننده / هنرمند" },
  { id: "cover", en: "Cover picture", fa: "عکس کاور" },
  { id: "lyrics", en: "Lyrics", fa: "متن آهنگ" },
  { id: "other", en: "Something else", fa: "چیز دیگری" },
] as const;

export default function WrongInfoButton({
  kind,
  id,
  title,
  lang = "en",
  className = "",
}: {
  kind: "track" | "remix";
  id: string;
  title: string;
  lang?: "en" | "fa";
  className?: string;
}) {
  const fa = lang === "fa";
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const reportsOpen = useSettings().features.wrongInfo;

  async function send() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/info-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, fields, suggestion }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? (fa ? "ارسال نشد" : "Couldn't send"));
      setState("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
      setState("error");
    }
  }

  if (!reportsOpen) return null;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground ${className}`}
      >
        <Flag className="h-3.5 w-3.5" /> {fa ? "اطلاعات اشتباه است؟" : "Wrong info?"}
      </button>
    );

  return (
    <div dir={fa ? "rtl" : undefined} className={`w-full max-w-md rounded-2xl border border-border bg-surface p-4 text-sm shadow-lg ${className}`}>
      <div className="flex items-start gap-2">
        <p className="flex-1 font-semibold">
          {fa ? "چه چیزی دربارهٔ «" : "What's wrong about “"}
          <span className="break-words">{title}</span>
          {fa ? "» اشتباه است؟" : "”?"}
        </p>
        <button type="button" onClick={() => setOpen(false)} aria-label={fa ? "بستن" : "Close"} className="text-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {state === "sent" ? (
        <p className="mt-3 flex items-center gap-2 text-success">
          <Check className="h-4 w-4" /> {fa ? "ممنون! بررسی می‌کنیم." : "Thanks — we'll check it."}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {FIELDS.map((f) => {
              const on = fields.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFields((x) => (on ? x.filter((y) => y !== f.id) : [...x, f.id]))}
                  className={`rounded-full border px-3 py-1.5 text-xs ${on ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted"}`}
                >
                  {fa ? f.fa : f.en}
                </button>
              );
            })}
          </div>
          <label className="mt-3 block text-xs text-muted" htmlFor={`wrong-${id}`}>
            {fa ? "درستش چیست؟ (اختیاری — مثلاً نام درست، یا لینک متن آهنگ)" : "What's right? (optional — the right name, or a link to the lyrics)"}
          </label>
          <textarea
            id={`wrong-${id}`}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            maxLength={1000}
            rows={2}
            dir="auto"
            className="mt-1 w-full rounded-xl border border-border bg-surface-raised px-3 py-2"
          />
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <button
            type="button"
            disabled={!fields.length || state === "sending"}
            onClick={send}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
            {fa ? "ارسال" : "Send"}
          </button>
        </>
      )}
    </div>
  );
}
