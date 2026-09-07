import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WildlifeMotion, type Animal } from "../src/population/wildlife";
import { PedestrianMotion, type PopulationCatalog } from "../src/population/motion";
import { obstacleAt, streetObstacles, inRing, edgeDistance } from "../src/collision";
import obstacles from "../src/data/obstacles.json";
const read = (file: string) => JSON.parse(readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8"));
const catalog: PopulationCatalog & { animals: Animal[] } = read("population/manifest.json");

test("all five ducks remain in mapped water through a complete orbit", () => {
  const ducks = catalog.animals.filter((a) => a.species === "mallard");
  assert.equal(ducks.length, 5);
  for (const animal of ducks) {
    const motion = new WildlifeMotion([animal]);
    for (let i = 0; i < 460; i++) {
      const [pose] = motion.step(.2, animal.home, () => undefined);
      const point = { x: pose.x / .45, z: pose.z / .45 };
      assert.ok(obstacles.water.some((w) => w.role === "outer" && inRing(point, w.p)), animal.id);
      assert.ok(!obstacles.water.some((w) => w.role === "inner" && inRing(point, w.p)), animal.id);
      assert.ok(obstacles.water.every((w) => edgeDistance(point, w.p) > .4), animal.id);
      assert.ok(Math.abs(Math.hypot(pose.x - animal.home.x, pose.z - animal.home.z) - animal.radius) < 1e-8);
    }
  }
});

test("forest wildlife stays inside its validated habitat and clear of actual solid furniture", () => {
  const furniture = read("world-details/manifest.json").street.cells.flatMap((c: { obstacles: object[] }) => c.obstacles);
  streetObstacles.update(furniture, { x: 100000, z: 100000 });
  try {
    const animals = catalog.animals.filter((a) => a.habitat || a.species === "grey-heron");
    assert.equal(animals.length, 4);
    for (const animal of animals) {
      const motion = new WildlifeMotion([animal]);
      for (let i = 0; i < 900; i++) {
        const player = { x: animal.home.x + Math.sin(i / 30) * 3, z: animal.home.z + Math.cos(i / 30) * 3 };
        const [pose] = motion.step(.2, player, () => undefined);
        assert.equal(obstacleAt({ x: pose.x / .45, z: pose.z / .45 }), null, animal.id);
        assert.ok(Math.hypot(pose.x - animal.home.x, pose.z - animal.home.z) <= animal.radius + 1e-8);
      }
    }
  } finally { streetObstacles.clear(); }
});

test("the dog follows its actual owner trail instead of cutting across buildings at corners", () => {
  const dog = catalog.animals.find((a) => a.species === "dog")!;
  const people = new PedestrianMotion(catalog), wildlife = new WildlifeMotion([dog]);
  let seen = 0;
  for (let i = 0; i < 1200; i++) {
    people.step(.2, { x: 10000, z: 10000 });
    const owner = people.getPose(dog.ownerId!)!;
    for (const pose of wildlife.step(.2, owner, (id) => people.getPose(id))) {
      assert.equal(obstacleAt({ x: pose.x / .45, z: pose.z / .45 }), null);
      assert.ok(Math.hypot(pose.x - owner.x, pose.z - owner.z) <= .916);
      seen++;
    }
  }
  assert.ok(seen > 1000);
});

test("all wildlife GLBs contain their geometry and loop animation clips", () => {
  assert.equal(catalog.animals.length, 10);
  for (const animal of catalog.animals) {
    const bytes = readFileSync(new URL(`../public/population/${animal.file}`, import.meta.url));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(8), bytes.length);
    const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length).toString());
    assert.deepEqual(json.animations.map((a: { name: string }) => a.name), ["Idle", "Walk"]);
    for (const view of json.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= bytes.readUInt32LE(20 + length));
  }
});
