import { writeFileSync } from "node:fs";
import * as THREE from "../../../adliswil-explorer/outputs/adliswil/node_modules/three/build/three.module.js";
import { GLTFExporter } from "../../../adliswil-explorer/outputs/adliswil/node_modules/three/examples/jsm/exporters/GLTFExporter.js";

export async function exportWildlife(population, directory) {
  const initial = new Map(population.animals.map((a) => [a.id, a.group.position.clone()]));
  population.update(Math.PI / .07, 0);
  const opposite = new Map(population.animals.map((a) => [a.id, a.group.position.clone()]));
  population.update(0, 0);
  const records = [];
  for (const [index, animal] of population.animals.entries()) {
    const root = animal.group, first = initial.get(animal.id), other = opposite.get(animal.id);
    const habitat = root.userData.habitat;
    const home = animal.species === "mallard" ? { x: (first.x + other.x) / 2, z: (first.z + other.z) / 2 } :
      habitat ? { x: habitat.x, z: habitat.z } : { x: first.x, z: first.z };
    const radius = animal.species === "mallard" ? Math.hypot(first.x - home.x, first.z - home.z) : habitat?.radius || 0;
    const phase = animal.species === "mallard" ? Math.atan2(first.z - home.z, first.x - home.x) : index * .73;
    root.children.forEach((node, i) => { node.name = `part-${i}`; });
    const clips = [];
    for (const [name, pace] of [["Idle", 0], ["Walk", 1]]) {
      const duration = animal.species === "grey-heron" ? Math.PI * 2 / .35 : Math.PI * 2 / 3;
      const times = [], tracks = root.children.map((node) => ({ node, positions: [], quaternions: [] }));
      for (let frame = 0; frame <= 96; frame++) {
        const time = duration * frame / 96; times.push(time);
        root.userData.animate?.(time, pace);
        if (["dog", "red-fox", "roe-deer"].includes(animal.species)) root.children.at(-1).rotation.y = Math.sin(time * Math.PI * 2 / duration) * (animal.species === "dog" ? .5 : .16);
        for (const track of tracks) { track.positions.push(...track.node.position.toArray()); track.quaternions.push(...track.node.quaternion.toArray()); }
      }
      // Close small secondary tail/head motions at the seam; the leg gait has
      // an integral number of strides in this interval.
      for (const track of tracks) {
        track.positions.splice(-3, 3, ...track.positions.slice(0, 3));
        track.quaternions.splice(-4, 4, ...track.quaternions.slice(0, 4));
      }
      clips.push(new THREE.AnimationClip(name, duration, tracks.flatMap((track) => [
        new THREE.VectorKeyframeTrack(`${track.node.name}.position`, times, track.positions),
        new THREE.QuaternionKeyframeTrack(`${track.node.name}.quaternion`, times, track.quaternions),
      ])));
    }
    root.userData.animate?.(0, 0);
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.visible = true; root.userData = {};
    const bytes = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips });
    const file = `${animal.id}.glb`; writeFileSync(new URL(file, directory), Buffer.from(bytes));
    records.push({ id: animal.id, species: animal.species, file, bytes: bytes.byteLength, home, radius, phase,
      ...(habitat ? { habitat } : {}), ...(animal.species === "dog" ? { ownerId: population.npcs[3].id } : {}) });
  }
  return records;
}
