import {
  Cartesian3,
  CustomShader,
  UniformType,
  VaryingType,
} from "cesium";

export function createFacades() {
  const lon = (8.525 * Math.PI) / 180,
    lat = (47.3115 * Math.PI) / 180;
  return new CustomShader({
    uniforms: {
      u_origin: {
        type: UniformType.VEC3,
        value: Cartesian3.fromDegrees(8.525, 47.3115, 0),
      },
      u_east: {
        type: UniformType.VEC3,
        value: new Cartesian3(-Math.sin(lon), Math.cos(lon), 0),
      },
      u_north: {
        type: UniformType.VEC3,
        value: new Cartesian3(
          -Math.sin(lat) * Math.cos(lon),
          -Math.sin(lat) * Math.sin(lon),
          Math.cos(lat),
        ),
      },
      u_up: {
        type: UniformType.VEC3,
        value: new Cartesian3(
          Math.cos(lat) * Math.cos(lon),
          Math.cos(lat) * Math.sin(lon),
          Math.sin(lat),
        ),
      },
      u_hour: { type: UniformType.FLOAT, value: 17 },
    },
    varyings: { v_local: VaryingType.VEC3, v_normal: VaryingType.VEC3 },
    vertexShaderText: `void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
      vec3 world=(czm_model*vec4(vsInput.attributes.positionMC,1.0)).xyz-u_origin;
      v_local=vec3(dot(world,u_east),dot(world,u_north),dot(world,u_up));
      vec3 normal=normalize(czm_inverseViewRotation*czm_normal*vsInput.attributes.normalMC);
      v_normal=vec3(dot(normal,u_east),dot(normal,u_north),dot(normal,u_up));
    }`,
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      vec3 n=normalize(v_normal);
      float dusk=smoothstep(16.2,18.4,u_hour);
      float id=fract(sin(dot(floor(v_local.xy/16.0),vec2(19.13,47.31)))*91.17);
      material.roughness=0.86;
      if(abs(n.z)<0.25){
        vec2 tangent=normalize(vec2(-n.y,n.x));
        float along=dot(v_local.xy,tangent);
        vec2 cell=vec2(fract(along/3.0)-0.5,fract(v_local.z/3.1)-0.52);
        vec2 aa=clamp(fwidth(cell),vec2(0.006),vec2(0.15));
        vec2 outer=1.0-smoothstep(vec2(.235,.30)-aa,vec2(.235,.30)+aa,abs(cell));
        vec2 inner=1.0-smoothstep(vec2(.195,.255)-aa,vec2(.195,.255)+aa,abs(cell));
        float frame=outer.x*outer.y,glass=inner.x*inner.y;
        float mullion=(1.0-smoothstep(.010,.022,abs(cell.x)))*glass;
        float plaster=.97+.008*sin(along*.7)*sin(v_local.z*.9);
        vec3 plasterTint=mix(vec3(.74,.70,.61),vec3(.62,.58,.52),id);
        vec3 wall=mix(material.diffuse,plasterTint,.34)*plaster;
        vec3 glazing=mix(vec3(.055,.10,.13),vec3(.20,.30,.35),smoothstep(-.2,.25,cell.y));
        float lit=step(0.38,fract(sin(dot(floor(vec2(along/3.0,v_local.z/3.1)),vec2(12.9898,78.233)))*43758.5453))*dusk;
        vec3 lamp=vec3(1.0,0.74,0.38);
        glazing=mix(glazing,lamp,lit*0.88);
        wall=mix(wall,vec3(.86,.83,.74),frame);
        wall=mix(wall,glazing,glass);
        wall=mix(wall,vec3(.66,.65,.60),mullion);
        material.diffuse=wall;
        material.roughness=mix(.9,.22,glass);
        material.specular=vec3(.12)*glass;
        material.emissive=lamp*lit*glass*0.42;
      }else{
        vec3 roof=mix(vec3(.78,.50,.40),vec3(.42,.46,.45),step(.52,id));
        material.diffuse*=mix(vec3(.78),roof,0.55);
        material.roughness=0.92;
      }
    }`,
  });
}
