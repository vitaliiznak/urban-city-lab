export function railwaySurfaces(rails, scale) {
  const cells = new Map();
  let ways = 0, lengthMetres = 0;
  function strip(a, b, width, kind) {
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < .001) return;
    const nx = -dz / length * width / 2, nz = dx / length * width / 2;
    const x = Math.floor((a[0] + b[0]) / 2 / 200) * 200;
    const z = Math.floor((a[1] + b[1]) / 2 / 200) * 200;
    const key = `${x}:${z}`;
    if (!cells.has(key)) cells.set(key, { id: key, x, z, ballast: [], sleepers: [], steel: [] });
    cells.get(key)[kind].push([[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]].map((p) => p.map((n) => Math.round(n * 1000) / 1000)));
  }
  for (const rail of rails) {
    if (rail.tags.tunnel === "yes" || rail.tags.bridge === "yes" || Number(rail.tags.layer || 0) !== 0) continue;
    const gauge = (Number(rail.tags.gauge) || 1435) / 1000;
    for (let i = 1; i < rail.p.length; i++) {
      const a = rail.p[i - 1].map((n) => n / scale), b = rail.p[i].map((n) => n / scale);
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < .01) continue;
      const nx = -dz / length, nz = dx / length;
      // Keep each footprint within a nearby cell even on long straight ways.
      const steps = Math.ceil(length / 20);
      for (let k = 0; k < steps; k++) {
        const from = [a[0] + dx * k / steps, a[1] + dz * k / steps];
        const to = [a[0] + dx * (k + 1) / steps, a[1] + dz * (k + 1) / steps];
        strip(from, to, 3.2, "ballast");
        for (const side of [-1, 1]) strip([from[0] + nx * gauge / 2 * side, from[1] + nz * gauge / 2 * side], [to[0] + nx * gauge / 2 * side, to[1] + nz * gauge / 2 * side], .075, "steel");
      }
      for (let d = .3; d < length; d += .62) {
        const x = a[0] + dx * d / length, z = a[1] + dz * d / length;
        strip([x - nx * 1.25, z - nz * 1.25], [x + nx * 1.25, z + nz * 1.25], .24, "sleepers");
      }
      lengthMetres += length;
    }
    ways++;
  }
  return { cells: [...cells.values()], stats: { ways, lengthMetres } };
}
