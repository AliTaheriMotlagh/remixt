"use client";

// An artist's own page: every song of theirs that's verified (or a take
// they sang in the Studio), what it has earned them, the remixes using it,
// and their choice for it — Monetize / Follow the remixer / Block — like
// YouTube's Content ID.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Ban, CircleDollarSign, Loader2, Mic2, Users } from "lucide-react";
import { SONG_POLICY_TEXT, type SongPolicy } from "@/lib/monetize/adRules";
import { moneyIn, moneyPath, numIn, type Lang } from "@/lib/monetize/moneyText";
import type { ArtistSong } from "@/lib/monetize/adStore";

const POLICIES: SongPolicy[] = ["monetize", "follow", "block"];
const ICON = { monetize: CircleDollarSign, follow: Users, block: Ban };

const T = {
  en: {
    title: "Your songs as an artist",
    intro: "For each song of yours, choose what happens when people remix it. You're paid the artists' share of every ad on its remixes whatever you choose (except Block, which keeps them private).",
    none: "No verified songs yet. Claim a song of yours from your earnings page, or record a take in the Studio — then it shows here.",
    claim: "Claim a song",
    remixes: (n: string, p: string) => `${n} remixes use it · ${p} public`,
    earned: (m: string, v: string) => `${m} earned · ${v} paid views`,
    take: "Your take",
    verified: "Verified",
    blockWarn: (n: string) => `Block makes ${n} public remixes private now, and tells their makers why. Sure?`,
    hidden: (n: string) => `${n} remixes were made private.`,
    saved: "Saved.",
    failed: "Couldn't save",
    private: "private",
    back: "Back to earnings",
  },
  fa: {
    title: "آهنگ‌های شما به‌عنوان هنرمند",
    intro: "برای هر آهنگتان انتخاب کنید وقتی ریمیکس می‌شود چه شود. سهم هنرمندان از هر تبلیغِ ریمیکس‌هایش، هر چه انتخاب کنید به شما پرداخت می‌شود (به‌جز «مسدود» که ریمیکس‌ها را خصوصی نگه می‌دارد).",
    none: "هنوز آهنگ تأییدشده‌ای ندارید. از صفحهٔ درآمد آهنگتان را ادعا کنید، یا در استودیو یک تِیک ضبط کنید — بعد اینجا نمایش داده می‌شود.",
    claim: "ادعای آهنگ",
    remixes: (n: string, p: string) => `${n} ریمیکس از آن استفاده می‌کند · ${p} عمومی`,
    earned: (m: string, v: string) => `${m} درآمد · ${v} بازدید پولی`,
    take: "تِیکِ شما",
    verified: "تأییدشده",
    blockWarn: (n: string) => `«مسدود» همین حالا ${n} ریمیکسِ عمومی را خصوصی می‌کند و دلیلش را به سازنده‌هایشان می‌گوید. مطمئنید؟`,
    hidden: (n: string) => `${n} ریمیکس خصوصی شد.`,
    saved: "ذخیره شد.",
    failed: "ذخیره نشد",
    private: "خصوصی",
    back: "بازگشت به درآمد",
  },
};

export default function ArtistSongs({ lang = "en", rate = 0 }: { lang?: Lang; rate?: number }) {
  const t = T[lang];
  const money = useMemo(() => moneyIn(lang, rate), [lang, rate]);
  const num = useMemo(() => numIn(lang), [lang]);
  const [songs, setSongs] = useState<ArtistSong[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const load = useCallback(() => {
    fetch("/api/earnings/songs", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { songs?: ArtistSong[] }) => setSongs(d.songs ?? []))
      .catch(() => setSongs([]));
  }, []);
  useEffect(load, [load]);

  async function choose(song: ArtistSong, policy: SongPolicy) {
    if (policy === song.policy) return;
    if (policy === "block" && song.publicRemixes > 0 && !window.confirm(t.blockWarn(num(song.publicRemixes)))) return;
    setBusy(song.id);
    try {
      const res = await fetch("/api/earnings/songs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: song.id, policy }) });
      const data = (await res.json()) as { error?: string; hidden?: number };
      if (!res.ok) throw new Error(data.error ?? t.failed);
      setNote((n) => ({ ...n, [song.id]: data.hidden ? t.hidden(num(data.hidden)) : t.saved }));
      load();
    } catch (e) {
      setNote((n) => ({ ...n, [song.id]: e instanceof Error ? e.message : t.failed }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={moneyPath(lang, "/earnings")} className="text-sm text-brand-strong hover:underline">
          {t.back}
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-2 max-w-3xl text-muted">{t.intro}</p>
      </div>
      {!songs ? (
        <div className="h-40 animate-pulse rounded-3xl bg-surface" />
      ) : songs.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-muted">
          <p>{t.none}</p>
          <Link href={`${moneyPath(lang, "/earnings")}#claims`} className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
            {t.claim}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {songs.map((s) => (
            <li key={s.id} className="rounded-3xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-lg font-semibold">
                    <span className="truncate">{s.title}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">
                      {s.take ? <Mic2 className="h-3 w-3" /> : <BadgeCheck className="h-3 w-3" />} {s.take ? t.take : t.verified}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {t.remixes(num(s.remixes), num(s.publicRemixes))} · {t.earned(money(s.earned), num(s.views))}
                  </p>
                </div>
                {busy === s.id && <Loader2 className="h-5 w-5 animate-spin text-muted" />}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={s.title}>
                {POLICIES.map((p) => {
                  const Icon = ICON[p];
                  const on = s.policy === p;
                  const text = SONG_POLICY_TEXT[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={busy === s.id}
                      onClick={() => choose(s, p)}
                      className={`rounded-2xl border p-3 text-start transition ${
                        on ? (p === "block" ? "border-danger bg-danger/10" : "border-brand bg-brand/10") : "border-border hover:bg-surface-hover"
                      }`}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <Icon className="h-4 w-4" /> {lang === "fa" ? text.fa : text.en}
                      </span>
                      <span className="mt-1 block text-xs text-muted">{lang === "fa" ? text.faHelp : text.enHelp}</span>
                    </button>
                  );
                })}
              </div>
              {note[s.id] && <p className="mt-2 text-sm">{note[s.id]}</p>}
              {s.topRemixes.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2 text-sm">
                  {s.topRemixes.map((r) => (
                    <li key={r.id}>
                      {r.published ? (
                        <Link href={`/remixes/${r.id}`} className="rounded-full border border-border px-3 py-1 hover:bg-surface-hover">
                          {r.title} <span className="text-muted">· {r.maker}</span>
                        </Link>
                      ) : (
                        <span className="rounded-full border border-dashed border-border px-3 py-1 text-muted">
                          {r.title} · {r.maker} · {t.private}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
