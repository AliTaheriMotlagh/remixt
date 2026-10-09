"use client";

import { useMemo } from "react";
import { Check, Download, Drum, Layers, Mic, Save, Sparkles, Wand2 } from "lucide-react";
import { allInStep, lineStatus, projectKey } from "@/lib/client/lineStatus";
import { getAudibleLaneIds, useStudioStore } from "@/lib/client/studioStore";
import { useStudioView, type LibraryTab } from "@/lib/client/studioView";
import { useExportJob } from "@/lib/client/exportJob";
import { exportMixdown, getExportFormat } from "@/lib/client/mixdown";
import { isBacking } from "@/lib/stemKinds";
import LineCard from "./LineCard";
import SongMap from "./SongMap";

// The Studio for someone who's never made music: no timeline to learn.
// Four steps along the top say what to do next; a map of the song shows
// where every line plays; each line is a card with big, plain controls;
// and the AI producer does the matching — and says what it did.

type Step = { id: string; title: string; hint: string; done: boolean };

function AddButton({ tab, icon: ButtonIcon, label, hint, primary = false }: { tab: LibraryTab; icon: typeof Mic; label: string; hint: string; primary?: boolean }) {
  return (
    <button
      onClick={() => useStudioView.getState().showLibrary(tab)}
      title={hint}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
        primary ? "bg-brand text-white hover:bg-brand-strong" : "border border-border hover:border-brand"
      }`}
    >
      <ButtonIcon /> {label}
    </button>
  );
}

/** What to do next, step by step — with the button for it. */
function Guide({ steps }: { steps: Step[] }) {
  const current = steps.findIndex((s) => !s.done);
  const at = current < 0 ? steps.length - 1 : current;
  const step = steps[at];
  const exporting = useExportJob((j) => j.progress !== null);
  return (
    <section aria-label="Steps" className="rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/10 via-surface to-surface p-3.5">
      <ol className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                s.done ? "bg-success text-white" : i === at ? "bg-brand text-white ring-4 ring-brand/25" : "bg-surface-raised text-muted"
              }`}
              aria-current={i === at ? "step" : undefined}
            >
              {s.done ? <Check /> : i + 1}
            </span>
            <span className={`truncate text-[11px] font-semibold max-sm:hidden ${i === at ? "" : "text-muted"}`}>{s.title}</span>
            {i < steps.length - 1 && <span className={`h-0.5 min-w-2 flex-1 rounded-full ${s.done ? "bg-success/60" : "bg-border"}`} aria-hidden />}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-bold">
            {current < 0 ? "Your lines fit — " : `Step ${at + 1}: `}
            {step.title}
          </p>
          <p className="text-xs text-muted">{step.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {step.id === "vocal" && (
            <>
              <AddButton tab="vocals" icon={Mic} label="Pick a vocal" hint="Someone singing or rapping, from any song" primary />
              <AddButton tab="songs" icon={Layers} label="A whole song" hint="Every line of a song: vocals, drums, bass and melody" />
            </>
          )}
          {step.id === "beat" && (
            <>
              <AddButton tab="beat" icon={Drum} label="Pick a beat" hint="The music of another song" primary />
              <AddButton tab="songs" icon={Layers} label="Lines of a song" hint="Its drums, bass and melody, each on its own" />
            </>
          )}
          {step.id === "fit" && (
            <button
              onClick={() => useStudioView.getState().openAi("sync")}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-vocals px-4 text-sm font-bold text-white shadow-[0_0_24px_-10px_var(--vocals)] hover:brightness-110"
            >
              <Wand2 /> Make them fit
            </button>
          )}
          {step.id === "share" && (
            <>
              <button onClick={() => useStudioView.getState().askSave()} className="flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong">
                <Save /> Save &amp; share
              </button>
              <button
                onClick={() => {
                  const job = useExportJob.getState();
                  void job.run("The whole mix", (onProgress, signal) => exportMixdown(job.info, { range: "full", format: getExportFormat(), onProgress, signal }));
                }}
                disabled={exporting}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:border-brand disabled:opacity-50"
              >
                <Download className={exporting ? "animate-pulse" : undefined} /> {exporting ? "Exporting…" : "Download"}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default function EasyStudio() {
  const lanes = useStudioStore((s) => s.lanes);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const aiOpen = useStudioView((s) => s.aiOpen);
  const hasVocal = lanes.some((l) => l.kind === "vocals");
  const hasBacking = lanes.some((l) => isBacking(l.kind));
  const fits = hasVocal && hasBacking && allInStep(lanes, projectBpm);
  const steps: Step[] = [
    { id: "vocal", title: "Add a vocal", hint: "Someone singing or rapping — from any song in the library, or record your own.", done: hasVocal },
    { id: "beat", title: "Add a beat", hint: "The music to put under it: a beat, or the drums, bass and melody of a song.", done: hasBacking },
    { id: "fit", title: "Make them fit", hint: "Different songs move at different speeds and keys. The AI producer matches them — and shows you exactly what it changed.", done: fits },
    { id: "share", title: "Save & share", hint: "Save it to your profile, or download an MP3. You can keep changing it any time.", done: false },
  ];
  const reference = useMemo(() => projectKey(lanes), [lanes]);
  const audible = getAudibleLaneIds(lanes);

  return (
    <div className="flex flex-col gap-3">
      <Guide steps={steps} />
      {lanes.length > 0 && <SongMap />}

      {lanes.length > 0 && (
        <section aria-label="Your lines" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">Your lines</h2>
              <p className="text-[11px] text-muted">Every part of the song on its own — switch it on or off, change its volume and its sound.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <AddButton tab="vocals" icon={Mic} label="Vocal" hint="Add a vocal" />
              <AddButton tab="beat" icon={Drum} label="Beat" hint="Add a beat" />
              <AddButton tab="songs" icon={Layers} label="Song lines" hint="Add the lines of a whole song: vocals, drums, bass, melody" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {lanes.map((lane) => (
              <LineCard key={lane.laneId} lane={lane} status={lineStatus(lane, projectBpm, reference)} audible={audible.has(lane.laneId)} />
            ))}
          </div>
        </section>
      )}

      {hasVocal && hasBacking && !aiOpen && (
        <button
          onClick={() => useStudioView.getState().openAi(fits ? "drop" : "sync")}
          className="flex items-center gap-3 rounded-2xl border border-brand/50 bg-gradient-to-r from-brand/15 to-vocals/15 p-4 text-left transition-colors hover:border-brand"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-vocals text-xl text-white">
            <Sparkles />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{fits ? "Make it exciting with the AI producer" : "Let the AI producer make it fit"}</span>
            <span className="block text-xs text-muted">
              {fits ? "Put the chorus on the drop, add build-ups and harmonies — every idea is a switch you can turn on or off." : "It listens, lines every line up on the beat and in key, and shows you exactly what it changed."}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
