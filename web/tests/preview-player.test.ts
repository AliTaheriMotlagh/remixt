// The preview player (lib/client/previewPlayer.ts): the one <audio> behind
// every "play this stem" button — Library, Upload, the Studio's panels.
// Against a stand-in <audio> whose sources can be made to fail: a stem must
// play by whichever way works (a copy kept on the device, the store's CDN,
// through this app), say so when none does, and never be left "playing"
// with nothing coming out.
//
//   node --import ./tests/support/register.mjs --test tests/preview-player.test.ts

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { playable, PreviewPlayer, type PreviewTrack } from "../src/lib/client/previewPlayer.ts";

/** Which sources won't play ("blob:" for a kept copy, a URL's ending for the rest). */
let broken: string[] = [];
/** Whether play() is refused for want of a tap. */
let needsTap = false;

class FakeAudio {
  static last: FakeAudio;
  src = "";
  currentTime = 0;
  duration = 180;
  preload = "";
  volume = 1;
  paused = true;
  /** Every source it was given, in order. */
  tried: string[] = [];
  private listeners = new Map<string, (() => void)[]>();
  constructor() {
    FakeAudio.last = this;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  fire(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  removeAttribute() {
    this.src = "";
  }
  load() {}
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.fire("pause");
  }
  async play() {
    if (this.src) this.tried.push(this.src);
    await Promise.resolve();
    if (needsTap) throw new DOMException("no tap", "NotAllowedError");
    if (!this.src || broken.some((b) => (b === "blob:" ? this.src.startsWith(b) : this.src.endsWith(b)))) {
      this.fire("error");
      throw new DOMException("won't play", "NotSupportedError");
    }
    this.paused = false;
    this.fire("play");
    this.fire("playing");
  }
}
(globalThis as { Audio?: unknown }).Audio = FakeAudio;

const vocals: PreviewTrack = { stemId: "s1", title: "Song", artist: "Someone", kind: "vocals" };
const beat: PreviewTrack = { stemId: "s2", title: "Song", artist: "Someone", kind: "beat" };

function player(kept: Record<string, Blob> = {}) {
  const keptLater: string[] = [];
  const it = new PreviewPlayer({ kept: async (id) => kept[id] ?? null, keepLater: (id) => keptLater.push(id) });
  return { it, keptLater, audio: () => FakeAudio.last };
}

beforeEach(() => {
  broken = [];
  needsTap = false;
});

describe("playing a stem", () => {
  test("streams it from the store, and says when the sound has started", async () => {
    const { it, audio } = player();
    const playing = it.play(vocals);
    assert.equal(it.getState().loading, true, "between the tap and the sound");
    await playing;
    assert.deepEqual(audio().tried, ["/api/audio/stem/s1"]);
    assert.deepEqual(
      { playing: it.getState().playing, loading: it.getState().loading, id: it.getState().current?.stemId },
      { playing: true, loading: false, id: "s1" }
    );
  });

  test("a copy kept on the device is played from there — given an audio type, which Safari needs", async () => {
    const bare = new Blob([new Uint8Array(100)]);
    assert.equal(bare.type, "");
    assert.equal(playable(bare).type, "audio/mpeg");
    assert.equal(playable(bare).size, 100);
    const typed = new Blob([new Uint8Array(3)], { type: "audio/mp4" });
    assert.equal(playable(typed), typed, "one that says what it is is left alone");

    const { it, audio } = player({ s1: bare });
    await it.play(vocals);
    assert.equal(audio().tried.length, 1);
    assert.ok(audio().tried[0].startsWith("blob:"));
    assert.equal(it.getState().playing, true);
  });

  test("a kept copy that won't play is no reason to play nothing: it's streamed instead", async () => {
    broken = ["blob:"];
    const { it, audio } = player({ s1: new Blob([new Uint8Array(100)]) });
    await it.play(vocals);
    assert.equal(audio().tried.length, 2);
    assert.equal(audio().tried[1], "/api/audio/stem/s1");
    assert.equal(it.getState().playing, true);
    assert.equal(it.getState().error, null);
  });

  test("a store that can't be reached: through this app", async () => {
    broken = ["/api/audio/stem/s1"];
    const { it, audio } = player();
    await it.play(vocals);
    assert.deepEqual(audio().tried, ["/api/audio/stem/s1", "/api/audio/stem/s1?via=app"]);
    assert.equal(it.getState().playing, true);
  });

  test("no way works: it says so, and nothing is left claiming to play", async () => {
    broken = ["blob:", "/api/audio/stem/s1", "?via=app"];
    const { it, audio } = player({ s1: new Blob([new Uint8Array(100)]) });
    await it.play(vocals);
    assert.equal(audio().tried.length, 3);
    const state = it.getState();
    assert.deepEqual({ current: state.current, playing: state.playing, loading: state.loading }, { current: null, playing: false, loading: false });
    assert.match(state.error ?? "", /Couldn't play/);
    // The next one clears it and plays.
    broken = [];
    await it.play(beat);
    assert.equal(it.getState().error, null);
    assert.equal(it.getState().current?.stemId, "s2");
  });

  test("the browser wanting a tap isn't taken for a broken source: no other is tried", async () => {
    needsTap = true;
    const { it, audio } = player();
    await it.play(vocals);
    assert.equal(audio().tried.length, 1);
    assert.equal(it.getState().current, null);
  });

  test("the stream giving out half-way carries on from the same place by the next way", async () => {
    const { it, audio } = player();
    await it.play(vocals);
    audio().currentTime = 42;
    broken = ["/api/audio/stem/s1"];
    audio().fire("error");
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(audio().tried.at(-1), "/api/audio/stem/s1?via=app");
    assert.equal(audio().currentTime, 42);
    assert.equal(it.getState().playing, true);
  });
});

describe("tapping", () => {
  test("a double tap doesn't cancel the play it just started; a later tap while it loads does", async () => {
    const { it, audio } = player();
    const first = it.toggle(vocals);
    await it.toggle(vocals); // the same tap, twice
    await first;
    assert.equal(it.getState().playing, true, "still plays");

    it.stop();
    const slow = it.toggle(beat);
    // Long enough ago to be a change of mind.
    const realNow = Date.now;
    Date.now = () => realNow() + 2000;
    try {
      await it.toggle(beat);
    } finally {
      Date.now = realNow;
    }
    await slow;
    assert.equal(it.getState().current, null, "cancelled");
    assert.equal(audio().paused, true);
  });

  test("tapping what's playing pauses it, tapping again resumes; another stem takes over", async () => {
    const { it, audio } = player();
    await it.toggle(vocals);
    await it.toggle(vocals);
    assert.equal(it.getState().playing, false);
    assert.equal(it.getState().current?.stemId, "s1", "paused, not gone");
    await it.toggle(vocals);
    assert.equal(it.getState().playing, true);
    await it.toggle(beat);
    assert.equal(it.getState().current?.stemId, "s2");
    assert.equal(audio().tried.at(-1), "/api/audio/stem/s2");
  });

  test("a second stem tapped while the first is still being found: only the second plays", async () => {
    const { it, audio } = player();
    const first = it.play(vocals);
    const second = it.play(beat);
    await Promise.all([first, second]);
    assert.deepEqual(audio().tried, ["/api/audio/stem/s2"]);
    assert.equal(it.getState().current?.stemId, "s2");
  });
});

describe("keeping stems for later", () => {
  test("asked for once it plays — not for one already kept, nor one that never played", async () => {
    const { it, keptLater } = player({ s2: new Blob([new Uint8Array(10)]) });
    await it.play({ ...vocals, keep: true });
    await it.play({ ...beat, keep: true });
    assert.deepEqual(keptLater, ["s1"]);
    broken = ["/api/audio/stem/s3", "?via=app"];
    await it.play({ ...vocals, stemId: "s3", keep: true });
    assert.deepEqual(keptLater, ["s1"]);
  });

  test("the keeper waits for quiet: untilQuiet holds while a stem plays, and lets go when it stops", async () => {
    const { it } = player();
    await it.untilQuiet(); // nothing playing: at once
    await it.play(vocals);
    let quiet = false;
    void it.untilQuiet().then(() => (quiet = true));
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(quiet, false);
    it.stop();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(quiet, true);
  });
});

describe("playing on through a list", () => {
  const list: PreviewTrack[] = [vocals, beat, { stemId: "s3", title: "Other", artist: "Them", kind: "vocals" }];

  test("when a stem ends, the next in the list plays; after the last, it stops", async () => {
    const { it, audio } = player();
    await it.toggle(list[1], list);
    audio().fire("ended");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(it.getState().current?.stemId, "s3");
    audio().fire("ended");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(it.getState().current, null);
  });

  test("next and previous step through the list; previous part-way restarts the stem", async () => {
    const { it, audio } = player();
    await it.toggle(list[0], list);
    await it.next();
    assert.equal(it.getState().current?.stemId, "s2");
    audio().currentTime = 40;
    await it.previous();
    assert.equal(it.getState().current?.stemId, "s2", "restarted, not skipped back");
    assert.equal(audio().currentTime, 0);
    await it.previous();
    assert.equal(it.getState().current?.stemId, "s1");
  });

  test("a stem played on its own forgets the list", async () => {
    const { it, audio } = player();
    await it.toggle(list[0], list);
    await it.play({ stemId: "elsewhere", title: "X", artist: "Y", kind: "beat" });
    audio().fire("ended");
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(it.getState().current, null);
  });
});
