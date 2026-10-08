// What browsers work out from a stem and hand on to everyone else: the
// beat model's beats and downbeats, and the Studio's analysis (key, onsets,
// chroma, a vocal's melody). Both depend on the audio alone, so once one
// browser has done the work — a computer, usually — every other browser
// that opens the stem fetches the result instead of redoing it. Phones
// can't run the beat model at all (see neuralBeats.ts), so for them it's
// the only way to get its beats.
//
// Shared by the browser (which encodes) and the server (which checks what
// it's sent before keeping it). Bump a kind's version when the code that
// makes it changes, so results from the old code aren't handed out.

export const RESULT_KINDS = ["beats", "analysis"] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

export const RESULT_VERSIONS: Record<ResultKind, number> = { beats: 1, analysis: 1 };

/** Comfortably above a 15-minute song (the longest the splitter takes). */
export const MAX_RESULT_BYTES: Record<ResultKind, number> = { beats: 512 * 1024, analysis: 6 * 1024 * 1024 };

/**
 * How far apart two browsers' decodings of the same MP3 may be and still
 * share timings. Browsers have differed on trimming an MP3's encoder delay,
 * which would put every beat a few dozen milliseconds off.
 */
export const SAME_AUDIO_SECONDS = 0.005;

export function isResultKind(value: unknown): value is ResultKind {
  return typeof value === "string" && (RESULT_KINDS as readonly string[]).includes(value);
}

// --- Beats --------------------------------------------------------------------

/** The beat model's result, with the length of the audio it heard. */
export type SharedBeats = { seconds: number; beats: number[]; downbeats: number[] };

const MAX_BEATS = 20_000;

function isTimeList(value: unknown, seconds: number): value is number[] {
  if (!Array.isArray(value) || value.length > MAX_BEATS) return false;
  let last = -Infinity;
  for (const t of value) {
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > seconds + 1 || t < last) return false;
    last = t;
  }
  return true;
}

/** `bytes` as beats, or null when they aren't well-formed. */
export function parseBeats(bytes: Uint8Array): SharedBeats | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SharedBeats>;
    const seconds = value.seconds;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) return null;
    if (!isTimeList(value.beats, seconds) || !isTimeList(value.downbeats, seconds)) return null;
    if (value.downbeats.length > value.beats.length) return null;
    return { seconds, beats: value.beats, downbeats: value.downbeats };
  } catch {
    return null;
  }
}

export function encodeBeats(beats: SharedBeats): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(beats));
}

// --- Packed number arrays (the analysis) -------------------------------------
//
// "RXP1", the header's length (uint32, little-endian), the header as JSON,
// padding to a multiple of 4, then each array's float32s one after another
// in the order the header lists them. A few hundred KB for a song, where
// JSON would be several times that.

const MAGIC = "RXP1";
const MAX_HEADER = 16 * 1024;

export type Packed = { header: Record<string, unknown>; arrays: Record<string, Float32Array> };

export function pack({ header, arrays }: Packed): Uint8Array {
  const names = Object.keys(arrays);
  const json = new TextEncoder().encode(
    JSON.stringify({ ...header, arrays: names.map((name) => [name, arrays[name].length]) })
  );
  const start = Math.ceil((8 + json.length) / 4) * 4;
  const floats = names.reduce((sum, name) => sum + arrays[name].length, 0);
  const out = new Uint8Array(start + floats * 4);
  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, 8);
  const view = new DataView(out.buffer);
  let at = start;
  for (const name of names) {
    for (const v of arrays[name]) {
      view.setFloat32(at, v, true);
      at += 4;
    }
  }
  return out;
}

/** The header and arrays out of `bytes`, or null when they aren't a well-formed pack. */
export function unpack(bytes: Uint8Array): Packed | null {
  if (bytes.length < 8 || new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(4, true);
  if (headerLength > MAX_HEADER || 8 + headerLength > bytes.length) return null;
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength)));
  } catch {
    return null;
  }
  const list = header.arrays;
  if (!header || typeof header !== "object" || !Array.isArray(list)) return null;
  const start = Math.ceil((8 + headerLength) / 4) * 4;
  let at = start;
  const arrays: Record<string, Float32Array> = {};
  for (const entry of list) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !Number.isInteger(entry[1]) || entry[1] < 0) return null;
    const [name, length] = entry as [string, number];
    if (at + length * 4 > bytes.length || name in arrays) return null;
    const values = new Float32Array(length);
    for (let i = 0; i < length; i++, at += 4) {
      const v = view.getFloat32(at, true);
      if (!Number.isFinite(v)) return null;
      values[i] = v;
    }
    arrays[name] = values;
  }
  if (at !== bytes.length) return null;
  delete header.arrays;
  return { header, arrays };
}

// --- The analysis, as the server checks it ------------------------------------

const ANALYSIS_ARRAYS = ["onsets", "lowOnsets", "energy", "chroma", "midi", "confidence"];
const ANALYSIS_NUMBERS = ["seconds", "tonic", "keyConfidence", "onsetRate", "entry", "loudness", "chromaRate"];

/** Whether `bytes` is a packed analysis with every part present and sane. */
export function isAnalysisPack(bytes: Uint8Array): boolean {
  const packed = unpack(bytes);
  if (!packed) return false;
  const { header, arrays } = packed;
  if (Object.keys(arrays).some((name) => !ANALYSIS_ARRAYS.includes(name))) return false;
  if (!arrays.onsets || !arrays.lowOnsets || !arrays.energy || !arrays.chroma) return false;
  if (arrays.chroma.length % 12 !== 0) return false;
  if (!!arrays.midi !== !!arrays.confidence || (arrays.midi && arrays.midi.length !== arrays.confidence.length)) return false;
  for (const name of ANALYSIS_NUMBERS) {
    const v = header[name];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return false;
  }
  if ((header.seconds as number) > 3600 || (header.tonic as number) > 11) return false;
  if (header.mode !== "major" && header.mode !== "minor") return false;
  if (header.bpmEstimate !== null && (typeof header.bpmEstimate !== "number" || !Number.isFinite(header.bpmEstimate))) return false;
  if (arrays.midi && !(header.melody && typeof header.melody === "object")) return false;
  return true;
}
