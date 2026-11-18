// A new song from everything in the mix: several songs' vocals and beats
// turned into one song — who sings when, which beat plays under which
// part, drops on the choruses, one tempo and key. This is the plan, pure
// and tested (tests/new-song.test.ts); aiIdeas.ts (newSongIdea) hears the
// songs, hands their shape in here, and lays the plan out as clips.
//
// The song: intro → verse → chorus (on a drop) → verse → chorus → bridge →
// final chorus → outro, three to four minutes. Parts change only on 8- or
// 16-bar lines; the bar before each drop is a breath of silence for the
// beat (the build). Every choice comes with a plain sentence of why.

import { bestKeyShift, keyLabel, type MusicalKey } from "./musicKey";

export type NsSection = {
  /** Its index in the vocal's heard sections. */
  index: number;
  /** How many bars it's sung over. */
  bars: number;
  /** Its loudness against the vocal's other sections (0–1). */
  energy: number;
  /** A chorus: its lines (the lyrics) or its notes (the chroma) come back elsewhere in the song. */
  chorus: boolean;
  /** Its average pitch-class profile (12 values), for checking two voices agree when they sing together. */
  chroma?: number[];
  /** Its first sung line, when the lyrics are timed (shown on the song map). */
  line?: string;
};

export type NsVocal = { id: string; song: string; bpm: number; key: MusicalKey | null; sections: NsSection[] };

export type NsBeat = {
  id: string;
  song: string;
  bpm: number;
  key: MusicalKey | null;
  /** Its bars: the intro (before full strength), the body, and where its music ends. */
  introBars: number;
  endBar: number;
  /** Each bar's loudness. */
  barEnergy: number[];
};

export type NsPart = {
  id: string;
  kind: "vocal" | "beat";
  song: string;
  /** How much faster it plays (1.04 = 4% faster). */
  speed: number;
  /** Pitch shift into the song's key. */
  semitones: number;
  used: boolean;
  /** When it's left out: why, in plain words. */
  why?: string;
};

export type SlotName = "Intro" | "Verse" | "Chorus" | "Bridge" | "Outro";

export type NsSlot = {
  name: SlotName;
  /** "Verse 2", "Final chorus". */
  label: string;
  /** First bar of the new song (0-based) and how many bars. */
  start: number;
  bars: number;
  /** The beat under it, from which of its own bars. */
  beat: { id: string; fromBar: number } | null;
  /** Who sings: a vocal's section, for this many of the slot's bars, from bar `at` of the slot. */
  vocals: { id: string; section: number; at: number; bars: number }[];
  /** A chorus on the beat's loudest part. */
  drop: boolean;
  /** Its last bar is a breath of silence for the beat, before a drop. */
  build: boolean;
  why: string;
};

/** The person's changes to the plan (the tools under the song map). */
export type NsTweaks = {
  /** Longer or shorter: a verse and chorus more (1) or fewer (−1) than the plan's own. */
  length?: -1 | 0 | 1;
  /** More of one singer (a vocal's id): first verse, every other verse and the choruses. */
  favour?: string;
  /** The beat the drops are on (a beat's id). */
  dropBeat?: string;
  /** One part (by its index in the song) sung by another vocal or played over another beat. */
  swaps?: Record<number, { vocal?: string; beat?: string }>;
};

export type NsPlan = {
  bpm: number;
  key: MusicalKey | null;
  parts: NsPart[];
  slots: NsSlot[];
  bars: number;
  seconds: number;
  notes: string[];
};

/** Beyond these, a part would sound bent out of shape — left out. */
const MAX_BEAT_SPEED = 0.12;
const MAX_VOCAL_SPEED = 0.15;
const MAX_VOCAL_SHIFT = 4;
const MAX_BEAT_SHIFT = 5;
/** Two voices sing at once only when their notes agree this well (cosine of their pitch-class profiles). */
const SAME_NOTES = 0.8;

