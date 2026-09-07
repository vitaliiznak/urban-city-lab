import test from "node:test";
import assert from "node:assert/strict";
import { railwaySurfaces } from "../scripts/lib/railway-surfaces.mjs";

test("railway dressing excludes tunnels and elevated tracks with unknown deck heights", () => {
  const line = { p: [[0, 0], [10, 0]], tags: { gauge: "1435" } };
  const result = railwaySurfaces([line, { ...line, tags: { tunnel: "yes" } }, { ...line, tags: { bridge: "yes" } }, { ...line, tags: { layer: "1" } }], .45);
  assert.equal(result.stats.ways, 1);
  assert.ok(result.cells.some((c) => c.sleepers.length > 0));
  const tracks = result.cells.flatMap((c) => c.steel);
  const centres = tracks.map((p) => p.reduce((n, v) => n + v[1], 0) / p.length);
  assert.ok(Math.abs(Math.max(...centres) - Math.min(...centres) - 1.435) < .002);
});
