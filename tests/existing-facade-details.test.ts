import test from "node:test";
import assert from "node:assert/strict";
import { Group, BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial } from "three";
import { hideExistingFacadeDetails } from "../src/facade-tool/existing-details";

test("photo replacement removes only its UUID index ranges and restores the original buffers", () => {
  const group = new Group();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(new Array(27).fill(0), 3));
  geometry.setIndex([0,1,2,3,4,5,6,7,8]);
  const mesh = new Mesh(geometry,new MeshBasicMaterial());
  mesh.userData.buildingRanges = [
    {buildingId:"neighbour",start:0,count:3},
    {buildingId:"target",start:3,count:3},
    {buildingId:"neighbour",start:6,count:3},
  ];
  const sign = new Mesh(new BufferGeometry(),new MeshBasicMaterial());
  sign.userData.buildingId = "target";
  group.add(mesh,sign);
  const original = geometry.index;
  try {
    const restore = hideExistingFacadeDetails(group,"target");
    assert.deepEqual(Array.from(geometry.index!.array),[0,1,2,6,7,8]);
    assert.equal(sign.visible,false);
    restore();
    assert.equal(geometry.index,original);
    assert.equal(sign.visible,true);
    const undoMissing = hideExistingFacadeDetails(group,"missing");
    assert.equal(geometry.index,original);
    undoMissing();
  } finally {
    geometry.dispose(); sign.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose(); (sign.material as MeshBasicMaterial).dispose();
  }
});

test("replacing one elevation keeps the same building's other wall details", () => {
  const group=new Group(), geometry=new BufferGeometry();
  geometry.setAttribute("position",new Float32BufferAttribute(new Array(18).fill(0),3));
  geometry.setIndex([0,1,2,3,4,5]);
  const mesh=new Mesh(geometry,new MeshBasicMaterial());
  mesh.userData.buildingRanges=[
    {buildingId:"target",wallNormal:[1,0,0],start:0,count:3},
    {buildingId:"target",wallNormal:[0,0,1],start:3,count:3},
  ];
  group.add(mesh);
  try {
    const restore=hideExistingFacadeDetails(group,"target",Math.PI/2);
    assert.deepEqual(Array.from(geometry.index!.array),[3,4,5]);
    restore();
    assert.deepEqual(Array.from(geometry.index!.array),[0,1,2,3,4,5]);
  } finally {geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose();}
});
