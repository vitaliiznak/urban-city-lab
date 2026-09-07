export function preparePolyline(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths.at(-1) + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  return {points, lengths, length: lengths.at(-1) || 0};
}

export function samplePolyline(prepared, distance) {
  if (!prepared?.points?.length) return null;
  const d = Math.max(0, Math.min(Number(distance) || 0, prepared.length));
  let i = 1;
  while (i < prepared.lengths.length - 1 && prepared.lengths[i] < d) i++;
  const a = prepared.points[i - 1];
  const b = prepared.points[i] || a;
  const span = prepared.lengths[i] - prepared.lengths[i - 1] || 1;
  const t = (d - prepared.lengths[i - 1]) / span;
  return {
    x: a[0] + (b[0] - a[0]) * t,
    z: a[1] + (b[1] - a[1]) * t,
    angle: Math.atan2(b[0] - a[0], b[1] - a[1]),
    distance: d,
  };
}

