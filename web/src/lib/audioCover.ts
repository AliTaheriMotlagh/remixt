// The cover picture inside a song's file, if it has one: an MP3's ID3 tag
// (APIC, or PIC in old v2.2 tags), an M4A/MP4's `covr` atom, a FLAC
// PICTURE block, or an Ogg (Vorbis/Opus) file's METADATA_BLOCK_PICTURE
// comment. Read in the browser at upload (audioTags.ts writes tags; this
// reads them) and on the server for songs imported from a link — from
// slices of the file, so a long song isn't read whole.
// Pure apart from Blob reads, so the tests feed it made-up files.

export type Picture = { mime: string; data: Uint8Array };

/** The most a cover can be (a 3000 px JPEG is well under). Bigger is treated as damage. */
const MAX_PICTURE = 12 * 1024 * 1024;

async function bytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, Math.min(end, blob.size)).arrayBuffer());
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const u32le = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const syncsafe = (b: Uint8Array, at: number) => ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f);

/** The picture's type from its first bytes (tags often say "image/jpg", or nothing). */
function sniff(data: Uint8Array, said = ""): string | null {
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
  if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return "image/webp";
  if (ascii(data, 0, 3) === "GIF") return "image/gif";
  return /^image\/(jpe?g|png|webp|gif)$/i.test(said) ? said.toLowerCase().replace("jpg", "jpeg") : null;
}

function picture(data: Uint8Array, said?: string): Picture | null {
  if (data.length < 64 || data.length > MAX_PICTURE) return null;
  const mime = sniff(data, said);
  return mime ? { mime, data } : null;
}

