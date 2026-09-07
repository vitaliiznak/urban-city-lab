import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAddress, resolveAddress, searchAddresses } from "../src/facade-tool/address";
import { houseAtPoint, matchBuilding, wallHint } from "../src/facade-tool/match-building";
import { extractJsonObject, validateFacadeDescription } from "../src/facade-tool/schema";
import { facadePrompt } from "../src/facade-tool/prompt";
import { regularizeFacade } from "../src/facade-tool/regularize";
import { alignWallsToStreet, extractBuildingWalls, extractStreetWall, pickStreetWall, wallsFromCollider } from "../src/facade-tool/extract-wall";
import { facadeBands, facadePaintPoints, gableSkinPoints, paintBuilding, paintStreetWall, restoreStreetWall, wallSkinPoints } from "../src/facade-tool/paint-wall";
import { sideWindows } from "../src/facade-tool/sides";
import { rifertstrasse22aFacade } from "../src/facade-tool/example-rifertstrasse-22a";
import { rifertstrasse14aFacade } from "../src/facade-tool/example-rifertstrasse-14a";
import { carveUndercroft, restoreBuildingShape } from "../src/facade-tool/carve-undercroft";
import { resolveUndercroft } from "../src/facade-tool/undercroft";
import { houseIsInFrontView } from "../src/facade-tool/in-view";
import type { BuildingCollider, BuildingRecord, HouseNumber } from "../src/facade-tool/types";

const civic = JSON.parse(
  readFileSync(new URL("../../adliswil-explorer/outputs/adliswil/src/data/civic-layer.json", import.meta.url), "utf8"),
) as { houseNumbers: HouseNumber[] };
const buildings = JSON.parse(
  readFileSync(new URL("../../adliswil-explorer/outputs/adliswil/public/data/adliswil-buildings.json", import.meta.url), "utf8"),
) as { buildings: BuildingRecord[]; colliders: BuildingCollider[] };

test("Riferstrasse 22 A resolves to official Rifertstrasse 22a", () => {
  assert.deepEqual(parseAddress("Riferstrasse22 A"), { street: "Riferstrasse", number: "22a" });
  const found = resolveAddress(civic.houseNumbers, "Riferstrasse 22 A");
  assert.equal(found.street, "Rifertstrasse");
  assert.equal(found.number, "22a");
  assert.ok(found.heading);
  const labels = searchAddresses(civic.houseNumbers, "Riferstrasse 22a", 8).map((h) => `${h.street} ${h.number}`);
  assert.equal(labels[0], "Rifertstrasse 22a");
});

test("Rifertstrasse 22a matches a measured swissBUILDINGS3D body", () => {
  const address = resolveAddress(civic.houseNumbers, "Rifertstrasse 22a");
  const { building, collider } = matchBuilding(address, buildings.colliders, buildings.buildings);
  assert.equal(building.id, "A518F656-3AFC-4A78-BAFB-D00BABEE4D3A");
  assert.equal(collider.buildingId, building.id);
  const hint = wallHint(building, address.heading, collider);
  assert.ok(hint.widthMetres > 6);
  assert.ok(hint.widthMetres < 14);
  assert.ok(hint.heightMetres > 8);
  assert.ok(hint.depthMetres > 6);
  assert.ok(hint.storeys >= 2);
  assert.ok(hint.storeys <= 5);
  const wall = extractStreetWall([], building, collider, address.heading);
  assert.equal(wall.source, "bounds");
  assert.equal(wall.points.length, 18);
  assert.ok(wall.uMax > wall.uMin);
  const walls = extractBuildingWalls([], building, collider, address.heading);
  assert.ok(walls.length >= 3);
  const street = pickStreetWall(walls, address.heading);
  assert.ok(street);
  const side = walls.find((item) => item.id !== street.id);
  assert.ok(side);
  const extras = sideWindows(validateFacadeDescription(rifertstrasse22aFacade, building.id), street, side);
  assert.ok(extras.length >= 2);
  assert.ok(extras.every((element) => element.kind === "window"));
  const clicked = houseAtPoint(civic.houseNumbers, buildings.colliders, address.x, address.z);
  assert.equal(clicked && `${clicked.street} ${clicked.number}`, "Rifertstrasse 22a");
  const facing = walls.find((item) => item.id === street.id);
  assert.ok(facing);
  const outline = wallsFromCollider(building, collider).find((item) => item.id === facing.id);
  if (outline) {
    assert.ok(Math.abs(facing.uMax - facing.uMin - (outline.uMax - outline.uMin)) < 0.2);
  }
});

