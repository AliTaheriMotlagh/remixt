"use client";

// "Remix together": the artists online right now (and anyone by name), one
// tap to invite them into this shared session. They get a notification that
// opens it; the session's own invite link still works for everyone else.

import { useEffect, useRef, useState } from "react";
import { Check, Search, UserPlus } from "lucide-react";

type Person = { id: string; artist_name: string; avatar_color: string; area?: string | null };

const AREA: Record<string, string> = {
  studio: "in the Studio",
  library: "in the Library",
  upload: "uploading",
  listening: "listening to remixes",
  challenges: "at the challenges",
  live: "at a live session",
  dj: "at the DJ decks",
  browsing: "online",
};

export default function InviteOnline({ projectId, userId, memberIds }: { projectId: string; userId: string; memberIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<Person[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Person[]>([]);
  const [sent, setSent] = useState<Record<string, "sending" | "sent" | string>>({});
  const box = useRef<HTMLDivElement>(null);

  // Who's here now, refreshed while the picker is open.
  useEffect(() => {
    if (!open) return;
    const load = () =>
      fetch("/api/presence", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { artists?: Person[] }) => setOnline(d.artists ?? []))
        .catch(() => {});
    load();
    const timer = setInterval(load, 15_000);
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => {
      clearInterval(timer);
      document.removeEventListener("pointerdown", away);
    };
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d: { users?: Person[] }) => setFound(d.users ?? []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function invite(p: Person) {
    setSent((s) => ({ ...s, [p.id]: "sending" }));
    const res = await fetch("/api/projects/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, userId: p.id }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSent((s) => ({ ...s, [p.id]: res?.ok ? "sent" : (data?.error ?? "Couldn't send") }));
  }

  const people = (q.trim().length >= 2 ? found : online).filter((p) => p.id !== userId && !memberIds.includes(p.id));

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1.5 rounded-lg border border-beat/60 px-3 py-1.5 text-xs font-semibold hover:bg-beat/15">
        <UserPlus className="h-3.5 w-3.5" /> Invite someone online
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface-raised p-2 shadow-2xl">
          <label className="flex items-center gap-2 rounded-lg bg-background/60 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Online now, or find by name" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <ul className="mt-2 max-h-72 overflow-y-auto">
            {people.length === 0 && (
              <li className="px-2 py-3 text-xs text-muted">{q.trim().length >= 2 ? "No artist by that name." : "Nobody else is online right now — find someone by name, or copy the invite link."}</li>
            )}
            {people.map((p) => {
              const state = sent[p.id];
              return (
                <li key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: p.avatar_color }}>
                    {p.artist_name.slice(0, 1).toUpperCase()}
                    {p.area !== undefined && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface-raised" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{p.artist_name}</span>
                    {p.area && <span className="block text-[11px] text-muted">{AREA[p.area] ?? "online"}</span>}
                  </span>
                  <button
                    onClick={() => invite(p)}
                    disabled={state === "sending" || state === "sent"}
                    className="rounded-md bg-beat px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                  >
                    {state === "sent" ? <Check className="h-3.5 w-3.5" /> : state === "sending" ? "…" : "Invite"}
                  </button>
                  {state && state !== "sent" && state !== "sending" && <span className="sr-only">{state}</span>}
                </li>
              );
            })}
          </ul>
          <p className="border-t border-border px-2 pt-2 text-[11px] text-muted">
            Earnings from a remix you make together can be shared on the Earnings page.
          </p>
        </div>
      )}
    </div>
  );
}
