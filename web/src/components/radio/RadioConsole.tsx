"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  Download,
  Hand,
  ListMusic,
  ListPlus,
  Loader2,
  Play,
  Plus,
  Radio as RadioIcon,
  Settings2,
  Share2,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import { clock, useRadio } from "@/lib/client/radioClient";
import type { RadioReport, RadioSettings } from "@/lib/radio";
import type { RadioItem } from "@/lib/radioPick";
import { ItemRow, LiveDot, Progress, RadioArt, SearchBox, SourceChip, useStationSearch, VoteBoard } from "./RadioBits";
import { ShareStation } from "./RadioStation";

// A station's console, for its DJ (the owner) and the admins: what's on and
// the queue, requests to accept or turn down, the playlist, the settings,
// and the reports — what played, who listened, what was asked for.

type Tab = "air" | "requests" | "playlist" | "settings" | "reports" | "share";
const TABS: { id: Tab; label: string; icon: typeof RadioIcon }[] = [
  { id: "air", label: "On air", icon: RadioIcon },
  { id: "requests", label: "Requests", icon: Hand },
  { id: "playlist", label: "Playlist", icon: ListMusic },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "share", label: "Share", icon: Share2 },
];

type ConsoleData = { playlist: RadioItem[]; settings: RadioSettings; name: string; tagline: string };

