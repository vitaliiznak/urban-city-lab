import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { destinations, nearestPath } from "../src/world";
import { obstacleAt, streetObstacles, toLocal } from "../src/collision";

test("district arrivals lie on mapped public paths clear of buildings, water and exported furniture", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/world-details/manifest.json", import.meta.url), "utf8"));
  streetObstacles.update(manifest.street.cells.flatMap((c: { obstacles?: [] }) => c.obstacles || []), { x: 10000, z: 10000 });
  try {
    const districts = destinations.filter((d) => ["gallery", "sood", "pools"].includes(d.id));
    assert.equal(districts.length, 3);
    for (const destination of districts) {
      const path = nearestPath(destination.lon, destination.lat);
      assert.ok(path.distance < .1, destination.title);
      assert.equal(obstacleAt(toLocal(path.lon, path.lat)), null, destination.title);
    }
  } finally { streetObstacles.clear(); }
});
