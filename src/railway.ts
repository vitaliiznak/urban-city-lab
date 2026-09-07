import { Cartesian3, ClassificationType, GeometryInstance, GroundPrimitive, MaterialAppearance, Matrix4, PolygonGeometry, PolygonHierarchy, type Viewer } from "cesium";
import { surfaceMaterial } from "./street-cleanup";
import { toGeo, toLocal } from "./collision";

type Cell = { id: string; x: number; z: number; ballast: number[][][]; sleepers: number[][][]; steel: number[][][] };
export class Railway {
  private cells?: Cell[];
  private resident = new Map<string, GroundPrimitive[]>();
  private last = -Infinity;
  private disposed = false;
  private origin = Cartesian3.fromDegrees(8.525, 47.3115);
  private originEye = new Cartesian3();
  private materials = [surfaceMaterial("#86857c", .09, this.originEye), surfaceMaterial("#a5a18f", .04, this.originEye), surfaceMaterial("#9ba6a5", .01, this.originEye)];
  private removeRender: () => void;
  constructor(private viewer: Viewer) {
    this.removeRender = viewer.scene.preRender.addEventListener(() => {
      Matrix4.multiplyByPoint(viewer.camera.viewMatrix, this.origin, this.originEye);
      for (const material of this.materials) material.uniforms.originEye = this.originEye;
    });
    void fetch("/world-details/railway.json").then((r) => { if (!r.ok) throw Error("Railway unavailable"); return r.json(); })
      .then((data) => { if (!this.disposed) this.cells = data.cells; }).catch(() => {});
  }
  update(lon: number, lat: number, active: boolean, now: number) {
    if (!this.cells || this.disposed || now - this.last < 500) return;
    this.last = now;
    const player = toLocal(lon, lat);
    const near = this.cells.map((cell) => ({ cell, distance: Math.hypot(Math.max(cell.x - player.x, 0, player.x - cell.x - 200), Math.max(cell.z - player.z, 0, player.z - cell.z - 200)) }))
      .sort((a, b) => a.distance - b.distance);
    const wanted = new Set(active ? near.filter((c) => c.distance < 200).slice(0, 12).map((c) => c.cell.id) : []);
    for (const [id, primitives] of this.resident) for (const primitive of primitives) primitive.show = wanted.has(id);
    let built = 0;
    for (const { cell } of near) {
      if (!wanted.has(cell.id) || this.resident.has(cell.id)) continue;
      if (built++ >= 2) break;
      const primitives = ["ballast", "sleepers", "steel"].flatMap((kind, i) => {
        const polygons = cell[kind as "ballast" | "sleepers" | "steel"];
        if (!polygons.length) return [];
        const primitive = new GroundPrimitive({
          geometryInstances: polygons.map((p) => new GeometryInstance({ geometry: new PolygonGeometry({
            polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(p.flatMap(([x, z]) => { const p = toGeo({ x, z }); return [p.lon, p.lat]; }))),
            vertexFormat: MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
          }) })),
          appearance: new MaterialAppearance({ material: this.materials[i], translucent: true, faceForward: true }),
          classificationType: ClassificationType.TERRAIN, asynchronous: true, allowPicking: false,
        });
        this.viewer.scene.groundPrimitives.add(primitive);
        return [primitive];
      });
      this.resident.set(cell.id, primitives);
    }
    for (const { cell } of [...near].reverse()) {
      if (this.resident.size <= 18) break;
      if (wanted.has(cell.id)) continue;
      const primitives = this.resident.get(cell.id);
      if (primitives) { for (const p of primitives) this.viewer.scene.groundPrimitives.remove(p); this.resident.delete(cell.id); }
    }
    this.viewer.scene.canvas.dataset.railwayCells = String([...this.resident.values()].filter((p) => p.some((v) => v.show && v.ready)).length);
    this.viewer.scene.requestRender();
  }
  dispose() {
    this.disposed = true; this.removeRender();
    if (!this.viewer.isDestroyed()) for (const primitives of this.resident.values()) for (const p of primitives) this.viewer.scene.groundPrimitives.remove(p);
    this.resident.clear();
    for (const material of this.materials) if (!material.isDestroyed()) material.destroy();
  }
}
