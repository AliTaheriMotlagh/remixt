import { randomUUID } from "crypto";
import type { TransactionSql } from "postgres";
import sql from "./db";
import { playable } from "./radioPlayable";
import { ensureSchema } from "./schema";
import { coverUrl } from "./cover";
import { isAdmin } from "./admin";
import type { User } from "./auth";
import {
  crossfadeFor,
  itemKey,
  NEXT_LEAD_SECONDS,
  nextStart,
  pickNext,
  slugOf,
  voteChoices,
  type PickSource,
  type RadioItem,
  type RadioKind,
  type RequestedItem,
} from "./radioPick";

// Radio stations: everyone tuned in hears the same song at the same moment,
// votes on what plays next, and sends requests; the station's owner (or an
// admin) runs its playlist, queue and settings from the console.
//
// Like the live rooms (lib/live.ts) there's no media server: the server
// keeps each station's schedule — which song, from when — and every
// listener's browser plays that song at (now − its start) with the
// Studio's engine. The schedule moves on lazily: whoever asks for the
// station's state after a song has ended moves it on (under an advisory
// lock, so two asking at once don't both do it). It runs on the same
// Postgres as the rest of the app, on any host.
//
// What to play next is decided in radioPick.ts (pure, tested).

export type { RadioItem, RadioKind } from "./radioPick";

export type RequestMode = "open" | "review" | "off";

export type RadioSettings = {
  /** Listeners vote on the next song from a few choices. */
  voting: boolean;
  /** How many choices the vote has. */
  choices: number;
  /** Requests go straight in, wait for the DJ to accept them, or are off. */
  requests: RequestMode;
  /** How many requests one listener can have waiting at once. */
  perListener: number;
  /** When the playlist runs dry (or is empty), play anything public from the library. */
  autoFill: boolean;
  /** What the station plays: songs, remixes or both. */
  songs: boolean;
  remixes: boolean;
};

export const DEFAULT_SETTINGS: RadioSettings = { voting: true, choices: 3, requests: "open", perListener: 3, autoFill: true, songs: true, remixes: true };

export const HOUSE_SLUG = "remixt-radio";
export const NAME_MAX = 60;
export const TAGLINE_MAX = 140;
export const MESSAGE_MAX = 140;
/** A listener whose tab hasn't reported in for this long has tuned out. */
const LISTENING_SECONDS = 40;
/** Songs shorter than this aren't radio material (clips, takes, tests). */
const MIN_SECONDS = 90;

export type RadioStation = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  owner_id: string | null;
  owner_name: string | null;
  settings: RadioSettings;
  round_id: number | null;
  choices: RadioItem[];
  created_at: Date;
};

export type QueueRow = RadioItem & {
  rowId: number;
  source: PickSource;
  status: "next" | "playing" | "played" | "skipped";
  startsAt: number | null;
  endsAt: number | null;
  requestedBy: string | null;
  listenersPeak: number;
  votes: number;
};

let schema: Promise<void> | null = null;

/** Creates the radio's tables on first use, so a database that missed the migration still works. */
export function ensureRadioSchema(): Promise<void> {
  schema ??= (async () => {
    await ensureSchema();
    await sql`
      CREATE TABLE IF NOT EXISTS radio_stations (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        tagline TEXT NOT NULL DEFAULT '',
        owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        settings_json TEXT NOT NULL DEFAULT '{}',
        round_id BIGINT,
        choices_json TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS radio_queue (
        id BIGSERIAL PRIMARY KEY,
        station_id TEXT NOT NULL REFERENCES radio_stations(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        item_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '',
        cover TEXT,
        duration DOUBLE PRECISION NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        requested_by TEXT,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        listeners_peak INTEGER NOT NULL DEFAULT 0,
        votes INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_radio_queue_station ON radio_queue(station_id, status, id DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_radio_queue_played ON radio_queue(station_id, starts_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS radio_playlist (
        id BIGSERIAL PRIMARY KEY,
        station_id TEXT NOT NULL REFERENCES radio_stations(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        item_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '',
        cover TEXT,
        duration DOUBLE PRECISION NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(station_id, kind, item_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS radio_requests (
        id BIGSERIAL PRIMARY KEY,
        station_id TEXT NOT NULL REFERENCES radio_stations(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        item_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '',
        cover TEXT,
        duration DOUBLE PRECISION NOT NULL,
        listener_id TEXT NOT NULL,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        name TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at TIMESTAMPTZ
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_radio_requests_station ON radio_requests(station_id, status, created_at)`;
    await sql`
      CREATE TABLE IF NOT EXISTS radio_votes (
        station_id TEXT NOT NULL REFERENCES radio_stations(id) ON DELETE CASCADE,
        round_id BIGINT NOT NULL,
        listener_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        item_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (station_id, round_id, listener_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS radio_listeners (
        station_id TEXT NOT NULL REFERENCES radio_stations(id) ON DELETE CASCADE,
        listener_id TEXT NOT NULL,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (station_id, listener_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_radio_listeners_seen ON radio_listeners(station_id, last_seen DESC)`;
    // Tempo, for crossfading on the beat (added after the first version).
    for (const table of ["radio_queue", "radio_playlist", "radio_requests"]) await sql`ALTER TABLE ${sql(table)} ADD COLUMN IF NOT EXISTS bpm DOUBLE PRECISION`;
  })().catch((error) => {
    schema = null;
    throw error;
  });
  return schema;
}

// ------------------------------------------------------------------ rows

type StationRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  owner_id: string | null;
  owner_name: string | null;
  settings_json: string;
  round_id: string | number | null;
  choices_json: string;
  created_at: Date;
};

function parse<T>(text: string | null | undefined, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function settingsOf(raw: Partial<RadioSettings> | null | undefined): RadioSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  return {
    voting: !!s.voting,
    choices: Math.max(2, Math.min(5, Math.round(Number(s.choices) || DEFAULT_SETTINGS.choices))),
    requests: s.requests === "review" || s.requests === "off" ? s.requests : "open",
    perListener: Math.max(1, Math.min(10, Math.round(Number(s.perListener) || DEFAULT_SETTINGS.perListener))),
    autoFill: !!s.autoFill,
    songs: s.songs !== false,
    remixes: s.remixes !== false,
  };
}