test("façade prompt names the house and the renderer contract", () => {
  const address = resolveAddress(civic.houseNumbers, "Rifertstrasse 22a");
  const { building, collider } = matchBuilding(address, buildings.colliders, buildings.buildings);
  const hint = wallHint(building, address.heading, collider);
  const text = facadePrompt(address, hint);
  assert.match(text, /Rifertstrasse 22a/);
  assert.match(text, new RegExp(`${hint.widthMetres} m wide`));
  assert.match(text, /not applied as a photo texture/);
  assert.match(text, /ONLY this addressed house/);
  assert.match(text, /window grid/);
});

test("a sparse wide-wall vision result becomes a regular metre-clamped grid", () => {
  const raw = JSON.parse(
    readFileSync(new URL("./fixtures/poststrasse-9-upload.json", import.meta.url), "utf8"),
  ) as { facade: unknown; wallHint: { widthMetres: number; heightMetres: number; depthMetres: number; storeys: number }; building: { id: string } };
  const parsed = validateFacadeDescription({...raw.facade as object, fidelity: undefined}, raw.building.id);
  const dressed = regularizeFacade(parsed, raw.wallHint);
  assert.equal(dressed.overhang, false);
  assert.equal(dressed.elements.some((element) => element.kind === "door" && element.y > 0.26), false);
  const upper = dressed.elements.filter((element) => element.kind === "window" && element.y > 0.25);
  const cols = new Set(upper.map((element) => element.x.toFixed(3)));
  assert.ok(cols.size >= 8);
  for (const element of upper) {
    assert.ok(element.width * raw.wallHint.widthMetres <= 1.8);
    assert.ok(element.height * raw.wallHint.heightMetres <= 1.75);
  }
  for (const balcony of dressed.elements.filter((element) => element.kind === "balcony")) {
    assert.ok(balcony.width * raw.wallHint.widthMetres <= 2.6);
  }
});

test("photo façade JSON is accepted and fenced model output is parsed", () => {
  const parsed = validateFacadeDescription(rifertstrasse22aFacade, "A518F656-3AFC-4A78-BAFB-D00BABEE4D3A");
  const kept = regularizeFacade(parsed, { widthMetres: 7.8, heightMetres: 13.7, depthMetres: 9, storeys: 4 });
  assert.equal(kept.elements.filter((element) => element.kind === "window").length, parsed.elements.filter((element) => element.kind === "window").length);
  assert.equal(kept.undercroft?.pillars, 1);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.elements.some((el) => el.kind === "sign" && el.text === "22a"), true);
  assert.equal(parsed.elements.some((el) => el.kind === "recess"), true);
  assert.equal(parsed.elements.some((el) => el.kind === "light"), true);
  assert.equal(parsed.elements.filter((el) => el.shutters).length, 2);
  assert.equal(parsed.undercroft?.width, 0.38);
  assert.equal(parsed.undercroft?.pillars, 1);
  assert.equal(resolveUndercroft(parsed)?.depth, 0.5);
  const fourteen = validateFacadeDescription(rifertstrasse14aFacade, "E151E7B8-FD29-4BEA-946E-C2A885DEE6B8");
  assert.equal(fourteen.undercroft?.pillars, 3);
  assert.ok(fourteen.overhang);
  const fenced = extractJsonObject("```json\n" + JSON.stringify(rifertstrasse22aFacade) + "\n```");
  assert.equal(validateFacadeDescription(fenced, "A518F656-3AFC-4A78-BAFB-D00BABEE4D3A").wallColor, "#afb0aa");
  assert.throws(() => validateFacadeDescription({ ...rifertstrasse22aFacade, wallColor: "grey" }, "x"));
  assert.throws(() => validateFacadeDescription({
    ...rifertstrasse22aFacade,
    elements: [{ ...rifertstrasse22aFacade.elements[1], kind: "door", text: "tenant" }],
  }, "x"));
});

