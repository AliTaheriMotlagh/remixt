// What an exported file says about itself — title, artist, who the vocal
// and the beat came from, BPM, key, the cover, and where it was made — so
// it shows up properly in Files, Music, Spotify's local files, a DJ's
// library or a car stereo, and keeps pointing back to the remix.
//
// MP3s get an ID3v2.3 tag. That's v2.3 rather than v2.4 on purpose: it's
// the version every player reads (Windows Explorer and many car stereos
// ignore v2.4), and its UTF-16 text carries Persian and Arabic titles fine.
// WAVs get a RIFF LIST/INFO chunk (Windows, DAWs) plus the same ID3 tag in
// an "id3 " chunk (macOS Music, VLC, foobar, Mp3tag, Serato).
//
// Pure byte-building, no DOM: tests/audio-tags.test.ts runs it in Node.

export type TrackCredit = {
  /** "Vocals", "Beat", "Drums"… */
  role: string;
  track: string;
  artist: string;
};

export type AudioTags = {
  title: string;
  artist: string;
  album?: string;
  /** e.g. "Remix" or the remix's first tag. */
  genre?: string;
  year?: number;
  bpm?: number;
  /** ID3 form: "Am", "C#", "Bb" (see id3Key). */
  key?: string;
  /** The finished length, in milliseconds. */
  lengthMs?: number;
  /** Where the vocal, beat and parts came from. */
  credits?: TrackCredit[];
  /** A line for the comment field — the "made with" credit. */
  comment?: string;
  /** The remix's own page, if it has one. */
  url?: string;
  /** The site, for the publisher's link. */
  siteUrl?: string;
  /** The site's name: publisher, encoder, software. */
  siteName?: string;
  cover?: { mime: "image/jpeg" | "image/png"; data: Uint8Array };
};

// --- ID3v2.3 -----------------------------------------------------------------

function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[i] = code < 256 ? code : 0x3f; // "?"
  }
  return out;
}

/** UTF-16 with a byte-order mark (little-endian), as ID3v2.3 encoding 1 wants. */
function utf16(text: string, terminate = false): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2 + (terminate ? 2 : 0));
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[2 + i * 2] = code & 0xff;
    out[3 + i * 2] = code >> 8;
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** True when plain Latin-1 holds the text (smaller, and the oldest readers prefer it). */
function isLatin1(text: string) {
   
  return /^[\x00-\xff]*$/.test(text);
}

function frame(id: string, body: Uint8Array): Uint8Array {
  const header = new Uint8Array(10);
  header.set(latin1(id), 0);
  // v2.3 frame sizes are plain 32-bit big-endian (v2.4's are synchsafe).
  new DataView(header.buffer).setUint32(4, body.length);
  return concat([header, body]);
}

function textFrame(id: string, text: string): Uint8Array {
  const body = isLatin1(text) ? concat([Uint8Array.of(0), latin1(text)]) : concat([Uint8Array.of(1), utf16(text)]);
  return frame(id, body);
}

/** TXXX / COMM style: a description, then the value, in one encoding. */
function describedText(description: string, value: string): Uint8Array {
  return isLatin1(description + value)
    ? concat([Uint8Array.of(0), latin1(description), Uint8Array.of(0), latin1(value)])
    : concat([Uint8Array.of(1), utf16(description, true), utf16(value)]);
}

function userText(description: string, value: string) {
  return frame("TXXX", describedText(description, value));
}

function comment(text: string, description = "") {
  const body = describedText(description, text);
  // Encoding byte, then the language, then the rest.
  return frame("COMM", concat([body.subarray(0, 1), latin1("eng"), body.subarray(1)]));
}

/** URL frames are Latin-1, so anything else in the link is percent-encoded. */
function asciiUrl(url: string) {
  try {
    return latin1(new URL(url).href);
  } catch {
    return latin1(encodeURI(url));
  }
}

function urlFrame(id: string, url: string) {
  return frame(id, asciiUrl(url));
}

function userUrl(description: string, url: string) {
  const desc = isLatin1(description) ? concat([Uint8Array.of(0), latin1(description), Uint8Array.of(0)]) : concat([Uint8Array.of(1), utf16(description, true)]);
  return frame("WXXX", concat([desc, asciiUrl(url)]));
}

function picture(cover: NonNullable<AudioTags["cover"]>) {
  return frame(
    "APIC",
    concat([
      Uint8Array.of(0), // Latin-1 description
      latin1(cover.mime),
      Uint8Array.of(0),
      Uint8Array.of(3), // front cover
      Uint8Array.of(0), // empty description
      cover.data,
    ])
  );
}

/** "Vocals: Artist – Track · Beat: Artist – Track" */
export function creditLine(credits: TrackCredit[]) {
  return credits.map((c) => `${c.role}: ${c.artist ? `${c.artist} – ` : ""}${c.track}`).join(" · ");
}

