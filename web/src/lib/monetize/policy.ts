// Who an ad's money goes to, and the rules around it. Pure — shared by the
// server (which books every paid view) and the pages (which explain it), so
// the two can never disagree. Change a number here and every page, the
// ledger and the tests follow.
//
// The model, like the big platforms':
// - YouTube: the creator's share of the ads on their own videos (55/45),
//   and Content ID: a video using someone's music pays the music's owner.
// - Spotify / SoundCloud: rights holders are paid from what their tracks
//   earn; money for an artist who hasn't signed up is held for them.
// - Splits (DistroKid, SoundCloud): collaborators set who gets what.
//
// Three parties on anything made from music: the site (always), the
// music's rights holders (always) and the remixers (always). An ordinary
// page (home, tools, lists) is the site's alone.
//
// Money is counted in micros: 1 USD = 1,000,000. Whole numbers only, so
// sums are exact.

export const MICROS = 1_000_000;

/** Where an ad sits, which says whose it is. */
export type Placement = "site" | "remix" | "radio";

/** Shares of an ad's money, in basis points (10,000 = all of it). */
export type Split = { platform: number; artists: number; remixers: number };

export const SPLITS: Record<"site" | "remix" | "song", Split> = {
  /** An ordinary page: home, tools, lists, artist pages. */
  site: { platform: 10_000, artists: 0, remixers: 0 },
  /** A remix's page, or a remix on the radio. */
  remix: { platform: 3_000, artists: 4_000, remixers: 3_000 },
  /** A library song played as it is (the radio): no remixer. */
  song: { platform: 4_000, artists: 6_000, remixers: 0 },
};

/** A remix of a remix: this share of the remixers' part goes up to the remix it was made from. */
export const PARENT_SHARE_BP = 2_500;

/** How much a song counts for in a remix's artists' share, by the parts of it used (a lead vocal is the most recognisable). */
export function partWeight(kind: string): number {
  return kind === "vocals" ? 2 : 1;
}

/** Earnings wait this long before they can be paid out (refunds, invalid traffic found later). */
export const HOLD_DAYS = 30;
/** The least that can be paid out at once (bank and transfer fees). */
export const PAYOUT_MIN_MICROS = 10 * MICROS;

/** A paid view: the ad was at least half on screen for a second in a visible tab (the IAB/MRC display standard). */
export const VIEWABLE = { fraction: 0.5, ms: 1000 };
/** Paid views a network address can make in a day (shared Wi-Fi and phone networks share one address). */
export const PAID_VIEWS_PER_ADDRESS_PER_DAY = 60;

/** One person or account that money goes to. */
export type Recipient =
  | { kind: "platform" }
  /** A member, paid directly. */
  | { kind: "user"; userId: string }
  /** A song's rights holder who hasn't been verified yet: held under the song until they are. */
  | { kind: "held"; trackId: string };

export type Role = "platform" | "remixer" | "collaborator" | "parent-remixer" | "artist" | "vocalist";

export type Share = { to: Recipient; role: Role; weight: number; remixId?: string; trackId?: string };

/** A song a remix (or the radio) uses, and who holds its rights. */
export type SourceSong = {
  trackId: string;
  /** The parts of it used: "vocals", "beat", "drums"… (one entry per part). */
  parts: string[];
  /**
   * Who is paid for it: the verified owner of the rights (a claim accepted),
   * the singer of a take recorded in the booth — or nobody yet (null): held.
   */
  holderId: string | null;
  /** A take: the holder sang it (role "vocalist" rather than "artist"). */
  take?: boolean;
};

export type RemixParties = {
  remixId: string;
  ownerId: string;
  /** Co-remixers and their parts of the remixers' share (the owner keeps what's left). In basis points of that share. */
  collaborators: { userId: string; bp: number }[];
  parent: { remixId: string; ownerId: string } | null;
  sources: SourceSong[];
};

/** Splits `total` into whole parts in proportion to `weights`, adding up to exactly `total` (largest remainder). */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (Math.max(0, w) / sum) * total);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out;
}

/** The artists' part: each song by the parts of it used, each to its holder (or held for them). */
function artistShares(sources: SourceSong[], bp: number): Share[] {
  const songs = sources.filter((s) => s.parts.length);
  const weights = songs.map((s) => s.parts.reduce((sum, kind) => sum + partWeight(kind), 0));
  const parts = allocate(bp, weights);
  return songs.map((s, i) => ({
    to: s.holderId ? { kind: "user", userId: s.holderId } : { kind: "held", trackId: s.trackId },
    role: s.take ? "vocalist" : "artist",
    weight: parts[i],
    trackId: s.trackId,
  }));
}

