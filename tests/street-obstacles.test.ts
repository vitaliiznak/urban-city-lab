import test from "node:test";
import assert from "node:assert/strict";
import { StreetObstacleLayer, moveWithCollisions } from "../src/collision";

test("solid props stop a sprint, unload cleanly and allow escape after streaming", () => {
  const layer = new StreetObstacleLayer();
  const car = { label: "Parked car", p: [[2, -1], [6, -1], [6, 1], [2, 1]] };
  layer.update([car], { x: 0, z: 0 });
  const hit = moveWithCollisions({ x: 0, z: 0 }, 8, 0, (p) => layer.at(p));
  assert.equal(hit.obstacle, "Parked car");
  assert.ok(hit.position.x < 1.6);
  layer.update([], hit.position);
  assert.equal(layer.at({ x: 3, z: 0 }), null);
  layer.update([car], { x: 3, z: 0 });
  assert.equal(layer.size, 0);
  layer.update([car], { x: 0, z: 0 });
  assert.equal(layer.size, 1);
  layer.update([car], { x: 3, z: 0 });
  assert.equal(layer.at({ x: 3, z: 0 }), "Parked car");
  layer.clear();
  assert.equal(layer.at({ x: 3, z: 0 }), null);
});
