import sql from "./db";
import { ensureSchema } from "./schema";
import { isAdmin } from "./admin";
import type { User } from "./auth";

// The words chosen for a song or remix, for everyone who hears it (the
// radio, its embed and broadcast view): set by the song's or remix's owner
// (or an admin) when the words found by themselves are wrong, missing, or
// a little early or late — or to say it has no words to show. A listener's
// own choice stays on their device (radioLyrics.ts); this one is shared.

export type ItemKind = "track" | "remix";

export type LyricsChoice = {
  /** LRC: timed lines, timed to the item's own start (the remix as heard). Empty with `noWords`. */
  lrc: string;
  /** Seconds added to every line (a nudge for the whole sheet). */
  shift: number;
  /** "Show no words for this one." */
  noWords: boolean;
  /** Whose words they are, to show ("Deli"). */
  song: string;
  setAt: string;
};

/** Sheets longer than this aren't lyrics. */
export const LRC_MAX = 60_000;

let schema: Promise<void> | null = null;

export function ensureLyricsSchema(): Promise<void> {
  schema ??= (async () => {
    await ensureSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS item_lyrics (
        kind TEXT NOT NULL,
        item_id TEXT NOT NULL,
        lrc TEXT NOT NULL DEFAULT '',
        shift REAL NOT NULL DEFAULT 0,
        no_words BOOLEAN NOT NULL DEFAULT false,
        song TEXT NOT NULL DEFAULT '',
        set_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (kind, item_id)
      )
    `;
  })().catch((e) => {
    schema = null;
    throw e;
  });
  return schema;
}

export async function lyricsChoice(kind: ItemKind, id: string): Promise<LyricsChoice | null> {
  await ensureLyricsSchema();
  const row = (
    await sql<{ lrc: string; shift: number; no_words: boolean; song: string; set_at: Date }[]>`
      SELECT lrc, shift, no_words, song, set_at FROM item_lyrics WHERE kind = ${kind} AND item_id = ${id}
    `
  )[0];
  return row ? { lrc: row.lrc, shift: Number(row.shift) || 0, noWords: row.no_words, song: row.song, setAt: row.set_at.toISOString() } : null;
}

/** Who owns the item: only they (or an admin) set its words for everyone. */
async function ownerOf(kind: ItemKind, id: string): Promise<string | null | undefined> {
  const rows =
    kind === "track"
      ? await sql<{ owner_id: string | null }[]>`SELECT owner_id FROM tracks WHERE id = ${id}`
      : await sql<{ owner_id: string | null }[]>`SELECT owner_id FROM remixes WHERE id = ${id}`;
  return rows[0] ? rows[0].owner_id : undefined;
}

export async function canSetLyrics(user: User | null, kind: ItemKind, id: string): Promise<boolean> {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const owner = await ownerOf(kind, id).catch(() => undefined);
  return !!owner && owner === user.id;
}

export async function setLyricsChoice(user: User, kind: ItemKind, id: string, choice: Omit<LyricsChoice, "setAt">) {
  await ensureLyricsSchema();
  const lrc = choice.noWords ? "" : choice.lrc.slice(0, LRC_MAX);
  const shift = Math.max(-30, Math.min(30, Number(choice.shift) || 0));
  const song = choice.song.trim().slice(0, 200);
  await sql`
    INSERT INTO item_lyrics (kind, item_id, lrc, shift, no_words, song, set_by)
    VALUES (${kind}, ${id}, ${lrc}, ${shift}, ${choice.noWords}, ${song}, ${user.id})
    ON CONFLICT (kind, item_id) DO UPDATE SET lrc = EXCLUDED.lrc, shift = EXCLUDED.shift, no_words = EXCLUDED.no_words,
      song = EXCLUDED.song, set_by = EXCLUDED.set_by, set_at = now()
  `;
}

export async function clearLyricsChoice(kind: ItemKind, id: string) {
  await ensureLyricsSchema();
  await sql`DELETE FROM item_lyrics WHERE kind = ${kind} AND item_id = ${id}`;
}
