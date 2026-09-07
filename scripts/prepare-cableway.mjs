import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "../../adliswil-explorer/outputs/adliswil/node_modules/three/build/three.module.js";
import { GLTFExporter } from "../../adliswil-explorer/outputs/adliswil/node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "../../adliswil-explorer/outputs/adliswil/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js";
import { installCanvas } from "./lib/export-scene.mjs";
import { terrainHeight } from "../src/transport/terrain.ts";
import { cablePoint } from "../src/cableway/motion.ts";

installCanvas();
const source = new URL("../../adliswil-explorer/outputs/adliswil/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, source), "utf8"));
const geography = read("src/data/felsenegg.json"), terrain = read("src/data/terrain.json"), scale = geography.projection.scale;
const points = geography.cable.p;
const anchors = points.map(([x, z], i) => ({ x: x / scale, z: z / scale,
  height: i === 1 ? terrainHeight(terrain, x, z) + 44 : (i === 0 ? 497 : 804) + 4 / scale }));
const length = (a, b) => Math.hypot(b.x - a.x, b.z - a.z, b.height - a.height);
const lower = length(anchors[0], anchors[1]), upper = length(anchors[1], anchors[2]);
const catalog = {
  version: 1, anchors, split: lower / (lower + upper), laneOffset: 1.25 / scale,
  sag: [2, 3], travelRange: { start: .006, end: .9894 },
  travelSeconds: 300, dwellSeconds: 20, initialTime: 275, cabinDrop: 1.96 / scale,
  swissFeature: JSON.parse(readFileSync(new URL("./data/cableway-swiss-feature.json", import.meta.url), "utf8")),
  source: { osm: geography.source, osmWay: geography.cable.id,
    operator: "https://www.szu.ch/de/ueber-die-szu/felseneggbahn/", checked: "2026-09-09",
    operatorFacts: { valleyElevation: 497, summitElevation: 804, supportHeight: 44, routeLength: 1048, cabins: 2, journeyMinutes: "5–6" },
    explorerWorldSha256: createHash("sha256").update(readFileSync(new URL("src/world.js", source))).digest("hex") },
  note: "OSM alignment and operator elevations/support height. Original Explorer cabin proportions and station clearance offsets. Cable sag, station dwell and cabin appearance are illustrative, not surveyed geometry or a live timetable. Measured Swiss terminal buildings remain streamed unchanged.",
};
const directory = new URL("../public/cableway/", import.meta.url); mkdirSync(directory, { recursive: true });
const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...options });
const red = material("#c65343"), white = material("#f3ead4"), glass = material("#648c94", { metalness: .15, roughness: .3 });
const metal = material("#415c59", { metalness: .3, roughness: .6 });
const cabin = new THREE.Group(); cabin.name = "Felseneggbahn cabin · Explorer proportions";
function box(parent, mat, x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}
// The original world.js cabin builder, expressed in metres for the Cesium asset.
const part = (mat, x, y, z, w, h, d) => box(cabin, mat, x / scale, y / scale, z / scale, w / scale, h / scale, d / scale);
part(red, 0, 0, 0, 2, 1.6, 1.5); part(white, 0, .83, 0, 2.07, .12, 1.56);
for (const side of [-1, 1]) {
  part(glass, 0, .33, side * .756, 1.72, .75, .025);
  part(glass, side * 1.01, .33, 0, .025, .75, 1.18);
  part(white, 0, -.38, side * .773, .5, .16, .016);
  part(white, 0, -.38, side * .777, .16, .5, .017);
}
part(metal, 0, 1.42, 0, .1, 1.2, .1);
const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .15, 12), metal);
wheel.rotation.x = Math.PI / 2; wheel.position.y = catalog.cabinDrop; cabin.add(wheel);
const wire = new THREE.Group(); wire.name = "Felseneggbahn · OSM cable alignment";
function beam(a, b, radius, parent = wire) {
  const av = new THREE.Vector3(a.x, a.height - 440, a.z), bv = new THREE.Vector3(b.x, b.height - 440, b.z), delta = bv.clone().sub(av);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), metal);
  mesh.position.copy(av).add(bv).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); parent.add(mesh);
}
for (let lane = 0; lane < 2; lane++) for (const [start, end] of [[0, catalog.split], [catalog.split, 1]]) {
  let previous = cablePoint(catalog, start, lane);
  for (let i = 1; i <= 40; i++) { const next = cablePoint(catalog, start + (end - start) * i / 40, lane); beam(previous, next, .0195); previous = next; }
}
// A simple support at the mapped OSM node. Width and bracing are visual defaults.
const top = anchors[1], baseHeight = top.height - 44;
for (const side of [-1, 1]) {
  beam({ ...top, x: top.x + side * 2, height: baseHeight }, { ...top, x: top.x + side * .6 }, .22);
}
for (let i = 0; i < 8; i++) {
  const y = baseHeight + i * 5.5, width = 2 - i / 8 * 1.4, nextWidth = 2 - (i + 1) / 8 * 1.4;
  beam({ ...top, x: top.x - width, height: y }, { ...top, x: top.x + nextWidth, height: y + 5.5 }, .09);
  beam({ ...top, x: top.x + width, height: y }, { ...top, x: top.x - nextWidth, height: y + 5.5 }, .09);
}
const left = cablePoint(catalog, catalog.split, 0), right = cablePoint(catalog, catalog.split, 1);
beam(left, right, .3);
const files = [];
for (const [name, root] of [["cabin", cabin], ["cables", wire]]) {
  root.updateMatrixWorld(true);
  const batches = new Map();
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (!batches.has(node.material)) batches.set(node.material, []);
    batches.get(node.material).push(node.geometry.clone().applyMatrix4(node.matrixWorld));
  });
  const merged = new THREE.Group(); merged.name = root.name;
  for (const [material, geometries] of batches) merged.add(new THREE.Mesh(mergeGeometries(geometries), material));
  const buffer = await new GLTFExporter().parseAsync(merged, { binary: true });
  writeFileSync(new URL(`${name}.glb`, directory), Buffer.from(buffer)); files.push({ file: `${name}.glb`, bytes: buffer.byteLength });
}
catalog.files = files;
writeFileSync(new URL("manifest.json", directory), JSON.stringify(catalog));
console.log(JSON.stringify({ files, lower, upper, anchors }));
