"use client";

// Admin → Feedback & problems: what people told us (answer them, mark done),
// and where their browsers had trouble without them saying anything —
// errors, rage clicks, stuck pages, server failures, slow pages — grouped,
// ranked by how many people, with who and where for each.

import { Fragment, useCallback, useEffect, useState } from "react";
import { FEEDBACK_TEXT, PROBLEM_KINDS, PROBLEM_TEXT, type FeedbackKind, type ProblemKind } from "@/lib/feedback";
import type { feedbackReport, problemHits } from "@/lib/feedbackStore";

type Report = Awaited<ReturnType<typeof feedbackReport>>;
type Hit = Awaited<ReturnType<typeof problemHits>>[number];

const when = (s: string) => new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const KIND_COLOR: Record<ProblemKind, string> = {
  error: "bg-danger/15 text-danger",
  rage: "bg-drums/15 text-drums",
  stuck: "bg-vocals/15 text-vocals",
  api: "bg-danger/15 text-danger",
  slow: "bg-beat/15 text-beat",
};

type Problem = Report["problems"][number];
type Feedback = Report["feedback"][number];
type SortKey = "kind" | "message" | "path" | "people" | "week" | "count" | "last";

const COLUMNS: { key: SortKey; label: string; num?: boolean; value: (p: Problem) => string | number }[] = [
  { key: "kind", label: "Kind", value: (p) => p.kind },
  { key: "message", label: "Problem", value: (p) => p.message },
  { key: "path", label: "Page", value: (p) => p.path },
  { key: "people", label: "People (members)", num: true, value: (p) => p.people },
  { key: "week", label: "This week", num: true, value: (p) => p.week },
  { key: "count", label: "Ever", num: true, value: (p) => p.count },
  { key: "last", label: "Last seen", num: true, value: (p) => new Date(p.last_seen).getTime() },
];

const today = () => new Date().toISOString().slice(0, 10);

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The problems as a brief a coding agent can act on: what each is, where,
 * how many people, and the stack the browser sent. No names or emails —
 * the agent needs the bug, not who hit it.
 */
