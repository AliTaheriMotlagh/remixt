import Link from "next/link";
import ChallengeStemCard from "@/components/ChallengeStemCard";
import { challengeEntries, getChallenge, listChallenges, type Challenge } from "@/lib/challenges";

export const metadata = { title: "Remix challenges — Remixt" };

function timeLeft(challenge: Challenge) {
  const target = new Date(challenge.status === "upcoming" ? challenge.starts_at : challenge.ends_at).getTime();
  const hours = Math.max(0, Math.round((target - Date.now()) / 3_600_000));
  const text = hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`;
  if (challenge.status === "upcoming") return `starts in ${text}`;
  if (challenge.status === "running") return `${text} left`;
  return `ended ${new Date(challenge.ends_at).toLocaleDateString()}`;
}

async function ChallengeDetail({ challenge }: { challenge: Challenge }) {
  const entries = challenge.status === "upcoming" ? [] : await challengeEntries(challenge.id);
  return (
    <section className="rounded-2xl border border-border bg-gradient-to-br from-vocals-dim to-beat-dim p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {challenge.status === "running" ? "🏁 This week's challenge" : challenge.status === "upcoming" ? "Coming up" : "Finished"} ·{" "}
            {timeLeft(challenge)}
          </p>
          <h2 className="mt-1 text-2xl font-bold">{challenge.title}</h2>
          {challenge.description && <p className="mt-1 max-w-2xl text-sm text-muted">{challenge.description}</p>}
        </div>
        {challenge.status === "running" && challenge.vocal && challenge.beat && (
          <Link
            href={`/studio?challenge=${challenge.id}`}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
          >
            Remix it in the Studio →
          </Link>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {challenge.vocal ? <ChallengeStemCard stem={challenge.vocal} /> : <p className="text-sm text-muted">The vocal was removed.</p>}
        {challenge.beat ? <ChallengeStemCard stem={challenge.beat} /> : <p className="text-sm text-muted">The beat was removed.</p>}
      </div>

      {challenge.status !== "upcoming" && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold">
            {challenge.status === "ended" ? "Results" : "Entries so far"} ({challenge.entries})
          </h3>
          {entries.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              No entries yet{challenge.status === "running" ? " — publish the first one." : "."}
            </p>
          ) : (
            <ol className="mt-2 flex flex-col gap-1.5">
              {entries.map((entry, i) => (
                <li key={entry.id}>
                  <Link
                    href={`/remixes/${entry.id}`}
                    className="flex items-center gap-3 rounded-lg bg-surface/80 px-3 py-2 text-sm hover:bg-surface-hover"
                  >
                    <span className="w-6 text-center font-mono text-muted">
                      {challenge.status === "ended" && i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{entry.title}</span>{" "}
                      <span className="text-muted">by {entry.artist_name}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      ♥ {entry.likes} · ▶ {entry.plays}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

export default async function ChallengesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const challenges = await listChallenges();
  const picked = id ? await getChallenge(id) : null;
  const featured = picked ?? challenges.find((c) => c.status === "running") ?? null;
  const others = challenges.filter((c) => c.id !== featured?.id);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold">Remix challenges</h1>
      <p className="mt-1 text-sm text-muted">
        One vocal, one beat, everyone remixes the same pair. Publish your version while the challenge is on — the most
        liked entries top the results.
      </p>

      <div className="mt-6">
        {featured ? (
          <ChallengeDetail challenge={featured} />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
            No challenge is running right now — check back soon.
          </div>
        )}
      </div>

      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Other challenges</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {others.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/challenges?id=${c.id}`}
                  className="block rounded-xl border border-border bg-surface p-3 hover:bg-surface-hover"
                >
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted">
                    {timeLeft(c)} · {c.entries} {c.entries === 1 ? "entry" : "entries"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
