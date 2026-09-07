import type { BuildingCollider, FacadeUndercroft, StreetWall } from "./types";
import { onBuildingFootprint } from "./match-building";
import { undercroftBounds } from "./undercroft";

type PositionAttr = {
  count: number;
  getX: (i: number) => number;
  getY: (i: number) => number;
  getZ: (i: number) => number;
  setXYZ?: (i: number, x: number, y: number, z: number) => void;
  array?: { [index: number]: number };
  needsUpdate?: boolean;
};

export type ShapeMesh = {
  name: string;
  geometry: {
    attributes: { position: PositionAttr; normal?: { getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } };
    computeVertexNormals?: () => void;
  };
};

export type ShapeEdit = {
  mesh: ShapeMesh;
  vertices: { index: number; x: number; y: number; z: number }[];
};

function containsPoint(x: number, z: number, collider: BuildingCollider) {
  return onBuildingFootprint(x, z, collider, 0.16);
}

function writeVertex(position: PositionAttr, index: number, x: number, y: number, z: number) {
  if (position.setXYZ) {
    position.setXYZ(index, x, y, z);
    return;
  }
  if (position.array) {
    position.array[index * 3] = x;
    position.array[index * 3 + 1] = y;
    position.array[index * 3 + 2] = z;
  }
}

export function restoreBuildingShape(edits: ShapeEdit[]) {
  for (const edit of edits) {
    const position = edit.mesh.geometry.attributes.position;
    for (const vertex of edit.vertices) writeVertex(position, vertex.index, vertex.x, vertex.y, vertex.z);
    position.needsUpdate = true;
    edit.mesh.geometry.computeVertexNormals?.();
  }
}

export function carveUndercroft(
  meshes: ShapeMesh[],
  wall: StreetWall,
  collider: BuildingCollider,
  undercroft: FacadeUndercroft,
): ShapeEdit[] {
  const { u0, u1, y0, y1, inset } = undercroftBounds(wall, undercroft, collider);
  const nx = wall.normal[0], nz = wall.normal[2];
  const tx = nz, tz = -nx;
  const chunks = new Set([wall.chunk, collider.ownerChunk, ...(collider.overlapChunks || [])]);
  const candidates: { mesh: ShapeMesh; index: number; x: number; y: number; z: number }[] = [];

  for (const mesh of meshes) {
    if (!chunks.has(mesh.name)) continue;
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      if (!containsPoint(x, z, collider)) continue;
      const u = tx * x + tz * z;
      if (u < u0 - 0.08 || u > u1 + 0.08 || y < y0 || y > y1) continue;
      const plane = nx * x + nz * z;
      if (plane < wall.plane - inset - 0.12 || plane > wall.plane + 0.22) continue;
      candidates.push({ mesh, index: i, x, y, z });
    }
  }

  if (candidates.length < 10) return [];

  const grouped = new Map<ShapeMesh, ShapeEdit>();
  for (const vertex of candidates) {
    const position = vertex.mesh.geometry.attributes.position;
    const plane = nx * vertex.x + nz * vertex.z;
    const target = wall.plane - inset;
    const delta = target - plane;
    writeVertex(position, vertex.index, vertex.x + nx * delta, vertex.y, vertex.z + nz * delta);
    const edit = grouped.get(vertex.mesh) ?? { mesh: vertex.mesh, vertices: [] };
    edit.vertices.push({ index: vertex.index, x: vertex.x, y: vertex.y, z: vertex.z });
    grouped.set(vertex.mesh, edit);
  }
  for (const edit of grouped.values()) {
    edit.mesh.geometry.attributes.position.needsUpdate = true;
    edit.mesh.geometry.computeVertexNormals?.();
  }
  return [...grouped.values()];
}
