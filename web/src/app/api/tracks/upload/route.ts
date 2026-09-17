import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

const ALLOWED_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/ogg",
  "audio/aac",
];

const MAX_BYTES = 60 * 1024 * 1024; // 60MB

// Issues short-lived client upload tokens so the browser can upload audio
// files directly to Vercel Blob, bypassing the ~4.5MB Vercel Functions
// request body limit. See src/components/UploadManager.tsx for the client
// side, and /api/tracks/register for what runs once the upload finishes.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Sign in required");

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async () => {
        // Track creation happens client-side via /api/tracks/register once
        // `upload()` resolves — simpler than relying on this webhook, which
        // Vercel Blob can't reach on localhost without a tunnel.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
