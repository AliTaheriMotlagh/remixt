import Link from "next/link";
import type { RemixCredits as Credits } from "@/lib/credits";

const KIND_LABELS: Record<string, string> = {
  vocals: "Vocals",
  beat: "Beat",
  drums: "Drums",
  bass: "Bass",
  other: "Melody",
};

/** "Remix of …", the songs it's built from, and the remixes made from it. */
export default function RemixCredits({ credits }: { credits: Credits }) {
  const { sources, parent, children, tags, challenge } = credits;
  return (
    <section className="mt-4 flex flex-col gap-2 text-sm">
      {(challenge || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {challenge && (
            <Link
              href={`/challenges?id=${challenge.id}`}
              className="rounded-full bg-beat/15 px-2.5 py-0.5 text-xs font-medium text-beat hover:bg-beat/25"
            >
              🏁 {challenge.title}
            </Link>
          )}
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/remixes?tag=${encodeURIComponent(tag)}`}
              className="rounded-full bg-surface-raised px-2.5 py-0.5 text-xs text-muted hover:text-foreground"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {parent && (
        <p className="text-muted">
          Remix of{" "}
          {parent.published ? (
            <Link href={`/remixes/${parent.id}`} className="font-medium text-foreground hover:underline">
              “{parent.title}”
            </Link>
          ) : (
            <span className="font-medium text-foreground">a private remix</span>
          )}{" "}
          {parent.published && <>by {parent.artist_name}</>}
        </p>
      )}

      {sources.length > 0 && (
        <p className="text-muted">
          {sources.map((s, i) => (
            <span key={`${s.kind}-${s.track_title}-${s.artist_id}`}>
              {i > 0 && " · "}
              {KIND_LABELS[s.kind] ?? s.kind} from “{s.track_title}” by{" "}
              <Link href={`/artist/${s.artist_id}`} className="text-foreground hover:underline">
                {s.artist_name}
              </Link>
            </span>
          ))}
        </p>
      )}

      {children.length > 0 && (
        <div className="mt-2 rounded-xl border border-border bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Remixed {children.length === 1 ? "once" : `${children.length} times`}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {children.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/remixes/${c.id}`}
                  className="block rounded-lg bg-surface-raised px-3 py-1.5 text-xs hover:bg-surface-hover"
                >
                  <span className="font-medium">{c.title}</span> <span className="text-muted">by {c.artist_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
