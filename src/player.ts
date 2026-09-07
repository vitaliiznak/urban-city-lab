import { createStreetSkyLight } from "./scene-lighting";
import { BridgeHeight } from "./bridge-height";
import { terrainCamera } from "./terrain-camera";
import {
  Cartesian3,
  Cartographic,
  HeadingPitchRange,
  HeadingPitchRoll,
  Math as CMath,
  Matrix4,
  Model,
  ModelAnimationLoop,
  Ray,
  ShadowMode,
  Transforms,
  sampleTerrainMostDetailed,
  type Viewer,
} from "cesium";
import { nearestPath, type Destination } from "./world";
import {
  cameraClearance,
  moveWithCollisions,
  obstacleAt,
  onBridge,
  RUN_SPEED,
  WALK_SPEED,
  toGeo,
  toLocal,
} from "./collision";
export type PlayerLocation = {
  lon: number;
  lat: number;
  altitude: number;
  heading: number;
  motion: string;
  obstacle: string | null;
};
export class Player {
  model: Model | undefined;
  active = false;
  ready = false;
  heading = 0;
  pitch = -0.16;
  distance = 6;
  position = { lon: 8.52569, lat: 47.3116, ground: 490 };
  motion = "Idle";
  obstacle: string | null = null;
  private facing = 0;
  private lighting = createStreetSkyLight();
  private token = 0;
  private animation = "";
  private cameraLimit = 14;
  private bridgeHeight = new BridgeHeight();
  private lastCameraProbe = 0;
  private lastCameraState = "";
  private lastCameraUpdate = 0;
  private removeReady: (() => void) | undefined;
  constructor(
    private viewer: Viewer,
    private terrainOnlyObjects: object[],
  ) {}
  async load() {
    const model = await Model.fromGltfAsync({
      url: "/explorer.glb",
      modelMatrix: Transforms.eastNorthUpToFixedFrame(
        Cartesian3.fromDegrees(this.position.lon, this.position.lat, 0),
      ),
      scale: 0.9,
      shadows: ShadowMode.ENABLED,
      imageBasedLighting: this.lighting,
      environmentMapOptions: { enabled: false },
      show: false,
    });
    if (this.viewer.isDestroyed()) {
      model.destroy();
      return;
    }
    this.model = model;
    model.activeAnimations.animateWhilePaused = true;
    this.terrainOnlyObjects.push(model);
    this.viewer.scene.primitives.add(model);
    // Hidden models still need one visible update to compile and load animations.
    model.show = true;
    this.removeReady = model.readyEvent.addEventListener(() => {
      this.ready = true;
      model.show = this.active;
      this.viewer.scene.requestRender();
    });
    this.viewer.scene.requestRender();
  }
  stop() {
    this.token++;
    this.active = false;
    this.lastCameraState = "";
    if (this.model) this.model.show = false;
    this.viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  }
  async enter(destination: Destination) {
    this.bridgeHeight.clear();
    const token = ++this.token;
    this.active = false;
    const nearest = nearestPath(destination.lon, destination.lat);
    let spawn = { lon: nearest.lon, lat: nearest.lat };
    if (obstacleAt(toLocal(spawn.lon, spawn.lat))) {
      let found = false;
      for (let radius = 1; radius <= 25 && !found; radius += 1)
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
          const p = {
            lon: spawn.lon + (Math.sin(angle) * radius) / 75476,
            lat: spawn.lat + (Math.cos(angle) * radius) / 111320,
          };
          if (!obstacleAt(toLocal(p.lon, p.lat))) {
            spawn = p;
            found = true;
            break;
          }
        }
      if (!found) throw Error("No clear arrival point is available here.");
    }
    let ground = this.viewer.scene.globe.getHeight(
      Cartographic.fromDegrees(spawn.lon, spawn.lat),
    );
    try {
      const sampled = sampleTerrainMostDetailed(this.viewer.terrainProvider, [
        Cartographic.fromDegrees(spawn.lon, spawn.lat),
      ]);
      const points = await Promise.race([
        sampled,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(Error("Terrain timeout")), 12000),
        ),
      ]);
      ground = points[0].height;
    } catch {
      if (ground === undefined)
        throw Error("Ground height could not load. Please try entering again.");
    }
    if (token !== this.token || this.viewer.isDestroyed()) return;
    this.position = { ...spawn, ground: ground! };
    this.heading = CMath.toRadians(destination.heading);
    this.facing = this.heading;
    this.pitch = -0.16;
    this.distance = 6;
    this.motion = "Idle";
    this.obstacle = null;
    this.active = true;
    if (this.model) this.model.show = true;
    this.update(new Set(), 0, false, false);
    this.viewer.scene.canvas.focus();
  }
  update(keys: Set<string>, dt: number, paused: boolean, run: boolean) {
    if (!this.active || !this.model) return;
    if (paused) {
      this.motion = "Idle";
      this.setAnimation("Idle");
      return;
    }
    if (keys.has("arrowleft") || keys.has("q")) this.heading -= dt * 1.7;
    if (keys.has("arrowright") || keys.has("r")) this.heading += dt * 1.7;
    if (keys.has("arrowup"))
      this.pitch = Math.min(-0.08, this.pitch + dt * 0.7);
    if (keys.has("arrowdown"))
      this.pitch = Math.max(-1.1, this.pitch - dt * 0.7);
    const forward = Number(keys.has("w")) - Number(keys.has("s")),
      side = Number(keys.has("d")) - Number(keys.has("a"));
    const fast = keys.has("shift") || run,
      speed = fast ? RUN_SPEED : WALK_SPEED,
      step =
        (speed * Math.min(dt, 0.05)) / Math.max(1, Math.hypot(forward, side));
    const dx =
        (Math.sin(this.heading) * forward + Math.cos(this.heading) * side) *
        step,
      dz =
        (-Math.cos(this.heading) * forward + Math.sin(this.heading) * side) *
        step;
    const start = toLocal(this.position.lon, this.position.lat);
    const moved = moveWithCollisions(start, dx, dz),
      next = toGeo(moved.position);
    let ground = this.viewer.scene.globe.getHeight(
      Cartographic.fromDegrees(next.lon, next.lat),
    );
    const bridge = onBridge(moved.position);
    if (bridge && this.viewer.scene.sampleHeightSupported) {
      const deck = this.bridgeHeight.sample(moved.position, performance.now(), () => this.viewer.scene.sampleHeight(
        Cartographic.fromDegrees(next.lon, next.lat),
        this.terrainOnlyObjects,
      ));
      ground = Math.max(
        ground ?? this.position.ground,
        deck ?? this.position.ground,
      );
    }
    const distance = Math.hypot(
      moved.position.x - start.x,
      moved.position.z - start.z,
    );
    this.obstacle = moved.obstacle;
    if (
      distance > 0.001 &&
      ground !== undefined &&
      Math.abs(ground - this.position.ground) > Math.max(0.5, distance * 1.3) &&
      !bridge
    ) {
      this.obstacle = "Steep ground";
    } else {
      this.position = { ...next, ground: ground ?? this.position.ground };
    }
    const changed =
      Math.hypot(
        (this.position.lon - next.lon) * 75476,
        (this.position.lat - next.lat) * 111320,
      ) < 0.001 && distance > 0.001;
    this.motion = changed ? (fast ? "Run" : "Walk") : "Idle";
    if (changed) {
      const target = Math.atan2(dx, -dz),
        delta = Math.atan2(
          Math.sin(target - this.facing),
          Math.cos(target - this.facing),
        );
      this.facing += delta * Math.min(1, dt * 13);
    }
    const feet = Cartesian3.fromDegrees(
      this.position.lon,
      this.position.lat,
      this.position.ground + 0.08,
    );
    this.model.modelMatrix = Transforms.headingPitchRollToFixedFrame(
      feet,
      new HeadingPitchRoll(this.facing - Math.PI / 2, 0, 0),
    );
    this.setAnimation(this.motion);
    this.followCamera();
    this.viewer.scene.requestRender();
  }
  private setAnimation(name: string) {
    if (!this.model?.ready || this.animation === name) return;
    this.model.activeAnimations.removeAll();
    const started = performance.now();
    this.model.activeAnimations.add({
      name,
      loop: ModelAnimationLoop.REPEAT,
      animationTime: (duration) =>
        (((performance.now() - started) / 1000) % duration) / duration,
    });
    this.animation = name;
  }
  private followCamera() {
    const now = performance.now();
    const state = `${this.position.lon}:${this.position.lat}:${this.position.ground}:${this.heading}:${this.pitch}:${this.distance}`;
    // Keep a slow refresh for newly streamed obstacles; unchanged cameras need no GPU ray readback.
    if (state === this.lastCameraState && now - this.lastCameraUpdate < 1000) return;
    this.lastCameraState = state;
    this.lastCameraUpdate = now;
    const target = Cartesian3.fromDegrees(
      this.position.lon,
      this.position.lat,
      this.position.ground + 1.35,
    );
    let distance = cameraClearance(
      toLocal(this.position.lon, this.position.lat),
      this.heading,
      this.pitch,
      this.distance,
    );
    const frame = Transforms.eastNorthUpToFixedFrame(target);
    const offsetAt = (d: number, pitch: number) => new Cartesian3(
      -Math.sin(this.heading) * Math.cos(pitch) * d,
      -Math.cos(this.heading) * Math.cos(pitch) * d,
      -Math.sin(pitch) * d,
    );
    const terrainView = terrainCamera(this.pitch, distance, (d, pitch) => {
      const world = Matrix4.multiplyByPoint(frame, offsetAt(d, pitch), new Cartesian3());
      const point = Cartographic.fromCartesian(world);
      const height = this.viewer.scene.globe.getHeight(point);
      return height === undefined || point.height >= height + .3;
    });
    distance = terrainView.distance;
    if (performance.now() - this.lastCameraProbe > 160) {
      const offset = offsetAt(distance, terrainView.pitch);
      const end = Matrix4.multiplyByPoint(
        Transforms.eastNorthUpToFixedFrame(target), offset, new Cartesian3(),
      );
      const hit = this.renderedObstacleDistance(target, end);
      this.cameraLimit = hit !== undefined && hit < distance
        ? Math.max(.7, hit - .35) : this.distance;
      this.lastCameraProbe = performance.now();
    }
    distance = Math.min(distance, this.cameraLimit);
    this.viewer.camera.lookAt(
      target,
      new HeadingPitchRange(this.heading, terrainView.pitch, distance),
    );
    this.viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    const camera = this.viewer.camera.positionCartographic,
      ground = this.viewer.scene.globe.getHeight(camera);
    if (ground !== undefined && camera.height < ground + 0.35)
      this.viewer.camera.setView({
        destination: Cartesian3.fromRadians(
          camera.longitude,
          camera.latitude,
          ground + 0.35,
        ),
      });
  }
  private renderedObstacleDistance(start: Cartesian3, end: Cartesian3) {
    // Cesium 1.145 exposes this ray query at runtime, outside its public type declarations.
    const scene = this.viewer.scene as typeof this.viewer.scene & {
      pickFromRay?: (ray: Ray, exclude: object[], width: number) => { position?: Cartesian3 } | undefined;
    };
    if (!scene.pickFromRay || !this.model?.ready) return undefined;
    const direction = Cartesian3.normalize(Cartesian3.subtract(end, start, new Cartesian3()), new Cartesian3());
    try {
      const hit = scene.pickFromRay(new Ray(start, direction), [this.model], .12);
      return hit?.position ? Cartesian3.distance(start, hit.position) : undefined;
    } catch { return undefined; }
  }
  location(): PlayerLocation {
    return {
      lon: this.position.lon,
      lat: this.position.lat,
      altitude: this.position.ground,
      heading: CMath.toDegrees(this.heading + Math.PI * 2) % 360,
      motion: this.motion,
      obstacle: this.obstacle,
    };
  }
  dispose() {
    this.token++;
    this.removeReady?.();
    this.lighting.destroy();
  }
}
