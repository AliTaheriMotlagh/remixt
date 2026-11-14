"use client";

import { useEffect, useState } from "react";
import { Globe, Lock, Share2, Users, X } from "lucide-react";

// Who can see and use a take recorded in the booth. It starts private —
// only its singer sees it, in their library and the Studio. From here they
// can share it with chosen artists (who are notified, and find it in their
// own library), or with everyone (it joins the public library).

type Person = { id: string; artist_name: string; avatar_color: string };
type Sharing = { visibility: "public" | "private"; people: Person[] };

async function call(url: string, init?: RequestInit): Promise<Sharing> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Couldn't change who can see it");
  return data as Sharing;
}

/** "Private", "Shared with 2", "Everyone" — what a take's sharing button says. */
export function sharingLabel(visibility: string | undefined, sharedWith?: number) {
  if (visibility === "public") return "Everyone";
  if (sharedWith === undefined) return "Private";
  return sharedWith > 0 ? `Shared with ${sharedWith}` : "Only you";
}

export function TakeShareButton({
  trackId,
  title,
  visibility: initialVisibility,
  sharedWith: initialSharedWith,
  compact = false,
  onChange,
}: {
  trackId: string;
  title: string;
  visibility: "public" | "private" | undefined;
  sharedWith?: number;
  compact?: boolean;
  onChange?: (sharing: Sharing) => void;
}) {
  const [open, setOpen] = useState(false);
  // What the dialog last set, until the list it came from is fetched again.
  const [changed, setChanged] = useState<Sharing | null>(null);
  const visibility = changed?.visibility ?? initialVisibility;
  const sharedWith = changed ? changed.people.length : initialSharedWith;
  const Icon = visibility === "public" ? Globe : (sharedWith ?? 0) > 0 ? Users : Lock;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`flex shrink-0 items-center gap-1 rounded-full border border-border font-medium text-muted hover:border-brand/50 hover:text-foreground ${
          compact ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"
        }`}
        title="Who can see and use this take"
        aria-label={`Sharing: ${sharingLabel(visibility, sharedWith)}. Change who can use “${title}”`}
      >
        <Icon className="h-3 w-3" /> {sharingLabel(visibility, sharedWith)}
        {!compact && <Share2 className="h-3 w-3" />}
      </button>
      {open && (
        <SharingDialog
          trackId={trackId}
          title={title}
          onClose={() => setOpen(false)}
          onChange={(next) => {
            setChanged(next);
            onChange?.(next);
          }}
        />
      )}
    </>
  );
}

function SharingDialog({
  trackId,
  title,
  onClose,
  onChange,
}: {
  trackId: string;
  title: string;
  onClose: () => void;
  onChange?: (sharing: Sharing) => void;
}) {
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Person[]>([]);
  const base = `/api/tracks/${trackId}/sharing`;

  useEffect(() => {
    let live = true;
    call(base)
      .then((s) => live && setSharing(s))
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [base]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Artists matching what's typed, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results as the query empties
      setFound([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { users: [] }))
        .then((data: { users: Person[] }) => setFound(data.users))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function change(work: () => Promise<Sharing>) {
    setBusy(true);
    setError(null);
    try {
      const next = await work();
      setSharing(next);
      onChange?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const json = { "Content-Type": "application/json" };
  const setVisibility = (visibility: Sharing["visibility"]) =>
    change(() => call(base, { method: "PATCH", headers: json, body: JSON.stringify({ visibility }) }));
  const add = (person: Person) => {
    setQuery("");
    setFound([]);
    void change(() => call(base, { method: "POST", headers: json, body: JSON.stringify({ userId: person.id }) }));
  };
  const remove = (person: Person) =>
    change(() => call(`${base}?user=${encodeURIComponent(person.id)}`, { method: "DELETE" }));

  const shownIds = new Set(sharing?.people.map((p) => p.id));

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share “${title}”`}
        onClick={(e) => e.stopPropagation()}
        className="touch-targets fixed z-[81] flex max-h-[85vh] flex-col gap-3 overflow-y-auto border border-border bg-surface-raised p-4 text-sm shadow-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-2xl max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:left-1/2 sm:top-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        style={{ animation: "sheet-in 0.18s ease-out" }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">Who can use this take</h2>
            <p dir="auto" className="truncate text-xs text-muted">
              “{title}”
            </p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!sharing && !error && <p className="text-xs text-muted">Loading…</p>}

        {sharing && (
          <>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Who can see it">
              <Choice
                checked={sharing.visibility === "private"}
                disabled={busy}
                onSelect={() => setVisibility("private")}
                icon={<Lock className="h-4 w-4" />}
                title="Only me and people I pick"
                text="It stays out of the public library. Only you — and the artists below — can hear it and use it."
              />
              <Choice
                checked={sharing.visibility === "public"}
                disabled={busy}
                onSelect={() => setVisibility("public")}
                icon={<Globe className="h-4 w-4" />}
                title="Everyone"
                text="It joins the public library, for anyone to hear and remix."
              />
            </div>

            {sharing.visibility === "private" && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <label htmlFor={`share-${trackId}`} className="text-xs font-semibold">
                  Share with an artist
                </label>
                <input
                  id={`share-${trackId}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type their artist name…"
                  autoComplete="off"
                  className="input"
                  disabled={busy}
                />
                {found.filter((p) => !shownIds.has(p.id)).length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {found
                      .filter((p) => !shownIds.has(p.id))
                      .map((person) => (
                        <li key={person.id}>
                          <button
                            onClick={() => add(person)}
                            disabled={busy}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-hover"
                          >
                            <Avatar person={person} />
                            <span dir="auto" className="min-w-0 flex-1 truncate">
                              {person.artist_name}
                            </span>
                            <span className="text-xs font-semibold text-brand-strong">Share</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
                {query.trim().length >= 2 && found.length === 0 && (
                  <p className="text-xs text-muted">No artist by that name yet.</p>
                )}
                {sharing.people.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-1">
                    {sharing.people.map((person) => (
                      <li key={person.id} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5">
                        <Avatar person={person} />
                        <span dir="auto" className="min-w-0 flex-1 truncate">
                          {person.artist_name}
                        </span>
                        <button
                          onClick={() => remove(person)}
                          disabled={busy}
                          className="text-xs text-muted hover:text-danger"
                          aria-label={`Stop sharing with ${person.artist_name}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">Not shared with anyone yet.</p>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted">
              A take you put in a remix or a shared project plays there for whoever listens to it.
            </p>
          </>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </>
  );
}

function Choice({
  checked,
  disabled,
  onSelect,
  icon,
  title,
  text,
}: {
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !checked && onSelect()}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
        checked ? "border-brand bg-brand/10" : "border-border hover:bg-surface-hover"
      }`}
    >
      <span className={`mt-0.5 ${checked ? "text-brand-strong" : "text-muted"}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </button>
  );
}

function Avatar({ person }: { person: Person }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ background: person.avatar_color }}
      aria-hidden
    >
      {person.artist_name.slice(0, 1).toUpperCase()}
    </span>
  );
}
