import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Brain,
  Check,
  Disc3,
  FlaskConical,
  Radio,
  Flag,
  Flame,
  Handshake,
  Heart,
  Hourglass,
  Lock,
  Music,
  Pause,
  Play,
  Rocket,
  SlidersHorizontal,
  SlidersVertical,
  Smartphone,
  TrendingUp,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import sql from "@/lib/db";
import { Icon, PlaceMedal } from "@/components/Icon";
import RemixtMark from "@/components/RemixtMark";
import ChallengeStemCard from "@/components/ChallengeStemCard";
import CountUp from "@/components/landing/CountUp";
import Countdown from "@/components/landing/Countdown";
import { LivePanel, OnlineAvatars, OnlineBadge } from "@/components/landing/Live";
import { getCurrentUser } from "@/lib/auth";
import { listChallenges } from "@/lib/challenges";
import { coverUrl, ensureRemixStats } from "@/lib/models";
import { presenceSnapshot, recentActivity } from "@/lib/presence";
import LiveCard from "@/components/live/LiveCard";
import { liveDirectory } from "@/lib/live";
import {
  XP,
  badgesFor,
  getArtistProgress,
  levelLadder,
  rankedRemixes,
  topArtists,
  type ArtistNumbers,
  type LeaderboardArtist,
} from "@/lib/social";
import { JsonLd, organizationJsonLd, pageMetadata } from "@/lib/seo";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/site";

type RemixPreview = {
  id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  avatar_color: string;
  cover_key: string | null;
  plays: number;
  likes: number;
};

export const metadata = pageMetadata({
  // The home page shares the layout's segment, so the "· Remixt" template doesn't apply.
  title: `${SITE_NAME} — split any song & remix vocals over any beat`,
  description: SITE_DESCRIPTION,
  path: "/",
});

/** The smallest count the numbers strip will show. */
const MIN_STAT = 10;

const FAQ = [
  {
    q: "Is Remixt really free?",
    a: "Yes. Splitting, the Studio, publishing and sharing are all free. The AI runs on your own device, so there's no server bill to pass on to you.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Remixt runs in your browser on a laptop, desktop or phone. The splitting model downloads once (about 200 MB) and is cached for next time.",
  },
  {
    q: "Does my song get uploaded?",
    a: "The original never leaves your device. It's split in your browser, and only the vocal and beat stems are uploaded to your library.",
  },
  {
    q: "Can I split songs on my phone?",
    a: "Yes. Queue a song from your phone and a computer (yours, or a helper's) splits it for you. You get a notification when it's ready.",
  },
  {
    q: "How do levels and badges work?",
    a: "You earn XP for publishing remixes, uploading songs, and the likes, plays and followers you get. Level up from Newcomer to Icon and collect badges on the way.",
  },
];

/** Waveform bar heights from an id, so each card looks different but renders the same every time. */
function barsFor(id: string, count: number): number[] {
  let seed = 0;
  for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: count }, (_, i) => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const wave = Math.sin(i * 0.55) * 0.25 + 0.5;
    return Math.round((wave * 0.6 + ((seed >>> 16) / 65535) * 0.4) * 80 + 20);
  });
}

