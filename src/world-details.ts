import { createStreetSkyLight } from "./scene-lighting";
import { streetObstacles, toLocal, type StreetObstacle } from "./collision";
import {
  Axis, Cartesian3, Matrix4, Model, ShadowMode, Transforms,
  type Viewer, type Cesium3DTileset, type Cesium3DTileContent,
} from "cesium";

type Cell = { file: string; x: number; z: number; bytes: number; bounds: { min: number[]; max: number[] }; obstacles?: StreetObstacle[] };
type Catalog = {
  projection: { lon: number; lat: number; scale: number; heightOrigin: number; metresPerLonDegree: number; metresPerLatDegree: number };
  street: { cells: Cell[] };
  architecture: { cells: Cell[]; buildings: { id: string }[] };
};

export class WorldDetails {
  private catalog?: Catalog;
  private lighting = createStreetSkyLight();
  private loading = 0;
  private disposed = false;
  private lastUpdate = -Infinity;
  private desired = new Set<string>();
  private resident = new Map<string, Model>();
  private pending = new Set<string>();
  private failed = new Set<string>();
  private architecture: Model[] = [];
  private architectureStarted = false;
  private architectureReady = false;
  private architectureVisible = false;
  private replacementIds = new Set<string>();
  private matchedIds = new Set<string>();
  private visited = new WeakMap<object, boolean>();
  private removers: (() => void)[] = [];
  private frame?: Matrix4;
  private active = false;
  constructor(private viewer: Viewer, private report: (status: string) => void) {
    fetch("/world-details/manifest.json")
      .then((r) => { if (!r.ok) throw Error("World catalog unavailable"); return r.json() as Promise<Catalog>; })
      .then((catalog) => {
        if (this.disposed) return;
        this.catalog = catalog;
        const p = catalog.projection;
        this.frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(p.lon, p.lat, p.heightOrigin));
        this.replacementIds = new Set(catalog.architecture.buildings.map((b) => b.id.toUpperCase()));
        this.report("Ready to explore");
      })
      .catch(() => { if (!this.disposed) this.report("Local details unavailable"); });
  }
  attachBuildings(tileset: Cesium3DTileset) {
    const process = (content: Cesium3DTileContent) => {
      if (this.visited.get(content) === this.architectureVisible) return;
      for (let i = 0; i < content.featuresLength; i++) {
        const feature = content.getFeature(i);
        const id = String(feature.getProperty("UUID") || "").replace(/[{}]/g, "").toUpperCase();
        if (this.replacementIds.has(id)) {
          feature.show = !this.architectureVisible;
          this.matchedIds.add(id);
        }
      }
      content.innerContents?.forEach(process);
      this.visited.set(content, this.architectureVisible);
    };
    this.removers.push(tileset.tileVisible.addEventListener((tile) => process(tile.content)));
  }
  private async model(cell: Cell) {
    const scale = this.catalog!.projection.scale;
    const matrix = Matrix4.multiplyByTranslation(this.frame!, new Cartesian3(cell.x / scale, -cell.z / scale, 0), new Matrix4());
    const model = await Model.fromGltfAsync({
      url: `/world-details/${cell.file}`,
      modelMatrix: matrix,
      scale: 1 / scale,
      upAxis: Axis.Y,
      forwardAxis: Axis.X,
      shadows: ShadowMode.RECEIVE_ONLY,
      imageBasedLighting: this.lighting,
      environmentMapOptions: { enabled: false },
      allowPicking: false,
      incrementallyLoadTextures: false,
      // A visible update is required before Cesium raises readyEvent.
      show: true,
    });
    if (this.disposed || this.viewer.isDestroyed()) { model.destroy(); return undefined; }
    this.viewer.scene.primitives.add(model);
    this.viewer.scene.requestRender();
    return model;
  }
  private async loadArchitecture() {
    this.architectureStarted = true;
    try {
      for (const cell of this.catalog!.architecture.cells) {
        const model = await this.model(cell);
        if (!model) return;
        this.architecture.push(model);
        await new Promise<void>((resolve, reject) => {
          if (model.ready) { resolve(); return; }
          const ready = model.readyEvent.addEventListener(() => { ready(); error(); resolve(); });
          const error = model.errorEvent.addEventListener(() => { ready(); error(); reject(Error("Landmark model failed")); });
        });
        if (this.disposed) return;
        model.show = false;
      }
      this.architectureReady = true;
      this.visited = new WeakMap();
      this.report("Ready");
      this.viewer.scene.requestRender();
    } catch {
      // Preserve the streamed buildings if the local replacement cannot finish.
      this.architecture.forEach((m) => { m.show = false; });
      if (!this.disposed) this.report("Some landmarks unavailable");
    }
  }
  update(lon: number, lat: number, active: boolean, now: number) {
    this.active = active;
    if (!this.catalog || this.disposed || now - this.lastUpdate < 350) return;
    this.lastUpdate = now;
    if (active && !this.architectureStarted) void this.loadArchitecture();
    const visible = this.architectureReady && (active || this.viewer.camera.positionCartographic.height < 1100);
    if (visible !== this.architectureVisible) {
      this.architectureVisible = visible;
      this.visited = new WeakMap();
      this.architecture.forEach((m) => { m.show = visible; });
      this.viewer.scene.requestRender();
    }
    const p = this.catalog.projection;
    const x = (lon - p.lon) * p.metresPerLonDegree * p.scale;
    const z = (p.lat - lat) * p.metresPerLatDegree * p.scale;
    const near = this.catalog.street.cells.map((c) => {
      const b = c.bounds;
      const dx = Math.max(c.x + b.min[0] - x, 0, x - c.x - b.max[0]);
      const dz = Math.max(c.z + b.min[2] - z, 0, z - c.z - b.max[2]);
      return { c, distance: Math.hypot(dx, dz) / p.scale };
    }).sort((a, b) => a.distance - b.distance);
    this.desired = new Set(active ? near.filter((n) => n.distance < 140).slice(0, 24).map((n) => n.c.file) : []);
    for (const [file, model] of this.resident) model.show = this.desired.has(file);
    for (const n of [...near].reverse()) {
      if (this.resident.size <= 40) break;
      if (this.desired.has(n.c.file)) continue;
      const model = this.resident.get(n.c.file);
      if (model) { this.viewer.scene.primitives.remove(model); this.resident.delete(n.c.file); }
    }
    this.fillQueue();
    const visibleObstacles = this.catalog.street.cells.flatMap((cell) => {
      const model = this.resident.get(cell.file);
      return model?.ready && model.show ? cell.obstacles || [] : [];
    });
    streetObstacles.update(visibleObstacles, toLocal(lon, lat));
    this.viewer.scene.canvas.dataset.streetObstacles = String(streetObstacles.size);
    this.viewer.scene.canvas.dataset.worldCells = String([...this.resident.values()].filter((m) => m.ready && m.show).length);
    this.viewer.scene.canvas.dataset.worldLandmarks = String(this.architectureReady);
    this.viewer.scene.canvas.dataset.replacedBuildings = String(this.architectureVisible ? this.matchedIds.size : 0);
  }
  private fillQueue() {
    if (!this.catalog || this.disposed || !this.active) return;
    for (const file of this.desired) {
      if (this.loading >= 2) return;
      if (this.resident.has(file) || this.pending.has(file) || this.failed.has(file)) continue;
      while (this.resident.size + this.pending.size >= 40) {
        const stale = [...this.resident].find(([key]) => !this.desired.has(key));
        if (!stale) return;
        this.viewer.scene.primitives.remove(stale[1]);
        this.resident.delete(stale[0]);
      }
      this.loading++; this.pending.add(file);
      const cell = this.catalog.street.cells.find((c) => c.file === file)!;
      void this.model(cell).then((model) => {
        if (!model) return;
        this.resident.set(file, model);
        model.show = this.desired.has(file);
      }).catch(() => {
        this.failed.add(file);
        if (!this.disposed) this.report("Some street details unavailable");
      }).finally(() => { this.loading--; this.pending.delete(file); this.fillQueue(); });
    }
  }
  dispose() {
    this.disposed = true;
    streetObstacles.clear();
    this.removers.forEach((remove) => remove());
    if (!this.viewer.isDestroyed()) {
      [...this.resident.values(), ...this.architecture].forEach((m) => this.viewer.scene.primitives.remove(m));
    }
    this.resident.clear(); this.architecture = [];
    this.lighting.destroy();
  }
}
