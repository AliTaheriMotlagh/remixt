"use client";

import { useEffect, useState } from "react";

/** Days, hours, minutes and seconds to `to`, ticking. */
export default function Countdown({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const left = Math.max(0, Math.floor((target - now) / 1000));
  const parts = [
    { label: "days", value: Math.floor(left / 86400) },
    { label: "hrs", value: Math.floor((left % 86400) / 3600) },
    { label: "min", value: Math.floor((left % 3600) / 60) },
    { label: "sec", value: left % 60 },
  ];

  return (
    <div className="flex gap-2" role="timer" aria-label="Time left">
      {parts.map((p) => (
        <div key={p.label} className="min-w-[3.5rem] rounded-xl border border-border bg-background/60 px-2 py-2 text-center">
          <div className="text-2xl font-black tabular-nums sm:text-3xl" suppressHydrationWarning>
            {String(p.value).padStart(2, "0")}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted">{p.label}</div>
        </div>
      ))}
    </div>
  );
}