test("gable fallback paint is a pentagon, and street-wall paint mutes shader windows", () => {
  const address = resolveAddress(civic.houseNumbers, "Rifertstrasse 22a");
  const { building, collider } = matchBuilding(address, buildings.colliders, buildings.buildings);
  const wall = extractStreetWall([], building, collider, address.heading);
  const description = validateFacadeDescription(rifertstrasse22aFacade, building.id);
  assert.equal(facadePaintPoints(wall, { ...description, gable: false }).length, 18);
  assert.equal(facadePaintPoints(wall, description).length, 27);
  const bands = facadeBands(wall, description);
  assert.ok(bands.baseTop > wall.visibleBase);
  assert.equal(wallSkinPoints(wall, wall.visibleBase, bands.baseTop).length, 18);
  assert.equal(gableSkinPoints(wall, bands.eaves).length, 9);
  const raised = alignWallsToStreet([wall], wall.visibleBase + 0.4);
  assert.ok(Math.abs(raised[0].visibleBase - (wall.visibleBase + 0.4)) < 1e-6);
  const lowered = alignWallsToStreet([wall], wall.visibleBase - 0.5);
  assert.ok(lowered[0].visibleBase < wall.visibleBase);

  const count = 4;
  const midU = (wall.uMin + wall.uMax) / 2;
  const tx = wall.normal[2], tz = -wall.normal[0];
  const px = tx * midU + wall.normal[0] * wall.plane;
  const pz = tz * midU + wall.normal[2] * wall.plane;
  const position = {
    count,
    getX: () => px,
    getY: (i: number) => wall.visibleBase + 1 + i * 0.4,
    getZ: () => pz,
  };
  const nx = wall.normal[0], nz = wall.normal[2];
  const normal = { count, getX: () => nx, getY: () => 0, getZ: () => nz };
  const color = { count, itemSize: 3, array: new Uint8Array([180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180]), needsUpdate: false };
  const facade = { count, itemSize: 4, array: new Float32Array([0, 1, 0, 4, 0, 1, 0, 4, 0, 1, 0, 4, 0, 1, 0, 4]), needsUpdate: false };
  const mesh = { name: wall.chunk, geometry: { attributes: { position, normal, color, facade }, index: null } };
  const roomy = {
    ...collider,
    x: px,
    z: pz,
    w: 8,
    d: 8,
    p: [[px - 4, pz - 4], [px + 4, pz - 4], [px + 4, pz + 4], [px - 4, pz + 4]],
  };
  const edits = paintStreetWall([mesh], wall, roomy, description);
  assert.ok(edits[0]?.vertices.length);
  assert.equal(facade.array[3], 0);
  restoreStreetWall(edits);
  assert.equal(facade.array[3], 4);
  assert.equal(color.array[0], 180);

  const leakColor = { count: 2, itemSize: 3, array: new Uint8Array([10, 10, 10, 20, 20, 20]), needsUpdate: false };
  const leakPosition = {
    count: 2,
    getX: (i: number) => i === 0 ? px : px + 40,
    getY: () => wall.visibleBase + 1,
    getZ: (i: number) => i === 0 ? pz : pz + 40,
  };
  const leakMesh = { name: wall.chunk, geometry: { attributes: { position: leakPosition, color: leakColor }, index: null } };
  const leakEdits = paintBuilding([leakMesh], roomy, description, [wall]);
  assert.equal(leakEdits[0]?.vertices.length, 1);
  assert.notEqual(leakColor.array[0], 10);
  assert.equal(leakColor.array[3], 20);
});

