// The demo songs as data: tempo, key, chords, sections. Pure (no audio, no
// DOM) so the DJ logic and the tests can use it. Every song is original and
// synthesised in the browser by demoSongsDsp.ts — there is no recorded audio.

import { camelotCode, type MusicalKey } from "./musicKey";

export type DemoStem = "drums" | "bass" | "chords" | "vocal";
export const DEMO_STEMS: DemoStem[] = ["drums", "bass", "chords", "vocal"];

export type SongStyle = "hiphop" | "house" | "pop" | "reggae" | "trap" | "synth";
export type SectionName = "intro" | "verse" | "chorus" | "break" | "outro";
export type VocalMode = "none" | "sparse" | "full";

export type SongSection = { name: SectionName; bars: number; energy: number; vocal: VocalMode };
export type ChordQuality = "M" | "m" | "m7" | "M7" | "7";
export type ChordDef = { root: number; quality: ChordQuality };

export const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  M: [0, 4, 7],
  m: [0, 3, 7],
  m7: [0, 3, 7, 10],
  M7: [0, 4, 7, 11],
  "7": [0, 4, 7, 10],
};

export type DemoSongDef = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  key: MusicalKey;
  description: string;
  style: SongStyle;
  seed: number;
  /** One chord per bar, repeating. Roots are semitones above the tonic. */
  progression: ChordDef[];
  sections: SongSection[];
  /** MIDI note the sung melody is centred on. */
  vocalCentre: number;
  /** Card colour. */
  accent: string;
};

export const DEMO_SONG_DEFS: DemoSongDef[] = [
  {
    id: "midnight-static",
    title: "Midnight Static",
    artist: "Kiln & Parlor",
    genre: "Boom-bap hip-hop",
    bpm: 92,
    key: { tonic: 9, mode: "minor" },
    description: "Dusty drums, a sub bass and a slow Rhodes loop with a hummed hook.",
    style: "hiphop",
    seed: 9201,
    progression: [
      { root: 0, quality: "m7" },
      { root: 8, quality: "M7" },
      { root: 3, quality: "M7" },
      { root: 10, quality: "M" },
    ],
    sections: [
      { name: "intro", bars: 4, energy: 0.35, vocal: "none" },
      { name: "verse", bars: 8, energy: 0.6, vocal: "sparse" },
      { name: "chorus", bars: 8, energy: 0.95, vocal: "full" },
      { name: "outro", bars: 4, energy: 0.45, vocal: "sparse" },
    ],
    vocalCentre: 67,
    accent: "#ec4899",
  },
  {
    id: "warehouse-lights",
    title: "Warehouse Lights",
    artist: "Dub Cartel",
    genre: "Deep house",
    bpm: 124,
    key: { tonic: 0, mode: "minor" },
    description: "Four-on-the-floor kick, off-beat stabs and a ducking bass.",
    style: "house",
    seed: 12402,
    progression: [
      { root: 0, quality: "m7" },
      { root: 5, quality: "m7" },
      { root: 8, quality: "M7" },
      { root: 10, quality: "M" },
    ],
    sections: [
      { name: "intro", bars: 8, energy: 0.4, vocal: "none" },
      { name: "verse", bars: 8, energy: 0.7, vocal: "sparse" },
      { name: "chorus", bars: 8, energy: 1, vocal: "full" },
      { name: "outro", bars: 8, energy: 0.5, vocal: "none" },
    ],
    vocalCentre: 65,
    accent: "#06b6d4",
  },
  {
    id: "golden-hour",
    title: "Golden Hour",
    artist: "Maple Avenue",
    genre: "Bright pop",
    bpm: 128,
    key: { tonic: 3, mode: "major" },
    description: "Glossy pads, a pumping bass and a big sing-along chorus.",
    style: "pop",
    seed: 12803,
    progression: [
      { root: 0, quality: "M" },
      { root: 7, quality: "M" },
      { root: 9, quality: "m" },
      { root: 5, quality: "M" },
    ],
    sections: [
      { name: "intro", bars: 4, energy: 0.35, vocal: "none" },
      { name: "verse", bars: 8, energy: 0.6, vocal: "sparse" },
      { name: "chorus", bars: 8, energy: 0.95, vocal: "full" },
      { name: "verse", bars: 4, energy: 0.6, vocal: "sparse" },
      { name: "chorus", bars: 8, energy: 1, vocal: "full" },
    ],
    vocalCentre: 70,
    accent: "#f59e0b",
  },
  {
    id: "island-time",
    title: "Island Time",
    artist: "The Slow Tide",
    genre: "Reggae one-drop",
    bpm: 100,
    key: { tonic: 7, mode: "major" },
    description: "One-drop drums, off-beat organ skank and a bouncing bass.",
    style: "reggae",
    seed: 10004,
    progression: [
      { root: 0, quality: "M" },
      { root: 5, quality: "M" },
      { root: 0, quality: "M" },
      { root: 7, quality: "M" },
    ],
    sections: [
      { name: "intro", bars: 4, energy: 0.4, vocal: "none" },
      { name: "verse", bars: 8, energy: 0.65, vocal: "sparse" },
      { name: "chorus", bars: 8, energy: 0.9, vocal: "full" },
      { name: "verse", bars: 4, energy: 0.65, vocal: "sparse" },
      { name: "outro", bars: 4, energy: 0.45, vocal: "sparse" },
    ],
    vocalCentre: 67,
    accent: "#84cc16",
  },
  {
    id: "concrete-run",
    title: "Concrete Run",
    artist: "Vantablack Kid",
    genre: "Trap",
    bpm: 140,
    key: { tonic: 5, mode: "minor" },
    description: "Half-time snare, rolling hats and a long 808 slide.",
    style: "trap",
    seed: 14005,
    progression: [
      { root: 0, quality: "m7" },
      { root: 8, quality: "M7" },
      { root: 10, quality: "M" },
      { root: 7, quality: "m" },
    ],
    sections: [
      { name: "intro", bars: 4, energy: 0.3, vocal: "none" },
      { name: "verse", bars: 8, energy: 0.7, vocal: "sparse" },
      { name: "chorus", bars: 8, energy: 1, vocal: "full" },
      { name: "verse", bars: 8, energy: 0.7, vocal: "sparse" },
      { name: "chorus", bars: 8, energy: 1, vocal: "full" },
    ],
    vocalCentre: 65,
    accent: "#a78bfa",
  },
  {
    id: "neon-drive",
    title: "Neon Drive",
    artist: "Chrome Coast",
    genre: "Synthwave",
    bpm: 110,
    key: { tonic: 2, mode: "minor" },
    description: "Gated snare, driving octave bass and a glittering arpeggio.",
    style: "synth",
    seed: 11006,
    progression: [
      { root: 0, quality: "m" },
      { root: 8, quality: "M" },
      { root: 3, quality: "M" },
      { root: 10, quality: "M" },
    ],
    sections: [
      { name: "intro", bars: 4, energy: 0.4, vocal: "none" },
      { name: "verse", bars: 8, energy: 0.65, vocal: "sparse" },
      { name: "chorus", bars: 8, energy: 0.95, vocal: "full" },
      { name: "break", bars: 4, energy: 0.4, vocal: "none" },
      { name: "outro", bars: 4, energy: 0.5, vocal: "sparse" },
    ],
    vocalCentre: 66,
    accent: "#f472b6",
  },
];

