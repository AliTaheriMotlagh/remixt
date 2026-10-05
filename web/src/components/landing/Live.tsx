"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Eye,
  Flag,
  Hand,
  Handshake,
  Headphones,
  Heart,
  Library,
  MessageCircle,
  Scissors,
  SlidersHorizontal,
  Upload,
  Activity as ActivityIcon,
  type LucideIcon,
} from "lucide-react";
import { setPresence, usePresence } from "@/lib/client/presence";
import type { Activity, Area, OnlineArtist, PresenceSnapshot } from "@/lib/presence";

// The home page's live widgets: who's online and what just happened. They
// render from what the server sent with the page, then keep up — the
// online numbers through the shared presence store, the feed by polling.

const POLL_MS = 15_000;

const AREA_LABEL: Record<Area, string> = {
  studio: "in the Studio",
  library: "digging in the library",
  upload: "uploading a song",
  listening: "listening to remixes",
  challenges: "checking the challenges",
  browsing: "looking around",
};

const AREA_SHORT: Record<Area, { icon: LucideIcon; text: string }> = {
  studio: { icon: SlidersHorizontal, text: "in the Studio" },
  library: { icon: Library, text: "in the library" },
  upload: { icon: Upload, text: "uploading" },
  listening: { icon: Headphones, text: "listening" },
  challenges: { icon: Flag, text: "on challenges" },
  browsing: { icon: Eye, text: "browsing" },
};

function AreaShort({ area }: { area: Area }) {
  const { icon: AreaIcon, text } = AREA_SHORT[area];
  return (
    <>
      <AreaIcon /> {text}
    </>
  );
}

