import data from "./data/obstacles.json";
export type Point = { x: number; z: number };
export type Polygon = { p: number[][]; holes?: number[][][]; height?: number };
export const PLAYER_RADIUS = 0.42;
export const WALK_SPEED = 4.6;
export const RUN_SPEED = 8;
export const toLocal = (lon: number, lat: number): Point => ({
  x: (lon - 8.525) * 75476.3124707444,
  z: (47.3115 - lat) * 111320,
});
export const toGeo = ({ x, z }: Point) => ({
  lon: 8.525 + x / 75476.3124707444,
  lat: 47.3115 - z / 111320,
});
export function inRing({ x, z }: Point, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function edgeDistance(p: Point, ring: number[][], closed = true) {
  let best = Infinity;
  for (let i = 0; i < ring.length - (closed ? 0 : 1); i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
    best = Math.min(best, Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t));
  }
  return best;
}
export function hitsPolygon(
  p: Point,
  polygon: Polygon,
  radius = PLAYER_RADIUS,
) {
  const holes = polygon.holes || [];
  return (
    (inRing(p, polygon.p) && !holes.some((h) => inRing(p, h))) ||
    edgeDistance(p, polygon.p) < radius ||
    holes.some((h) => edgeDistance(p, h) < radius)
  );
}
function index<T extends { p: number[][] }>(items: T[], padding: number) {
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const xs = item.p.map((p) => p[0]),
      zs = item.p.map((p) => p[1]);
    for (
      let x = Math.floor((Math.min(...xs) - padding) / 50);
      x <= Math.floor((Math.max(...xs) + padding) / 50);
      x++
    )
      for (
        let z = Math.floor((Math.min(...zs) - padding) / 50);
        z <= Math.floor((Math.max(...zs) + padding) / 50);
        z++
      ) {
        const key = `${x}:${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key)!.push(item);
      }
  }
  return (p: Point) =>
    cells.get(`${Math.floor(p.x / 50)}:${Math.floor(p.z / 50)}`) || [];
}
const nearbyBuildings = index(data.buildings, 1),
  nearbyWater = index(data.water, 1),
  nearbyBridges = index(data.bridges, 8);
const summit = toLocal(8.5074347, 47.3101971);
export type StreetObstacle = Polygon & { label: string };
export class StreetObstacleLayer {
  private enabled = new Map<StreetObstacle, StreetObstacle>();
  private nearby: (p: Point) => StreetObstacle[] = () => [];
  update(visible: StreetObstacle[], player: Point) {
    const next = new Map<StreetObstacle, StreetObstacle>();
    for (const obstacle of visible) {
      // A newly streamed prop must not trap a person already standing inside it.
      // Once they step clear, its collision becomes active and remains active.
      if (this.enabled.has(obstacle) || !hitsPolygon(player, obstacle)) next.set(obstacle, obstacle);
    }
    if (next.size === this.enabled.size && [...next.keys()].every((p) => this.enabled.has(p))) return;
    this.enabled = next;
    this.nearby = index([...next.values()], PLAYER_RADIUS);
  }
  at(p: Point) { return this.nearby(p).find((o) => hitsPolygon(p, o))?.label || null; }
  get size() { return this.enabled.size; }
  clear() { this.enabled.clear(); this.nearby = () => []; }
}
export const streetObstacles = new StreetObstacleLayer();
export type PersonObstacle = Point & { id: string };
let nearbyPeople: PersonObstacle[] = [];
export function setPeopleObstacles(people: PersonObstacle[], player: Point) {
  // Only ready, visible actors register here. Exclude unavoidable overlaps after
  // a teleport/stream so the player can step clear instead of becoming trapped.
  nearbyPeople = people.filter((p) => Math.hypot(p.x - player.x, p.z - player.z) >= PLAYER_RADIUS + .28);
}
export function personAt(p: Point) {
  return nearbyPeople.some((person) => Math.hypot(p.x - person.x, p.z - person.z) < PLAYER_RADIUS + .28);
}
export function buildingAt(p: Point) {
  return nearbyBuildings(p).find((b) => hitsPolygon(p, b));
}
export function onBridge(p: Point) {
  return nearbyBridges(p).some(
    (b) => edgeDistance(p, b.p, false) <= b.width / 2 - PLAYER_RADIUS,
  );
}
export function obstacleAt(p: Point): string | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return "World boundary";
  const inTown = data.boundary.some(
    (polygon) =>
      inRing(p, polygon[0]) && !polygon.slice(1).some((h) => inRing(p, h)),
  );
  if (!inTown && Math.hypot(p.x - summit.x, p.z - summit.z) > 69)
    return "World boundary";
  if (buildingAt(p)) return "Building";
  const prop = streetObstacles.at(p);
  if (prop) return prop;
  if (personAt(p)) return "Pedestrian";
  if (onBridge(p)) return null;
  const water = nearbyWater(p);
  if (water.some((w) => edgeDistance(p, w.p) < PLAYER_RADIUS))
    return "River bank";
  if (
    water.some((w) => w.role === "outer" && inRing(p, w.p)) &&
    !water.some((w) => w.role === "inner" && inRing(p, w.p))
  )
    return "Water";
  return null;
}
export function moveWithCollisions(
  start: Point,
  dx: number,
  dz: number,
  blocked: (p: Point) => string | null = obstacleAt,
) {
  let p = { ...start },
    obstacle: string | null = null;
  // Short swept steps prevent sprinting through thin walls, even on a slow frame.
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.18));
  for (let i = 0; i < count; i++) {
    const next = { x: p.x + dx / count, z: p.z + dz / count },
      hit = blocked(next);
    if (!hit) {
      p = next;
      continue;
    }
    obstacle = hit;
    const sideX = { x: p.x + dx / count, z: p.z };
    if (!blocked(sideX)) p = sideX;
    const sideZ = { x: p.x, z: p.z + dz / count };
    if (!blocked(sideZ)) p = sideZ;
  }
  return { position: p, obstacle };
}
export function cameraClearance(
  position: Point,
  heading: number,
  pitch: number,
  desired: number,
) {
  for (let distance = 0.5; distance < desired; distance += 0.25) {
    const horizontal = Math.cos(pitch) * distance,
      p = {
        x: position.x - Math.sin(heading) * horizontal,
        z: position.z + Math.cos(heading) * horizontal,
      };
    const b = buildingAt(p);
    if (b && 1.4 - Math.sin(pitch) * distance < b.height + 0.5)
      return Math.max(0.65, distance - 0.4);
  }
  return desired;
}
