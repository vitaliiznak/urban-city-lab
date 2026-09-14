import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { validateFacadeDescription } from "../src/facade-tool/schema";
import type { BuildingRecord, HouseNumber, PhotoFacadeJob } from "../src/facade-tool/types";

// Package the facade the user explicitly supplied as Poststrasse 9. The photo's
// reviewed mesh target is fixed; an automatic address match cannot move it.
// These checked-in inputs require no network request or model call.
const root = new URL("../", import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const source = readJson("public/reference/poststrasse-9/job.json") as PhotoFacadeJob;
const civic = readJson("../adliswil-explorer/outputs/adliswil/src/data/civic-layer.json") as { houseNumbers: HouseNumber[] };
const manifest = readJson("../adliswil-explorer/outputs/adliswil/public/data/adliswil-buildings.json") as { buildings: BuildingRecord[] };
const buildingId = "C507D4AC-25B0-4F5C-9C28-D95B628F250F";
const egaid = 101013745;

const houses = civic.houseNumbers.filter(house => house.egaid === egaid);
assert.equal(houses.length, 1, "Expected one selectable Poststrasse 9 civic address.");
const house = houses[0];
assert.equal(house.street, "Poststrasse");
assert.equal(house.number, "9");
assert.equal(source.address.label, "Poststrasse 9");
assert.equal(source.address.query, "Poststrasse 9");
assert.equal(source.address.street, house.street);
assert.equal(source.address.number, house.number);
assert.equal(source.address.egaid, house.egaid);
assert.equal(source.address.x, house.x);
assert.equal(source.address.z, house.z);
assert.ok([house.x, house.z, source.address.heading].every(Number.isFinite));
assert.equal(source.address.heading, Math.PI / 2, "Preserve the reviewed east-facing elevation.");

const building = manifest.buildings.find(building => building.id === buildingId);
assert.ok(building, "The fixed reviewed building mesh must be available.");
assert.ok(building.max[1] - building.min[1] > 10, "The tall reviewed mesh changed; inspect the source.");
assert.equal(source.building.id, buildingId, "Keep the supplied photo on its reviewed tall building.");
assert.equal(source.building.chunk, building.ownerChunk);
assert.equal(source.building.latitude, building.latitude);
assert.equal(source.building.longitude, building.longitude);
assert.equal(source.provider, "reviewed-photo");
assert.equal(source.photo, "/reference/poststrasse-9/source.png");
assert.equal(source.reviewedFaces?.length, 4);
assert.ok(source.referenceView, "Keep the reviewed comparison camera.");
const photo = readFileSync(new URL("public/reference/poststrasse-9/source.png", root));
assert.equal(createHash("sha256").update(photo).digest("hex"), "0cb3bcb8b18de3f446a489c07af077739ca23678382d8361bd0bf6095f941246");
for (const facade of [source.facade, ...source.reviewedFaces!.map(face => face.facade)]) {
  assert.equal(facade.buildingId, buildingId);
  assert.equal(facade.fidelity, "observed");
  assert.deepEqual(validateFacadeDescription(facade, buildingId), facade);
}
for (const face of source.reviewedFaces!) {
  assert.equal(face.wallId, face.facade.wallId);
  if (face.surface) assert.equal(face.surface.buildingId, buildingId);
}

const job: PhotoFacadeJob = { ...source, addressBasis: "user-photo" };
const destination = new URL("public/reference/poststrasse-9-prepared/", root);
mkdirSync(destination, { recursive: true });
writeFileSync(new URL("job.json", destination), JSON.stringify(job, null, 2) + "\n");
console.log(`Prepared ${job.address.label}: ${job.reviewedFaces!.length} photo-reviewed faces on the fixed building, no model call.`);