/** An ID3v2.3 tag, ready to go in front of MP3 frames (or in a WAV's "id3 " chunk). */
export function id3Tag(tags: AudioTags): Uint8Array {
  const frames: Uint8Array[] = [];
  const add = (id: string, value: string | number | undefined) => {
    const text = value === undefined ? "" : String(value).trim();
    if (text) frames.push(textFrame(id, text));
  };
  add("TIT2", tags.title);
  add("TPE1", tags.artist);
  add("TPE2", tags.artist);
  add("TALB", tags.album);
  add("TCON", tags.genre);
  add("TYER", tags.year);
  add("TBPM", tags.bpm ? Math.round(tags.bpm) : undefined);
  add("TKEY", tags.key);
  add("TLEN", tags.lengthMs ? Math.round(tags.lengthMs) : undefined);
  add("TPUB", tags.siteName);
  add("TENC", tags.siteName);
  add("TSSE", tags.siteName);
  const credits = tags.credits ?? [];
  if (credits.length) {
    // The original artists, for players that list them…
    add("TOPE", [...new Set(credits.map((c) => c.artist).filter(Boolean))].join(", "));
    // …a subtitle most players show under the title…
    add("TIT3", creditLine(credits));
    // …and each role on its own, for libraries that read custom fields.
    for (const role of [...new Set(credits.map((c) => c.role))]) {
      const of = credits.filter((c) => c.role === role);
      frames.push(userText(role.toUpperCase(), of.map((c) => (c.artist ? `${c.artist} – ${c.track}` : c.track)).join("; ")));
    }
  }
  const commentText = [tags.comment, credits.length ? creditLine(credits) : ""].filter(Boolean).join("\n");
  if (commentText) frames.push(comment(commentText));
  if (tags.url) {
    frames.push(urlFrame("WOAS", tags.url));
    frames.push(userUrl(tags.siteName ?? "Link", tags.url));
  }
  if (tags.siteUrl) frames.push(urlFrame("WPUB", tags.siteUrl));
  if (tags.cover) frames.push(picture(tags.cover));

  const body = concat(frames);
  const header = new Uint8Array(10);
  header.set(latin1("ID3"), 0);
  header[3] = 3; // v2.3
  header[4] = 0;
  header[5] = 0; // no flags
  // The tag's size is synchsafe: 7 bits per byte.
  const size = body.length;
  header[6] = (size >> 21) & 0x7f;
  header[7] = (size >> 14) & 0x7f;
  header[8] = (size >> 7) & 0x7f;
  header[9] = size & 0x7f;
  return concat([header, body]);
}

// --- WAV ---------------------------------------------------------------------

function chunk(id: string, body: Uint8Array): Uint8Array {
  // Chunks are padded to an even length; the size doesn't count the pad.
  const out = new Uint8Array(8 + body.length + (body.length % 2));
  out.set(latin1(id), 0);
  new DataView(out.buffer).setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

/** RIFF INFO strings are NUL-terminated; UTF-8 keeps non-Latin titles readable in most tools. */
function infoString(text: string) {
  return concat([new TextEncoder().encode(text), Uint8Array.of(0)]);
}

/** The chunks that follow a WAV's "data": LIST/INFO, then the ID3 tag. */
export function wavTagChunks(tags: AudioTags): Uint8Array {
  const entries: [string, string | undefined][] = [
    ["INAM", tags.title],
    ["IART", tags.artist],
    ["IPRD", tags.album],
    ["IGNR", tags.genre],
    ["ICRD", tags.year ? String(tags.year) : undefined],
    ["ICMT", [tags.comment, tags.credits?.length ? creditLine(tags.credits) : "", tags.url].filter(Boolean).join(" — ")],
    ["ISFT", tags.siteName],
  ];
  const info = concat([
    latin1("INFO"),
    ...entries.filter(([, v]) => v && v.trim()).map(([id, v]) => chunk(id, infoString(v!.trim()))),
  ]);
  return concat([chunk("LIST", info), chunk("id3 ", id3Tag(tags))]);
}

/** The 44-byte header of a 16-bit PCM WAV with `extraBytes` of chunks after the samples. */
export function wavHeader({
  channels,
  sampleRate,
  dataBytes,
  extraBytes = 0,
}: {
  channels: number;
  sampleRate: number;
  dataBytes: number;
  extraBytes?: number;
}): Uint8Array {
  const out = new Uint8Array(44);
  const view = new DataView(out.buffer);
  const blockAlign = channels * 2;
  out.set(latin1("RIFF"), 0);
  view.setUint32(4, 36 + dataBytes + (dataBytes % 2) + extraBytes, true);
  out.set(latin1("WAVEfmt "), 8);
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  out.set(latin1("data"), 36);
  view.setUint32(40, dataBytes, true);
  return out;
}

// --- Names -------------------------------------------------------------------

const KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** A key as ID3's TKEY spells it: "Am", "F#", "Bb". */
export function id3Key(key: { tonic: number; mode: "major" | "minor" }) {
  return `${KEY_NAMES[((Math.round(key.tonic) % 12) + 12) % 12]}${key.mode === "minor" ? "m" : ""}`;
}

/**
 * A file name that keeps the title as written — Persian, accents, emoji —
 * and drops only what Windows, macOS, iOS and Android refuse in a name.
 */
export function fileSafeName(name: string, fallback = "Remixt mix") {
  const cleaned = name
     
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Windows won't end a name in a dot or a space.
    .replace(/[. ]+$/, "")
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}

/** "Artist - Title (Vocals).mp3" */
export function audioFileName({ artist, title, part, extension }: { artist?: string; title: string; part?: string; extension: string }) {
  const base = [artist?.trim(), title.trim()].filter(Boolean).join(" - ");
  return `${fileSafeName(part ? `${base} (${part})` : base)}.${extension}`;
}
