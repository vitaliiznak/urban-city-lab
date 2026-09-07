export type CablePoint = { x: number; z: number; height: number };
export type CablewayCatalog = {
  anchors: [CablePoint, CablePoint, CablePoint];
  split: number; laneOffset: number; sag: [number, number];
  travelRange: { start: number; end: number };
  travelSeconds: number; dwellSeconds: number; initialTime: number;
  cabinDrop: number;
  swissFeature: { uuid: string };
};

export function cablePoint(catalog: CablewayCatalog, progress: number, lane: number) {
  const lower = progress < catalog.split, index = lower ? 0 : 1;
  const a = catalog.anchors[index], b = catalog.anchors[index + 1];
  const t = lower ? progress / catalog.split : (progress - catalog.split) / (1 - catalog.split);
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz), side = lane === 1 ? -1 : 1;
  return {
    x: a.x + dx * t - dz / length * side * catalog.laneOffset,
    z: a.z + dz * t + dx / length * side * catalog.laneOffset,
    height: a.height + (b.height - a.height) * t - 4 * catalog.sag[index] * t * (1 - t),
    angle: Math.atan2(-dz, dx),
  };
}

export function cabinPoses(catalog: CablewayCatalog, elapsed: number) {
  const travel = catalog.travelSeconds, dwell = catalog.dwellSeconds, half = travel + dwell;
  const time = ((elapsed + catalog.initialTime) % (half * 2) + half * 2) % (half * 2);
  const returning = time >= half, legTime = time % half, moving = legTime < travel;
  const u = Math.min(1, legTime / travel), acceleration = 10 / travel;
  const eased = (u < acceleration ? u * u / (2 * acceleration) : u > 1 - acceleration ?
    1 - acceleration - (1 - u) ** 2 / (2 * acceleration) : u - acceleration / 2) / (1 - acceleration);
  const unit = returning ? 1 - eased : eased;
  const range = catalog.travelRange, span = range.end - range.start;
  return [unit, 1 - unit].map((position, lane) => {
    const progress = range.start + position * span;
    const point = cablePoint(catalog, progress, lane);
    return { ...point, height: point.height - catalog.cabinDrop, progress, lane, moving };
  });
}
