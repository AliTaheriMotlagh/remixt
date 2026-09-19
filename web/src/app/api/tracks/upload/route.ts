import { randomUUID } from "crypto";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeStorageStream } from "@/lib/storage";

const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"];
const MAX_BYTES = 60 * 1024 * 1024; // 60MB

// Receives the audio file itself and streams it to local storage, returning
// the storage key that /api/tracks/register then turns into a track row.
// The browser posts the raw file as the request body (see UploadManager),
// which keeps upload progress reportable via XHR without a multipart parse.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const filename = req.nextUrl.searchParams.get("filename");
  if (!filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type — use ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const declaredSize = Number(req.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BYTES) {
    return NextResponse.json({ error: "File is larger than 60MB" }, { status: 413 });
  }

  if (!req.body) {
    return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  }

  const key = `uploads/${randomUUID()}${ext}`;
  try {
    const bytes = await writeStorageStream(key, req.body);
    if (bytes === 0) {
      return NextResponse.json({ error: "Empty upload" }, { status: 400 });
    }
    if (bytes > MAX_BYTES) {
      return NextResponse.json({ error: "File is larger than 60MB" }, { status: 413 });
    }
    return NextResponse.json({ key });
  } catch (err) {
    console.error("[upload] failed:", err);
    return NextResponse.json({ error: "Could not save the file" }, { status: 500 });
  }
}
