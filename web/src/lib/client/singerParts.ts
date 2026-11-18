// Who sings where in a vocal, and taking one singer's parts out — for a
// song with a featured verse, a duet, a chorus singer. Pure (no store, no
// audio context), tested in tests/singer-parts.test.ts; the dialog
// (components/studio/RemoveSingerDialog.tsx) reads the lane's audio and
// lyrics, asks here, and applies the cut as one undo step.
//
// Three ways to find a singer's parts:
//   1. The lyrics' section headers, Genius style: "[Verse 2: 2 Chainz]",
//      "[Chorus: Kid Cudi & 2 Chainz]" — each timed line belongs to the
//      section above it.
//   2. The voices themselves: the vocal is cut into phrases where it's
//      sung, each phrase gets a fingerprint (the shape of its spectrum and
//      its pitch), and phrases with alike fingerprints are grouped into
//      "voices" (k-means, 2–4 voices, kept only when the groups are clearly
//      apart — the silhouette).
//   3. By hand: sections or a range on the timeline.
//
// What it can't do: two people singing at the same moment are one sound in
// the stem — removing one removes both there. It cuts time spans.

import type { LyricLine } from "@/lib/lyrics";
import { clipEnd, clipStart, cutLaneAt, normaliseLane } from "./clipEdit";
import type { LaneClip, StudioLane } from "./studioStore";

export type Span = { start: number; end: number };

export type SungSection = Span & {
  /** "Verse 2", "Chorus". */
  label: string;
  /** Who sings it, as the header says; empty when it doesn't say (usually the song's own artist). */
  performers: string[];
  /** Its first line, to show. */
  line: string;
};

const SECTION_WORDS = /^(intro|verse|chorus|pre-?chorus|post-?chorus|hook|refrain|bridge|outro|interlude|break|breakdown|skit|drop|part|instrumental|spoken)\b/i;
const HEADER = /^\s*[[(]([^\])]{1,80})[\])]\s*$/;
const SPLIT_NAMES = /\s*(?:&|,|\+|\/|\band\b|\bx\b|\bfeat\.?\b|\bft\.?\b|\bwith\b)\s*/i;

/** A header's section name and singers: "Verse 2: 2 Chainz" → Verse 2, [2 Chainz]; "Kid Cudi" → "", [Kid Cudi]. */
export function readHeader(text: string): { label: string; performers: string[] } | null {
  const m = HEADER.exec(text);
  if (!m) return null;
  const inner = m[1].trim();
  // A timestamp isn't a header.
  if (/^\d+:\d/.test(inner)) return null;
  const colon = inner.indexOf(":");
  const names = (s: string) =>
    s
      .split(SPLIT_NAMES)
      .map((n) => n.replace(/^\W+|\W+$/g, "").trim())
      .filter((n) => n && !/^(all|both|everyone)$/i.test(n));
  if (colon >= 0) return { label: inner.slice(0, colon).trim(), performers: names(inner.slice(colon + 1)) };
  if (SECTION_WORDS.test(inner)) return { label: inner, performers: [] };
  return { label: "", performers: names(inner) };
}

/**
 * The sections of a timed lyric sheet with who sings each: from each
 * header's first timed line to the next section's first line (or a few
 * seconds after its own last one). Sections without timed lines are left out.
 */
export function lyricSections(lines: LyricLine[], songEnd = Infinity): SungSection[] {
  type Open = { label: string; performers: string[]; times: number[]; line: string };
  const found: Open[] = [];
  let current = null as Open | null;
  for (const line of lines) {
    const header = line.time === null ? readHeader(line.text) : null;
    if (header) {
      current = { label: header.label || (current?.label ?? ""), performers: header.performers, times: [], line: "" };
      found.push(current);
      continue;
    }
    if (line.time === null || !line.text.trim()) continue;
    if (!current) {
      current = { label: "", performers: [], times: [], line: "" };
      found.push(current);
    }
    current.times.push(line.time);
    if (!current.line) current.line = line.text.trim();
  }
  const timed = found.filter((s) => s.times.length);
  return timed.map((s, i) => {
    const start = Math.max(0, Math.min(...s.times) - 0.3);
    const last = Math.max(...s.times);
    const next = timed[i + 1] ? Math.min(...timed[i + 1].times) - 0.15 : Infinity;
    return { start, end: Math.min(next, last + 4, songEnd), label: s.label || `Part ${i + 1}`, performers: s.performers, line: s.line };
  });
}

