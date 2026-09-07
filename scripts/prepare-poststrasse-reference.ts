import { readFileSync, writeFileSync } from "node:fs";
import { resolveAddress } from "../src/facade-tool/address";
import { matchBuilding, wallHint } from "../src/facade-tool/match-building";
import { wallsFromCollider } from "../src/facade-tool/extract-wall";
import { validateFacadeDescription } from "../src/facade-tool/schema";
import type { FacadeDescription, FacadeElement, PhotoFacadeJob, StreetWall } from "../src/facade-tool/types";

// Manually reviewed proportions from public/reference/poststrasse-9/source.png.
// The image is evidence, never a generated texture. No unseen wall is populated.
const root = new URL("../", import.meta.url);
const civic = JSON.parse(readFileSync(new URL("../adliswil-explorer/outputs/adliswil/src/data/civic-layer.json", root), "utf8"));
const manifest = JSON.parse(readFileSync(new URL("../adliswil-explorer/outputs/adliswil/public/data/adliswil-buildings.json", root), "utf8"));
const address = resolveAddress(civic.houseNumbers, "Poststrasse 9");
const { building, collider } = matchBuilding(address, manifest.colliders, manifest.buildings);
const walls = wallsFromCollider(building, collider);
const east = walls.filter(w => w.normal[0] > 0.99).sort((a,b) => b.plane - a.plane);
const south = walls.find(w => w.normal[2] > 0.99)!;
if (east.length !== 2 || !south) throw new Error("Reference building footprint changed; review wall assignments.");
const element = (kind: FacadeElement["kind"], x: number, y: number, width: number, height: number, extra: Partial<FacadeElement> = {}): FacadeElement => ({
  kind, x, y, width, height, depth: 0.03, color: "#667674", accent: "#d5d9d4", text: "", shutters: false, ...extra,
});
const base: FacadeDescription = {
  version: 2, fidelity: "observed", buildingId: building.id, wallId: "street",
  wallColor: "#eeeFE9", baseColor: "#e0e3dc", baseHeight: 0.19, roofColor: "#aeb4b0",
  gable: false, overhang: false, undercroft: null,
  observations: "Reviewed from the supplied photograph: four principal residential rows; narrow windows beside broad windows; a right-hand stack of four balconies; glazed shopfront and flat roof. The recessed top storey belongs to the measured geometry. Visible side details are approximate; hidden faces are left without added openings. Photo date and physical dimensions are unknown.",
  elements: [],
};
const rows = [0.30, 0.49, 0.68, 0.87];
const main: FacadeElement[] = rows.flatMap((y, i) => [
  element("window", 0.52, y, 0.046, 0.095),
  element("window", 0.74, y, 0.22, 0.095, {blind: [0.55,0,1,1][i]}),
]);
main.push(
  element("window", 0.40, 0.085, 0.31, 0.14),
  element("window", 0.755, 0.085, 0.34, 0.14),
  element("band", 0.5, 0.192, 1, 0.025, {color: "#dbdfd7", depth: 0.55}),
);
const balconies: FacadeElement[] = rows.flatMap(y => [
  element("window", 0.50, y + 0.015, 0.67, 0.14),
  element("balcony", 0.5, y - 0.045, 0.94, 0.055, {color: "#c8c9b9", accent: "#b9c0b8", depth: 1.35}),
]);
const side: FacadeElement[] = rows.flatMap(y => [
  ...[0.22,0.45,0.68].flatMap(x => [
    element("window", x, y, 0.16, 0.12),
    element("balcony", x, y - 0.045, 0.19, 0.055, {color: "#e6e7dc", accent: "#e5e8dc", depth: 0.8}),
  ]),
  element("window", 0.9, y, 0.1, 0.10, {blind: 0.25}),
]);
side.push(...[0.14,0.35,0.56,0.77].map(x => element("window", x, 0.085, 0.16, 0.14)), element("door",0.94,0.078,0.04,0.15), element("band",0.5,0.192,1,0.025,{color:"#dbdfd7",depth:0.5}));
const face = (wallId: string, elements: FacadeElement[]) => ({ wallId, facade: validateFacadeDescription({...base,wallId,elements},building.id) });
const corridor = JSON.parse(readFileSync(new URL("../adliswil-explorer/outputs/adliswil/src/data/corridor-architecture.json", root), "utf8"));
const upperSource = corridor.targets.find((target: {uuid: string}) => target.uuid === building.id).walls.find((wall: {normal: number[]; yMin: number}) => wall.normal[0] > 0.99 && wall.yMin > 11);
if (!upperSource) throw new Error("Measured recessed top storey is missing.");
const upperSurface: StreetWall = {
  id: "reviewed-top-east", buildingId: building.id, chunk: building.ownerChunk,
  normal: upperSource.normal, plane: upperSource.plane,
  uMin: upperSource.uMin, uMax: upperSource.uMax, yMin: upperSource.yMin, yMax: upperSource.yMax,
  visibleBase: upperSource.yMin, points: [], source: "bounds",
};
const upper = face(upperSurface.id, [
  element("window",0.30,0.55,0.22,0.6,{blind:0.8}),
  element("window",0.60,0.55,0.085,0.6),
  element("window",0.83,0.55,0.19,0.6),
]);
const job: PhotoFacadeJob = {
  provider: "reviewed-photo", photo: "/reference/poststrasse-9/source.png", address: {...address, heading: Math.PI / 2},
  building: {id: building.id,latitude: building.latitude,longitude:building.longitude,chunk:building.ownerChunk},
  wallHint: wallHint(building, Math.PI / 2, collider), facade: validateFacadeDescription({...base,elements:main},building.id),
  reviewedFaces: [face(east[0].id, main),face(east[1].id,balconies),face(south.id,side), {...upper,surface:upperSurface}],
  referenceView: {position: [7, 5.65, -46.4], target: [-8.0, 8.8, -54.5]},
};
writeFileSync(new URL("public/reference/poststrasse-9/job.json",root),JSON.stringify(job,null,2)+"\n");
console.log(`Saved reviewed ${address.label}: ${job.reviewedFaces!.length} faces, ${job.reviewedFaces!.reduce((n,f)=>n+f.facade.elements.length,0)} observed/approximated details.`);
