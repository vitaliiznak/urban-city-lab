import type { BuildingCollider, BuildingRecord, HouseNumber, ResolvedAddress, WallHint } from "./types";

const WORLD_SCALE = 0.45;

function validRing(ring: number[][]) {
  return Array.isArray(ring) && ring.length >= 3 && ring.every((p) => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite));
}

export function pointInPolygon(x: number, z: number, ring: number[][]) {
  if (!validRing(ring)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    const ax = a[0], az = a[1], bx = b[0], bz = b[1];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

function edgeDistance(x: number, z: number, ring: number[][]) {
  if (!validRing(ring)) return Infinity;
  let nearest = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const span = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / span));
    nearest = Math.min(nearest, Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz)));
  }
  return nearest;
}

function inHoles(x: number, z: number, collider: BuildingCollider) {
  return (collider.holes || []).some((hole) => pointInPolygon(x, z, hole));
}

export function onBuildingFootprint(x: number, z: number, collider: BuildingCollider, pad = 0.16) {
  if (inHoles(x, z, collider)) return false;
  if (pointInPolygon(x, z, collider.p)) return true;
  return edgeDistance(x, z, collider.p) <= pad;
}

function contains(x: number, z: number, collider: BuildingCollider) {
  return onBuildingFootprint(x, z, collider, 0);
}

export function colliderAtPoint(colliders: BuildingCollider[], x: number, z: number, pad = 0.45) {
  const inside = colliders.find((collider) => onBuildingFootprint(x, z, collider, pad));
  if (inside) return inside;
  let best: BuildingCollider | undefined;
  let bestDistance = Infinity;
  for (const collider of colliders) {
    const distance = Math.hypot(collider.x - x, collider.z - z);
    if (distance < bestDistance) {
      best = collider;
      bestDistance = distance;
    }
  }
  if (best && bestDistance < Math.max(best.w, best.d) / 2 + 3) return best;
  return undefined;
}

export function houseAtPoint(houses: HouseNumber[], colliders: BuildingCollider[], x: number, z: number) {
  const collider = colliderAtPoint(colliders, x, z);
  const reach = collider ? Math.max(collider.w, collider.d) / 2 + 6 : 12;
  const pool = collider
    ? houses.filter((house) => onBuildingFootprint(house.x, house.z, collider, 3) || Math.hypot(house.x - collider.x, house.z - collider.z) < reach)
    : houses;
  const ranked = pool
    .map((house) => ({ house, distance: Math.hypot(house.x - x, house.z - z) }))
    .sort((a, b) => a.distance - b.distance);
  const hit = ranked.find((row) => row.distance < (collider ? reach : 12));
  return hit?.house;
}

export function matchBuilding(
  address: ResolvedAddress,
  colliders: BuildingCollider[],
  buildings: BuildingRecord[],
) {
  const inside = colliders.find((collider) => contains(address.x, address.z, collider));
  const nearby = colliders
    .map((collider) => ({ collider, distance: Math.hypot(collider.x - address.x, collider.z - address.z) }))
    .sort((a, b) => a.distance - b.distance);
  const hit = inside ?? (nearby[0] && nearby[0].distance < Math.max(nearby[0].collider.w, nearby[0].collider.d) / 2 + 5
    ? nearby[0].collider
    : undefined);
  if (!hit) throw new Error("No measured building sits at that address.");
  const building = buildings.find((item) => item.id === hit.buildingId);
  if (!building) throw new Error("The measured building record is missing.");
  return { building, collider: hit };
}

export function wallHint(building: BuildingRecord, heading: number, collider?: BuildingCollider): WallHint {
  const nx = Math.sin(heading), nz = Math.cos(heading);
  const tx = nz, tz = -nx;
  const [minX, minY, minZ] = building.min;
  const [maxX, maxY, maxZ] = building.max;
  const ring = collider?.p?.length ? collider.p : [[minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ]];
  const plane = Math.max(...ring.map(([x, z]) => nx * x + nz * z));
  const face = ring.filter(([x, z]) => Math.abs(nx * x + nz * z - plane) < 0.45);
  const us = (face.length >= 2 ? face : ring).map(([x, z]) => tx * x + tz * z);
  const widthWorld = Math.max(...us) - Math.min(...us);
  const baseY = collider && Number.isFinite(collider.baseY) ? Math.max(minY, collider.baseY - 0.15) : minY;
  const heightWorld = maxY - baseY;
  const footprintW = collider && Number.isFinite(collider.w) ? collider.w : widthWorld;
  const footprintD = collider && Number.isFinite(collider.d) ? collider.d : widthWorld;
  const depthWorld = Math.abs(footprintW - widthWorld) < Math.abs(footprintD - widthWorld) ? footprintD : footprintW;
  return {
    widthMetres: Number((widthWorld / WORLD_SCALE).toFixed(2)),
    heightMetres: Number((heightWorld / WORLD_SCALE).toFixed(2)),
    depthMetres: Number((depthWorld / WORLD_SCALE).toFixed(2)),
    storeys: Math.max(1, Math.round(heightWorld / WORLD_SCALE / 3.2)),
  };
}
