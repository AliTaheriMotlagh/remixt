// Finding a song's lyrics when the name is typed in Persian, in Finglish
// (Persian in Latin letters), or comes off a file name. Pure — the search
// route and the tests share it.
//
// The lyrics library (LRCLIB) keeps Persian songs under Finglish titles
// ("Firooz", "Baghalam Kon") with the words themselves in Persian script,
// and only matches whole words spelled exactly. So a search typed as
// "هیچکس فیروز", or as "hichkas firoz", finds nothing on its own. Here:
//
//  - Persian text is normalised (Arabic ي/ك, diacritics, ZWNJ, digits);
//  - well-known artists are recognised in either script and searched by
//    the spelling the library uses;
//  - the rest is transliterated to likely Finglish spellings;
//  - every result is scored by its consonant skeleton, which reads the
//    same in both scripts and whatever vowels were written: فیروز, Firooz
//    and Firuz are all "f r z".

/** Arabic letter forms and marks folded to Persian; Persian and Arabic digits to 0–9. */
export function normalizePersian(text: string): string {
  return text
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[أإٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/‌/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PERSIAN = /[؀-ۿ]/;

export function hasPersian(text: string) {
  return PERSIAN.test(text);
}

/**
 * Artists as the lyrics library spells them, with the names people type
 * for them — in Persian and the common Finglish spellings. Persian rap
 * first, then the singers people most often rap or sing over.
 */
const ARTISTS: [latin: string, aliases: string[]][] = [
  ["Hichkas", ["هیچکس", "هیچ کس", "hich kas", "hichkas"]],
  ["Yas", ["یاس", "yas"]],
  ["Reza Pishro", ["رضا پیشرو", "پیشرو", "pishro", "reza pishro"]],
  ["Shayea", ["شایع", "shayea", "shayee", "shaye"]],
  ["Amir Tataloo", ["امیر تتلو", "تتلو", "tataloo", "tatalo", "amir tataloo"]],
  ["Zedbazi", ["زدبازی", "زد بازی", "zedbazi", "zed bazi"]],
  ["Sorena", ["سورنا", "علی سورنا", "sorena", "ali sorena"]],
  ["Gdaal", ["جیدال", "gdaal", "gdal"]],
  ["Bahram", ["بهرام", "bahram nouraei", "bahram"]],
  ["Fadaei", ["فدایی", "fadaei", "fadaee"]],
  ["Sepehr Khalse", ["سپهر خلسه", "خلسه", "khalse", "sepehr khalse"]],
  ["Hiphopologist", ["هیپ هاپولوژیست", "هیپهاپولوژیست", "hiphopologist"]],
  ["Erfan", ["عرفان", "erfan"]],
  ["Putak", ["پوتک", "پوریا پوتک", "putak", "pouria putak"]],
  ["Ho3ein", ["حصین", "ho3ein", "hosein", "hossein"]],
  ["Tohi", ["تهی", "tohi"]],
  ["Sadegh", ["صادق", "sadegh"]],
  ["Behzad Leito", ["بهزاد لیتو", "لیتو", "leito", "behzad leito"]],
  ["Paya", ["پایا", "paya"]],
  ["Imanemun", ["ایمانمون", "imanemun"]],
  ["Alireza JJ", ["علیرضا جی جی", "علیرضا جیجی", "alireza jj"]],
  ["Sijal", ["سیجل", "sijal"]],
  ["Nimo", ["نیمو", "nimo"]],
  ["Mehrad Hidden", ["مهراد هیدن", "هیدن", "hidden", "mehrad hidden"]],
  ["Catchybeatz", ["کچی بیتز", "catchybeatz"]],
  ["Ali Owj", ["علی اوج", "ali owj"]],
  ["Arta", ["آرتا", "arta"]],
  ["Koorosh", ["کوروش", "koorosh"]],
  ["Dorcci", ["دورچی", "dorcci"]],
  ["Kamyar", ["کامیار", "kamyar"]],
  ["Shapur", ["شاپور", "shapur"]],
  ["Amir Khalvat", ["امیر خلوت", "خلوت", "khalvat"]],
  ["021kid", ["021 کید", "021kid"]],
  ["Ashkan Kagan", ["اشکان کاگان", "kagan"]],
  ["Sasy", ["ساسی", "ساسی مانکن", "sasy", "sasy mankan"]],
  ["Shahin Najafi", ["شاهین نجفی", "shahin najafi"]],
  ["Saman Wilson", ["سامان ویلسون", "saman wilson"]],
  ["Mohsen Chavoshi", ["محسن چاوشی", "چاوشی", "chavoshi"]],
  ["Mohsen Yeganeh", ["محسن یگانه", "یگانه", "yeganeh"]],
  ["Shadmehr Aghili", ["شادمهر عقیلی", "شادمهر", "shadmehr"]],
  ["Ebi", ["ابی", "ebi"]],
  ["Dariush", ["داریوش", "dariush", "dariush eghbali"]],
  ["Googoosh", ["گوگوش", "googoosh"]],
  ["Sirvan Khosravi", ["سیروان خسروی", "سیروان", "sirvan"]],
  ["Xaniar Khosravi", ["زانیار خسروی", "زانیار", "xaniar", "zanyar"]],
  ["Mohammad Alizadeh", ["محمد علیزاده", "alizadeh"]],
  ["Ehsan Khajeamiri", ["احسان خواجه امیری", "khajeamiri", "khaje amiri"]],
  ["Reza Bahram", ["رضا بهرام", "reza bahram"]],
  ["Homayoun Shajarian", ["همایون شجریان", "homayoun shajarian"]],
  ["Mohsen Ebrahimzadeh", ["محسن ابراهیم زاده", "ebrahimzadeh"]],
  ["Hamed Homayoun", ["حامد همایون", "hamed homayoun"]],
  ["Babak Jahanbakhsh", ["بابک جهانبخش", "jahanbakhsh"]],
  ["Benyamin Bahadori", ["بنیامین بهادری", "بنیامین", "benyamin"]],
  ["Siavash Ghomayshi", ["سیاوش قمیشی", "ghomayshi"]],
  ["Moein", ["معین", "moein"]],
  ["Hayedeh", ["هایده", "hayedeh"]],
  ["Mahasti", ["مهستی", "mahasti"]],
  ["Shahram Shabpareh", ["شهرام شب پره", "shabpareh"]],
  ["Andy", ["اندی", "andy"]],
  ["Kourosh Yaghmaei", ["کوروش یغمایی", "yaghmaei"]],
  ["Farhad", ["فرهاد", "farhad mehrad"]],
  ["Arash", ["آرش", "arash"]],
  ["Amir Abbas Golab", ["امیرعباس گلاب", "امیر عباس گلاب", "golab"]],
  ["Masoud Sadeghloo", ["مسعود صادقلو", "sadeghloo"]],
  ["Macan Band", ["ماکان بند", "macan band", "macan"]],
  ["Hamid Hiraad", ["حمید هیراد", "hiraad", "hiraad"]],
  ["Ali Yasini", ["علی یاسینی", "yasini"]],
  ["Reza Sadeghi", ["رضا صادقی", "reza sadeghi"]],
  ["Morteza Pashaei", ["مرتضی پاشایی", "پاشایی", "pashaei"]],
  ["Mohsen Namjoo", ["محسن نامجو", "نامجو", "namjoo"]],
  ["Chaartaar", ["چارتار", "chaartaar", "chartar"]],
  ["Pallett", ["پالت", "pallett"]],
  ["Hojat Ashrafzadeh", ["حجت اشرف زاده", "ashrafzadeh"]],
];

/** Each alias as normalised words, longest first, so "امیر تتلو" wins over "تتلو". */
const ALIASES = ARTISTS.flatMap(([latin, aliases]) =>
  aliases.map((alias) => ({ latin, words: normalizePersian(alias).toLowerCase().split(" ") }))
).sort((a, b) => b.words.length - a.words.length);

/** The artist named in `words` (normalised, lower case), and the words left over. */
export function findArtist(words: string[]): { artist: string; rest: string[] } | null {
  for (const alias of ALIASES) {
    for (let i = 0; i + alias.words.length <= words.length; i++) {
      if (alias.words.every((w, k) => words[i + k] === w)) {
        return { artist: alias.latin, rest: [...words.slice(0, i), ...words.slice(i + alias.words.length)] };
      }
    }
  }
  return null;
}

/**
 * The search in Persian letters when it names a known artist in Finglish
 * ("shayea monam haji" → "شایع monam haji") — Iranian music sites title
 * their pages in Persian. Null when there's nothing to change.
 */
export function persianArtistQuery(query: string): string | null {
  const words = normalizePersian(query).toLowerCase().split(" ").filter(Boolean);
  if (!words.length || words.some(hasPersian)) return null;
  const found = findArtist(words);
  if (!found) return null;
  const persian = ARTISTS.find(([latin]) => latin === found.artist)?.[1].find(hasPersian);
  return persian ? [persian, ...found.rest].join(" ") : null;
}

const FA_LATIN: Record<string, string> = {
  ب: "b", پ: "p", ت: "t", ط: "t", ث: "s", س: "s", ص: "s", ج: "j", چ: "ch", ح: "h", خ: "kh",
  د: "d", ذ: "z", ز: "z", ض: "z", ظ: "z", ر: "r", ژ: "zh", ش: "sh", غ: "gh", ق: "gh", ف: "f",
  ک: "k", گ: "g", ل: "l", م: "m", ن: "n", ع: "", ء: "",
};

/**
 * Likely Finglish spellings of one Persian word, best first. Persian
 * doesn't write short vowels, so this is a guess — good for words that
 * are mostly long vowels (فیروز → firooz), which is what titles often are.
 */
export function finglishOf(word: string): string[] {
  const letters = [...normalizePersian(word)];
  const spell = (initialAlef: string) =>
    letters
      .map((c, i) => {
        const prev = letters[i - 1];
        const next = letters[i + 1];
        if (c === "آ") return "a";
        if (c === "ا") return i === 0 ? initialAlef : "a";
        if (c === "و") return i === 0 || prev === "ا" || next === "ا" ? "v" : "oo";
        if (c === "ی") return i === 0 || next === "ا" || next === "و" ? "y" : "i";
        if (c === "ه") return i > 0 && i === letters.length - 1 ? "e" : "h";
        if (c in FA_LATIN) return FA_LATIN[c];
        return /[a-z0-9]/i.test(c) ? c : "";
      })
      .join("");
  const first = spell("a");
  const out = [first];
  // An alef before a consonant is as often "e" (اخطار → ekhtar) as "a".
  if (letters[0] === "ا" && letters[1] && !"اوی".includes(letters[1])) out.push(spell("e"));
  return out.filter((s, i, all) => s && all.indexOf(s) === i);
}

const FA_SKELETON: Record<string, string> = {
  ب: "b", پ: "p", ت: "t", ط: "t", ث: "s", س: "s", ص: "s", ج: "j", چ: "c", ح: "h", ه: "h", خ: "x",
  د: "d", ذ: "z", ز: "z", ض: "z", ظ: "z", ر: "r", ژ: "J", ش: "S", غ: "q", ق: "q", ف: "f",
  ک: "k", گ: "g", ل: "l", م: "m", ن: "n",
};

/**
 * A word's consonants as one alphabet shared by Persian and Finglish:
 * vowels (and و/ی, which are as often vowels) left out, sounds spelled
 * two ways folded together, doubles collapsed.
 */
export function skeletonOf(word: string): string {
  let out = "";
  if (hasPersian(word)) {
    const letters = [...normalizePersian(word).replace(/\s/g, "")];
    letters.forEach((c, i) => {
      // A final ه is the vowel "e" (خونه = khoone).
      if (c === "ه" && i > 0 && i === letters.length - 1) return;
      if (c in FA_SKELETON) out += FA_SKELETON[c];
      else if (/[0-9]/.test(c)) out += c;
    });
  } else {
    let w = word
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    // A final h after a vowel is part of the vowel (shah, allah).
    w = w.replace(/([aeiou])h$/, "$1");
    out = w
      .replace(/kh/g, "x")
      .replace(/gh/g, "q")
      .replace(/sh/g, "S")
      .replace(/ch/g, "C")
      .replace(/zh/g, "J")
      .replace(/ph/g, "f")
      // A lone c is a k (Cigare); چ was taken as "ch" just above.
      .replace(/c/g, "k")
      .replace(/C/g, "c")
      .replace(/[aeiouywv]/g, "");
  }
  return out.replace(/(.)\1+/g, "$1");
}

// Words that say what kind of upload it is, not what the song is called.
const NOISE_WORDS = new Set([
  "feat", "ft", "featuring", "official", "video", "audio", "lyrics", "lyric", "remix", "live", "hd", "hq",
  "music", "song", "new", "the", "a", "and", "&", "x",
  "آهنگ", "جدید", "دانلود", "با", "متن", "از", "و", "موزیک", "ویدیو", "ریمیکس", "رسمی",
]);

/** A text as the skeletons of its words that carry the name. */
export function skeletonWords(text: string): string[] {
  return normalizePersian(text)
    .toLowerCase()
    .split(/[\s\-–—_|/,.()[\]{}"'“”«»!?:;]+/)
    .filter((w) => w && !NOISE_WORDS.has(w))
    .map(skeletonOf)
    .filter(Boolean);
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/** How alike two skeleton words are, 0–1. Short ones have to be the same. */
function wordLikeness(a: string, b: string) {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) <= 2) return 0;
  return Math.max(0, 1 - editDistance(a, b) / Math.max(a.length, b.length));
}

/** How much of `wanted` is found in `found`, 0–1: each wanted word against its best match. */
function coverage(wanted: string[], found: string[]) {
  if (wanted.length === 0) return 0;
  let total = 0;
  for (const w of wanted) {
    const best = Math.max(0, ...found.map((f) => wordLikeness(w, f)));
    if (best >= 0.6) total += best;
  }
  return total / wanted.length;
}

/**
 * How well a song matches what was searched for, 0–1: most of it how much
 * of the search is in the song's title and artist, some of it how much of
 * the title the search covers (so "Firooz" beats "Mesle Hichkas 2" for
 * "hichkas firooz").
 */
export function matchScore(query: string, title: string, artist: string): number {
  const wanted = skeletonWords(query);
  const titleWords = skeletonWords(title);
  const found = [...titleWords, ...skeletonWords(artist)];
  return 0.7 * coverage(wanted, found) + 0.3 * coverage(titleWords, wanted);
}

/**
 * The other common Finglish spelling of a word: the long "oo" written
 * short or long (firoz ↔ firooz, khune ↔ khoone).
 */
export function otherSpelling(word: string): string {
  if (/oo/.test(word)) return word.replace(/oo/g, "o");
  if (/[^aeiou][ou][^aeiou]/.test(word)) return word.replace(/([^aeiou])[ou]([^aeiou])/g, "$1oo$2");
  return word;
}

/** One search to ask the library: a free search, or a title (and artist). */
export type LibraryQuery = { q: string } | { track_name: string; artist_name?: string };

const MAX_QUERIES = 6;

/**
 * The searches worth asking the library for, best first. For Persian text,
 * or a known artist in any spelling, that's the artist by their library
 * spelling (their songs come back to be scored) and the artist with the
 * title in likely Finglish spellings.
 */
export function libraryQueries(query: string, { track, artist }: { track?: string; artist?: string } = {}): LibraryQuery[] {
  const out: LibraryQuery[] = [];
  // The library ignores case, so "Hichkas Firooz" and "hichkas firooz" are one search.
  const keyOf = (q: LibraryQuery) => JSON.stringify(q).toLowerCase();
  const push = (q: LibraryQuery) => {
    if (!out.some((o) => keyOf(o) === keyOf(q))) out.push(q);
  };
  const text = normalizePersian([artist, track, query].filter(Boolean).join(" "));
  if (track) push(artist ? { track_name: track, artist_name: artist } : { track_name: track });
  if (text) push({ q: text });

  const words = text.toLowerCase().split(" ").filter((w) => w && !NOISE_WORDS.has(w));
  const known = findArtist(words);
  const rest = known ? known.rest : words;
  const latinRest = rest.map((w) => (hasPersian(w) ? finglishOf(w) : [w, otherSpelling(w)]));
  // Spellings of the rest: each word's best guess, then each word's second.
  const spellings = [latinRest.map((s) => s[0]).join(" "), latinRest.map((s) => s[1] ?? s[0]).join(" ")].filter(
    (s, i, all) => s.trim() && all.indexOf(s) === i
  );

  if (known) {
    for (const spelling of spellings) push({ q: `${known.artist} ${spelling}` });
    push({ q: known.artist });
  }
  for (const spelling of spellings) push({ q: spelling });
  return out.slice(0, MAX_QUERIES);
}

/** A song as the library gives it, with what ranking needs. */
export type Candidate = {
  id: number;
  title: string;
  artist: string;
  duration: number | null;
  plain: string | null;
  synced: string | null;
};

/**
 * The library's answers to every search, put together: the same song
 * (title, artist and length) once — its timed copy if it has one — best
 * match first, timed lyrics and the same length as the beat ahead.
 */
export function rankCandidates<T extends Candidate>(found: T[], query: string, duration?: number | null): T[] {
  const words = normalizePersian(query).split(" ").filter((w) => hasPersian(w) && w.length > 1);
  const keyOf = (item: T) => `${skeletonWords(item.title).join(" ")}|${skeletonWords(item.artist).join(" ")}|${Math.round((item.duration ?? 0) / 3)}`;
  // Popular songs are in the library many times over: a hint which of two same-named songs is meant.
  const copies = new Map<string, number>();
  const seen = new Set<number>();
  for (const item of found) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    copies.set(keyOf(item), (copies.get(keyOf(item)) ?? 0) + 1);
  }
  const scored = new Map<string, { item: T; score: number }>();
  for (const item of found) {
    const key = keyOf(item);
    let score = matchScore(query, item.title, item.artist) * 10;
    score += Math.min(1, Math.log2(copies.get(key) ?? 1) / 3);
    if (item.synced) score += 1.5;
    if (duration && item.duration) {
      const off = Math.abs(item.duration - duration);
      if (off <= 3) score += 2;
      else if (off <= 10) score += 1;
    }
    // Persian words typed that are in the song's words: likely the song (titles are often its hook).
    if (words.length) {
      const lyrics = normalizePersian(item.plain ?? item.synced ?? "");
      const inLyrics = words.filter((w) => lyrics.includes(w)).length / words.length;
      score += inLyrics * 3;
    }
    const kept = scored.get(key);
    if (!kept || (item.synced && !kept.item.synced) || score > kept.score + 0.01) scored.set(key, { item, score });
  }
  const ranked = [...scored.values()].sort((a, b) => b.score - a.score);
  // Once something matches well, the songs that barely do are noise.
  const best = ranked[0]?.score ?? 0;
  return ranked.filter((r) => best < 6 || r.score >= 3).map((r) => r.item);
}

/** Whether `found` already has a song that's surely the one searched for — no need to ask further. */
export function hasSureMatch(found: Candidate[], query: string): boolean {
  return found.some((item) => (item.plain || item.synced) && matchScore(query, item.title, item.artist) >= 0.85);
}
