"use client";

// Admin → Ads & earnings, at the top: setting ads up, one step at a time.
// Each step is ticked from the live settings and what's waiting, and its
// button opens the exact place to do it. Folds away once everything's done.

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronDown, Circle, ListChecks } from "lucide-react";
import { adSetupSteps, setupProgress, type SetupFacts, type SetupSettings, type SetupStep } from "@/lib/monetize/adSetup";
import type { Group } from "@/lib/settings/registry";

export default function AdSetupGuide({
  settings,
  facts,
  onOpenSettings,
  onOpenTab,
}: {
  settings: SetupSettings;
  facts: SetupFacts;
  onOpenSettings?: (g?: Group) => void;
  onOpenTab?: (t: "house") => void;
}) {
  const steps = adSetupSteps(settings, facts);
  const p = setupProgress(steps);
  const [open, setOpen] = useState(!p.ready);
  const firstTodo = steps.find((s) => !s.done && !s.optional)?.id;

  const go = (s: SetupStep) => {
    if ("settings" in s.go) onOpenSettings?.(s.go.settings);
    else if ("tab" in s.go && s.go.tab === "house") onOpenTab?.("house");
    else if ("tab" in s.go) document.getElementById("ad-review-queue")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 via-surface to-surface p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 text-start" aria-expanded={open}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${p.ready ? "bg-success/20 text-success" : "bg-brand/20 text-brand-strong"}`}>
          <ListChecks className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{p.ready ? "Ads are set up and earning" : "Set up ads, step by step"}</span>
          <span className="block text-xs text-muted">
            {p.done} of {p.of} done{p.ready ? "" : " — do them in order; each button opens the right place"}
          </span>
        </span>
        <span className="hidden h-2 w-28 overflow-hidden rounded-full bg-surface-raised sm:block" aria-hidden>
          <span className={`block h-full ${p.ready ? "bg-success" : "bg-brand"}`} style={{ width: `${(p.done / p.of) * 100}%` }} />
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ol className="mt-4 flex flex-col gap-2">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${s.id === firstTodo ? "border-brand/60 bg-brand/5" : "border-border bg-surface/60"}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  s.done ? "bg-success text-white" : s.id === firstTodo ? "bg-brand text-white" : "bg-surface-raised text-muted"
                }`}
              >
                {s.done ? <Check className="h-4 w-4" /> : s.optional ? <Circle className="h-3 w-3" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {s.en}
                  {s.optional && <span className="ms-2 rounded bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-muted">optional</span>}
                </span>
                <span className="block text-xs text-muted">{s.help}</span>
              </span>
              {"href" in s.go ? (
                <Link href={s.go.href} target="_blank" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover">
                  {s.goLabel}
                </Link>
              ) : (
                (!s.done || "settings" in s.go) && (
                  <button
                    type="button"
                    onClick={() => go(s)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${s.done ? "border border-border hover:bg-surface-hover" : "bg-brand text-white hover:bg-brand-strong"}`}
                  >
                    {s.goLabel}
                  </button>
                )
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
