"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Laptop, Share2, Smartphone } from "lucide-react";
import { deviceClass, type DeviceClass } from "@/lib/client/device";
import { featureNotice, type FeatureId } from "@/lib/client/deviceFeatures";
import { useExportJob } from "@/lib/client/exportJob";

const noSubscription = () => () => {};
let cached: DeviceClass | null = null;
const readDevice = () => (cached ??= deviceClass());

/** This device's class — null while rendering on the server (the notice then waits for the browser). */
export function useDeviceClass(): DeviceClass | null {
  return useSyncExternalStore(noSubscription, readDevice, () => null);
}

/**
 * The one notice for heavy features on phones and tablets (see
 * deviceFeatures.ts): what will happen here, and how to carry on on a
 * computer — the same address, signed in to the same account. Nothing on a
 * computer, or where the feature just works.
 *
 * `path` is what to open on the computer (default: this page). `unsaved`
 * says the work isn't on the server yet, so the computer wouldn't find it:
 * the notice says to save it first.
 */
export default function DeviceNotice({
  feature,
  songs = 0,
  path,
  unsaved = null,
  className = "",
}: {
  feature: FeatureId;
  songs?: number;
  path?: string;
  unsaved?: string | null;
  className?: string;
}) {
  const device = useDeviceClass();
  const [done, setDone] = useState<"copied" | null>(null);
  const notice = device ? featureNotice(feature, device, songs) : null;
  if (!notice) return null;
  const href = typeof window === "undefined" ? "" : new URL(path ?? `${location.pathname}${location.search}`, location.origin).href;
  const shown = href.replace(/^https?:\/\//, "");
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const tone = notice.level === "computer" ? "border-amber-400/40 bg-amber-400/10" : "border-brand/40 bg-brand/10";

  return (
    <div role="note" className={`rounded-xl border px-3 py-2.5 text-xs ${tone} ${className}`}>
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        {notice.level === "computer" ? <Laptop className="h-4 w-4 shrink-0" /> : <Smartphone className="h-4 w-4 shrink-0" />}
        {notice.title}
      </p>
      <p className="mt-1 leading-relaxed text-muted">{notice.text}</p>
      <div className="mt-2 border-t border-white/10 pt-2">
        <p className="font-semibold text-foreground">Continue on a computer</p>
        {unsaved ? (
          <p className="mt-0.5 leading-relaxed text-muted">{unsaved}</p>
        ) : (
          <>
            <p className="mt-0.5 leading-relaxed text-muted">Open this address on a computer, signed in to the same account — it&apos;s all there.</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-background/70 px-2 py-1.5 font-mono text-[11px] text-foreground">{shown}</code>
              <button
                onClick={() =>
                  void navigator.clipboard?.writeText(href).then(() => {
                    setDone("copied");
                    setTimeout(() => setDone(null), 1600);
                  })
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground"
                aria-label="Copy the address"
              >
                {done === "copied" ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              {canShare && (
                <button
                  onClick={() => void navigator.share({ title: "Open on my computer", url: href }).catch(() => {})}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-semibold text-muted hover:text-foreground"
                  title="Send it to your computer — AirDrop, email or a message to yourself"
                >
                  <Share2 className="h-3.5 w-3.5" /> Send
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * DeviceNotice in the Studio: the computer opens the saved remix
 * (/studio?remix=…, private ones too for their owner). Work that isn't
 * saved yet is only on this phone, so it says to save it first.
 */
export function StudioDeviceNotice(props: { feature: FeatureId; songs?: number; className?: string }) {
  const remixId = useExportJob((s) => s.info.remixId ?? null);
  return (
    <DeviceNotice
      {...props}
      path={remixId ? `/studio?remix=${remixId}` : undefined}
      unsaved={
        remixId
          ? null
          : "This mix is only on this phone until it's saved. Save it (Save, at the top of the Studio — signed in), then open Remixt on a computer signed in as you: it's in your remixes, ready to open in the Studio."
      }
    />
  );
}