function stationOf(row: StationRow): RadioStation {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    owner_id: row.owner_id,
    owner_name: row.owner_name,
    settings: settingsOf(parse<Partial<RadioSettings>>(row.settings_json, {})),
    round_id: row.round_id === null ? null : Number(row.round_id),
    choices: parse<RadioItem[]>(row.choices_json, []),
    created_at: row.created_at,
  };
}

type ItemRow = { kind: string; item_id: string; title: string; artist: string; cover: string | null; duration: number; bpm?: number | null };

const itemOf = (r: ItemRow): RadioItem => ({
  kind: r.kind as RadioKind,
  id: r.item_id,
  title: r.title,
  artist: r.artist,
  cover: r.cover,
  duration: Number(r.duration),
  bpm: r.bpm ? Number(r.bpm) : null,
});

type QRow = ItemRow & {
  id: string | number;
  source: string;
  status: string;
  starts_at: Date | null;
  ends_at: Date | null;
  requested_by: string | null;
  listeners_peak: number;
  votes: number;
};

const queueOf = (r: QRow): QueueRow => ({
  ...itemOf(r),
  rowId: Number(r.id),
  source: r.source as PickSource,
  status: r.status as QueueRow["status"],
  startsAt: r.starts_at ? r.starts_at.getTime() : null,
  endsAt: r.ends_at ? r.ends_at.getTime() : null,
  requestedBy: r.requested_by,
  listenersPeak: r.listeners_peak,
  votes: r.votes,
});

// --------------------------------------------------------------- catalogue

/** A remix's length from its lanes: where its last clip (or its whole stem) ends. */
export function remixLength(lanes: { offset_seconds: number | null; tempo_ratio: number; track_duration: number | null; settings_json: string | null }[]) {
  let end = 0;
  for (const lane of lanes) {
    const tempo = lane.tempo_ratio > 0 ? lane.tempo_ratio : 1;
    const offset = lane.offset_seconds ?? 0;
    const clips = parse<{ clips?: { from: number; to: number; at: number; stretch?: number }[] | null }>(lane.settings_json, {}).clips;
    if (clips?.length) {
      for (const c of clips) end = Math.max(end, offset + (c.at + (c.to - c.from) / (c.stretch && c.stretch > 0 ? c.stretch : 1)) / tempo);
    } else end = Math.max(end, offset + (lane.track_duration ?? 0) / tempo);
  }
  return end;
}

/** Public library songs (split, with a vocal), newest first. */
async function songItems({ ids, search, limit = 200 }: { ids?: string[]; search?: string; limit?: number } = {}): Promise<RadioItem[]> {
  const like = search ? `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const rows = await sql<{ id: string; title: string; artist: string; duration: number; stem_id: string; bpm: number | null }[]>`
    SELECT tracks.id, tracks.title, users.artist_name AS artist, tracks.duration, tracks.bpm, stems.id AS stem_id
    FROM tracks
    JOIN users ON users.id = tracks.owner_id
    JOIN stems ON stems.track_id = tracks.id AND stems.kind = 'vocals'
    WHERE tracks.status = 'ready' AND tracks.visibility = 'public' AND tracks.duration >= ${MIN_SECONDS}
      ${ids ? sql`AND tracks.id IN ${sql(ids.length ? ids : [""])}` : sql``}
      ${like ? sql`AND (tracks.title ILIKE ${like} OR users.artist_name ILIKE ${like})` : sql``}
    ORDER BY tracks.created_at DESC
    LIMIT ${limit}
  `;
  return playable(rows.map((r) => ({ kind: "track", id: r.id, title: r.title, artist: r.artist, duration: Number(r.duration), cover: `/api/stems/${r.stem_id}/cover`, bpm: r.bpm ? Number(r.bpm) : null })));
}

/** Published remixes, newest first, with their lengths. */
async function remixItems({ ids, search, limit = 200 }: { ids?: string[]; search?: string; limit?: number } = {}): Promise<RadioItem[]> {
  const like = search ? `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const rows = await sql<{ id: string; title: string; artist: string; cover_key: string | null; project_json: string | null }[]>`
    SELECT remixes.id, remixes.title, users.artist_name AS artist, remixes.cover_key, remixes.project_json
    FROM remixes JOIN users ON users.id = remixes.owner_id
    WHERE remixes.published
      ${ids ? sql`AND remixes.id IN ${sql(ids.length ? ids : [""])}` : sql``}
      ${like ? sql`AND (remixes.title ILIKE ${like} OR users.artist_name ILIKE ${like})` : sql``}
    ORDER BY remixes.created_at DESC
    LIMIT ${limit}
  `;
  if (!rows.length) return [];
  type LaneRow = { remix_id: string; offset_seconds: number | null; tempo_ratio: number; track_duration: number | null; settings_json: string | null; muted: boolean };
  const lanes = await sql<LaneRow[]>`
    SELECT remix_lanes.remix_id, remix_lanes.offset_seconds, remix_lanes.tempo_ratio, remix_lanes.settings_json, remix_lanes.muted, tracks.duration AS track_duration
    FROM remix_lanes JOIN stems ON stems.id = remix_lanes.stem_id JOIN tracks ON tracks.id = stems.track_id
    WHERE remix_lanes.remix_id IN ${sql(rows.map((r) => r.id))}
  `;
  const byRemix = new Map<string, LaneRow[]>();
  for (const l of lanes) {
    if (l.muted) continue;
    const list = byRemix.get(l.remix_id) ?? [];
    list.push(l);
    byRemix.set(l.remix_id, list);
  }
  return playable(
    rows
      .map((r) => {
        const bpm = Number(parse<{ projectBpm?: number }>(r.project_json, {}).projectBpm);
        return { kind: "remix" as const, id: r.id, title: r.title, artist: r.artist, cover: coverUrl(r.id, r.cover_key), duration: remixLength(byRemix.get(r.id) ?? []), bpm: bpm > 0 ? bpm : null };
      })
      .filter((r) => r.duration >= MIN_SECONDS)
  );
}

/** Songs and remixes matching `search`, for requests and the console's playlist. */
export async function searchCatalogue(search: string, settings: RadioSettings = DEFAULT_SETTINGS, limit = 30): Promise<RadioItem[]> {
  const text = search.trim().slice(0, 80);
  const [songs, remixes] = await Promise.all([
    settings.songs ? songItems({ search: text || undefined, limit }) : [],
    settings.remixes ? remixItems({ search: text || undefined, limit }) : [],
  ]);
  return interleave(remixes, songs).slice(0, limit);
}

