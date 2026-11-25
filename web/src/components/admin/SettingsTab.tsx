"use client";

// Admin → Settings: every number and switch the site runs on, drawn from
// the registry (lib/settings/registry.ts) — so a new setting needs no new
// screen. Changes are kept as a draft and checked as you type with the
// same rules the server uses (a split must make 100%), then saved together;
// every save is logged (who, when, from what to what). Each changed setting
// can go back to its default.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, RotateCcw, Save, Search, X } from "lucide-react";
import {
  applyChange, DEFAULTS, FIELD_BY_PATH, FIELDS, getPath, GROUPS, setPath, show, type AppSettings, type Field, type Group,
} from "@/lib/settings/registry";
import type { SettingsChange } from "@/lib/settings/server";

type Loaded = { settings: AppSettings; changed: string[]; log: SettingsChange[] };

const SUFFIX: Partial<Record<Field["unit"], string>> = {
  percent: "%", usd: "$", seconds: "s", ms: "ms", minutes: "min", days: "days", years: "years", toman: "Toman", times: "×",
};

/** A stored value as the input shows it. */
function toInput(field: Field, v: unknown): string {
  if (typeof v !== "number") return String(v ?? "");
  if (field.unit === "percent") return String(v / 100);
  if (field.unit === "usd") return String(v / 1_000_000);
  return String(v);
}

/** What was typed, as it's stored (or the raw text, which the check will refuse). */
function fromInput(field: Field, text: string): unknown {
  const n = Number(text.replace(/[,\s٬]/g, ""));
  if (text.trim() === "" || !Number.isFinite(n)) return text;
  if (field.unit === "percent") return Math.round(n * 100);
  if (field.unit === "usd") return Math.round(n * 1_000_000);
  return n;
}

function shown(field: Field | undefined, v: unknown): string {
  if (!field) return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "number") return show(field, v) + (field.unit !== "percent" && field.unit !== "usd" && SUFFIX[field.unit] ? ` ${SUFFIX[field.unit]}` : "");
  const s = String(v ?? "");
  return s.length > 40 ? `${s.slice(0, 40)}…` : s || "(empty)";
}

