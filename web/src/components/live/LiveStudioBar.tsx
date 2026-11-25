"use client";

import { useEffect, useRef, useState } from "react";
import { useOnScreen } from "@/lib/client/useOnScreen";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Link2, MessageCircle, PartyPopper, Radio, Square, X } from "lucide-react";
import { useLiveConnection } from "@/lib/client/liveSync";
import { startStudioBroadcast } from "@/lib/client/liveStudio";
import { useStudioStore } from "@/lib/client/studioStore";
import type { ChatMode, LiveStream, Recap as RecapData } from "@/lib/live";
import LiveChat from "./LiveChat";
import Recap from "./Recap";
import { ReactionLayer, compactNumber, type ReactionLayerHandle } from "./Reactions";
import { formatClock } from "./Stage";
import PartyStage from "./PartyStage";
import { useCrowd, useHostParty } from "./useHostParty";
import type { PartyMusic } from "@/lib/client/party/partyWorld";

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);
  return { ok: !!res?.ok, status: res?.status ?? 0, data, error: res?.ok ? null : (data?.error ?? "Couldn't reach the server") };
}

/** Where a session is run from: the Studio (the room watches you make a remix) or the DJ decks. */
type Place = "studio" | "dj";
const PLACE = {
  studio: {
    path: "/studio",
    heading: "Remix live",
    button: "Make this remix live: everyone watching sees and hears every change you make",
    intro: "Everyone watching sees your Studio — stems you add, clips you cut and move, effects, tempo — and hears the mix in step with you. They chat and react; you see it all here.",
  },
  dj: {
    path: "/dj",
    heading: "DJ live",
    button: "DJ live: everyone watching hears your decks, in step with you",
    intro: "Everyone watching hears your decks — every song you load, every blend, cut, loop and effect — in step with you, and sees what's on each deck. They chat and react; you see it all here.",
  },
} as const;

