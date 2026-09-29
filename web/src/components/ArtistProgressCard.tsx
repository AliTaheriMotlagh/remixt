import type { ArtistProgress } from "@/lib/social";

/** An artist's level, XP towards the next one, and badges. */
export default function ArtistProgressCard({ progress, isOwner }: { progress: ArtistProgress; isOwner: boolean }) {
  const { level, badges } = progress;
  const span = level.to !== null ? level.to - level.from : 1;
  const into = level.to !== null ? Math.min(1, (level.xp - level.from) / span) : 1;
  const earned = badges.filter((b) => b.earned);
  const shown = isOwner ? badges : earned;

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-gradient-to-r from-brand to-vocals px-3 py-1 text-xs font-bold text-white">
          Level {level.level}
        </span>
        <span className="font-semibold">{level.title}</span>
        <span className="ml-auto text-xs tabular-nums text-muted">
          {level.xp.toLocaleString()} XP
          {level.to !== null && ` · ${(level.to - level.xp).toLocaleString()} to level ${level.level + 1}`}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-gradient-to-r from-brand to-vocals" style={{ width: `${into * 100}%` }} />
      </div>

      <h3 className="mt-5 text-sm font-semibold">
        Badges <span className="font-normal text-muted">({earned.length} of {badges.length})</span>
      </h3>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No badges yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((b) => (
            <div
              key={b.id}
              title={b.description}
              className={`rounded-xl border p-3 ${b.earned ? "border-brand/50 bg-brand/10" : "border-border opacity-60"}`}
            >
              <div className={`text-2xl ${b.earned ? "" : "grayscale"}`}>{b.emoji}</div>
              <div className="mt-1 text-xs font-semibold">{b.label}</div>
              <div className="text-[11px] text-muted">{b.progress ?? b.description}</div>
            </div>
          ))}
        </div>
      )}
      {isOwner && (
        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Earn XP by publishing remixes (100), uploading songs (25), getting likes (15) and followers (20), liking (2) and
          commenting on (5) other people&apos;s remixes, and every 5 plays (1).
        </p>
      )}
    </section>
  );
}
