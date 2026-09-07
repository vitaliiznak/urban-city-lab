import type { BuildingCollider, FacadeDescription, StreetWall } from "./types";
import { onBuildingFootprint } from "./match-building";
import type { MeshLike } from "./extract-wall";

type ChannelAttr = {
  count: number;
  itemSize?: number;
  array: ArrayLike<number> & { [index: number]: number };
  needsUpdate?: boolean;
};

export type PaintableMesh = MeshLike & {
  geometry: MeshLike["geometry"] & {
    attributes: MeshLike["geometry"]["attributes"] & {
      color?: ChannelAttr;
      facade?: ChannelAttr;
    };
  };
};

export type WallPaintEdit = {
  mesh: PaintableMesh;
  vertices: { index: number; color: [number, number, number]; facadeW: number }[];
};

type PaintBands = {
  wallRgb: [number, number, number];
  baseRgb: [number, number, number];
  roofRgb: [number, number, number];
  baseTop: number;
  eaves: number;
};

function hexRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function setRgb(array: ChannelAttr["array"], index: number, rgb: [number, number, number]) {
  array[index * 3] = rgb[0];
  array[index * 3 + 1] = rgb[1];
  array[index * 3 + 2] = rgb[2];
}

function bandsFor(description: FacadeDescription, y0: number, y1: number): PaintBands {
  const height = Math.max(0.4, y1 - y0);
  return {
    wallRgb: hexRgb(description.wallColor),
    baseRgb: hexRgb(description.baseColor),
    roofRgb: hexRgb(description.roofColor),
    baseTop: y0 + height * description.baseHeight,
    eaves: y0 + height * (description.gable ? 0.78 : 0.96),
  };
}

function colorFor(y: number, ny: number, bands: PaintBands): [number, number, number] {
  if (Math.abs(ny) > 0.42) return bands.roofRgb;
  if (y < bands.baseTop - 0.02) return bands.baseRgb;
  return bands.wallRgb;
}

function faceCorner(mesh: PaintableMesh, face: number, corner: number) {
  const index = mesh.geometry.index;
  return index ? index.getX(face * 3 + corner) : face * 3 + corner;
}

function paintVertex(
  mesh: PaintableMesh,
  index: number,
  bands: PaintBands,
  y: number,
  ny: number,
  seen: Set<number>,
  vertices: WallPaintEdit["vertices"],
  mute: boolean,
) {
  const color = mesh.geometry.attributes.color;
  const facade = mesh.geometry.attributes.facade;
  if (!seen.has(index)) {
    seen.add(index);
    vertices.push({
      index,
      color: color
        ? [Number(color.array[index * 3]), Number(color.array[index * 3 + 1]), Number(color.array[index * 3 + 2])]
        : [0, 0, 0],
      facadeW: facade ? Number(facade.array[index * 4 + 3] ?? 0) : 0,
    });
  }
  if (color) setRgb(color.array, index, colorFor(y, ny, bands));
  if (facade && mute) facade.array[index * 4 + 3] = 0;
}

function paintMesh(
  mesh: PaintableMesh,
  collider: BuildingCollider,
  bands: PaintBands,
  accept: (sample: { x: number; y: number; z: number; nx: number; ny: number; nz: number }) => boolean,
): WallPaintEdit | null {
  const position = mesh.geometry.attributes.position;
  const normal = mesh.geometry.attributes.normal;
  const color = mesh.geometry.attributes.color;
  const facade = mesh.geometry.attributes.facade;
  if (!color && !facade) return null;
  const index = mesh.geometry.index;
  const faceCount = index ? index.count / 3 : Math.floor(position.count / 3);
  const vertices: WallPaintEdit["vertices"] = [];
  const seen = new Set<number>();

  if (faceCount >= 1) {
    for (let face = 0; face < faceCount; face++) {
      const ia = faceCorner(mesh, face, 0);
      const ib = faceCorner(mesh, face, 1);
      const ic = faceCorner(mesh, face, 2);
      const ax = position.getX(ia), ay = position.getY(ia), az = position.getZ(ia);
      const bx = position.getX(ib), by = position.getY(ib), bz = position.getZ(ib);
      const cx = position.getX(ic), cy = position.getY(ic), cz = position.getZ(ic);
      const x = (ax + bx + cx) / 3, y = (ay + by + cy) / 3, z = (az + bz + cz) / 3;
      if (!onBuildingFootprint(x, z, collider, 0.18)) continue;
      let nx: number, ny: number, nz: number;
      if (normal) {
        nx = (normal.getX(ia) + normal.getX(ib) + normal.getX(ic)) / 3;
        ny = (normal.getY(ia) + normal.getY(ib) + normal.getY(ic)) / 3;
        nz = (normal.getZ(ia) + normal.getZ(ib) + normal.getZ(ic)) / 3;
      } else {
        nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      if (!accept({ x, y, z, nx, ny, nz })) continue;
      const mute = Math.abs(ny) < 0.62;
      paintVertex(mesh, ia, bands, ay, normal ? normal.getY(ia) : ny, seen, vertices, mute);
      paintVertex(mesh, ib, bands, by, normal ? normal.getY(ib) : ny, seen, vertices, mute);
      paintVertex(mesh, ic, bands, cy, normal ? normal.getY(ic) : ny, seen, vertices, mute);
    }
  } else {
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      if (!onBuildingFootprint(x, z, collider, 0.18)) continue;
      const nx = normal ? normal.getX(i) : 0;
      const ny = normal ? normal.getY(i) : 0;
      const nz = normal ? normal.getZ(i) : 0;
      if (!accept({ x, y, z, nx, ny, nz })) continue;
      paintVertex(mesh, i, bands, y, ny, seen, vertices, Math.abs(ny) < 0.62);
    }
  }

  if (!vertices.length) return null;
  if (color) color.needsUpdate = true;
  if (facade) facade.needsUpdate = true;
  return { mesh, vertices };
}

