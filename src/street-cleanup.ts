import {
  Cartesian3,
  ClassificationType,
  Color,
  CorridorGeometry,
  CornerType,
  GeometryInstance,
  GroundPrimitive,
  Material,
  MaterialAppearance,
  Matrix4,
  PolygonGeometry,
  PolygonHierarchy,
  type Viewer,
} from "cesium";
import { toLocal } from "./collision";
import roads from "./data/surfaces.json";
import cleanup from "./data/street-cleanup.json";

type Coordinates = number[][];
const format = MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat;
const origin = Cartesian3.fromDegrees(8.525, 47.3115);
const lon = (8.525 * Math.PI) / 180;
const lat = (47.3115 * Math.PI) / 180;

export function surfaceMaterial(color: string, grain: number, originEye: Cartesian3) {
  return new Material({
    fabric: {
      type: "AdliswilStreetSurface",
      uniforms: {
        color: Color.fromCssColorString(color),
        grain,
        originEye,
        east: new Cartesian3(-Math.sin(lon), Math.cos(lon), 0),
        north: new Cartesian3(-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)),
      },
      source: `
        float surfaceNoise(vec2 p) {
          vec2 i=floor(p), f=fract(p);
          f=f*f*(3.0-2.0*f);
          vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
          return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
        }
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material m=czm_getDefaultMaterial(materialInput);
          // Cesium's ground material input omits the homogeneous divide.
          vec4 eye=czm_windowToEyeCoordinates(gl_FragCoord.xy,czm_unpackDepth(texture(czm_globeDepthTexture,gl_FragCoord.xy/czm_viewport.zw)));
          vec3 positionEC=eye.xyz/eye.w;
          vec3 world=mat3(czm_inverseView)*(positionEC-originEye);
          vec2 p=vec2(dot(world,east),dot(world,north));
          float distance=length(positionEC);
          if (distance > 300.0) discard;
          float detail=(surfaceNoise(p*5.0)-0.5)*(1.0-smoothstep(12.0,65.0,distance));
          float variation=(surfaceNoise(p*0.18)-0.5)*0.5+detail;
          m.diffuse=pow(color.rgb,vec3(1.65))+variation*grain;
          m.alpha=color.a*(1.0-smoothstep(180.0,300.0,distance));
          m.specular=0.015;
          m.shininess=6.0;
          return m;
        }`,
    },
    translucent: true,
  });
}

function polygon(id: string, points: Coordinates) {
  return new GeometryInstance({
    id,
    geometry: new PolygonGeometry({
      polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(points.flat())),
      vertexFormat: format,
    }),
  });
}

// Stripes follow the mapped crossing polyline; dimensions are visual assumptions.
function crossingStripes(line: Coordinates, width: number, id: string) {
  const local = line.map(([x, y]) => [(x - 8.525) * 75476.3124707444, (y - 47.3115) * 111320]);
  const stripes: GeometryInstance[] = [];
  let travelled = 0;
  for (let i = 1; i < local.length; i++) {
    const a = local[i - 1], b = local[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.01) continue;
    const dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length;
    for (let offset = Math.max(0.15, Math.ceil(travelled) - travelled); offset + 0.5 < length; offset += 1) {
      const points = [[offset, -width / 2], [offset + 0.5, -width / 2], [offset + 0.5, width / 2], [offset, width / 2]].map(([s, t]) => [
        8.525 + (a[0] + dx * s - dy * t) / 75476.3124707444,
        47.3115 + (a[1] + dy * s + dx * t) / 111320,
      ]);
      stripes.push(polygon(`crossing-${id}-${i}-${offset}`, points));
    }
    travelled += length;
  }
  return stripes;
}

