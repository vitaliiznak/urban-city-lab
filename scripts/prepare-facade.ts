import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { validateFacadeDescription } from "../src/facade-tool/schema";
import type { HouseNumber, PhotoFacadeJob } from "../src/facade-tool/types";

// Package the reviewed geometry against its official address. All inputs are
// checked-in local snapshots; this preparation never calls a model or network.
const root = new URL("../", import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const source = readJson("public/reference/poststrasse-9/job.json") as PhotoFacadeJob;
const places = readJson("../adliswil-explorer/outputs/adliswil/public/data/building-places.json") as {
  addresses: { id: string; label: string; street: string; number: string; official: boolean; match: { uuid: string; method: string; distanceMetres: number } }[];
};
const civic = readJson("../adliswil-explorer/outputs/adliswil/src/data/civic-layer.json") as { houseNumbers: HouseNumber[] };
const buildingId = "C507D4AC-25B0-4F5C-9C28-D95B628F250F";
const egaid = 100055006;
const addresses = places.addresses.filter(address => address.id === String(egaid));
assert.equal(addresses.length, 1, "Expected one official Bahnhofplatz 4 record.");
const official = addresses[0];
assert.equal(official.official, true);
assert.equal(official.label, "Bahnhofplatz 4");
assert.equal(official.match.uuid, buildingId, "Local address-to-building mapping changed; review the reference.");
assert.equal(official.match.method, "entrance-in-footprint");
assert.equal(official.match.distanceMetres, 0);

const houses = civic.houseNumbers.filter(house => house.egaid === egaid);
assert.equal(houses.length, 1, "Expected one selectable civic address.");
const house = houses[0];
assert.equal(house.street, official.street);
assert.equal(house.number, official.number);
assert.ok([house.x, house.z, source.address.heading].every(Number.isFinite));
assert.equal(source.building.id, buildingId, "Reviewed geometry must remain on its original building.");
assert.equal(source.provider, "reviewed-photo");
assert.equal(source.photo, "/reference/poststrasse-9/source.png");
assert.equal(source.address.heading, Math.PI / 2, "Preserve the reviewed east-facing elevation.");
assert.equal(source.reviewedFaces?.length, 4);
assert.ok(source.referenceView, "Keep the reviewed street comparison camera.");

const photo = readFileSync(new URL("public/reference/poststrasse-9/source.png", root));
assert.equal(createHash("sha256").update(photo).digest("hex"), "0cb3bcb8b18de3f446a489c07af077739ca23678382d8361bd0bf6095f941246");
for (const facade of [source.facade, ...source.reviewedFaces!.map(face => face.facade)]) {
  // The validator assigns buildingId, so check identity before validating.
  assert.equal(facade.buildingId, buildingId);
  assert.deepEqual(validateFacadeDescription(facade, buildingId), facade);
}
for (const face of source.reviewedFaces!) {
  assert.equal(face.wallId, face.facade.wallId);
  if (face.surface) assert.equal(face.surface.buildingId, buildingId);
}

const job: PhotoFacadeJob = {
  ...source,
  address: {
    label: official.label,
    query: official.label,
    street: house.street,
    number: house.number,
    egaid: house.egaid,
    x: house.x,
    z: house.z,
    heading: source.address.heading,
  },
};
const destination = new URL("public/reference/bahnhofplatz-4/", root);
mkdirSync(destination, { recursive: true });
writeFileSync(new URL("job.json", destination), JSON.stringify(job, null, 2) + "\n");
console.log(`Prepared ${job.address.label}: ${job.reviewedFaces!.length} reviewed faces, no model call.`);
