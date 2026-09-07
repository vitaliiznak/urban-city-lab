import type { FacadeDescription, FacadeElement, StreetWall } from "./types";

function cluster(values: number[], gap = 0.055) {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const value of sorted) {
    const last = groups.at(-1);
    if (!last || value - last[last.length - 1] > gap) groups.push([value]);
    else last.push(value);
  }
  return groups.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length);
}

export function sideWindows(description: FacadeDescription, street: StreetWall, wall: StreetWall): FacadeElement[] {
  const windows = description.elements.filter((element) => element.kind === "window" && element.y > description.baseHeight + 0.04);
  if (!windows.length) return [];
  const streetWidth = Math.max(0.8, street.uMax - street.uMin);
  const wallWidth = wall.uMax - wall.uMin;
  if (wallWidth < 2.05) return [];
  const sample = windows[0];
  const worldW = sample.width * streetWidth;
  const cols = Math.max(1, Math.min(5, Math.round((wallWidth - 1.1) / Math.max(1.15, worldW * 2.4))));
  const width = Math.min(0.22, Math.max(0.07, (worldW * 0.88) / wallWidth));
  const rows = cluster(windows.map((element) => element.y));
  const height = windows.reduce((sum, element) => sum + element.height, 0) / windows.length;
  const out: FacadeElement[] = [];
  for (const y of rows) {
    for (let col = 0; col < cols; col++) {
      out.push({
        kind: "window",
        x: (col + 0.5) / cols,
        y,
        width,
        height,
        depth: 0.08,
        color: sample.color,
        accent: sample.accent,
        text: "",
        shutters: false,
      });
    }
  }
  return out;
}
