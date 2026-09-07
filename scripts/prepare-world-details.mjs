import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import * as THREE from "../../adliswil-explorer/outputs/adliswil/node_modules/three/build/three.module.js";
import { installCanvas, exportCells } from "./lib/export-scene.mjs";
import { railwaySurfaces } from "./lib/railway-surfaces.mjs";
import { addLifeLayer } from "../../adliswil-explorer/outputs/adliswil/src/life-layer.js";
import { addCivicLayer } from "../../adliswil-explorer/outputs/adliswil/src/civic-layer.js";
import { addBushof } from "../../adliswil-explorer/outputs/adliswil/src/bushof.js";
import { parseBuildingGeometry } from "../../adliswil-explorer/outputs/adliswil/src/real-buildings.js";
import { installFacadeArchitecture } from "../../adliswil-explorer/outputs/adliswil/src/facade-install.js";
import { addCorridorArchitecture } from "../../adliswil-explorer/outputs/adliswil/src/corridor-architecture.js";
import { addCivicArchitecture } from "../../adliswil-explorer/outputs/adliswil/src/civic-architecture.js";

installCanvas();
const input = new URL("../../adliswil-explorer/outputs/adliswil/", import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, input), "utf8"));
const geography = read("src/data/adliswil.json");
const terrain = read("src/data/terrain.json");
const manifest = read("public/data/adliswil-buildings.json");
const b = terrain.bounds;
const getHeight = (x, z) => {
  const u = Math.max(0, Math.min(terrain.cols - 1, (x - b.minX) / (b.maxX - b.minX) * (terrain.cols - 1)));
  const v = Math.max(0, Math.min(terrain.rows - 1, (z - b.minZ) / (b.maxZ - b.minZ) * (terrain.rows - 1)));
  const ix = Math.min(terrain.cols - 2, Math.floor(u)), iz = Math.min(terrain.rows - 2, Math.floor(v));
  const at = (xx, zz) => terrain.heights[zz * terrain.cols + xx];
  const a = at(ix, iz) * (1 - (u - ix)) + at(ix + 1, iz) * (u - ix);
  const c = at(ix, iz + 1) * (1 - (u - ix)) + at(ix + 1, iz + 1) * (u - ix);
  return (a * (1 - (v - iz)) + c * (v - iz) - terrain.heightOrigin) * geography.projection.scale;
};
const world = {
  scale: geography.projection.scale,
  bounds: geography.renderBounds,
  boundaryPolygons: geography.boundaryPolygons,
  roads: geography.roads,
  waterPolygons: geography.water,
  bridgePaths: geography.roads.filter((r) => r.tags.bridge === "yes").map((r) => ({ p: r.p, width: (parseFloat(r.tags.width) || 4) * geography.projection.scale })),
  colliders: structuredClone(manifest.colliders),
  getHeight,
};
const life = addLifeLayer(world);
const civic = addCivicLayer(world);
const bushof = addBushof(world);
const railway = railwaySurfaces(geography.rails, world.scale);
console.log("Built street objects", JSON.stringify({ life: life.stats, civic: civic.stats, bushof: bushof.stats }, (key, value) => key === "source" ? undefined : value));
const directory = new URL("../public/world-details/", import.meta.url);
const numbers = new THREE.Group(); numbers.name = "Official building numbers";
const numberMaterials = new Map();
for (const plate of civic.houseNumbers) {
  const number = String(plate.number);
  if (!numberMaterials.has(number)) {
    const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 96;
    const context = canvas.getContext("2d");
    context.fillStyle = "#193b60"; context.fillRect(0, 0, 128, 96);
    context.strokeStyle = "#d9e3e8"; context.lineWidth = 4; context.strokeRect(4, 4, 120, 88);
    context.fillStyle = "#ffffff"; context.font = "bold 58px Arial"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(number, 64, 49, 110);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    numberMaterials.set(number, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.82, side: THREE.DoubleSide }));
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), numberMaterials.get(number));
  mesh.position.set(plate.x, getHeight(plate.x, plate.z) + 0.72, plate.z); mesh.rotation.y = plate.heading;
  mesh.name = "official-house-numbers"; numbers.add(mesh);
}
const street = await exportCells([life.group, civic.group, bushof.group, numbers], directory, { collision: { getHeight, scale: world.scale } });
writeFileSync(new URL("railway.json", directory), JSON.stringify(railway));
// The canopy is one merged mesh: retain its four explicit pier footprints instead
// of turning the open platform beneath the roof into a convex wall.
const canopyCell = street.cells.find((cell) => cell.objects["bushof-canopy"]);
if (canopyCell) canopyCell.obstacles.push(...bushof.colliders.map((c) => ({
  p: c.p.map(([x, z]) => [x / world.scale, z / world.scale]), label: "Bus station pier",
})));
console.log(`Exported ${street.cells.length} street cells, ${street.objects} objects, ${(street.bytes / 1e6).toFixed(1)} MB.`);
const binary = gunzipSync(readFileSync(new URL("public/data/adliswil-buildings.bin.gz", input)));
const buildingGroup = parseBuildingGeometry(manifest, binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
world.realBuildings = { manifest, group: buildingGroup, material: buildingGroup.userData.material };
const details = [installFacadeArchitecture(world), addCorridorArchitecture(world), addCivicArchitecture(world)];
const targets = ["architecture", "corridor-architecture", "civic-architecture"].flatMap((name) => read(`src/data/${name}.json`).targets);
const bodies = new THREE.Group(); bodies.name = "Measured landmark buildings";
for (const target of targets) {
  const mesh = buildingGroup.getObjectByName(target.chunk);
  const owned = target.patch?.ownedFaceRanges || target.ownedFaceRanges;
  const g = mesh.geometry.clone();
  const indices = [];
  for (const range of owned) for (let f = range.start; f < range.start + range.count; f++) for (let k = 0; k < 3; k++) indices.push(mesh.geometry.index.array[f * 3 + k]);
  g.setIndex(indices);
  const material = mesh.material.clone(); material.userData = {};
  const body = new THREE.Mesh(g, material); body.name = target.uuid; bodies.add(body);
}
const architecture = await exportCells([...details, bodies], directory, { cellSize: 180, prefix: "architecture" });
console.log(`Exported ${targets.length} detailed buildings in ${architecture.cells.length} sections, ${(architecture.bytes / 1e6).toFixed(1)} MB.`);
const catalog = {
  version: 1,
  projection: manifest.projection,
  source: { street: life.source, civic: civic.source, architecture: details.map((d) => d.userData.source), buildings: manifest.source },
  note: "Original Explorer geometry and generated sign textures. Ground uses the bundled Swiss terrain grid; poses can differ slightly from live terrain. Local detailed building UUIDs replace their streamed counterparts only when their models are ready.",
  street,
  architecture: { ...architecture, buildings: targets.map((t) => ({ id: t.uuid, name: t.name || t.address || t.addresses?.join(", "), bounds: t.modelBounds })) },
  stats: { life: life.stats, civic: civic.stats, bushof: bushof.stats, railway: railway.stats },
};
writeFileSync(new URL("manifest.json", directory), JSON.stringify(catalog));

const activeFiles = new Set([...street.cells, ...architecture.cells].map((c) => c.file));
for (const file of readdirSync(directory)) if (file.endsWith(".glb") && !activeFiles.has(file)) unlinkSync(new URL(file, directory));
