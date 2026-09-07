import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import * as THREE from "../../adliswil-explorer/outputs/adliswil/node_modules/three/build/three.module.js";
import { cablePoint } from "../src/cableway/motion.ts";
const source = new URL("../../adliswil-explorer/outputs/adliswil/", import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, source), "utf8"));
const catalog = JSON.parse(readFileSync(new URL("../public/cableway/manifest.json", import.meta.url), "utf8"));
const summit = read("src/data/felsenegg-station.json"), manifest = read("public/data/adliswil-buildings.json");
const station = manifest.buildings.find((b) => b.id === "793E5315-AD5B-484A-BB7A-BA1EFFBC6CCD");
const chunk = manifest.chunks.find((c) => c.source === station.ownerChunk);
const binary = gunzipSync(readFileSync(new URL("public/data/adliswil-buildings.bin.gz", source)));
const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
const valley = { positions: new Float32Array(buffer, chunk.position.offset, chunk.position.count * 3), indices: new globalThis[chunk.index.type](buffer, chunk.index.offset, chunk.index.count) };
// Conservative box encloses the actual cabin body, glass and roof. Transform the
// measured triangles into cabin space for Three's triangle/box separating-axis test.
const box = new THREE.Box3(new THREE.Vector3(-1.035 / .45, -.8 / .45, -.79 / .45), new THREE.Vector3(1.035 / .45, .89 / .45, .79 / .45));
let poses = 0;
for (const [name, geometry, start, end] of [["valley", valley, catalog.travelRange.start, .04], ["summit", summit, .97, catalog.travelRange.end]]) {
  for (const lane of [0, 1]) for (let t = start; t <= end + .00001; t += .0002) {
    const p = cablePoint(catalog, t, lane), inverse = new THREE.Matrix4().makeRotationY(-p.angle), vertices = geometry.positions;
    const point = (i) => new THREE.Vector3(vertices[i * 3] / .45 - p.x, vertices[i * 3 + 1] / .45 + 440 - (p.height - catalog.cabinDrop), vertices[i * 3 + 2] / .45 - p.z).applyMatrix4(inverse);
    for (let k = 0; k < geometry.indices.length; k += 3) {
      const triangle = new THREE.Triangle(...Array.from(geometry.indices.slice(k, k + 3), point));
      assert.equal(box.intersectsTriangle(triangle), false, `${name} lane ${lane} at ${t} intersects measured terminal geometry`);
    }
    poses++;
  }
}
console.log(`${poses} approach poses: both cabins clear both measured terminal exteriors.`);