function problemsForAgent(problems: Problem[], scope: string, feedback: Feedback[] = []): string {
  const lines = [
    `# Remixt production problems (${scope})`,
    "",
    `Exported ${new Date().toISOString()} from Admin → Feedback & problems. Reported automatically by visitors' browsers (lib/client/problems.ts); paths are grouped (<id>).`,
    "",
    "Please find the cause of each problem in the codebase (web/), fix it, and say which ones you couldn't reproduce or explain. Most people first.",
    "",
  ];
  problems.forEach((p, i) => {
    lines.push(
      `## ${i + 1}. [${PROBLEM_TEXT[p.kind]}] ${p.message}`,
      "",
      `- Page: \`${p.path}\``,
      `- People: ${p.people} (${p.members} signed in) · ${p.week} times this week · ${p.count} ever`,
      `- First seen ${p.first_seen} · last seen ${p.last_seen}${p.fixed_at ? ` · marked fixed ${p.fixed_at}` : ""}`
    );
    if (p.sample) lines.push("", "```", p.sample, "```");
    lines.push("");
  });
  const said = feedback.filter((f) => f.kind === "problem" || f.kind === "confusing" || f.recent?.length);
  if (said.length) {
    lines.push("# What people told us (bug reports)", "");
    for (const f of said) {
      lines.push(`- ${f.at} · \`${f.path ?? "?"}\` · ${f.device ?? ""}: ${f.message.replace(/\s+/g, " ")}`);
      for (const r of f.recent ?? []) lines.push(`  - just before: [${r.kind}] ${r.message} · ${r.path}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function post(body: unknown) {
  const res = await fetch("/api/admin/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Failed");
}

export default function FeedbackTab({ onOpenUser }: { onOpenUser?: (id: string) => void }) {
  const [data, setData] = useState<Report | null>(null);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ProblemKind | "all">("all");
  const [showFixed, setShowFixed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fbFilter, setFbFilter] = useState<"open" | "all">("open");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "people", desc: true });
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2500);
    } catch {
      download(`remixt-problems-${today()}.md`, text, "text/markdown");
    }
  };

  const load = useCallback(() => {
    fetch(`/api/admin/feedback?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("Couldn't load"));
  }, [days]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/admin/feedback?problem=${encodeURIComponent(open)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { hits: Hit[] }) => setHits(d.hits))
      .catch(() => setHits([]));
  }, [open]);

  const act = async (body: unknown) => {
    setError(null);
    try {
      await post(body);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  if (!data) return <p className="text-sm text-muted">{error ?? "Loading…"}</p>;
  const problems = data.problems.filter((p) => (kind === "all" || p.kind === kind) && (showFixed || !p.fixed_at));
  const totals = PROBLEM_KINDS.map((k) => ({
    k,
    people: data.problems.filter((p) => p.kind === k && !p.fixed_at).reduce((s, p) => s + p.people, 0),
    hits: data.daily.filter((d) => d.kind === k).reduce((s, d) => s + d.hits, 0),
  }));
  const feedback = data.feedback.filter((f) => fbFilter === "all" || f.status !== "done");
  const sorted = [...problems].sort((a, b) => {
    const col = COLUMNS.find((c) => c.key === sort.key)!;
    const x = col.value(a);
    const y = col.value(b);
    const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return sort.desc ? -d : d;
  });
  const scope = `last ${days === 1 ? "24 h" : `${days} days`}, ${kind === "all" ? "all kinds" : PROBLEM_TEXT[kind]}${showFixed ? ", fixed included" : ", open only"}`;

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Last</span>
        {[1, 7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-lg px-2.5 py-1 ${days === d ? "bg-surface-raised font-semibold" : "text-muted hover:text-foreground"}`}>
            {d === 1 ? "24 h" : `${d} days`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Box label="New feedback" value={data.counts.newFeedback} detail={`${data.counts.feedback} in all`} highlight={data.counts.newFeedback > 0} />
        {totals.map((t) => (
          <Box key={t.k} label={PROBLEM_TEXT[t.k]} value={t.people} detail={`people · ${t.hits} times`} highlight={t.people > 0 && (t.k === "error" || t.k === "api")} />
        ))}
      </div>

      {data.byPage.length > 0 && (
        <section>
          <h3 className="font-semibold">Pages where people have trouble</h3>
          <ul className="mt-2 grid gap-1 text-sm">
            {data.byPage.map((p) => {
              const top = data.byPage[0].people || 1;
              return (
                <li key={p.path} className="flex items-center gap-3">
                  <span className="w-48 shrink-0 truncate font-mono text-xs">{p.path}</span>
                  <span className="h-2 rounded-full bg-danger/60" style={{ width: `${Math.max(4, (p.people / top) * 50)}%` }} />
                  <span className="text-xs text-muted tabular-nums">
                    {p.people} people · {p.hits}×
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Feedback</h3>
          <div className="flex gap-1 text-xs">
            {(["open", "all"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFbFilter(f)} className={`rounded-lg px-2 py-1 ${fbFilter === f ? "bg-surface-raised font-semibold" : "text-muted"}`}>
                {f === "open" ? "Not done" : "All"}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {feedback.map((f) => (
            <li key={f.id} className={`rounded-xl border p-3 text-sm ${f.status === "new" ? "border-brand/50 bg-brand/5" : "border-border bg-surface"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="text-foreground">
                  {FEEDBACK_TEXT[f.kind as FeedbackKind]?.emoji} {FEEDBACK_TEXT[f.kind as FeedbackKind]?.en ?? f.kind}
                </span>
                <span>· {when(f.at)}</span>
                {f.user_id ? (
                  <button type="button" onClick={() => onOpenUser?.(f.user_id!)} className="text-brand-strong hover:underline">
                    · {f.artist_name ?? "member"} ({f.user_email})
                  </button>
                ) : (
                  <span>· guest{f.email ? ` (${f.email})` : ""}</span>
                )}
                {f.path && <span className="font-mono">· {f.path}</span>}
                {f.device && <span>· {f.device}</span>}
                <span className="ms-auto rounded bg-surface-raised px-1.5 py-0.5">{f.status}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words">{f.message}</p>
              {f.recent?.length > 0 && (
                <details className="mt-1.5 text-xs">
                  <summary className="cursor-pointer text-muted">{f.recent.length} problems their browser had just before</summary>
                  <ul className="mt-1 space-y-0.5 font-mono">
                    {f.recent.map((r, i) => (
                      <li key={i}>
                        [{r.kind}] {r.message} · {r.path}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {f.answer && <p className="mt-1.5 rounded-lg bg-surface-raised p-2 text-xs">You answered: {f.answer}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {f.status === "new" && (
                  <button type="button" onClick={() => act({ action: "status", id: f.id, status: "seen" })} className="text-xs hover:underline">
                    Mark seen
                  </button>
                )}
                {f.status !== "done" ? (
                  <button type="button" onClick={() => act({ action: "status", id: f.id, status: "done" })} className="text-xs hover:underline">
                    Done
                  </button>
                ) : (
                  <button type="button" onClick={() => act({ action: "status", id: f.id, status: "seen" })} className="text-xs text-muted hover:underline">
                    Reopen
                  </button>
                )}
                {f.user_id && !f.answer && (
                  <form
                    className="flex min-w-0 flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const answer = answers[f.id]?.trim();
                      if (answer) void act({ action: "answer", id: f.id, answer });
                    }}
                  >
                    <input
                      value={answers[f.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.id]: e.target.value }))}
                      placeholder="Answer (goes to their notifications)"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                    />
                    <button type="submit" className="rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white">
                      Send
                    </button>
                  </form>
                )}
                {!f.user_id && f.email && (
                  <a href={`mailto:${f.email}`} className="text-xs text-brand-strong hover:underline">
                    Email them
                  </a>
                )}
              </div>
            </li>
          ))}
          {feedback.length === 0 && <li className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">Nothing waiting.</li>}
        </ul>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Problems people ran into</h3>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {(["all", ...PROBLEM_KINDS] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg px-2 py-1 ${kind === k ? "bg-surface-raised font-semibold" : "text-muted"}`}>
                {k === "all" ? "All" : PROBLEM_TEXT[k]}
              </button>
            ))}
            <label className="ms-2 flex items-center gap-1 text-muted">
              <input type="checkbox" checked={showFixed} onChange={(e) => setShowFixed(e.target.checked)} /> fixed too
            </label>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          Sent by visitors&apos; browsers on their own. Ranked by how many people. &quot;Fixed&quot; hides one until it happens again (then it comes back). Click a row for the
          stack and who; click a column to sort.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Export what&apos;s shown ({sorted.length}):</span>
          <button type="button" onClick={() => void copy(problemsForAgent(sorted, scope, feedback), "all")} className="rounded-lg bg-brand px-2.5 py-1 font-semibold text-white">
            {copied === "all" ? "Copied — paste it to the agent" : "Copy for AI agent"}
          </button>
          <button type="button" onClick={() => download(`remixt-problems-${today()}.md`, problemsForAgent(sorted, scope, feedback), "text/markdown")} className="rounded-lg border border-border px-2.5 py-1 hover:bg-surface-hover">
            Download .md
          </button>
          <button type="button" onClick={() => download(`remixt-problems-${today()}.json`, JSON.stringify({ exported: new Date().toISOString(), scope, problems: sorted, feedback }, null, 2), "application/json")} className="rounded-lg border border-border px-2.5 py-1 hover:bg-surface-hover">
            Download .json
          </button>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-raised text-start text-xs text-muted">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={`px-3 py-2 font-medium ${c.num ? "text-end" : "text-start"}`}>
                    <button type="button" onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))} className="hover:text-foreground">
                      {c.label}
                      {sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <Fragment key={p.key}>
                  <tr
                    onClick={() => {
                      setHits(null);
                      setOpen(open === p.key ? null : p.key);
                    }}
                    className={`cursor-pointer border-t border-border align-top hover:bg-surface-hover ${p.fixed_at ? "opacity-60" : ""} ${open === p.key ? "bg-surface-hover" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] ${KIND_COLOR[p.kind]}`}>{PROBLEM_TEXT[p.kind]}</span>
                    </td>
                    <td className="max-w-[28rem] break-words px-3 py-2 font-medium">{p.message}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.path}</td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {p.people} <span className="text-xs text-muted">({p.members})</span>
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">{p.week}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{p.count}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-end text-xs text-muted">{when(p.last_seen)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-end">
                      <button
                        type="button"
                        title="Copy this problem for an AI agent"
                        onClick={(e) => {
                          e.stopPropagation();
                          void copy(problemsForAgent([p], `${PROBLEM_TEXT[p.kind]} on ${p.path}`), p.key);
                        }}
                        className="rounded-lg border border-border px-2 py-0.5 text-xs hover:bg-surface-raised"
                      >
                        {copied === p.key ? "Copied" : "Copy"}
                      </button>
                    </td>
                  </tr>
                  {open === p.key && (
                    <tr className="border-t border-border bg-background/40">
                      <td colSpan={COLUMNS.length + 1} className="px-3 py-2 text-xs">
                        {p.sample && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-2 font-mono">{p.sample}</pre>}
                        <p className="mt-2 text-muted">First seen {when(p.first_seen)}. Who, lately:</p>
                        <ul className="mt-1 space-y-0.5">
                          {(hits ?? []).map((h, i) => (
                            <li key={i} className="flex flex-wrap justify-between gap-2">
                              <span>
                                {h.user_id ? (
                                  <button type="button" onClick={() => onOpenUser?.(h.user_id!)} className="text-brand-strong hover:underline">
                                    {h.artist_name ?? "member"}
                                  </button>
                                ) : (
                                  <span className="text-muted">guest {h.visitor.slice(0, 6)}</span>
                                )}{" "}
                                · <span className="font-mono">{h.path}</span> · {h.device}
                              </span>
                              <span className="text-muted">{when(h.at)}</span>
                            </li>
                          ))}
                          {hits === null && <li className="text-muted">Loading…</li>}
                        </ul>
                        <button type="button" onClick={() => act({ action: "fixed", key: p.key, fixed: !p.fixed_at })} className="mt-2 rounded-lg border border-border px-2.5 py-1 hover:bg-surface-hover">
                          {p.fixed_at ? "Not fixed after all" : "Mark fixed"}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-3 py-3 text-muted">
                    No problems reported in this period. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Box({ label, value, detail, highlight }: { label: string; value: number; detail?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-danger/40 bg-danger/5" : "border-border bg-surface"}`}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
      {detail && <p className="text-[11px] text-muted">{detail}</p>}
    </div>
  );
}
