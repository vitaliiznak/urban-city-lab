import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveParking, deriveCrossings } from "../scripts/lib/cleanup-geography.mjs";
const ring = [{ lon: 8.5, lat: 47.3 }, { lon: 8.51, lat: 47.3 }, { lon: 8.51, lat: 47.31 }, { lon: 8.5, lat: 47.3 }];
const way = (tags, geometry = ring) => ({ type: "way", id: 1, tags, geometry });

test("parking cleanup never paints over covered, underground or multi-storey parking", () => {
  const excluded = [{ parking: "underground" }, { parking: "multi-storey" }, { building: "roof" }, { covered: "yes" }, { level: "-1" }, { layer: "-1" }, { parking: "rooftop" }];
  assert.deepEqual(deriveParking(excluded.map((tags) => way({ amenity: "parking", ...tags }))), []);
  assert.equal(deriveParking([way({ amenity: "parking", parking: "surface", surface: "gravel" })])[0].surface, "gravel");
});

test("incomplete and open parking outlines do not become filled ground masks", () => {
  const tags = { amenity: "parking" };
  assert.deepEqual(deriveParking([way(tags, ring.slice(0, -1)), way(tags, [ring[0], null, ...ring.slice(1)])]), []);
});

test("crossings require explicit marking evidence and stay off bridges", () => {
  const base = { highway: "footway", footway: "crossing" };
  const tags = [{}, { crossing: "unmarked" }, { crossing: "traffic_signals" }, { "crossing:markings": "no", crossing: "marked" }, { bridge: "yes", "crossing:markings": "zebra" }];
  assert.deepEqual(deriveCrossings(tags.map((t) => way({ ...base, ...t }))), []);
  const result = deriveCrossings([way({ ...base, "crossing:markings": "zebra", width: "4" })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].width, 4);
  assert.equal(result[0].widthAssumed, false);
});