function Avatar({ artist, size = "h-9 w-9 text-sm" }: { artist: Pick<OnlineArtist, "artist_name" | "avatar_color">; size?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-background ${size}`}
      style={{ background: artist.avatar_color }}
      aria-hidden
    >
      {artist.artist_name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
    </span>
  );
}

/** "● 23 online now · 4 in the Studio" — the hero's live pill. */
export function OnlineBadge({ initial }: { initial: PresenceSnapshot }) {
  const presence = usePresence(initial);
  // The visitor reading this is online too, even before their first heartbeat lands.
  const online = Math.max(1, presence.online);
  const studio = presence.areas.studio ?? 0;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3.5 py-1.5 text-xs font-medium text-foreground">
      <LiveDot />
      <span key={online} className="animate-bump font-bold tabular-nums">
        {online.toLocaleString("en-US")}
      </span>
      <span className="text-muted">online now</span>
      {studio > 0 && (
        <>
          <span className="text-muted">·</span>
          <span className="tabular-nums">{studio}</span>
          <span className="text-muted">in the Studio</span>
        </>
      )}
    </div>
  );
}

/** A stack of the artists online right now, for social proof under the hero buttons. */
export function OnlineAvatars({ initial }: { initial: PresenceSnapshot }) {
  const presence = usePresence(initial);
  const shown = presence.artists.slice(0, 5);
  const others = Math.max(0, Math.max(1, presence.online) - shown.length);
  if (shown.length === 0) {
    return (
      <p className="text-sm text-muted">
        Free forever · no install · your songs never leave your device
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {shown.map((a) => (
          <Avatar key={a.id} artist={a} size="h-8 w-8 text-xs" />
        ))}
      </div>
      <p className="text-left text-sm text-muted">
        <span className="font-semibold text-foreground">{shown[0].artist_name}</span>
        {others > 0 && (
          <>
            {" "}and <span className="font-semibold text-foreground tabular-nums">{others.toLocaleString("en-US")}</span>{" "}
            other{others === 1 ? "" : "s"}
          </>
        )}{" "}
        {shown.length + others === 1 ? "is" : "are"} remixing right now
      </p>
    </div>
  );
}

function ago(at: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ACTIVITY_ICON: Record<Activity["type"], LucideIcon> = {
  remix: SlidersHorizontal,
  track: Scissors,
  like: Heart,
  comment: MessageCircle,
  follow: Handshake,
  join: Hand,
};

function ActivityGlyph({ type }: { type: Activity["type"] }) {
  const Glyph = ACTIVITY_ICON[type];
  return <Glyph />;
}

function activityKey(a: Activity) {
  return `${a.type}:${a.actor_id}:${a.remix_id ?? a.target_id ?? ""}:${a.at}`;
}

function ActivityText({ a }: { a: Activity }) {
  const actor = (
    <Link href={`/artist/${a.actor_id}`} className="font-semibold hover:underline">
      {a.actor_name}
    </Link>
  );
  const remix = a.remix_id ? (
    <Link href={`/remixes/${a.remix_id}`} className="font-medium text-brand-strong hover:underline">
      {a.title}
    </Link>
  ) : null;
  const target = a.target_id ? (
    <Link href={`/artist/${a.target_id}`} className="font-semibold hover:underline">
      {a.target_name}
    </Link>
  ) : null;

  switch (a.type) {
    case "remix":
      return <>{actor} published a new remix, {remix}</>;
    case "track":
      return <>{actor} split &ldquo;{a.title}&rdquo; into vocals &amp; beat</>;
    case "like":
      return <>{actor} liked {remix} by {target}</>;
    case "comment":
      return <>{actor} commented on {remix}</>;
    case "follow":
      return <>{actor} started following {target}</>;
    case "join":
      return <>{actor} joined Remixt</>;
  }
}

/** The "Happening right now" section: who's online, and the live activity feed. */
export function LivePanel({ initialPresence, initialActivity }: { initialPresence: PresenceSnapshot; initialActivity: Activity[] }) {
  const presence = usePresence(initialPresence);
  const [activity, setActivity] = useState(initialActivity);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    let seen = new Set(initialActivity.map(activityKey));
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/presence?activity=1", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: PresenceSnapshot & { activity: Activity[] } = await res.json();
        setPresence(data);
        const keys = data.activity.map(activityKey);
        setFresh(new Set(keys.filter((k) => !seen.has(k))));
        seen = new Set(keys);
        setActivity(data.activity);
        setNow(Date.now());
      } catch {
        // Try again on the next tick.
      }
    };
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [initialActivity]);

  const online = Math.max(1, presence.online);
  const guests = Math.max(0, online - presence.artistCount);
  const areas = (Object.entries(presence.areas) as [Area, number][]).sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-6">
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="online-now">
        <div className="flex items-center justify-between gap-3">
          <h3 id="online-now" className="flex items-center gap-2 font-semibold">
            <LiveDot /> Online now
          </h3>
          <span className="text-xs text-muted">updates live</span>
        </div>
        <p className="mt-3 flex items-baseline gap-2">
          <span key={online} className="animate-bump text-5xl font-black tabular-nums">
            {online.toLocaleString("en-US")}
          </span>
          <span className="text-sm text-muted">
            {online === 1 ? "person" : "people"} on Remixt right now
          </span>
        </p>
        {areas.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {areas.map(([area, n]) => (
              <span key={area} className="rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs">
                <span className="font-semibold tabular-nums">{n}</span> <span className="text-muted"><AreaShort area={area} /></span>
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 border-t border-border pt-4">
          {presence.artists.length === 0 ? (
            <p className="text-sm text-muted">
              No artists signed in right now —{" "}
              <Link href="/signup" className="font-medium text-brand-strong hover:underline">
                be the first one here
              </Link>
              .
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {presence.artists.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <span className="relative">
                    <Avatar artist={a} />
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-surface" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <Link href={`/artist/${a.id}`} className="block truncate text-sm font-medium hover:underline">
                      {a.artist_name}
                    </Link>
                    <span className="block truncate text-xs text-muted">{AREA_LABEL[a.area]}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {(presence.artistCount > 8 || guests > 0) && presence.artists.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              {presence.artistCount > 8 && `+${presence.artistCount - 8} more artists`}
              {presence.artistCount > 8 && guests > 0 && " · "}
              {guests > 0 && `${guests} listener${guests === 1 ? "" : "s"} browsing as guests`}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="live-feed">
        <div className="flex items-center justify-between gap-3">
          <h3 id="live-feed" className="font-semibold">
            <ActivityIcon className="text-brand-strong" /> Live activity
          </h3>
          <Link href="/remixes" className="text-xs font-medium text-brand-strong hover:underline">
            All remixes <ArrowRight />
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Quiet so far. Upload a song and you&apos;ll be the first thing here.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col" aria-live="polite">
            {activity.slice(0, 9).map((a, i) => {
              const key = activityKey(a);
              return (
                <li
                  key={key}
                  // Phones get the first six, so the feed doesn't swallow the page.
                  className={`flex items-start gap-3 border-b border-border/60 py-2.5 last:border-0 ${i >= 6 ? "max-sm:hidden" : ""} ${fresh.has(key) ? "animate-feed-in" : ""}`}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-base" aria-hidden>
                    <ActivityGlyph type={a.type} />
                  </span>
                  <p className="min-w-0 flex-1 text-sm leading-snug [overflow-wrap:anywhere]">
                    <ActivityText a={a} />
                  </p>
                  <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted" suppressHydrationWarning>
                    {ago(a.at, now)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
