import type { BuildingCollider, BuildingRecord, StreetWall } from "./types";
import { onBuildingFootprint } from "./match-building";

type Attr = {
  count: number;
  getX: (i: number) => number;
  getY: (i: number) => number;
  getZ: (i: number) => number;
};

export type MeshLike = {
  name: string;
  geometry: {
    attributes: { position: Attr; normal?: Attr };
    index: { count: number; getX: (i: number) => number } | null;
  };
};

function unit(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function containsPoint(x: number, z: number, collider: BuildingCollider) {
  return onBuildingFootprint(x, z, collider, 0.28);
}

function wallFromEdge(
  building: BuildingRecord,
  collider: BuildingCollider,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  id: string,
): StreetWall | null {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1.15) return null;
  let nx = dz / len, nz = -dx / len;
  const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
  if (nx * (midX - collider.x) + nz * (midZ - collider.z) < 0) {
    nx = -nx;
    nz = -nz;
  }
  const plane = nx * midX + nz * midZ;
  const tx = nz, tz = -nx;
  const u0 = tx * ax + tz * az, u1 = tx * bx + tz * bz;
  const uMin = Math.min(u0, u1), uMax = Math.max(u0, u1);
  const y0 = Math.max(building.min[1], collider.baseY);
  const y1 = building.max[1];
  const point = (u: number, y: number): [number, number, number] => [
    tx * u + nx * plane, y, tz * u + nz * plane,
  ];
  const a = point(uMin, y0), b = point(uMax, y0), c = point(uMax, y1), d = point(uMin, y1);
  return {
    id,
    buildingId: building.id,
    chunk: building.ownerChunk,
    normal: [nx, 0, nz],
    plane,
    uMin,
    uMax,
    yMin: y0,
    yMax: y1,
    visibleBase: y0,
    points: [...a, ...b, ...c, ...a, ...c, ...d],
    source: "bounds",
  };
}

export function wallsFromCollider(building: BuildingRecord, collider: BuildingCollider): StreetWall[] {
  // Survey footprints contain collinear sampling vertices, not separate façades.
  const ring = collider.p.filter((point, i, all) => {
    const before = all[(i + all.length - 1) % all.length];
    return Math.hypot(point[0] - before[0], point[1] - before[1]) > 0.0001;
  });
  let changed = true;
  while (changed && ring.length > 3) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
      const dx = c[0] - a[0], dz = c[1] - a[1];
      const length = Math.hypot(dx, dz);
      const t = ((b[0] - a[0]) * dx + (b[1] - a[1]) * dz) / (length * length);
      const deviation = Math.abs(dx * (b[1] - a[1]) - dz * (b[0] - a[0])) / length;
      if (t > 0 && t < 1 && deviation < 0.01) {
        ring.splice(i, 1); changed = true; break;
      }
    }
  }
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const walls: StreetWall[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (!a || !b || a.length < 2 || b.length < 2) continue;
    const wall = wallFromEdge(building, collider, a[0], a[1], b[0], b[1], `wall-${walls.length}`);
    if (wall) walls.push(wall);
  }
  return walls;
}

function boundsWall(building: BuildingRecord, heading: number, collider?: BuildingCollider): StreetWall {
  const walls = collider ? wallsFromCollider(building, collider) : [];
  if (walls.length) return pickStreetWall(walls, heading);
  const nx = Math.sin(heading), nz = Math.cos(heading);
  const tx = nz, tz = -nx;
  const [minX, minY, minZ] = building.min;
  const [maxX, maxY, maxZ] = building.max;
  const corners: [number, number][] = [
    [minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ],
  ];
  const plane = Math.max(...corners.map(([x, z]) => nx * x + nz * z));
  const onPlane = corners.filter(([x, z]) => Math.abs(nx * x + nz * z - plane) < 0.08);
  const us = (onPlane.length >= 2 ? onPlane : corners).map(([x, z]) => tx * x + tz * z);
  const uMin = Math.min(...us), uMax = Math.max(...us);
  const y0 = collider ? Math.max(minY, collider.baseY) : minY, y1 = maxY;
  const point = (u: number, y: number): [number, number, number] => [
    tx * u + nx * plane, y, tz * u + nz * plane,
  ];
  const a = point(uMin, y0), b = point(uMax, y0), c = point(uMax, y1), d = point(uMin, y1);
  return {
    id: "street",
    buildingId: building.id,
    chunk: building.ownerChunk,
    normal: [nx, 0, nz],
    plane,
    uMin, uMax,
    yMin: y0, yMax: y1,
    visibleBase: y0,
    points: [...a, ...b, ...c, ...a, ...c, ...d],
    source: "bounds",
  };
}

export function alignWallsToStreet(walls: StreetWall[], streetY?: number) {
  if (streetY == null || !Number.isFinite(streetY)) return walls;
  return walls.map((wall) => {
    if (streetY > wall.visibleBase + 0.12) return { ...wall, visibleBase: streetY };
    if (streetY < wall.visibleBase - 0.12) {
      return { ...wall, visibleBase: streetY, yMin: Math.min(wall.yMin, streetY) };
    }
    return wall;
  });
}

