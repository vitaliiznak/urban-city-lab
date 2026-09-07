import type { BuildingCollider, FacadeDescription, FacadeUndercroft, StreetWall } from "./types";

export function parseUndercroft(value: unknown): FacadeUndercroft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const num = (key: string, min: number, max: number) => {
    const n = row[key];
    return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const x = num("x", 0, 1);
  const width = num("width", 0.12, 1);
  const height = num("height", 0.08, 0.55);
  const depth = num("depth", 0.12, 1);
  const pillars = num("pillars", 0, 6);
  if (x == null || width == null || height == null || depth == null || pillars == null) return null;
  if (x - width / 2 < -0.04 || x + width / 2 > 1.04) return null;
  return { x, width, height, depth, pillars: Math.round(pillars) };
}

export function resolveUndercroft(description: FacadeDescription): FacadeUndercroft | null {
  if (description.undercroft) return description.undercroft;
  if (!description.overhang) return null;
  const recess = description.elements.find((element) => (
    element.kind === "recess" && element.width >= 0.42 && element.height >= 0.16
  ));
  if (!recess) return null;
  return {
    x: recess.x,
    width: recess.width,
    height: Math.max(0.16, recess.height * 1.15),
    depth: Math.min(0.7, Math.max(0.22, recess.depth || 0.35)),
    pillars: 3,
  };
}

export function undercroftBounds(wall: StreetWall, undercroft: FacadeUndercroft, collider?: BuildingCollider) {
  const width = wall.uMax - wall.uMin;
  const height = Math.max(0.4, wall.yMax - wall.visibleBase);
  const u0 = wall.uMin + (undercroft.x - undercroft.width / 2) * width;
  const u1 = wall.uMin + (undercroft.x + undercroft.width / 2) * width;
  const y0 = wall.visibleBase - 0.12;
  const y1 = wall.visibleBase + undercroft.height * height;
  const span = collider ? Math.min(collider.w, collider.d) : Math.max(2.4, width * 0.45);
  const inset = Math.max(0.7, Math.min(span * 0.72, undercroft.depth * span));
  return { u0, u1, y0, y1, inset, midU: (u0 + u1) / 2, openingW: u1 - u0, openingH: y1 - y0 };
}
