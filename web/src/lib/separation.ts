import { randomUUID } from "crypto";
import sql from "./db";
import { SEPARATION_SERVICE_URL } from "./paths";
import { PUBLIC_BASE_URL, storageUrl, writeStorageFile } from "./storage";

type SeparateResponse = {
  status: "ok";
  duration: number;
  bpm: number | null;
  vocals_mp3_base64: string;
  beat_mp3_base64: string;
  vocals_peaks: number[];
  beat_peaks: number[];
};

// Demucs on CPU is the slow part — a 3-4 minute song takes roughly 1-3
// minutes. This ceiling exists so a wedged run eventually fails the track
// instead of leaving it 'processing' forever.
const SEPARATION_TIMEOUT_MS = 20 * 60 * 1000;

// Kicks off separation for a track without blocking the caller. The
// separation service downloads the original over HTTP from /api/files,
// runs Demucs, and returns both stems as base64 mp3 — which this function
// writes to local storage alongside the original.
// The fetch, writes, and DB update all happen after this function returns,
// which is fine because it runs in a long-lived server process.
export function startSeparation(trackId: string, originalKey: string) {
  const inputUrl = `${PUBLIC_BASE_URL}${storageUrl(originalKey)}`;

  fetch(`${SEPARATION_SERVICE_URL}/separate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      track_id: trackId,
      input_url: inputUrl,
    }),
    signal: AbortSignal.timeout(SEPARATION_TIMEOUT_MS),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`separation service error ${res.status}: ${text}`);
      }
      return res.json() as Promise<SeparateResponse>;
    })
    .then(async (data) => {
      const [vocalsKey, beatKey] = await Promise.all([
        writeStorageFile(
          `stems/${trackId}/vocals.mp3`,
          Buffer.from(data.vocals_mp3_base64, "base64")
        ),
        writeStorageFile(
          `stems/${trackId}/beat.mp3`,
          Buffer.from(data.beat_mp3_base64, "base64")
        ),
      ]);

      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO stems (id, track_id, kind, file_url, peaks_json)
          VALUES (${randomUUID()}, ${trackId}, 'vocals', ${vocalsKey}, ${JSON.stringify(data.vocals_peaks)})
          ON CONFLICT (track_id, kind) DO UPDATE
            SET file_url = EXCLUDED.file_url, peaks_json = EXCLUDED.peaks_json
        `;
        await tx`
          INSERT INTO stems (id, track_id, kind, file_url, peaks_json)
          VALUES (${randomUUID()}, ${trackId}, 'beat', ${beatKey}, ${JSON.stringify(data.beat_peaks)})
          ON CONFLICT (track_id, kind) DO UPDATE
            SET file_url = EXCLUDED.file_url, peaks_json = EXCLUDED.peaks_json
        `;
        await tx`
          UPDATE tracks SET status = 'ready', error = NULL, duration = ${data.duration}, bpm = ${data.bpm}
          WHERE id = ${trackId}
        `;
      });
      console.log(`[separation] track ${trackId} ready`);
    })
    .catch(async (err) => {
      console.error(`[separation] track ${trackId} failed:`, err);
      await sql`
        UPDATE tracks SET status = 'failed', error = ${String(err?.message ?? err)}
        WHERE id = ${trackId}
      `;
    });
}
