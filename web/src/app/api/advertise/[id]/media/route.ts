import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { imageExtension } from "@/lib/imageType";
import { putObject } from "@/lib/storage";
import { AUDIO } from "@/lib/monetize/adRules";
import { campaignOwner, setCampaignMedia } from "@/lib/monetize/adStore";

// An ad's picture (?f=image: JPEG/PNG, 1 MB) or sound (?f=audio&seconds=12.3:
// MP3/M4A/OGG/WAV, ≤ 15 s, 1 MB). The page measures the sound's length
// before sending it; the player checks it again.

function audioExtension(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return ".mp3";
  if (ascii(4, 8) === "ftyp") return ".m4a";
  if (ascii(0, 4) === "OggS") return ".ogg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return ".wav";
  return null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const c = await campaignOwner(id);
  // The owner's own campaigns (made in Admin) take pictures and sounds too.
  if (!c || (c.owner_id !== user.id && !(c.owner_id === null && isAdmin(user)))) return NextResponse.json({ error: "Not your ad" }, { status: 404 });
  const kind = req.nextUrl.searchParams.get("f") === "audio" ? "audio" : "image";
  if (kind === "audio" && c.format !== "audio") return NextResponse.json({ error: "Only an audio ad has a sound" }, { status: 400 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > AUDIO.maxBytes) return NextResponse.json({ error: "Too big (1 MB at most)" }, { status: 413 });
  let ext: string | null;
  let seconds: number | null = null;
  if (kind === "image") {
    ext = imageExtension(body);
    if (!ext) return NextResponse.json({ error: "Use a JPEG or PNG picture" }, { status: 400 });
  } else {
    ext = audioExtension(body);
    if (!ext) return NextResponse.json({ error: "Use an MP3, M4A, OGG or WAV file" }, { status: 400 });
    seconds = Number(req.nextUrl.searchParams.get("seconds"));
    if (!(seconds > 0)) return NextResponse.json({ error: "Couldn't read the sound's length" }, { status: 400 });
    if (seconds > AUDIO.maxSeconds + 0.5) return NextResponse.json({ error: `An audio ad is ${AUDIO.maxSeconds} seconds at most` }, { status: 400 });
  }
  const key = `ads/${id}/${kind}-${Date.now().toString(36)}${ext}`;
  await putObject(key, body);
  await setCampaignMedia(id, kind, key, seconds);
  return NextResponse.json({ ok: true });
}
