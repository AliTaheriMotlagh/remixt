"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Waveform from "../Waveform";
import { audioEngine } from "@/lib/client/audioEngine";
import { prepareRecording, startRecording, uploadTake, type Recording, type Take } from "@/lib/client/recorder";
import { useStudioStore } from "@/lib/client/studioStore";
import { useKeepScreenOn } from "@/lib/client/wakeLock";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Input level while recording, redrawn every frame on its own. */
function LevelMeter({ recording }: { recording: Recording }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setLevel(recording.level());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [recording]);
  return (
    <div className="h-2 w-28 overflow-hidden rounded-full bg-background" title="Microphone level">
      <div
        className={`h-full transition-[width] duration-75 ${level > 0.9 ? "bg-danger" : "bg-success"}`}
        style={{ width: `${Math.min(100, level * 100)}%` }}
      />
    </div>
  );
}

/**
 * Sing or rap over the mix: record from the playhead, listen back, and
 * keep the take — it's saved as a vocal stem (so the remix can be saved
 * with it) and lands on a new lane exactly where it was sung.
 */
export default function VocalRecorder({ signedIn }: { signedIn: boolean }) {
  const addStem = useStudioStore((s) => s.addStem);
  const setOffset = useStudioStore((s) => s.setOffset);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "starting" | "recording" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [progress, setProgress] = useState(0);
  const [takeNumber, setTakeNumber] = useState(1);
  const recording = useRef<Recording | null>(null);
  const [active, setActive] = useState<Recording | null>(null);
  const preview = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode } | null>(null);
  // Getting ready, singing and saving the take: a locked phone would cut any of them off.
  useKeepScreenOn("recording", state === "starting" || state === "recording" || state === "saving");

  async function begin() {
    setError(null);
    setTake(null);
    setState("starting");
    // Inside the tap: audio has to be unlocked before anything is awaited.
    const ctx = prepareRecording();
    try {
      const rec = await startRecording(ctx);
      recording.current = rec;
      setActive(rec);
      setState("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start recording");
      setState("idle");
    }
  }

  async function finish() {
    const rec = recording.current;
    recording.current = null;
    setActive(null);
    if (!rec) return;
    const result = await rec.stop();
    if (!result) {
      setError("Nothing was recorded — the take was too short");
      setState("idle");
      return;
    }
    setTake(result);
    setState("review");
  }

  // Pausing or stopping the mix (or seeking) ends the take.
  useEffect(
    () =>
      useStudioStore.subscribe((store, previous) => {
        if (previous.isPlaying && !store.isPlaying && recording.current) void finish();
      }),
    []
  );

  // Leaving the Studio mid-take closes the microphone.
  useEffect(() => () => recording.current?.cancel(), []);

  function stopPreview() {
    preview.current?.source.stop();
    preview.current = null;
  }

  async function listen() {
    if (!take) return;
    stopPreview();
    const ctx = await audioEngine.prepareAudio();
    const source = ctx.createBufferSource();
    source.buffer = take.buffer;
    source.connect(ctx.destination);
    source.start();
    preview.current = { ctx, source };
  }

  async function keep() {
    if (!take) return;
    stopPreview();
    setState("saving");
    setProgress(0);
    try {
      const title = `Studio vocal — take ${takeNumber} (${new Date().toLocaleDateString()})`;
      const { stemId } = await uploadTake(take, title, projectBpm, setProgress);
      const laneId = addStem({
        id: stemId,
        kind: "vocals",
        track_title: title,
        artist_name: "You",
        peaks_json: JSON.stringify(take.peaks),
        track_duration: take.buffer.duration,
        track_bpm: projectBpm,
      });
      setOffset(laneId, take.start);
      setTake(null);
      setTakeNumber((n) => n + 1);
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the take");
      setState("review");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 self-start rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-vocals hover:text-foreground"
      >
        🎤 Record a vocal
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-vocals/40 bg-vocals/5 p-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold">🎤 Record a vocal</p>
        <button
          onClick={() => {
            recording.current?.cancel();
            recording.current = null;
            setActive(null);
            stopPreview();
            setOpen(false);
            setState("idle");
          }}
          className="text-muted hover:text-foreground"
          aria-label="Close recorder"
        >
          ✕
        </button>
      </div>

      {!signedIn ? (
        <p className="mt-2 text-xs text-muted">
          <Link href="/login?next=/studio" className="text-brand-strong hover:underline">
            Sign in
          </Link>{" "}
          to record — your takes are saved as vocal stems so remixes can use them.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Wear headphones so the mix doesn&apos;t bleed into the mic. Recording starts at the playhead with the mix
            playing; pausing ends the take.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {state === "recording" && active ? (
              <>
                <button
                  onClick={() => void finish()}
                  className="flex items-center gap-2 rounded-lg bg-danger px-3 py-2 font-semibold text-white"
                >
                  <span className="h-2.5 w-2.5 animate-pulse-glow rounded-sm bg-white" /> Stop
                </button>
                <LevelMeter recording={active} />
                <span className="text-xs text-danger">Recording…</span>
              </>
            ) : state === "review" && take ? (
              <div className="flex w-full flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={listen} className="nudge !px-2.5 !py-1.5 !text-xs">
                    ▶ Listen
                  </button>
                  <span className="text-xs text-muted">
                    {formatTime(take.buffer.duration)} · starts at {formatTime(take.start)}
                  </span>
                </div>
                <Waveform peaks={take.peaks} color="var(--vocals)" height={40} />
                <div className="flex gap-2">
                  <button
                    onClick={keep}
                    className="rounded-lg bg-vocals px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                  >
                    Keep it — add as a lane
                  </button>
                  <button
                    onClick={() => {
                      stopPreview();
                      setTake(null);
                      setState("idle");
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : state === "saving" ? (
              <span className="text-xs text-muted">Saving the take… {Math.round(progress * 100)}%</span>
            ) : (
              <button
                onClick={() => void begin()}
                disabled={state === "starting"}
                className="flex items-center gap-2 rounded-lg bg-vocals px-3 py-2 font-semibold text-white disabled:opacity-50"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-white" />
                {state === "starting" ? "Getting the mix ready…" : "Record"}
              </button>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