export function addStreetCleanup(viewer: Viewer) {
  type Cell = { id: string; bounds: number[]; groups: (() => GeometryInstance[])[][] };
  const cells = new Map<string, Cell>();
  const resident = new Map<string, GroundPrimitive[]>();
  const markings = new Set<GroundPrimitive>();
  const originEye = new Cartesian3();
  const materials = [surfaceMaterial("#797c78", .055, originEye), surfaceMaterial("#a49e8d", .045, originEye),
    surfaceMaterial("#a59e88", .10, originEye), surfaceMaterial("#f4ce64", .02, originEye)];
  const removePreRender = viewer.scene.preRender.addEventListener(() => {
    Matrix4.multiplyByPoint(viewer.camera.viewMatrix, origin, originEye);
    materials.forEach((m) => { m.uniforms.originEye = originEye; });
  });
  let enabled = false, disposed = false, last = -Infinity;
  function add(points: Coordinates, margin: number, kind: number, geometry: () => GeometryInstance[]) {
    if (!points.length) return;
    const local = points.map(([lon, lat]) => toLocal(lon, lat));
    const bounds = [Math.min(...local.map((p) => p.x)) - margin, Math.min(...local.map((p) => p.z)) - margin,
      Math.max(...local.map((p) => p.x)) + margin, Math.max(...local.map((p) => p.z)) + margin];
    const id = `${Math.floor((bounds[0] + bounds[2]) / 400)}:${Math.floor((bounds[1] + bounds[3]) / 400)}`;
    let cell = cells.get(id);
    if (!cell) { cell = { id, bounds: [...bounds], groups: [[], [], [], []] }; cells.set(id, cell); }
    cell.bounds = [Math.min(cell.bounds[0], bounds[0]), Math.min(cell.bounds[1], bounds[1]),
      Math.max(cell.bounds[2], bounds[2]), Math.max(cell.bounds[3], bounds[3])];
    cell.groups[kind].push(geometry);
  }
  const crossingIds = new Set(cleanup.crossings.map((c) => c.id));
  const pavedPaths = new Map(cleanup.pavedPaths.map((p) => [p.id, p.surface]));
  for (const r of roads.surfaces) {
    if (r.coordinates.length < 2) continue;
    const crossing = crossingIds.has(`way/${r.id}`), surface = pavedPaths.get(r.id);
    if (r.type !== "road" && !crossing && !surface) continue;
    add(r.coordinates, r.width, !crossing && surface && surface !== "asphalt" ? 1 : 0, () => [new GeometryInstance({
      id: `clean-road-${r.id}`, geometry: new CorridorGeometry({ positions: Cartesian3.fromDegreesArray(r.coordinates.flat()),
        width: r.width, cornerType: CornerType.ROUNDED, vertexFormat: format, granularity: .00002 }),
    })]);
  }
  for (const p of cleanup.parking) add(p.coordinates, 0,
    ["gravel", "fine_gravel", "compacted", "unpaved", "ground"].includes(p.surface) ? 2 : 0,
    () => [polygon(`clean-parking-${p.id}`, p.coordinates)]);
  for (const c of cleanup.crossings) add(c.coordinates, c.width, 3, () => crossingStripes(c.coordinates, c.width, c.id));
  return {
    setEnabled(value: boolean) {
      if (enabled === value) return;
      enabled = value; last = -Infinity;
      if (!value) for (const primitives of resident.values()) primitives.forEach((p) => { p.show = false; });
    },
    update(lon: number, lat: number, now: number) {
      if (disposed || now - last < 500) return;
      last = now;
      const point = toLocal(lon, lat);
      const near = [...cells.values()].map((cell) => ({ cell, distance: Math.hypot(
        Math.max(cell.bounds[0] - point.x, 0, point.x - cell.bounds[2]),
        Math.max(cell.bounds[1] - point.z, 0, point.z - cell.bounds[3])) })).sort((a, b) => a.distance - b.distance);
      const wanted = new Set(enabled ? near.filter((c) => c.distance < 330).slice(0, 32).map((c) => c.cell.id) : []);
      for (const [id, primitives] of resident) primitives.forEach((p) => { p.show = wanted.has(id); });
      let pending = [...resident.values()].filter((ps) => ps.some((p) => !p.ready && p.show)).length;
      for (const { cell } of near) {
        if (pending >= 2) break;
        if (!wanted.has(cell.id) || resident.has(cell.id)) continue;
        pending++;
        const primitives = cell.groups.flatMap((factories, kind) => {
          if (!factories.length) return [];
          const primitive = new GroundPrimitive({ geometryInstances: factories.flatMap((build) => build()),
            appearance: new MaterialAppearance({ material: materials[kind], translucent: true, faceForward: true }),
            classificationType: ClassificationType.TERRAIN, asynchronous: true, allowPicking: false });
          viewer.scene.groundPrimitives.add(primitive);
          if (kind === 3) markings.add(primitive);
          return [primitive];
        });
        resident.set(cell.id, primitives);
      }
      // A section arriving later must not cover a neighboring crossing.
      for (const marking of markings) viewer.scene.groundPrimitives.raiseToTop(marking);
      for (const { cell } of [...near].reverse()) {
        if (resident.size <= 40) break;
        if (wanted.has(cell.id)) continue;
        resident.get(cell.id)?.forEach((p) => { markings.delete(p); viewer.scene.groundPrimitives.remove(p); }); resident.delete(cell.id);
      }
      viewer.scene.canvas.dataset.streetSurfaceCells = String([...resident.values()].filter((ps) => ps.some((p) => p.show && p.ready)).length);
    },
    dispose() {
      disposed = true; removePreRender();
      if (!viewer.isDestroyed()) for (const primitives of resident.values()) primitives.forEach((p) => viewer.scene.groundPrimitives.remove(p));
      resident.clear(); cells.clear(); markings.clear();
      materials.forEach((m) => { if (!m.isDestroyed()) m.destroy(); });
    },
  };
}
