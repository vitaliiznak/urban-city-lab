import * as THREE from "three";
import { toWorld } from "./geo";
import cleanup from "../data/street-cleanup.json";

type HeightAt = (x: number, z: number) => number;

const STREET_COLORS = new Set(["7c8581", "c8c2ae", "d2cdbb", "e2decd", "f5c400"]);

export function collectStreetMeshes(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (
      materials.some((material) => {
        const color = (material as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial).color;
        return color && STREET_COLORS.has(color.getHexString());
      })
    )
      meshes.push(mesh);
  });
  return meshes;
}

function ribbon(
  line: number[][],
  width: number,
  heightAt: HeightAt,
  lift: number,
) {
  const positions: number[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = toWorld(line[i - 1][0], line[i - 1][1]);
    const b = toWorld(line[i][0], line[i][1]);
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    const nx = (-dz / length) * (width / 2),
      nz = (dx / length) * (width / 2);
    const corners = [
      [a.x + nx, a.z + nz],
      [a.x - nx, a.z - nz],
      [b.x - nx, b.z - nz],
      [b.x + nx, b.z + nz],
    ].map(([x, z]) => [x, heightAt(x, z) + lift, z] as const);
    const triangles = [0, 1, 2, 0, 2, 3];
    for (const index of triangles) positions.push(...corners[index]);
  }
  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function polygon(ring: number[][], heightAt: HeightAt, lift: number) {
  if (ring.length < 3) return;
  const local = ring.map(([lon, lat]) => toWorld(lon, lat));
  const shape = new THREE.Shape(local.map((p) => new THREE.Vector2(p.x, -p.z)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, heightAt(position.getX(i), position.getZ(i)) + lift);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function addParkingCleanup(heightAt: HeightAt) {
  const group = new THREE.Group();
  group.name = "Street cleanup parking";
  const asphalt = new THREE.MeshLambertMaterial({ color: "#797c78" });
  const gravel = new THREE.MeshLambertMaterial({ color: "#a59e88" });
  const loose = new Set(["gravel", "fine_gravel", "compacted", "unpaved", "ground"]);
  for (const lot of cleanup.parking) {
    const geometry = polygon(lot.coordinates, heightAt, 0.045);
    if (!geometry) continue;
    const mesh = new THREE.Mesh(
      geometry,
      loose.has(lot.surface) ? gravel : asphalt,
    );
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const crossing = new THREE.MeshLambertMaterial({ color: "#f4ce64" });
  for (const mark of cleanup.crossings) {
    const geometry = ribbon(mark.coordinates, mark.width, heightAt, 0.055);
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, crossing);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return {
    group,
    dispose() {
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        if (!Array.isArray(mesh.material)) mesh.material.dispose();
      });
      group.removeFromParent();
    },
  };
}
