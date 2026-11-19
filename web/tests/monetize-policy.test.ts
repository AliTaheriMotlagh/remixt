// lib/monetize/policy.ts: who an ad's money goes to. The rules the owner
// asked for are checked here outright: the site always has a share, the
// music's rights holders always have one, the remixers always have one —
// and every amount adds up to exactly what came in.
//
//   node --import ./tests/support/register.mjs --test tests/monetize-policy.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  allocate, earnBadges, formatMoney, isOwnView, MICROS, payOut, remixShares, siteShares, songShares,
  type RemixParties, type Share,
} from "../src/lib/monetize/policy.ts";
import { DEFAULTS } from "../src/lib/settings/registry.ts";

// The rules as the site starts (Admin → Settings can change them; the rules take them as an argument).
const SPLITS = DEFAULTS.shares;
const SONG_HELPERS = DEFAULTS.shares;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const byRole = (shares: Share[], role: string) => sum(shares.filter((s) => s.role === role).map((s) => s.weight));

const remix: RemixParties = {
  remixId: "r1",
  ownerId: "maker",
  collaborators: [],
  parent: null,
  sources: [
    { trackId: "song-a", parts: ["vocals"], holderId: "artist-a" },
    { trackId: "song-b", parts: ["beat"], holderId: null },
  ],
};

describe("splits", () => {
  test("every split adds up to the whole, and a remix's always pays all three", () => {
    for (const s of [SPLITS.remix, SPLITS.song]) assert.equal(s.platform + s.artists + s.remixers, 10_000);
    assert.ok(SPLITS.remix.platform > 0 && SPLITS.remix.artists > 0 && SPLITS.remix.remixers > 0);
    assert.ok(SPLITS.song.platform > 0 && SPLITS.song.artists > 0);
  });

  test("a remix: site, the songs' artists (vocal counts double) and the remixer", () => {
    const shares = remixShares(remix);
    assert.equal(sum(shares.map((s) => s.weight)), 10_000);
    // No uploader or miner known here: Remixt keeps their part.
    assert.equal(byRole(shares, "platform"), SPLITS.remix.platform);
    assert.equal(byRole(shares, "remixer"), SPLITS.remix.remixers);
    const a = shares.find((s) => s.trackId === "song-a")!;
    const b = shares.find((s) => s.trackId === "song-b")!;
    // Song A gives the vocal (counts 2), song B the beat (1): A gets twice B's part, to the basis point.
    assert.ok(Math.abs(a.weight - 2 * b.weight) <= 2, `${a.weight} vs ${b.weight}`);
    assert.equal(a.weight + b.weight, SPLITS.remix.artists);
    assert.deepEqual(a.to, { kind: "user", userId: "artist-a" });
    // Nobody verified for song B yet: its money is held for its artist, not given to whoever uploaded it.
    assert.deepEqual(b.to, { kind: "held", trackId: "song-b" });
  });

  test("a take recorded in the booth pays its singer as the vocalist", () => {
    const shares = remixShares({ ...remix, sources: [{ trackId: "take", parts: ["vocals"], holderId: "singer", take: true }, remix.sources[1]] });
    assert.ok(shares.some((s) => s.role === "vocalist" && s.to.kind === "user" && s.to.userId === "singer"));
  });

  test("a remix of a remix: the remix it came from gets its part of the remixers' share", () => {
    const shares = remixShares({ ...remix, parent: { remixId: "r0", ownerId: "first-maker" } });
    assert.equal(sum(shares.map((s) => s.weight)), 10_000);
    assert.ok(byRole(shares, "parent-remixer") > 0);
    assert.equal(byRole(shares, "parent-remixer") + byRole(shares, "remixer"), SPLITS.remix.remixers);
  });

  test("collaborators share the remixers' part; the owner always keeps some", () => {
    const shares = remixShares({ ...remix, collaborators: [{ userId: "c1", bp: 6000 }, { userId: "c2", bp: 6000 }] });
    assert.equal(sum(shares.map((s) => s.weight)), 10_000);
    assert.ok(byRole(shares, "remixer") >= SPLITS.remix.remixers / 10);
    assert.equal(byRole(shares, "remixer") + byRole(shares, "collaborator"), SPLITS.remix.remixers);
  });

  test("a song on the radio: site and artist; an ordinary page: the site's", () => {
    const shares = songShares({ trackId: "s", parts: ["vocals", "beat"], holderId: null });
    assert.equal(sum(shares.map((s) => s.weight)), 10_000);
    assert.equal(byRole(shares, "artist"), SPLITS.song.artists);
    assert.deepEqual(siteShares().map((s) => s.weight), [10_000]);
  });

  test("an amount is paid out to the micro, whatever it is", () => {
    const shares = remixShares({ ...remix, parent: { remixId: "r0", ownerId: "p" }, collaborators: [{ userId: "c", bp: 3333 }] });
    for (const micros of [1, 7, 999, 1_234_567, 3 * MICROS]) {
      assert.equal(sum(payOut(micros, shares).map((p) => p.micros)), micros);
    }
    assert.deepEqual(allocate(10, [1, 1, 1]), [4, 3, 3]);
    assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  });

  test("your own views don't earn", () => {
    const shares = remixShares(remix);
    assert.ok(isOwnView("maker", shares));
    assert.ok(isOwnView("artist-a", shares));
    assert.ok(!isOwnView("listener", shares));
    assert.ok(!isOwnView(null, shares));
  });
});

