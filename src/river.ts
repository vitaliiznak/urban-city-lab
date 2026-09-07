import { Cartesian3, ClassificationType, GeometryInstance, GroundPrimitive, Material, MaterialAppearance, Matrix4, PolygonGeometry, PolygonHierarchy, type Viewer } from "cesium";
import { toGeo } from "./collision";
type Ring = number[][];

export class River {
  private primitive?: GroundPrimitive;
  private loading = false;
  private disposed = false;
  private elapsed = 0;
  private origin = Cartesian3.fromDegrees(8.525, 47.3115);
  private originEye = new Cartesian3();
  private material: Material;
  private removeRender: () => void;
  constructor(private viewer: Viewer) {
    const lon = 8.525 * Math.PI / 180, lat = 47.3115 * Math.PI / 180;
    this.material = new Material({ fabric: { type: "AdliswilRiver", uniforms: {
      time: 0, originEye: this.originEye,
      east: new Cartesian3(-Math.sin(lon), Math.cos(lon), 0),
      north: new Cartesian3(-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)),
      up: new Cartesian3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)),
    }, source: `czm_material czm_getMaterial(czm_materialInput materialInput) {
      czm_material m=czm_getDefaultMaterial(materialInput);
      // GroundPrimitive passes homogeneous eye coordinates to its material.
      // Divide by w before evaluating ripples in metres or distance fading.
      vec4 eye=czm_windowToEyeCoordinates(gl_FragCoord.xy,czm_unpackDepth(texture(czm_globeDepthTexture,gl_FragCoord.xy/czm_viewport.zw)));
      vec3 positionEC=eye.xyz/eye.w;
      if (length(positionEC) > 350.0) discard;
      vec3 world=mat3(czm_inverseView)*(positionEC-originEye);
      vec2 p=vec2(dot(world,east),dot(world,north));
      float wave=sin(p.x*2.3+p.y*1.1-time*1.4)*sin(p.y*3.7-time*.9);
      float broad=sin(p.x*.13+p.y*.19-time*.15);
      float ripple=pow(max(0.0,sin(p.y*5.1+p.x*.6+sin(p.x*1.4)-time*1.8)),14.0);
      ripple*=smoothstep(-.15,.7,sin(p.x*1.7+p.y*.8-time*.3));
      vec3 normal=normalize(vec3(cos(p.x*2.3+p.y*1.1-time*1.4)*.08,cos(p.y*3.7-time*.9)*.07,1.0));
      m.normal=normalize(materialInput.tangentToEyeMatrix*normal);
      m.diffuse=vec3(.085,.205,.18)+wave*.025+broad*.018+vec3(.10,.13,.13)*ripple;
      m.specular=.35; m.shininess=35.0;
      float horizontal=abs(dot(czm_inverseViewRotation*materialInput.normalEC,up));
      m.alpha=(1.0-smoothstep(180.0,350.0,length(positionEC)))*smoothstep(.45,.8,horizontal);
      return m;
    }` }, translucent: true });
    this.removeRender = viewer.scene.preRender.addEventListener(() => {
      Matrix4.multiplyByPoint(viewer.camera.viewMatrix, this.origin, this.originEye);
      this.material.uniforms.originEye = this.originEye;
      this.material.uniforms.time = this.elapsed;
    });
  }
  private async load() {
    this.loading = true;
    try {
      const response = await fetch("/population/river.json");
      if (!response.ok) return;
      const data: { polygons: { id: number; p: Ring; holes: Ring[] }[] } = await response.json();
      if (this.disposed) return;
      const hierarchy = (ring: Ring, holes: Ring[] = []): PolygonHierarchy => new PolygonHierarchy(
        Cartesian3.fromDegreesArray(ring.flatMap(([x, z]) => { const p = toGeo({ x, z }); return [p.lon, p.lat]; })),
        holes.map((ring) => hierarchy(ring)));
      this.primitive = new GroundPrimitive({ geometryInstances: data.polygons.map((water) => new GeometryInstance({
        id: `sihl-${water.id}`, geometry: new PolygonGeometry({ polygonHierarchy: hierarchy(water.p, water.holes), vertexFormat: MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat }),
      })), appearance: new MaterialAppearance({ material: this.material, translucent: true, faceForward: true }),
      classificationType: ClassificationType.TERRAIN, asynchronous: true, allowPicking: false, show: false });
      this.viewer.scene.groundPrimitives.add(this.primitive);
    } catch { /* Retain the original imagery if the local surface cannot load. */ }
  }
  update(active: boolean, paused: boolean, dt: number) {
    if (active && !this.loading) void this.load();
    if (active && !paused) this.elapsed += dt;
    if (this.primitive) this.primitive.show = active;
    this.viewer.scene.canvas.dataset.riverSurface = String(!!this.primitive?.ready && active);
  }
  dispose() {
    this.disposed = true; this.removeRender();
    if (!this.viewer.isDestroyed() && this.primitive) this.viewer.scene.groundPrimitives.remove(this.primitive);
    if (!this.material.isDestroyed()) this.material.destroy();
  }
}