test("Rifertstrasse 14a undercroft carves a dense wall and otherwise still describes the void", () => {
  const address = resolveAddress(civic.houseNumbers, "Rifferstrasse 14A");
  assert.equal(address.label, "Rifertstrasse 14a");
  const { building, collider } = matchBuilding(address, buildings.colliders, buildings.buildings);
  assert.equal(building.id, "E151E7B8-FD29-4BEA-946E-C2A885DEE6B8");
  const wall = extractStreetWall([], building, collider, address.heading);
  const description = validateFacadeDescription(rifertstrasse14aFacade, building.id);
  const undercroft = resolveUndercroft(description);
  assert.ok(undercroft);

  const empty = carveUndercroft([], wall, collider, undercroft);
  assert.equal(empty.length, 0);

  const nx = wall.normal[0], nz = wall.normal[2];
  const tx = nz, tz = -nx;
  const midU = (wall.uMin + wall.uMax) / 2;
  const y = wall.visibleBase + 0.4;
  const count = 12;
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = midU + (i - count / 2) * 0.12;
    array[i * 3] = tx * u + nx * wall.plane;
    array[i * 3 + 1] = y;
    array[i * 3 + 2] = tz * u + nz * wall.plane;
  }
  const position = {
    count,
    getX: (i: number) => array[i * 3],
    getY: (i: number) => array[i * 3 + 1],
    getZ: (i: number) => array[i * 3 + 2],
    array,
    needsUpdate: false,
  };
  const mesh = { name: wall.chunk, geometry: { attributes: { position }, computeVertexNormals() {} } };
  const cx = tx * midU + nx * wall.plane;
  const cz = tz * midU + nz * wall.plane;
  const roomy = {
    ...collider,
    x: cx,
    z: cz,
    w: 12,
    d: 12,
    p: [[cx - 6, cz - 6], [cx + 6, cz - 6], [cx + 6, cz + 6], [cx - 6, cz + 6]],
  };
  const before = array[0];
  const edits = carveUndercroft([mesh], wall, roomy, undercroft);
  assert.ok(edits[0]?.vertices.length);
  assert.notEqual(array[0], before);
  restoreBuildingShape(edits);
  assert.equal(array[0], before);
});

test("a house already in front of the walker stays in view", () => {
  const player = { x: 0, z: 0 };
  const yaw = 0;
  const camera = { x: 0, z: 8 };
  const look = { x: 0, z: 0 };
  assert.equal(houseIsInFrontView(player, yaw, camera, look, { x: 0, z: -6 }), true);
  assert.equal(houseIsInFrontView(player, yaw, camera, look, { x: 0, z: -80 }), true);
  assert.equal(houseIsInFrontView(player, yaw, camera, look, { x: 0, z: 6 }), false);
  assert.equal(houseIsInFrontView(player, yaw, camera, look, { x: 20, z: 0 }), false);
});

test("Poststrasse 9 keeps complete wall spans and the photographed balcony setback", () => {
  const address = resolveAddress(civic.houseNumbers, "Poststrasse 9");
  const {building, collider} = matchBuilding(address, buildings.colliders, buildings.buildings);
  const footprintBefore = JSON.stringify(collider.p);
  const walls = wallsFromCollider(building, collider);
  assert.equal(JSON.stringify(collider.p), footprintBefore, "do not mutate the source footprint");
  const south = walls.filter(w => w.normal[2] > 0.99);
  assert.equal(south.length, 1, "collinear survey samples form one wall");
  assert.ok(south[0].uMax - south[0].uMin > 12.8, "retain the full 28 m frontage");
  const east = walls.filter(w => w.normal[0] > 0.99).sort((a,b) => b.plane-a.plane);
  assert.equal(east.length, 2, "retain the balcony recess as its own plane");
  assert.ok(east[0].plane - east[1].plane > 0.35);
});

test("reviewed photo preserves asymmetric windows, broad glazing and four balconies", () => {
  const job = JSON.parse(readFileSync(new URL("../public/reference/poststrasse-9/job.json", import.meta.url), "utf8"));
  assert.equal(job.address.label, "Poststrasse 9");
  assert.equal(job.provider, "reviewed-photo");
  assert.equal(job.reviewedFaces.length, 4, "three visible planes plus the measured recessed top storey");
  for (const face of job.reviewedFaces) {
    const parsed = validateFacadeDescription(face.facade, job.building.id);
    assert.deepEqual(regularizeFacade(parsed, job.wallHint), parsed, "reviewed geometry must not be regularized");
  }
  const front = job.reviewedFaces[0].facade.elements;
  const upper = front.filter((e: {kind: string; y: number}) => e.kind === "window" && e.y > 0.2);
  assert.equal(upper.length, 8);
  assert.equal(new Set(upper.map((e: {y: number})=>e.y)).size, 4);
  assert.equal(new Set(upper.map((e: {width: number})=>e.width)).size, 2);
  assert.equal(job.reviewedFaces[1].facade.elements.filter((e: {kind: string})=>e.kind === "balcony").length, 4);
  assert.ok(readFileSync(new URL("../public/reference/poststrasse-9/source.png", import.meta.url)).length > 10000);
});
