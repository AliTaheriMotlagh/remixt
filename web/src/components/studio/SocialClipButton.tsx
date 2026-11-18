"use client";

import { useSyncExternalStore } from "react";
import { Clapperboard } from "lucide-react";
import { useClipJob } from "@/lib/client/clipJob";
import { canMakeClips } from "@/lib/client/socialClip";
import { useStudioStore } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import ClipDialog from "./ClipDialog";

const noSubscription = () => () => {};

/** Whether this browser can record a clip (it needs MediaRecorder and canvas capture). */
export function useCanMakeClips() {
  return useSyncExternalStore(noSubscription, canMakeClips, () => false);
}

/**
 * "Make a clip": a vertical video of a part of the song to post as a Reel,
 * TikTok, Short or Story. The button sits in the transport; the dialog
 * (ClipDialog) is hosted here, since this is where the remix's title and
 * link are — anything else (the Vocalist stage, a take) opens it through
 * useStudioView.openClip. While a clip records with the editor closed, the
 * button shows how far it is, then that it's ready; a tap opens it.
 */
export default function SocialClipButton({ title, artist, remixId, me }: { title: string; artist: string; remixId: string | null; me: string }) {
  const supported = useCanMakeClips();
  const duration = useStudioStore((s) => s.duration);
  const open = useStudioView((s) => s.clip !== null);
  const openClip = useStudioView((s) => s.openClip);
  const percent = useClipJob((s) => (s.stage ? Math.round(s.stage.fraction * 100) : null));
  const ready = useClipJob((s) => s.result !== null);
  if (!supported) return null;
  const chip = !open && (percent !== null || ready);
  const label = percent !== null ? `Clip recording, ${percent}% — open it` : ready ? "Your clip is ready — open it" : "Make a video clip for socials";
  return (
    <>
      <button
        onClick={() => openClip()}
        disabled={duration <= 0 && !chip}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm transition-colors disabled:opacity-40 ${
          chip ? "border-vocals bg-vocals/10 text-foreground" : "border-border text-muted hover:text-foreground"
        }`}
        title={chip ? label : "Make a vertical video clip for Reels, TikTok, Shorts or Stories"}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Clapperboard />
        {chip && percent !== null && <span className="text-xs font-semibold tabular-nums">{percent}%</span>}
        {chip && percent === null && <span className="text-xs font-semibold text-success">Ready</span>}
      </button>
      <ClipDialog title={title} artist={artist} remixId={remixId} me={me} />
    </>
  );
}
