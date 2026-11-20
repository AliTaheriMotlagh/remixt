"use client";

// Admin → Remixt ads: the site's own ads, which fill every spot no paying ad
// takes — the animated "Remix it your way", picture cards, an uploaded video,
// and the radio's station ID. For each: how it looks (the real thing, as
// visitors see it), where it shows, how often against the others, and how
// it did (views, clicks, click-through, by day and by place).
//
// Views here are counted like a paying ad's (half on screen for a second;
// a sound heard through) but pay nobody.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Pause, Pencil, Play, Plus, Trash2, Upload } from "lucide-react";
import { HouseSpot } from "@/components/ads/AdCard";
import { useSettings } from "@/components/SettingsProvider";
import {
  ctrText, HOUSE_KINDS, HOUSE_SPOTS, HOUSE_TONES, type HouseAd, type HouseAdInput, type HouseKind, type HouseSpot as Spot,
} from "@/lib/monetize/houseAds";

type Report = HouseAd & { views: number; clicks: number; daily: number[]; bySpot: { spot: string; views: number; clicks: number }[] };

const KIND_NAME: Record<HouseKind, string> = { card: "Picture card", motion: "Animated (Remix it your way)", video: "Video", audio: "Sound" };
const SPOT_NAME: Record<Spot, string> = { site: "Ordinary pages", remix: "Remix pages", radio: "Radio" };
const LANG_NAME = { en: "English", fa: "Persian", any: "Any language" } as const;

const blank = (): HouseAdInput => ({ lang: "en", kind: "card", title: "", body: "", cta: "Open", href: "/", tone: "brand", spots: ["site"], weight: 10, active: true });

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

async function soundSeconds(file: File) {
  return new Promise<number>((resolve, reject) => {
    const el = new Audio();
    const url = URL.createObjectURL(file);
    el.onloadedmetadata = () => (URL.revokeObjectURL(url), resolve(el.duration));
    el.onerror = () => (URL.revokeObjectURL(url), reject(new Error("Couldn't read the sound")));
    el.src = url;
  });
}