/** Two lists taken in turn, so neither kind buries the other. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < a.length || i < b.length; i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

/** One playable item, checked: a public song or a published remix. */
export async function findItem(kind: RadioKind, id: string): Promise<RadioItem | null> {
  const found = kind === "track" ? await songItems({ ids: [id], limit: 1 }) : await remixItems({ ids: [id], limit: 1 });
  return found[0] ?? null;
}

/**
 * What a listener's browser needs to play an item: lane rows shaped like a
 * remix's (see /api/remixes/[id]) and its project settings. A song plays
 * its vocal and beat (or its parts) as they are.
 */
export async function playPayload(kind: RadioKind, id: string) {
  if (kind === "remix") {
    const remix = (await sql`SELECT id, title, published, project_json FROM remixes WHERE id = ${id} AND published`)[0];
    if (!remix) return null;
    const lanes = await sql`
      SELECT remix_lanes.*, stems.kind, stems.peaks_json,
             tracks.title AS track_title, tracks.duration AS track_duration,
             tracks.bpm AS track_bpm, users.artist_name AS stem_artist_name
      FROM remix_lanes
      JOIN stems ON stems.id = remix_lanes.stem_id
      JOIN tracks ON tracks.id = stems.track_id
      JOIN users ON users.id = tracks.owner_id
      WHERE remix_lanes.remix_id = ${id}
      ORDER BY remix_lanes.lane_order ASC
    `;
    return { remix, lanes };
  }
  const stems = await sql<{ stem_id: string; kind: string; peaks_json: string; track_title: string; track_duration: number; track_bpm: number | null; stem_artist_name: string }[]>`
    SELECT stems.id AS stem_id, stems.kind, stems.peaks_json, tracks.title AS track_title, tracks.duration AS track_duration,
           tracks.bpm AS track_bpm, users.artist_name AS stem_artist_name
    FROM stems JOIN tracks ON tracks.id = stems.track_id JOIN users ON users.id = tracks.owner_id
    WHERE tracks.id = ${id} AND tracks.status = 'ready' AND tracks.visibility = 'public'
  `;
  if (!stems.length) return null;
  // The vocal with the whole beat; parts (drums, bass, melody) only when there's no whole beat.
  const hasBeat = stems.some((s) => s.kind === "beat");
  const used = stems.filter((s) => s.kind === "vocals" || (hasBeat ? s.kind === "beat" : s.kind !== "vocals"));
  return {
    remix: { id: `track-${id}`, title: stems[0].track_title, published: true, project_json: "{}" },
    lanes: used.map((s) => ({
      ...s,
      volume: 1,
      muted: false,
      offset_seconds: 0,
      pitch_semitones: 0,
      tempo_ratio: 1,
      settings_json: "{}",
    })),
  };
}

// ---------------------------------------------------------------- stations

export async function getStation(slug: string): Promise<RadioStation | null> {
  await ensureRadioSchema();
  if (slug === HOUSE_SLUG) await ensureHouseStation();
  const rows = await sql<StationRow[]>`
    SELECT radio_stations.*, users.artist_name AS owner_name
    FROM radio_stations LEFT JOIN users ON users.id = radio_stations.owner_id
    WHERE radio_stations.slug = ${slug}
  `;
  return rows[0] ? stationOf(rows[0]) : null;
}

/** The station everyone starts on: everything public on Remixt, run by the admins. */
export async function ensureHouseStation() {
  await ensureRadioSchema();
  await sql`
    INSERT INTO radio_stations (id, slug, name, tagline, owner_id, settings_json)
    VALUES (${randomUUID()}, ${HOUSE_SLUG}, 'Remixt Radio', 'Every song and remix on Remixt — you pick what plays next.', NULL, ${JSON.stringify(DEFAULT_SETTINGS)})
    ON CONFLICT (slug) DO NOTHING
  `;
}

/** The owner, or an admin (the house station has no owner: admins run it). */
export function canManage(user: Pick<User, "id" | "email"> | null | undefined, station: Pick<RadioStation, "owner_id">) {
  return !!user && (isAdmin(user) || (!!station.owner_id && station.owner_id === user.id));
}

