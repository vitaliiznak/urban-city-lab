import { Cartesian3, Material } from "cesium";
import landcover from "./data/landcover.json";
import obstacles from "./data/obstacles.json";
import surfaces from "./data/surfaces.json";
import { toLocal } from "./collision";

export function createGameGround() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 2048;
  const ctx = canvas.getContext("2d")!;
  const bounds = { minX: -2000, maxX: 1600, minZ: -2500, maxZ: 3100 };
  const pixel = ([x, z]: number[]) => [
    ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * canvas.width,
    ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * canvas.height,
  ];
  const draw = (rings: number[][][], color: string) => {
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach((p, i) => {
        const [x, y] = pixel(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fillStyle = color;
    ctx.fill("evenodd");
  };
  ctx.fillStyle = "#7f8174";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const green = new Set([
    "forest",
    "wood",
    "meadow",
    "pitch",
    "allotments",
    "garden",
    "grassland",
    "park",
    "recreation_ground",
    "grass",
    "farmland",
    "scrub",
    "nature_reserve",
  ]);
  for (const l of [...landcover].sort(
    (a, b) => Number(green.has(a.kind)) - Number(green.has(b.kind)),
  ))
    draw(
      [l.p, ...l.holes],
      green.has(l.kind)
        ? ["forest", "wood"].includes(l.kind)
          ? "#4f6146"
          : "#7f8a62"
        : ["industrial", "commercial", "retail", "railway"].includes(l.kind)
          ? "#7e8078"
          : "#9e9a8b",
    );
  for (const water of obstacles.water)
    draw([water.p], water.role === "inner" ? "#7f8a62" : "#3f6d6d");
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const meters = canvas.width / (bounds.maxX - bounds.minX);
  for (const surface of surfaces.surfaces) {
    if (surface.coordinates.length < 2) continue;
    ctx.beginPath();
    surface.coordinates.forEach((c, i) => {
      const local = toLocal(c[0], c[1]);
      const [x, y] = pixel([local.x, local.z]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineWidth = Math.max(1.1, surface.width * meters);
    ctx.strokeStyle = surface.type === "road" ? "#5c605c" : "#8f8b7c";
    ctx.stroke();
  }
  const lon = (8.525 * Math.PI) / 180,
    lat = (47.3115 * Math.PI) / 180;
  return new Material({
    fabric: {
      type: "AdliswilGameGround",
      uniforms: {
        enabled: 0,
        landcover: canvas,
        origin: Cartesian3.fromDegrees(8.525, 47.3115, 0),
        east: new Cartesian3(-Math.sin(lon), Math.cos(lon), 0),
        north: new Cartesian3(
          -Math.sin(lat) * Math.cos(lon),
          -Math.sin(lat) * Math.sin(lon),
          Math.cos(lat),
        ),
      },
      source: `
    float grain(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    czm_material czm_getMaterial(czm_materialInput materialInput){
      czm_material m=czm_getDefaultMaterial(materialInput);
      vec3 world=(czm_inverseView*vec4(-materialInput.positionToEyeEC,1.0)).xyz-origin;
      vec2 local=vec2(dot(world,east),-dot(world,north));
      vec2 uv=(local-vec2(-2000.0,-2500.0))/vec2(3600.0,5600.0);
      vec3 base=texture(landcover,vec2(uv.x,1.0-uv.y)).rgb;
      float grainSize=0.014*(grain(floor(local*.12))-.5)+0.007*sin(local.x*.73)*cos(local.y*.61);
      m.diffuse=pow(base,vec3(1.55))+grainSize;m.specular=.03;m.shininess=10.0;
      m.alpha=enabled*(1.0-smoothstep(160.0,240.0,length(materialInput.positionToEyeEC)))*step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
      return m;
    }`,
    },
  });
}
