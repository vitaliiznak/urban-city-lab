import { Axis, Cartesian3, Cartographic, Matrix3, Matrix4, Model, ShadowMode, Transforms, type Viewer } from "cesium";
import { createStreetSkyLight } from "../scene-lighting";
import { toLocal, toGeo } from "../collision";
import type { TransitRequest, TransitResponse, Vehicle } from "./types";

type Entry = { model: Model; from: Vehicle; to: Vehicle; received: number };
const angleMix = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
function interpolate(entry: Entry, now: number): Vehicle {
  const t = Math.max(0, Math.min(1, (now - entry.received) / 200));
  const a = entry.from, b = entry.to;
  return { ...b, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    height: a.height + (b.height - a.height) * t, pitch: a.pitch + (b.pitch - a.pitch) * t,
    angle: angleMix(a.angle, b.angle, t) };
}

export class Traffic {
  private worker?: Worker;
  private disposed = false;
  private busy = false;
  private sequence = 0;
  private lastRequest = -Infinity;
  private hour = NaN;
  private elapsed = 0;
  private active = false;
  private unavailable = false;
  private status = "";
  private wanted = new Map<string, Vehicle>();
  private entries = new Map<string, Entry>();
  private pending = new Set<string>();
  private failed = new Set<string>();
  private lighting = createStreetSkyLight();
  private frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(8.525, 47.3115, 440));
  constructor(private viewer: Viewer, private report: (value: string) => void) {}
  private setStatus(value: string) { if (value !== this.status) { this.status = value; this.report(value); } }
  private start() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = ({ data }: MessageEvent<TransitResponse>) => {
      this.busy = false;
      if (this.disposed || !this.active || data.sequence !== this.sequence) return;
      if (data.error) { this.setStatus(data.error); this.unavailable = true; return; }
      const now = performance.now();
      this.wanted = new Map(data.vehicles.map((v) => [v.id, this.ground(v)]));
      for (const [id, entry] of this.entries) {
        const next = this.wanted.get(id);
        if (!next) { this.viewer.scene.primitives.remove(entry.model); this.entries.delete(id); }
        else { entry.from = interpolate(entry, now); entry.to = next; entry.received = now; }
      }
      this.fillQueue();
      this.setStatus("Ready");
      this.viewer.scene.canvas.dataset.trafficPositions = JSON.stringify(data.vehicles.map((v) => ({ id: v.id, kind: v.kind, x: v.x, z: v.z, dwelling: v.dwelling })));
    };
    this.worker.onerror = () => { this.busy = false; this.unavailable = true; this.setStatus("Transport unavailable"); this.worker?.terminate(); this.worker = undefined; };
  }
  private ground(pose: Vehicle): Vehicle {
    const wheelbase = (pose.kind === "bus" ? 2.65 : 8.4) / .45;
    const dx = Math.sin(pose.angle) * wheelbase / 2, dz = Math.cos(pose.angle) * wheelbase / 2;
    const front = toGeo({ x: pose.x / .45 + dx, z: pose.z / .45 + dz });
    const rear = toGeo({ x: pose.x / .45 - dx, z: pose.z / .45 - dz });
    const a = this.viewer.scene.globe.getHeight(Cartographic.fromDegrees(front.lon, front.lat));
    const b = this.viewer.scene.globe.getHeight(Cartographic.fromDegrees(rear.lon, rear.lat));
    if (a === undefined || b === undefined) return pose;
    return { ...pose, height: (a + b) / 2 + .025, pitch: -Math.atan2(a - b, wheelbase) };
  }
  private matrix(pose: Vehicle, result = new Matrix4()) {
    const rotation = Matrix3.multiply(Matrix3.fromRotationZ(pose.angle), Matrix3.fromRotationX(pose.pitch), new Matrix3());
    const local = Matrix4.fromRotationTranslation(rotation, new Cartesian3(pose.x / .45, -pose.z / .45, pose.height - 440));
    return Matrix4.multiply(this.frame, local, result);
  }
  private fillQueue() {
    if (this.disposed || !this.active) return;
    for (const [id, pose] of this.wanted) {
      if (this.pending.size >= 2) return;
      if (this.entries.has(id) || this.pending.has(id) || this.failed.has(pose.file)) continue;
      this.pending.add(id);
      void Model.fromGltfAsync({ url: `/transport/${pose.file}`, modelMatrix: this.matrix(pose), scale: 1 / .45,
        upAxis: Axis.Y, forwardAxis: Axis.X, shadows: ShadowMode.RECEIVE_ONLY, allowPicking: false,
        imageBasedLighting: this.lighting, environmentMapOptions: { enabled: false }, incrementallyLoadTextures: false,
      }).then((model) => {
        if (this.disposed || !this.active || !this.wanted.has(id)) { model.destroy(); return; }
        const latest = this.wanted.get(id)!;
        this.matrix(latest, model.modelMatrix);
        this.viewer.scene.primitives.add(model);
        this.entries.set(id, { model, from: latest, to: latest, received: performance.now() });
      }).catch(() => { this.failed.add(pose.file); if (!this.disposed) this.setStatus("Some vehicles unavailable"); })
        .finally(() => { this.pending.delete(id); this.fillQueue(); });
    }
  }
  update(lon: number, lat: number, active: boolean, paused: boolean, hour: number, now: number, dt: number) {
    if (this.disposed) return;
    if (hour !== this.hour) {
      this.hour = hour; this.elapsed = 0; this.sequence++; this.lastRequest = -Infinity;
      this.wanted.clear();
      for (const entry of this.entries.values()) this.viewer.scene.primitives.remove(entry.model);
      this.entries.clear();
    }
    this.active = active;
    if (active && !this.worker && !this.unavailable) this.start();
    if (active && !paused) this.elapsed += dt;
    if (active && !paused && !this.busy && !this.unavailable && now - this.lastRequest >= 200) {
      this.busy = true; this.lastRequest = now;
      const p = toLocal(lon, lat);
      this.worker!.postMessage({ seconds: hour * 3600 + this.elapsed, x: p.x * .45, z: p.z * .45, sequence: ++this.sequence } satisfies TransitRequest);
    }
    let buses = 0, trains = 0;
    for (const entry of this.entries.values()) {
      entry.model.show = active;
      if (!active) continue;
      if (!paused) this.matrix(interpolate(entry, now), entry.model.modelMatrix);
      if (entry.model.ready) { if (entry.to.kind === "bus") buses++; else trains++; }
    }
    const canvas = this.viewer.scene.canvas;
    if (canvas.dataset.buses !== String(buses)) canvas.dataset.buses = String(buses);
    if (canvas.dataset.trains !== String(trains)) canvas.dataset.trains = String(trains);
    canvas.dataset.trafficTime = String(Math.floor(hour * 3600 + this.elapsed));
  }
  dispose() {
    this.disposed = true; this.worker?.terminate();
    if (!this.viewer.isDestroyed()) for (const entry of this.entries.values()) this.viewer.scene.primitives.remove(entry.model);
    this.entries.clear(); this.wanted.clear(); this.lighting.destroy();
  }
}
