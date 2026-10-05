// The "Club night" crowd: an energy meter that smooth mixing raises and
// clashing bass, keys or off-beat blends lower, plus random requests
// ("drop the vocals!"). Pure and seedable.

import { camelotCode } from "../musicKey";
import { bassClash, effBpm, energyAt, isAudible, keyRelation, phaseOffset, tempoDiffBpm } from "./djMath";
import type { DeckId, DjSnapshot } from "./djTypes";

export type RequestKind = "dropVocals" | "bassSwap" | "echoOut" | "loop" | "faster" | "mellow" | "siren";

export type CrowdRequest = {
  id: number;
  kind: RequestKind;
  text: string;
  /** Seconds the crowd will wait. */
  deadline: number;
  age: number;
  /** For requests that need two steps (e.g. bass killed, then restored). */
  stage: number;
  /** FX counter value when the request was made. */
  fxBase: number;
  heldFor: number;
};

export type CrowdState = {
  energy: number;
  energySum: number;
  energyTime: number;
  requests: CrowdRequest[];
  completed: number;
  failed: number;
  nextRequestIn: number;
  nextId: number;
  /** Plain-language reason the energy last moved, for the UI. */
  mood: string;
  /** Every request ever made, for the debrief. */
  history: { text: string; done: boolean }[];
};

export const REQUEST_TEXT: Record<RequestKind, string> = {
  dropVocals: "Drop the vocals! (kill the vocals on every playing deck)",
  bassSwap: "Cut the bass, then bring it back with a bang",
  echoOut: "Throw an echo out!",
  loop: "Loop it! (hold a loop for a few seconds)",
  faster: "Faster! (play something above 120 BPM)",
  mellow: "Slow it down a bit (under 105 BPM)",
  siren: "Siren! Hit the air horn or the siren",
};

export function newCrowd(rng: () => number): CrowdState {
  return {
    energy: 40,
    energySum: 0,
    energyTime: 0,
    requests: [],
    completed: 0,
    failed: 0,
    nextRequestIn: 25 + rng() * 15,
    nextId: 1,
    mood: "The crowd is warming up",
    history: [],
  };
}

const fxTotal = (snap: DjSnapshot, keys: string[]) => keys.reduce((t, k) => t + (snap.fx[k] ?? 0), 0);
const ECHO_KEYS = ["echo"];
const SIREN_KEYS = ["siren", "horn"];

function requestMet(r: CrowdRequest, snap: DjSnapshot, dt: number): boolean {
  const ids: DeckId[] = ["A", "B"];
  const playing = ids.filter((d) => isAudible(snap.decks[d], d, snap.mix));
  switch (r.kind) {
    case "dropVocals": {
      const ok = playing.length > 0 && playing.every((d) => snap.decks[d].stems.vocal) ;
      r.heldFor = ok ? r.heldFor + dt : 0;
      return r.heldFor >= 2;
    }
    case "bassSwap": {
      const anyKilled = ids.some((d) => snap.decks[d].playing && (snap.decks[d].kill.low || snap.decks[d].stems.bass));
      if (r.stage === 0 && anyKilled) r.stage = 1;
      if (r.stage === 1 && !anyKilled && playing.length > 0) return true;
      return false;
    }
    case "echoOut":
      return fxTotal(snap, ECHO_KEYS) > r.fxBase;
    case "siren":
      return fxTotal(snap, SIREN_KEYS) > r.fxBase;
    case "loop": {
      const ok = ids.some((d) => snap.decks[d].loop.active && snap.decks[d].playing);
      r.heldFor = ok ? r.heldFor + dt : 0;
      return r.heldFor >= 3;
    }
    case "faster": {
      const ok = playing.some((d) => effBpm(snap.decks[d]) >= 120);
      r.heldFor = ok ? r.heldFor + dt : 0;
      return r.heldFor >= 4;
    }
    case "mellow": {
      const ok = playing.length > 0 && playing.every((d) => effBpm(snap.decks[d]) < 105);
      r.heldFor = ok ? r.heldFor + dt : 0;
      return r.heldFor >= 4;
    }
  }
}