export function pickStreetWall(walls: StreetWall[], heading: number) {
  const hx = Math.sin(heading), hz = Math.cos(heading);
  return [...walls].sort((a, b) => (
    b.normal[0] * hx + b.normal[2] * hz
  ) - (a.normal[0] * hx + a.normal[2] * hz))[0];
}

export function extractMeasuredWalls(
  meshes: MeshLike[],
  building: BuildingRecord,
  collider: BuildingCollider,
  heading: number,
  target?: StreetWall,
): StreetWall[] {
  const hx = Math.sin(heading), hz = Math.cos(heading);
  const chunks = new Set([building.ownerChunk, ...(building.overlapChunks || [])]);
  const clusters = new Map<string, { nx: number; nz: number; plane: number; uMin: number; uMax: number; yMin: number; yMax: number; area: number; points: number[] }>();
  for (const mesh of meshes) {
    if (!chunks.has(mesh.name)) continue;
    const position = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const faceCount = index ? index.count / 3 : position.count / 3;
    for (let face = 0; face < faceCount; face++) {
      const ia = index ? index.getX(face * 3) : face * 3;
      const ib = index ? index.getX(face * 3 + 1) : face * 3 + 1;
      const ic = index ? index.getX(face * 3 + 2) : face * 3 + 2;
      const ax = position.getX(ia), ay = position.getY(ia), az = position.getZ(ia);
      const bx = position.getX(ib), by = position.getY(ib), bz = position.getZ(ib);
      const cx = position.getX(ic), cy = position.getY(ic), cz = position.getZ(ic);
      const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
      if (!containsPoint(mx, mz, collider)) continue;
      if (target) {
        const u = target.normal[2] * mx - target.normal[0] * mz;
        const distance = target.normal[0] * mx + target.normal[2] * mz - target.plane;
        if (Math.abs(distance) > 0.12 || u < target.uMin - 0.05 || u > target.uMax + 0.05) continue;
      }
      const [nx, ny, nz] = unit(
        (by - ay) * (cz - az) - (bz - az) * (cy - ay),
        (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
        (bx - ax) * (cy - ay) - (by - ay) * (cx - ax),
      );
      if (Math.abs(ny) > 0.22) continue;
      const [hxn, , hzn] = unit(nx, 0, nz);
      if (hxn * hx + hzn * hz < 0.28) continue;
      const plane = hxn * mx + hzn * mz;
      const tx = hzn, tz = -hxn;
      const us = [ax, bx, cx].map((_, i) => tx * [ax, bx, cx][i] + tz * [az, bz, cz][i]);
      const ys = [ay, by, cy];
      const area = Math.hypot(
        (bx - ax) * (cy - ay) - (by - ay) * (cx - ax),
        (by - ay) * (cz - az) - (bz - az) * (cy - ay),
        (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
      ) / 2;
      const key = `${Math.round(hxn * 20)}_${Math.round(hzn * 20)}_${Math.round(plane * 4)}`;
      const cluster = clusters.get(key);
      const pts = [ax, ay, az, bx, by, bz, cx, cy, cz];
      if (!cluster) {
        clusters.set(key, {
          nx: hxn, nz: hzn, plane,
          uMin: Math.min(...us), uMax: Math.max(...us),
          yMin: Math.min(...ys), yMax: Math.max(...ys),
          area, points: pts,
        });
      } else {
        cluster.uMin = Math.min(cluster.uMin, ...us);
        cluster.uMax = Math.max(cluster.uMax, ...us);
        cluster.yMin = Math.min(cluster.yMin, ...ys);
        cluster.yMax = Math.max(cluster.yMax, ...ys);
        cluster.area += area;
        cluster.points.push(...pts);
      }
    }
  }
  return [...clusters.values()].filter(wall => wall.area > 0.08).sort((a,b) => b.area-a.area).map((wall,i) => ({
    id: `surface-${i}`, buildingId: building.id, chunk: building.ownerChunk,
    normal: [wall.nx, 0, wall.nz], plane: wall.plane,
    uMin: wall.uMin, uMax: wall.uMax, yMin: wall.yMin, yMax: wall.yMax,
    visibleBase: Math.max(wall.yMin, collider.baseY - 0.15), points: wall.points, source: "mesh",
  }));
}

export function extractStreetWall(meshes: MeshLike[], building: BuildingRecord, collider: BuildingCollider, heading: number, target?: StreetWall): StreetWall {
  return extractMeasuredWalls(meshes, building, collider, heading, target)[0] ?? target ?? boundsWall(building, heading, collider);
}

export function extractBuildingWalls(
  meshes: MeshLike[],
  building: BuildingRecord,
  collider: BuildingCollider,
  heading: number,
): StreetWall[] {
  const sides = wallsFromCollider(building, collider);
  if (!sides.length) return [extractStreetWall(meshes, building, collider, heading)];
  return sides.map((wall) => {
    const measured = extractStreetWall(meshes, building, collider, Math.atan2(wall.normal[0], wall.normal[2]), wall);
    return { ...measured, id: wall.id };
  });
}
