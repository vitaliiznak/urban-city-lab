export const ORIGIN_LON = 8.525;
export const ORIGIN_LAT = 47.3115;
export const METRES_PER_LON = 75476.3124707444;
export const METRES_PER_LAT = 111320;
export const WORLD_SCALE = 0.45;

export function toWorld(lon: number, lat: number) {
  return {
    x: (lon - ORIGIN_LON) * METRES_PER_LON * WORLD_SCALE,
    z: (ORIGIN_LAT - lat) * METRES_PER_LAT * WORLD_SCALE,
  };
}

export function toGeo(x: number, z: number) {
  return {
    lon: ORIGIN_LON + x / (METRES_PER_LON * WORLD_SCALE),
    lat: ORIGIN_LAT - z / (METRES_PER_LAT * WORLD_SCALE),
  };
}
