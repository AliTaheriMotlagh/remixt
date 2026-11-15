"use client";

import { useSyncExternalStore } from "react";
import { Clapperboard } from "lucide-react";
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
 * useStudioView.openClip.
 */
export default function SocialClipButton({ title, artist, remixId }: { title: string; artist: string; remixId: string | null }) {
  const supported = useCanMakeClips();
  const duration = useStudioStore((s) => s.duration);
  const open = useStudioView((s) => s.clip !== null);
  const openClip = useStudioView((s) => s.openClip);
  if (!supported) return null;
  return (
    <>
      <button
        onClick={() => openClip()}
        disabled={duration <= 0}
        className="rounded-lg border border-border px-2.5 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
        title="Make a vertical video clip for Reels, TikTok, Shorts or Stories"
        aria-label="Make a video clip for socials"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Clapperboard />
      </button>
      <ClipDialog title={title} artist={artist} remixId={remixId} />
    </>
  );
}