export default function HouseAdsTab() {
  const { features } = useSettings();
  const [days, setDays] = useState(30);
  const [ads, setAds] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; input: HouseAdInput } | null>(null);
  const [filter, setFilter] = useState<"all" | HouseKind>("all");

  const load = useCallback(() => {
    fetch(`/api/admin/house-ads?days=${days}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ads: Report[] }) => setAds(d.ads))
      .catch(() => setError("Couldn't load"));
  }, [days]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const totals = useMemo(() => {
    const list = ads ?? [];
    const views = list.reduce((n, a) => n + a.views, 0);
    const clicks = list.reduce((n, a) => n + a.clicks, 0);
    return { views, clicks, live: list.filter((a) => a.active).length, all: list.length };
  }, [ads]);

  if (!ads) return <p className="text-sm text-muted">{error ?? "Loading…"}</p>;
  const shown = ads.filter((a) => filter === "all" || a.kind === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Remixt&apos;s own ads</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            They fill every spot no paying ad takes, on every page, the remix pages and the radio. They pay nobody. Switch them on or off as a
            whole in Settings → Switches.
          </p>
          <p className="mt-2 flex flex-wrap gap-2 text-xs">
            <Switch on={features.houseAds} label="Picture spots" />
            <Switch on={features.houseRadio} label="Radio station IDs" />
            <Switch on={features.housePreroll} label="Before remixes" />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm" aria-label="Period">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={() => setEditing({ id: null, input: blank() })} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> New ad
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Views" value={totals.views.toLocaleString()} />
        <Stat label="Clicks" value={totals.clicks.toLocaleString()} />
        <Stat label="Click-through" value={ctrText(totals.views, totals.clicks)} />
        <Stat label="Running" value={`${totals.live} of ${totals.all}`} />
      </div>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...HOUSE_KINDS] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === k ? "border-brand bg-brand/15" : "border-border text-muted hover:text-foreground"}`}
          >
            {k === "all" ? "All" : KIND_NAME[k]}
          </button>
        ))}
      </div>

      {editing && (
        <Editor
          key={editing.id ?? "new"}
          id={editing.id}
          initial={editing.input}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {shown.map((a) => (
          <li key={a.id} className={`min-w-0 rounded-2xl border bg-surface p-3 ${a.active ? "border-border" : "border-dashed border-border opacity-70"}`}>
            <Preview ad={a} />
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="font-medium text-foreground">{KIND_NAME[a.kind]}</span>
              <span>{LANG_NAME[a.lang]}</span>
              <span>{a.spots.map((s) => SPOT_NAME[s]).join(" · ")}</span>
              <span>weight {a.weight}</span>
              {a.builtin && <span className="rounded bg-surface-raised px-1.5">built in</span>}
            </div>
            <div className="mt-3 flex items-end gap-4">
              <dl className="grid flex-1 grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">Views</dt>
                  <dd className="font-semibold tabular-nums">{a.views.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Clicks</dt>
                  <dd className="font-semibold tabular-nums">{a.clicks.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">CTR</dt>
                  <dd className="font-semibold tabular-nums">{ctrText(a.views, a.clicks)}</dd>
                </div>
              </dl>
              <Spark values={a.daily} />
            </div>
            {a.bySpot.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                {a.bySpot.map((s) => `${SPOT_NAME[s.spot as Spot] ?? s.spot}: ${s.views.toLocaleString()} views, ${ctrText(s.views, s.clicks)}`).join(" · ")}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => run(() => send(`/api/admin/house-ads/${a.id}`, "PATCH", { active: !a.active }))}
                className={`h-8 rounded-lg px-3 text-xs font-semibold ${a.active ? "border border-border" : "bg-brand text-white"}`}
              >
                {a.active ? "Turn off" : "Turn on"}
              </button>
              <button
                onClick={() => setEditing({ id: a.id, input: { lang: a.lang, kind: a.kind, title: a.title, body: a.body, cta: a.cta, href: a.href, tone: a.tone, spots: a.spots, weight: a.weight, active: a.active } })}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                onClick={() => setEditing({ id: null, input: { lang: a.lang, kind: a.kind, title: `${a.title} (copy)`.slice(0, 80), body: a.body, cta: a.cta, href: a.href, tone: a.tone, spots: a.spots, weight: a.weight, active: false } })}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs"
                title="A copy to try different words (an A/B test: give both a weight and compare their click-through)"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
              {a.kind !== "motion" && <MediaUpload ad={a} onDone={load} onError={setError} />}
              {!a.builtin && (
                <button
                  onClick={() => confirm(`Delete “${a.title}”?`) && run(() => send(`/api/admin/house-ads/${a.id}`, "DELETE"))}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs text-muted hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Switch({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 ${on ? "bg-success/15 text-success" : "bg-surface-raised text-muted"}`}>
      {label}: {on ? "on" : "off"}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** Views per day as a small line. */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 120;
  const h = 32;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-28 shrink-0" aria-label={`Views per day, highest ${max}`} role="img">
      <polyline points={points} fill="none" stroke="var(--brand-strong)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** The ad as visitors see it; a sound with a play button. */
function Preview({ ad }: { ad: HouseAd }) {
  const lang = ad.lang === "fa" ? "fa" : "en";
  if (ad.kind === "audio") return <SoundPreview ad={ad} />;
  return (
    <div dir={lang === "fa" ? "rtl" : undefined} className="pointer-events-none overflow-hidden rounded-xl border border-border" aria-hidden>
      <HouseSpot house={{ id: ad.id, kind: ad.kind, title: ad.title, body: ad.body, cta: ad.cta, tone: ad.tone, media: ad.media, href: ad.href }} lang={lang} compact={false} onOpen={() => {}} />
    </div>
  );
}

function SoundPreview({ ad }: { ad: HouseAd }) {
  const el = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => el.current?.pause(), []);
  const toggle = () => {
    if (!ad.media) return;
    el.current ??= new Audio(ad.media);
    const a = el.current;
    a.onended = () => setPlaying(false);
    if (a.paused) {
      a.currentTime = 0;
      void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      a.pause();
      setPlaying(false);
    }
  };
  return (
    <div className="flex h-[8.5rem] items-center gap-4 rounded-xl border border-border bg-gradient-to-br from-brand/20 via-vocals/10 to-beat/10 p-4">
      <button
        onClick={toggle}
        disabled={!ad.media}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"
        aria-label={playing ? "Stop" : `Play “${ad.title}”`}
      >
        {playing ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
      </button>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Sound · {ad.seconds ? `${ad.seconds.toFixed(1)} s` : "no file yet"}</p>
        <p className="truncate font-semibold">{ad.title}</p>
        <p className="line-clamp-2 text-sm text-muted">{ad.body}</p>
      </div>
    </div>
  );
}

function MediaUpload({ ad, onDone, onError }: { ad: HouseAd; onDone: () => void; onError: (e: string) => void }) {
  const { audio } = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const accept = ad.kind === "audio" ? "audio/*" : ad.kind === "video" ? "video/mp4,video/webm" : "image/jpeg,image/png";
  const label = ad.kind === "audio" ? "Sound" : ad.kind === "video" ? "Video" : "Picture";
  return (
    <>
      <button onClick={() => input.current?.click()} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs disabled:opacity-50">
        <Upload className="h-3.5 w-3.5" /> {busy ? "Uploading…" : `${ad.media ? "Replace" : "Add"} ${label.toLowerCase()}`}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            let q = "";
            if (ad.kind === "audio") {
              const seconds = await soundSeconds(file);
              if (seconds > audio.maxSeconds + 0.5) throw new Error(`The sound is ${seconds.toFixed(1)} s — ${audio.maxSeconds} s at most`);
              q = `?seconds=${seconds.toFixed(2)}`;
            }
            const res = await fetch(`/api/admin/house-ads/${ad.id}/media${q}`, { method: "PUT", body: file });
            if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed");
            onDone();
          } catch (err) {
            onError(err instanceof Error ? err.message : "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function Editor({ id, initial, onClose, onSaved }: { id: string | null; initial: HouseAdInput; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof HouseAdInput>(k: K, v: HouseAdInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const field = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
  const lang = f.lang === "fa" ? "fa" : "en";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await send(id ? `/api/admin/house-ads/${id}` : "/api/admin/house-ads", id ? "PUT" : "POST", f);
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't save");
        } finally {
          setSaving(false);
        }
      }}
      className="rounded-2xl border border-brand/40 bg-surface p-4"
    >
      <h3 className="font-semibold">{id ? "Change the ad" : "A new ad"}</h3>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Kind
            <select value={f.kind} onChange={(e) => set("kind", e.target.value as HouseKind)} className={field}>
              {HOUSE_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_NAME[k]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Language
            <select value={f.lang} onChange={(e) => set("lang", e.target.value as HouseAdInput["lang"])} className={field}>
              {(["en", "fa", "any"] as const).map((l) => (
                <option key={l} value={l}>{LANG_NAME[l]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            Title <span className="text-muted">(80)</span>
            <input value={f.title} maxLength={80} onChange={(e) => set("title", e.target.value)} className={field} dir="auto" required />
          </label>
          <label className="text-sm sm:col-span-2">
            Words under it <span className="text-muted">(200)</span>
            <textarea value={f.body} maxLength={200} rows={2} onChange={(e) => set("body", e.target.value)} className={field} dir="auto" />
          </label>
          <label className="text-sm">
            Button
            <input value={f.cta} maxLength={30} onChange={(e) => set("cta", e.target.value)} className={field} dir="auto" required />
          </label>
          <label className="text-sm">
            Goes to
            <input value={f.href} onChange={(e) => set("href", e.target.value)} className={field} placeholder="/radio or https://…" required />
          </label>
          <label className="text-sm">
            Colour
            <select value={f.tone} onChange={(e) => set("tone", e.target.value as HouseAdInput["tone"])} className={field}>
              {HOUSE_TONES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Weight <span className="text-muted">(how often against the others: 0–100)</span>
            <input type="number" min={0} max={100} value={f.weight} onChange={(e) => set("weight", Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))} className={field} />
          </label>
          <fieldset className="text-sm sm:col-span-2">
            <legend>Shows on</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {HOUSE_SPOTS.map((s) => (
                <label key={s} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={f.spots.includes(s)}
                    onChange={(e) => set("spots", e.target.checked ? [...f.spots, s] : f.spots.filter((x) => x !== s))}
                  />
                  {SPOT_NAME[s]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Running
          </label>
        </div>
        <div>
          <p className="text-xs text-muted">Preview</p>
          <div className="mt-1">
            {f.kind === "audio" ? (
              <p className="rounded-xl border border-border p-4 text-sm text-muted">Save it, then add its sound (MP3, up to the longest audio ad).</p>
            ) : (
              <div dir={lang === "fa" ? "rtl" : undefined} className="pointer-events-none overflow-hidden rounded-xl border border-border" aria-hidden>
                <HouseSpot house={{ id: "preview", kind: f.kind, title: f.title || "Title", body: f.body, cta: f.cta || "Open", tone: f.tone, media: null, href: f.href }} lang={lang} compact={false} onOpen={() => {}} />
              </div>
            )}
            {f.kind === "video" && <p className="mt-2 text-xs text-muted">Save it, then add the video (MP4 or WebM, 12 MB at most; keep it short and readable with no sound).</p>}
          </div>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button disabled={saving} className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-border px-4 text-sm">Cancel</button>
      </div>
    </form>
  );
}
