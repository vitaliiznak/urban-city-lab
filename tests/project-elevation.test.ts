import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {parseBuildingGeometry} from "../../adliswil-explorer/outputs/adliswil/src/real-buildings.js";
import {extractMeasuredWalls} from "../src/facade-tool/extract-wall";
import {projectElevation} from "../src/facade-tool/project-elevation";

const json = (file:string) => JSON.parse(readFileSync(new URL(file,import.meta.url),"utf8"));
const manifest=json("../../adliswil-explorer/outputs/adliswil/public/data/adliswil-buildings.json");
const upload=json("./fixtures/poststrasse-9-upload.json");
test("the real uploaded Poststrasse elevation spans main wall, balcony recess and top storey", () => {
  const raw=gunzipSync(readFileSync(new URL("../../adliswil-explorer/outputs/adliswil/public/data/adliswil-buildings.bin.gz",import.meta.url)));
  const group=parseBuildingGeometry(manifest,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  try {
    const building=manifest.buildings.find((b:{id:string})=>b.id===upload.building.id);
    const collider=manifest.colliders.find((c:{buildingId:string})=>c.buildingId===building.id);
    const heading=Math.PI/2+0.003937;
    const walls=extractMeasuredWalls(group.children,building,collider,heading).map(w=>({...w,visibleBase:Math.max(w.yMin,4.86)}));
    const projected=projectElevation(walls,upload.facade,heading);
    const main=projected.find(f=>{
      const wall=walls.find(w=>w.id===f.wallId)!;
      return wall.plane > -3.3 && wall.normal[0] > 0.99;
    })!;
    assert.ok(main);
    const narrow=main.facade.elements.filter(e=>e.kind==="window"&&e.width<0.1&&e.y>0.2);
    assert.equal(narrow.length,4,"four slit windows stay on the broad front wall");
    const balconyFaces=projected.filter(f=>f.facade.elements.some(e=>e.kind==="balcony"));
    assert.equal(balconyFaces.length,1);
    assert.equal(balconyFaces[0].facade.elements.filter(e=>e.kind==="balcony").length,4);
    const recess=walls.find(w=>w.id===balconyFaces[0].wallId)!;
    assert.ok(recess.plane < -3.5 && recess.plane > -3.8);
    const upper=projected.filter(f=>walls.find(w=>w.id===f.wallId)!.yMin>11);
    assert.equal(upper.reduce((n,f)=>n+f.facade.elements.length,0),3,"use the actual setback at the roof");
    assert.ok(main.facade.elements.some(e=>e.kind==="door"),"shopfront remains above the pavement");
    assert.ok(projected.every(f=>walls.find(w=>w.id===f.wallId)!.normal[0]>0.98),"do not replace unphotographed side walls");
  } finally {
    group.traverse((mesh:any)=>{mesh.geometry?.dispose();if(mesh.material) for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]) m.dispose();});
  }
});
