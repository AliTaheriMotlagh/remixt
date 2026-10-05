"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { Camera, Expand, Minimize, MousePointer2 } from "lucide-react";
import type { CameraMode, PartyMusic, PartyPerson, PartyWorld } from "@/lib/client/party/partyWorld";

// The 3D party around a live session (lib/client/party/partyWorld.ts): the
// host in the booth, everyone watching on the floor. three.js is loaded only
// when a party is on screen, and a browser without WebGL gets `fallback`.

export type PartyHandle = {
  react: (emoji: string, fromId: string | null) => void;
  say: (fromId: string | null, text: string) => void;
};

const CAMERAS: { id: CameraMode; label: string }[] = [
  { id: "crowd", label: "Crowd" },
  { id: "booth", label: "DJ booth" },
  { id: "orbit", label: "Fly around" },
  { id: "top", label: "Top" },
];

/** Low, mid and high levels (0..1) of an analyser, for the lights. */
export function readBands(analyser: AnalyserNode | null, data: Uint8Array<ArrayBuffer>): Pick<PartyMusic, "low" | "mid" | "high"> {
  if (!analyser) return { low: 0, mid: 0, high: 0 };
  analyser.getByteFrequencyData(data);
  const n = data.length;
  const avg = (from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += data[i];
    return sum / Math.max(1, to - from) / 255;
  };
  // With fftSize 512 at 44.1–48 kHz each bin is ~90 Hz.
  return { low: avg(0, Math.max(2, Math.round(n * 0.03))), mid: avg(Math.round(n * 0.03), Math.round(n * 0.25)), high: avg(Math.round(n * 0.25), n) };
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

const PartyStage = forwardRef<
  PartyHandle,
  {
    hostName: string;
    hostColor: string;
    title: string;
    crowd: PartyPerson[];
    guests: number;
    music: () => PartyMusic;
    /** Shown instead when the browser can't draw 3D. */
    fallback?: ReactNode;
    /** Drawn over the scene (the stage's status line, the reactions layer). */
    children?: ReactNode;
    className?: string;
  }
>(function PartyStage({ hostName, hostColor, title, crowd, guests, music, fallback, children, className = "" }, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<PartyWorld | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unsupported">("loading");
  const [camera, setCamera] = useState<CameraMode>("crowd");
  const [fullscreen, setFullscreen] = useState(false);
  const [hint, setHint] = useState(true);
  const musicRef = useRef(music);
  useEffect(() => {
    musicRef.current = music;
  });

  useImperativeHandle(ref, () => ({
    react: (emoji, fromId) => world.current?.react(emoji, fromId),
    say: (fromId, text) => world.current?.say(fromId, text),
  }));

  // Build the world once (title and crowd are fed in separately).
  useEffect(() => {
    if (!hasWebGL()) {
      setState("unsupported");
      return;
    }
    let cancelled = false;
    let made: PartyWorld | null = null;
    let resize: ResizeObserver | null = null;
    let seen: IntersectionObserver | null = null;
    const onVisibility = () => made?.setVisible(document.visibilityState === "visible");
    void import("@/lib/client/party/partyWorld").then(({ PartyWorld }) => {
      if (cancelled || !canvas.current || !wrap.current) return;
      try {
        made = new PartyWorld(canvas.current, {
          hostName,
          hostColor,
          title,
          reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
        });
      } catch {
        setState("unsupported");
        return;
      }
      world.current = made;
      made.setMusicSource(() => musicRef.current());
      const box = wrap.current;
      const fit = () => made?.resize(box.clientWidth, box.clientHeight);
      fit();
      resize = new ResizeObserver(fit);
      resize.observe(box);
      // Off screen or in a background tab: stop drawing.
      seen = new IntersectionObserver(([entry]) => made?.setVisible(entry.isIntersecting && document.visibilityState === "visible"));
      seen.observe(box);
      document.addEventListener("visibilitychange", onVisibility);
      made.start();
      setState("ready");
    });
    return () => {
      cancelled = true;
      resize?.disconnect();
      seen?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      made?.dispose();
      world.current = null;
    };
    // The world is built once; later changes go through the setters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state === "ready") world.current?.setCrowd(crowd, guests);
  }, [crowd, guests, state]);
  useEffect(() => {
    world.current?.setTitle(title);
  }, [title, state]);
  useEffect(() => {
    world.current?.setCameraMode(camera);
  }, [camera, state]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    const box = wrap.current;
    if (!box) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (box.requestFullscreen) void box.requestFullscreen().catch(() => setFullscreen((f) => !f));
    // iPhone Safari has no element fullscreen: fill the window instead.
    else setFullscreen((f) => !f);
  }

  if (state === "unsupported") return <>{fallback}</>;

  return (
    <div
      ref={wrap}
      className={`relative overflow-hidden rounded-xl border border-border bg-[#07070c] ${
        fullscreen && !document.fullscreenElement ? "fixed inset-0 z-[80] rounded-none" : "aspect-[4/5] sm:aspect-video"
      } ${className}`}
      onPointerDown={() => setHint(false)}
    >
      <canvas ref={canvas} className="block h-full w-full" aria-label={`3D dance floor: ${hostName} DJing for ${crowd.length + guests} people`} role="img" />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Opening the club…</div>
      )}
      {children}
      <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
        <label className="flex items-center gap-1 rounded-lg bg-black/60 px-2 text-[11px] text-white backdrop-blur">
          <Camera className="h-3.5 w-3.5" />
          <span className="sr-only">Camera</span>
          <select
            value={camera}
            onChange={(e) => setCamera(e.target.value as CameraMode)}
            className="h-8 bg-transparent text-[11px] text-white outline-none"
          >
            {CAMERAS.map((c) => (
              <option key={c.id} value={c.id} className="bg-surface">
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur hover:bg-black/80"
          aria-label={fullscreen ? "Leave full screen" : "Full screen"}
        >
          {fullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>
      </div>
      {hint && state === "ready" && (
        <p className="pointer-events-none absolute left-1/2 top-2 hidden -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white sm:flex">
          <MousePointer2 className="h-3 w-3" /> Drag to look around · scroll or pinch to zoom
        </p>
      )}
    </div>
  );
});

export default PartyStage;
