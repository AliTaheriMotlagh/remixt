import type { TransactionSql } from "postgres";
import sql from "./db";
import type { RadioItem } from "./radioPick";
import { keyOfFileUrl, storedKeys } from "./storage";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- what sql.begin hands its callback
type Tx = TransactionSql<{}>;

/**
 * The items whose every file is in storage: the radio never puts on air
 * (or offers for a request) a song that can't play — an old one not moved
 * to R2 yet, a stem deleted by hand. A song needs the stems it plays (see
 * playPayload), a remix every lane's. With storage that can't be listed
 * cheaply, or when listing fails, everything is taken to be there.
 */
export async function playable(items: RadioItem[], q: typeof sql | Tx = sql): Promise<RadioItem[]> {
  const listing = storedKeys();
  if (!listing || !items.length) return items;
  try {
    const keys = await listing;
    const trackIds = items.filter((i) => i.kind === "track").map((i) => i.id);
    const remixIds = items.filter((i) => i.kind === "remix").map((i) => i.id);
    const [songStems, laneStems] = await Promise.all([
      trackIds.length
        ? q<{ owner: string; kind: string; file_url: string }[]>`SELECT track_id AS owner, kind, file_url FROM stems WHERE track_id IN ${q(trackIds)}`
        : [],
      remixIds.length
        ? q<{ owner: string; kind: string; file_url: string }[]>`
            SELECT remix_lanes.remix_id AS owner, stems.kind, stems.file_url
            FROM remix_lanes JOIN stems ON stems.id = remix_lanes.stem_id WHERE remix_lanes.remix_id IN ${q(remixIds)}
          `
        : [],
    ]);
    const files = new Map<string, { kind: string; file_url: string }[]>();
    for (const [kind, rows] of [["track", songStems], ["remix", laneStems]] as const) {
      for (const r of rows) {
        const list = files.get(`${kind}:${r.owner}`) ?? [];
        list.push(r);
        files.set(`${kind}:${r.owner}`, list);
      }
    }
    const there = (f: { file_url: string }) => /^https?:\/\//.test(f.file_url) || keys.has(keyOfFileUrl(f.file_url));
    return items.filter((item) => {
      let list = files.get(`${item.kind}:${item.id}`) ?? [];
      if (item.kind === "track") {
        // The vocal with the whole beat; parts only when there's no whole beat (as playPayload plays it).
        const hasBeat = list.some((f) => f.kind === "beat");
        list = list.filter((f) => f.kind === "vocals" || (hasBeat ? f.kind === "beat" : true));
      }
      return list.length > 0 && list.every(there);
    });
  } catch {
    return items;
  }
}
