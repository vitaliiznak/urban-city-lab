import type { FacadeDescription, FacadeElement, FacadeElementKind } from "./types";
import { parseUndercroft } from "./undercroft";

const HEX = /^#[0-9a-fA-F]{6}$/;
const KINDS: FacadeElementKind[] = ["window", "door", "sign", "vent", "balcony", "recess", "light", "band"];

function hex(value: unknown) {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : null;
}

function fraction(value: unknown, min = 0, max = 1) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function element(value: unknown): FacadeElement {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-element");
  const row = value as Record<string, unknown>;
  const kind = KINDS.includes(row.kind as FacadeElementKind) ? row.kind as FacadeElementKind : null;
  const color = hex(row.color);
  const accent = hex(row.accent);
  const x = fraction(row.x);
  const y = fraction(row.y);
  const width = fraction(row.width, 0.005, 1);
  const height = fraction(row.height, 0.005, 1);
  const depth = fraction(row.depth, 0, 1.5) ?? 0;
  const text = typeof row.text === "string" && row.text.length <= 80 && !/[\x00-\x1f]/.test(row.text) ? row.text : null;
  if (!kind || !color || !accent || x == null || y == null || !width || !height || text == null) throw new Error("invalid-element");
  if (kind !== "sign" && text !== "") throw new Error("invalid-element");
  if (x - width / 2 < -0.02 || x + width / 2 > 1.02 || y - height / 2 < -0.02 || y + height / 2 > 1.02) throw new Error("invalid-element");
  return {
    kind, x, y, width, height, depth, color, accent, text,
    ...(row.blind == null ? {} : { blind: fraction(row.blind) ?? 0 }),
    shutters: row.shutters === true && kind === "window",
  };
}

export function validateFacadeDescription(value: unknown, buildingId: string): FacadeDescription {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-description");
  const row = value as Record<string, unknown>;
  const wallColor = hex(row.wallColor);
  const baseColor = hex(row.baseColor) ?? wallColor;
  const roofColor = hex(row.roofColor) ?? "#3d4246";
  const baseHeight = fraction(row.baseHeight) ?? 0;
  const observations = typeof row.observations === "string" ? row.observations.slice(0, 1200) : "";
  if (!wallColor || !baseColor || !roofColor || !Array.isArray(row.elements) || row.elements.length > 80) {
    throw new Error("invalid-description");
  }
  const elements = row.elements.map(element);
  return {
    version: 2,
    ...(row.fidelity === "observed" ? { fidelity: "observed" as const } : {}),
    buildingId,
    wallId: typeof row.wallId === "string" && row.wallId ? row.wallId : "street",
    wallColor,
    baseColor,
    baseHeight,
    roofColor,
    overhang: row.overhang === true,
    gable: row.gable === true,
    observations,
    undercroft: parseUndercroft(row.undercroft),
    elements,
  };
}

export function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON.");
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}