/** "Go live" in the Studio's (or the decks') header: starts a session where the room watches and hears you. */
export function GoLiveStudioButton({ signedIn, place = "studio", defaultTitle }: { signedIn: boolean; place?: Place; defaultTitle?: () => string }) {
  const where = PLACE[place];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [onScreen, onScreenStyle] = useOnScreen<HTMLFormElement>(open);
  const [title, setTitle] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A session of theirs that's still live (a tab closed without ending it, say). */
  const [existing, setExisting] = useState<string | null>(null);

  function openDialog() {
    if (!signedIn) {
      router.push(`/login?next=${where.path}`);
      return;
    }
    const s = useStudioStore.getState();
    setTitle((t) => t || (defaultTitle?.() ?? (s.sourceRemix ? `Remixing “${s.sourceRemix.title}” live` : "Making a remix live")));
    setOpen(true);
  }

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api("/api/live", "POST", { mode: place, title, chatMode });
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      setExisting(null);
      router.replace(`${where.path}?live=${result.data.id}`);
    } else if (result.status === 409 && result.data?.id) {
      setExisting(result.data.id);
    } else setError(result.error);
  }

  async function endExistingAndStart() {
    if (!existing) return;
    setBusy(true);
    const ended = await api(`/api/live/${existing}`, "PATCH", { action: "end" });
    setBusy(false);
    if (!ended.ok) return setError(ended.error);
    setExisting(null);
    await start();
  }

  return (
    <div className="relative">
      <button
        onClick={openDialog}
        className="rounded-lg border border-danger/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-danger/15"
        title={where.button}
      >
        <Radio className="text-danger" /> <span className="hidden sm:inline">Go live</span>
        <span className="sm:hidden">Live</span>
      </button>
      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(false)} />
          <form
            ref={onScreen}
            style={onScreenStyle}
            onSubmit={start}
            className="popover-sheet absolute right-0 top-full z-[45] mt-2 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-sm shadow-xl"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold">{where.heading}</p>
              <button type="button" onClick={() => setOpen(false)} className="-m-2 p-2 text-muted hover:text-foreground" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-muted">{where.intro}</p>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} minLength={2} required className="input" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Who can chat
              <select value={chatMode} onChange={(e) => setChatMode(e.target.value as ChatMode)} className="input">
                <option value="open">Everyone (guests too)</option>
                <option value="followers">Followers only</option>
                <option value="off">Chat off</option>
              </select>
            </label>
            {error && <p className="text-xs text-danger">{error}</p>}
            {existing && (
              <div className="flex flex-col gap-2 rounded-lg border border-drums/50 bg-drums/10 p-2.5 text-xs">
                <p>You still have a live session open (maybe a tab closed without ending it).</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/live/${existing}`} className="rounded-md border border-border px-2.5 py-1.5 font-semibold hover:bg-surface-hover">
                    Go back to it
                  </Link>
                  <button type="button" onClick={endExistingAndStart} disabled={busy} className="rounded-md bg-danger px-2.5 py-1.5 font-semibold text-white">
                    End it and go live here
                  </button>
                </div>
              </div>
            )}
            <button
              type="submit"
              disabled={busy || title.trim().length < 2}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-danger text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              <Radio className="h-4 w-4" /> {busy ? "Going live…" : "Go live"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

/**
 * The bar across the Studio (or the decks) while it's live: time on air,
 * who's watching, reactions floating by, the chat, and ending it. Also what
 * broadcasts the Studio — or, given `broadcast`, whatever that sends — to
 * the room.
 */
export default function LiveStudioBar({
  streamId,
  userId,
  place = "studio",
  broadcast,
  music,
}: {
  streamId: string;
  userId: string;
  place?: Place;
  /** Starts sending to the room; returns the stop. The Studio's own broadcast when left out. */
  broadcast?: (streamId: string) => () => void;
  /** The beat the host's dance floor moves to; the Studio's transport when left out. */
  music?: () => PartyMusic;
}) {
  const router = useRouter();
  const where = PLACE[place];
  const broadcastRef = useRef(broadcast);
  useEffect(() => {
    broadcastRef.current = broadcast;
  });
  const layer = useRef<ReactionLayerHandle>(null);
  const [info, setInfo] = useState<LiveStream | null>(null);
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const { party: partyRef, music: partyMusic, onReactions: partyReactions, onChat: partyChat } = useHostParty();
  const conn = useLiveConnection(streamId, {
    isHost: true,
    onReactions: (bursts) => {
      for (const b of bursts) layer.current?.burst(b.emoji, Math.min(b.count, 4));
      partyReactions(bursts);
    },
    onChat: partyChat,
  });
  const crowd = useCrowd(conn.audience);
  const status = conn.stream?.status ?? info?.status ?? null;

  useEffect(() => {
    let cancelled = false;
    void api(`/api/live/${streamId}`, "GET").then((r) => {
      if (cancelled) return;
      const stream = r.data?.stream as LiveStream | undefined;
      if (!stream) return setError("That live session doesn't exist.");
      // Someone else's session: watch it instead.
      if (stream.host_id !== userId || stream.mode !== place) return router.replace(`/live/${streamId}`);
      setInfo(stream);
      if (r.data.recap) setRecap(r.data.recap);
    });
    return () => {
      cancelled = true;
    };
  }, [streamId, userId, router, place]);

  // On air: every change goes to the room.
  useEffect(() => {
    if (status !== "live" || !info || ending) return;
    return (broadcastRef.current ?? startStudioBroadcast)(streamId);
  }, [status, info, streamId, ending]);

  useEffect(() => {
    if (status !== "live") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  // Unread messages while the chat is folded away.
  const messages = conn.chat.length;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the chat marks it seen
    if (chatOpen) setSeen(messages);
  }, [chatOpen, messages]);
  const unread = Math.max(0, messages - seen);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  async function goLive() {
    const r = await api(`/api/live/${streamId}`, "PATCH", { action: "start" });
    if (!r.ok) return setError(r.error);
    setInfo(r.data.stream);
    conn.refresh();
  }

  async function end() {
    setConfirmEnd(false);
    // Stop broadcasting first, so nothing is sent to a session that's over.
    setEnding(true);
    const r = await api(`/api/live/${streamId}`, "PATCH", { action: "end" });
    if (!r.ok) {
      setEnding(false);
      return setError(r.error);
    }
    const detail = await api(`/api/live/${streamId}`, "GET");
    setRecap(detail.data?.recap ?? null);
    conn.refresh();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/live/${streamId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(`Couldn't copy — the link is ${window.location.origin}/live/${streamId}`);
    }
  }

  if (error && !info) return <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>;
  if (!info) return <div className="h-14 animate-pulse rounded-xl border border-border bg-surface" />;

  if (status === "ended") {
    return (
      <div className="flex flex-col gap-3">
        <Recap host recap={recap ?? { durationSeconds: 0, peak: conn.stream?.peak ?? 0, unique: 0, messages, reactions: 0, topReaction: null, newFollowers: 0, chatters: 0 }} title={info.title} />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => router.replace(where.path)} className="h-10 rounded-lg border border-border px-4 text-sm text-muted hover:text-foreground">
            {place === "dj" ? "Keep mixing (off air)" : "Keep working (off air)"}
          </button>
          {place === "studio" && <span className="self-center text-xs text-muted">Your mix is still here — save or publish it from the transport.</span>}
        </div>
      </div>
    );
  }

  const started = info.started_at ? new Date(info.started_at).getTime() : null;
  const elapsed = status === "live" && started && now ? (now - started) / 1000 : 0;
  const reactions = Object.values(conn.stream?.reactions ?? {}).reduce((a, b) => a + b, 0);

  return (
    <section className="relative overflow-hidden rounded-xl border border-danger/50 bg-danger/[0.07]" aria-label="Live session">
      <ReactionLayer ref={layer} />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
        {status === "live" ? (
          <span className="inline-flex items-center gap-1.5 rounded bg-danger px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" /> Live
          </span>
        ) : (
          <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[11px] font-bold uppercase text-muted">Not live yet</span>
        )}
        <span className="min-w-0 max-w-[16rem] truncate text-sm font-semibold">{info.title}</span>
        {status === "live" && <span className="font-mono text-xs tabular-nums text-muted">{formatClock(elapsed)}</span>}
        <span className="flex items-center gap-1 text-xs text-muted" title="Watching now">
          <Eye className="h-3.5 w-3.5" /> {compactNumber(conn.stream?.viewers ?? 0)}
          <span className="hidden sm:inline">watching · peak {conn.stream?.peak ?? 0}</span>
        </span>
        <span className="text-xs text-muted">{compactNumber(reactions)} reactions</span>
        {conn.offline && <span className="text-xs text-drums">Reconnecting…</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={() => setChatOpen((v) => !v)} aria-expanded={chatOpen} className="relative flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs hover:text-foreground">
            <MessageCircle className="h-4 w-4" /> Chat
            {unread > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-vocals px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>
            )}
          </button>
          <button onClick={() => setPartyOpen((v) => !v)} aria-expanded={partyOpen} aria-label="Show the dance floor" title="Your party in 3D: the crowd and their reactions" className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs hover:text-foreground">
            <PartyPopper className="h-4 w-4" /> <span className="hidden sm:inline">The floor</span>
          </button>
          <button onClick={copyLink} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs text-muted hover:text-foreground">
            <Link2 className="h-4 w-4" /> {copied ? "Copied" : "Invite"}
          </button>
          {status === "scheduled" ? (
            <button onClick={goLive} className="flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3 text-xs font-semibold text-white">
              <Radio className="h-4 w-4" /> Go live now
            </button>
          ) : confirmEnd ? (
            <span className="flex items-center gap-1.5 text-xs">
              End for everyone?
              <button onClick={end} className="rounded bg-danger px-2.5 py-1.5 font-semibold text-white">End</button>
              <button onClick={() => setConfirmEnd(false)} className="px-2 py-1.5 text-muted hover:text-foreground">Keep going</button>
            </span>
          ) : (
            <button onClick={() => setConfirmEnd(true)} className="flex h-9 items-center gap-1.5 rounded-lg border border-danger/60 px-3 text-xs font-semibold text-danger hover:bg-danger/10">
              <Square className="h-3 w-3 fill-current" /> End
            </button>
          )}
        </span>
      </div>
      {error && <p className="relative px-3 pb-2 text-xs text-danger">{error}</p>}
      {partyOpen && (
        <div className="relative border-t border-danger/30 p-2">
          <PartyStage
            ref={partyRef}
            hostName={info.host_name}
            hostColor={info.host_color}
            title={info.title}
            crowd={crowd.people}
            guests={crowd.guests}
            music={music ?? partyMusic}
            className="sm:!aspect-[21/9]"
          />
        </div>
      )}
      {chatOpen && (
        <div className="relative border-t border-danger/30 p-2">
          <LiveChat
            streamId={streamId}
            conn={conn}
            signedIn
            isHost
            chatMode={conn.stream?.chatMode ?? info.chat_mode}
            slowMode={conn.stream?.slowMode ?? info.slow_mode}
            pinned={conn.stream?.pinned ?? null}
            isFollowing
            className="h-80"
          />
        </div>
      )}
      {status === "live" && (
        <p className="relative border-t border-danger/20 px-3 py-1.5 text-[11px] text-muted">
          On air: the room sees and hears every change you make. Keep this tab open.
        </p>
      )}
    </section>
  );
}
