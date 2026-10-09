"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Disc3 } from "lucide-react";
import { LabAudio } from "@/lib/client/examplesPlayer";
import type { PairSettings } from "@/lib/client/examplesMatch";
import { trackIdOf } from "@/lib/client/examplesLibrary";
import { keepOnly, useLibrarySongs } from "./libraryTracks";
import MatchStep from "./MatchStep";
import RecipeGallery from "./RecipeGallery";
import SongPicker from "./SongPicker";
import SplitStep from "./SplitStep";

const STEPS = [
  { title: "Pick a song", short: "Pick", blurb: "A real song from the library, or one of six original demo songs synthesised in your browser." },
  { title: "Split it", short: "Split", blurb: "What a stem splitter hands back: the vocal on its own, and everything else." },
  { title: "Match a vocal and a beat", short: "Match", blurb: "Put one song's vocal on another's beat: library songs, demo songs, or one of each. See exactly what happens, step by step — switch each step on or off and hear what it fixes." },
  { title: "Recipes", short: "Recipes", blurb: "Ready-made pairings that each teach one idea. One tap loads them into Match." },
];

const DEFAULT_PAIR: PairSettings = { vocalId: "midnight-static", beatId: "warehouse-lights", mode: "beat", semitones: "auto" };

export default function ExamplesLab() {
  const [step, setStep] = useState(0);
  const [songId, setSongId] = useState("golden-hour");
  const [pair, setPair] = useState<PairSettings>(DEFAULT_PAIR);
  // One local AudioContext for the page; the Studio's engine is never touched.
  const [audio] = useState(() => new LabAudio());
  const top = useRef<HTMLDivElement>(null);
  const library = useLibrarySongs();

  useEffect(() => () => audio.dispose(), [audio]);

  // Decoded library stems are big: keep only the songs a step is showing,
  // and let go of all of them when the page closes.
  useEffect(() => {
    keepOnly([songId, pair.vocalId, pair.beatId].map(trackIdOf).filter((id): id is string => !!id));
  }, [songId, pair.vocalId, pair.beatId]);
  useEffect(() => () => keepOnly([]), []);

  const go = (n: number) => {
    setStep(n);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={top} className="touch-targets mx-auto w-full max-w-5xl scroll-mt-20 px-3 py-6 sm:px-5 sm:py-10">
      <header className="mb-6">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-strong">
          <Disc3 /> Examples lab
        </p>
        <h1 className="text-2xl font-bold sm:text-3xl">See splitting and matching in action</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Pick a real song from the library (split by the AI splitter when it was uploaded) or an original demo song synthesised on your
          device. Play with its stems, then see exactly why two songs do or don&apos;t fit, and what fixes them.
        </p>
        <p className="mt-2 text-sm text-muted">
          Want to practise mixing live?{" "}
          <Link href="/dj" className="font-semibold text-brand-strong underline">
            Try the DJ simulator
          </Link>
          .
        </p>
      </header>

      <nav aria-label="Steps" className="mb-5">
        <ol className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === step ? "step" : undefined}
                className={`flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-xs font-semibold sm:flex-row sm:gap-2 sm:text-sm ${
                  i === step
                    ? "border-brand bg-brand/15 text-foreground"
                    : i < step
                      ? "border-border bg-surface text-foreground hover:bg-surface-hover"
                      : "border-border text-muted hover:bg-surface-hover"
                }`}
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-[11px] ${i === step ? "bg-brand text-white" : "bg-surface-raised"}`}
                >
                  {i + 1}
                </span>
                <span className="sm:hidden">{s.short}</span>
                <span className="hidden sm:inline">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section aria-labelledby="step-title" className="min-h-[24rem]">
        <h2 id="step-title" className="text-xl font-bold">
          {step + 1}. {STEPS[step].title}
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted">{STEPS[step].blurb}</p>

        {step === 0 && (
          <div className="flex flex-col gap-4">
            <SongPicker
              audio={audio}
              library={library}
              songId={songId}
              onPick={(id) => {
                setSongId(id);
                setPair((p) => ({ ...p, vocalId: id, beatId: p.beatId === id ? DEFAULT_PAIR.beatId : p.beatId }));
              }}
            />
            <button
              type="button"
              onClick={() => go(1)}
              className="flex min-h-11 items-center justify-center gap-1.5 self-end rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              Next: split it <ArrowRight />
            </button>
          </div>
        )}
        {step === 1 && <SplitStep audio={audio} songId={songId} onNext={() => go(2)} library={library} />}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <MatchStep audio={audio} settings={pair} onChange={setPair} library={library} />
            <div className="flex flex-wrap justify-between gap-2">
              <button
                type="button"
                onClick={() => go(1)}
                className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-hover"
              >
                <ArrowLeft /> Back
              </button>
              <button
                type="button"
                onClick={() => go(3)}
                className="flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"
              >
                Browse recipes <ArrowRight />
              </button>
            </div>
          </div>
        )}
        {step === 3 && (
          <RecipeGallery
            library={library}
            onLoad={(settings) => {
              setPair(settings);
              go(2);
            }}
          />
        )}
      </section>

      <aside className="mt-10 rounded-2xl border border-border bg-surface p-4 text-sm text-muted sm:p-5">
        <h2 className="mb-1 text-base font-bold text-foreground">How the real Studio does this</h2>
        <p>
          Upload any song and the splitter (an AI model running in your browser) separates it into vocals, drums, bass and other. In the{" "}
          <Link href="/studio" className="font-semibold text-brand-strong underline">
            Studio
          </Link>
          , every line of a song — vocals, drums, bass, melody — is a lane of its own, and the AI producer does what you saw above for all of them: stretches
          each to one tempo, pitches the vocal into the beat&apos;s key, lays every line on the bar lines, and can put the chorus on the drop or add harmonies.
          Every change is a switch, and its &ldquo;What happened&rdquo; view says exactly what it changed, line by line. The tempo and pitch changes in step 3
          are rendered by the same engine.{" "}
          <Link href="/upload" className="font-semibold text-brand-strong underline">
            Upload a song
          </Link>{" "}
          (or download a demo from step 2) to try it for real.
        </p>
      </aside>
    </div>
  );
}
