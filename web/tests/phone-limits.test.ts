// What a phone doesn't do, or does another way, so the page isn't lost:
//
// - saveFile.ts: the installed iPhone app never falls back to a download
//   link (it opens the file over the app, with no way back to the Studio);
// - neuralBeats.ts: the beat model is off on phones (too much memory);
// - audioEngine.dropSpare: an export lets go of what's only kept in case.
//
//   node --import ./tests/support/register.mjs --test tests/phone-limits.test.ts

import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import { audioEngine } from "../src/lib/client/audioEngine.ts";
import { beatModelEnabled, beatModelSupported } from "../src/lib/client/neuralBeats.ts";
import { linksLeaveApp, saveFile } from "../src/lib/client/saveFile.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

const g = globalThis as Record<string, unknown>;
const saved = { navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"), window: g.window, document: g.document };

/** Pretends to be a device: its user agent, whether it's the installed app, and what its share sheet does. */
function device(userAgent: string, { installed = false, share }: { installed?: boolean; share?: (data: ShareData) => Promise<void> } = {}) {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      userAgent,
      maxTouchPoints: userAgent === MAC ? 0 : 5,
      standalone: installed,
      ...(share ? { share, canShare: () => true } : {}),
    },
    configurable: true,
  });
  g.window = { matchMedia: (query: string) => ({ matches: installed && query.includes("standalone") }) };
  const clicked: string[] = [];
  g.document = {
    createElement: () => ({ style: {}, click() {
      clicked.push((this as unknown as { download: string }).download);
    }, remove() {} }),
    body: { appendChild() {} },
  };
  return { clicked };
}

afterEach(() => {
  if (saved.navigator) Object.defineProperty(globalThis, "navigator", saved.navigator);
  g.window = saved.window;
  g.document = saved.document;
  mock.timers.reset();
});

const file = () => new File([new Uint8Array(16)], "Ali - Song.mp3", { type: "audio/mpeg" });

describe("saving a file", () => {
  test("the installed iPhone app: no download link when the share sheet can't open", async () => {
    const { clicked } = device(IPHONE, { installed: true });
    assert.equal(linksLeaveApp(), true);
    assert.equal(await saveFile(file()), "unavailable");
    assert.equal(await saveFile(file(), { share: false }), "unavailable");
    assert.deepEqual(clicked, [], "no link was followed");
  });

  test("the installed iPhone app: the share sheet failing doesn't fall back to a link either", async () => {
    const { clicked } = device(IPHONE, {
      installed: true,
      share: async () => {
        throw new DOMException("No activation", "NotAllowedError");
      },
    });
    assert.equal(await saveFile(file()), "unavailable");
    assert.deepEqual(clicked, []);
  });

  test("the installed iPhone app: the share sheet saves it", async () => {
    let shared: File[] = [];
    device(IPHONE, { installed: true, share: async (data) => void (shared = data.files ?? []) });
    assert.equal(await saveFile(file()), "shared");
    assert.equal(shared[0]?.name, "Ali - Song.mp3");
  });

  test("Safari on an iPhone (not installed) can still download", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const { clicked } = device(IPHONE);
    assert.equal(linksLeaveApp(), false);
    assert.equal(await saveFile(file(), { share: false }), "downloaded");
    assert.deepEqual(clicked, ["Ali - Song.mp3"]);
  });

  test("Android and computers download as before", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    for (const ua of [ANDROID, MAC]) {
      const { clicked } = device(ua, { installed: true });
      assert.equal(linksLeaveApp(), false);
      assert.equal(await saveFile(file(), { share: false }), "downloaded");
      assert.deepEqual(clicked, ["Ali - Song.mp3"]);
    }
  });
});

describe("the beat model", () => {
  test("isn't run on phones, whatever was chosen before", () => {
    for (const ua of [IPHONE, ANDROID]) {
      device(ua);
      assert.equal(beatModelSupported(), false, ua);
      assert.equal(beatModelEnabled(), false, ua);
    }
  });

  test("is on by default on a computer", () => {
    device(MAC);
    assert.equal(beatModelSupported(), true);
  });
});

describe("before an export", () => {
  const buffer = (seconds: number) => ({ length: seconds * 48000, numberOfChannels: 2, sampleRate: 48000, duration: seconds }) as AudioBuffer;

  test("everything kept just in case is let go, what lanes play stays", () => {
    const engine = audioEngine as unknown as { lanes: Map<string, unknown>; decoded: Map<string, { raw: AudioBuffer; renders: Map<string, AudioBuffer>; clipBuffers: Map<string, AudioBuffer> }> };
    const playing = buffer(10);
    const oldRender = buffer(10);
    // A stem a lane plays, with a render kept from an idea tried before…
    engine.decoded.set("stem-a", { raw: playing, renders: new Map([["0.9000|0|hq", oldRender]]), clipBuffers: new Map() });
    engine.lanes.set("lane-a", { stemId: "stem-a", processedBuffer: playing, renders: new Map(), clipBuffers: new Map() });
    // …and a stem no lane plays any more (a beat swapped for its parts).
    engine.decoded.set("stem-gone", { raw: buffer(10), renders: new Map(), clipBuffers: new Map() });
    try {
      audioEngine.dropSpare();
      assert.equal(engine.decoded.has("stem-gone"), false, "the stem no lane plays went");
      assert.equal(engine.decoded.get("stem-a")?.renders.size, 0, "the old render went");
      assert.equal(engine.decoded.get("stem-a")?.raw, playing, "the stem a lane plays stayed");
    } finally {
      engine.lanes.delete("lane-a");
      engine.decoded.clear();
    }
  });
});