const KINDS: RequestKind[] = ["dropVocals", "bassSwap", "echoOut", "loop", "faster", "mellow", "siren"];

export function stepCrowd(crowd: CrowdState, snap: DjSnapshot, dt: number, rng: () => number): CrowdState {
  const { A, B } = snap.decks;
  const ids: DeckId[] = ["A", "B"];
  const audible = ids.filter((d) => isAudible(snap.decks[d], d, snap.mix));
  let target = 0;
  let drain = 0;
  let mood = crowd.mood;

  if (audible.length === 0) {
    target = 5;
    drain = 4;
    mood = "Dead air! The crowd is booing";
  } else {
    const e = Math.max(...audible.map((d) => energyAt(snap.decks[d].track!, snap.decks[d].position)));
    target = 35 + 45 * e;
    mood = e > 0.8 ? "The track is peaking" : "Steady groove";
    if (audible.length === 2) {
      const ms = Math.abs(phaseOffset(A, B).ms);
      const tempo = Math.abs(tempoDiffBpm(A, B));
      const rel = keyRelation(A, B, camelotCode);
      const clean = ms <= 45 && tempo <= 1.2;
      if (clean) {
        target += 12;
        mood = "Smooth blend: the crowd loves it";
      } else if (ms > 70 || tempo > 2.5) {
        drain += ms > 120 ? 4 : 2.5;
        mood = "Off-beat blend: the dancers lose the groove";
      }
      if (bassClash(snap)) {
        drain += 3;
        mood = "Two basses at once: muddy!";
      }
      if (rel && rel.fit === "clash") {
        drain += 1.5;
        mood = "Clashing keys: ouch";
      } else if (rel && (rel.fit === "same" || rel.fit === "relative") && clean) target += 4;
    }
  }

  const energy = Math.min(100, Math.max(0, crowd.energy + (target - crowd.energy) * 0.22 * dt - drain * dt));
  const next: CrowdState = {
    ...crowd,
    energy,
    energySum: crowd.energySum + energy * dt,
    energyTime: crowd.energyTime + dt,
    mood,
    requests: crowd.requests.map((r) => ({ ...r })),
    history: crowd.history,
  };

  // Requests: age them, resolve them, maybe make a new one.
  const keep: CrowdRequest[] = [];
  for (const r of next.requests) {
    r.age += dt;
    if (requestMet(r, snap, dt)) {
      next.completed++;
      next.energy = Math.min(100, next.energy + 12);
      next.mood = "Request played: the crowd cheers";
      next.history = [...next.history, { text: r.text, done: true }];
    } else if (r.age >= r.deadline) {
      next.failed++;
      next.energy = Math.max(0, next.energy - 8);
      next.mood = "A request was ignored";
      next.history = [...next.history, { text: r.text, done: false }];
    } else keep.push(r);
  }
  next.requests = keep;
  next.nextRequestIn -= dt;
  if (next.nextRequestIn <= 0 && next.requests.length < 2) {
    const kind = KINDS[Math.floor(rng() * KINDS.length)];
    next.requests.push({
      id: next.nextId++,
      kind,
      text: REQUEST_TEXT[kind],
      deadline: 28,
      age: 0,
      stage: 0,
      fxBase: kind === "echoOut" ? fxTotal(snap, ECHO_KEYS) : kind === "siren" ? fxTotal(snap, SIREN_KEYS) : 0,
      heldFor: 0,
    });
    next.nextRequestIn = 35 + rng() * 25;
  } else if (next.nextRequestIn <= 0) next.nextRequestIn = 10;
  return next;
}

/** 0..100 for the club mission's crowd sub-score. */
export function crowdScore(c: CrowdState) {
  const avg = c.energyTime > 0 ? c.energySum / c.energyTime : 0;
  const asked = c.completed + c.failed;
  const reqRate = asked > 0 ? c.completed / asked : 0.6;
  return Math.round(Math.min(100, avg * 0.8 + reqRate * 20));
}
