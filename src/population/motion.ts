export type Route = { id: number; district: string; points: number[][]; cumulative: number[]; length: number; bridge: boolean };
export type Person = { id: string; routeId: number; file: string; speed: number; phase: number };
export type PopulationCatalog = { people: Person[]; routes: Route[] };
export type ActorPose = { id: string; file: string; phase: number; x: number; z: number; angle: number; walking: boolean; bridge: boolean; routeId?: number; height?: number; species?: string; lift?: number; animationRate?: number };
export type PersonPose = Person & ActorPose;
const turnDuration = 2;
export function personPose(person: Person, route: Route, time: number): PersonPose {
  const travel = route.length / person.speed, cycle = travel * 2 + turnDuration * 2;
  const t = ((time + person.phase * cycle) % cycle + cycle) % cycle;
  let distance: number, turn: number, walking: boolean;
  const smooth = (n: number) => n * n * (3 - 2 * n);
  if (t < travel) { distance = t * person.speed; turn = 0; walking = true; }
  else if (t < travel + turnDuration) { distance = route.length; turn = Math.PI * smooth((t - travel) / turnDuration); walking = false; }
  else if (t < travel * 2 + turnDuration) { distance = route.length - (t - travel - turnDuration) * person.speed; turn = Math.PI; walking = true; }
  else { distance = 0; turn = Math.PI + Math.PI * smooth((t - travel * 2 - turnDuration) / turnDuration); walking = false; }
  let low = 1, high = route.cumulative.length - 1;
  while (low < high) { const middle = (low + high) >> 1; if (route.cumulative[middle] < distance) low = middle + 1; else high = middle; }
  const a = route.points[low - 1], b = route.points[low];
  const fraction = (distance - route.cumulative[low - 1]) / (route.cumulative[low] - route.cumulative[low - 1] || 1);
  const angle = Math.atan2(b[0] - a[0], b[1] - a[1]) + turn;
  // Keep to the right within the offline-validated corridor; turn smoothly at its ends.
  return { ...person, x: a[0] + (b[0] - a[0]) * fraction + Math.cos(angle) * .135,
    z: a[1] + (b[1] - a[1]) * fraction - Math.sin(angle) * .135, angle, walking, bridge: route.bridge };
}

export class PedestrianMotion {
  private time = new Map<string, number>();
  private poses = new Map<string, PersonPose>();
  private routes: Map<number, Route>;
  constructor(private catalog: PopulationCatalog) { this.routes = new Map(catalog.routes.map((r) => [r.id, r])); }
  getPose(id: string) { return this.poses.get(id); }
  step(dt: number, player: { x: number; z: number }) {
    const poses: PersonPose[] = [];
    const occupied = new Map<string, PersonPose>();
    for (const person of this.catalog.people) {
      const route = this.routes.get(person.routeId);
      if (route) occupied.set(person.id, personPose(person, route, this.time.get(person.id) || 0));
    }
    for (const person of this.catalog.people) {
      const route = this.routes.get(person.routeId);
      if (!route) continue;
      const current = this.time.get(person.id) || 0;
      const before = occupied.get(person.id)!;
      const nextTime = current + Math.max(0, Math.min(dt, .25));
      const next = personPose(person, route, nextTime);
      const distance = Math.hypot(next.x - player.x, next.z - player.z);
      const approachingPlayer = distance < .45 && distance <= Math.hypot(before.x - player.x, before.z - player.z);
      // Keep a body gap when someone ahead has stopped. Opposing right-hand lanes
      // remain wide enough to pass; existing overlaps may move apart.
      const approachingPerson = [...occupied.values()].some((other) => {
        if (other.id === person.id) return false;
        const nextDistance = Math.hypot(next.x - other.x, next.z - other.z);
        return nextDistance < .25 && nextDistance < Math.hypot(before.x - other.x, before.z - other.z);
      });
      const waiting = approachingPlayer || approachingPerson;
      const pose = waiting ? { ...before, walking: false } : next;
      this.time.set(person.id, waiting ? current : nextTime);
      occupied.set(person.id, pose);
      if (Math.hypot(pose.x - player.x, pose.z - player.z) < 56.25) poses.push(pose);
    }
    this.poses = occupied;
    return poses.sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z)).slice(0, 8);
  }
}
