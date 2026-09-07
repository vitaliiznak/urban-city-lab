import { PedestrianMotion, type PopulationCatalog } from "./motion";
import { terrainHeight, type Terrain } from "../transport/terrain";
import { WildlifeMotion, type Animal } from "./wildlife";
const read = async (url: string) => { const r = await fetch(url); if (!r.ok) throw Error("Population unavailable"); return r.json(); };
const load = Promise.all([read("/population/manifest.json"), read("/transport/terrain.json")])
  .then(([catalog, terrain]: [PopulationCatalog & { animals: Animal[] }, Terrain]) => ({ motion: new PedestrianMotion(catalog), wildlife: new WildlifeMotion(catalog.animals || []), terrain }));
void load.catch(() => {});
let previous: number | undefined;
self.onmessage = async ({ data }: MessageEvent<{ time: number; x: number; z: number }>) => {
  try {
    const { motion, wildlife, terrain } = await load;
    const dt = previous === undefined ? 0 : data.time - previous;
    const poses = motion.step(dt, data), animals = wildlife.step(dt, data, (id) => motion.getPose(id));
    previous = data.time;
    self.postMessage({ people: poses.map((p) => ({ ...p, height: terrainHeight(terrain, p.x, p.z) })), animals: animals.map((p) => ({ ...p, height: terrainHeight(terrain, p.x, p.z) })) });
  } catch { self.postMessage({ people: [], error: "Population unavailable" }); }
};
