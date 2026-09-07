const names = {
  "osm-benches": "Bench", "osm-tables": "Table", "osm-outdoor-seating": "Seating",
  "osm-bins": "Bin", "osm-lamps": "Lamp post", "osm-bikes": "Bicycle",
  "osm-allotments": "Garden shed", "osm-construction-fence": "Fence",
  "osm-crossing-posts": "Crossing post", "osm-table-tennis": "Table",
  "civic-hydrants": "Hydrant", "civic-post-boxes": "Post box",
  "civic-recycling": "Recycling container", "civic-fountains": "Fountain",
  "civic-taps": "Water tap", "civic-signals": "Signal post",
  "Bushof Adliswil · OSM canopy": "Bus station furniture",
};
export const propLabel = (name) => name.startsWith("osm-cars-") ? "Parked car" : names[name];

function clip(vertices, height, above) {
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const insideA = above ? a[1] >= height : a[1] <= height;
    const insideB = above ? b[1] >= height : b[1] <= height;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (height - a[1]) / (b[1] - a[1]);
      result.push([a[0] + (b[0] - a[0]) * t, height, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return result;
}

// One convex footprint per solid prop. Clip triangles at body height so overhead
// signs/canopies do not become walls and tall poles retain their narrow footprint.
export function propFootprint(positions, ground, scale) {
  const points = new Map();
  for (let i = 0; i < positions.length; i += 9) {
    const triangle = [0, 3, 6].map((k) => Array.from(positions.slice(i + k, i + k + 3)));
    const clipped = clip(clip(triangle, ground + 0.12 * scale, true), ground + 1.65 * scale, false);
    for (const p of clipped) {
      const point = [Math.round(p[0] / scale * 1000) / 1000, Math.round(p[2] / scale * 1000) / 1000];
      points.set(point.join(","), point);
    }
  }
  const sorted = [...points.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return null;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  return hull.length >= 3 ? hull : null;
}