export default async function Home() {
  await ensureRemixStats();
  const user = await getCurrentUser();

  const [statsRows, freshRemixes, trending, podium, challenges, presence, activity, progress, liveSessions] = await Promise.all([
    sql<{ tracks: number; remixes: number; artists: number; plays: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM tracks WHERE status = 'ready') AS tracks,
        (SELECT COUNT(*)::int FROM remixes WHERE published) AS remixes,
        (SELECT COUNT(*)::int FROM users) AS artists,
        (SELECT COALESCE(SUM(play_count), 0)::int FROM remixes WHERE published) AS plays
    `,
    sql<RemixPreview[]>`
      SELECT remixes.id, remixes.title, users.id AS artist_id, users.artist_name, users.avatar_color,
             remixes.cover_key, remixes.play_count AS plays,
             (SELECT COUNT(*) FROM remix_likes l WHERE l.remix_id = remixes.id)::int AS likes
      FROM remixes JOIN users ON users.id = remixes.owner_id
      WHERE remixes.published
      ORDER BY remixes.created_at DESC
      LIMIT 6
    `,
    rankedRemixes("trending", 6),
    topArtists(3),
    listChallenges(),
    presenceSnapshot(),
    recentActivity(),
    user ? getArtistProgress(user.id) : Promise.resolve(null),
    // The home page must load even if the live tables are unreachable.
    liveDirectory().then((d) => d.live.slice(0, 4)).catch(() => []),
  ]);
  const stats = statsRows[0];
  // Tiny numbers put people off more than no numbers, so each shows once it's worth showing off.
  const numbers = [
    { label: "Songs split", value: stats.tracks },
    { label: "Remixes published", value: stats.remixes },
    { label: "Artists", value: stats.artists },
    { label: "Plays", value: stats.plays },
  ].filter((n) => n.value >= MIN_STAT);

  // What's hot this week, topped up with the newest when the week's been quiet.
  const trendingIds = new Set(trending.map((r) => r.id));
  const remixes: (RemixPreview & { hot: boolean })[] = [
    ...trending.map((r) => ({ ...r, avatar_color: "", hot: true })),
    ...freshRemixes.filter((r) => !trendingIds.has(r.id)).map((r) => ({ ...r, hot: false })),
  ].slice(0, 6);

  const challenge = challenges.find((c) => c.status === "running") ?? challenges.find((c) => c.status === "upcoming");

  return (
    <div className="flex flex-1 flex-col">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE_NAME,
            url: absoluteUrl("/"),
            description: SITE_DESCRIPTION,
            potentialAction: {
              "@type": "SearchAction",
              target: { "@type": "EntryPoint", urlTemplate: absoluteUrl("/library?q={search_term_string}") },
              "query-input": "required name=search_term_string",
            },
          },
          organizationJsonLd(),
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: SITE_NAME,
            url: absoluteUrl("/studio"),
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Any (runs in the browser)",
            description:
              "Split songs into vocal and beat stems with AI in the browser, then remix them in an online multitrack studio.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
        ]}
      />

      {/* Hero ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(circle at 15% 20%, var(--vocals-dim), transparent 45%), radial-gradient(circle at 85% 10%, var(--beat-dim), transparent 45%), radial-gradient(circle at 50% 100%, color-mix(in srgb, var(--brand) 18%, transparent), transparent 55%)",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-14 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <OnlineBadge initial={presence} />
            <h1 className="mt-6 text-4xl font-black tracking-tight text-balance sm:text-6xl">
              Split any song.
              <br />
              <span className="bg-gradient-to-r from-vocals via-brand-strong to-beat bg-clip-text text-transparent">
                Remix it your way.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">
              AI pulls the vocals apart from the beat right in your browser. Drop any vocal on any beat,
              mix it like a pro DAW, publish it, and climb the charts.
            </p>
            <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
              {user ? (
                <>
                  <Link
                    href="/upload"
                    className="rounded-xl bg-brand px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-transform hover:scale-[1.03] hover:bg-brand-strong"
                  >
                    Split a new song
                  </Link>
                  <Link
                    href="/studio"
                    className="rounded-xl border border-border bg-surface px-6 py-3.5 text-center text-sm font-semibold transition-colors hover:bg-surface-hover"
                  >
                    Open the Studio
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/signup"
                    className="rounded-xl bg-brand px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-transform hover:scale-[1.03] hover:bg-brand-strong"
                  >
                    Start remixing — it&apos;s free
                  </Link>
                  <Link
                    href="/library"
                    className="rounded-xl border border-border bg-surface px-6 py-3.5 text-center text-sm font-semibold transition-colors hover:bg-surface-hover"
                  >
                    Browse vocals &amp; beats
                  </Link>
                </>
              )}
            </div>
            <div className="mt-6">
              <OnlineAvatars initial={presence} />
            </div>
          </div>

          <StudioMock />
        </div>
      </section>

      {/* Numbers ----------------------------------------------------------- */}
      {numbers.length >= 2 && (
        <section className="border-b border-border bg-surface/40">
          <div
            className={`mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:px-6 ${
              numbers.length === 4 ? "sm:grid-cols-4" : numbers.length === 3 ? "sm:grid-cols-3" : ""
            }`}
          >
            {numbers.map((n) => (
              <Stat key={n.label} label={n.label} value={n.value} />
            ))}
          </div>
        </section>
      )}

      {/* Live sessions, DJ simulator, examples ----------------------------- */}
      <section className="border-b border-border bg-surface/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Watch & play"
            title="Go live, learn to DJ, see it in action"
            lead="Perform your remixes for a live room, train in a DJ simulator, or hear exactly what splitting and matching does — no account needed."
          />
          {liveSessions.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span className="live-dot h-2 w-2 rounded-full bg-danger" aria-hidden /> Live right now
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {liveSessions.map((s) => (
                  <LiveCard key={s.id} stream={s} />
                ))}
              </div>
            </div>
          )}
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { href: "/live", icon: Radio, title: "Live sessions", text: "Hear artists play their stems in real time. Chat, send reactions, or go live yourself.", cta: liveSessions.length ? "See who's live" : "Open Live" },
              { href: "/dj", icon: Disc3, title: "DJ simulator", text: "Flight-school for DJs: guided missions from beatmatching to a full club night, with a co-pilot and a score.", cta: "Start training" },
              { href: "/examples", icon: FlaskConical, title: "Splitting & matching examples", text: "Pick a demo song, split it into vocal and beat, then match a vocal to a different beat — and hear before and after.", cta: "Try the examples" },
            ].map(({ href, icon: Glyph, title, text, cta }) => (
              <Link key={href} href={href} className="group flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-brand">
                <Glyph className="h-6 w-6 text-brand-strong" />
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-sm text-muted">{text}</p>
                <span className="mt-auto pt-2 text-sm font-semibold text-brand-strong">
                  {cta} <ArrowRight className="inline transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Live -------------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow="Live"
          title="Happening right now"
          lead="Real artists, real remixes — this updates as people split, publish, like and follow."
        />
        <div className="mt-8">
          <LivePanel initialPresence={presence} initialActivity={activity} />
        </div>
      </section>

      {/* How it works + video ------------------------------------------------ */}
      <section className="border-y border-border bg-surface/40">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="How it works" title="From any song to your remix in minutes" align="left" />
            <ol className="mt-8 flex flex-col gap-4">
              <StepCard
                step="1"
                accent="brand"
                title="Upload a song"
                description="Drop in an mp3, wav or m4a — or paste a link. It lands in your artist library."
              />
              <StepCard
                step="2"
                accent="vocals"
                title="AI splits vocals & beat"
                description="Demucs runs on your own device and separates the vocal from the instrumental. No waiting in a server queue."
              />
              <StepCard
                step="3"
                accent="beat"
                title="Remix, publish, level up"
                description="Pull any vocal onto any beat, match BPM and key, add FX, and publish. Every remix earns XP."
              />
            </ol>
          </div>
          <div>
            <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-2xl shadow-brand/10">
              <video
                className="aspect-video w-full"
                src="/remixt-demo.mp4"
                poster="/remixt-demo-poster.jpg"
                controls
                playsInline
                preload="none"
              >
                Your browser can&apos;t play this video.
              </video>
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              <Play className="fill-current" /> See Remixt in 16 seconds
            </p>
          </div>
        </div>
      </section>

      {/* Challenge ----------------------------------------------------------- */}
      {challenge && (
        <section className="mx-auto w-full max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-vocals-dim via-surface to-beat-dim p-5 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest text-vocals">
                  {challenge.status === "running" ? (
                    <>
                      <Flag /> Live challenge
                    </>
                  ) : (
                    <>
                      <Hourglass /> Next challenge
                    </>
                  )}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{challenge.title}</h2>
                <p className="mt-2 max-w-xl text-sm text-muted">
                  {challenge.description ||
                    "Everyone gets the same vocal and beat. Make your version, publish it, and the most-liked remix wins."}
                </p>
                <p className="mt-3 text-sm">
                  <span className="font-semibold tabular-nums">{challenge.entries}</span>{" "}
                  <span className="text-muted">
                    {challenge.entries === 1 ? "entry" : "entries"} so far
                    {challenge.entries === 0 && challenge.status === "running" ? " — the first one gets noticed" : ""}
                  </span>
                </p>
              </div>
              <div className="shrink-0">
                <p className="mb-2 text-xs font-medium text-muted">
                  {challenge.status === "running" ? "Ends in" : "Starts in"}
                </p>
                <Countdown to={challenge.status === "running" ? challenge.ends_at : challenge.starts_at} />
              </div>
            </div>
            {(challenge.vocal || challenge.beat) && (
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {challenge.vocal && <ChallengeStemCard stem={challenge.vocal} />}
                {challenge.beat && <ChallengeStemCard stem={challenge.beat} />}
              </div>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {challenge.status === "running" && challenge.vocal && challenge.beat && (
                <Link
                  href={user ? `/studio?challenge=${challenge.id}` : "/signup"}
                  className="rounded-xl bg-brand px-5 py-3 text-center text-sm font-semibold text-white hover:bg-brand-strong"
                >
                  {user ? "Enter the challenge" : "Sign up & enter"} <ArrowRight />
                </Link>
              )}
              <Link
                href="/challenges"
                className="rounded-xl border border-border bg-surface px-5 py-3 text-center text-sm font-semibold hover:bg-surface-hover"
              >
                See entries
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Gamification ------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow="Level up"
          title="Every remix moves you up the charts"
          lead="Earn XP for what you make and the love it gets. Climb 11 levels from Newcomer to Icon, unlock badges, and land on the leaderboard."
        />

        {progress && user && (
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-brand/40 bg-brand/10 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-gradient-to-r from-brand to-vocals px-3 py-1 text-xs font-bold text-white">
                Level {progress.level.level}
              </span>
              <span className="font-semibold">{progress.level.title}</span>
              <span className="ml-auto text-xs tabular-nums text-muted">
                {progress.level.xp.toLocaleString("en-US")} XP
                {progress.level.to !== null &&
                  ` · ${(progress.level.to - progress.level.xp).toLocaleString("en-US")} to level ${progress.level.level + 1}`}
              </span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-vocals"
                style={{
                  width: `${
                    progress.level.to === null
                      ? 100
                      : Math.min(100, ((progress.level.xp - progress.level.from) / (progress.level.to - progress.level.from)) * 100)
                  }%`,
                }}
              />
            </div>
            <p className="mt-3 text-xs text-muted">
              {progress.badges.filter((b) => b.earned).length} of {progress.badges.length} badges ·{" "}
              <Link href={`/artist/${user.id}`} className="font-medium text-brand-strong hover:underline">
                See your profile <ArrowRight />
              </Link>
            </p>
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h3 className="font-semibold">
              <Zap className="text-brand-strong" /> How you earn XP
            </h3>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              <XpRow label="Publish a remix" xp={XP.published} />
              <XpRow label="Upload a song" xp={XP.track} />
              <XpRow label="Gain a follower" xp={XP.followers} />
              <XpRow label="Get a like" xp={XP.like} />
              <XpRow label="Split a song for someone" xp={XP.splitForOthers} />
              <XpRow label="Comment on a remix" xp={XP.commentedOn} />
              <XpRow label="Like a remix" xp={XP.likeGiven} />
              <XpRow label={`Every ${XP.playsPer} plays`} xp={1} />
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h3 className="font-semibold">
              <TrendingUp className="text-brand-strong" /> The ladder
            </h3>
            <ol className="mt-4 flex flex-col gap-1.5">
              {levelLadder().map((l) => {
                const current = progress?.level.level === l.level;
                return (
                  <li
                    key={l.level}
                    className={`flex items-center gap-3 rounded-lg px-2 py-1 text-sm ${current ? "bg-brand/15 ring-1 ring-brand/50" : ""}`}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                      style={{ background: `color-mix(in srgb, var(--brand) ${30 + l.level * 6}%, var(--vocals))` }}
                    >
                      {l.level}
                    </span>
                    <span className="flex-1 truncate font-medium">
                      {l.title}
                      {current && (
                        <span className="ml-2 text-xs text-brand-strong">
                          <ArrowLeft /> you
                        </span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-muted">{l.from.toLocaleString("en-US")} XP</span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold">
                <Trophy className="text-brand-strong" /> Top artists
              </h3>
              <Link href="/leaderboard" className="text-xs font-medium text-brand-strong hover:underline">
                Full leaderboard <ArrowRight />
              </Link>
            </div>
            <Podium artists={podium} />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">
              <Award className="text-brand-strong" /> Badges to collect
            </h3>
            <span className="text-xs text-muted">
              {progress
                ? `You've earned ${progress.badges.filter((b) => b.earned).length} of ${progress.badges.length}`
                : "Your first remix unlocks the first one"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(progress?.badges ?? badgesFor(NO_NUMBERS)).map((b) => (
              <div
                key={b.id}
                title={b.description}
                className={`rounded-xl border p-3 transition-transform hover:-translate-y-0.5 ${
                  b.earned ? "border-brand/50 bg-brand/10" : "border-border bg-surface-raised/40"
                }`}
              >
                <div className={`text-2xl ${progress && !b.earned ? "text-muted opacity-50" : "text-brand-strong"}`}>
                  <Icon name={b.icon} />
                </div>
                <div className="mt-1 text-xs font-semibold">{b.label}</div>
                <div className="text-[11px] text-muted">{progress && !b.earned && b.progress ? b.progress : b.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Remixes ------------------------------------------------------------ */}
      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <SectionHeading eyebrow="Listen" title="Hot from the community" align="left" />
            <Link href="/remixes" className="text-sm font-medium text-brand-strong hover:underline">
              View all remixes <ArrowRight />
            </Link>
          </div>

          {remixes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
              No remixes published yet. Be the first — and grab the{" "}
              <span className="font-semibold text-foreground">
                <SlidersHorizontal className="text-brand-strong" /> First Remix
              </span> badge.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {remixes.map((remix) => (
                <Link
                  key={remix.id}
                  href={`/remixes/${remix.id}`}
                  className="group rounded-2xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-brand/50 hover:bg-surface-hover"
                >
                  <div className="relative mb-3 flex h-24 items-center justify-center gap-[3px] overflow-hidden rounded-xl bg-gradient-to-br from-vocals-dim to-beat-dim px-3">
                    {remix.cover_key ? (
                      // eslint-disable-next-line @next/next/no-img-element -- our own storage route, already square and small
                      <img
                        src={coverUrl(remix.id, remix.cover_key)!}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      barsFor(remix.id, 32).map((h, i) => (
                        <span
                          key={i}
                          className="w-1 flex-1 rounded-full bg-white/40 transition-colors group-hover:bg-white/80"
                          style={{ height: `${h}%` }}
                        />
                      ))
                    )}
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg text-white shadow-lg">
                        <Play className="fill-current" />
                      </span>
                    </span>
                    {remix.hot && (
                      <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-bold">
                        <Flame className="text-orange-400" /> Trending
                      </span>
                    )}
                  </div>
                  <h3 className="truncate font-semibold">{remix.title}</h3>
                  <div className="mt-1 flex items-center justify-between gap-2 text-sm text-muted">
                    <span className="truncate">by {remix.artist_name}</span>
                    <span className="shrink-0 text-xs tabular-nums">
                      <Heart /> {remix.likes} · <Play /> {remix.plays.toLocaleString("en-US")}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features ----------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading eyebrow="Why Remixt" title="A real studio, without the studio" />
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature icon={Brain} title="AI stem splitting" text="The same Demucs model the pros use, running on your GPU or CPU. No upload queue, no credits." />
          <Feature icon={Lock} title="Private by design" text="Your original song never leaves your device. Only the stems you choose to share go up." />
          <Feature icon={SlidersVertical} title="A DAW in a tab" text="Multitrack lanes, BPM sync, pitch and key matching, FX, automation, sample pads and vocal recording." />
          <Feature icon={Smartphone} title="Works on your phone" text="Queue a song from your phone and a computer splits it for you. Install it to your home screen like an app." />
          <Feature icon={Handshake} title="Remix together" text="Invite friends into a shared project and build a mix together, live." />
          <Feature icon={Rocket} title="Share anywhere" text="Short links, embeddable players and social clips — post your remix to TikTok, Instagram or your own site." />
        </div>
      </section>

      {/* FAQ ---------------------------------------------------------------- */}
      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionHeading eyebrow="FAQ" title="Questions, answered" />
          <div className="mt-8 flex flex-col gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl border border-border bg-surface p-4 open:border-brand/40">
                <summary className="flex list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final call --------------------------------------------------------- */}
      <section className="relative overflow-hidden border-t border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(ellipse at 50% 120%, color-mix(in srgb, var(--brand) 35%, transparent), transparent 60%)" }}
        />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <RemixtMark className="mx-auto mb-6 h-14 w-14 animate-float" />
          <h2 className="text-3xl font-black tracking-tight text-balance sm:text-5xl">Your first remix is 5 minutes away.</h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Publish it and you&apos;re straight to level 2 with the{" "}
            <span className="font-semibold text-foreground">
                <SlidersHorizontal className="text-brand-strong" /> First Remix
              </span> badge. Free, no install.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              href={user ? "/upload" : "/signup"}
              className="rounded-xl bg-brand px-8 py-4 text-center text-base font-semibold text-white shadow-lg shadow-brand/30 transition-transform hover:scale-[1.03] hover:bg-brand-strong"
            >
              {user ? "Split a song now" : "Create your free artist account"}
            </Link>
            <Link
              href="/studio"
              className="rounded-xl border border-border bg-surface px-8 py-4 text-center text-base font-semibold hover:bg-surface-hover"
            >
              Try the Studio first
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

const NO_NUMBERS: ArtistNumbers = {
  referrals: 0,
  published: 0,
  tracks: 0,
  likes: 0,
  plays: 0,
  followers: 0,
  likesGiven: 0,
  commentedOn: 0,
  splitsForOthers: 0,
  splitXp: 0,
  bestLikes: 0,
  bestPlays: 0,
};

function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : ""}>
      <p className="text-xs font-bold uppercase tracking-widest text-brand-strong">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {lead && <p className="mt-3 text-sm text-muted sm:text-base">{lead}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <CountUp value={value} className="block text-3xl font-black tabular-nums sm:text-4xl" />
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted sm:text-xs">{label}</div>
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
  return (
    <li className="flex gap-4 rounded-2xl border border-border bg-surface p-5">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
        style={{ background: `var(--${accent})` }}
      >
        {step}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
    </li>
  );
}

function XpRow({ label, xp }: { label: string; xp: number }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs font-bold tabular-nums text-success">+{xp} XP</span>
    </li>
  );
}

function Podium({ artists }: { artists: LeaderboardArtist[] }) {
  if (artists.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted">
        The board is empty —{" "}
        <Link href="/upload" className="font-medium text-brand-strong hover:underline">
          upload a song
        </Link>{" "}
        and take the #1 spot.
      </p>
    );
  }
  // Second, first, third — the winner in the middle, on the tallest step.
  const order = [artists[1], artists[0], artists[2]];
  const heights = ["h-16", "h-24", "h-12"];
  const ranks = [2, 1, 3];
  return (
    <div className="mt-6 grid grid-cols-3 items-end gap-2">
      {order.map((a, i) =>
        a ? (
          <Link key={a.id} href={`/artist/${a.id}`} className="group flex min-w-0 flex-col items-center text-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white ring-2 ring-background transition-transform group-hover:scale-110"
              style={{ background: a.avatar_color }}
            >
              {a.artist_name.slice(0, 1).toUpperCase()}
            </span>
            <span className="mt-2 w-full truncate text-xs font-semibold group-hover:underline">{a.artist_name}</span>
            <span className="text-[11px] tabular-nums text-muted">{a.level.xp.toLocaleString("en-US")} XP</span>
            <div
              className={`mt-2 flex w-full items-start justify-center rounded-t-lg border border-b-0 border-border bg-surface-raised pt-2 text-xl ${heights[i]}`}
            >
              <PlaceMedal rank={ranks[i]} />
            </div>
          </Link>
        ) : (
          <div key={i} />
        )
      )}
    </div>
  );
}

function Feature({ icon: FeatureIcon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-brand/40">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised text-xl text-brand-strong">
        <FeatureIcon />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  );
}

/** The hero's picture: a song splitting into a vocal and a beat lane, playing. */
function StudioMock() {
  const lanes = [
    { label: "Vocals", color: "var(--vocals)", bars: barsFor("vocals-demo", 40) },
    { label: "Beat", color: "var(--beat)", bars: barsFor("beat-demo-lane", 40) },
  ];
  return (
    <div className="relative mx-auto w-full max-w-lg" aria-hidden>
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-vocals/20 via-brand/10 to-beat/20 blur-2xl" />
      <div className="relative rounded-2xl border border-border bg-surface/90 p-4 shadow-2xl backdrop-blur sm:p-5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-drums/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="ml-2 truncate text-xs text-muted">Studio · my-first-remix</span>
          <span className="ml-auto rounded-md bg-surface-raised px-2 py-0.5 font-mono text-[10px] text-muted">124 BPM</span>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-background/60 p-3">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>
              <Music /> your-song.mp3
            </span>
            <span className="font-semibold text-success">
              <Check /> split by AI
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-vocals to-beat" />
          </div>
        </div>

        <div className="relative mt-3 flex flex-col gap-2">
          {lanes.map((lane) => (
            <div key={lane.label} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-wide" style={{ color: lane.color }}>
                {lane.label}
              </span>
              <div
                className="flex h-12 flex-1 items-center gap-[2px] overflow-hidden rounded-lg px-2"
                style={{ background: `color-mix(in srgb, ${lane.color} 14%, transparent)` }}
              >
                {lane.bars.map((h, i) => (
                  <span
                    key={i}
                    className="eq-bar flex-1 rounded-full"
                    style={{ height: `${h}%`, background: lane.color, ["--d" as string]: `${(i % 9) * -0.13}s` }}
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="pointer-events-none absolute inset-y-0 left-16 right-0">
            <div className="playhead absolute inset-y-0 w-0.5 bg-foreground/80 shadow-[0_0_8px_white]" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white">
            <Pause className="fill-current" />
          </span>
          <div className="flex flex-1 gap-1.5">
            {["Pitch +2", "Reverb", "Key: Am"].map((chip) => (
              <span key={chip} className="truncate rounded-md border border-border bg-surface-raised px-2 py-1 text-[10px] text-muted">
                {chip}
              </span>
            ))}
          </div>
          <span className="rounded-lg bg-gradient-to-r from-vocals to-beat px-3 py-1.5 text-[11px] font-bold text-white">
            Publish
          </span>
        </div>
      </div>

      <div className="animate-float absolute -right-2 -top-4 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-xl sm:-right-6">
        <span className="font-bold text-success">+100 XP</span> <span className="text-muted">remix published</span>
      </div>
      <div
        className="animate-float absolute -bottom-5 -left-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-xl sm:-left-6"
        style={{ animationDelay: "-2s" }}
      >
        <SlidersHorizontal className="text-brand-strong" /> <span className="font-semibold">Badge unlocked:</span> <span className="text-muted">First Remix</span>
      </div>
    </div>
  );
}
