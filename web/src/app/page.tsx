import Link from "next/link";
import sql from "@/lib/db";

type RemixPreview = {
  id: string;
  title: string;
  artist_name: string;
  lane_count: number;
  created_at: string;
};

export default async function Home() {
  const remixes = await sql<RemixPreview[]>`
    SELECT remixes.id, remixes.title, remixes.created_at, users.artist_name,
           COUNT(remix_lanes.id)::int as lane_count
    FROM remixes
    JOIN users ON users.id = remixes.owner_id
    LEFT JOIN remix_lanes ON remix_lanes.remix_id = remixes.id
    WHERE remixes.published = true
    GROUP BY remixes.id, users.artist_name
    ORDER BY remixes.created_at DESC
    LIMIT 6
  `;

  const statsRows = await sql<
    { tracks: number; remixes: number; artists: number }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM tracks WHERE status = 'ready') as tracks,
      (SELECT COUNT(*)::int FROM remixes) as remixes,
      (SELECT COUNT(*)::int FROM users) as artists
  `;
  const stats = statsRows[0];

  return (
    <div className="flex flex-1 flex-col">
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, var(--vocals-dim), transparent 45%), radial-gradient(circle at 80% 0%, var(--beat-dim), transparent 45%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-glow" />
              AI vocal &amp; beat separation, in your browser
            </div>
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
              Split any song.
              <br />
              <span className="bg-gradient-to-r from-vocals to-beat bg-clip-text text-transparent">
                Remix it your way.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
              Upload a track and Remixt automatically separates the vocals
              from the beat. Browse the library, drop any vocal onto any
              beat in the studio, mix it like a DAW, and publish it as your
              own remix.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/upload"
                className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-transform hover:scale-[1.03] hover:bg-brand-strong"
              >
                Upload a song
              </Link>
              <Link
                href="/library"
                className="rounded-xl border border-border bg-surface px-6 py-3 text-sm font-semibold transition-colors hover:bg-surface-hover"
              >
                Browse vocals &amp; beats
              </Link>
              <Link
                href="/studio"
                className="rounded-xl border border-border bg-surface px-6 py-3 text-sm font-semibold transition-colors hover:bg-surface-hover"
              >
                Open the studio
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-3 gap-4 text-center">
            <Stat label="Tracks split" value={stats.tracks} />
            <Stat label="Remixes made" value={stats.remixes} />
            <Stat label="Artists" value={stats.artists} />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          From upload to remix in three steps
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <StepCard
            step="01"
            accent="brand"
            title="Upload a song"
            description="Drop in an mp3, wav, or m4a. It's yours — it lands in your artist library."
          />
          <StepCard
            step="02"
            accent="vocals"
            title="Auto-split vocals & beat"
            description="Our separation engine (Demucs) pulls the vocal stem apart from the instrumental beat automatically."
          />
          <StepCard
            step="03"
            accent="beat"
            title="Remix in the studio"
            description="Pull any vocal onto any beat, balance volumes, and publish the result under your artist name."
          />
        </div>
      </section>

      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Fresh from the community
            </h2>
            <Link href="/remixes" className="text-sm font-medium text-brand-strong hover:underline">
              View all remixes →
            </Link>
          </div>

          {remixes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
              No remixes published yet. Be the first — upload a track and
              build one in the studio.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {remixes.map((remix) => (
                <Link
                  key={remix.id}
                  href={`/remixes/${remix.id}`}
                  className="group rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-brand/50 hover:bg-surface-hover"
                >
                  <div className="mb-3 flex h-24 items-center justify-center gap-1 overflow-hidden rounded-lg bg-gradient-to-br from-vocals-dim to-beat-dim">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <span
                        key={i}
                        className="w-1 rounded-full bg-white/40 group-hover:bg-white/70"
                        style={{ height: `${20 + Math.sin(i * 0.9) * 15 + 15}%` }}
                      />
                    ))}
                  </div>
                  <h3 className="font-semibold">{remix.title}</h3>
                  <p className="mt-1 text-sm text-muted">
                    by {remix.artist_name} · {remix.lane_count} stem
                    {remix.lane_count === 1 ? "" : "s"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-3xl font-black">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
  accent,
}: {
  step: string;
  title: string;
  description: string;
  accent: "brand" | "vocals" | "beat";
}) {
  const accentColor = `var(--${accent})`;
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
        style={{ background: accentColor }}
      >
        {step}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </div>
  );
}
