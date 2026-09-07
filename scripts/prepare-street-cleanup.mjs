import { readFileSync, writeFileSync } from "node:fs";
import { deriveParking, deriveCrossings } from "./lib/cleanup-geography.mjs";
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const parking = read("../../adliswil-explorer/work/geography/expansion/osm-street-props.json");
const roads = read("../../adliswil-explorer/work/geography/expansion/osm-merged.json");
const geography = read("../../adliswil-explorer/outputs/adliswil/src/data/adliswil.json");
const result = {
  source: {
    parking: "adliswil-explorer/work/geography/expansion/osm-street-props.json",
    parkingSnapshot: parking.osm3s.timestamp_osm_base,
    crossings: "adliswil-explorer/work/geography/expansion/osm-merged.json",
    attribution: "© OpenStreetMap contributors · ODbL 1.0",
    url: "https://www.openstreetmap.org/copyright",
  },
  note: "Generated surfaces hide aerial vehicles inside mapped footprints; this is not vehicle detection or inpainting. Unmapped vehicles remain. Parking material defaults to asphalt; marking widths default to 3 m. Only closed surface parking ways and explicitly marked crossings are included. Relations are omitted to avoid filling islands without reliable inner rings.",
  pavedPaths: geography.roads.filter((r) => ["asphalt", "concrete", "paved", "paving_stones", "sett", "cobblestone"].includes(r.tags.surface)).map((r) => ({ id: r.id, surface: r.tags.surface })),
  parking: deriveParking(parking.elements),
  crossings: deriveCrossings(roads.elements),
};
writeFileSync(new URL("../src/data/street-cleanup.json", import.meta.url), JSON.stringify(result));
console.log(`Prepared ${result.parking.length} parking surfaces and ${result.crossings.length} marked crossings.`);
