import { Axis, Cartesian3, Cartographic, Matrix3, Matrix4, Model, ModelAnimationLoop, ShadowMode, Transforms, type Viewer } from "cesium";
import { toGeo, toLocal, setPeopleObstacles, type PersonObstacle } from "../collision";
import { createStreetSkyLight } from "../scene-lighting";
import type { ActorPose } from "./motion";
type Pose = ActorPose & { height: number };
type Entry = { model: Model; from: Pose; to: Pose; received: number; animation: string; animationTime: number };
function blend(entry: Entry, now: number): Pose {
  const t = Math.max(0, Math.min(1, (now - entry.received) / 200)), a = entry.from, b = entry.to;
  return { ...b, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, height: a.height + (b.height - a.height) * t,
    angle: a.angle + Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle)) * t };
}
export class Population {
  private worker?: Worker;
  private disposed = false;
  private failed = false;
  private busy = false;
  private active = false;
  private paused = false;
  private frameTime = 0;
  private elapsed = 0;
  private lastRequest = -Infinity;
  private lastBridgeProbe = -Infinity;
  private bridges = new Map<string, number>();
  private entries = new Map<string, Entry>();
  private pending = new Set<string>();
  private failedModels = new Set<string>();
  private wanted = new Map<string, Pose>();
  private lighting = createStreetSkyLight();
  private frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(8.525, 47.3115, 440));
  private status = "";
  constructor(private viewer: Viewer, private excluded: object[], private report: (status: string) => void) {}
  private setStatus(status: string) { if (this.status !== status) { this.status = status; this.report(status); } }
  private start() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = ({ data }: MessageEvent<{ people: Pose[]; animals?: Pose[]; error?: string }>) => {
      this.busy = false;
      if (this.disposed || !this.active || this.paused) return;
      if (data.error) { this.failed = true; this.setStatus(data.error); return; }
      const now = performance.now();
      this.wanted = new Map([...data.people, ...(data.animals || [])].map((p) => [p.id, this.ground(p, now)]));
      for (const [id, entry] of this.entries) {
        const pose = this.wanted.get(id);
        if (!pose) { this.remove(entry.model); this.entries.delete(id); }
        else { entry.from = blend(entry, now); entry.to = pose; entry.received = now; }
      }
      this.fillQueue();
      this.setStatus(this.failedModels.size ? "Some street life unavailable" : "Ready");
      this.viewer.scene.canvas.dataset.pedestrianPositions = JSON.stringify(data.people.map((p) => ({ id: p.id, x: p.x, z: p.z, walking: p.walking })));
      this.viewer.scene.canvas.dataset.animalPositions = JSON.stringify((data.animals || []).map((p) => ({ id: p.id, species: p.species, x: p.x, z: p.z, walking: p.walking })));
    };
    this.worker.onerror = () => { this.busy = false; this.failed = true; this.worker?.terminate(); this.setStatus("Population unavailable"); };
  }
  private ground(pose: Pose, now: number): Pose {
    const geo = toGeo({ x: pose.x / .45, z: pose.z / .45 });
    const point = Cartographic.fromDegrees(geo.lon, geo.lat);
    let height = this.viewer.scene.globe.getHeight(point) ?? pose.height;
    if (pose.bridge && this.viewer.scene.sampleHeightSupported) {
      const key = `${pose.routeId}:${Math.round(pose.x / 2)}:${Math.round(pose.z / 2)}`;
      if (!this.bridges.has(key) && now - this.lastBridgeProbe > 1000) {
        this.lastBridgeProbe = now;
        const deck = this.viewer.scene.sampleHeight(point, this.excluded, .3);
        if (deck !== undefined && deck > height && deck < height + 20) this.bridges.set(key, deck);
      }
      height = this.bridges.get(key) ?? height;
    }
    return { ...pose, height: height + .02 + (pose.lift || 0) };
  }
  private matrix(pose: Pose, result = new Matrix4()) {
    const local = Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(pose.angle), new Cartesian3(pose.x / .45, -pose.z / .45, pose.height - 440));
    return Matrix4.multiply(this.frame, local, result);
  }
  private remove(model: Model) {
    const index = this.excluded.indexOf(model); if (index >= 0) this.excluded.splice(index, 1);
    this.viewer.scene.primitives.remove(model);
  }
  private fillQueue() {
    if (!this.active || this.disposed) return;
    for (const [id, pose] of this.wanted) {
      if (this.pending.size >= 2) return;
      if (this.entries.has(id) || this.pending.has(id) || this.failedModels.has(id)) continue;
      this.pending.add(id);
      void Model.fromGltfAsync({ url: `/population/${pose.file}`, modelMatrix: this.matrix(pose), scale: 1 / .45,
        upAxis: Axis.Y, forwardAxis: Axis.X, shadows: ShadowMode.RECEIVE_ONLY, allowPicking: false,
        imageBasedLighting: this.lighting, environmentMapOptions: { enabled: false },
      }).then((model) => {
        if (this.disposed || !this.active || !this.wanted.has(id)) { model.destroy(); return; }
        const current = this.wanted.get(id)!;
        this.matrix(current, model.modelMatrix);
        this.viewer.scene.primitives.add(model); this.excluded.push(model);
        model.activeAnimations.animateWhilePaused = true;
        this.entries.set(id, { model, from: current, to: current, received: performance.now(), animation: "", animationTime: this.elapsed + current.phase * 9.17 });
      }).catch(() => { this.failedModels.add(id); if (!this.disposed) this.setStatus("Some street life unavailable"); })
        .finally(() => { this.pending.delete(id); this.fillQueue(); });
    }
  }
  update(lon: number, lat: number, active: boolean, paused: boolean, dt: number, now: number) {
    if (this.disposed) return;
    this.active = active;
    this.paused = paused;
    if (!paused) this.frameTime = now;
    if (active && !paused) this.elapsed += dt;
    if (active && !this.worker && !this.failed) this.start();
    if (active && !paused && !this.busy && !this.failed && now - this.lastRequest >= 200) {
      const p = toLocal(lon, lat); this.busy = true; this.lastRequest = now;
      this.worker!.postMessage({ time: this.elapsed, x: p.x * .45, z: p.z * .45 });
    }
    let count = 0, animalCount = 0;
    const player = toLocal(lon, lat), obstacles: PersonObstacle[] = [];
    for (const entry of this.entries.values()) {
      const pose = blend(entry, this.frameTime || now);
      entry.model.show = active && Math.hypot(pose.x / .45 - player.x, pose.z / .45 - player.z) >= .7;
      if (!active || !entry.model.ready) continue;
      if (entry.model.show && !pose.species) obstacles.push({ id: pose.id, x: pose.x / .45, z: pose.z / .45 });
      if (entry.model.show) { if (pose.species) animalCount++; else count++; }
      if (!paused) {
        this.matrix(pose, entry.model.modelMatrix);
        entry.animationTime += dt * (pose.animationRate || 1);
      }
      const name = entry.to.walking ? "Walk" : "Idle";
      if (entry.animation !== name) {
        entry.model.activeAnimations.removeAll();
        entry.model.activeAnimations.add({ name, loop: ModelAnimationLoop.REPEAT,
          animationTime: (duration) => (entry.animationTime % duration) / duration });
        entry.animation = name;
      }
    }
    setPeopleObstacles(obstacles, player);
    const canvas = this.viewer.scene.canvas;
    if (canvas.dataset.pedestrians !== String(count)) canvas.dataset.pedestrians = String(count);
    if (canvas.dataset.animals !== String(animalCount)) canvas.dataset.animals = String(animalCount);
  }
  dispose() {
    this.disposed = true; this.worker?.terminate();
    setPeopleObstacles([], { x: 0, z: 0 });
    if (!this.viewer.isDestroyed()) for (const entry of this.entries.values()) this.remove(entry.model);
    this.entries.clear(); this.wanted.clear(); this.lighting.destroy();
  }
}
