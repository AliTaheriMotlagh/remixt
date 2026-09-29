"use client";

import { useEffect, useState } from "react";
import { embedCode, shortPath } from "@/lib/shareLinks";

/** Short link, QR code and embed snippet for a remix. */
export default function ShareMenu({ remixId, title, onClose }: { remixId: string; title: string; onClose: () => void }) {
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState<{ svg: string; png: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the origin is only known in the browser
  useEffect(() => setOrigin(window.location.origin), []);

  const short = origin ? `${origin}${shortPath(remixId)}` : "";
  const embed = origin ? embedCode(origin, remixId, title) : "";

  useEffect(() => {
    if (!short) return;
    let cancelled = false;
    void import("qrcode").then(async (QRCode) => {
      const options = { margin: 1, color: { dark: "#0a0a0f", light: "#ffffff" } };
      const [svg, png] = await Promise.all([
        QRCode.toString(short, { ...options, type: "svg" }),
        QRCode.toDataURL(short, { ...options, width: 1024 }),
      ]);
      if (!cancelled) setQr({ svg, png });
    });
    return () => {
      cancelled = true;
    };
  }, [short]);

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("Select and copy it by hand");
    }
  }

  return (
    <div className="absolute left-0 top-full z-[45] mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-4 text-sm shadow-xl">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Share “{title}”</p>
        <button onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close">
          ✕
        </button>
      </div>

      <p className="mt-3 text-xs font-medium text-muted">Short link</p>
      <div className="mt-1 flex gap-2">
        <input readOnly value={short} className="input !py-1.5 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button onClick={() => copy("Link copied", short)} className="nudge shrink-0 !px-2.5 !py-1.5 !text-xs">
          Copy
        </button>
      </div>

      <p className="mt-3 text-xs font-medium text-muted">QR code — for flyers, a screen at a gig, or in person</p>
      <div className="mt-1 flex items-center gap-3">
        <div
          className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-white p-1"
          // The SVG is generated here, from this page's own link.
          dangerouslySetInnerHTML={qr ? { __html: qr.svg } : undefined}
        />
        {qr && (
          <a href={qr.png} download={`remixt-${remixId.slice(0, 8)}-qr.png`} className="nudge !px-2.5 !py-1.5 !text-xs">
            Download PNG
          </a>
        )}
      </div>

      <p className="mt-3 text-xs font-medium text-muted">Embed on a website</p>
      <textarea
        readOnly
        value={embed}
        rows={3}
        className="input mt-1 !py-1.5 font-mono text-[11px]"
        onFocus={(e) => e.target.select()}
      />
      <button onClick={() => copy("Embed code copied", embed)} className="nudge mt-1 !px-2.5 !py-1.5 !text-xs">
        Copy embed code
      </button>

      {copied && <p className="mt-2 text-xs text-success">{copied}</p>}
    </div>
  );
}