/** Everyone the headers name, with their sections and how long they sing (shared sections counted for each). */
export function performers(sections: SungSection[]): { name: string; sections: SungSection[]; seconds: number; shared: number }[] {
  const by = new Map<string, { name: string; sections: SungSection[] }>();
  for (const s of sections) {
    for (const name of s.performers) {
      const key = name.toLowerCase();
      const entry = by.get(key) ?? { name, sections: [] };
      entry.sections.push(s);
      by.set(key, entry);
    }
  }
  return [...by.values()]
    .map((p) => ({ ...p, seconds: p.sections.reduce((n, s) => n + (s.end - s.start), 0), shared: p.sections.filter((s) => s.performers.length > 1).length }))
    .sort((a, b) => b.seconds - a.seconds);
}

// --------------------------------------------------------------- phrases

/**
 * Where a voice sings: stretches of the loudness curve (`rms`, `rate` values
 * a second) above a level set by the loud parts, small gaps bridged, very
 * short bits dropped, long ones cut in pieces (so a quick back-and-forth
 * between two singers can still be told apart).
 */
export function phrasesOf(rms: ArrayLike<number>, rate: number, { gap = 0.35, shortest = 0.6, longest = 3 } = {}): Span[] {
  const values = Array.from(rms);
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const level = Math.max(loud * 0.12, 1e-4);
  const raw: Span[] = [];
  let open = -1;
  values.forEach((v, i) => {
    if (v >= level && open < 0) open = i;
    if (v < level && open >= 0) {
      raw.push({ start: open / rate, end: i / rate });
      open = -1;
    }
  });
  if (open >= 0) raw.push({ start: open / rate, end: values.length / rate });
  const merged: Span[] = [];
  for (const p of raw) {
    const last = merged[merged.length - 1];
    if (last && p.start - last.end < gap) last.end = p.end;
    else merged.push({ ...p });
  }
  const out: Span[] = [];
  for (const p of merged) {
    if (p.end - p.start < shortest) continue;
    const pieces = Math.ceil((p.end - p.start) / longest);
    const step = (p.end - p.start) / pieces;
    for (let k = 0; k < pieces; k++) out.push({ start: p.start + k * step, end: p.start + (k + 1) * step });
  }
  return out;
}

/** Loudness every 1/rate seconds of mono `samples`. */
export function rmsCurve(samples: Float32Array, sampleRate: number, rate = 50): Float32Array {
  const hop = Math.max(1, Math.floor(sampleRate / rate));
  const out = new Float32Array(Math.floor(samples.length / hop));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) sum += samples[j] * samples[j];
    out[i] = Math.sqrt(sum / hop);
  }
  return out;
}

// ----------------------------------------------------------- fingerprints

const N = 2048;
const BANDS = 16;

/** In-place radix-2 FFT of (re, im), length a power of two. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** The pitch of a frame (Hz) by autocorrelation between 70 and 700 Hz, or 0 when it isn't clearly pitched. */
function framePitch(frame: Float64Array, sampleRate: number): number {
  // Every 4th sample is plenty for a voice's pitch, and 16× cheaper.
  const step = 4;
  const rate = sampleRate / step;
  const n = Math.floor(frame.length / step);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = frame[i * step];
  let energy = 0;
  for (let i = 0; i < n; i++) energy += x[i] * x[i];
  if (energy < 1e-6) return 0;
  const minLag = Math.floor(rate / 700);
  const maxLag = Math.min(n - 1, Math.ceil(rate / 70));
  let best = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += x[i] * x[i + lag];
    const r = sum / energy;
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  return best > 0.45 && bestLag ? rate / bestLag : 0;
}

/**
 * A phrase's fingerprint: the average shape of its spectrum (16 bands from
 * 80 Hz to 8 kHz, as shares of its energy, in log), how much of it is
 * pitched (sung, against rapped or spoken), how far its pitch moves, and its
 * median pitch in octaves above 55 Hz (last). Alike voices give alike fingerprints.
 */
export function fingerprint(samples: Float32Array, sampleRate: number, span: Span): number[] {
  const from = Math.max(0, Math.floor(span.start * sampleRate));
  const to = Math.min(samples.length, Math.floor(span.end * sampleRate));
  const bands = new Float64Array(BANDS);
  const edges = Array.from({ length: BANDS + 1 }, (_, i) => 80 * Math.pow(8000 / 80, i / BANDS));
  const binOf = (hz: number) => Math.round((hz / sampleRate) * N);
  const pitches: number[] = [];
  let frames = 0;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (let at = from; at + N <= to; at += N) {
    let energy = 0;
    for (let i = 0; i < N; i++) {
      const v = samples[at + i];
      energy += v * v;
      re[i] = v * hann[i];
      im[i] = 0;
    }
    if (energy / N < 1e-6) continue;
    const pitch = framePitch(re, sampleRate);
    if (pitch) pitches.push(pitch);
    fft(re, im);
    const frame = new Float64Array(BANDS);
    let total = 0;
    for (let b = 0; b < BANDS; b++) {
      for (let k = Math.max(1, binOf(edges[b])); k < Math.min(N / 2, binOf(edges[b + 1]) + 1); k++) frame[b] += re[k] * re[k] + im[k] * im[k];
      total += frame[b];
    }
    if (total <= 0) continue;
    for (let b = 0; b < BANDS; b++) bands[b] += frame[b] / total;
    frames++;
  }
  const shape = Array.from(bands, (v) => Math.log((frames ? v / frames : 0) + 1e-4));
  const octaves = pitches.map((p) => Math.log2(p / 55)).sort((a, b) => a - b);
  const at = (q: number) => octaves[Math.min(octaves.length - 1, Math.floor(octaves.length * q))];
  const pitch = octaves.length ? at(0.5) : 1.5;
  const voiced = frames ? pitches.length / frames : 0;
  const spread = octaves.length >= 4 ? at(0.75) - at(0.25) : 0;
  return [...shape, voiced, spread, pitch];
}

