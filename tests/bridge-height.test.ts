import test from "node:test";
import assert from "node:assert/strict";
import { BridgeHeight } from "../src/bridge-height";

test("standing on a bridge reuses deck height and periodically picks up streamed geometry", () => {
  const cache = new BridgeHeight(); let calls = 0;
  for (let frame = 0; frame < 1200; frame++) {
    const height = cache.sample({ x: 0, z: 0 }, frame * 1000 / 60, () => { calls++; return frame < 300 ? 440 : 441; });
    assert.equal(height, frame < 300 ? 440 : 441);
  }
  assert.equal(calls, 4);
});

test("running across a sloped bridge keeps height error bounded with at most five probes a second", () => {
  const cache = new BridgeHeight(); let calls = 0;
  for (let frame = 0; frame < 300; frame++) {
    const x = frame / 60 * 8, exact = 440 + x * .1;
    const height = cache.sample({ x, z: 0 }, frame * 1000 / 60, () => { calls++; return exact; })!;
    assert.ok(Math.abs(height - exact) < .18);
  }
  assert.ok(calls <= 25 && calls >= 20, `probes: ${calls}`);
});

test("a destination change cannot inherit another bridge's deck and failed samples retry", () => {
  const cache = new BridgeHeight();
  assert.equal(cache.sample({ x: 0, z: 0 }, 0, () => 440), 440);
  assert.equal(cache.sample({ x: 100, z: 100 }, 10, () => 480), 480);
  cache.clear(); let calls = 0;
  assert.equal(cache.sample({ x: 0, z: 0 }, 20, () => { calls++; return NaN; }), undefined);
  assert.equal(cache.sample({ x: 0, z: 0 }, 900, () => { calls++; return 442; }), undefined);
  assert.equal(cache.sample({ x: 0, z: 0 }, 1020, () => { calls++; return 442; }), 442);
  assert.equal(calls, 2);
});