export type DemoSongMeta = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  key: MusicalKey;
  camelot: string;
  description: string;
  bars: number;
  durationSec: number;
  accent: string;
  sections: (SongSection & { startBar: number })[];
  /** Bar index where the first chorus starts: a good place to loop. */
  chorusBar: number;
  /** Per bar: is the vocal singing in it? */
  vocalBars: boolean[];
};

export type VocalPhrase = { bar: number; bars: number; template: number };

/** Which bars the sung phrases occupy. Phrases are two bars, starting on a bar line. */
export function vocalPlan(def: DemoSongDef): VocalPhrase[] {
  const out: VocalPhrase[] = [];
  let startBar = 0;
  let count = 0;
  for (const s of def.sections) {
    if (s.vocal !== "none") {
      const step = s.vocal === "full" ? 2 : 4;
      for (let b = 0; b + 2 <= s.bars; b += step) {
        // Outros sing one last phrase.
        if (s.name === "outro" && b > 0) break;
        const cycle = s.vocal === "full" ? CHORUS_CYCLE : VERSE_CYCLE;
        out.push({ bar: startBar + b, bars: 2, template: cycle[(count + def.seed) % cycle.length] });
        count++;
      }
    }
    startBar += s.bars;
  }
  return out;
}

/** Melody templates are indexes into PHRASE_TEMPLATES (see demoSongsDsp.ts). */
export const VERSE_CYCLE = [0, 2, 4, 0, 2];
export const CHORUS_CYCLE = [3, 1, 3, 4];

export function songBars(def: DemoSongDef) {
  return def.sections.reduce((t, s) => t + s.bars, 0);
}

export function songMeta(def: DemoSongDef): DemoSongMeta {
  const bars = songBars(def);
  const vocalBars = new Array<boolean>(bars).fill(false);
  for (const p of vocalPlan(def)) for (let b = p.bar; b < p.bar + p.bars; b++) vocalBars[b] = true;
  let start = 0;
  const sections = def.sections.map((s) => {
    const withStart = { ...s, startBar: start };
    start += s.bars;
    return withStart;
  });
  return {
    id: def.id,
    title: def.title,
    artist: def.artist,
    genre: def.genre,
    bpm: def.bpm,
    key: def.key,
    camelot: camelotCode(def.key),
    description: def.description,
    bars,
    durationSec: (bars * 4 * 60) / def.bpm,
    accent: def.accent,
    sections,
    chorusBar: sections.find((s) => s.name === "chorus")?.startBar ?? 0,
    vocalBars,
  };
}

export const DEMO_SONGS: DemoSongMeta[] = DEMO_SONG_DEFS.map(songMeta);

export function demoSongMeta(id: string): DemoSongMeta | undefined {
  return DEMO_SONGS.find((s) => s.id === id);
}

export function demoSongDef(id: string): DemoSongDef | undefined {
  return DEMO_SONG_DEFS.find((s) => s.id === id);
}
