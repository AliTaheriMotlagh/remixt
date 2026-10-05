import Link from "next/link";
import { Eye, Headphones } from "lucide-react";
import { coverUrl } from "@/lib/cover";
import type { LiveStream } from "@/lib/live";
import { LiveBadge } from "./LiveRoom";

function when(stream: LiveStream) {
  if (stream.status === "scheduled" && stream.scheduled_at) {
    return new Date(stream.scheduled_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
  }
  if (stream.status === "ended" && stream.ended_at) return `Ended ${new Date(stream.ended_at).toLocaleDateString()}`;
  return null;
}

/** One session in a list: cover, who, what, and how many are watching. */
export default function LiveCard({ stream }: { stream: LiveStream }) {
  const cover = stream.remix_id ? coverUrl(stream.remix_id, stream.remix_cover_key) : null;
  const time = when(stream);
  return (
    <Link
      href={`/live/${stream.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-brand"
    >
      <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-vocals-dim to-beat-dim">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- covers are user uploads served by the app itself
          <img src={cover} alt="" className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" loading="lazy" />
        ) : (
          <Headphones className="h-10 w-10 text-brand-strong/70" />
        )}
        <span className="absolute left-2 top-2">
          <LiveBadge status={stream.status} />
        </span>
        {stream.status === "live" && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <Eye className="h-3 w-3" /> {stream.viewers}
          </span>
        )}
      </div>
      <div className="flex gap-2.5 p-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: stream.host_color }}
          aria-hidden
        >
          {stream.host_name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{stream.title}</h3>
          <p className="truncate text-xs text-muted">{stream.host_name}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {[stream.mode === "studio" ? "Making a remix live" : stream.remix_title && `Playing ${stream.remix_title}`, time, ...stream.tags.slice(0, 2)].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
    </Link>
  );
}
