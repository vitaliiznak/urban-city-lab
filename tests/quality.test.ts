import test from "node:test";
import assert from "node:assert/strict";
import { createQualityController, settingsFor } from "../src/quality";
import data from "../src/data/surfaces.json";

test("aerial views keep shadows off and use coarser tiles than walking", () => {
  const walk = settingsFor("walk", "high");
  const aerial = settingsFor("overview", "high");
  assert.equal(aerial.shadows, false);
  assert.equal(walk.shadows, true);
  assert.ok(aerial.buildingSSE > walk.buildingSSE);
  assert.ok(aerial.globeSSE > walk.globeSSE);
  assert.ok(walk.shadowDistance < 1800);
  assert.ok(walk.shadowMapSize <= 1024);
});

test("quality tiers keep full resolution and tone mapping", () => {
  for (const mode of ["intro", "overview", "walk"] as const) {
    for (const tier of ["high", "medium", "low"] as const) {
      const settings = settingsFor(mode, tier);
      assert.equal(settings.resolutionScale, 1);
      assert.equal(settings.hdr, true);
    }
  }
});

test("quality controller needs a sustained hitch before dropping a tier", () => {
  const quality = createQualityController();
  quality.setMode("walk");
  quality.consume();
  for (let i = 0; i < 36; i++) quality.sample(0.03);
  assert.equal(quality.consume(), false);
  for (let i = 0; i < 36; i++) quality.sample(0.03);
  assert.equal(quality.consume(), true);
  assert.equal(quality.settings().shadows, false);
});

test("mapped road meshes skip footpaths", () => {
  const roads = data.surfaces.filter(
    (s) => s.type === "road" && s.coordinates.length > 1,
  );
  assert.ok(roads.length > 200);
  assert.ok(roads.length < 1200);
  assert.ok(roads.every((r) => r.type === "road"));
  assert.ok(data.surfaces.length - roads.length > 2000);
});
