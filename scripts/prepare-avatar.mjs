import { writeFileSync } from "node:fs";
import { createCharacter } from "../../adliswil-explorer/outputs/adliswil/src/actors.js";
import { GLTFExporter } from "../../adliswil-explorer/outputs/adliswil/node_modules/three/examples/jsm/exporters/GLTFExporter.js";
import {
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "../../adliswil-explorer/outputs/adliswil/node_modules/three/build/three.module.js";
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};
const avatar = createCharacter({
  shirt: "#477869",
  pants: "#344553",
  backpack: true,
  style: "hiker",
});
avatar.children.forEach((node, i) => {
  node.name = [
    "body",
    "leftArm",
    "rightArm",
    "leftLeg",
    "rightLeg",
    "fishingRod",
  ][i];
});
const clips = [];
for (const [name, speed, duration] of [
  ["Idle", 0, 2],
  ["Walk", 2, Math.PI / 4],
  ["Run", 8, Math.PI / 6],
]) {
  const times = [],
    tracks = avatar.children
      .slice(0, 5)
      .map((node) => ({ node, positions: [], quaternions: [] }));
  for (let i = 0; i <= 32; i++) {
    const t = (i / 32) * duration;
    times.push(t);
    avatar.userData.animate(t, speed);
    for (const track of tracks) {
      track.positions.push(...track.node.position.toArray());
      track.quaternions.push(...track.node.quaternion.toArray());
    }
  }
  clips.push(
    new AnimationClip(
      name,
      duration,
      tracks.flatMap((t) => [
        new VectorKeyframeTrack(`${t.node.name}.position`, times, t.positions),
        new QuaternionKeyframeTrack(
          `${t.node.name}.quaternion`,
          times,
          t.quaternions,
        ),
      ]),
    ),
  );
}
avatar.userData.animate(0, 0);
avatar.userData = {};
const result = await new GLTFExporter().parseAsync(avatar, {
  binary: true,
  animations: clips,
  onlyVisible: true,
});
writeFileSync(
  new URL("../public/explorer.glb", import.meta.url),
  Buffer.from(result),
);
console.log(
  `Exported original Explorer character with Idle, Walk and Run animations (${result.byteLength} bytes).`,
);
