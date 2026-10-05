// Persian (and Arabic) text for the share cards. Their renderer (Satori)
// has no right-to-left layout: it puts words left to right, and measures
// each word with its letters' unjoined widths while drawing them joined,
// so the gaps come out ragged. Here each letter is swapped for its joined
// form (the Unicode presentation forms, which the renderer draws as they
// are), each word is written out in the order it's seen, and the words of
// a line are put in right-to-left order — leaving the renderer nothing to
// shape. See ogText.tsx for the layout.

// Each letter's isolated form and how many forms follow it in Unicode's
// order (isolated, final, initial, medial): 4 joins both ways, 2 only to
// the letter before it, 1 never.
const FORMS = new Map<number, { isolated: number; count: 1 | 2 | 4 }>(
  (
    [
      [0x0621, 0xfe80, 1], // ء
      [0x0622, 0xfe81, 2], // آ
      [0x0623, 0xfe83, 2], // أ
      [0x0624, 0xfe85, 2], // ؤ
      [0x0625, 0xfe87, 2], // إ
      [0x0626, 0xfe89, 4], // ئ
      [0x0627, 0xfe8d, 2], // ا
      [0x0628, 0xfe8f, 4], // ب
      [0x0629, 0xfe93, 2], // ة
      [0x062a, 0xfe95, 4], // ت
      [0x062b, 0xfe99, 4], // ث
      [0x062c, 0xfe9d, 4], // ج
      [0x062d, 0xfea1, 4], // ح
      [0x062e, 0xfea5, 4], // خ
      [0x062f, 0xfea9, 2], // د
      [0x0630, 0xfeab, 2], // ذ
      [0x0631, 0xfead, 2], // ر
      [0x0632, 0xfeaf, 2], // ز
      [0x0633, 0xfeb1, 4], // س
      [0x0634, 0xfeb5, 4], // ش
      [0x0635, 0xfeb9, 4], // ص
      [0x0636, 0xfebd, 4], // ض
      [0x0637, 0xfec1, 4], // ط
      [0x0638, 0xfec5, 4], // ظ
      [0x0639, 0xfec9, 4], // ع
      [0x063a, 0xfecd, 4], // غ
      [0x0641, 0xfed1, 4], // ف
      [0x0642, 0xfed5, 4], // ق
      [0x0643, 0xfed9, 4], // ك
      [0x0644, 0xfedd, 4], // ل
      [0x0645, 0xfee1, 4], // م
      [0x0646, 0xfee5, 4], // ن
      [0x0647, 0xfee9, 4], // ه
      [0x0648, 0xfeed, 2], // و
      [0x0649, 0xfeef, 2], // ى
      [0x064a, 0xfef1, 4], // ي
      [0x067e, 0xfb56, 4], // پ
      [0x0686, 0xfb7a, 4], // چ
      [0x0698, 0xfb8a, 2], // ژ
      [0x06a9, 0xfb8e, 4], // ک
      [0x06af, 0xfb92, 4], // گ
      [0x06c0, 0xfba4, 2], // ۀ
      [0x06cc, 0xfbfc, 4], // ی
    ] as const
  ).map(([letter, isolated, count]) => [letter, { isolated, count }])
);

const TATWEEL = 0x0640; // ـ, the joining stroke: joins both ways, has no forms
const LAM = 0x0644;
/** لا and friends: one glyph; the isolated form, +1 for the final. */
const LAM_ALEF = new Map([
  [0x0622, 0xfef5],
  [0x0623, 0xfef7],
  [0x0625, 0xfef9],
  [0x0627, 0xfefb],
]);
// Vowel marks and the like. A mark belongs after its letter, which in the
// reversed word would hang it on the wrong one, so they're left out —
// titles hardly use them.
const MARK = /[ؐ-ًؚ-ٰٟۖ-ۭ]/u;
const ZWNJ = 0x200c; // the Persian half-space: keeps two letters apart

const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };

