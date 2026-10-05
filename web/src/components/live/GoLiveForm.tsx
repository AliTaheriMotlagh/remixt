"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Radio } from "lucide-react";
import TagInput from "@/components/TagInput";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/liveShared";

type RemixChoice = { id: string; title: string; lanes: number };

/** Local date-time input value ("2026-05-01T20:00") for a Date. */
function localInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Set up a session: what you'll play, who can chat, and whether it starts now or later. */
export default function GoLiveForm({ remixes, defaultTitle }: { remixes: RemixChoice[]; defaultTitle: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [remixId, setRemixId] = useState(remixes[0]?.id ?? "");
  const [chatMode, setChatMode] = useState<"open" | "followers" | "off">("open");
  const [slowMode, setSlowMode] = useState(0);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState(() => localInputValue(new Date(Date.now() + 3_600_000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        tags,
        remixId: remixId || null,
        chatMode,
        slowMode,
        scheduledAt: when === "later" ? new Date(scheduledAt).toISOString() : null,
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok) return router.push(`/live/${data.id}`);
    // Already live: take them back to it.
    if (res?.status === 409 && data?.id) return router.push(`/live/${data.id}`);
    setBusy(false);
    setError(data?.error ?? "Couldn't set that up");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} required minLength={2} className="input" placeholder="Friday night remix set" />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        What are you playing?
        <select value={remixId} onChange={(e) => setRemixId(e.target.value)} className="input">
          <option value="">Decide later — chat first</option>
          {remixes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} · {r.lanes} stems
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-muted">
          {remixes.length === 0 ? (
            <>
              Listeners hear your published remixes, so you need one.{" "}
              <Link href="/studio" className="text-brand-strong hover:underline">Make one in the Studio</Link> and publish it.
            </>
          ) : (
            "You perform it live: play, pause, mute and solo stems — the room hears what you do. You can switch remixes during the session."
          )}
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        About this session <span className="font-normal text-muted">(optional)</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={DESCRIPTION_MAX} rows={3} className="input resize-y" placeholder="What are you playing, and what should people expect?" />
      </label>

      <div className="flex flex-col gap-1.5 text-sm font-medium">
        Tags
        <TagInput value={tags} onChange={setTags} compact />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Who can chat
          <select value={chatMode} onChange={(e) => setChatMode(e.target.value as typeof chatMode)} className="input">
            <option value="open">Everyone — guests too</option>
            <option value="followers">Followers only</option>
            <option value="off">Chat off (reactions only)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Slow mode
          <select value={slowMode} onChange={(e) => setSlowMode(Number(e.target.value))} className="input">
            <option value={0}>Off</option>
            <option value={3}>One message every 3 seconds</option>
            <option value={10}>Every 10 seconds</option>
            <option value={30}>Every 30 seconds</option>
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">When</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "now", label: "Go live now", icon: Radio, hint: "Your followers are told straight away" },
              { id: "later", label: "Schedule it", icon: CalendarClock, hint: "Get a page people can come back to" },
            ] as const
          ).map(({ id, label, icon: Icon, hint }) => (
            <label key={id} className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm ${when === id ? "border-brand bg-brand/10" : "border-border hover:border-brand/50"}`}>
              <input type="radio" name="when" checked={when === id} onChange={() => setWhen(id)} className="sr-only" />
              <span className="flex items-center gap-2 font-semibold">
                <Icon className="h-4 w-4" /> {label}
              </span>
              <span className="text-xs text-muted">{hint}</span>
            </label>
          ))}
        </div>
        {when === "later" && (
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="input !w-auto" required aria-label="Start time" />
        )}
      </fieldset>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy || title.trim().length < 2}
        className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 ${when === "now" ? "bg-danger hover:opacity-90" : "bg-brand hover:bg-brand-strong"}`}
      >
        {when === "now" ? <Radio className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
        {busy ? "Setting up…" : when === "now" ? "Go live" : "Schedule session"}
      </button>
    </form>
  );
}