export async function createStation(owner: User, name: string, tagline: string) {
  await ensureRadioSchema();
  const clean = name.trim().slice(0, NAME_MAX);
  if (!clean) throw new Error("Give the station a name");
  const mine = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM radio_stations WHERE owner_id = ${owner.id}`;
  if (mine[0].n >= 5 && !isAdmin(owner)) throw new Error("You can run up to 5 stations");
  const base = slugOf(clean);
  for (let i = 0; i < 20; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const rows = await sql<{ slug: string }[]>`
      INSERT INTO radio_stations (id, slug, name, tagline, owner_id, settings_json)
      VALUES (${randomUUID()}, ${slug}, ${clean}, ${tagline.trim().slice(0, TAGLINE_MAX)}, ${owner.id}, ${JSON.stringify(DEFAULT_SETTINGS)})
      ON CONFLICT (slug) DO NOTHING
      RETURNING slug
    `;
    if (rows[0]) return rows[0].slug;
  }
  throw new Error("Couldn't find a free address for that name — try another");
}

export type StationCard = {
  slug: string;
  name: string;
  tagline: string;
  owner: string | null;
  listeners: number;
  now: RadioItem | null;
  mine: boolean;
};

/** Every station, the busiest first, with what's on. */
export async function listStations(userId: string | null): Promise<StationCard[]> {
  await ensureHouseStation();
  const rows = await sql<(StationRow & { listeners: number; now_kind: string | null; now_id: string | null; now_title: string | null; now_artist: string | null; now_cover: string | null; now_duration: number | null })[]>`
    SELECT s.*, u.artist_name AS owner_name,
      (SELECT count(*)::int FROM radio_listeners l WHERE l.station_id = s.id AND l.last_seen > now() - make_interval(secs => ${LISTENING_SECONDS})) AS listeners,
      q.kind AS now_kind, q.item_id AS now_id, q.title AS now_title, q.artist AS now_artist, q.cover AS now_cover, q.duration AS now_duration
    FROM radio_stations s
    LEFT JOIN users u ON u.id = s.owner_id
    LEFT JOIN LATERAL (
      SELECT * FROM radio_queue WHERE station_id = s.id AND status = 'playing' AND starts_at <= now() AND ends_at > now() ORDER BY starts_at DESC LIMIT 1
    ) q ON true
    ORDER BY (s.slug = ${HOUSE_SLUG}) DESC, listeners DESC, s.created_at DESC
    LIMIT 100
  `;
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    owner: r.owner_name,
    listeners: r.listeners,
    now: r.now_id ? { kind: r.now_kind as RadioKind, id: r.now_id, title: r.now_title ?? "", artist: r.now_artist ?? "", cover: r.now_cover, duration: Number(r.now_duration) } : null,
    mine: !!userId && r.owner_id === userId,
  }));
}

export async function updateStation(station: RadioStation, patch: { name?: string; tagline?: string; settings?: Partial<RadioSettings> }) {
  const settings = patch.settings ? settingsOf({ ...station.settings, ...patch.settings }) : station.settings;
  await sql`
    UPDATE radio_stations SET
      name = ${patch.name?.trim().slice(0, NAME_MAX) || station.name},
      tagline = ${patch.tagline !== undefined ? patch.tagline.trim().slice(0, TAGLINE_MAX) : station.tagline},
      settings_json = ${JSON.stringify(settings)}
    WHERE id = ${station.id}
  `;
}

export async function deleteStation(station: RadioStation) {
  if (station.slug === HOUSE_SLUG) throw new Error("Remixt Radio can't be deleted");
  await sql`DELETE FROM radio_stations WHERE id = ${station.id}`;
}

// ------------------------------------------------------------- the clock

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- what sql.begin hands its callback
type Tx = TransactionSql<{}>;

/** Everything public the station may fill with — read before the tick's transaction, so it never waits on the pool while holding the lock. */
async function libraryFor(station: RadioStation): Promise<RadioItem[]> {
  if (!station.settings.autoFill) return [];
  const [remixes, songs] = await Promise.all([station.settings.remixes ? remixItems({ limit: 150 }) : [], station.settings.songs ? songItems({ limit: 150 }) : []]);
  return interleave(remixes, songs);
}

/** What the pick needs, read inside the tick's transaction (its own connection only). */
async function pickInput(tx: Tx, station: RadioStation, current: string | null, library: RadioItem[]) {
  const [dj, requests, playlist, recentRows, votes] = await Promise.all([
    tx<QRow[]>`SELECT * FROM radio_queue WHERE station_id = ${station.id} AND status = 'next' ORDER BY sort, id`,
    tx<(ItemRow & { count: number; first_at: Date })[]>`
      SELECT kind, item_id, max(title) AS title, max(artist) AS artist, max(cover) AS cover, max(duration) AS duration, max(bpm) AS bpm,
             count(DISTINCT listener_id)::int AS count, min(created_at) AS first_at
      FROM radio_requests WHERE station_id = ${station.id} AND status = 'accepted'
      GROUP BY kind, item_id
    `,
    tx<ItemRow[]>`SELECT kind, item_id, title, artist, cover, duration, bpm FROM radio_playlist WHERE station_id = ${station.id} ORDER BY sort, id`,
    tx<{ kind: string; item_id: string }[]>`
      SELECT kind, item_id FROM radio_queue WHERE station_id = ${station.id} AND status IN ('played', 'skipped', 'playing') ORDER BY id DESC LIMIT 40
    `,
    station.round_id !== null
      ? tx<{ kind: string; item_id: string; n: number }[]>`
          SELECT kind, item_id, count(*)::int AS n FROM radio_votes WHERE station_id = ${station.id} AND round_id = ${station.round_id} GROUP BY kind, item_id
        `
      : Promise.resolve([] as { kind: string; item_id: string; n: number }[]),
  ]);
  const allowed = (i: RadioItem) => (i.kind === "track" ? station.settings.songs : station.settings.remixes);
  const count = new Map(votes.map((v) => [`${v.kind}:${v.item_id}`, v.n]));
  // Saved before their files went missing: only what can play now.
  const canPlay = new Set((await playable([...requests.map(itemOf), ...playlist.map(itemOf)], tx)).map(itemKey));
  return {
    djQueue: dj.map(itemOf),
    djRows: dj,
    voting: station.settings.voting,
    votes: station.choices.map((item) => ({ item, votes: count.get(itemKey(item)) ?? 0 })),
    requests: requests
      .map((r): RequestedItem => ({ ...itemOf(r), count: r.count, firstAt: r.first_at.getTime() }))
      .filter((i) => allowed(i) && canPlay.has(itemKey(i))),
    playlist: playlist.map(itemOf).filter((i) => allowed(i) && canPlay.has(itemKey(i))),
    library: library.filter(allowed),
    recent: recentRows.map((r) => `${r.kind}:${r.item_id}`),
    current,
  };
}

/** The song scheduled last (the one on air, or the next one already announced). */
async function latestRow(q: typeof sql | Tx, stationId: string) {
  return (await q<QRow[]>`SELECT * FROM radio_queue WHERE station_id = ${stationId} AND status = 'playing' ORDER BY starts_at DESC NULLS LAST, id DESC LIMIT 1`)[0];
}

/**
 * Moves the station on. Songs that have ended are marked played; and when
 * the last song scheduled is within NEXT_LEAD_SECONDS of its end, the next
 * one is chosen and scheduled to start a crossfade before it ends (on the
 * outgoing song's bar lines when the tempos agree — see crossfadeFor), so
 * every listener has time to get it ready and all of them blend at the
 * same moment. After a silence (nobody listening), the next song starts now.
 * Returns whether anything changed.
 */
export async function tick(station: RadioStation): Promise<boolean> {
  const now = Date.now();
  const last = await latestRow(sql, station.id);
  const ended = await sql`UPDATE radio_queue SET status = 'played' WHERE station_id = ${station.id} AND status = 'playing' AND ends_at <= now() RETURNING id`;
  if (last?.ends_at && last.ends_at.getTime() - NEXT_LEAD_SECONDS * 1000 > now) return ended.length > 0;
  const library = await libraryFor(station);
  return sql.begin(async (tx) => {
    // Someone else is moving it on right now: their answer will do.
    const [{ locked }] = await tx<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`radio:${station.id}`})) AS locked`;
    if (!locked) return ended.length > 0;
    // Read again under the lock: someone else may have just moved it on.
    const fresh = (await tx<(StationRow & { owner_name: null })[]>`SELECT *, NULL AS owner_name FROM radio_stations WHERE id = ${station.id}`)[0];
    if (!fresh) return false;
    const st = stationOf(fresh);
    const cur = await latestRow(tx, st.id);
    if (cur?.ends_at && cur.ends_at.getTime() - NEXT_LEAD_SECONDS * 1000 > Date.now()) return ended.length > 0;
    const input = await pickInput(tx, st, cur ? `${cur.kind}:${cur.item_id}` : null, library);
    const pick = pickNext(input);
    if (!pick) {
      await tx`UPDATE radio_stations SET round_id = NULL, choices_json = '[]' WHERE id = ${st.id}`;
      return true;
    }
    // Still on air: the next one comes in a crossfade before its end. Ended a while ago: now.
    const endsOut = cur?.ends_at?.getTime() ?? 0;
    const xfade = cur && endsOut > Date.now() ? crossfadeFor(itemOf(cur), pick.item).seconds : 0;
    const startsAt = new Date(endsOut > Date.now() ? Math.max(Date.now(), endsOut - xfade * 1000) : nextStart(endsOut, Date.now()));
    const endsAt = new Date(startsAt.getTime() + pick.item.duration * 1000);
    const votesFor = input.votes.find((v) => itemKey(v.item) === itemKey(pick.item))?.votes ?? 0;
    const requester =
      pick.source === "request"
        ? ((await tx<{ name: string }[]>`
            SELECT name FROM radio_requests WHERE station_id = ${st.id} AND kind = ${pick.item.kind} AND item_id = ${pick.item.id} AND status = 'accepted' AND name <> '' ORDER BY created_at LIMIT 1
          `)[0]?.name ?? null)
        : null;
    let rowId: number;
    if (pick.source === "dj") {
      const row = input.djRows.find((r) => r.kind === pick.item.kind && r.item_id === pick.item.id)!;
      rowId = Number(row.id);
      await tx`UPDATE radio_queue SET status = 'playing', starts_at = ${startsAt}, ends_at = ${endsAt} WHERE id = ${row.id}`;
    } else {
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO radio_queue (station_id, kind, item_id, title, artist, cover, duration, bpm, source, status, requested_by, starts_at, ends_at, votes)
        VALUES (${st.id}, ${pick.item.kind}, ${pick.item.id}, ${pick.item.title}, ${pick.item.artist}, ${pick.item.cover}, ${pick.item.duration}, ${pick.item.bpm ?? null},
                ${pick.source}, 'playing', ${requester}, ${startsAt}, ${endsAt}, ${votesFor})
        RETURNING id
      `;
      rowId = Number(inserted[0].id);
    }
    // Its requests are answered.
    await tx`
      UPDATE radio_requests SET status = 'played', decided_at = now()
      WHERE station_id = ${st.id} AND kind = ${pick.item.kind} AND item_id = ${pick.item.id} AND status IN ('accepted', 'pending')
    `;
    // A new vote, for the song after this one: never this one.
    const choices = st.settings.voting
      ? voteChoices({ ...input, requests: input.requests.filter((r) => itemKey(r) !== itemKey(pick.item)), recent: [itemKey(pick.item), ...input.recent], current: itemKey(pick.item) }, st.settings.choices)
      : [];
    await tx`UPDATE radio_stations SET round_id = ${rowId}, choices_json = ${JSON.stringify(choices)} WHERE id = ${st.id}`;
    return true;
  });
}

// ---------------------------------------------------------------- listeners

/** "u:<user id>" for someone signed in, else "s:<their browser's id>": one vote and one request count per person. */
export function listenerKey(userId: string | null, sessionId: string) {
  return userId ? `u:${userId}` : `s:${sessionId}`;
}

export type RadioFeed = {
  station: Pick<RadioStation, "slug" | "name" | "tagline" | "owner_name" | "settings">;
  serverNow: number;
  now: QueueRow | null;
  /** The next song once it's chosen (NEXT_LEAD_SECONDS before this one ends): when it starts, the two crossfade. */
  upcoming: QueueRow | null;
  /** The song before this one while it's still fading out under it. */
  fading: QueueRow | null;
  /** The DJ's queue. */
  upNext: QueueRow[];
  vote: { round: number | null; choices: (RadioItem & { votes: number })[]; mine: string | null; total: number };
  requests: (RadioItem & { count: number; mine: boolean; status: "pending" | "accepted"; names: string[] })[];
  history: QueueRow[];
  listeners: number;
  canManage: boolean;
};

export async function readFeed(slug: string, { sessionId, user, heartbeat }: { sessionId: string; user: User | null; heartbeat: boolean }): Promise<RadioFeed | null> {
  let station = await getStation(slug);
  if (!station) return null;
  if (await tick(station)) station = (await getStation(slug))!;
  const me = listenerKey(user?.id ?? null, sessionId);
  if (heartbeat) {
    await sql`
      INSERT INTO radio_listeners (station_id, listener_id, user_id) VALUES (${station.id}, ${me}, ${user?.id ?? null})
      ON CONFLICT (station_id, listener_id) DO UPDATE SET last_seen = now(), user_id = COALESCE(EXCLUDED.user_id, radio_listeners.user_id)
    `;
  }
  const [nowRows, djRows, history, listeners, votes, mine, requests, upcomingRows] = await Promise.all([
    sql<QRow[]>`SELECT * FROM radio_queue WHERE station_id = ${station.id} AND status = 'playing' AND starts_at <= now() AND ends_at > now() ORDER BY starts_at DESC LIMIT 2`,
    sql<QRow[]>`SELECT * FROM radio_queue WHERE station_id = ${station.id} AND status = 'next' ORDER BY sort, id LIMIT 20`,
    sql<QRow[]>`SELECT * FROM radio_queue WHERE station_id = ${station.id} AND status IN ('played', 'skipped') ORDER BY id DESC LIMIT 12`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM radio_listeners WHERE station_id = ${station.id} AND last_seen > now() - make_interval(secs => ${LISTENING_SECONDS})`,
    station.round_id !== null
      ? sql<{ kind: string; item_id: string; n: number }[]>`SELECT kind, item_id, count(*)::int AS n FROM radio_votes WHERE station_id = ${station.id} AND round_id = ${station.round_id} GROUP BY kind, item_id`
      : Promise.resolve([] as { kind: string; item_id: string; n: number }[]),
    station.round_id !== null
      ? sql<{ kind: string; item_id: string }[]>`SELECT kind, item_id FROM radio_votes WHERE station_id = ${station.id} AND round_id = ${station.round_id} AND listener_id = ${me}`
      : Promise.resolve([] as { kind: string; item_id: string }[]),
    sql<(ItemRow & { count: number; mine: boolean; status: string; names: string[]; first_at: Date })[]>`
      SELECT kind, item_id, max(title) AS title, max(artist) AS artist, max(cover) AS cover, max(duration) AS duration, max(bpm) AS bpm,
             count(DISTINCT listener_id)::int AS count, bool_or(listener_id = ${me}) AS mine,
             CASE WHEN bool_or(status = 'accepted') THEN 'accepted' ELSE 'pending' END AS status,
             (array_agg(DISTINCT name) FILTER (WHERE name <> ''))[1:3] AS names, min(created_at) AS first_at
      FROM radio_requests WHERE station_id = ${station.id} AND status IN ('pending', 'accepted')
      GROUP BY kind, item_id
      ORDER BY count(DISTINCT listener_id) DESC, min(created_at)
      LIMIT 30
    `,
    sql<QRow[]>`SELECT * FROM radio_queue WHERE station_id = ${station.id} AND status = 'playing' AND starts_at > now() ORDER BY starts_at LIMIT 1`,
  ]);
  const now = nowRows[0] ? queueOf(nowRows[0]) : null;
  // Listeners at the song's busiest moment, for the reports.
  if (now && heartbeat && listeners[0].n > now.listenersPeak) {
    await sql`UPDATE radio_queue SET listeners_peak = GREATEST(listeners_peak, ${listeners[0].n}) WHERE id = ${now.rowId}`;
    now.listenersPeak = listeners[0].n;
  }
  const count = new Map(votes.map((v) => [`${v.kind}:${v.item_id}`, v.n]));
  const choices = station.choices.map((c) => ({ ...c, votes: count.get(itemKey(c)) ?? 0 }));
  return {
    station: { slug: station.slug, name: station.name, tagline: station.tagline, owner_name: station.owner_name, settings: station.settings },
    serverNow: Date.now(),
    now,
    upcoming: upcomingRows[0] ? queueOf(upcomingRows[0]) : null,
    fading: nowRows[1] ? queueOf(nowRows[1]) : null,
    upNext: djRows.map(queueOf),
    vote: {
      round: station.round_id,
      choices,
      mine: mine[0] ? `${mine[0].kind}:${mine[0].item_id}` : null,
      total: choices.reduce((n, c) => n + c.votes, 0),
    },
    requests: requests
      .filter((r) => r.status === "accepted" || r.mine || canManage(user, station))
      .map((r) => ({ ...itemOf(r), count: r.count, mine: r.mine, status: r.status as "pending" | "accepted", names: r.names ?? [] })),
    history: history.map(queueOf),
    listeners: listeners[0].n,
    canManage: canManage(user, station),
  };
}