/** A Persian or Arabic letter, i.e. text that reads right to left. */
const RTL_LETTER = /[؀-ٟٮ-ەۺ-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/u;
const LTR_LETTER = /[\p{L}]/u;
/** What keeps its left-to-right order even inside a right-to-left word: numbers and Latin. */
const LTR_RUN = /[\p{N}A-Za-zÀ-ɏ]/u;

export function hasRtl(text: string): boolean {
  return RTL_LETTER.test(text);
}

const joins = (cp: number | undefined) => cp !== undefined && (cp === TATWEEL || (FORMS.get(cp)?.count ?? 1) > 1);
const joinsForward = (cp: number | undefined) => cp !== undefined && (cp === TATWEEL || FORMS.get(cp)?.count === 4);

/** Swaps each letter for the form it takes between its neighbours. */
function joinLetters(word: string): number[] {
  const cps = [...word].filter((ch) => !MARK.test(ch)).map((ch) => ch.codePointAt(0)!);
  const out: number[] = [];
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    if (cp === ZWNJ) continue; // its job (stopping the join) is done by being there
    const afterJoiner = joinsForward(cps[i - 1]) && joins(cp);
    const ligature = cp === LAM ? LAM_ALEF.get(cps[i + 1]) : undefined;
    if (ligature) {
      out.push(ligature + (afterJoiner ? 1 : 0));
      i++;
      continue;
    }
    const forms = FORMS.get(cp);
    if (!forms) {
      out.push(cp);
      continue;
    }
    const beforeJoiner = forms.count === 4 && joins(cps[i + 1]);
    // isolated, final, initial, medial
    const form = forms.count === 1 ? 0 : afterJoiner ? (beforeJoiner ? 3 : 1) : beforeJoiner ? 2 : 0;
    out.push(forms.isolated + form);
  }
  return out;
}

/**
 * One right-to-left word, joined and written out in the order it's seen
 * (left to right): the letters reversed, numbers and Latin inside it kept
 * as they are, brackets mirrored.
 */
export function visualWord(word: string): string {
  const chars = joinLetters(word).map((cp) => String.fromCodePoint(cp));
  const pieces: { ltr: boolean; chars: string[] }[] = [];
  chars.forEach((ch, i) => {
    // "۲.۵", "12:30": a separator between digits stays inside the number.
    const ltr = LTR_RUN.test(ch) || (/[.,:/-]/.test(ch) && LTR_RUN.test(chars[i - 1] ?? "") && LTR_RUN.test(chars[i + 1] ?? ""));
    const last = pieces[pieces.length - 1];
    if (last?.ltr === ltr) last.chars.push(ch);
    else pieces.push({ ltr, chars: [ch] });
  });
  return pieces
    .reverse()
    .map((piece) => (piece.ltr ? piece.chars : piece.chars.reverse().map((ch) => MIRROR[ch] ?? ch)).join(""))
    .join("");
}

/** A stretch of words going the same way. Right-to-left words are already visual (see visualWord). */
export type BidiRun = { rtl: boolean; words: string[] };

/**
 * Splits a line into runs of words going the same way, in reading order,
 * and says which way the line as a whole goes (that of its first word that
 * has letters). Numbers go with the words before them ("نسخه ۲"); other
 * words without letters ("+", "—") go the way of the words around them,
 * or the line's way when those disagree.
 */
export function bidiRuns(text: string): { rtl: boolean; runs: BidiRun[] } {
  const words = text.split(/\s+/).filter(Boolean);
  const strong = words.map((w) => (RTL_LETTER.test(w) ? true : LTR_LETTER.test(w) ? false : null));
  const rtl = strong.find((d) => d !== null) ?? false;
  const dirs = strong.map((d, i) => {
    if (d !== null) return d;
    const before = strong.slice(0, i).reverse().find((x) => x !== null);
    const after = strong.slice(i + 1).find((x) => x !== null);
    if (/\p{N}/u.test(words[i])) return before ?? after ?? rtl;
    return (before ?? rtl) === (after ?? rtl) ? (before ?? rtl) : rtl;
  });
  const runs: BidiRun[] = [];
  words.forEach((word, i) => {
    const last = runs[runs.length - 1];
    const shaped = dirs[i] ? visualWord(word) : word;
    if (last && last.rtl === dirs[i]) last.words.push(shaped);
    else runs.push({ rtl: dirs[i], words: [shaped] });
  });
  return { rtl, runs };
}