/** Who gets what of one ad on a remix (or a remix on the radio), in basis points adding up to 10,000. */
export function remixShares(p: RemixParties): Share[] {
  const split = SPLITS.remix;
  const shares: Share[] = [{ to: { kind: "platform" }, role: "platform", weight: split.platform }];
  // No songs to pay (a remix of nothing?): their part stays with the remixers rather than vanish.
  const artists = p.sources.some((s) => s.parts.length) ? split.artists : 0;
  shares.push(...artistShares(p.sources, artists));
  let remixers = split.remixers + (split.artists - artists);
  if (p.parent && p.parent.ownerId !== p.ownerId) {
    const up = Math.round((remixers * PARENT_SHARE_BP) / 10_000);
    shares.push({ to: { kind: "user", userId: p.parent.ownerId }, role: "parent-remixer", weight: up, remixId: p.parent.remixId });
    remixers -= up;
  }
  const collaborators = p.collaborators.filter((c) => c.userId !== p.ownerId && c.bp > 0);
  const given = Math.min(9_000, collaborators.reduce((sum, c) => sum + c.bp, 0));
  // The owner always keeps at least a tenth of the remixers' part.
  const parts = allocate(remixers, [10_000 - given, ...collaborators.map((c) => (c.bp * given) / Math.max(1, collaborators.reduce((s, x) => s + x.bp, 0)))]);
  shares.push({ to: { kind: "user", userId: p.ownerId }, role: "remixer", weight: parts[0], remixId: p.remixId });
  collaborators.forEach((c, i) => shares.push({ to: { kind: "user", userId: c.userId }, role: "collaborator", weight: parts[i + 1], remixId: p.remixId }));
  return merge(shares);
}

/** Who gets what of one ad while a library song plays as it is (the radio). */
export function songShares(song: SourceSong): Share[] {
  return merge([{ to: { kind: "platform" }, role: "platform", weight: SPLITS.song.platform }, ...artistShares([song], SPLITS.song.artists)]);
}

/** An ordinary page's ad: the site's. */
export function siteShares(): Share[] {
  return [{ to: { kind: "platform" }, role: "platform", weight: 10_000 }];
}

const keyOf = (s: Share) => `${s.role}|${s.to.kind}|${"userId" in s.to ? s.to.userId : "trackId" in s.to ? s.to.trackId : ""}|${s.remixId ?? ""}|${s.trackId ?? ""}`;

/** One row per recipient and role (a song used twice, say), none at zero. */
function merge(shares: Share[]): Share[] {
  const out = new Map<string, Share>();
  for (const s of shares) {
    const k = keyOf(s);
    const had = out.get(k);
    if (had) had.weight += s.weight;
    else out.set(k, { ...s });
  }
  return [...out.values()].filter((s) => s.weight > 0);
}

/** An amount (micros) shared out by `shares`: whole micros adding up to exactly `micros`. */
export function payOut(micros: number, shares: Share[]): (Share & { micros: number })[] {
  const amounts = allocate(micros, shares.map((s) => s.weight));
  return shares.map((s, i) => ({ ...s, micros: amounts[i] })).filter((s) => s.micros > 0);
}

/** Whether a viewer is one of those who'd be paid (their own views don't earn). */
export function isOwnView(viewerId: string | null, shares: Share[]): boolean {
  return !!viewerId && shares.some((s) => s.to.kind === "user" && s.to.userId === viewerId);
}

// ——— the game around it ———
// Never anything for clicking ads (every ad network forbids it, and it's
// fraud): progress is about people seeing your work, and being paid.

export type EarnFacts = { paidViews: number; lifetimeMicros: number; payouts: number; verifiedSongs: number; collaborations: number; earningRemixes: number };

export type EarnBadge = { id: string; label: string; description: string; value: number; goal: number; done: boolean };

export function earnBadges(f: EarnFacts): EarnBadge[] {
  const b = (id: string, label: string, description: string, value: number, goal: number): EarnBadge => ({ id, label, description, value: Math.min(value, goal), goal, done: value >= goal });
  return [
    b("first-cent", "First Cent", "Earn from a view of your work", f.lifetimeMicros > 0 ? 1 : 0, 1),
    b("thousand-views", "Thousand Views", "1,000 paid views of your work", f.paidViews, 1000),
    b("payday", "Payday", "Get your first payout", f.payouts, 1),
    b("rights-verified", "The Real Artist", "Get a song of yours verified", f.verifiedSongs, 1),
    b("crew", "Crew", "Share a remix's earnings with a collaborator", f.collaborations, 1),
    b("catalogue", "Catalogue", "5 remixes earning", f.earningRemixes, 5),
    b("ten-dollars", "Ten Dollar Club", "Earn $10 in all", f.lifetimeMicros, 10 * MICROS),
    b("hundred-dollars", "Hundred Dollar Club", "Earn $100 in all", f.lifetimeMicros, 100 * MICROS),
  ];
}

/** Money for people: "$0.42", "$12.30", "<$0.01". */
export function formatMoney(micros: number): string {
  if (micros > 0 && micros < MICROS / 100) return "<$0.01";
  return `$${(micros / MICROS).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What 1,000 paid views earned (RPM). */
export function rpm(micros: number, views: number): number {
  return views ? Math.round((micros * 1000) / views) : 0;
}
