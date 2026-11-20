// A waveform's peaks (0–1, a few hundred of them) in a short string, for
// lists that send many waveforms at once. As JSON, 600 peaks with four
// decimals are ~4 KB per stem, and the library sends every stem: its
// navigation payload grew with the library (677 KB at 150 stems). Here each
// peak is one byte (256 steps — finer than any waveform is drawn) and the
// bytes are base64url: 600 peaks → 800 characters, 5× smaller.
//
// The same code on the server and in the browser (no Buffer, no atob).

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

/** Peaks → string. Values outside 0–1 (and NaN) are clamped. */
export function encodePeaks(peaks: readonly number[]): string {
  const bytes = peaks.map((p) => (Number.isFinite(p) ? Math.round(Math.min(1, Math.max(0, p)) * 255) : 0));
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    const left = bytes.length - i;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (left > 1) out += ALPHABET[(n >> 6) & 63];
    if (left > 2) out += ALPHABET[n & 63];
  }
  return out;
}

/** String → peaks (four decimals, like the stored JSON). Unknown characters read as 0. */
export function decodePeaks(text: string): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    const v = [...chunk].map((c) => INDEX.get(c) ?? 0);
    const n = (v[0] << 18) | ((v[1] ?? 0) << 12) | ((v[2] ?? 0) << 6) | (v[3] ?? 0);
    const count = chunk.length - 1; // 2 chars → 1 byte, 3 → 2, 4 → 3
    const bytes = [(n >> 16) & 255, (n >> 8) & 255, n & 255].slice(0, count);
    for (const b of bytes) peaks.push(Math.round((b / 255) * 10_000) / 10_000);
  }
  return peaks;
}

/** Stored peaks JSON → the short string (bad JSON → no peaks). */
export function packPeaksJson(json: string | null | undefined): string {
  try {
    const parsed = JSON.parse(json || "[]");
    return Array.isArray(parsed) ? encodePeaks(parsed.map(Number)) : "";
  } catch {
    return "";
  }
}
