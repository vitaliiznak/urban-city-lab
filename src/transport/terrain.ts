export type Terrain = { cols: number; rows: number; bounds: { minX: number; maxX: number; minZ: number; maxZ: number }; heights: number[] };
export function terrainHeight(terrain: Terrain, x: number, z: number) {
  const b = terrain.bounds;
  const u = Math.max(0, Math.min(terrain.cols - 1, (x - b.minX) / (b.maxX - b.minX) * (terrain.cols - 1)));
  const v = Math.max(0, Math.min(terrain.rows - 1, (z - b.minZ) / (b.maxZ - b.minZ) * (terrain.rows - 1)));
  const ix = Math.min(terrain.cols - 2, Math.floor(u)), iz = Math.min(terrain.rows - 2, Math.floor(v));
  const at = (xx: number, zz: number) => terrain.heights[zz * terrain.cols + xx];
  const a = at(ix, iz) * (1 - u + ix) + at(ix + 1, iz) * (u - ix);
  const c = at(ix, iz + 1) * (1 - u + ix) + at(ix + 1, iz + 1) * (u - ix);
  return a * (1 - v + iz) + c * (v - iz);
}
