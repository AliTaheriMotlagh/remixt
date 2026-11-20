// Private songs and making music together — the rules, pure (the server
// enforces them, the pages explain them, the tests hold them).
//
// The story it's for: a producer uploads a beat "only me", shares it with a
// vocalist, the vocalist sings over it in a shared project, and together they
// decide what goes public — the finished remix, the beat on its own in the
// library, the vocal on its own, or nothing yet.
//
// - A song is private (its owner, and the people they share it with) or
//   public. A public song can still hold some of its parts back from the
//   public library ("publish the beat, keep the vocal").
// - A private part plays wherever its owner put it to be heard: in their
//   own remixes, in a shared project they're part of, and in a published
//   remix once they agreed to it.
// - Publishing a remix that uses someone else's private song asks them
//   first. Until every such owner agrees, the remix stays private (it's
//   saved; nothing is lost) and goes public by itself on the last "yes".

export type Visibility = "public" | "private";

/** One part (stem) of a song, as far as who may use it goes. */
export type PartAccess = {
  ownerId: string;
  visibility: Visibility;
  /** A public song's part its owner keeps out of the library. */
  heldBack: boolean;
  /** People the owner shared the song with. */
  sharedWith: readonly string[];
};

/** In the public library: a public song's part that isn't held back. */
export function isPublicPart(p: Pick<PartAccess, "visibility" | "heldBack">): boolean {
  return p.visibility === "public" && !p.heldBack;
}

/** In this person's library (and Studio): public, theirs, or shared with them. */
export function inLibraryOf(p: PartAccess, viewerId: string | null): boolean {
  if (isPublicPart(p)) return true;
  if (!viewerId) return false;
  return p.ownerId === viewerId || p.sharedWith.includes(viewerId);
}

/** A song a remix uses, for the publish check. */
export type UsedSong = {
  trackId: string;
  title: string;
  ownerId: string;
  ownerName: string;
  /** Every part of it the remix uses is in the public library. */
  allPublic: boolean;
};

export type ConsentStatus = "asked" | "agreed" | "declined";

export type Waiting = { trackId: string; title: string; ownerId: string; ownerName: string; status: ConsentStatus | "not asked" };

/**
 * The songs whose owners must agree before `publisherId` makes the remix
 * public: someone else's song with a part not in the public library, and
 * not yet agreed to. Empty: it can go public now.
 */
export function waitingFor(songs: UsedSong[], publisherId: string, consents: ReadonlyMap<string, ConsentStatus>): Waiting[] {
  const seen = new Set<string>();
  const out: Waiting[] = [];
  for (const s of songs) {
    if (seen.has(s.trackId)) continue;
    seen.add(s.trackId);
    if (s.allPublic || s.ownerId === publisherId) continue;
    const status = consents.get(s.trackId);
    if (status === "agreed") continue;
    out.push({ trackId: s.trackId, title: s.title, ownerId: s.ownerId, ownerName: s.ownerName, status: status ?? "not asked" });
  }
  return out;
}

/** What the publisher is told while it waits. */
export function waitingMessage(waiting: Waiting[]): string {
  if (!waiting.length) return "";
  const declined = waiting.filter((w) => w.status === "declined");
  if (declined.length) {
    return `${declined[0].ownerName} doesn't want “${declined[0].title}” in a public remix. Take it out to publish, or ask them again.`;
  }
  const names = [...new Set(waiting.map((w) => w.ownerName))];
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Saved privately. It goes public as soon as ${who} ${names.length === 1 ? "agrees" : "agree"} to share ${waiting.length === 1 ? `“${waiting[0].title}”` : "their songs"} in it — we've asked.`;
}

// ——— publishing a song's parts ———

export const PART_KINDS = ["vocals", "beat", "drums", "bass", "other"] as const;
export type PartKind = (typeof PART_KINDS)[number];

/**
 * What "publish" means for a song: the parts that go in the public library.
 * None: the song stays private. Some: public, the rest held back. Unknown
 * kinds are ignored; only kinds the song has count.
 */
export function publishPlan(has: readonly string[], chosen: readonly string[]): { visibility: Visibility; heldBack: string[]; published: string[] } {
  const published = has.filter((k) => chosen.includes(k));
  if (!published.length) return { visibility: "private", heldBack: [], published: [] };
  return { visibility: "public", heldBack: has.filter((k) => !published.includes(k)), published };
}

// ——— working together ———

export const ROLES = ["producer", "vocalist", "songwriter", "mixer", "instrumentalist", "listener"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_TEXT: Record<Role, { en: string; fa: string; edits: boolean; help: string }> = {
  producer: { en: "Producer", fa: "تهیه‌کننده", edits: true, help: "Makes the beat and arranges the mix." },
  vocalist: { en: "Vocalist", fa: "خواننده", edits: true, help: "Sings: records takes in the booth." },
  songwriter: { en: "Songwriter", fa: "ترانه‌سرا", edits: true, help: "Writes the words: edits the lyrics." },
  mixer: { en: "Mix engineer", fa: "میکس", edits: true, help: "Balances and polishes the mix." },
  instrumentalist: { en: "Instrumentalist", fa: "نوازنده", edits: true, help: "Plays a part: adds lanes." },
  listener: { en: "Listener", fa: "شنونده", edits: false, help: "Hears it and comments; can't change the mix." },
};

export function isRole(x: unknown): x is Role {
  return typeof x === "string" && (ROLES as readonly string[]).includes(x);
}

/** Who may change what in a shared project. The owner always may. */
export function mayEdit(member: { owner: boolean; canEdit: boolean }): boolean {
  return member.owner || member.canEdit;
}

/**
 * Suggested shares of the remixers' earnings for a project's members, in
 * basis points (10,000 = 100%): equal among those who made it (listeners
 * get none), the owner keeping at least `ownerKeeps` and any rounding.
 */
export function suggestedSplits(members: { id: string; owner: boolean; role: Role }[], ownerKeeps = 1_000): { userId: string; bp: number }[] {
  const makers = members.filter((m) => m.role !== "listener" || m.owner);
  if (!makers.length) return [];
  const each = Math.floor(10_000 / makers.length);
  const out = makers.map((m) => ({ userId: m.id, bp: each }));
  const owner = out.find((o) => makers.find((m) => m.id === o.userId)?.owner) ?? out[0];
  owner.bp += 10_000 - each * makers.length;
  if (owner.bp < ownerKeeps) {
    // Take what the owner is short of evenly from the others.
    let short = ownerKeeps - owner.bp;
    const others = out.filter((o) => o !== owner);
    while (short > 0 && others.some((o) => o.bp > 0)) {
      for (const o of others) {
        if (short <= 0) break;
        if (o.bp > 0) {
          o.bp -= 1;
          owner.bp += 1;
          short -= 1;
        }
      }
    }
  }
  return out;
}
