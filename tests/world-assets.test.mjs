import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../public/world-details/", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));

test("exported street cells contain the actual mapped furniture and house numbers", () => {
  const counts = new Map();
  for (const cell of catalog.street.cells) for (const [name, count] of Object.entries(cell.objects)) counts.set(name, (counts.get(name) || 0) + count);
  for (const [name, count] of [["osm-bins", 132], ["osm-lamps", 1610], ["civic-hydrants", 493], ["civic-recycling", 13], ["official-house-numbers", 2167]]) assert.equal(counts.get(name), count, name);
  assert.equal([...counts].filter(([name]) => name.startsWith("osm-cars-")).reduce((n, [, count]) => n + count, 0), 320);
});

test("every detailed building has one measured replacement body", () => {
  assert.equal(catalog.architecture.buildings.length, 58);
  for (const building of catalog.architecture.buildings) {
    const bodies = catalog.architecture.cells.reduce((n, cell) => n + (cell.objects[building.id] || 0), 0);
    assert.equal(bodies, 1, building.id);
  }
});

test("solid prop footprints stay inside their rendered cells and include only Bushof piers", () => {
  const counts = new Map();
  for (const cell of catalog.street.cells) for (const obstacle of cell.obstacles) {
    counts.set(obstacle.label, (counts.get(obstacle.label) || 0) + 1);
    assert.ok(obstacle.p.length >= 3);
    for (const [x, z] of obstacle.p) {
      assert.ok(Number.isFinite(x) && Number.isFinite(z));
      assert.ok(x * .45 >= cell.x + cell.bounds.min[0] - .01 && x * .45 <= cell.x + cell.bounds.max[0] + .01, cell.file);
      assert.ok(z * .45 >= cell.z + cell.bounds.min[2] - .01 && z * .45 <= cell.z + cell.bounds.max[2] + .01, cell.file);
    }
  }
  assert.equal(counts.get("Parked car"), 320);
  assert.equal(counts.get("Bin"), 132);
  assert.equal(counts.get("Bus station pier"), 4);
});

test("all streamed GLBs have complete binary buffers and finite bounds", () => {
  let textures = 0;
  for (const cell of [...catalog.street.cells, ...catalog.architecture.cells]) {
    const data = readFileSync(new URL(cell.file, root));
    assert.equal(data.readUInt32LE(0), 0x46546c67, cell.file);
    assert.equal(data.readUInt32LE(4), 2);
    assert.equal(data.readUInt32LE(8), data.length);
    assert.equal(data.length, cell.bytes);
    const jsonLength = data.readUInt32LE(12);
    const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
    const binLength = data.readUInt32LE(20 + jsonLength);
    for (const view of gltf.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= binLength, cell.file);
    assert.ok([...cell.bounds.min, ...cell.bounds.max].every(Number.isFinite), cell.file);
    assert.ok(gltf.meshes.length > 0);
    textures += gltf.images?.length || 0;
  }
  assert.ok(textures > 100, "Generated shop/street/number textures must survive export");
});

test("Migros signage contains visible colored lettering, not an empty texture", async () => {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const data = readFileSync(new URL("architecture-0_-180.glb", root));
  const jsonLength = data.readUInt32LE(12);
  const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
  const view = gltf.bufferViews[gltf.images[0].bufferView];
  const image = await loadImage(data.subarray(28 + jsonLength + view.byteOffset, 28 + jsonLength + view.byteOffset + view.byteLength));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let orange = 0, opaque = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 200) opaque++;
    if (pixels[i] > 180 && pixels[i + 1] > 70 && pixels[i + 1] < 165 && pixels[i + 2] < 90 && pixels[i + 3] > 200) orange++;
  }
  assert.ok(opaque > image.width * image.height * 0.9);
  assert.ok(orange > image.width * image.height * 0.02, "Expected generated orange MIGROS lettering");
});
