"use client";

// "Feedback": anyone can tell the owner something's broken, confusing, an
// idea, or what they love — from any page. Opened by any link to #feedback
// (the More menu, the footer, error pages) or the tab on the screen's edge.
// It sends the page, the device and the problems the browser noticed just
// before (lib/client/problems.ts), so the owner can see what happened.
// Also starts the problem watcher for the whole site.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquareHeart, X } from "lucide-react";
import { FEEDBACK_KINDS, FEEDBACK_TEXT, type FeedbackKind } from "@/lib/feedback";
import { recentProblems, watchProblems } from "@/lib/client/problems";
import { visitorId } from "@/lib/client/presence";
import { isBareView, showsFooter } from "@/lib/bareView";

export default function FeedbackDialog({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("problem");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const fa = pathname.startsWith("/fa");
  const bare = isBareView(pathname);

  // Problems are watched on every page but the ones embedded in other sites.
  useEffect(() => {
    if (!bare) watchProblems();
  }, [bare]);

  useEffect(() => {
    const check = () => {
      if (location.hash === "#feedback") {
        setState("idle");
        setOpen(true);
        history.replaceState(history.state, "", location.pathname + location.search);
      }
    };
    check();
    addEventListener("hashchange", check);
    return () => removeEventListener("hashchange", check);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => box.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 3) return;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          message,
          email: signedIn ? "" : email,
          path: location.pathname + location.search,
          visitor: visitorId(),
          screen: `${innerWidth}×${innerHeight}`,
          recent: recentProblems(),
        }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't send");
      setState("sent");
      setMessage("");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Couldn't send");
    }
  }

  if (bare) return null;
  return (
    <>
      {/* A small button in the corner (wider screens; phones have it in More). */}
      <a
        href="#feedback"
        // The Studio and DJ have their library panel on the right: the button goes to the left there.
        className={`fixed bottom-4 ${showsFooter(pathname) && !pathname.startsWith("/dj") ? "right-4" : "left-4"} z-[60] hidden items-center gap-1.5 rounded-full border border-border bg-surface/90 px-3 py-1.5 text-xs font-medium text-muted shadow-lg backdrop-blur transition-colors hover:text-foreground md:flex`}
      >
        <MessageSquareHeart className="h-3.5 w-3.5" /> {fa ? "بازخورد" : "Feedback"}
      </a>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setOpen(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label={fa ? "بازخورد" : "Send feedback"}
            dir={fa ? "rtl" : undefined}
            onClick={(e) => e.stopPropagation()}
            onSubmit={send}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-2xl"
            style={{ animation: "sheet-in 0.2s ease-out" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{fa ? "به ما بگو" : "Tell us"}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={fa ? "بستن" : "Close"} className="rounded-full p-1 text-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {state === "sent" ? (
              <div className="py-6 text-center text-sm">
                <p className="text-2xl">🙏</p>
                <p className="mt-2 font-medium">{fa ? "رسید، ممنون!" : "Got it — thank you!"}</p>
                <p className="mt-1 text-muted">
                  {signedIn ? (fa ? "اگر جواب بدهیم، در اعلان‌ها می‌بینی." : "If we answer, it'll be in your notifications.") : fa ? "هر پیام را می‌خوانیم." : "We read every message."}
                </p>
              </div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {FEEDBACK_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      aria-pressed={kind === k}
                      className={`rounded-xl border px-2 py-2 text-start text-sm ${kind === k ? "border-brand bg-brand/10" : "border-border hover:bg-surface-hover"}`}
                    >
                      <span className="me-1">{FEEDBACK_TEXT[k].emoji}</span>
                      {fa ? FEEDBACK_TEXT[k].fa : FEEDBACK_TEXT[k].en}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={box}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  required
                  placeholder={
                    kind === "problem" || kind === "confusing"
                      ? fa ? "چه کار می‌کردی و چه اتفاقی افتاد؟" : "What were you doing, and what happened?"
                      : fa ? "بنویس…" : "Write it here…"
                  }
                  className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm"
                />
                {!signedIn && (
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={fa ? "ایمیل (اختیاری، برای جواب)" : "Email (optional, so we can answer)"}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                )}
                <p className="mt-2 text-[11px] text-muted">
                  {fa ? "صفحه، نوع دستگاه و خطاهای اخیرِ این صفحه هم فرستاده می‌شود تا مشکل را پیدا کنیم." : "The page, your device type and any recent errors on it are sent too, so we can find the problem."}
                </p>
                {state === "error" && <p className="mt-2 text-sm text-danger">{error}</p>}
                <button
                  type="submit"
                  disabled={state === "sending" || message.trim().length < 3}
                  className="mt-3 w-full rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {state === "sending" ? (fa ? "در حال ارسال…" : "Sending…") : fa ? "بفرست" : "Send"}
                </button>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