/** Where a text ends in `encoding` (0/3: one zero byte; 1/2: UTF-16, two), from `at`: the index after its terminator. */
function afterText(b: Uint8Array, at: number, encoding: number): number {
  if (encoding === 1 || encoding === 2) {
    for (let i = at; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i + 2;
    return b.length;
  }
  const i = b.indexOf(0, at);
  return i < 0 ? b.length : i + 1;
}

/** Undoes ID3 unsynchronisation (0xFF 0x00 → 0xFF). */
function resync(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    out.push(b[i]);
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return Uint8Array.from(out);
}

/** The cover in an ID3v2 tag (`tag`, from "ID3" on). The front cover when it's marked, else the first picture. */
export function id3Picture(tag: Uint8Array): Picture | null {
  if (ascii(tag, 0, 3) !== "ID3") return null;
  const version = tag[3];
  const flags = tag[5];
  const size = syncsafe(tag, 6);
  let body = tag.subarray(10, 10 + size);
  if (flags & 0x80 && version < 4) body = resync(body);
  let at = 0;
  // An extended header comes first.
  if (flags & 0x40 && version >= 3) at = version === 4 ? syncsafe(body, 0) : u32(body, 0) + 4;
  const found: { type: number; pic: Picture }[] = [];
  const v22 = version === 2;
  const head = v22 ? 6 : 10;
  while (at + head <= body.length) {
    const id = ascii(body, at, v22 ? 3 : 4);
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const length = v22 ? (body[at + 3] << 16) | (body[at + 4] << 8) | body[at + 5] : version === 4 ? syncsafe(body, at + 4) : u32(body, at + 4);
    const start = at + head;
    let frame = body.subarray(start, start + length);
    if (version === 4 && !v22 && body[at + 9] & 0x02) frame = resync(frame);
    // v2.4: a "data length indicator" (4 bytes) before the frame's content.
    if (version === 4 && !v22 && body[at + 9] & 0x01) frame = frame.subarray(4);
    if ((id === "APIC" || id === "PIC") && frame.length > 4) {
      const encoding = frame[0];
      let p = 1;
      let said = "";
      if (id === "PIC") {
        const format = ascii(frame, 1, 3).toUpperCase();
        said = format === "PNG" ? "image/png" : "image/jpeg";
        p = 4;
      } else {
        const end = frame.indexOf(0, 1);
        said = ascii(frame, 1, Math.max(0, end - 1));
        p = end + 1;
      }
      const type = frame[p];
      p = afterText(frame, p + 1, encoding);
      const pic = picture(frame.subarray(p), said);
      if (pic) found.push({ type, pic });
    }
    if (length <= 0) break;
    at = start + length;
  }
  return (found.find((f) => f.type === 3) ?? found[0])?.pic ?? null;
}

/** The cover in a FLAC PICTURE block's body (also what Ogg files carry, base64'd). */
export function flacPicture(block: Uint8Array): { type: number; pic: Picture } | null {
  if (block.length < 32) return null;
  const type = u32(block, 0);
  let p = 4;
  const mimeLength = u32(block, p);
  const said = ascii(block, p + 4, Math.min(64, mimeLength));
  p += 4 + mimeLength;
  p += 4 + u32(block, p); // description
  p += 16; // width, height, depth, colours
  const length = u32(block, p);
  const pic = picture(block.subarray(p + 4, p + 4 + length), said);
  return pic ? { type, pic } : null;
}

async function fromMp3(file: Blob): Promise<Picture | null> {
  const head = await bytes(file, 0, 10);
  if (ascii(head, 0, 3) !== "ID3") return null;
  const size = syncsafe(head, 6);
  if (size > MAX_PICTURE * 2) return null;
  return id3Picture(await bytes(file, 0, 10 + size));
}

async function fromFlac(file: Blob): Promise<Picture | null> {
  let at = 4;
  const found: { type: number; pic: Picture }[] = [];
  for (let blocks = 0; blocks < 64; blocks++) {
    const h = await bytes(file, at, at + 4);
    if (h.length < 4) break;
    const last = h[0] & 0x80;
    const type = h[0] & 0x7f;
    const length = (h[1] << 16) | (h[2] << 8) | h[3];
    if (type === 6 && length <= MAX_PICTURE) {
      const pic = flacPicture(await bytes(file, at + 4, at + 4 + length));
      if (pic) found.push(pic);
    }
    at += 4 + length;
    if (last) break;
  }
  return (found.find((f) => f.type === 3) ?? found[0])?.pic ?? null;
}

/** The first boxes found by `name` in `b` from `from` to `to` (MP4 atoms: size, name, body). */
function box(b: Uint8Array, name: string, from: number, to: number): { start: number; end: number } | null {
  let at = from;
  while (at + 8 <= to) {
    let size = u32(b, at);
    let head = 8;
    if (size === 1) {
      size = u32(b, at + 8) * 2 ** 32 + u32(b, at + 12);
      head = 16;
    } else if (size === 0) size = to - at;
    if (size < head) return null;
    if (ascii(b, at + 4, 4) === name) return { start: at + head, end: Math.min(to, at + size) };
    at += size;
  }
  return null;
}

/** The cover in an MP4 `moov` box's bytes: moov › udta › meta › ilst › covr › data. */
export function mp4Picture(moov: Uint8Array): Picture | null {
  const udta = box(moov, "udta", 0, moov.length);
  // Some writers put meta straight in moov.
  const meta = (udta && box(moov, "meta", udta.start, udta.end)) ?? box(moov, "meta", 0, moov.length);
  if (!meta) return null;
  // meta is a "full box": 4 bytes of version and flags before its children (most writers).
  const metaStart = ascii(moov, meta.start + 4, 4) === "hdlr" ? meta.start : meta.start + 4;
  const ilst = box(moov, "ilst", metaStart, meta.end);
  if (!ilst) return null;
  const covr = box(moov, "covr", ilst.start, ilst.end);
  if (!covr) return null;
  const data = box(moov, "data", covr.start, covr.end);
  if (!data) return null;
  const kind = u32(moov, data.start) & 0xffffff;
  return picture(moov.subarray(data.start + 8, data.end), kind === 14 ? "image/png" : kind === 13 ? "image/jpeg" : "");
}

async function fromMp4(file: Blob): Promise<Picture | null> {
  // Walk the top-level boxes by their headers (moov is often at the end).
  let at = 0;
  for (let n = 0; n < 64 && at + 8 <= file.size; n++) {
    const h = await bytes(file, at, at + 16);
    let size = u32(h, 0);
    if (size === 1) size = u32(h, 8) * 2 ** 32 + u32(h, 12);
    else if (size === 0) size = file.size - at;
    if (size < 8) return null;
    if (ascii(h, 4, 4) === "moov") {
      if (size > 64 * 1024 * 1024) return null;
      const moov = await bytes(file, at, at + size);
      return mp4Picture(moov.subarray(u32(h, 0) === 1 ? 16 : 8));
    }
    at += size;
  }
  return null;
}

/** The second packet of an Ogg file's first stream (its comments), put back together from its pages. */
export function oggComments(b: Uint8Array): Uint8Array | null {
  let at = 0;
  let serial: number | null = null;
  const packets: number[][] = [[]];
  while (at + 27 <= b.length && ascii(b, at, 4) === "OggS") {
    const pageSerial = u32le(b, at + 14);
    const segments = b[at + 26];
    let body = at + 27 + segments;
    serial ??= pageSerial;
    for (let s = 0; s < segments; s++) {
      const lace = b[at + 27 + s];
      if (pageSerial === serial) {
        const packet = packets[packets.length - 1];
        for (let i = 0; i < lace && body + i < b.length; i++) packet.push(b[body + i]);
        // A lace under 255 ends the packet.
        if (lace < 255) {
          if (packets.length === 2) return Uint8Array.from(packets[1]);
          packets.push([]);
        }
      }
      body += lace;
    }
    at = body;
  }
  return null;
}

/** The cover in Vorbis/Opus comments (the packet from oggComments). */
export function vorbisPicture(comments: Uint8Array): Picture | null {
  // "\x03vorbis" or "OpusTags" before the comments.
  let p = ascii(comments, 0, 8) === "OpusTags" ? 8 : ascii(comments, 1, 6) === "vorbis" ? 7 : -1;
  if (p < 0) return null;
  p += 4 + u32le(comments, p); // vendor
  const count = u32le(comments, p);
  p += 4;
  const found: { type: number; pic: Picture }[] = [];
  for (let i = 0; i < count && p + 4 <= comments.length; i++) {
    const length = u32le(comments, p);
    const text = comments.subarray(p + 4, p + 4 + length);
    p += 4 + length;
    const key = "METADATA_BLOCK_PICTURE=";
    if (ascii(text, 0, key.length).toUpperCase() !== key) continue;
    try {
      const raw = atob(new TextDecoder().decode(text.subarray(key.length)).trim());
      const block = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const pic = flacPicture(block);
      if (pic) found.push(pic);
    } catch {
      // not base64: skipped
    }
  }
  return (found.find((f) => f.type === 3) ?? found[0])?.pic ?? null;
}

async function fromOgg(file: Blob): Promise<Picture | null> {
  const comments = oggComments(await bytes(file, 0, 16 * 1024 * 1024));
  return comments ? vorbisPicture(comments) : null;
}

/** The cover picture in a song file, or null when it has none (or it can't be read). */
export async function readCover(file: Blob): Promise<Picture | null> {
  try {
    const head = await bytes(file, 0, 12);
    if (ascii(head, 0, 3) === "ID3") return await fromMp3(file);
    if (ascii(head, 0, 4) === "fLaC") return await fromFlac(file);
    if (ascii(head, 0, 4) === "OggS") return await fromOgg(file);
    if (ascii(head, 4, 4) === "ftyp") return await fromMp4(file);
    return null;
  } catch {
    return null;
  }
}