// --------------------------------------------------------------- grouping

function dist(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Each column scaled to mean 0, spread 1 — pitch counted 3× (it tells voices apart best). */
export function standardise(rows: number[][]): number[][] {
  if (!rows.length) return [];
  const dims = rows[0].length;
  const mean = new Array<number>(dims).fill(0);
  const sd = new Array<number>(dims).fill(0);
  for (const r of rows) r.forEach((v, i) => (mean[i] += v / rows.length));
  for (const r of rows) r.forEach((v, i) => (sd[i] += (v - mean[i]) ** 2 / rows.length));
  return rows.map((r) => r.map((v, i) => ((v - mean[i]) / (Math.sqrt(sd[i]) || 1)) * (i === dims - 1 ? 3 : 1)));
}

/** k-means from a deterministic start (row `first`, then the farthest from those picked). */
export function kMeans(rows: number[][], k: number, rounds = 30, first = 0): number[] {
  const centres: number[][] = [rows[first] ?? rows[0]];
  while (centres.length < k) {
    let far = rows[0];
    let farD = -1;
    for (const r of rows) {
      const d = Math.min(...centres.map((c) => dist(c, r)));
      if (d > farD) {
        farD = d;
        far = r;
      }
    }
    centres.push(far);
  }
  let labels = rows.map(() => 0);
  for (let round = 0; round < rounds; round++) {
    const next = rows.map((r) => centres.map((c) => dist(c, r)).reduce((best, d, i, all) => (d < all[best] ? i : best), 0));
    const same = next.every((l, i) => l === labels[i]);
    labels = next;
    for (let c = 0; c < k; c++) {
      const members = rows.filter((_, i) => labels[i] === c);
      if (members.length) centres[c] = members[0].map((_, d) => members.reduce((s, m) => s + m[d], 0) / members.length);
    }
    if (same && round) break;
  }
  return labels;
}

/** How well the groups stand apart (−1…1; above ~0.25 they're real groups). */
export function silhouette(rows: number[][], labels: number[]): number {
  const k = Math.max(...labels) + 1;
  if (k < 2) return 0;
  let total = 0;
  rows.forEach((r, i) => {
    const mean = (c: number) => {
      const others = rows.filter((_, j) => j !== i && labels[j] === c);
      return others.length ? others.reduce((s, o) => s + dist(r, o), 0) / others.length : 0;
    };
    const a = mean(labels[i]);
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== labels[i]) b = Math.min(b, mean(c));
    total += b === Infinity || Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b);
  });
  return total / rows.length;
}

export type Voices = {
  /** The voice of each phrase (0 = the one singing most). */
  labels: number[];
  count: number;
  /** How clearly the voices are apart (the silhouette), 0 when it's one voice. */
  confidence: number;
};

/** Phrases grouped into voices: 2–4 when they clearly stand apart, else one voice. Voice 0 sings the most. */
export function groupVoices(prints: number[][], durations: number[], maxVoices = 4, clear = 0.22): Voices {
  if (prints.length < 4) return { labels: prints.map(() => 0), count: 1, confidence: 0 };
  const rows = standardise(prints);
  let best: Voices = { labels: rows.map(() => 0), count: 1, confidence: 0 };
  // A "voice" of a phrase or two is noise (a shout, a sample, an ad-lib), not a singer.
  const smallest = Math.max(2, Math.ceil(rows.length * 0.08));
  // Several starts, since one odd phrase picked as a start makes a group of its own.
  const starts = [...new Set(Array.from({ length: Math.min(12, rows.length) }, (_, i) => Math.floor((i * rows.length) / Math.min(12, rows.length))))];
  for (let k = 2; k <= Math.min(maxVoices, Math.floor(rows.length / smallest)); k++) {
    let top: { labels: number[]; score: number } | null = null;
    for (const first of starts) {
      const labels = kMeans(rows, k, 30, first);
      const sizes = Array.from({ length: k }, (_, c) => labels.filter((l) => l === c).length);
      if (sizes.some((n) => n < smallest)) continue;
      const score = silhouette(rows, labels);
      if (!top || score > top.score) top = { labels, score };
    }
    // One more voice has to earn it.
    if (top && top.score >= clear && top.score > best.confidence + (best.count > 1 ? 0.05 : 0)) best = { labels: top.labels, count: k, confidence: top.score };
  }
  // Ordered by how long each voice sings.
  const seconds = Array.from({ length: best.count }, (_, c) => best.labels.reduce((s, l, i) => s + (l === c ? durations[i] ?? 0 : 0), 0));
  const order = seconds.map((_, c) => c).sort((a, b) => seconds[b] - seconds[a]);
  const rank = new Map(order.map((c, i) => [c, i]));
  return { ...best, labels: best.labels.map((l) => rank.get(l)!) };
}

