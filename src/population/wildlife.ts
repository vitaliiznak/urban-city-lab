import type { ActorPose, PersonPose } from "./motion";
export type Animal = { id: string; species: string; file: string; home: { x: number; z: number }; radius: number; phase: number; ownerId?: string;
  habitat?: { x: number; z: number; radius: number; polygon: number[][]; holes: number[][]; sourceId: number; pathId: number } };
type Point = { x: number; z: number };
export class WildlifeMotion {
  private poses = new Map<string, ActorPose>();
  private trails = new Map<string, Point[]>();
  private elapsed = 0;
  constructor(private animals: Animal[]) {}
  step(dt: number, player: Point, owner: (id: string) => PersonPose | undefined) {
    dt = Math.max(0, Math.min(.25, dt)); this.elapsed += dt;
    const time = this.elapsed, result: ActorPose[] = [];
    for (const animal of this.animals) {
      const before = this.poses.get(animal.id);
      let x = before?.x ?? animal.home.x, z = before?.z ?? animal.home.z, angle = before?.angle || 0;
      let walking = false, lift = 0, animationRate = 1, bridge = false, routeId: number | undefined;
      if (animal.species === "mallard") {
        const phase = time * .07 + animal.phase;
        x = animal.home.x + Math.cos(phase) * animal.radius;
        z = animal.home.z + Math.sin(phase) * animal.radius;
        angle = Math.atan2(-Math.sin(phase), Math.cos(phase)); walking = true;
        lift = .04 + Math.sin(time * 2 + animal.phase) * .014;
      } else if (animal.species === "grey-heron") {
        angle = Math.PI / 2;
      } else if (animal.species === "dog") {
        const person = owner(animal.ownerId!);
        if (!person) continue;
        const trail = this.trails.get(animal.id) || [];
        if (!trail.length || Math.hypot(person.x - trail[0].x, person.z - trail[0].z) > .015) trail.unshift({ x: person.x, z: person.z });
        trail.length = Math.min(trail.length, 100); this.trails.set(animal.id, trail);
        let distance = 0, found = false;
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1], b = trail[i], length = Math.hypot(b.x - a.x, b.z - a.z);
          if (distance + length >= .9) {
            const t = (.9 - distance) / length; x = a.x + (b.x - a.x) * t; z = a.z + (b.z - a.z) * t;
            angle = Math.atan2(a.x - b.x, a.z - b.z); found = true; break;
          }
          distance += length;
        }
        if (!found) continue;
        walking = !!before && Math.hypot(x - before.x, z - before.z) > .005;
        bridge = person.bridge; routeId = person.routeId;
      } else {
        const phase = animal.phase, radius = animal.radius;
        const shy = Math.hypot(x - player.x, z - player.z) < (animal.species === "roe-deer" ? 14 : 11);
        let tx = animal.home.x + Math.sin(time * .045 + phase) * radius;
        let tz = animal.home.z + Math.cos(time * .033 + phase) * radius;
        if (shy) {
          const distance = Math.hypot(x - player.x, z - player.z) || 1;
          tx = x + (x - player.x) / distance * 12; tz = z + (z - player.z) / distance * 12;
        }
        const homeDistance = Math.hypot(tx - animal.home.x, tz - animal.home.z);
        if (homeDistance > radius) { tx = animal.home.x + (tx - animal.home.x) / homeDistance * radius; tz = animal.home.z + (tz - animal.home.z) / homeDistance * radius; }
        const dx = tx - x, dz = tz - z, distance = Math.hypot(dx, dz);
        const step = Math.min(distance, (shy ? 3.5 : .8) * .45 * dt);
        if (distance > .02 && step > 0) {
          x += dx / distance * step; z += dz / distance * step; walking = true;
          const target = Math.atan2(dx, dz); angle += Math.atan2(Math.sin(target - angle), Math.cos(target - angle)) * Math.min(1, dt * 6);
        }
        animationRate = shy ? 1.7 : 1;
        if (animal.species === "red-squirrel" && walking) lift = Math.max(0, Math.sin(time * 8)) * .12;
      }
      const pose = { id: animal.id, file: animal.file, species: animal.species, phase: animal.phase,
        x, z, angle, walking, lift, animationRate, bridge, routeId };
      this.poses.set(animal.id, pose);
      if (Math.hypot(x - player.x, z - player.z) < 56.25) result.push(pose);
    }
    return result.sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z)).slice(0, 6);
  }
}
