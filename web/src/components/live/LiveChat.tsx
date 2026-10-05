"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, Ban, EyeOff, Pin, PinOff, Send, Shield } from "lucide-react";
import type { LiveConnection } from "@/lib/client/liveSync";
import type { ChatMode, LiveEvent } from "@/lib/live";
import { CHAT_MAX } from "@/lib/liveShared";

const GUEST_NAME_KEY = "remixt_guest_name";

function readGuestName() {
  try {
    return localStorage.getItem(GUEST_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function Avatar({ name, color, size = "h-6 w-6 text-[11px]" }: { name: string; color: string; size?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size}`}
      style={{ background: color }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Message({
  event,
  host,
  onHide,
  onBan,
  onPin,
  pinned,
}: {
  event: LiveEvent;
  host?: boolean;
  onHide?: (id: number) => void;
  onBan?: (id: number) => void;
  onPin?: (id: number) => void;
  pinned?: boolean;
}) {
  const name = event.user_id ? (
    <Link href={`/artist/${event.user_id}`} className="font-semibold hover:underline" style={{ color: event.color }}>
      {event.name}
    </Link>
  ) : (
    <span className="font-semibold text-muted">{event.name}</span>
  );
  return (
    <li className="group flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-raised/60">
      <Avatar name={event.name} color={event.color} />
      <p className="min-w-0 flex-1 break-words text-[13px] leading-snug">
        {name}
        {event.is_host && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-brand/20 px-1 text-[10px] font-bold uppercase text-brand-strong">
            <Shield className="h-2.5 w-2.5" /> Host
          </span>
        )}
        <span className="text-foreground"> {event.body}</span>
      </p>
      {host && !event.is_host && (
        <span className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onPin?.(event.id)}
            className="rounded p-1.5 text-muted hover:bg-surface hover:text-foreground"
            aria-label={pinned ? "Unpin message" : "Pin message"}
            title={pinned ? "Unpin" : "Pin to the top"}
          >
            {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onHide?.(event.id)}
            className="rounded p-1.5 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Hide message"
            title="Hide this message"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onBan?.(event.id)}
            className="rounded p-1.5 text-muted hover:bg-surface hover:text-danger"
            aria-label="Hide and ban this person"
            title="Hide and ban from this session"
          >
            <Ban className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </li>
  );
}

/** The chat: a scrolling list that follows new messages, a composer, and (for the host) moderation. */
export default function LiveChat({
  streamId,
  conn,
  signedIn,
  isHost,
  chatMode,
  slowMode,
  pinned,
  isFollowing,
  className = "",
}: {
  streamId: string;
  conn: LiveConnection;
  signedIn: boolean;
  isHost: boolean;
  chatMode: ChatMode;
  slowMode: number;
  pinned: LiveEvent | null;
  isFollowing: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const stuck = useRef(true);
  const [behind, setBehind] = useState(false);
  const { chat } = conn;

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved name is only known in the browser
  useEffect(() => setGuestName(readGuestName()), []);

  // Follow new messages unless the reader scrolled up to read.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (stuck.current) list.scrollTop = list.scrollHeight;
    else setBehind(true);
  }, [chat.length]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    stuck.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    if (stuck.current) setBehind(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    if (!signedIn) {
      try {
        localStorage.setItem(GUEST_NAME_KEY, guestName);
      } catch {
        // Private mode: the name just isn't remembered.
      }
    }
    const problem = await conn.sendChat(body, signedIn ? undefined : guestName);
    setBusy(false);
    if (problem) setError(problem);
    else {
      setDraft("");
      stuck.current = true;
      if (slowMode > 0 && !isHost) setCooldown(slowMode);
    }
  }

  async function moderate(action: "hide" | "ban" | "pin" | "unpin", eventId?: number) {
    const res = await fetch(`/api/live/${streamId}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, eventId }),
    });
    if (res.ok) {
      if (action === "hide" || action === "ban") conn.dropLocal(eventId!);
      conn.refresh();
    }
  }

  const blocked =
    conn.banned
      ? "You've been removed from this chat."
      : !isHost && chatMode === "off"
        ? "The host turned chat off. Reactions are still on."
        : !isHost && chatMode === "followers" && !signedIn
          ? "Chat is for followers — sign in and follow to join in."
          : !isHost && chatMode === "followers" && !isFollowing
            ? "Chat is for followers — follow the host to join in."
            : null;

  return (
    <section className={`flex min-h-0 flex-col rounded-xl border border-border bg-surface ${className}`} aria-label="Live chat">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">Live chat</h2>
        <span className="text-[11px] text-muted">
          {chatMode === "followers" ? "Followers only" : chatMode === "off" ? "Chat off" : "Everyone"}
          {slowMode > 0 && ` · slow mode ${slowMode}s`}
        </span>
      </header>

      {pinned && (
        <div className="flex items-start gap-2 border-b border-border bg-brand/10 px-3 py-2 text-[13px]">
          <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-strong" />
          <p className="min-w-0 flex-1 break-words">
            <span className="font-semibold">{pinned.name}</span> {pinned.body}
          </p>
          {isHost && (
            <button
              type="button"
              onClick={() => moderate("unpin")}
              className="shrink-0 text-[11px] text-muted hover:text-foreground"
            >
              Unpin
            </button>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <ul
          ref={listRef}
          onScroll={onScroll}
          className="scrollbar-thin flex h-full min-h-40 flex-col gap-0.5 overflow-y-auto overscroll-contain px-1.5 py-2"
          aria-live="polite"
          aria-relevant="additions"
        >
          {chat.length === 0 && (
            <li className="m-auto px-4 text-center text-sm text-muted">
              No messages yet — say hi 👋
            </li>
          )}
          {chat.map((event) => (
            <Message
              key={event.id}
              event={event}
              host={isHost}
              pinned={pinned?.id === event.id}
              onHide={(id) => moderate("hide", id)}
              onBan={(id) => moderate("ban", id)}
              onPin={(id) => moderate(pinned?.id === id ? "unpin" : "pin", id)}
            />
          ))}
        </ul>
        {behind && (
          <button
            type="button"
            onClick={() => {
              const list = listRef.current;
              if (list) list.scrollTop = list.scrollHeight;
              stuck.current = true;
              setBehind(false);
            }}
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow-lg"
          >
            <ArrowDown className="h-3 w-3" /> New messages
          </button>
        )}
      </div>

      {blocked ? (
        <p className="border-t border-border px-3 py-3 text-center text-xs text-muted">
          {blocked}{" "}
          {!signedIn && chatMode === "followers" && (
            <Link href={`/login?next=/live/${streamId}`} className="text-brand-strong hover:underline">
              Sign in
            </Link>
          )}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2 border-t border-border p-2.5">
          {!signedIn && (
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <label htmlFor="guest-name">Chatting as</label>
              <input
                id="guest-name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value.slice(0, 20))}
                placeholder="Guest name"
                className="input !w-36 !py-1 !text-xs"
                maxLength={20}
              />
              <Link href={`/login?next=/live/${streamId}`} className="ml-auto text-brand-strong hover:underline">
                Sign in
              </Link>
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, CHAT_MAX))}
              placeholder={cooldown > 0 ? `Slow mode — ${cooldown}s` : isHost ? "Say something to your audience…" : "Send a message…"}
              className="input min-w-0 flex-1"
              aria-label="Chat message"
              enterKeyHint="send"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim() || cooldown > 0}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-danger">{error}</span>
            <span className="tabular-nums text-muted">
              {draft.length}/{CHAT_MAX}
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
