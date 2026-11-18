// The radio's kept mixes (radioCache.ts): the key follows what's heard —
// the same song gets the same key every visit, any change to a lane or to
// how long the station plays it gets a new one.
//
//   node --import ./tests/support/register.mjs --test tests/radio-cache.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { radioMixKey } from "../src/lib/client/radioCache.ts";

const payload = () => ({
  remix: { id: "r1", title: "Night", published: true, project_json: '{"projectBpm":93}' },
  lanes: [
    { stem_id: "s1", kind: "vocals", volume: 1, muted: false, offset_seconds: 0, pitch_semitones: 0, tempo_ratio: 1, settings_json: "{}" },
    { stem_id: "s2", kind: "beat", volume: 0.8, muted: false, offset_seconds: 2, pitch_semitones: -1, tempo_ratio: 1.04, settings_json: '{"fx":{"reverb":0.2}}' },
  ],
});

test("the same song gets the same key every time", async () => {
  assert.equal(await radioMixKey("remix", payload(), 233.4), await radioMixKey("remix", payload(), 233.4));
  assert.match(await radioMixKey("remix", payload(), 233.4), /^[0-9a-f]{64}$/);
});

test("a change to what's heard gets a new key", async () => {
  const base = await radioMixKey("remix", payload(), 233.4);
  const louder = payload();
  louder.lanes[1].volume = 0.9;
  const effects = payload();
  effects.lanes[1].settings_json = '{"fx":{"reverb":0.3}}';
  const tempo = payload();
  tempo.remix.project_json = '{"projectBpm":95}';
  for (const changed of [louder, effects, tempo]) assert.notEqual(await radioMixKey("remix", changed, 233.4), base);
  assert.notEqual(await radioMixKey("remix", payload(), 200), base, "played for a different length");
  assert.notEqual(await radioMixKey("track", payload(), 233.4), base, "a song and a remix never share a mix");
});