const SHORTEST = 180;
const LONGEST = 240;

/** The speed `bpm` must play at to reach `target` — as itself, at half or at double time, whichever is least bent. */
export function speedTo(bpm: number, target: number): number {
  if (!(bpm > 0) || !(target > 0)) return 1;
  return [1, 2, 0.5].map((m) => target / (bpm * m)).sort((a, b) => Math.abs(Math.log(a)) - Math.abs(Math.log(b)))[0];
}

const bent = (speed: number) => Math.abs(speed - 1);
const pct = (speed: number) => `${Math.round(Math.abs(speed - 1) * 100)}%`;

/** How alike two pitch-class profiles are (0–1). */
export function chromaMatch(a: number[] | undefined, b: number[] | undefined): number {
  if (!a?.length || !b?.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** A pitch-class profile moved by `semitones`. */
function shiftChroma(chroma: number[] | undefined, semitones: number) {
  if (!chroma) return undefined;
  return chroma.map((_, i) => chroma[(((i - semitones) % 12) + 12) % 12]);
}

/** The beat's full-strength bars, as a run. */
function body(beat: NsBeat) {
  const from = Math.max(0, Math.min(beat.introBars, beat.endBar - 8));
  return { from, to: Math.max(from + 1, beat.endBar) };
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** The beat's loudest stretch of `bars` bars in its body: its own drop. */
function loudestRun(beat: NsBeat, bars: number): number {
  const { from, to } = body(beat);
  let best = from;
  let top = -Infinity;
  for (let b = from; b + Math.min(bars, to - from) <= to; b += 4) {
    const e = mean(beat.barEnergy.slice(b, b + bars));
    if (e > top) {
      top = e;
      best = b;
    }
  }
  return best;
}

/** How a beat would serve as the song's spine: long, strong, and close in tempo and key to the vocals. */
function spineScore(beat: NsBeat, vocals: NsVocal[]) {
  const { from, to } = body(beat);
  let cost = 0;
  for (const v of vocals) {
    cost += bent(speedTo(v.bpm, beat.bpm)) * 20;
    if (v.key && beat.key) cost += Math.abs(bestKeyShift(v.key, beat.key).semitones) * 0.6;
  }
  return Math.min(64, to - from) / 8 + mean(beat.barEnergy.slice(from, to)) * 2 - cost / Math.max(1, vocals.length);
}

type Shape = { name: SlotName; bars: number }[];

/** The song's parts, fitted to three or four minutes at `bpm`. */
export function songShape(bpm: number, verses = 2, fit = true): Shape {
  const shape: Shape = [{ name: "Intro", bars: 8 }];
  for (let v = 0; v < verses; v++) shape.push({ name: "Verse", bars: 16 }, { name: "Chorus", bars: 16 });
  shape.push({ name: "Bridge", bars: 8 }, { name: "Chorus", bars: 16 }, { name: "Outro", bars: 8 });
  const seconds = (s: Shape) => (s.reduce((n, p) => n + p.bars, 0) * 240) / bpm;
  // Too long: no bridge first, then 8-bar verses, then 8-bar choruses (never the last).
  const shrink = () => {
    const bridge = shape.findIndex((p) => p.name === "Bridge");
    if (bridge >= 0) return !!shape.splice(bridge, 1);
    const verse = shape.find((p) => p.name === "Verse" && p.bars === 16);
    if (verse) return !!(verse.bars = 8);
    const lastChorus = shape.map((p) => p.name).lastIndexOf("Chorus");
    const chorus = shape.find((p, i) => p.name === "Chorus" && p.bars === 16 && i !== lastChorus);
    if (chorus) return !!(chorus.bars = 8);
    return false;
  };
  if (!fit) return shape;
  while (seconds(shape) > LONGEST && shrink());
  // Too short: another verse and chorus, then a longer intro and outro.
  if (seconds(shape) < SHORTEST && verses < 3) return songShape(bpm, verses + 1);
  if (seconds(shape) < SHORTEST) {
    shape[0].bars = 16;
    shape[shape.length - 1].bars = 16;
  }
  return shape;
}

/**
 * The plan for a new song from `vocals` and `beats` (each heard from a
 * song in the mix): one tempo and key, the parts that fit, and the song
 * laid out part by part. Throws when there's no vocal or no beat to use.
 */
export function planNewSong({ vocals, beats, tweaks = {} }: { vocals: NsVocal[]; beats: NsBeat[]; tweaks?: NsTweaks }): NsPlan {
  const singing = vocals.filter((v) => v.sections.length);
  const playing = beats.filter((b) => b.endBar - body(b).from >= 8);
  if (!singing.length) throw new Error("No vocal with clear enough singing to build a song from");
  if (!playing.length) throw new Error("No beat long enough to build a song on (it needs 8 bars at full strength)");

  // The spine: the beat everything else is fitted to.
  const spine = [...playing].sort((a, b) => spineScore(b, singing) - spineScore(a, singing))[0];
  const bpm = Math.round(spine.bpm * 100) / 100;
  const key = spine.key ?? singing.find((v) => v.key)?.key ?? null;
  const notes: string[] = [`“${spine.song}” is the song's spine: ${Math.round(bpm)} BPM${key ? `, ${keyLabel(key)}` : ""} — everything else is fitted to it`];

  const parts: NsPart[] = [];
  const fit = (id: string, kind: "vocal" | "beat", song: string, own: number, ownKey: MusicalKey | null) => {
    const speed = speedTo(own, bpm);
    const semitones = ownKey && key ? bestKeyShift(ownKey, key).semitones : 0;
    const tooFast = bent(speed) > (kind === "vocal" ? MAX_VOCAL_SPEED : MAX_BEAT_SPEED);
    const tooFar = Math.abs(semitones) > (kind === "vocal" ? MAX_VOCAL_SHIFT : MAX_BEAT_SHIFT);
    const part: NsPart = { id, kind, song, speed, semitones, used: !tooFast && !tooFar };
    if (tooFast) part.why = `it would have to play ${pct(speed)} ${speed > 1 ? "faster" : "slower"} to keep time — it would sound bent`;
    else if (tooFar) part.why = `it would have to move ${Math.abs(semitones)} semitones to be in key — ${kind === "vocal" ? "the voice would sound unnatural" : "it would sound off"}`;
    parts.push(part);
    return part;
  };
  for (const b of playing) fit(b.id, "beat", b.song, b.bpm, b.key);
  for (const v of singing) fit(v.id, "vocal", v.song, v.bpm, v.key);
  // Never nothing: the least bent vocal stays in even when every one is bent too far.
  if (!parts.some((p) => p.kind === "vocal" && p.used)) {
    const least = parts.filter((p) => p.kind === "vocal").sort((a, b) => bent(a.speed) + Math.abs(a.semitones) / 10 - (bent(b.speed) + Math.abs(b.semitones) / 10))[0];
    least.used = true;
    notes.push(`“${least.song}”'s vocal is kept although ${least.why} — it's the closest of them`);
    delete least.why;
  }
  for (const p of parts) if (!p.used && p.why) notes.push(`Left out ${p.song}'s ${p.kind}: ${p.why}`);
  const usedVocals = singing.filter((v) => parts.some((p) => p.id === v.id && p.used));
  // More of one singer: they lead.
  const favoured = usedVocals.find((v) => v.id === tweaks.favour);
  if (favoured) {
    usedVocals.splice(usedVocals.indexOf(favoured), 1);
    usedVocals.unshift(favoured);
  }
  const usedBeats = playing.filter((b) => parts.some((p) => p.id === b.id && p.used));
  const partOf = (id: string) => parts.find((p) => p.id === id)!;

  // --- The shape, and the beat under each part ---
  const fitted = songShape(bpm);
  const shape = tweaks.length ? songShape(bpm, Math.max(1, fitted.filter((p) => p.name === "Verse").length + tweaks.length), false) : fitted;
  // The drop beat: the strongest body; verses go round the others (or it), so the song travels.
  const strength = (b: NsBeat) => mean(b.barEnergy.slice(loudestRun(b, 8), loudestRun(b, 8) + 8));
  const byStrength = [...usedBeats].sort((a, b) => strength(b) - strength(a));
  const dropBeat = usedBeats.find((b) => b.id === tweaks.dropBeat) ?? byStrength[0];
  const uses = new Map<string, number>(usedBeats.map((b) => [b.id, 0]));
  /** The beat for a verse or bridge: the one heard least so far — not the spine or the drop beat while another is waiting — so every beat gets its turn. */
  const travellingBeat = (): NsBeat => {
    const others = usedBeats.filter((b) => b !== dropBeat && b !== spine);
    const pool = others.length ? [...others, ...usedBeats.filter((b) => !others.includes(b))] : usedBeats;
    const pick = [...pool].sort((a, b) => (uses.get(a.id) ?? 0) - (uses.get(b.id) ?? 0) || pool.indexOf(a) - pool.indexOf(b))[0];
    uses.set(pick.id, (uses.get(pick.id) ?? 0) + 1);
    return pick;
  };
  const cursor = new Map<string, number>(usedBeats.map((b) => [b.id, body(b).from]));
  /** The next `bars` of a beat's body, carrying on from where it last played (round again at its end). */
  const nextBars = (b: NsBeat, bars: number) => {
    const { from, to } = body(b);
    let at = cursor.get(b.id) ?? from;
    if (at + Math.min(bars, to - from) > to) at = from;
    cursor.set(b.id, at + bars);
    return at;
  };

  // --- Who sings ---
  type Pick = { v: NsVocal; s: NsSection };
  const sung = new Set<string>();
  const keyOf = (p: Pick) => `${p.v.id}#${p.s.index}`;
  const choruses = (v: NsVocal) => {
    const flagged = v.sections.filter((s) => s.chorus);
    if (flagged.length) return flagged;
    // Nothing comes back: its loudest sections stand in.
    const sorted = [...v.sections].sort((a, b) => b.energy - a.energy);
    return sorted.slice(0, Math.max(1, Math.ceil(v.sections.length * 0.4)));
  };
  // Round the singers: each one's strongest chorus first, then their next.
  const chorusPicks: Pick[] = [];
  const byVocal = usedVocals.map((v) => [...choruses(v)].sort((a, b) => b.energy - a.energy).map((s) => ({ v, s })));
  for (let round = 0; byVocal.some((list) => list[round]); round++) for (const list of byVocal) if (list[round]) chorusPicks.push(list[round]);
  const versesOf = (v: NsVocal) => v.sections.filter((s) => !choruses(v).includes(s));
  let verseTurn = 0;
  let verseCalls = 0;
  const nextVerse = (): Pick | null => {
    // A favoured singer takes every other verse.
    const first = favoured && verseCalls++ % 2 === 0;
    for (let tries = 0; tries < usedVocals.length; tries++) {
      const v = first && tries === 0 ? favoured : usedVocals[(verseTurn + tries) % usedVocals.length];
      const s = versesOf(v).find((x) => !sung.has(`${v.id}#${x.index}`)) ?? v.sections.find((x) => !sung.has(`${v.id}#${x.index}`));
      if (s) {
        verseTurn = (verseTurn + tries + 1) % usedVocals.length;
        return { v, s };
      }
    }
    return null;
  };
  let chorusTurn = 0;
  const favouredChoruses = favoured ? chorusPicks.filter((p) => p.v === favoured) : [];
  const nextChorus = (): Pick => (favouredChoruses.length ? favouredChoruses[chorusTurn++ % favouredChoruses.length] : chorusPicks[chorusTurn++ % chorusPicks.length]);

  const slots: NsSlot[] = [];
  let bar = 0;
  let verseCount = 0;
  let chorusCount = 0;
  const chorusSlots = shape.filter((p) => p.name === "Chorus").length;
  const verseSlots = shape.filter((p) => p.name === "Verse").length;
  const time = (b: number) => {
    const s = Math.round((b * 240) / bpm);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  for (const [i, part] of shape.entries()) {
    const next = shape[i + 1];
    const slot: NsSlot = { name: part.name, label: part.name, start: bar, bars: part.bars, beat: null, vocals: [], drop: false, build: next?.name === "Chorus", why: "" };
    if (part.name === "Intro") {
      // The spine's own intro when it has one, else the start of its body.
      const from = spine.introBars >= 4 ? Math.max(0, spine.introBars - part.bars) : body(spine).from;
      slot.beat = { id: spine.id, fromBar: from };
      slot.why = `“${spine.song}”'s ${spine.introBars >= 4 ? "intro" : "music"} on its own, so the song can settle in`;
    } else if (part.name === "Outro") {
      const b = spine;
      slot.beat = { id: b.id, fromBar: Math.max(body(b).from, b.endBar - part.bars) };
      slot.why = `“${b.song}”'s last bars play the song out`;
    } else if (part.name === "Verse") {
      verseCount++;
      slot.label = `Verse ${verseCount}`;
      const beat = travellingBeat();
      slot.beat = { id: beat.id, fromBar: nextBars(beat, part.bars) };
      // More singers than verses: a 16-bar verse is shared, 8 bars each.
      const share = usedVocals.length > verseSlots && part.bars >= 16;
      const pick = nextVerse();
      const second = share ? nextVerse() : null;
      if (pick && second && second.v !== pick.v) {
        sung.add(keyOf(pick));
        sung.add(keyOf(second));
        const half = part.bars / 2;
        slot.vocals.push({ id: pick.v.id, section: pick.s.index, at: 0, bars: Math.min(half, pick.s.bars) });
        slot.vocals.push({ id: second.v.id, section: second.s.index, at: half, bars: Math.min(half, second.s.bars) });
        slot.why = `${pick.v.song}, then ${second.v.song} — a shared verse over “${beat.song}”'s music at ${time(bar)}, so every singer is heard`;
      } else if (pick) {
        sung.add(keyOf(pick));
        slot.vocals.push({ id: pick.v.id, section: pick.s.index, at: 0, bars: Math.min(part.bars, pick.s.bars) });
        slot.why = `${pick.v.song}'s verse over “${beat.song}”'s music at ${time(bar)} — a calmer part, so the choruses lift`;
      } else slot.why = `“${beat.song}”'s music on its own — every verse has been sung`;
    } else if (part.name === "Chorus") {
      chorusCount++;
      const final = chorusCount === chorusSlots;
      slot.label = final && chorusCount > 1 ? "Final chorus" : `Chorus ${chorusCount}`;
      slot.drop = true;
      slot.beat = { id: dropBeat.id, fromBar: loudestRun(dropBeat, part.bars) };
      const lead = nextChorus();
      sung.add(keyOf(lead));
      // The last chorus: two voices — together if their notes agree, else taking turns.
      const other = final ? chorusPicks.find((p) => p.v !== lead.v) : undefined;
      const together =
        other && chromaMatch(shiftChroma(lead.s.chroma, partOf(lead.v.id).semitones), shiftChroma(other.s.chroma, partOf(other.v.id).semitones)) >= SAME_NOTES;
      if (other && together) {
        slot.vocals.push({ id: lead.v.id, section: lead.s.index, at: 0, bars: Math.min(part.bars, lead.s.bars) });
        slot.vocals.push({ id: other.v.id, section: other.s.index, at: 0, bars: Math.min(part.bars, other.s.bars) });
        slot.why = `Final chorus on the drop at ${time(bar)}: ${lead.v.song} and ${other.v.song} together — their notes agree in the shared key`;
      } else if (other && part.bars >= 16) {
        const half = part.bars / 2;
        slot.vocals.push({ id: lead.v.id, section: lead.s.index, at: 0, bars: Math.min(half, lead.s.bars) });
        slot.vocals.push({ id: other.v.id, section: other.s.index, at: half, bars: Math.min(half, other.s.bars) });
        slot.why = `Final chorus on the drop at ${time(bar)}: ${lead.v.song}, then ${other.v.song} answers — their notes clash together, so they take turns`;
      } else {
        slot.vocals.push({ id: lead.v.id, section: lead.s.index, at: 0, bars: Math.min(part.bars, lead.s.bars) });
        const own = partOf(lead.v.id);
        slot.why = `Chorus of ${lead.v.song} on the drop at ${time(bar)}${lead.s.chorus ? ", where its repeated lines belong" : ", its loudest part"} — over “${dropBeat.song}”'s strongest bars${
          own.semitones ? `, moved ${own.semitones > 0 ? "+" : ""}${own.semitones} st into key` : ""
        }`;
      }
    } else {
      // The bridge: the calmest part of a vocal not heard much, over a beat not heard much.
      const beat = travellingBeat();
      slot.beat = { id: beat.id, fromBar: nextBars(beat, part.bars) };
      const calm = usedVocals
        .flatMap((v) => v.sections.filter((s) => !sung.has(`${v.id}#${s.index}`)).map((s) => ({ v, s })))
        .sort((a, b) => a.s.energy - b.s.energy)[0];
      if (calm) {
        sung.add(keyOf(calm));
        slot.vocals.push({ id: calm.v.id, section: calm.s.index, at: 0, bars: Math.min(part.bars, calm.s.bars) });
        slot.why = `A bridge: ${calm.v.song}'s quietest part, a change before the last chorus`;
      } else slot.why = `A bridge: “${beat.song}”'s music alone, a breath before the last chorus`;
    }
    if (slot.build) slot.why += " — then a bar of silence before the drop";
    slots.push(slot);
    bar += part.bars;
  }

  // The person's swaps: one part by another singer, or over another beat.
  for (const [index, swap] of Object.entries(tweaks.swaps ?? {})) {
    const slot = slots[Number(index)];
    if (!slot) continue;
    const beat = swap.beat ? usedBeats.find((b) => b.id === swap.beat) : undefined;
    if (beat && slot.beat) {
      slot.beat = { id: beat.id, fromBar: slot.drop ? loudestRun(beat, slot.bars) : body(beat).from };
      slot.why = `${slot.label}: over “${beat.song}”'s music — your pick`;
    }
    const singer = swap.vocal ? usedVocals.find((v) => v.id === swap.vocal) : undefined;
    if (singer && slot.name !== "Intro" && slot.name !== "Outro") {
      const wanted = slot.name === "Chorus" ? choruses(singer) : versesOf(singer).length ? versesOf(singer) : singer.sections;
      const section = [...wanted].sort((a, b) => (slot.name === "Bridge" ? a.energy - b.energy : b.energy - a.energy))[0];
      slot.vocals = [{ id: singer.id, section: section.index, at: 0, bars: Math.min(slot.bars, section.bars) }];
      slot.why = `${slot.label}: ${singer.song} sings it — your pick`;
    }
    if (slot.build) slot.why += " — then a bar of silence before the drop";
  }

  // Parts the plan never got to.
  for (const p of parts) {
    if (!p.used) continue;
    const heard = slots.some((s) => s.beat?.id === p.id || s.vocals.some((v) => v.id === p.id));
    if (!heard) {
      p.used = false;
      p.why = "the song had no room left for it";
      notes.push(`Left out ${p.song}'s ${p.kind}: the song had no room left for it`);
    }
  }
  return { bpm, key, parts, slots, bars: bar, seconds: (bar * 240) / bpm, notes };
}
