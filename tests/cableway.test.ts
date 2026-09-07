import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cabinPoses, cablePoint, type CablewayCatalog } from "../src/cableway/motion";
import { terrainHeight, type Terrain } from "../src/transport/terrain";
const read = (file: string) => JSON.parse(readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8"));
const catalog: CablewayCatalog = read("cableway/manifest.json");
const terrain: Terrain = read("transport/terrain.json");

test("cable cabins share the mapped tracks, stay above terrain and stop at both terminals", () => {
  let stopped = 0, minimumClearance = Infinity;
  for (let t = 0; t <= 640; t += .2) {
    const poses = cabinPoses(catalog, t);
    assert.ok(Math.abs(poses[0].progress + poses[1].progress - catalog.travelRange.start - catalog.travelRange.end) < 1e-10);
    for (const pose of poses) {
      assert.ok([pose.x, pose.z, pose.height, pose.angle].every(Number.isFinite));
      assert.ok(pose.progress >= catalog.travelRange.start - 1e-10 && pose.progress <= catalog.travelRange.end + 1e-10);
      const cable = cablePoint(catalog, pose.progress, pose.lane);
      assert.ok(Math.abs(cable.height - pose.height - catalog.cabinDrop) < 1e-10);
      const floor = pose.height - .8 / .45;
      const clearance = floor - terrainHeight(terrain, pose.x * .45, pose.z * .45);
      minimumClearance = Math.min(minimumClearance, clearance);
      assert.ok(clearance > 0, `cabin intersects source terrain at ${pose.progress}: ${clearance}`);
      if (!pose.moving) stopped++;
    }
  }
  assert.ok(stopped > 300);
  assert.ok(minimumClearance < 20);
});

test("cable movement joins spans continuously and cabins dwell without drifting", () => {
  for (const lane of [0, 1]) {
    const a = cablePoint(catalog, catalog.split - 1e-8, lane), b = cablePoint(catalog, catalog.split + 1e-8, lane);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z, a.height - b.height) < .01);
  }
  const withoutOffset = { ...catalog, initialTime: 0 };
  assert.deepEqual(cabinPoses(withoutOffset, 305), cabinPoses(withoutOffset, 315));
  assert.deepEqual(cabinPoses(withoutOffset, 625), cabinPoses(withoutOffset, 635));
});

test("cableway GLBs contain complete local geometry within the small asset budget", () => {
  for (const file of ["cabin", "cables"]) {
    const buffer = readFileSync(new URL(`../public/cableway/${file}.glb`, import.meta.url));
    assert.equal(buffer.readUInt32LE(0), 0x46546c67);
    assert.equal(buffer.readUInt32LE(8), buffer.length);
    assert.ok(buffer.length < 600000);
    const length = buffer.readUInt32LE(12), json = JSON.parse(buffer.subarray(20, 20 + length).toString());
    for (const view of json.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= buffer.readUInt32LE(20 + length));
    assert.ok(json.meshes.length > 0);
  }
});
