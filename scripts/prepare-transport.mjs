import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { installCanvas } from "./lib/export-scene.mjs";
import { GLTFExporter } from "../../adliswil-explorer/outputs/adliswil/node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import { makeBus } from "../../adliswil-explorer/outputs/adliswil/src/bus-model.js";
import { makeTrain } from "../../adliswil-explorer/outputs/adliswil/src/train-model.js";
import { validateBusLayer, validateRailLayer } from "../../adliswil-explorer/outputs/adliswil/src/buses-data.js";

installCanvas();
const source = new URL("../../adliswil-explorer/outputs/adliswil/src/", import.meta.url);
const output = new URL("../public/transport/", import.meta.url);
mkdirSync(output, { recursive: true });
const hashes = {};
for (const file of ["buses-data.js", "bus-route.js", "bus-motion.js"]) {
  const bytes = readFileSync(new URL(file, source));
  writeFileSync(new URL(`../src/transport/vendor/${file}`, import.meta.url), bytes);
  hashes[file] = createHash("sha256").update(bytes).digest("hex");
}
const catalogs = {};
const models = {};
for (const [kind, validate, make] of [["bus", validateBusLayer, makeBus], ["rail", validateRailLayer, makeTrain]]) {
  const data = validate(JSON.parse(readFileSync(new URL(`data/${kind}-layer.json`, source), "utf8")));
  catalogs[kind] = data;
  for (const pattern of data.patterns) {
    const key = `${kind}|${pattern.ref}|${pattern.headsign}|${pattern.agencyId}`;
    if (models[key]) continue;
    const file = `${kind}-${createHash("sha256").update(key).digest("hex").slice(0, 12)}.glb`;
    const mesh = make(pattern);
    const bytes = await new GLTFExporter().parseAsync(mesh, { binary: true, maxTextureSize: 1024 });
    writeFileSync(new URL(file, output), Buffer.from(bytes));
    models[key] = { file, bytes: bytes.byteLength };
  }
}
copyFileSync(new URL("data/terrain.json", source), new URL("terrain.json", output));
writeFileSync(new URL("manifest.json", output), JSON.stringify({
  version: 1, scale: .45, heightOrigin: 440, catalogs, models, vendorHashes: hashes,
  note: "Saved 2026-09-08 Swiss weekday timetable and OSM routes. Vehicle shapes, liveries and intermediate movement are illustrative, not live traffic or fleet assignments.",
}));
console.log(`Exported ${Object.keys(models).length} vehicle models, ${Object.values(models).reduce((n, m) => n + m.bytes, 0)} bytes; ${catalogs.bus.patterns.length} bus and ${catalogs.rail.patterns.length} S4 route patterns.`);
