"use client";

// Where an ad stands, at a glance: four steps (made → checked → paid →
// showing), the one thing in the way, and the button that moves it on. The
// advertiser sees it under each ad; the owner sees the same in Admin.

import { Check, CircleAlert, Clock, Pause, Wallet, Send, Pencil, Upload, Play } from "lucide-react";
import { DELIVERY_STEPS, type Delivery, type NextAction } from "@/lib/monetize/adStatus";

const TONE: Record<Delivery["tone"], string> = {
  good: "bg-success/15 text-success border-success/30",
  wait: "bg-drums/15 text-drums border-drums/30",
  act: "bg-brand/15 text-brand-strong border-brand/30",
  bad: "bg-danger/15 text-danger border-danger/30",
  off: "bg-surface-raised text-muted border-border",
};

const ACTION: Record<Exclude<NextAction, null>, { en: string; fa: string; icon: typeof Wallet }> = {
  pay: { en: "Add money", fa: "افزودن اعتبار", icon: Wallet },
  submit: { en: "Send for review", fa: "ارسال برای بررسی", icon: Send },
  resume: { en: "Resume", fa: "ادامه", icon: Play },
  edit: { en: "Edit the ad", fa: "ویرایش تبلیغ", icon: Pencil },
  upload: { en: "Add the sound", fa: "افزودن صدا", icon: Upload },
};

/** The status as a small chip (lists, Admin). */
export function DeliveryChip({ d, lang = "en" }: { d: Delivery; lang?: "en" | "fa" }) {
  const Icon = d.tone === "good" ? Check : d.tone === "wait" ? Clock : d.tone === "off" ? Pause : CircleAlert;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE[d.tone]}`} title={lang === "fa" ? d.fa.why : d.en.why}>
      <Icon className="h-3 w-3" /> {lang === "fa" ? d.fa.label : d.en.label}
    </span>
  );
}

export default function DeliveryTracker({ d, lang = "en", onAction }: { d: Delivery; lang?: "en" | "fa"; onAction?: (a: Exclude<NextAction, null>) => void }) {
  const fa = lang === "fa";
  const running = d.state === "running";
  return (
    <div className="mt-3 rounded-2xl border border-border bg-background/40 p-3">
      <ol className="flex items-center gap-1" aria-label={fa ? "مراحل تبلیغ" : "Your ad's steps"}>
        {DELIVERY_STEPS.map((s, i) => {
          const done = i < d.step || (running && i === 3);
          const here = i === d.step && !running;
          return (
            <li key={s.en} className="flex min-w-0 flex-1 items-center gap-1">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  done ? "bg-success text-white" : here ? (d.tone === "bad" ? "bg-danger text-white" : "bg-brand text-white ring-4 ring-brand/20") : "bg-surface-raised text-muted"
                }`}
                aria-current={here ? "step" : undefined}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`truncate text-[11px] sm:inline sm:text-xs ${here ? "inline" : "hidden"} ${done || here ? "font-semibold text-foreground" : "text-muted"}`}>{fa ? s.fa : s.en}</span>
              {i < DELIVERY_STEPS.length - 1 && <span className={`mx-0.5 h-0.5 min-w-2 flex-1 rounded ${done ? "bg-success" : "bg-border"}`} />}
            </li>
          );
        })}
      </ol>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <DeliveryChip d={d} lang={lang} />
        <p className="min-w-0 basis-full text-sm text-muted sm:basis-0 sm:flex-1">{fa ? d.fa.why : d.en.why}</p>
        {d.action && onAction && (() => {
          const a = ACTION[d.action];
          return (
            <button
              type="button"
              onClick={() => onAction(d.action!)}
              className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full bg-brand px-3.5 text-sm font-semibold text-white hover:bg-brand-strong sm:w-auto"
            >
              <a.icon className="h-4 w-4" /> {fa ? a.fa : a.en}
            </button>
          );
        })()}
      </div>
    </div>
  );
}
