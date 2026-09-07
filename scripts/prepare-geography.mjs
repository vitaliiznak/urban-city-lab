import { readFileSync, writeFileSync, rmSync } from "node:fs";
const input = new URL(
  "../../adliswil-explorer/outputs/adliswil/src/data/adliswil.json",
  import.meta.url,
);
const data = JSON.parse(readFileSync(input, "utf8"));
const p = data.projection;
const convert = ([x, z]) => [
  +(p.origin.lon + x / p.scale / p.metresPerLonDegree).toFixed(7),
  +(p.origin.lat - z / p.scale / p.metresPerLatDegree).toFixed(7),
];
const paths = data.roads
  .filter(
    (r) =>
      [
        "footway",
        "pedestrian",
        "path",
        "living_street",
        "steps",
        "residential",
      ].includes(r.tags.highway) &&
      !["private", "no"].includes(r.tags.access) &&
      r.tags.foot !== "no" &&
      r.tags.area !== "yes",
  )
  .map((r) => ({
    id: r.id,
    coordinates: r.p.map(convert),
    bridge: r.tags.bridge === "yes",
  }));
const summit = JSON.parse(
  readFileSync(
    new URL(
      "../../adliswil-explorer/outputs/adliswil/src/data/felsenegg.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
paths.push(
  ...summit.paths
    .filter(
      (r) =>
        !["private", "no"].includes(r.tags.access) &&
        r.tags.foot !== "no" &&
        r.tags.indoor !== "yes" &&
        r.tags.tunnel !== "building_passage",
    )
    .map((r) => ({
      id: r.id,
      coordinates: r.p.map(convert),
      bridge: r.tags.bridge === "yes",
    })),
);
const places = [
  "station",
  "cafe",
  "cableValley",
  "cableSummit",
  "reformedChurch",
].map((key) => {
  const l = data.landmarks[key];
  return {
    id: key,
    name: l.name,
    lon: l.lon,
    lat: l.lat,
    osmId: l.id,
    osmType: l.osmType,
  };
});
writeFileSync(
  new URL("../src/data/geography.json", import.meta.url),
  JSON.stringify({
    source: {
      ...data.source,
      inputFile: "adliswil-explorer/outputs/adliswil/src/data/adliswil.json",
      summitInput: "adliswil-explorer/outputs/adliswil/src/data/felsenegg.json",
      summitSource: summit.source,
    },
    paths,
    places,
  }),
);
rmSync(new URL("../src/data/streets.json", import.meta.url), { force: true });
console.log(
  `Derived ${paths.length} walking paths and ${places.length} landmarks from the existing snapshot.`,
);
const measured = JSON.parse(
  readFileSync(
    new URL(
      "../../adliswil-explorer/outputs/adliswil/public/data/adliswil-buildings.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const summitMeasured = JSON.parse(
  readFileSync(
    new URL(
      "../../adliswil-explorer/outputs/adliswil/src/data/felsenegg-station.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const metres = (ring) =>
  ring.map(([x, z]) => [+(x / p.scale).toFixed(3), +(z / p.scale).toFixed(3)]);
const buildings = [...measured.colliders, ...summitMeasured.colliders].map(
  (c) => ({
    id: c.id,
    p: metres(c.p),
    holes: c.holes.map(metres),
    height: c.height / p.scale,
  }),
);
const bridges = data.roads
  .filter(
    (r) =>
      r.tags.bridge === "yes" &&
      r.tags.foot !== "no" &&
      !["private", "no"].includes(r.tags.access),
  )
  .map((r) => ({
    id: r.id,
    p: metres(r.p),
    width:
      parseFloat(r.tags.width) ||
      (["footway", "path", "steps", "pedestrian"].includes(r.tags.highway)
        ? 2.5
        : 6),
  }));
const water = data.water.map((w) => ({
  p: metres(w.p),
  role: w.role || "outer",
}));
const boundary = data.boundaryPolygons.map((polygon) => polygon.map(metres));
writeFileSync(
  new URL("../src/data/obstacles.json", import.meta.url),
  JSON.stringify({
    source: {
      buildings: measured.source.rootUrl,
      collision: measured.collisionSource,
      water: data.source.snapshot,
      bridgeWidth:
        "OSM width tag or illustrative 2.5 m footbridge / 6 m road bridge",
    },
    buildings,
    bridges,
    water,
    boundary,
  }),
);
console.log(
  `Derived ${buildings.length} building obstacles, ${water.length} water rings and ${bridges.length} bridge corridors.`,
);
const widths = {
  motorway: 11,
  motorway_link: 6,
  primary: 8,
  secondary: 7.1,
  secondary_link: 5,
  tertiary: 6.2,
  tertiary_link: 5,
  residential: 5.6,
  living_street: 5.6,
  unclassified: 5.8,
  service: 4,
  pedestrian: 5,
  footway: 2.2,
  path: 1.8,
  steps: 2,
  cycleway: 2.5,
  track: 3,
};
const surfaces = data.roads
  .filter(
    (r) =>
      widths[r.tags.highway] &&
      r.tags.area !== "yes" &&
      r.tags.bridge !== "yes" &&
      r.tags.tunnel !== "yes" &&
      r.tags.indoor !== "yes",
  )
  .map((r) => ({
    id: r.id,
    coordinates: r.p.map(convert),
    width: parseFloat(r.tags.width) || widths[r.tags.highway],
    type: [
      "footway",
      "path",
      "steps",
      "track",
      "pedestrian",
      "cycleway",
    ].includes(r.tags.highway)
      ? "path"
      : "road",
  }));
writeFileSync(
  new URL("../src/data/surfaces.json", import.meta.url),
  JSON.stringify({
    source: data.source.snapshot,
    note: "Mapped road centrelines; widths use OSM width tags or illustrative class defaults. Generated ground surfaces obscure baked aerial vehicles within their footprint.",
    surfaces,
  }),
);
const landcover = data.landuse.map((l) => ({
  p: metres(l.p),
  holes: (l.holes || []).map(metres),
  kind: l.tags.landuse || l.tags.natural || l.tags.leisure || "residential",
}));
writeFileSync(
  new URL("../src/data/landcover.json", import.meta.url),
  JSON.stringify(landcover),
);
