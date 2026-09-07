import { Axis, Cartesian3, Matrix3, Matrix4, Model, ShadowMode, Transforms, type Viewer, type Cesium3DTileset, type Cesium3DTileContent, type Cesium3DTileFeature } from "cesium";
import { toLocal } from "../collision";
import { createStreetSkyLight } from "../scene-lighting";
import { cabinPoses, type CablewayCatalog } from "./motion";

export class Cableway {
  private catalog?: CablewayCatalog;
  private models: Model[] = [];
  private loading = false;
  private disposed = false;
  private elapsed = 0;
  private replacementVisible = false;
  private matched = new Map<Cesium3DTileContent, Cesium3DTileFeature[]>();
  private removers: (() => void)[] = [];
  private lighting = createStreetSkyLight();
  private frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(8.525, 47.3115, 440));
  constructor(private viewer: Viewer, private report: (status: string) => void) {}
  attachStructures(tileset: Cesium3DTileset) {
    const process = (content: Cesium3DTileContent) => {
      if (!this.catalog) return;
      if (!this.matched.has(content)) {
        const features: Cesium3DTileFeature[] = [];
        for (let i = 0; i < content.featuresLength; i++) {
          const feature = content.getFeature(i);
          if (String(feature.getProperty("UUID") || "").replace(/[{}]/g, "").toUpperCase() === this.catalog.swissFeature.uuid) features.push(feature);
        }
        this.matched.set(content, features);
      }
      for (const feature of this.matched.get(content)!) feature.show = !this.replacementVisible;
      for (const inner of content.innerContents || []) process(inner);
    };
    this.removers.push(tileset.tileVisible.addEventListener((tile) => process(tile.content)));
    const forget = (content: Cesium3DTileContent) => { this.matched.delete(content); for (const inner of content.innerContents || []) forget(inner); };
    this.removers.push(tileset.tileUnload.addEventListener((tile) => forget(tile.content)));
  }
  private async load() {
    this.loading = true;
    try {
      const response = await fetch("/cableway/manifest.json");
      if (!response.ok) throw Error("Cableway unavailable");
      const catalog: CablewayCatalog = await response.json();
      for (const file of ["cables", "cabin", "cabin"]) {
        const model = await Model.fromGltfAsync({ url: `/cableway/${file}.glb`, modelMatrix: Matrix4.clone(this.frame),
          upAxis: Axis.Y, forwardAxis: Axis.X, shadows: ShadowMode.RECEIVE_ONLY, allowPicking: false,
          imageBasedLighting: this.lighting, environmentMapOptions: { enabled: false }, show: false });
        if (this.disposed) { model.destroy(); return; }
        this.viewer.scene.primitives.add(model); this.models.push(model);
      }
      this.catalog = catalog; this.report("Ready");
    } catch { if (!this.disposed) this.report("Cableway unavailable"); }
  }
  update(lon: number, lat: number, active: boolean, paused: boolean, dt: number) {
    if (this.disposed) return;
    const p = toLocal(lon, lat);
    // The full route is one kilometre; a bounded corridor keeps the three models
    // out of town-centre work and loads them before a station comes into view.
    const near = p.x < -200 && p.x > -2000 && p.z > -700 && p.z < 650;
    if (active && near && !this.loading) void this.load();
    const visible = active && near && !!this.catalog;
    for (const model of this.models) model.show = visible;
    this.replacementVisible = visible && this.models[0]?.ready;
    if (visible && !paused) this.elapsed += dt;
    if (visible) {
      const poses = cabinPoses(this.catalog!, this.elapsed);
      for (const pose of poses) {
        const local = Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(pose.angle), new Cartesian3(pose.x, -pose.z, pose.height - 440));
        Matrix4.multiply(this.frame, local, this.models[pose.lane + 1].modelMatrix);
      }
      this.viewer.scene.canvas.dataset.cablewayPositions = JSON.stringify(poses);
    }
    this.viewer.scene.canvas.dataset.cableway = String(this.models.slice(1).filter((model) => model.show && model.ready).length);
    this.viewer.scene.canvas.dataset.replacedCableway = this.replacementVisible && [...this.matched.values()].some((features) => features.length) ? "1" : "0";
  }
  dispose() {
    this.disposed = true;
    this.removers.forEach((remove) => remove());
    for (const features of this.matched.values()) for (const feature of features) feature.show = true;
    this.matched.clear();
    if (!this.viewer.isDestroyed()) for (const model of this.models) this.viewer.scene.primitives.remove(model);
    this.models = []; this.lighting.destroy();
  }
}