function meshChunks(collider: BuildingCollider, walls: StreetWall[]) {
  return new Set([collider.ownerChunk, ...(collider.overlapChunks || []), ...walls.map((wall) => wall.chunk)]);
}

export function paintBuilding(
  meshes: PaintableMesh[],
  collider: BuildingCollider,
  description: FacadeDescription,
  walls: StreetWall[],
): WallPaintEdit[] {
  const sample = walls[0];
  const y0 = sample ? sample.visibleBase : collider.baseY;
  const y1 = sample ? sample.yMax : collider.baseY + collider.height;
  const bands = bandsFor(description, y0, y1);
  const chunks = meshChunks(collider, walls);
  const edits: WallPaintEdit[] = [];
  for (const mesh of meshes) {
    if (!chunks.has(mesh.name)) continue;
    const edit = paintMesh(mesh, collider, bands, () => true);
    if (edit) edits.push(edit);
  }
  return edits;
}

export function paintStreetWall(
  meshes: PaintableMesh[],
  wall: StreetWall,
  collider: BuildingCollider,
  description: FacadeDescription,
): WallPaintEdit[] {
  const bands = bandsFor(description, wall.visibleBase, wall.yMax);
  const chunks = new Set([wall.chunk, collider.ownerChunk, ...(collider.overlapChunks || [])]);
  const edits: WallPaintEdit[] = [];
  for (const mesh of meshes) {
    if (!chunks.has(mesh.name)) continue;
    const edit = paintMesh(mesh, collider, bands, (sample) => {
      if (Math.abs(sample.ny) > 0.22) return false;
      const len = Math.hypot(sample.nx, sample.nz) || 1;
      if ((sample.nx / len) * wall.normal[0] + (sample.nz / len) * wall.normal[2] < 0.28) return false;
      return Math.abs((sample.nx / len) * sample.x + (sample.nz / len) * sample.z - wall.plane) <= 0.08;
    });
    if (edit) edits.push(edit);
  }
  return edits;
}

export function restoreStreetWall(edits: WallPaintEdit[]) {
  for (const edit of [...edits].reverse()) {
    const color = edit.mesh.geometry.attributes.color;
    const facade = edit.mesh.geometry.attributes.facade;
    for (const vertex of edit.vertices) {
      if (color) setRgb(color.array, vertex.index, vertex.color);
      if (facade) facade.array[vertex.index * 4 + 3] = vertex.facadeW;
    }
    if (color) color.needsUpdate = true;
    if (facade) facade.needsUpdate = true;
  }
}

export function facadeBands(wall: StreetWall, description: FacadeDescription) {
  const height = Math.max(0.4, wall.yMax - wall.visibleBase);
  const eaves = wall.visibleBase + height * (description.gable ? 0.78 : 0.97);
  const baseTop = wall.visibleBase + Math.max(0, description.baseHeight) * height;
  return { height, eaves, baseTop, peak: wall.yMax };
}

export function wallSkinPoints(wall: StreetWall, y0: number, y1: number, offset = 0.03, u0 = wall.uMin, u1 = wall.uMax) {
  const nx = wall.normal[0], nz = wall.normal[2];
  const tx = nz, tz = -nx;
  const point = (u: number, y: number): [number, number, number] => [
    tx * u + nx * (wall.plane + offset), y, tz * u + nz * (wall.plane + offset),
  ];
  const a = point(u0, y0);
  const b = point(u1, y0);
  const c = point(u1, y1);
  const d = point(u0, y1);
  return [...a, ...b, ...c, ...a, ...c, ...d];
}

export function gableSkinPoints(wall: StreetWall, y0: number, offset = 0.03) {
  const nx = wall.normal[0], nz = wall.normal[2];
  const tx = nz, tz = -nx;
  const point = (u: number, y: number): [number, number, number] => [
    tx * u + nx * (wall.plane + offset), y, tz * u + nz * (wall.plane + offset),
  ];
  const mid = (wall.uMin + wall.uMax) / 2;
  const eaves = y0;
  const a = point(wall.uMin, eaves);
  const b = point(wall.uMax, eaves);
  const peak = point(mid, wall.yMax);
  return [...a, ...b, ...peak];
}

export function facadePaintPoints(wall: StreetWall, description: FacadeDescription) {
  if (wall.source === "mesh" && wall.points.length >= 9) return wall.points;
  const nx = wall.normal[0], nz = wall.normal[2];
  const tx = nz, tz = -nx;
  const point = (u: number, y: number): [number, number, number] => [
    tx * u + nx * wall.plane, y, tz * u + nz * wall.plane,
  ];
  const a = point(wall.uMin, wall.visibleBase);
  const b = point(wall.uMax, wall.visibleBase);
  if (!description.gable) {
    const c = point(wall.uMax, wall.yMax);
    const d = point(wall.uMin, wall.yMax);
    return [...a, ...b, ...c, ...a, ...c, ...d];
  }
  const height = Math.max(0.4, wall.yMax - wall.visibleBase);
  const eavesY = wall.visibleBase + height * 0.78;
  const peak = point((wall.uMin + wall.uMax) / 2, wall.yMax);
  const right = point(wall.uMax, eavesY);
  const left = point(wall.uMin, eavesY);
  return [...a, ...b, ...right, ...a, ...right, ...peak, ...a, ...peak, ...left];
}