// ----------------------------------------------------------------- the cut

/** Spans sorted, overlapping or touching ones joined. */
export function mergeSpans(spans: Span[], touch = 0.05): Span[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + touch) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** Spans widened out to whole bars (for cutting time out of the whole song without breaking the beat). */
export function toBars(spans: Span[], barSeconds: number, origin = 0): Span[] {
  if (!(barSeconds > 0)) return mergeSpans(spans);
  return mergeSpans(
    spans.map((s) => ({
      start: origin + Math.floor((s.start - origin) / barSeconds + 1e-6) * barSeconds,
      end: origin + Math.ceil((s.end - origin) / barSeconds - 1e-6) * barSeconds,
    })),
    0.001
  );
}

/** Fades on the new edges, so a cut never clicks. */
const EDGE_FADE = 0.03;

/**
 * The vocal lane with `spans` (timeline seconds) silenced: its clips cut at
 * each span's edges and the pieces inside taken out, short fades on the new
 * edges. Everything else plays as before. Null when nothing would change.
 */
export function withoutSpans(lane: StudioLane, spans: Span[]): StudioLane | null {
  const cuts = mergeSpans(spans);
  if (!cuts.length) return null;
  const clips = cutLaneAt(
    lane,
    cuts.flatMap((s) => [s.start, s.end])
  );
  const inside = (c: LaneClip) => {
    const mid = (clipStart(lane, c) + clipEnd(lane, c)) / 2;
    return cuts.some((s) => mid > s.start && mid < s.end);
  };
  const near = (t: number) => cuts.some((s) => Math.abs(t - s.start) < 0.01 || Math.abs(t - s.end) < 0.01);
  const kept = clips.filter((c) => !inside(c));
  if (kept.length === clips.length) return null;
  const faded = kept.map((c) => ({
    ...c,
    ...(near(clipStart(lane, c)) ? { fadeIn: Math.max(c.fadeIn ?? 0, EDGE_FADE) } : {}),
    ...(near(clipEnd(lane, c)) ? { fadeOut: Math.max(c.fadeOut ?? 0, EDGE_FADE) } : {}),
  }));
  // No clips means "the whole stem" to the engine: nothing left to sing is a muted lane.
  if (!faded.length) return { ...lane, muted: true };
  return normaliseLane({ ...lane, clips: faded });
}

/** Lyric lines sung inside `spans` (they go with the cut). */
export function linesOutside(lines: LyricLine[], spans: Span[]): LyricLine[] {
  const cuts = mergeSpans(spans);
  return lines.filter((l) => l.time === null || !cuts.some((s) => l.time! >= s.start && l.time! < s.end));
}

/**
 * Spans of the stem (seconds into the recording) put where `lane` plays
 * them on the timeline: each clip that plays part of a span gives that part,
 * at its place and speed. A span played twice (a repeated chorus) comes out twice.
 */
export function onTimeline(lane: StudioLane, spans: Span[]): Span[] {
  const tempo = lane.tempoRatio > 0 ? lane.tempoRatio : 1;
  const clips: LaneClip[] = lane.clips?.length ? lane.clips : [{ from: 0, to: lane.originalDuration, at: 0 }];
  const out: Span[] = [];
  for (const clip of clips) {
    if (clip.muted) continue;
    const stretch = clip.stretch && clip.stretch > 0 ? clip.stretch : 1;
    const at = (src: number) => lane.offsetSeconds + (clip.at + (clip.reverse ? clip.to - src : src - clip.from) / stretch) / tempo;
    for (const s of spans) {
      const from = Math.max(s.start, clip.from);
      const to = Math.min(s.end, clip.to);
      if (to - from < 0.05) continue;
      const a = at(from);
      const b = at(to);
      out.push({ start: Math.min(a, b), end: Math.max(a, b) });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}
