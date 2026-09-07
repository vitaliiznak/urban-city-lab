import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PedestrianMotion, personPose, type PopulationCatalog } from "../src/population/motion";
import { obstacleAt, streetObstacles, setPeopleObstacles, personAt, moveWithCollisions } from "../src/collision";
const read = (name: string) => JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8"));
const catalog: PopulationCatalog = read("population/manifest.json");

test("all pedestrian poses stay clear of actual city buildings, water and solid furniture", () => {
  const furniture = read("world-details/manifest.json").street.cells.flatMap((c: { obstacles: object[] }) => c.obstacles);
  streetObstacles.update(furniture, { x: 100000, z: 100000 });
  try {
    assert.equal(catalog.people.length, 28);
    assert.equal(catalog.routes.length, 24);
    for (const person of catalog.people) {
      const route = catalog.routes.find((r) => r.id === person.routeId)!;
      assert.ok(route);
      const duration = 2 * route.length / person.speed + 4;
      for (let t = 0; t <= duration; t += .2) {
        const pose = personPose(person, route, t);
        assert.ok([pose.x, pose.z, pose.angle].every(Number.isFinite));
        assert.equal(obstacleAt({ x: pose.x / .45, z: pose.z / .45 }), null, `${person.id} route ${route.id} at ${t}`);
      }
    }
  } finally { streetObstacles.clear(); }
});

test("a pedestrian waits for the player and resumes when the path is clear", () => {
  const person = catalog.people[0], route = catalog.routes.find((r) => r.id === person.routeId)!;
  const motion = new PedestrianMotion({ people: [person], routes: [route] });
  const start = personPose(person, route, 0);
  const ahead = personPose(person, route, .2), length = Math.hypot(ahead.x - start.x, ahead.z - start.z);
  const waiting = motion.step(.2, { x: start.x + (ahead.x - start.x) / length * .4, z: start.z + (ahead.z - start.z) / length * .4 })[0];
  assert.equal(waiting.walking, false);
  assert.equal(waiting.x, start.x);
  assert.equal(waiting.z, start.z);
  const resumed = motion.step(.2, { x: start.x + 10, z: start.z + 10 })[0];
  assert.equal(resumed.walking, true);
  assert.ok(Math.hypot(resumed.x - start.x, resumed.z - start.z) > .01);
});

test("each character contains actual Idle and Walk animation channels", () => {
  for (const person of catalog.people) {
    const bytes = readFileSync(new URL(`../public/population/${person.file}`, import.meta.url));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const length = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, 20 + length).toString());
    assert.deepEqual(gltf.animations.map((a: { name: string }) => a.name), ["Idle", "Walk"]);
    for (const animation of gltf.animations) assert.ok(animation.channels.length >= 10);
    for (const view of gltf.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= bytes.readUInt32LE(20 + length));
  }
});

test("followers keep a body gap behind a waiting person and resume together", () => {
  const route = { id: 1, district: "test", points: [[0, 0], [0, 10]], cumulative: [0, 10], length: 10, bridge: false };
  const people = [
    { id: "leader", routeId: 1, file: "", speed: .45, phase: .12 },
    { id: "follower", routeId: 1, file: "", speed: .45, phase: 0 },
  ];
  const motion = new PedestrianMotion({ routes: [route], people });
  let result = motion.step(0, { x: .135, z: 4 });
  for (let i = 0; i < 100; i++) {
    result = motion.step(.2, { x: .135, z: 4 });
    assert.ok(Math.hypot(result[0].x - result[1].x, result[0].z - result[1].z) >= .25);
  }
  assert.ok(result.every((p) => !p.walking));
  for (let i = 0; i < 5; i++) result = motion.step(.2, { x: 5, z: 4 });
  assert.ok(result.every((p) => p.walking));
});

test("visible people block a sprint without trapping teleported players", () => {
  const person = { id: "test", x: 3, z: 0 };
  setPeopleObstacles([person], { x: 0, z: 0 });
  const result = moveWithCollisions({ x: 0, z: 0 }, 8, 0, (p) => personAt(p) ? "Pedestrian" : null);
  assert.equal(result.obstacle, "Pedestrian");
  assert.ok(result.position.x < 2.31);
  setPeopleObstacles([person], { x: 3, z: 0 });
  assert.equal(personAt({ x: 3, z: 0 }), false);
  setPeopleObstacles([], { x: 0, z: 0 });
});