export default function SettingsTab({ initialGroup }: { initialGroup?: Group } = {}) {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [group, setGroup] = useState<Group | "all">(initialGroup ?? "shares");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Loaded) => setData(d))
      .catch(() => setNote("Couldn't load the settings"));
  }, []);
  useEffect(load, [load]);

  // The draft checked as a whole, as the server will.
  const checked = useMemo(() => (data ? applyChange(data.settings, draft) : null), [data, draft]);
  const errors = { ...(checked && "errors" in checked ? checked.errors : {}), ...serverErrors };
  // The bars show what's typed, even before it's valid (a split at 95% shows as 95%).
  const preview = useMemo(
    () =>
      data
        ? Object.entries(draft).reduce<AppSettings>((s, [p, v]) => (typeof v === typeof getPath(s, p) ? setPath(s, p, v) : s), data.settings)
        : undefined,
    [data, draft]
  );
  const dirty = Object.keys(draft).filter((p) => data && getPath(data.settings, p) !== draft[p]);

  function change(field: Field, raw: unknown, text?: string) {
    setServerErrors({});
    setNote(null);
    setDraft((d) => ({ ...d, [field.path]: raw }));
    if (text !== undefined) setTexts((t) => ({ ...t, [field.path]: text }));
  }

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const patch = Object.fromEntries(dirty.map((p) => [p, draft[p]]));
      const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patch }) });
      const d = (await res.json()) as { error?: string; errors?: Record<string, string> };
      if (!res.ok) {
        setServerErrors(d.errors ?? {});
        throw new Error(d.error ?? "Couldn't save");
      }
      setDraft({});
      setTexts({});
      setNote(`Saved ${dirty.length} setting${dirty.length === 1 ? "" : "s"}. Every page uses them within a few seconds.`);
      load();
      // The layout hands the public settings to the pages: read them again.
      router.refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function reset(path: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/settings?path=${encodeURIComponent(path)}`, { method: "DELETE" });
      const d = (await res.json()) as { error?: string; errors?: Record<string, string> };
      if (!res.ok) throw new Error(Object.values(d.errors ?? {})[0] ?? d.error ?? "Couldn't reset");
      setDraft((x) => {
        const { [path]: _gone, ...rest } = x;
        void _gone;
        return rest;
      });
      load();
      router.refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't reset");
    } finally {
      setBusy(false);
    }
  }

  if (!data || !preview) return <p className="text-sm text-muted">{note ?? "Loading…"}</p>;

  const needle = q.trim().toLowerCase();
  const fields = FIELDS.filter((f) =>
    needle ? `${f.en} ${f.fa} ${f.help ?? ""} ${f.path}`.toLowerCase().includes(needle) : group === "all" || f.group === group
  );
  const groups = needle ? GROUPS.filter((g) => fields.some((f) => f.group === g.id)) : GROUPS.filter((g) => group === "all" || g.id === group);

  return (
    <div className="flex flex-col gap-4 pb-24">
      <p className="text-sm text-muted">
        Everything the site runs on. Changes are checked as a whole (shares must make 100%) and logged. Shares apply to new views — what was
        already earned stays as it was.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {[{ id: "all" as const, en: "All" }, ...GROUPS].map((g) => {
          const count = g.id === "all" ? dirty.length : dirty.filter((p) => FIELD_BY_PATH.get(p)?.group === g.id).length;
          const bad = Object.keys(errors).some((p) => g.id === "all" || FIELD_BY_PATH.get(p)?.group === g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setGroup(g.id);
                setQ("");
              }}
              className={`rounded-full px-3 py-1.5 text-sm ${group === g.id && !needle ? "bg-brand text-white" : "border border-border text-muted hover:text-foreground"}`}
            >
              {g.en}
              {count > 0 && <span className="ms-1.5 rounded-full bg-drums/30 px-1.5 text-[11px]">{count}</span>}
              {bad && <span className="ms-1 text-danger">•</span>}
            </button>
          );
        })}
        <label className="relative ms-auto">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a setting" className="input" style={{ paddingInlineStart: "2rem" }} />
        </label>
      </div>

      {groups.map((g) => (
        <section key={g.id} className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="font-semibold">
            {g.en} <span className="text-sm font-normal text-muted">· {g.fa}</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted">{g.help}</p>
          {g.id === "shares" && <SharesPreview s={preview} />}
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {fields
              .filter((f) => f.group === g.id)
              .map((f) => (
                <FieldRow
                  key={f.path}
                  field={f}
                  value={f.path in draft ? draft[f.path] : getPath(data.settings, f.path)}
                  text={texts[f.path]}
                  error={errors[f.path]}
                  changed={data.changed.includes(f.path)}
                  edited={dirty.includes(f.path)}
                  onChange={change}
                  onReset={() => reset(f.path)}
                  busy={busy}
                />
              ))}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <History className="h-4 w-4" /> Changes
        </h3>
        {data.log.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing changed yet: everything is at its default.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {data.log.slice(0, 50).map((c) => {
              const field = FIELD_BY_PATH.get(c.key);
              return (
                <li key={c.id} className="flex flex-wrap gap-x-2">
                  <span className="text-muted tabular-nums">{new Date(c.changed_at).toLocaleString()}</span>
                  <span className="font-medium">{field?.en ?? c.key}</span>
                  <span className="text-muted">
                    {shown(field, c.old_value)} → <span className="text-foreground">{shown(field, c.new_value)}</span>
                  </span>
                  <span className="text-muted">· {c.by ?? "someone"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(dirty.length > 0 || note) && (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3 shadow-2xl sm:bottom-6">
          <span className="flex-1 text-sm">
            {note ?? `${dirty.length} unsaved change${dirty.length === 1 ? "" : "s"}`}
            {Object.keys(errors).length > 0 && <span className="block text-xs text-danger">{Object.values(errors)[0]}</span>}
          </span>
          {dirty.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft({});
                  setTexts({});
                  setServerErrors({});
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm"
              >
                <X className="h-4 w-4" /> Discard
              </button>
              <button
                type="button"
                disabled={busy || Object.keys(errors).length > 0}
                onClick={save}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </button>
            </>
          )}
          {!dirty.length && note && (
            <button type="button" onClick={() => setNote(null)} aria-label="Close" className="text-muted">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  field,
  value,
  text,
  error,
  changed,
  edited,
  onChange,
  onReset,
  busy,
}: {
  field: Field;
  value: unknown;
  text: string | undefined;
  error: string | undefined;
  changed: boolean;
  edited: boolean;
  onChange: (f: Field, raw: unknown, text?: string) => void;
  onReset: () => void;
  busy: boolean;
}) {
  const def = getPath(DEFAULTS, field.path);
  const id = `setting-${field.path}`;
  return (
    <div className={`rounded-xl border p-3 ${error ? "border-danger/60" : edited ? "border-drums/60" : "border-border"}`}>
      <div className="flex items-start gap-2">
        <label htmlFor={id} className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{field.en}</span>
          <span className="block text-xs text-muted" dir="rtl">
            {field.fa}
          </span>
        </label>
        {changed && !edited && (
          <button type="button" disabled={busy} onClick={onReset} title="Back to the default" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" /> Default
          </button>
        )}
      </div>
      <div className="mt-2">
        {field.unit === "switch" ? (
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={value === true}
            onClick={() => onChange(field, !(value === true))}
            className={`relative h-6 w-11 rounded-full transition ${value === true ? "bg-success" : "bg-surface-raised"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value === true ? "start-[1.4rem]" : "start-0.5"}`} />
          </button>
        ) : field.unit === "text" ? (
          <textarea
            id={id}
            value={String(value ?? "")}
            onChange={(e) => onChange(field, e.target.value)}
            rows={3}
            maxLength={field.max}
            className="input w-full"
            dir={field.path.endsWith(".fa") ? "rtl" : "auto"}
          />
        ) : (
          <div className="flex items-center gap-2">
            {field.unit === "usd" && <span className="text-sm text-muted">$</span>}
            <input
              id={id}
              inputMode="decimal"
              value={text ?? toInput(field, value)}
              onChange={(e) => onChange(field, fromInput(field, e.target.value), e.target.value)}
              className="input w-36 tabular-nums"
              dir="ltr"
            />
            {field.unit !== "usd" && SUFFIX[field.unit] && <span className="text-sm text-muted">{SUFFIX[field.unit]}</span>}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      <p className="mt-1 text-xs text-muted">
        {field.help && <span>{field.help} </span>}
        <span className="opacity-70">Default: {shown(field, def)}</span>
      </p>
    </div>
  );
}

/** The shares as bars, as they'll be paid: uploaders and miners out of Remixt's part. */
function SharesPreview({ s }: { s: AppSettings }) {
  const rows: { name: string; parts: { label: string; bp: number; color: string }[] }[] = [
    {
      name: "A remix",
      parts: [
        { label: "Remixt", bp: s.shares.remix.platform - s.shares.uploader - s.shares.miner, color: "var(--muted)" },
        { label: "Uploaders", bp: s.shares.uploader, color: "var(--beat)" },
        { label: "Miners", bp: s.shares.miner, color: "var(--drums)" },
        { label: "Artists", bp: s.shares.remix.artists, color: "var(--vocals)" },
        { label: "Remixers", bp: s.shares.remix.remixers, color: "var(--brand)" },
      ],
    },
    {
      name: "A song on the radio",
      parts: [
        { label: "Remixt", bp: s.shares.song.platform + s.shares.song.remixers - s.shares.uploader - s.shares.miner, color: "var(--muted)" },
        { label: "Uploader", bp: s.shares.uploader, color: "var(--beat)" },
        { label: "Miner", bp: s.shares.miner, color: "var(--drums)" },
        { label: "Artist", bp: s.shares.song.artists, color: "var(--vocals)" },
      ],
    },
  ];
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {rows.map((r) => {
        const total = r.parts.reduce((sum, p) => sum + p.bp, 0);
        return (
          <div key={r.name} className="rounded-xl bg-background/50 p-3">
            <p className="flex justify-between text-xs">
              <span className="font-medium">{r.name}</span>
              <span className={total === 10_000 ? "text-muted" : "font-semibold text-danger"}>{total / 100}%</span>
            </p>
            <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-surface-raised">
              {r.parts.map((p) => (
                <span key={p.label} style={{ width: `${Math.max(0, p.bp) / 100}%`, background: p.color }} />
              ))}
            </div>
            <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
              {r.parts
                .filter((p) => p.bp !== 0)
                .map((p) => (
                  <span key={p.label}>
                    {p.label} {p.bp / 100}%
                  </span>
                ))}
            </p>
          </div>
        );
      })}
    </div>
  );
}
