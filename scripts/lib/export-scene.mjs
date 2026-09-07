import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas, Image, ImageData } from "@napi-rs/canvas";
import * as THREE from "../../../adliswil-explorer/outputs/adliswil/node_modules/three/build/three.module.js";
import { mergeGeometries } from "../../../adliswil-explorer/outputs/adliswil/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "../../../adliswil-explorer/outputs/adliswil/node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import { propLabel, propFootprint } from "./prop-colliders.mjs";

export function installCanvas() {
  globalThis.document = { createElement: (name) => {
    if (name !== "canvas") throw Error(`Unsupported export element: ${name}`);
    const canvas = createCanvas(1, 1);
    // GLTFExporter treats any image.data as a DataTexture; napi exposes data() on canvases.
    Object.defineProperty(canvas, "data", { value: undefined });
    return canvas;
  }};
  globalThis.HTMLCanvasElement = createCanvas(1, 1).constructor;
  globalThis.HTMLImageElement = Image;
  globalThis.ImageData = ImageData;
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); }); }
    readAsDataURL(blob) { blob.arrayBuffer().then((result) => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`; this.onloadend?.(); }); }
  };
}

function transformedGeometry(source, matrix, material) {
  const g = source.index ? source.toNonIndexed() : source.clone();
  g.applyMatrix4(matrix);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const existing = g.attributes.color;
  for (let i = 0; i < count; i++) {
    colors[i * 3] = material.color.r * (material.vertexColors && existing ? existing.getX(i) : 1);
    colors[i * 3 + 1] = material.color.g * (material.vertexColors && existing ? existing.getY(i) : 1);
    colors[i * 3 + 2] = material.color.b * (material.vertexColors && existing ? existing.getZ(i) : 1);
  }
  for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
  for (const name of ["position", "normal"]) {
    const a = g.attributes[name];
    if (!a) { if (name === "normal") g.computeVertexNormals(); continue; }
    if (!(a.array instanceof Float32Array) || a.normalized) {
      const values = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) values.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
      g.setAttribute(name, new THREE.BufferAttribute(values, 3));
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (!material.map) g.deleteAttribute("uv");
  return g;
}

// Bake static transforms and merge opaque geometry; keep generated sign textures.
export async function exportCells(roots, directory, { cellSize = 45, prefix = "cell", collision } = {}) {
  mkdirSync(directory, { recursive: true });
  const cells = new Map();
  const matrix = new THREE.Matrix4();
  const centre = new THREE.Vector3();
  let objects = 0;
  function add(mesh, transform, name) {
    if (Array.isArray(mesh.material)) throw Error(`Multi-material source needs explicit groups: ${name}`);
    const material = mesh.material;
    if (!mesh.geometry.attributes.position) return;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.boundingBox.getCenter(centre).applyMatrix4(transform);
    const x = Math.floor(centre.x / cellSize) * cellSize;
    const z = Math.floor(centre.z / cellSize) * cellSize;
    const key = `${x}_${z}`;
    if (!cells.has(key)) cells.set(key, { x, z, batches: new Map(), names: new Map(), obstacles: [] });
    const cell = cells.get(key);
    const g = transformedGeometry(mesh.geometry, transform, material);
    const label = collision && propLabel(name);
    if (label) {
      const p = propFootprint(g.attributes.position.array, collision.getHeight(centre.x, centre.z), collision.scale);
      if (p) cell.obstacles.push({ p, label });
    }
    g.translate(-x, 0, -z);
    const batchKey = material.map ? `texture-${material.uuid}` : JSON.stringify([material.opacity, material.transparent, material.side, material.emissive?.getHex(), material.emissiveIntensity, material.roughness, material.metalness, material.alphaTest, material.depthWrite, material.type]);
    if (!cell.batches.has(batchKey)) {
      const m = material.clone();
      m.color.set("#ffffff"); m.vertexColors = true; m.userData = {};
      cell.batches.set(batchKey, { geometries: [], material: m });
    }
    cell.batches.get(batchKey).geometries.push(g);
    cell.names.set(name, (cell.names.get(name) || 0) + 1);
    objects++;
  }
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverseVisible((mesh) => {
      if (!mesh.isMesh) return;
      if (mesh.isInstancedMesh) {
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          matrix.premultiply(mesh.matrixWorld);
          add(mesh, matrix, mesh.name || root.name);
        }
      } else add(mesh, mesh.matrixWorld, mesh.name || root.name);
    });
  }
  const result = [];
  for (const [key, cell] of cells) {
    const group = new THREE.Group();
    group.name = `${prefix}-${key}`;
    let vertices = 0;
    for (const batch of cell.batches.values()) {
      const geometry = mergeGeometries(batch.geometries, false);
      if (!geometry) throw Error(`Cannot merge ${group.name}`);
      batch.geometries.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(geometry, batch.material);
      mesh.name = group.name;
      group.add(mesh);
      vertices += geometry.attributes.position.count;
    }
    const bytes = await new GLTFExporter().parseAsync(group, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    const file = `${prefix}-${key}.glb`;
    writeFileSync(new URL(file, directory), Buffer.from(bytes));
    const box = new THREE.Box3().setFromObject(group);
    result.push({ file, x: cell.x, z: cell.z, bytes: bytes.byteLength, vertices, meshes: group.children.length, bounds: { min: box.min.toArray(), max: box.max.toArray() }, objects: Object.fromEntries(cell.names), ...(collision ? { obstacles: cell.obstacles } : {}) });
    group.traverse((m) => { m.geometry?.dispose(); m.material?.dispose(); });
  }
  return { cells: result, objects, bytes: result.reduce((n, c) => n + c.bytes, 0) };
}
