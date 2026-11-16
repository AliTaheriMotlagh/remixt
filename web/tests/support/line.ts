// A phone's line, played in made-up time — for testing how files leave the
// browser (lib/client/directUpload.ts) against the things real lines do:
// crawl, stall, drop a request half-way, lose an answer, die for a minute,
// or sit behind a filter that swallows everything sent to one host.
//
// Nothing here waits for real: time is node:test's mock clock, moved on by
// `drive`, so an upload that would take an hour on a 20 KB/s line is over in
// a blink, and the same every run. It plugs in under the real code as a
// `Wire` (`sender(line.wire)`), so the stall watch, the retries, the relay
// and its resume are all the ones a phone runs.
//
//   const line = phoneLine({ rate: 20_000, server });
//   const { error, ms } = await drive(upload(target, file, onProgress, sender(line.wire)));

import { mock } from "node:test";
import { NetworkError, type SendRequest, type SendResponse, type Wire } from "../../src/lib/client/directUpload.ts";

/** A request that got all the way to the server. */
export type Arrived = { method: string; url: URL; headers: Record<string, string>; body: Buffer };
export type Answer = { status: number; body?: unknown };

/** What becomes of one request. */
export type Fate = {
  /** The line drops it once this much of it has got through. */
  dieAfterBytes?: number;
  /** Nothing of it ever gets through, and nothing says so (a filtered host). */
  swallowed?: boolean;
  /** It arrives and is handled, but the answer never comes back. */
  answerLost?: boolean;
  /** It stops moving once this much has got through, without failing (a throttle). */
  stuckAfterBytes?: number;
};

export type Line = {
  wire: Wire;
  /** Bytes a second, shared by the requests in flight. 0: nothing moves (but nothing fails). */
  rate: number;
  /** What the device takes off the browser's hands at once — "sent", as far as the browser can tell. */
  buffer: number;
  /** How long an answer takes to come back, ms. */
  latency: number;
  /** Decides each request's fate as it starts (`n` counts from 0). */
  fate: (request: SendRequest, n: number) => Fate | undefined;
  /** Every request in flight is dropped now (the screen went off, the phone changed towers). */
  dropAll: () => void;
  /** Requests started, and bytes of request bodies that reached the server (wasted ones included). */
  started: number;
  carried: number;
};

const TICK_MS = 100;

type Flight = {
  bytes: Buffer;
  delivered: number;
  handed: number;
  fate: Fate;
  sent: (loaded: number) => void;
  fail: (message: string) => void;
  arrive: () => void;
  arrived: boolean;
};

