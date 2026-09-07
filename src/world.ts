import {
  RUN_SPEED,
  WALK_SPEED,
  toLocal,
  toGeo,
  moveWithCollisions,
} from "./collision";
import geography from "./data/geography.json";
export const paths = geography.paths;
export { destinations, type Destination } from "./destinations";
export type Position = { lon: number; lat: number };
export function nearestPath(lon: number, lat: number) {
  let best = { lon, lat, distance: Infinity, bridge: false };
  for (const path of paths)
    for (let i = 1; i < path.coordinates.length; i++) {
      const a = path.coordinates[i - 1],
        b = path.coordinates[i];
      const dx = (b[0] - a[0]) * 75476,
        dy = (b[1] - a[1]) * 111320;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((lon - a[0]) * 75476 * dx + (lat - a[1]) * 111320 * dy) /
            (dx * dx + dy * dy || 1),
        ),
      );
      const x = a[0] + (b[0] - a[0]) * t,
        y = a[1] + (b[1] - a[1]) * t;
      const distance = Math.hypot((lon - x) * 75476, (lat - y) * 111320);
      if (distance < best.distance)
        best = { lon: x, lat: y, distance, bridge: path.bridge };
    }
  return best;
}
export function walkStep(
  position: Position,
  heading: number,
  forward: number,
  side: number,
  seconds: number,
  fast: boolean,
): Position {
  const speed =
    ((fast ? RUN_SPEED : WALK_SPEED) * Math.min(seconds, 0.05)) /
    Math.max(1, Math.hypot(forward, side));
  const start = toLocal(position.lon, position.lat);
  return toGeo(
    moveWithCollisions(
      start,
      (Math.sin(heading) * forward + Math.cos(heading) * side) * speed,
      (-Math.cos(heading) * forward + Math.sin(heading) * side) * speed,
    ).position,
  );
}
