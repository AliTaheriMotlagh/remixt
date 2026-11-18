"use client";

import { memo, useMemo, useState } from "react";
import { stemCoverUrl } from "@/lib/cover";
import { songArtUrl } from "@/lib/songArt";

/** Stems whose song turned out to have no cover — not asked for again this visit. */
const noCover = new Set<string>();

/**
 * A song's picture: its cover (from its file's tags or its page — see
 * app/api/stems/[id]/cover), else one drawn from its waveform and name
 * (lib/songArt.ts), so every song has one. `hasCover: false` (the library
 * knows) skips asking.
 */
export default memo(function SongArt({
  stemId,
  title,
  artist = "",
  peaks,
  hasCover,
  className = "h-10 w-10 rounded-lg",
}: {
  stemId?: string | null;
  title: string;
  artist?: string;
  peaks?: ArrayLike<number>;
  hasCover?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const drawn = useMemo(() => songArtUrl({ title, artist, peaks }), [title, artist, peaks]);
  const tryCover = !!stemId && hasCover !== false && !failed && !noCover.has(stemId);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our own small route, or a data URL
    <img
      src={tryCover ? stemCoverUrl(stemId!) : drawn}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => {
        if (stemId) noCover.add(stemId);
        setFailed(true);
      }}
      className={`shrink-0 bg-surface-raised object-cover ${className}`}
    />
  );
});
