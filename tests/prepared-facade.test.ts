import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preparedFacade, preparedFacades, preparedFacadeFor } from "../src/facade-tool/prepared";
import { regularizeFacade } from "../src/facade-tool/regularize";
import { validateFacadeDescription } from "../src/facade-tool/schema";
import type { HouseNumber, PhotoFacadeJob } from "../src/facade-tool/types";

const places = JSON.parse(readFileSync(new URL(
  "../../adliswil-explorer/outputs/adliswil/public/data/building-places.json", import.meta.url,
), "utf8")) as {
  addresses: {
    id: string;
    label: string;
    egid: number;
    official: boolean;
    match: { uuid: string; method: string; distanceMetres: number };
  }[];
};
const civic = JSON.parse(readFileSync(new URL(
  "../../adliswil-explorer/outputs/adliswil/src/data/civic-layer.json", import.meta.url,
), "utf8")) as { houseNumbers: HouseNumber[] };
const reviewedSource = JSON.parse(readFileSync(new URL(
  "../public/reference/poststrasse-9/job.json", import.meta.url,
), "utf8")) as PhotoFacadeJob;
const poststrasseFacade = preparedFacades.find(job => job.address.egaid === 101013745)!;

test("prepared Poststrasse 9 keeps its official entrance and marks the photo-selected building separately", () => {
  const official = places.addresses.find(address => address.id === "101013745");
  const house = civic.houseNumbers.find(address => address.egaid === 101013745);
  assert.ok(official);
  assert.ok(house);
  assert.ok(poststrasseFacade);
  assert.equal(official.official, true);
  assert.equal(official.egid, 2285398);
  assert.equal(official.label, "Poststrasse 9");
  assert.equal(official.match.method, "address-and-footprint");
  assert.equal(official.match.distanceMetres, 0);
  assert.equal(official.match.uuid, "9747C083-2DF3-4E6E-9F1F-64F6551EEA0F");
  assert.equal(poststrasseFacade.addressBasis, "user-photo");
  assert.equal(poststrasseFacade.building.id, "C507D4AC-25B0-4F5C-9C28-D95B628F250F");
  assert.notEqual(poststrasseFacade.building.id, official.match.uuid,
    "the user's photo target does not silently become the local address-to-building match");
  assert.notEqual(poststrasseFacade.address.egaid, preparedFacade.address.egaid);
  assert.equal(poststrasseFacade.address.label, official.label);
  assert.equal(poststrasseFacade.address.egaid, house.egaid);
  assert.equal(poststrasseFacade.address.street, house.street);
  assert.equal(poststrasseFacade.address.number, house.number);
  assert.equal(poststrasseFacade.address.x, house.x);
  assert.equal(poststrasseFacade.address.z, house.z);
  assert.strictEqual(preparedFacadeFor({ ...house, label: official.label }), poststrasseFacade);
});

test("prepared Poststrasse 9 retains the user-selected photograph, reviewed surfaces and comparison view", () => {
  assert.equal(poststrasseFacade.provider, "reviewed-photo");
  assert.equal(poststrasseFacade.photo, "/reference/poststrasse-9/source.png");
  assert.deepEqual(poststrasseFacade.building, reviewedSource.building);
  assert.deepEqual(poststrasseFacade.facade, reviewedSource.facade);
  assert.deepEqual(poststrasseFacade.reviewedFaces, reviewedSource.reviewedFaces);
  assert.deepEqual(poststrasseFacade.referenceView, reviewedSource.referenceView);
  assert.equal(poststrasseFacade.address.heading, Math.PI / 2);
  assert.equal(poststrasseFacade.reviewedFaces?.length, 4);
  for (const facade of [poststrasseFacade.facade, ...poststrasseFacade.reviewedFaces!.map(face => face.facade)]) {
    assert.equal(facade.buildingId, poststrasseFacade.building.id);
    assert.equal(facade.fidelity, "observed");
    assert.deepEqual(validateFacadeDescription(facade, poststrasseFacade.building.id), facade);
    assert.deepEqual(regularizeFacade(facade, poststrasseFacade.wallHint), facade);
  }
  for (const face of poststrasseFacade.reviewedFaces!) {
    assert.equal(face.facade.wallId, face.wallId);
    if (face.surface) {
      assert.equal(face.surface.id, face.wallId);
      assert.equal(face.surface.buildingId, poststrasseFacade.building.id);
      assert.equal(face.surface.points.length % 9, 0,
        "a surface may defer triangles to mesh extraction or supply complete triangles");
      assert.ok(face.surface.points.every(Number.isFinite));
      assert.ok(face.surface.uMax > face.surface.uMin);
      assert.ok(face.surface.yMax > face.surface.visibleBase);
    }
  }
});