/** A line to `server`. Needs `clock()` on; change `rate`, `buffer`, `fate` as the test goes. */
export function phoneLine(options: {
  server: (request: Arrived) => Answer | Promise<Answer>;
  rate?: number;
  buffer?: number;
  latency?: number;
}): Line {
  const flights = new Set<Flight>();
  const line: Line = {
    rate: options.rate ?? 1_000_000,
    buffer: options.buffer ?? 256 * 1024,
    latency: options.latency ?? 80,
    fate: () => undefined,
    started: 0,
    carried: 0,
    dropAll: () => {
      for (const flight of [...flights]) flight.fail("Upload failed — check your connection");
    },
    wire: (request, events) => {
      const n = line.started++;
      const fate = line.fate(request, n) ?? {};
      let abort = () => {};
      const done = new Promise<SendResponse>((resolve, reject) => {
        let over = false;
        const flight: Flight = {
          bytes: Buffer.alloc(0),
          delivered: 0,
          handed: 0,
          fate,
          arrived: false,
          sent: events.sent,
          fail: (message) => {
            if (over) return;
            over = true;
            flights.delete(flight);
            reject(new NetworkError(message));
          },
          arrive: () => {
            flight.arrived = true;
            flights.delete(flight);
            const url = new URL(request.url, "http://remixt.test");
            void Promise.resolve(options.server({ method: request.method, url, headers: request.headers, body: flight.bytes })).then(
              (answer) => {
                if (fate.answerLost) return; // …and the stall watch gives up on it in the end.
                setTimeout(() => {
                  if (over) return;
                  over = true;
                  events.answering();
                  resolve({ status: answer.status, text: JSON.stringify(answer.body ?? {}) });
                }, line.latency);
              }
            );
          },
        };
        abort = () => flight.fail("The upload stalled — check your connection");
        const body = request.body;
        void (async () => {
          flight.bytes = !body ? Buffer.alloc(0) : typeof body === "string" ? Buffer.from(body) : Buffer.from(await body.arrayBuffer());
          if (over) return;
          flights.add(flight);
        })();
      });
      return { done, abort: () => abort() };
    },
  };
  setInterval(() => {
    const moving = [...flights].filter((f) => !f.fate.swallowed);
    const share = moving.length ? (line.rate * TICK_MS) / 1000 / moving.length : 0;
    for (const flight of moving) {
      const size = flight.bytes.length;
      const limit = Math.min(size, flight.fate.stuckAfterBytes ?? size);
      const step = Math.max(0, Math.min(share, limit - flight.delivered));
      flight.delivered += step;
      line.carried += step;
      // The browser only knows what the device has taken: a buffer's worth ahead of what has left.
      const handed = Math.min(size, Math.floor(flight.delivered) + line.buffer);
      if (handed > flight.handed) {
        flight.handed = handed;
        flight.sent(handed);
      }
      // (A request shorter than that gets through.)
      if (flight.fate.dieAfterBytes !== undefined && flight.fate.dieAfterBytes < size && flight.delivered >= flight.fate.dieAfterBytes) {
        flight.fail("Upload failed — check your connection");
      } else if (flight.delivered >= size && !flight.arrived) flight.arrive();
    }
  }, TICK_MS);
  return line;
}

/** Made-up time on (timers and the date); `mock.timers.reset()` puts the real clock back. */
export function clock() {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1_700_000_000_000 });
}

/**
 * Lets time pass until `work` is over, or `limitMs` of it has gone by (an
 * upload going round for ever): how it ended, and how long it took.
 */
export async function drive<T>(work: Promise<T>, limitMs = 6 * 3600_000): Promise<{ value?: T; error?: unknown; ms: number; over: boolean }> {
  const result: { value?: T; error?: unknown; over: boolean } = { over: false };
  work.then(
    (value) => Object.assign(result, { value, over: true }),
    (error) => Object.assign(result, { error, over: true })
  );
  const startedAt = Date.now();
  while (!result.over && Date.now() - startedAt < limitMs) {
    mock.timers.tick(TICK_MS);
    // Everything that tick set off (promise chains, file reads) gets to run.
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { ...result, ms: Date.now() - startedAt };
}

/** What this app's relay does with slices (lib/uploadRelay.ts), kept in memory. */
export function fakeRelay() {
  const slices = new Map<string, Buffer>();
  const files = new Map<string, Buffer>();
  const key = (session: string, at: number) => `${session}/${at}`;
  return {
    /** Joined files, by the relay's path. */
    files,
    slices,
    /** PUTs of slices that arrived: [start, length] of each, in order of arrival. */
    taken: [] as [number, number][],
    handle(request: Arrived): Answer {
      const query = request.url.searchParams;
      const session = query.get("relay")!;
      if (request.method === "PUT") {
        const at = Number(query.get("at"));
        slices.set(key(session, at), request.body);
        this.taken.push([at, request.body.length]);
        return { status: 200, body: { ok: true } };
      }
      const size = Number(query.get("size"));
      const parts = (JSON.parse(request.body.toString()) as { parts: [number, number][] }).parts;
      const found = parts.map(([at, bytes]) => {
        const slice = slices.get(key(session, at));
        return slice && slice.length >= bytes ? slice.subarray(0, bytes) : null;
      });
      const missing = parts.filter((_, i) => !found[i]).map(([at]) => at);
      if (missing.length) {
        if (files.get(request.url.pathname)?.length === size) return { status: 200, body: { ok: true } };
        return { status: 409, body: { error: "Part of the upload is missing — try again", missing } };
      }
      files.set(request.url.pathname, Buffer.concat(found as Buffer[]));
      for (const [at] of parts) slices.delete(key(session, at));
      return { status: 200, body: { ok: true } };
    },
  };
}
