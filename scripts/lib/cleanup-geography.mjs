const excluded = (t) =>
  (t.building && t.building !== "no") ||
  (t.covered && t.covered !== "no") ||
  (t.tunnel && t.tunnel !== "no") ||
  Number(t.layer || 0) < 0 ||
  Number(t.level || 0) < 0 ||
  ["underground", "multi-storey", "rooftop", "garage_boxes"].includes(t.parking);

const coordinates = (geometry) => {
  if (!geometry?.every((p) => p && Number.isFinite(p.lon) && Number.isFinite(p.lat)))
    return null;
  return geometry.map(({ lon, lat }) => [lon, lat]);
};

export function deriveParking(elements) {
  return elements.flatMap((e) => {
    const tags = e.tags || {};
    if (e.type !== "way" || tags.amenity !== "parking" || excluded(tags)) return [];
    const ring = coordinates(e.geometry);
    if (!ring || ring.length < 4 || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return [];
    return [{ id: `way/${e.id}`, coordinates: ring, surface: tags.surface || "asphalt", surfaceAssumed: !tags.surface }];
  });
}

export function deriveCrossings(elements) {
  return elements.flatMap((e) => {
    const t = e.tags || {};
    const markings = t["crossing:markings"];
    if (e.type !== "way" || t.footway !== "crossing" || excluded(t) || (t.bridge && t.bridge !== "no")) return [];
    // Do not invent zebra stripes on unmarked or unspecified crossings.
    if (!(markings === "zebra" || markings === "yes" || (!markings && t.crossing === "marked"))) return [];
    const line = coordinates(e.geometry);
    if (!line || line.length < 2) return [];
    const width = Number(t.width);
    return [{ id: `way/${e.id}`, coordinates: line, width: Number.isFinite(width) && width > 0 ? Math.min(width, 6) : 3, widthAssumed: !(width > 0) }];
  });
}