function Card({ title, hint, children, action }: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-surface/80 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{title}</h2>
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function IconButton({ label, onClick, children, tone = "plain", disabled }: { label: string; onClick: () => void; children: ReactNode; tone?: "plain" | "brand" | "danger"; disabled?: boolean }) {
  const cls = tone === "brand" ? "bg-brand text-white hover:bg-brand-strong" : tone === "danger" ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-surface-raised hover:text-foreground";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`flex size-10 items-center justify-center rounded-lg disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-raised/60 p-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-black tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Search the catalogue, with buttons per result. */
function Finder({ slug, actions }: { slug: string; actions: (item: RadioItem) => ReactNode }) {
  const [q, setQ] = useState("");
  const { items, busy } = useStationSearch(slug, q);
  return (
    <div className="flex flex-col gap-2">
      <SearchBox value={q} onChange={setQ} placeholder="Search songs and remixes to add" />
      <ul className="max-h-96 overflow-y-auto overscroll-contain rounded-xl border border-border/60 p-1">
        {items === null || (busy && !items.length) ? (
          <li className="flex items-center gap-2 p-3 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Searching…
          </li>
        ) : items.length === 0 ? (
          <li className="p-3 text-sm text-muted">Nothing found.</li>
        ) : (
          items.map((item) => (
            <ItemRow key={`${item.kind}:${item.id}`} item={item} meta={`${item.kind === "remix" ? "Remix" : "Song"} · ${clock(item.duration)}`}>
              {actions(item)}
            </ItemRow>
          ))
        )}
      </ul>
    </div>
  );
}

function Bars({ data }: { data: RadioReport["perDay"] }) {
  const top = Math.max(1, ...data.map((d) => d.plays));
  if (!data.length) return <p className="text-sm text-muted">Nothing played in this period.</p>;
  return (
    <div className="flex h-40 items-end gap-1" role="img" aria-label={`Songs played per day: ${data.map((d) => `${d.day} ${d.plays}`).join(", ")}`}>
      {data.map((d) => (
        <div key={d.day} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.day}: ${d.plays} songs, ${d.listeners} listeners, peak ${d.peak} at once`}>
          <div className="rounded-t-md bg-gradient-to-t from-brand to-vocals transition-opacity group-hover:opacity-80" style={{ height: `${(d.plays / top) * 100}%` }} />
          <span className="mt-1 truncate text-center text-[10px] text-muted">{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export default function RadioConsole({ slug }: { slug: string }) {
  const router = useRouter();
  const radio = useRadio(slug, { heartbeat: false, warm: false });
  const { feed } = radio;
  const [tab, setTab] = useState<Tab>("air");
  const [data, setData] = useState<ConsoleData | null>(null);
  const [report, setReport] = useState<RadioReport | null>(null);
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [denied, setDenied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/radio/${slug}/console`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setDenied(body.error ?? "You can't run this station");
    setData(body as ConsoleData);
  }, [slug]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the console's data, fetched on arrival
    void load();
  }, [load]);
  useEffect(() => {
    if (tab !== "reports") return;
    let alive = true;
    fetch(`/api/radio/${slug}/report?days=${days}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((r) => alive && setReport(r as RadioReport))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tab, days, slug]);

  const act = async (body: Record<string, unknown>, done?: string) => {
    const key = JSON.stringify(body);
    setBusy(key);
    setNote(null);
    try {
      const res = await fetch(`/api/radio/${slug}/console`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r.error ?? "Couldn't do that");
      if (done) setNote({ tone: "good", text: done });
      await Promise.all([load(), radio.refresh()]);
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : "Couldn't do that" });
    } finally {
      setBusy(null);
    }
  };

  if (denied) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-6 text-center">
        <p className="font-semibold">{denied}</p>
        <Link href={`/radio/${slug}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white">
          Listen instead
        </Link>
      </div>
    );
  }
  if (!feed || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  const now = feed.now;
  const inPlaylist = new Set(data.playlist.map((p) => `${p.kind}:${p.id}`));
  const pending = feed.requests.filter((r) => r.status === "pending");
  const accepted = feed.requests.filter((r) => r.status === "accepted");
  const s = data.settings;

  const addButtons = (item: RadioItem) => (
    <>
      <button
        type="button"
        onClick={() => void act({ action: "queue", kind: item.kind, id: item.id, first: true }, `“${item.title}” plays next`)}
        className="flex min-h-9 items-center gap-1 rounded-lg bg-brand px-2.5 text-xs font-bold text-white hover:bg-brand-strong"
      >
        <Play className="size-3.5" /> Next
      </button>
      <IconButton label="Add to the end of the queue" onClick={() => void act({ action: "queue", kind: item.kind, id: item.id }, `“${item.title}” queued`)}>
        <ListPlus className="size-4" />
      </IconButton>
      {!inPlaylist.has(`${item.kind}:${item.id}`) && (
        <IconButton label="Add to the playlist" onClick={() => void act({ action: "playlist-add", kind: item.kind, id: item.id }, `“${item.title}” added to the playlist`)}>
          <Plus className="size-4" />
        </IconButton>
      )}
    </>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link href={`/radio/${slug}`} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-hover">
          <ArrowLeft className="size-4" /> Listen
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Console</p>
          <h1 className="truncate text-2xl font-black">{data.name}</h1>
        </div>
        <span className="ml-auto flex items-center gap-3 text-sm text-muted">
          <LiveDot className="text-danger" /> {feed.listeners} listening
        </span>
      </header>

      <nav aria-label="Console sections" className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition ${tab === t.id ? "bg-foreground text-background" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}
          >
            <t.icon className="size-4" /> {t.label}
            {t.id === "requests" && pending.length > 0 && <span className="rounded-full bg-vocals px-1.5 text-[11px] font-black text-white">{pending.length}</span>}
          </button>
        ))}
      </nav>

      {note && (
        <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${note.tone === "good" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
          {note.tone === "good" ? <Check className="size-4" /> : <X className="size-4" />} {note.text}
        </p>
      )}

      {tab === "air" && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-black p-4 text-white sm:p-5">
              <div className="absolute inset-0 -z-10" aria-hidden>
                <RadioArt item={now} className="size-full scale-125 opacity-50 blur-3xl" />
                <div className="absolute inset-0 bg-black/55" />
              </div>
              <div className="flex items-center gap-4">
                <RadioArt item={now} className="size-24 rounded-2xl shadow-xl sm:size-28" />
                <div className="min-w-0 flex-1">
                  {now && <SourceChip row={now} className="mb-2" />}
                  <p className="truncate text-xl font-black">{now?.title ?? "Nothing on air"}</p>
                  <p className="truncate text-sm text-white/70">{now?.artist}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Progress row={now} position={radio.position} />
                </div>
                <button
                  type="button"
                  disabled={!now || busy !== null}
                  onClick={() => void act({ action: "skip" }, "Skipped — the next song is on")}
                  className="flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-black text-black disabled:opacity-60"
                >
                  <SkipForward className="size-4" /> Skip
                </button>
              </div>
            </section>
            <Card title="Queue" hint="Songs you queue play before the vote, requests and the playlist.">
              {feed.upNext.length ? (
                <ul>
                  {feed.upNext.map((r, i) => (
                    <ItemRow key={r.rowId} item={r} meta={clock(r.duration)}>
                      <IconButton label="Earlier" disabled={i === 0} onClick={() => void act({ action: "move", rowId: r.rowId, by: -1 })}>
                        <ArrowUp className="size-4" />
                      </IconButton>
                      <IconButton label="Later" disabled={i === feed.upNext.length - 1} onClick={() => void act({ action: "move", rowId: r.rowId, by: 1 })}>
                        <ArrowDown className="size-4" />
                      </IconButton>
                      <IconButton label="Take out of the queue" tone="danger" onClick={() => void act({ action: "unqueue", rowId: r.rowId })}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </ItemRow>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Empty: {s.voting ? "the vote decides what's next." : accepted.length ? "the most requested song plays next." : "the playlist plays on."}</p>
              )}
            </Card>
            {s.voting && feed.vote.choices.length > 0 && (
              <Card title="The vote" hint="Listeners are choosing the next song (unless you queue one).">
                <VoteBoard feed={feed} serverNow={radio.serverNow} compact />
              </Card>
            )}
          </div>
          <Card title="Add a song" hint="Play it next, queue it, or keep it in the playlist.">
            <Finder slug={slug} actions={addButtons} />
          </Card>
        </div>
      )}

      {tab === "requests" && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Card
            title={`Waiting for you (${pending.length})`}
            hint={s.requests === "review" ? "Say yes and it joins the requests; the most asked for play first." : "Requests go straight in — switch on “Review requests” in Settings to see them here first."}
          >
            {pending.length ? (
              <ul>
                {pending.map((r) => (
                  <ItemRow key={`${r.kind}:${r.id}`} item={r} meta={`${r.count} asked${r.names.length ? ` · ${r.names.join(", ")}` : ""}`}>
                    <IconButton label="Accept" tone="brand" onClick={() => void act({ action: "accept", kind: r.kind, id: r.id })}>
                      <Check className="size-4" />
                    </IconButton>
                    <IconButton label="Turn down" tone="danger" onClick={() => void act({ action: "reject", kind: r.kind, id: r.id })}>
                      <X className="size-4" />
                    </IconButton>
                  </ItemRow>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing waiting.</p>
            )}
          </Card>
          <Card
            title={`Accepted (${accepted.length})`}
            hint="Most asked for first. They go on the vote, or play in this order when the vote is off."
            action={
              accepted.length + pending.length > 0 ? (
                <button type="button" onClick={() => window.confirm("Turn down every request?") && void act({ action: "clear-requests" }, "Requests cleared")} className="min-h-9 rounded-lg px-2 text-xs text-danger hover:bg-danger/10">
                  Clear all
                </button>
              ) : null
            }
          >
            {accepted.length ? (
              <ul>
                {accepted.map((r) => (
                  <ItemRow key={`${r.kind}:${r.id}`} item={r} meta={`${r.count} asked${r.names.length ? ` · ${r.names.join(", ")}` : ""}`}>
                    <button type="button" onClick={() => void act({ action: "queue", kind: r.kind, id: r.id, first: true }, `“${r.title}” plays next`)} className="flex min-h-9 items-center gap-1 rounded-lg bg-brand px-2.5 text-xs font-bold text-white">
                      <Play className="size-3.5" /> Next
                    </button>
                    <IconButton label="Turn down" tone="danger" onClick={() => void act({ action: "reject", kind: r.kind, id: r.id })}>
                      <X className="size-4" />
                    </IconButton>
                  </ItemRow>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No requests yet.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "playlist" && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Card
            title={`Playlist (${data.playlist.length})`}
            hint={`Plays in this order, round and round; a song rests ${Math.min(12, Math.max(0, data.playlist.length - 1))} songs before it comes back.${s.autoFill ? " When it runs dry, the station picks from the whole library." : ""}`}
            action={
              data.playlist.length ? (
                <button type="button" onClick={() => window.confirm("Empty the playlist?") && void act({ action: "playlist-clear" }, "Playlist emptied")} className="min-h-9 rounded-lg px-2 text-xs text-danger hover:bg-danger/10">
                  Empty it
                </button>
              ) : null
            }
          >
            {data.playlist.length ? (
              <ol>
                {data.playlist.map((p, i) => (
                  <ItemRow key={`${p.kind}:${p.id}`} item={p} meta={`${i + 1} · ${clock(p.duration)}`}>
                    <IconButton label="Earlier" disabled={i === 0} onClick={() => void act({ action: "playlist-move", kind: p.kind, id: p.id, by: -1 })}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton label="Later" disabled={i === data.playlist.length - 1} onClick={() => void act({ action: "playlist-move", kind: p.kind, id: p.id, by: 1 })}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton label="Take out" tone="danger" onClick={() => void act({ action: "playlist-remove", kind: p.kind, id: p.id })}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </ItemRow>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">Empty. {s.autoFill ? "The station plays anything from the library until you add songs." : "Add songs, or switch on “play anything from the library” in Settings."}</p>
            )}
          </Card>
          <Card title="Add to the playlist">
            <Finder
              slug={slug}
              actions={(item) =>
                inPlaylist.has(`${item.kind}:${item.id}`) ? (
                  <span className="px-2 text-xs text-success">In the playlist</span>
                ) : (
                  <button type="button" onClick={() => void act({ action: "playlist-add", kind: item.kind, id: item.id })} className="flex min-h-9 items-center gap-1 rounded-lg bg-brand px-2.5 text-xs font-bold text-white">
                    <Plus className="size-3.5" /> Add
                  </button>
                )
              }
            />
          </Card>
        </div>
      )}

      {tab === "settings" && <SettingsCard data={data} busy={busy !== null} onSave={(patch) => void act({ action: "settings", ...patch }, "Saved")} onDelete={async () => {
        if (!window.confirm("Delete this station, its playlist and its reports? This can't be undone.")) return;
        const res = await fetch(`/api/radio/${slug}`, { method: "DELETE" });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) setNote({ tone: "bad", text: r.error ?? "Couldn't delete it" });
        else router.push("/radio");
      }} />}

      {tab === "reports" && (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-xl border border-border text-sm font-semibold" role="radiogroup" aria-label="Period">
              {[7, 14, 30, 90].map((d) => (
                <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={`min-h-10 px-3 ${days === d ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}>
                  {d} days
                </button>
              ))}
            </div>
            <a href={`/api/radio/${slug}/report?format=csv&days=${days}`} className="ml-auto flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover">
              <Download className="size-4" /> Every play (CSV)
            </a>
          </div>
          {!report ? (
            <div className="flex justify-center py-10 text-muted">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Tile label="Songs played" value={report.plays} hint={`${report.skips} skipped`} />
                <Tile label="Hours on air" value={report.hours} />
                <Tile label="Listening now" value={report.listenersNow} hint={`peak ${report.listenersPeak} at once`} />
                <Tile label="Listeners" value={report.uniqueListeners} hint="different people" />
                <Tile label="Votes" value={report.votes} hint={`${report.votesPerRound} per song`} />
                <Tile label="Requests" value={report.requests.total} hint={`${report.requests.played} played · ${report.requests.waiting} waiting`} />
              </div>
              <Card title="Songs per day">
                <Bars data={report.perDay} />
                <p className="mt-2 text-xs text-muted">
                  How songs were chosen:{" "}
                  {Object.entries(report.bySource)
                    .map(([k, v]) => `${{ vote: "the vote", request: "requests", dj: "the DJ", playlist: "the playlist", library: "the station" }[k] ?? k} ${v}`)
                    .join(" · ") || "—"}
                </p>
              </Card>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card title="Most played">
                  <ol>
                    {report.topPlayed.map((r) => (
                      <ItemRow key={`${r.kind}:${r.id}`} item={r} meta={`${r.plays}× · peak ${r.peak}`} />
                    ))}
                  </ol>
                </Card>
                <Card title="Most requested">
                  <ol>
                    {report.topRequested.length ? report.topRequested.map((r) => <ItemRow key={`${r.kind}:${r.id}`} item={r} meta={`${r.requests} asked`} />) : <p className="text-sm text-muted">No requests yet.</p>}
                  </ol>
                </Card>
                <Card title="Most voted for">
                  <ol>
                    {report.topVoted.length ? report.topVoted.map((r) => <ItemRow key={`${r.kind}:${r.id}`} item={r} meta={`${r.votes} votes`} />) : <p className="text-sm text-muted">No votes yet.</p>}
                  </ol>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "share" && (
        <Card title="Your station everywhere">
          <ShareStation slug={slug} />
        </Card>
      )}
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-border p-3 hover:bg-surface-hover">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-brand" : "bg-surface-raised ring-1 ring-border"}`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${on ? "left-6" : "left-1"}`} />
      </button>
    </label>
  );
}

function SettingsCard({ data, busy, onSave, onDelete }: { data: ConsoleData; busy: boolean; onSave: (patch: { name?: string; tagline?: string; settings?: Partial<RadioSettings> }) => void; onDelete: () => void }) {
  const [name, setName] = useState(data.name);
  const [tagline, setTagline] = useState(data.tagline);
  const s = data.settings;
  const set = (patch: Partial<RadioSettings>) => onSave({ settings: patch });
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card title="The station">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ name, tagline });
          }}
        >
          <label className="text-xs font-semibold text-muted" htmlFor="radio-name">
            Name
          </label>
          <input id="radio-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-base outline-none focus:border-brand sm:text-sm" />
          <label className="text-xs font-semibold text-muted" htmlFor="radio-tagline">
            Tagline
          </label>
          <input id="radio-tagline" value={tagline} onChange={(e) => setTagline(e.target.value.slice(0, 140))} className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-base outline-none focus:border-brand sm:text-sm" />
          <button type="submit" disabled={busy || !name.trim()} className="mt-1 min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60">
            Save
          </button>
        </form>
        <button type="button" onClick={onDelete} className="mt-4 flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-danger hover:bg-danger/10">
          <Trash2 className="size-4" /> Delete the station
        </button>
      </Card>
      <Card title="How it plays">
        <div className="flex flex-col gap-2">
          <Toggle label="Listeners vote on the next song" hint={`${s.choices} choices each time, from requests and the playlist.`} on={s.voting} onChange={(v) => set({ voting: v })} />
          {s.voting && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-border p-3 text-sm">
              <span className="font-semibold">Choices on the vote</span>
              <span className="flex gap-1">
                {[2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => set({ choices: n })} aria-pressed={s.choices === n} className={`size-10 rounded-lg font-bold ${s.choices === n ? "bg-brand text-white" : "bg-surface-raised hover:bg-surface-hover"}`}>
                    {n}
                  </button>
                ))}
              </span>
            </div>
          )}
          <div className="rounded-2xl border border-border p-3">
            <p className="text-sm font-semibold">Requests</p>
            <div className="mt-2 grid grid-cols-3 gap-1 text-xs font-semibold">
              {(
                [
                  ["open", "Open", "Go straight in"],
                  ["review", "Review", "You say yes first"],
                  ["off", "Off", "No requests"],
                ] as const
              ).map(([id, label, hint]) => (
                <button key={id} type="button" onClick={() => set({ requests: id })} aria-pressed={s.requests === id} className={`min-h-12 rounded-xl px-2 ${s.requests === id ? "bg-brand text-white" : "bg-surface-raised hover:bg-surface-hover"}`}>
                  {label}
                  <span className="block text-[10px] font-normal opacity-80">{hint}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-sm">
              <span>Waiting requests per listener</span>
              <input type="number" min={1} max={10} value={s.perListener} onChange={(e) => set({ perListener: Number(e.target.value) })} className="min-h-10 w-20 rounded-lg border border-border bg-surface-raised px-2 text-base sm:text-sm" />
            </div>
          </div>
          <Toggle label="Play anything from the library when the playlist runs dry" hint="Public songs and published remixes, the least recently played first." on={s.autoFill} onChange={(v) => set({ autoFill: v })} />
          <Toggle label="Songs" hint="Library songs, as uploaded." on={s.songs} onChange={(v) => set({ songs: v })} />
          <Toggle label="Remixes" hint="Published remixes." on={s.remixes} onChange={(v) => set({ remixes: v })} />
        </div>
      </Card>
    </div>
  );
}
