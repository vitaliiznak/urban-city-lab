import type { Vehicle } from "./types";
export function selectVehicles(vehicles: Vehicle[], x: number, z: number) {
  const selected: Vehicle[] = [];
  for (const vehicle of [...vehicles].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))) {
    // The saved catalog includes service variants with identical local calls.
    // Do not draw duplicate bodies on the same track/road at the same instant.
    const duplicate = selected.some((other) => other.kind === vehicle.kind &&
      Math.hypot(other.x - vehicle.x, other.z - vehicle.z) < .5 && Math.cos(other.angle - vehicle.angle) > .99);
    if (!duplicate) selected.push(vehicle);
    if (selected.length === 12) break;
  }
  return selected;
}
