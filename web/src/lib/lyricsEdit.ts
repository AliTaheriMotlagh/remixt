// Editing a timed sheet's words without its times in the way. The editor
// shows one line of words per row; when the words change, each line keeps
// its time: an unchanged line exactly, a line typed over keeps the time of
// the line it replaced, a new line is put between its neighbours, and a
// deleted line takes its time with it. Pure (no DOM), shared with the tests.

import { isSection, parseLyrics, serializeLyrics, type LyricLine } from "./lyrics";

/** The words of a sheet, one row per line, as the editor shows them. */
export function wordsOf(lines: LyricLine[]): string {
  return lines.map((l) => l.text).join("\n");
}

const same = (a: string, b: string) => a.trim() === b.trim();

/** Pairs of (old index, new index) that are the same line, in order — the longest such run. */
function commonLines(before: string[], after: string[]): [number, number][] {
  const n = before.length;
  const m = after.length;
  // Lengths of the longest common run from (i, j) on.
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = same(before[i], after[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(before[i], after[j])) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

const round = (x: number) => Math.round(x * 100) / 100;

/**
 * `lines` with their words replaced by `text` (one line per row), each
 * keeping its time as described above. Section headings and blank rows
 * are never timed.
 */
export function rewordLines(lines: LyricLine[], text: string): LyricLine[] {
  const rows = text.replace(/\r\n?/g, "\n").split("\n");
  const before = lines.map((l) => l.text);
  // A row's time: a number, null (untimed), or undefined while it has no line to take one from.
  const times: (number | null | undefined)[] = new Array(rows.length).fill(undefined);
  const pairs = commonLines(before, rows);
  // Every stretch between two matched lines: rows typed over keep the replaced lines' times, in order.
  const bounds: [number, number][] = [[-1, -1], ...pairs, [before.length, rows.length]];
  for (let k = 0; k < bounds.length - 1; k++) {
    const [oi, ni] = bounds[k];
    const [oj, nj] = bounds[k + 1];
    if (k > 0) times[ni] = lines[oi].time;
    const oldRun = lines.slice(oi + 1, oj);
    for (let r = ni + 1; r < nj; r++) {
      const replaced = oldRun[r - ni - 1];
      times[r] = replaced ? replaced.time : undefined;
    }
  }
  const words = (r: number) => rows[r].trim();
  const timeable = (r: number) => !!words(r) && !isSection(words(r));
  // Rows with no line to take a time from (added ones, `undefined` here): spread between the timed lines around them.
  const out: LyricLine[] = rows.map((_, r) => ({ time: timeable(r) ? (times[r] ?? null) : null, text: words(r) }));
  for (let r = 0; r < rows.length; r++) {
    if (times[r] !== undefined || !timeable(r)) continue;
    let end = r;
    while (end + 1 < rows.length && times[end + 1] === undefined) end++;
    let prev: number | null = null;
    for (let p = r - 1; p >= 0 && prev === null; p--) prev = out[p].time;
    let next: number | null = null;
    for (let q = end + 1; q < rows.length && next === null; q++) next = out[q].time;
    const added = [];
    for (let a = r; a <= end; a++) if (timeable(a)) added.push(a);
    added.forEach((a, i) => {
      out[a].time = prev !== null && next !== null && next > prev ? round(prev + ((next - prev) * (i + 1)) / (added.length + 1)) : null;
    });
    r = end;
  }
  return out;
}

/** The sheet's new text after its words were edited to `text` (see rewordLines). */
export function rewordSheet(sheetText: string, text: string): string {
  return serializeLyrics(rewordLines(parseLyrics(sheetText), text));
}
