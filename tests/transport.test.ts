import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preparePatterns, vehiclesAt } from "../src/transport/vendor/buses-data.js";
import { terrainHeight } from "../src/transport/terrain";
import { selectVehicles } from "../src/transport/selection";
import type { TransportManifest } from "../src/transport/types";
const manifest: TransportManifest = JSON.parse(readFileSync(new URL("../public/transport/manifest.json", import.meta.url), "utf8"));

test("saved routes produce finite moving buses and trains with exported matching models", () => {
  for (const kind of ["bus", "rail"] as const) {
    const patterns = preparePatterns(manifest.catalogs[kind]);
    let moved = 0, dwelling = 0;
    for (let seconds = 14 * 3600; seconds < 15 * 3600; seconds += 30) {
      const current = vehiclesAt(patterns, seconds);
      const next = new Map(vehiclesAt(patterns, seconds + 1).map((p) => [p.id, p]));
      for (const pose of current) {
        assert.ok([pose.x, pose.z, pose.angle].every(Number.isFinite));
        assert.ok(manifest.models[`${kind}|${pose.ref}|${pose.headsign}|${pose.agencyId}`]);
        const later = next.get(pose.id);
        if (later && Math.hypot(later.x - pose.x, later.z - pose.z) > .01) moved++;
        if (pose.dwelling) dwelling++;
      }
    }
    assert.ok(moved > 10, `${kind} must actually move between stops`);
    assert.ok(dwelling > 0, `${kind} must dwell at stops`);
  }
});

test("terrain interpolation supports slopes and clamps to the source grid", () => {
  const terrain = { cols: 2, rows: 2, bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, heights: [440, 450, 460, 470] };
  assert.equal(terrainHeight(terrain, 5, 5), 455);
  assert.equal(terrainHeight(terrain, -10, 0), 440);
  assert.equal(terrainHeight(terrain, 20, 20), 470);
});

test("coincident S4 service variants draw one train while separate vehicles remain", () => {
  const poses = vehiclesAt(preparePatterns(manifest.catalogs.rail), 14 * 3600 + 13 * 60)
    .filter((v) => Math.hypot(v.x + 23, v.z) < 160)
    .map((v) => ({ ...v, kind: "rail" as const, file: "test.glb", height: 450, pitch: 0 }));
  assert.equal(poses.length, 2);
  assert.equal(selectVehicles(poses, -23, 0).length, 1);
  const separated = { ...poses[0], id: "separate", x: poses[0].x + 30 };
  assert.equal(selectVehicles([...poses, separated], -23, 0).length, 2);
});

test("every vehicle GLB has complete geometry and embedded destination textures", () => {
  assert.equal(Object.keys(manifest.models).length, 19);
  for (const model of Object.values(manifest.models)) {
    const bytes = readFileSync(new URL(`../public/transport/${model.file}`, import.meta.url));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    assert.equal(bytes.length, model.bytes);
    const length = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString());
    assert.ok(gltf.meshes.length > 0);
    assert.ok(gltf.images.length > 0);
    for (const view of gltf.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= bytes.readUInt32LE(20 + length));
  }
});
