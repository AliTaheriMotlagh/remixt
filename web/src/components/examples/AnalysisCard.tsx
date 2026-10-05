"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { bpmLabel } from "@/lib/client/examplesLibrary";
import { TEMPO_MODE_LABELS, driftPerBarMs, type Level, type PairAnalysis, type PairSettings, type PairSong } from "@/lib/client/examplesMatch";
import { keyLabel } from "@/lib/client/musicKey";

const LEVEL_STYLE: Record<Level, { text: string; bg: string; Icon: typeof Info }> = {
  perfect: { text: "text-success", bg: "bg-success/10 border-success/30", Icon: CheckCircle2 },
  good: { text: "text-beat", bg: "bg-beat/10 border-beat/30", Icon: CheckCircle2 },
  warn: { text: "text-drums", bg: "bg-drums/10 border-drums/30", Icon: AlertTriangle },
  bad: { text: "text-danger", bg: "bg-danger/10 border-danger/30", Icon: XCircle },
};

function Verdict({ level, title, detail }: { level: Level; title: string; detail: string }) {
  const { text, bg, Icon } = LEVEL_STYLE[level];
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <p className={`flex items-start gap-1.5 text-sm font-semibold ${text}`}>
        <Icon className="mt-0.5" /> <span>{title}</span>
      </p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

const pct = (r: number) => `${r >= 1 ? "+" : ""}${((r - 1) * 100).toFixed(1)}%`;

/** The numbers and the plain-language verdict behind a vocal + beat pairing. */
export default function AnalysisCard({
  vocal,
  beat,
  settings,
  analysis: a,
}: {
  vocal: PairSong;
  beat: PairSong;
  settings: PairSettings;
  analysis: PairAnalysis;
}) {
  const overall = LEVEL_STYLE[a.overall.level];
  const drift = driftPerBarMs(vocal, beat, a);
  return (
    <section aria-label="Match analysis" className="rounded-2xl border border-border bg-surface p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <overall.Icon className={`text-lg ${overall.text}`} />
        <h3 className="text-base font-bold">{a.overall.title}</h3>
        <span className="min-w-0 break-words text-xs text-muted">
          {vocal.title} (vocal) over {beat.title} (beat)
        </span>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Tempo</h4>
          <dl className="flex flex-col gap-1">
            <Row label="Vocal">{bpmLabel(vocal.bpm)} BPM</Row>
            <Row label="Beat">{bpmLabel(beat.bpm)} BPM</Row>
            {a.readingNote !== "as written" && <Row label="Vocal counted as">{`${bpmLabel(a.reading)} BPM (${a.readingNote})`}</Row>}
            <Row label="Gap, unmatched">{`${Math.abs(a.rawGapBpm).toFixed(0)} BPM (${a.rawGapPct.toFixed(0)}%)`}</Row>
            <Row label="Who moves">{TEMPO_MODE_LABELS[settings.mode].label}</Row>
            <Row label="Both end up at">{`${a.targetBpm.toFixed(1)} BPM`}</Row>
            <Row label="Vocal stretch">{pct(a.vocalRatio)}</Row>
            <Row label="Beat stretch">{pct(a.beatRatio)}</Row>
          </dl>
          <Verdict {...a.tempoVerdict} />
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Key</h4>
          <dl className="flex flex-col gap-1">
            <Row label="Vocal">{`${keyLabel(vocal.key)} · ${vocal.camelot}`}</Row>
            <Row label="Beat">{`${keyLabel(beat.key)} · ${beat.camelot}`}</Row>
            <Row label="Pitch shift (vocal)">
              {`${a.semitones > 0 ? "+" : ""}${a.semitones} semitones${settings.semitones === "auto" ? " (auto)" : " (manual)"}`}
            </Row>
            <Row label="Vocal after shift">{`${keyLabel(a.shiftedKey)} · ${a.shiftedCamelot}`}</Row>
          </dl>
          <Verdict {...a.keyVerdict} />
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-background/50 p-3 sm:grid-cols-3">
        <Row label="Raw: drift per bar">{`${drift.toFixed(0)} ms`}</Row>
        <Row label="Raw: off after the loop">{`${((drift * a.loopBars) / 1000).toFixed(1)} s`}</Row>
        <Row label="Matched: drift">0 ms (on the grid)</Row>
      </dl>
    </section>
  );
}
