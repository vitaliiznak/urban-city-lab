import test from "node:test";
import assert from "node:assert/strict";
import { propFootprint, propLabel } from "../scripts/lib/prop-colliders.mjs";

test("body-height clipping ignores overhead signs and preserves tall posts", () => {
  const overhead = [-2, 3, -1, 2, 3, -1, 2, 3, 1];
  assert.equal(propFootprint(overhead, 0, 1), null);
  const post = [-.1, 0, -.1, .1, 0, -.1, .1, 4, .1, -.1, 0, -.1, .1, 4, .1, -.1, 4, .1];
  const polygon = propFootprint([...post, ...overhead], 0, 1);
  assert.ok(polygon.length >= 3);
  assert.ok(polygon.every(([x, z]) => Math.abs(x) <= .1 && Math.abs(z) <= .1));
  assert.equal(propLabel("osm-lanterns"), undefined);
  assert.equal(propLabel("osm-cars-2"), "Parked car");
  assert.equal(propLabel("osm-goals"), undefined); // Open goal frames must not become solid walls.
});
