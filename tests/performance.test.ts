import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  collectShadowCasters,
  freezeStaticTransforms,
  isMatteStandardMaterial,
  lambertFromStandard,
  optimizeSceneMaterials,
  shadowExtent,
  shouldUseFrontSide,
  shouldUseMsaa,
  updateNearbyShadowCasters,
} from "../src/three-world/performance";

test("retina screens skip MSAA and 1x screens keep it", () => {
  assert.equal(shouldUseMsaa(1), true);
  assert.equal(shouldUseMsaa(1.25), true);
  assert.equal(shouldUseMsaa(2), false);
  assert.equal(shouldUseMsaa(3), false);
});

test("matte walls become Lambert while glass and official facades stay PBR", () => {
  const wall = new THREE.MeshStandardMaterial({ color: "#91b17f", roughness: 0.87, metalness: 0 });
  const glass = new THREE.MeshStandardMaterial({ color: "#648c94", roughness: 0.4, metalness: 0.15 });
  const foam = new THREE.MeshStandardMaterial({ color: "#c6e8d8", transparent: true, opacity: 0.57 });
  const official = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.91, side: THREE.DoubleSide });
  official.userData.uEvening = { value: 0 };
  official.customProgramCacheKey = () => "adliswil-official-geometry-illustrative-facades-v2-evening";
  assert.equal(isMatteStandardMaterial(wall), true);
  assert.equal(isMatteStandardMaterial(glass), false);
  assert.equal(isMatteStandardMaterial(foam), false);
  assert.equal(isMatteStandardMaterial(official), false);
  assert.equal(shouldUseFrontSide(wall), false);
  wall.side = THREE.DoubleSide;
  assert.equal(shouldUseFrontSide(wall), true);
  assert.equal(shouldUseFrontSide(official), false);
  const lambert = lambertFromStandard(wall);
  assert.equal(lambert instanceof THREE.MeshLambertMaterial, true);
  assert.equal(lambert.side, THREE.FrontSide);
});

test("optimizeSceneMaterials replaces shared matte materials once", () => {
  const mat = new THREE.MeshStandardMaterial({ color: "#688b5e", roughness: 0.87 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(), mat);
  const b = new THREE.Mesh(new THREE.BoxGeometry(), mat);
  const root = new THREE.Group();
  root.add(a, b);
  const replacements = optimizeSceneMaterials(root);
  assert.equal(a.material instanceof THREE.MeshLambertMaterial, true);
  assert.equal(a.material, b.material);
  assert.equal(replacements.get(mat), a.material);
});

test("static meshes freeze while animated groups keep updating", () => {
  const root = new THREE.Group();
  const building = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  const person = new THREE.Group();
  const limb = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  person.userData.animate = () => {};
  person.add(limb);
  root.add(building, person);
  assert.ok(freezeStaticTransforms(root) >= 1);
  assert.equal(building.matrixAutoUpdate, false);
  assert.equal(person.matrixAutoUpdate, true);
  assert.equal(limb.matrixAutoUpdate, true);
});

test("only nearby casters keep casting shadows", () => {
  const near = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial());
  const far = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial());
  near.position.set(4, 0, 0);
  far.position.set(200, 0, 0);
  near.castShadow = true;
  far.castShadow = true;
  const root = new THREE.Group();
  root.add(near, far);
  root.updateMatrixWorld(true);
  const casters = collectShadowCasters(root);
  assert.equal(casters.length, 2);
  updateNearbyShadowCasters(casters, new THREE.Vector3(), 20);
  assert.equal(near.castShadow, true);
  assert.equal(far.castShadow, false);
});

test("shadow extent stays tight around the walker", () => {
  assert.ok(shadowExtent(420, 0.45) < 100);
  assert.ok(shadowExtent(420, 0.45) > 60);
  assert.ok(shadowExtent(260, 0.45) < shadowExtent(420, 0.45));
});
