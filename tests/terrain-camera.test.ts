import test from "node:test";
import assert from "node:assert/strict";
import { terrainCamera } from "../src/terrain-camera";

test("flat ground preserves the requested following view", () => {
  assert.deepEqual(terrainCamera(-.16, 6, () => true), { pitch: -.16, distance: 6 });
});
test("a rise between clear endpoints raises the camera above the entire line of sight", () => {
  const clear = (d: number, pitch: number) => 1.35 - Math.sin(pitch) * d > (d > 2 && d < 4 ? 2.4 : 0) + .3;
  const result = terrainCamera(-.16, 6, clear);
  assert.equal(clear(6, -.16), true);
  assert.equal(result.distance, 6);
  assert.ok(result.pitch < -.16);
  for (let d = .7; d <= 6; d += .35) assert.ok(clear(d, result.pitch));
});
test("an impassable terrain face shortens the view before the obstruction", () => {
  const result = terrainCamera(-.16, 6, (d) => d < 2);
  assert.ok(result.distance < 2 && result.distance >= .7);
});
