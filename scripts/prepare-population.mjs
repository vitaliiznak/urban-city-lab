import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "../../adliswil-explorer/outputs/adliswil/node_modules/three/build/three.module.js";
import { GLTFExporter } from "../../adliswil-explorer/outputs/adliswil/node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import { createPopulation } from "../../adliswil-explorer/outputs/adliswil/src/actors.js";
import { installCanvas } from "./lib/export-scene.mjs";
import { terrainHeight } from "../src/transport/terrain.ts";
import { exportWildlife } from "./lib/export-wildlife.mjs";
import { inRing } from "../src/collision.ts";

installCanvas();
const source = new URL("../../adliswil-explorer/outputs/adliswil/", import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, source), "utf8"));
const geography = read("src/data/adliswil.json"), terrain = read("src/data/terrain.json"), buildings = read("public/data/adliswil-buildings.json");
const streets = JSON.parse(readFileSync(new URL("../public/world-details/manifest.json", import.meta.url), "utf8"));
const scale = geography.projection.scale;
const river = geography.riverCenterline.p.slice().sort((a, b) => a[1] - b[1]);
const furniture = streets.street.cells.flatMap((cell) => (cell.obstacles || []).map((o) => {
  const p = o.p.map(([x, z]) => [x * scale, z * scale]);
  const xs = p.map(([x]) => x), zs = p.map(([, z]) => z);
  return { p, x: (Math.max(...xs) + Math.min(...xs)) / 2, z: (Math.max(...zs) + Math.min(...zs)) / 2, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };
}));
const world = {
  scale, bounds: geography.renderBounds, boundaryPolygons: geography.boundaryPolygons,
  roads: geography.roads, waterPolygons: geography.water, landuse: geography.landuse,
  bridgePaths: geography.roads.filter((r) => r.tags.bridge === "yes").map((r) => ({ p: r.p, width: (parseFloat(r.tags.width) || 4) * scale })),
  colliders: [...buildings.colliders, ...furniture],
  getHeight: (x, z) => (terrainHeight(terrain, x, z) - terrain.heightOrigin) * scale,
  riverX: (z) => {
    for (let i = 1; i < river.length; i++) if (z <= river[i][1]) {
      const a = river[i - 1], b = river[i], t = Math.max(0, Math.min(1, (z - a[1]) / (b[1] - a[1] || 1)));
      return a[0] + (b[0] - a[0]) * t;
    }
    return river.at(-1)[0];
  },
};
const population = createPopulation(new THREE.Scene(), world, { leisure: true });
const directory = new URL("../public/population/", import.meta.url);
mkdirSync(directory, { recursive: true });
const riverWater = geography.water.filter((w) => w.tags?.name === "Sihl");
writeFileSync(new URL("river.json", directory), JSON.stringify({ source: geography.source,
  note: "Mapped Sihl water footprint with islands retained. Generated appearance on streamed terrain; not a live water-level model.",
  polygons: riverWater.filter((w) => w.role === "outer").map((w) => ({ id: w.id, p: w.p.map(([x, z]) => [x / scale, z / scale]),
    holes: riverWater.filter((hole) => hole.role === "inner" && inRing({ x: hole.p[0][0], z: hole.p[0][1] }, w.p)).map((hole) => hole.p.map(([x, z]) => [x / scale, z / scale])) })) }));
const animals = await exportWildlife(population, directory);
const people = [];
for (const [index, npc] of population.npcs.entries()) {
  const root = npc.group, routeId = root.userData.routeId;
  if (routeId === undefined) continue;
  const speed = index === 1 || index === 7 ? 2.5 : .85 + (index % 4) * .13;
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.visible = true;
  root.children.forEach((node, i) => { node.name = ["body", "leftArm", "rightArm", "leftLeg", "rightLeg", "fishingRod"][i]; });
  const clips = [];
  for (const [name, pace, duration] of [["Idle", 0, 2], ["Walk", speed, Math.PI / 4]]) {
    const times = [], tracks = root.children.slice(0, 5).map((node) => ({ node, positions: [], quaternions: [] }));
    for (let i = 0; i <= 32; i++) {
      const t = i / 32 * duration; times.push(t); root.userData.animate(t, pace);
      for (const track of tracks) { track.positions.push(...track.node.position.toArray()); track.quaternions.push(...track.node.quaternion.toArray()); }
    }
    clips.push(new THREE.AnimationClip(name, duration, tracks.flatMap((t) => [
      new THREE.VectorKeyframeTrack(`${t.node.name}.position`, times, t.positions),
      new THREE.QuaternionKeyframeTrack(`${t.node.name}.quaternion`, times, t.quaternions),
    ])));
  }
  root.userData.animate(0, 0); root.userData = {};
  const bytes = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips, onlyVisible: true });
  const file = `${npc.id}.glb`;
  writeFileSync(new URL(file, directory), Buffer.from(bytes));
  people.push({ id: npc.id, routeId, file, bytes: bytes.byteLength, speed: speed * scale, phase: index * .371 % 1, side: index % 2 ? -1 : 1 });
}
const catalog = { version: 2, scale, people, animals, routes: population.routes,
  source: { geography: geography.source, actorsSha256: createHash("sha256").update(readFileSync(new URL("src/actors.js", source))).digest("hex"), furnitureCount: furniture.length },
  note: "Fictional anonymous pedestrians and illustrative wildlife reused from the Explorer. Public OSM walking routes and forest habitat disks are checked against measured buildings, mapped water, boundaries and exported street-furniture footprints. Ducks stay within mapped water. These are not actual residents, pedestrian counts or wildlife sightings.",
};
writeFileSync(new URL("manifest.json", directory), JSON.stringify(catalog));
console.log(JSON.stringify({ people: people.length, animals: animals.map((a) => ({ id: a.id, home: a.home, radius: a.radius })), routes: population.routes.length, bridges: population.routes.filter((r) => r.bridge).length, bytes: [...people, ...animals].reduce((n, p) => n + p.bytes, 0), planning: population.planningStats }));
