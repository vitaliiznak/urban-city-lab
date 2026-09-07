import test from "node:test";
import assert from "node:assert/strict";
import { destinations, nearestPath } from "../src/world";
import {
  moveWithCollisions,
  hitsPolygon,
  obstacleAt,
  PLAYER_RADIUS,
  WALK_SPEED,
  RUN_SPEED,
  toGeo,
  toLocal,
} from "../src/collision";

test("geographic conversion preserves positions and Explorer movement constants", () => {
  for (const d of destinations) {
    const p = toGeo(toLocal(d.lon, d.lat));
    assert.ok(Math.abs(p.lon - d.lon) < 1e-9);
    assert.ok(Math.abs(p.lat - d.lat) < 1e-9);
    assert.ok(nearestPath(d.lon, d.lat).distance < 100);
  }
  assert.equal(WALK_SPEED, 4.6);
  assert.equal(RUN_SPEED, 8);
  assert.equal(PLAYER_RADIUS, 0.42);
});
test("swept sprint steps cannot tunnel through a thin wall", () => {
  const wall = {
    p: [
      [2, -4],
      [2.1, -4],
      [2.1, 4],
      [2, 4],
    ],
  };
  const blocked = (p: { x: number; z: number }) =>
    hitsPolygon(p, wall) ? "Building" : null;
  const result = moveWithCollisions({ x: 0, z: 0 }, 10, 0, blocked);
  assert.ok(result.position.x < 2 - PLAYER_RADIUS);
  assert.equal(result.obstacle, "Building");
});
test("obstacles allow sliding along a wall without entering it", () => {
  const wall = {
    p: [
      [2, -10],
      [3, -10],
      [3, 10],
      [2, 10],
    ],
  };
  const result = moveWithCollisions({ x: 1.5, z: 0 }, 3, 3, (p) =>
    hitsPolygon(p, wall) ? "Building" : null,
  );
  assert.ok(result.position.x < 2 - PLAYER_RADIUS);
  assert.ok(result.position.z > 2.9);
});
test("courtyards stay accessible with clearance from both sides of walls", () => {
  const b = {
    p: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    holes: [
      [
        [3, 3],
        [7, 3],
        [7, 7],
        [3, 7],
      ],
    ],
  };
  assert.equal(hitsPolygon({ x: 5, z: 5 }, b), false);
  assert.equal(hitsPolygon({ x: 3.1, z: 5 }, b), true);
  assert.equal(hitsPolygon({ x: 1, z: 1 }, b), true);
  assert.equal(hitsPolygon({ x: -0.2, z: 5 }, b), true);
  assert.equal(hitsPolygon({ x: -1, z: 5 }, b), false);
});
test("world bounds reject unlimited movement and invalid coordinates", () => {
  assert.equal(obstacleAt({ x: 100000, z: 100000 }), "World boundary");
  assert.equal(obstacleAt({ x: NaN, z: 0 }), "World boundary");
});

test("mapped river water blocks movement except through a bridge corridor", async () => {
  const { default: data } = await import("../src/data/obstacles.json");
  const { inRing, onBridge } = await import("../src/collision");
  let waterChecked = 0,
    bridgeChecked = 0;
  for (let x = 0; x < 200; x += 2)
    for (let z = -200; z < 250; z += 2) {
      const p = { x, z };
      const water =
        data.water.some((w) => w.role === "outer" && inRing(p, w.p)) &&
        !data.water.some((w) => w.role === "inner" && inRing(p, w.p));
      if (!water) continue;
      if (onBridge(p)) {
        if (obstacleAt(p) === null) bridgeChecked++;
      } else {
        assert.notEqual(obstacleAt(p), null);
        waterChecked++;
      }
    }
  assert.ok(waterChecked > 100);
  assert.ok(bridgeChecked > 0);
});
