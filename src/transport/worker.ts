import { preparePatterns, vehiclesAt } from "./vendor/buses-data.js";
import { terrainHeight, type Terrain } from "./terrain";
import { selectVehicles } from "./selection";
import type { TransitRequest, TransitResponse, TransportManifest, Vehicle } from "./types";

const load = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw Error("Transport data unavailable");
  return response.json();
};
const data = Promise.all([load("/transport/manifest.json"), load("/transport/terrain.json")])
  .then(([manifest, terrain]: [TransportManifest, Terrain]) => ({
    manifest, terrain,
    bus: preparePatterns(manifest.catalogs.bus), rail: preparePatterns(manifest.catalogs.rail),
  }));
// Attach a handler immediately; failures are returned to the main thread on request.
void data.catch(() => {});
self.onmessage = async ({ data: request }: MessageEvent<TransitRequest>) => {
  try {
    const { manifest, terrain, bus, rail } = await data;
    const vehicles: Vehicle[] = [];
    for (const [kind, patterns] of [["bus", bus], ["rail", rail]] as const) {
      for (const pose of vehiclesAt(patterns, request.seconds)) {
        if (Math.hypot(pose.x - request.x, pose.z - request.z) > 160) continue;
        const model = manifest.models[`${kind}|${pose.ref}|${pose.headsign}|${pose.agencyId}`];
        if (!model) continue;
        const wheelbase = kind === "bus" ? 2.65 : 8.4;
        const dx = Math.sin(pose.angle) * wheelbase / 2, dz = Math.cos(pose.angle) * wheelbase / 2;
        const front = terrainHeight(terrain, pose.x + dx, pose.z + dz);
        const rear = terrainHeight(terrain, pose.x - dx, pose.z - dz);
        vehicles.push({ ...pose, id: `${kind}:${pose.id}`, kind, file: model.file, height: (front + rear) / 2 + (kind === "rail" ? .17 : 0),
          pitch: -Math.atan2((front - rear) * .45, wheelbase) });
      }
    }
    self.postMessage({ vehicles: selectVehicles(vehicles, request.x, request.z), sequence: request.sequence, seconds: request.seconds } satisfies TransitResponse);
  } catch {
    self.postMessage({ vehicles: [], sequence: request.sequence, seconds: request.seconds, error: "Transport unavailable" } satisfies TransitResponse);
  }
};
