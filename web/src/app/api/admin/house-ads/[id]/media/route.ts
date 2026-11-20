import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import { imageExtension } from "@/lib/imageType";
import { putObject } from "@/lib/storage";
import { getSettings } from "@/lib/settings/server";
import { setHouseAdMedia } from "@/lib/monetize/houseStore";

// A picture (JPEG/PNG, 1 MB), video (MP4/WebM, 12 MB) or sound (?seconds=…:
// MP3/M4A/OGG/WAV, 1 MB, up to the longest audio ad) for one of Remixt's own
// ads (admin only). The page measures a sound's length before sending it.

const LIMITS = { image: 1024 * 1024, audio: 1024 * 1024, video: 12 * 1024 * 1024 };

function sniff(b: Uint8Array): { kind: "image" | "audio" | "video"; ext: string } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  const image = imageExtension(Buffer.from(b));
  if (image) return { kind: "image", ext: image };
  if (ascii(4, 8) === "ftyp") {
    // MP4 family: an M4A is audio, the rest video.
    const brand = ascii(8, 12);
    return brand.startsWith("M4A") ? { kind: "audio", ext: ".m4a" } : { kind: "video", ext: ".mp4" };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: "video", ext: ".webm" };
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { kind: "audio", ext: ".mp3" };
  if (ascii(0, 4) === "OggS") return { kind: "audio", ext: ".ogg" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { kind: "audio", ext: ".wav" };
  return null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const body = Buffer.from(await req.arrayBuffer());
  const found = sniff(body);
  if (!found) return NextResponse.json({ error: "Use a JPEG/PNG picture, an MP4/WebM video, or an MP3/M4A/OGG/WAV sound" }, { status: 400 });
  if (body.length > LIMITS[found.kind]) return NextResponse.json({ error: `Too big (${LIMITS[found.kind] / 1024 / 1024} MB at most)` }, { status: 413 });
  let seconds: number | null = null;
  if (found.kind === "audio") {
    seconds = Number(req.nextUrl.searchParams.get("seconds"));
    if (!(seconds > 0)) return NextResponse.json({ error: "Couldn't read the sound's length" }, { status: 400 });
    const { maxSeconds } = (await getSettings()).audio;
    if (seconds > maxSeconds + 0.5) return NextResponse.json({ error: `A sound is ${maxSeconds} seconds at most` }, { status: 400 });
  }
  const key = `ads/house/${id}/${found.kind}-${Date.now().toString(36)}${found.ext}`;
  await putObject(key, body);
  await setHouseAdMedia(id, key, seconds);
  return NextResponse.json({ ok: true, kind: found.kind });
}
