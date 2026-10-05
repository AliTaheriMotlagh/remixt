// Fills a test database's library with songs (the synthesized demo songs,
// written as real WAV stems), for trying the app in a browser:
//
//   DATABASE_URL=… STORAGE_DIR=… OWNER_ID=<user id> \
//     node --import ./tests/support/register.mjs tests/support/seed-library.ts
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { DEMO_SONG_DEFS, songMeta } from "../../src/lib/client/demoSongDefs.ts";
import { SAMPLE_RATE, renderDemoChannels, sumStereo, type Stereo } from "../../src/lib/client/demoSongsDsp.ts";

const { DATABASE_URL, STORAGE_DIR, OWNER_ID } = process.env;
if (!DATABASE_URL || !STORAGE_DIR || !OWNER_ID) throw new Error("Set DATABASE_URL, STORAGE_DIR and OWNER_ID");
const sql = postgres(DATABASE_URL, { onnotice: () => {} });

function wav({ l, r }: Stereo): Buffer {
  const n = l.length;
  const out = Buffer.alloc(44 + n * 4);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + n * 4, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SAMPLE_RATE, 24);
  out.writeUInt32LE(SAMPLE_RATE * 4, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l[i])) * 32767), 44 + i * 4);
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r[i])) * 32767), 46 + i * 4);
  }
  return out;
}

function peaks({ l }: Stereo, count = 400) {
  const step = Math.floor(l.length / count);
  return Array.from({ length: count }, (_, i) => {
    let max = 0;
    for (let j = i * step; j < (i + 1) * step; j++) max = Math.max(max, Math.abs(l[j]));
    return Math.round(max * 1000) / 1000;
  });
}

const count = Number(process.env.SONGS ?? 4);
for (const [i, def] of DEMO_SONG_DEFS.slice(0, count).entries()) {
  const meta = songMeta(def);
  const parts = renderDemoChannels(def);
  const stems: Record<string, Stereo> = {
    vocals: parts.vocal,
    beat: sumStereo([parts.drums, parts.bass, parts.chords]),
    drums: parts.drums,
    bass: parts.bass,
    other: parts.chords,
  };
  const trackId = randomUUID();
  const dir = path.join(STORAGE_DIR, "seed", trackId);
  fs.mkdirSync(dir, { recursive: true });
  const duration = parts.vocal.l.length / SAMPLE_RATE;
  await sql`
    INSERT INTO tracks (id, owner_id, title, original_filename, status, duration, bpm, original_url, featured_example, example_credit)
    VALUES (${trackId}, ${OWNER_ID}, ${meta.title}, ${`${meta.title}.wav`}, 'ready', ${duration}, ${meta.bpm}, '',
            ${i < 2}, ${i < 2 ? `by ${meta.artist} · test credit` : null})
  `;
  for (const [kind, audio] of Object.entries(stems)) {
    const key = `seed/${trackId}/${kind}.wav`;
    fs.writeFileSync(path.join(STORAGE_DIR, key), wav(audio));
    await sql`
      INSERT INTO stems (id, track_id, kind, file_url, peaks_json)
      VALUES (${randomUUID()}, ${trackId}, ${kind}, ${key}, ${JSON.stringify(peaks(audio))})
    `;
  }
  console.log(`seeded ${meta.title} (${meta.bpm} BPM)`);
}
await sql.end();