test("prepared Bahnhofplatz 4 retains its official entrance and derived local building match", () => {
  const official = places.addresses.find(address => address.id === "100055006");
  const house = civic.houseNumbers.find(address => address.egaid === 100055006);
  assert.ok(official);
  assert.ok(house);
  assert.equal(official.official, true);
  assert.equal(official.egid, 52460);
  assert.equal(official.label, "Bahnhofplatz 4");
  assert.equal(official.match.method, "entrance-in-footprint");
  assert.equal(official.match.distanceMetres, 0);
  assert.equal(preparedFacade.building.id, "C507D4AC-25B0-4F5C-9C28-D95B628F250F");
  assert.equal(preparedFacade.building.id, official.match.uuid);
  assert.equal(preparedFacade.address.label, official.label);
  assert.equal(preparedFacade.address.egaid, house.egaid);
  assert.equal(preparedFacade.address.street, house.street);
  assert.equal(preparedFacade.address.number, house.number);
  assert.equal(preparedFacade.address.x, house.x);
  assert.equal(preparedFacade.address.z, house.z);
  assert.strictEqual(preparedFacadeFor({ ...house, label: official.label }), preparedFacade);

  const poststrasse = places.addresses.find(address => address.label === "Poststrasse 9");
  assert.ok(poststrasse);
  assert.equal(poststrasse.match.uuid, "9747C083-2DF3-4E6E-9F1F-64F6551EEA0F");
  assert.notEqual(preparedFacade.building.id, poststrasse.match.uuid);
});

test("prepared job retains all reviewed surfaces, photo and comparison view", () => {
  assert.equal(preparedFacade.provider, "reviewed-photo");
  assert.equal(preparedFacade.photo, "/reference/poststrasse-9/source.png");
  assert.deepEqual(preparedFacade.building, reviewedSource.building);
  assert.deepEqual(preparedFacade.facade, reviewedSource.facade);
  assert.deepEqual(preparedFacade.reviewedFaces, reviewedSource.reviewedFaces);
  assert.deepEqual(preparedFacade.referenceView, reviewedSource.referenceView);
  assert.equal(preparedFacade.address.heading, Math.PI / 2);
  assert.equal(preparedFacade.reviewedFaces?.length, 4);
  for (const facade of [preparedFacade.facade, ...preparedFacade.reviewedFaces!.map(face => face.facade)]) {
    assert.equal(facade.buildingId, preparedFacade.building.id);
    const parsed = validateFacadeDescription(facade, preparedFacade.building.id);
    assert.deepEqual(parsed, facade);
    assert.deepEqual(regularizeFacade(parsed, preparedFacade.wallHint), facade);
  }
  const top = preparedFacade.reviewedFaces!.find(face => face.wallId === "reviewed-top-east");
  assert.ok(top?.surface);
  assert.equal(top.surface.buildingId, preparedFacade.building.id);
  assert.equal(top.surface.id, top.wallId);
  assert.equal(top.facade.elements.filter(element => element.kind === "window").length, 3);
});

test("prepared selection immediately accepts normalized matching address labels", () => {
  for (const job of preparedFacades) {
    const { street, number } = job.address;
    for (const label of [`${street} ${number}`, ` ${street.toUpperCase()}  ${number} `, `${street}${number}`, `${street}, ${number}`]) {
      assert.strictEqual(preparedFacadeFor({ ...job.address, label }), job, label);
    }
    assert.strictEqual(preparedFacadeFor({
      ...job.address, x: job.address.x + 0.03, z: job.address.z - 0.04,
    }), job, "allow small coordinate rounding differences");
  }
});

test("prepared selection rejects other addresses even at the prepared coordinates", () => {
  assert.equal(preparedFacadeFor(null), null);
  for (const label of ["Poststrasse 9", "Bahnhofplatz 5", "Bahnhofplatz 4a", "Bahnhofplatz", ""]) {
    assert.equal(preparedFacadeFor({ ...preparedFacade.address, label }), null, label);
  }
  for (const job of preparedFacades) {
    for (const other of preparedFacades.filter(candidate => candidate !== job)) {
      assert.equal(preparedFacadeFor({ ...job.address, label: other.address.label }), null,
        `${other.address.label} cannot select ${job.address.label}'s building`);
    }
  }
  const preparedEgaids = new Set(preparedFacades.map(job => job.address.egaid));
  for (const house of civic.houseNumbers.filter(house => !preparedEgaids.has(house.egaid))) {
    const label = `${house.street} ${house.number}`;
    assert.equal(preparedFacadeFor({ ...house, label }), null, label);
  }
});

test("a matching label with wrong or nonfinite coordinates cannot apply the prepared building", () => {
  for (const job of preparedFacades) {
    for (const [x, z] of [
      [job.address.x + 1, job.address.z],
      [job.address.x, job.address.z - 1],
      [job.address.x + 0.08, job.address.z + 0.08],
      [NaN, job.address.z],
      [job.address.x, NaN],
      [Infinity, job.address.z],
      [job.address.x, -Infinity],
    ]) {
      assert.equal(preparedFacadeFor({ ...job.address, x, z }), null);
    }
  }
});
