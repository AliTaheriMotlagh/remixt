"use client";

import { useMemo } from "react";
import { ScrollText } from "lucide-react";
import type { LiveLyrics as Words } from "@/lib/client/liveStudio";
import { useStudioStore } from "@/lib/client/studioStore";
import { isSung, isSynced, lineAt, parseLyrics } from "@/lib/lyrics";

// The words a singer is singing from in a live Studio session, for the
// room: the line being sung, big, with the one before and the two after —
// following the host's playhead as this tab plays in step. Words without
// times are shown whole, to read along.

export default function LiveLyrics({ lyrics }: { lyrics: Words }) {
  const lines = useMemo(() => parseLyrics(lyrics.text), [lyrics.text]);
  const timed = isSynced(lines);
  const current = useStudioStore((s) => (timed ? lineAt(lines, s.playhead) : -1));
  const sung = lines.map((l, i) => ({ l, i })).filter(({ l }) => isSung(l));
  const at = sung.findIndex(({ i }) => i === current);
  const shown = timed ? sung.slice(Math.max(0, at - 1), Math.max(0, at - 1) + 4) : sung;

  return (
    <section className="rounded-xl border border-vocals/30 bg-gradient-to-b from-vocals/10 to-surface p-3" aria-label="Lyrics">
      <h2 className="mb-2 flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-vocals">
        <ScrollText className="h-3.5 w-3.5 shrink-0" />
        <span dir="auto" className="truncate normal-case">
          {[lyrics.title, lyrics.artist].filter(Boolean).join(" · ") || "Lyrics"}
        </span>
      </h2>
      {timed ? (
        <div className="flex min-h-36 flex-col items-center justify-center gap-1.5 text-center" aria-live="polite">
          {at < 0 && <p className="text-sm text-muted">The words show here as they&apos;re sung</p>}
          {at >= 0 &&
            shown.map(({ l, i }) => (
              <p
                key={i}
                dir="auto"
                className={
                  i === current
                    ? "text-2xl font-bold leading-tight text-foreground sm:text-3xl"
                    : i < current
                      ? "text-sm text-muted/60"
                      : "text-base text-muted sm:text-lg"
                }
              >
                {l.text}
              </p>
            ))}
        </div>
      ) : (
        <div dir="auto" className="max-h-64 overflow-y-auto text-center text-base leading-relaxed">
          {shown.map(({ l, i }) => (
            <p key={i}>{l.text}</p>
          ))}
        </div>
      )}
    </section>
  );
}