/** A vote for one of this round's choices; voting again changes it. */
export async function castVote(station: RadioStation, me: string, kind: RadioKind, id: string, round: number) {
  if (!station.settings.voting) throw new Error("Voting is off on this station");
  if (station.round_id !== round) throw new Error("That vote has closed — a new song is on");
  if (!station.choices.some((c) => c.kind === kind && c.id === id)) throw new Error("That song isn't one of the choices");
  await sql`
    INSERT INTO radio_votes (station_id, round_id, listener_id, kind, item_id) VALUES (${station.id}, ${round}, ${me}, ${kind}, ${id})
    ON CONFLICT (station_id, round_id, listener_id) DO UPDATE SET kind = EXCLUDED.kind, item_id = EXCLUDED.item_id, created_at = now()
  `;
}

/** A listener asks for a song. Returns whether it waits for the DJ. */
export async function makeRequest(
  station: RadioStation,
  { me, user, name, kind, id, message }: { me: string; user: User | null; name: string; kind: RadioKind; id: string; message: string }
): Promise<{ status: "accepted" | "pending" }> {
  if (station.settings.requests === "off") throw new Error("Requests are off on this station right now");
  if (kind === "track" ? !station.settings.songs : !station.settings.remixes) throw new Error(`This station doesn't play ${kind === "track" ? "songs" : "remixes"}`);
  const item = await findItem(kind, id);
  if (!item) throw new Error("That song can't be played on the radio");
  const open = await sql<{ kind: string; item_id: string }[]>`
    SELECT kind, item_id FROM radio_requests WHERE station_id = ${station.id} AND listener_id = ${me} AND status IN ('pending', 'accepted')
  `;
  if (open.some((r) => r.kind === kind && r.item_id === id)) throw new Error("You've already asked for this one — it's in the list");
  if (open.length >= station.settings.perListener) throw new Error(`You can have ${station.settings.perListener} requests waiting at once — wait for one to play`);
  const playingNow = await sql`SELECT 1 FROM radio_queue WHERE station_id = ${station.id} AND status = 'playing' AND kind = ${kind} AND item_id = ${id} AND ends_at > now()`;
  // (A song already announced as next counts too: it's about to play.)
  if (playingNow.length) throw new Error("That's playing right now");
  // Asked for by others already and accepted: it's in.
  const accepted = await sql`SELECT 1 FROM radio_requests WHERE station_id = ${station.id} AND kind = ${kind} AND item_id = ${id} AND status = 'accepted' LIMIT 1`;
  const status = station.settings.requests === "open" || accepted.length ? "accepted" : "pending";
  await sql`
    INSERT INTO radio_requests (station_id, kind, item_id, title, artist, cover, duration, bpm, listener_id, user_id, name, message, status)
    VALUES (${station.id}, ${kind}, ${id}, ${item.title}, ${item.artist}, ${item.cover}, ${item.duration}, ${item.bpm ?? null}, ${me}, ${user?.id ?? null},
            ${(user?.artist_name ?? name).trim().slice(0, 40)}, ${message.trim().slice(0, MESSAGE_MAX)}, ${status})
  `;
  return { status };
}

