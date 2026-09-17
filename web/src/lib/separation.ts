import { randomUUID } from "crypto";
import { put } from "@vercel/blob";
import sql from "./db";
import { SEPARATION_SERVICE_URL } from "./paths";

type SeparateResponse = {
  status: "ok";
  duration: number;
  bpm: number | null;
  vocals_wav_base64: string;
  beat_wav_base64: string;
  vocals_peaks: number[];
  beat_peaks: number[];
};

// Kicks off separation for a track without blocking the caller. The
// separation service downloads the original from `originalUrl`, runs
// Demucs, and returns the resulting stems as base64 WAV data — Blob
// uploads happen here, via the official SDK, rather than in the Python
// service, to avoid depending on an unofficial upload protocol there.
// The fetch, uploads, and DB update all happen after this function
// returns, which is fine because this runs in a long-lived server
// process (Next.js dev/prod server).
export function startSeparation(trackId: string, originalUrl: string) {
  fetch(`${SEPARATION_SERVICE_URL}/separate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      track_id: trackId,
      input_url: originalUrl,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`separation service error ${res.status}: ${text}`);
      }
      return res.json() as Promise<SeparateResponse>;
    })
    .then(async (data) => {
      const [vocalsBlob, beatBlob] = await Promise.all([
        put(`stems/${trackId}/vocals.wav`, Buffer.from(data.vocals_wav_base64, "base64"), {
          access: "public",
          addRandomSuffix: true,
          contentType: "audio/wav",
        }),
        put(`stems/${trackId}/beat.wav`, Buffer.from(data.beat_wav_base64, "base64"), {
          access: "public",
          addRandomSuffix: true,
          contentType: "audio/wav",
        }),
      ]);

      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO stems (id, track_id, kind, file_url, peaks_json)
          VALUES (${randomUUID()}, ${trackId}, 'vocals', ${vocalsBlob.url}, ${JSON.stringify(data.vocals_peaks)})
        `;
        await tx`
          INSERT INTO stems (id, track_id, kind, file_url, peaks_json)
          VALUES (${randomUUID()}, ${trackId}, 'beat', ${beatBlob.url}, ${JSON.stringify(data.beat_peaks)})
        `;
        await tx`
          UPDATE tracks SET status = 'ready', duration = ${data.duration}, bpm = ${data.bpm}
          WHERE id = ${trackId}
        `;
      });
    })
    .catch(async (err) => {
      console.error(`[separation] track ${trackId} failed:`, err);
      await sql`
        UPDATE tracks SET status = 'failed', error = ${String(err?.message ?? err)}
        WHERE id = ${trackId}
      `;
    });
}
