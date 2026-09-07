import * as THREE from "three";

export type ShadowCaster = {
  object: THREE.Object3D;
  wantsShadow: boolean;
};

export function shouldUseMsaa(pixelRatio = globalThis.devicePixelRatio || 1) {
  return pixelRatio < 1.5;
}

function keepsCustomProgram(material: THREE.Material) {
  if (material.userData?.uEvening) return true;
  const key = material.customProgramCacheKey?.();
  return typeof key === "string" && key.includes("adliswil-official");
}

export function isMatteStandardMaterial(material: THREE.Material): material is THREE.MeshStandardMaterial {
  if (!(material instanceof THREE.MeshStandardMaterial)) return false;
  if (material.type === "MeshPhysicalMaterial") return false;
  if (keepsCustomProgram(material)) return false;
  if (material.transparent && material.opacity < 0.99) return false;
  if (material.metalness > 0.12) return false;
  if (material.roughness < 0.55) return false;
  return true;
}

export function shouldUseFrontSide(material: THREE.Material) {
  if (material.side !== THREE.DoubleSide) return false;
  if (keepsCustomProgram(material)) return false;
  if ("map" in material && material.map) return false;
  return true;
}

export function lambertFromStandard(material: THREE.MeshStandardMaterial) {
  const next = new THREE.MeshLambertMaterial({
    color: material.color,
    map: material.map,
    lightMap: material.lightMap,
    lightMapIntensity: material.lightMapIntensity,
    aoMap: material.aoMap,
    aoMapIntensity: material.aoMapIntensity,
    emissive: material.emissive,
    emissiveMap: material.emissiveMap,
    emissiveIntensity: material.emissiveIntensity,
    alphaMap: material.alphaMap,
    envMap: material.envMap,
    wireframe: material.wireframe,
    fog: material.fog,
    vertexColors: material.vertexColors,
    transparent: material.transparent,
    opacity: material.opacity,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    alphaTest: material.alphaTest,
    flatShading: material.flatShading,
    name: material.name,
    side: shouldUseFrontSide(material) ? THREE.FrontSide : material.side,
  });
  next.userData = material.userData;
  return next;
}

export function optimizeSceneMaterials(root: THREE.Object3D) {
  const replacements = new Map<THREE.Material, THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((material) => {
      if (!material) return material;
      const cached = replacements.get(material);
      if (cached) return cached;
      if (isMatteStandardMaterial(material)) {
        const lambert = lambertFromStandard(material);
        replacements.set(material, lambert);
        return lambert;
      }
      if (shouldUseFrontSide(material)) material.side = THREE.FrontSide;
      replacements.set(material, material);
      return material;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  return replacements;
}

export function isDynamicObject(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData.dynamic || typeof current.userData.animate === "function") return true;
    current = current.parent;
  }
  return false;
}

export function freezeStaticTransforms(root: THREE.Object3D) {
  let frozen = 0;
  root.traverse((object) => {
    if (object === root) return;
    if ((object as THREE.Light).isLight || (object as THREE.Camera).isCamera) return;
    if (isDynamicObject(object)) return;
    object.matrixAutoUpdate = false;
    object.updateMatrix();
    frozen += 1;
  });
  root.updateMatrixWorld(true);
  return frozen;
}

export function collectShadowCasters(root: THREE.Object3D): ShadowCaster[] {
  const casters: ShadowCaster[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && object.castShadow) casters.push({ object, wantsShadow: true });
  });
  return casters;
}

function casterRadius(object: THREE.Object3D) {
  const mesh = object as THREE.Mesh & { boundingSphere?: THREE.Sphere };
  if (mesh.boundingSphere) return mesh.boundingSphere.radius;
  const sphere = mesh.geometry?.boundingSphere;
  if (!sphere) return 12;
  return sphere.radius * Math.max(Math.abs(object.scale.x), Math.abs(object.scale.y), Math.abs(object.scale.z), 1);
}

export function updateNearbyShadowCasters(
  casters: ShadowCaster[],
  origin: THREE.Vector3,
  radius: number,
) {
  const reach = radius;
  for (const caster of casters) {
    if (!caster.wantsShadow) {
      caster.object.castShadow = false;
      continue;
    }
    const { object } = caster;
    const dx = object.matrixWorld.elements[12] - origin.x;
    const dz = object.matrixWorld.elements[14] - origin.z;
    const limit = reach + casterRadius(object);
    object.castShadow = dx * dx + dz * dz <= limit * limit;
  }
}

export function shadowExtent(shadowDistance: number, worldScale: number) {
  return Math.max(36, shadowDistance * worldScale * 0.42);
}