describe("the game", () => {
  test("badges are about views and pay, never clicks", () => {
    const badges = earnBadges({ paidViews: 1500, lifetimeMicros: 2 * MICROS, payouts: 0, verifiedSongs: 1, collaborations: 0, earningRemixes: 2 });
    assert.ok(badges.find((b) => b.id === "thousand-views")!.done);
    assert.ok(!badges.find((b) => b.id === "payday")!.done);
    assert.ok(badges.every((b) => !/click/i.test(b.description)));
  });

  test("money reads like money", () => {
    assert.equal(formatMoney(0), "$0.00");
    assert.equal(formatMoney(4_200), "<$0.01");
    assert.equal(formatMoney(12_300_000), "$12.30");
  });
});

describe("uploaders and miners", () => {
  const helped: RemixParties = {
    ...remix,
    sources: [
      { trackId: "song-a", parts: ["vocals"], holderId: "artist-a", uploaderId: "up-a", minerId: "miner-a" },
      { trackId: "song-b", parts: ["beat"], holderId: null, uploaderId: "up-b", minerId: "up-b" },
    ],
  };

  test("paid from Remixt's part: the artists' and remixers' parts don't move", () => {
    const shares = remixShares(helped);
    assert.equal(sum(shares.map((s) => s.weight)), 10_000);
    assert.equal(byRole(shares, "uploader"), SONG_HELPERS.uploader);
    assert.equal(byRole(shares, "miner"), SONG_HELPERS.miner);
    assert.equal(byRole(shares, "platform") + byRole(shares, "uploader") + byRole(shares, "miner"), SPLITS.remix.platform);
    assert.equal(byRole(shares, "artist"), SPLITS.remix.artists);
    assert.equal(byRole(shares, "remixer"), SPLITS.remix.remixers);
    assert.ok(byRole(shares, "platform") > 0, "Remixt always keeps a share");
  });

  test("shared between the songs like the artists' part (a vocal counts double)", () => {
    const shares = remixShares(helped);
    const up = (id: string) => shares.find((s) => s.role === "uploader" && s.to.kind === "user" && s.to.userId === id)!.weight;
    assert.ok(Math.abs(up("up-a") - 2 * up("up-b")) <= 2, `${up("up-a")} vs ${up("up-b")}`);
  });

  test("a song split in its uploader's own browser pays them both parts", () => {
    const shares = remixShares(helped);
    const toB = shares.filter((s) => s.to.kind === "user" && s.to.userId === "up-b").map((s) => s.role).sort();
    assert.deepEqual(toB, ["miner", "uploader"]);
  });

  test("an account that's gone: its part stays with Remixt", () => {
    const shares = remixShares({ ...helped, sources: helped.sources.map((s) => ({ ...s, uploaderId: null, minerId: null })) });
    assert.equal(byRole(shares, "platform"), SPLITS.remix.platform);
    assert.equal(byRole(shares, "uploader") + byRole(shares, "miner"), 0);
  });

  test("a take pays its singer as the vocalist, not again as uploader", () => {
    const shares = remixShares({ ...remix, sources: [{ trackId: "take", parts: ["vocals"], holderId: "singer", take: true, uploaderId: "singer", minerId: "singer" }] });
    assert.ok(!shares.some((s) => s.role === "uploader" || s.role === "miner"));
  });

  test("a song on the radio pays its uploader and miner too", () => {
    const shares = songShares({ trackId: "s", parts: ["vocals", "beat"], holderId: null, uploaderId: "u", minerId: "m" });
    assert.equal(sum(shares.map((s) => s.weight)), 10_000);
    assert.equal(byRole(shares, "artist"), SPLITS.song.artists);
    assert.equal(byRole(shares, "uploader"), SONG_HELPERS.uploader);
    assert.equal(byRole(shares, "miner"), SONG_HELPERS.miner);
  });
});

describe("the owner's own numbers", () => {
  const rules = {
    ...DEFAULTS.shares,
    remix: { platform: 2_000, artists: 5_000, remixers: 3_000 },
    uploader: 700,
    miner: 0,
    parent: 5_000,
    vocalWeight: 3,
    ownerKeeps: 5_000,
  };

  test("a remix is shared by the shares the owner set", () => {
    const shares = remixShares(
      {
        ...remix,
        parent: { remixId: "r0", ownerId: "first" },
        collaborators: [{ userId: "c", bp: 9_000 }],
        sources: remix.sources.map((x) => ({ ...x, uploaderId: "up", minerId: "m" })),
      },
      rules
    );
    assert.equal(sum(shares.map((s) => s.weight)), 10_000);
    assert.equal(byRole(shares, "artist") + byRole(shares, "vocalist"), 5_000);
    assert.equal(byRole(shares, "uploader"), 700);
    assert.equal(byRole(shares, "miner"), 0, "a 0% miner share pays nobody");
    assert.equal(byRole(shares, "platform"), 1_300);
    assert.equal(byRole(shares, "parent-remixer"), 1_500, "half of the remixers' 30%");
    // The maker keeps at least half of what's left of the remixers' part, however much they gave.
    assert.ok(byRole(shares, "remixer") >= 750, String(byRole(shares, "remixer")));
  });

  test("a vocal can count more", () => {
    const shares = remixShares(remix, rules);
    const a = shares.find((s) => s.trackId === "song-a" && s.role === "artist")!;
    const b = shares.find((s) => s.trackId === "song-b")!;
    assert.ok(Math.abs(a.weight - 3 * b.weight) <= 3, `${a.weight} vs ${b.weight}`);
  });

  test("a remixers' part set for songs stays with Remixt (a song has no remixer)", () => {
    const shares = songShares({ trackId: "s", parts: ["vocals"], holderId: null }, { ...DEFAULTS.shares, song: { platform: 3_000, artists: 6_000, remixers: 1_000 } });
    assert.equal(sum(shares.map((s) => s.weight)), 10_000);
    assert.equal(byRole(shares, "platform"), 4_000);
  });
});