/** A listener takes their request back. */
export async function withdrawRequest(station: RadioStation, me: string, kind: RadioKind, id: string) {
  await sql`DELETE FROM radio_requests WHERE station_id = ${station.id} AND listener_id = ${me} AND kind = ${kind} AND item_id = ${id} AND status IN ('pending', 'accepted')`;
}

// ------------------------------------------------------------------ console

export type ConsoleAction =
  | { action: "skip" }
  | { action: "queue"; kind: RadioKind; id: string; first?: boolean }
  | { action: "unqueue"; rowId: number }
  | { action: "move"; rowId: number; by: -1 | 1 }
  | { action: "playlist-add"; kind: RadioKind; id: string }
  | { action: "playlist-remove"; kind: RadioKind; id: string }
  | { action: "playlist-move"; kind: RadioKind; id: string; by: -1 | 1 }
  | { action: "playlist-clear" }
  | { action: "accept" | "reject"; kind: RadioKind; id: string }
  | { action: "clear-requests" }
  | { action: "settings"; name?: string; tagline?: string; settings?: Partial<RadioSettings> };

export async function consoleAction(station: RadioStation, a: ConsoleAction) {
  switch (a.action) {
    case "skip": {
      // Ends what's on now. A next song already chosen starts now; else one is chosen now.
      await sql`UPDATE radio_queue SET status = 'skipped', ends_at = now() WHERE station_id = ${station.id} AND status = 'playing' AND starts_at <= now()`;
      await sql`
        UPDATE radio_queue SET starts_at = now(), ends_at = now() + make_interval(secs => duration)
        WHERE station_id = ${station.id} AND status = 'playing' AND starts_at > now()
      `;
      await tick({ ...station });
      return;
    }
    case "queue": {
      const item = await findItem(a.kind, a.id);
      if (!item) throw new Error("That song can't be played on the radio");
      const sort = a.first
        ? ((await sql<{ s: number | null }[]>`SELECT min(sort) AS s FROM radio_queue WHERE station_id = ${station.id} AND status = 'next'`)[0].s ?? 0) - 1
        : ((await sql<{ s: number | null }[]>`SELECT max(sort) AS s FROM radio_queue WHERE station_id = ${station.id} AND status = 'next'`)[0].s ?? 0) + 1;
      await sql`
        INSERT INTO radio_queue (station_id, kind, item_id, title, artist, cover, duration, bpm, source, status, sort)
        VALUES (${station.id}, ${item.kind}, ${item.id}, ${item.title}, ${item.artist}, ${item.cover}, ${item.duration}, ${item.bpm ?? null}, 'dj', 'next', ${sort})
      `;
      return;
    }
    case "unqueue":
      await sql`DELETE FROM radio_queue WHERE station_id = ${station.id} AND id = ${a.rowId} AND status = 'next'`;
      return;
    case "move": {
      const rows = await sql<{ id: string }[]>`SELECT id FROM radio_queue WHERE station_id = ${station.id} AND status = 'next' ORDER BY sort, id`;
      const ids = rows.map((r) => Number(r.id));
      const i = ids.indexOf(a.rowId);
      const j = i + a.by;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await sql.begin(async (tx) => {
        for (const [sort, id] of ids.entries()) await tx`UPDATE radio_queue SET sort = ${sort} WHERE id = ${id}`;
      });
      return;
    }
    case "playlist-add": {
      const item = await findItem(a.kind, a.id);
      if (!item) throw new Error("That song can't be played on the radio");
      const count = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM radio_playlist WHERE station_id = ${station.id}`;
      if (count[0].n >= 500) throw new Error("A playlist holds up to 500 songs");
      await sql`
        INSERT INTO radio_playlist (station_id, kind, item_id, title, artist, cover, duration, bpm, sort)
        VALUES (${station.id}, ${item.kind}, ${item.id}, ${item.title}, ${item.artist}, ${item.cover}, ${item.duration}, ${item.bpm ?? null},
                (SELECT COALESCE(max(sort), 0) + 1 FROM radio_playlist WHERE station_id = ${station.id}))
        ON CONFLICT (station_id, kind, item_id) DO NOTHING
      `;
      return;
    }
    case "playlist-remove":
      await sql`DELETE FROM radio_playlist WHERE station_id = ${station.id} AND kind = ${a.kind} AND item_id = ${a.id}`;
      return;
    case "playlist-move": {
      const rows = await sql<{ id: string; kind: string; item_id: string }[]>`SELECT id, kind, item_id FROM radio_playlist WHERE station_id = ${station.id} ORDER BY sort, id`;
      const i = rows.findIndex((r) => r.kind === a.kind && r.item_id === a.id);
      const j = i + a.by;
      if (i < 0 || j < 0 || j >= rows.length) return;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      await sql.begin(async (tx) => {
        for (const [sort, r] of rows.entries()) await tx`UPDATE radio_playlist SET sort = ${sort} WHERE id = ${r.id}`;
      });
      return;
    }
    case "playlist-clear":
      await sql`DELETE FROM radio_playlist WHERE station_id = ${station.id}`;
      return;
    case "accept":
    case "reject":
      await sql`
        UPDATE radio_requests SET status = ${a.action === "accept" ? "accepted" : "rejected"}, decided_at = now()
        WHERE station_id = ${station.id} AND kind = ${a.kind} AND item_id = ${a.id} AND status IN ('pending', 'accepted')
      `;
      return;
    case "clear-requests":
      await sql`UPDATE radio_requests SET status = 'rejected', decided_at = now() WHERE station_id = ${station.id} AND status IN ('pending', 'accepted')`;
      return;
    case "settings":
      await updateStation(station, a);
      // Voting switched on: open a vote for the song that's on.
      if (a.settings?.voting && !station.settings.voting) {
        const fresh = (await getStation(station.slug))!;
        const cur = await latestRow(sql, station.id);
        if (cur) {
          const library = await libraryFor(fresh);
          const input = await sql.begin((tx) => pickInput(tx, fresh, `${cur.kind}:${cur.item_id}`, library));
          const choices = voteChoices(input, fresh.settings.choices);
          await sql`UPDATE radio_stations SET round_id = ${cur.id}, choices_json = ${JSON.stringify(choices)} WHERE id = ${station.id}`;
        }
      }
      return;
  }
}

export async function playlistOf(station: RadioStation): Promise<RadioItem[]> {
  const rows = await sql<ItemRow[]>`SELECT kind, item_id, title, artist, cover, duration, bpm FROM radio_playlist WHERE station_id = ${station.id} ORDER BY sort, id`;
  return rows.map(itemOf);
}

// ------------------------------------------------------------------ reports

export type RadioReport = {
  days: number;
  plays: number;
  skips: number;
  hours: number;
  listenersNow: number;
  listenersPeak: number;
  uniqueListeners: number;
  votes: number;
  /** Of the songs with a vote, the average number of votes cast. */
  votesPerRound: number;
  requests: { total: number; played: number; rejected: number; waiting: number };
  bySource: Record<string, number>;
  perDay: { day: string; plays: number; peak: number; listeners: number }[];
  topPlayed: (RadioItem & { plays: number; peak: number })[];
  topRequested: (RadioItem & { requests: number })[];
  topVoted: (RadioItem & { votes: number })[];
};

export async function stationReport(station: RadioStation, days = 14): Promise<RadioReport> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [totals, sources, perDay, perDayListeners, topPlayed, topRequested, topVoted, reqs, listeners, votes] = await Promise.all([
    sql<{ plays: number; skips: number; seconds: number; peak: number }[]>`
      SELECT count(*) FILTER (WHERE status = 'played')::int AS plays, count(*) FILTER (WHERE status = 'skipped')::int AS skips,
             COALESCE(sum(EXTRACT(EPOCH FROM (LEAST(ends_at, now()) - starts_at))), 0)::float AS seconds, COALESCE(max(listeners_peak), 0)::int AS peak
      FROM radio_queue WHERE station_id = ${station.id} AND starts_at >= ${since} AND status IN ('played', 'skipped', 'playing')
    `,
    sql<{ source: string; n: number }[]>`
      SELECT source, count(*)::int AS n FROM radio_queue WHERE station_id = ${station.id} AND starts_at >= ${since} AND status IN ('played', 'skipped', 'playing') GROUP BY source
    `,
    sql<{ day: string; plays: number; peak: number }[]>`
      SELECT to_char(date_trunc('day', starts_at), 'YYYY-MM-DD') AS day, count(*)::int AS plays, max(listeners_peak)::int AS peak
      FROM radio_queue WHERE station_id = ${station.id} AND starts_at >= ${since} AND status IN ('played', 'skipped', 'playing')
      GROUP BY 1 ORDER BY 1
    `,
    sql<{ day: string; n: number }[]>`
      SELECT to_char(date_trunc('day', last_seen), 'YYYY-MM-DD') AS day, count(*)::int AS n
      FROM radio_listeners WHERE station_id = ${station.id} AND last_seen >= ${since} GROUP BY 1
    `,
    sql<(ItemRow & { plays: number; peak: number })[]>`
      SELECT kind, item_id, max(title) AS title, max(artist) AS artist, max(cover) AS cover, max(duration) AS duration, max(bpm) AS bpm,
             count(*)::int AS plays, max(listeners_peak)::int AS peak
      FROM radio_queue WHERE station_id = ${station.id} AND starts_at >= ${since} AND status IN ('played', 'skipped', 'playing')
      GROUP BY kind, item_id ORDER BY count(*) DESC, max(listeners_peak) DESC LIMIT 10
    `,
    sql<(ItemRow & { requests: number })[]>`
      SELECT kind, item_id, max(title) AS title, max(artist) AS artist, max(cover) AS cover, max(duration) AS duration, max(bpm) AS bpm, count(DISTINCT listener_id)::int AS requests
      FROM radio_requests WHERE station_id = ${station.id} AND created_at >= ${since}
      GROUP BY kind, item_id ORDER BY count(DISTINCT listener_id) DESC LIMIT 10
    `,
    sql<(ItemRow & { votes: number })[]>`
      SELECT v.kind, v.item_id, max(q.title) AS title, max(q.artist) AS artist, max(q.cover) AS cover, max(q.duration) AS duration, count(*)::int AS votes
      FROM radio_votes v LEFT JOIN radio_queue q ON q.station_id = v.station_id AND q.kind = v.kind AND q.item_id = v.item_id
      WHERE v.station_id = ${station.id} AND v.created_at >= ${since}
      GROUP BY v.kind, v.item_id ORDER BY count(*) DESC LIMIT 10
    `,
    sql<{ status: string; n: number }[]>`
      SELECT status, count(*)::int AS n FROM radio_requests WHERE station_id = ${station.id} AND created_at >= ${since} GROUP BY status
    `,
    sql<{ now: number; unique: number }[]>`
      SELECT count(*) FILTER (WHERE last_seen > now() - make_interval(secs => ${LISTENING_SECONDS}))::int AS now,
             count(*) FILTER (WHERE last_seen >= ${since})::int AS unique
      FROM radio_listeners WHERE station_id = ${station.id}
    `,
    sql<{ total: number; rounds: number }[]>`
      SELECT count(*)::int AS total, count(DISTINCT round_id)::int AS rounds FROM radio_votes WHERE station_id = ${station.id} AND created_at >= ${since}
    `,
  ]);
  const req = Object.fromEntries(reqs.map((r) => [r.status, r.n])) as Record<string, number>;
  const listenersByDay = new Map(perDayListeners.map((d) => [d.day, d.n]));
  return {
    days,
    plays: totals[0].plays,
    skips: totals[0].skips,
    hours: Math.round((totals[0].seconds / 3600) * 10) / 10,
    listenersNow: listeners[0].now,
    listenersPeak: totals[0].peak,
    uniqueListeners: listeners[0].unique,
    votes: votes[0].total,
    votesPerRound: votes[0].rounds ? Math.round((votes[0].total / votes[0].rounds) * 10) / 10 : 0,
    requests: {
      total: Object.values(req).reduce((a, b) => a + b, 0),
      played: req.played ?? 0,
      rejected: req.rejected ?? 0,
      waiting: (req.pending ?? 0) + (req.accepted ?? 0),
    },
    bySource: Object.fromEntries(sources.map((s) => [s.source, s.n])),
    perDay: perDay.map((d) => ({ ...d, listeners: listenersByDay.get(d.day) ?? 0 })),
    topPlayed: topPlayed.map((r) => ({ ...itemOf(r), plays: r.plays, peak: r.peak })),
    topRequested: topRequested.map((r) => ({ ...itemOf(r), requests: r.requests })),
    topVoted: topVoted.map((r) => ({ ...itemOf(r), votes: r.votes })),
  };
}

/** Every song played in the period, for a CSV download (royalty reports, logs). */
export async function playLog(station: RadioStation, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await sql<QRow[]>`
    SELECT * FROM radio_queue WHERE station_id = ${station.id} AND starts_at >= ${since} AND status IN ('played', 'skipped', 'playing') ORDER BY starts_at
  `;
  return rows.map(queueOf);
}
