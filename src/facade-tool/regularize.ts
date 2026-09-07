import { validateFacadeDescription } from "./schema";
import type { FacadeDescription, FacadeElement, WallHint } from "./types";

function cluster(values: number[], gap = 0.05) {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const value of sorted) {
    const last = groups.at(-1);
    if (!last || value - last[last.length - 1] > gap) groups.push([value]);
    else last.push(value);
  }
  return groups.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function clampSize(element: FacadeElement, widthM: number, heightM: number, baseHeight: number): FacadeElement {
  const ground = element.y <= baseHeight + 0.06;
  const maxW = element.kind === "balcony" ? 2.6
    : element.kind === "door" ? 1.7
    : element.kind === "window" && ground ? 4.2
    : element.kind === "window" ? 1.7
    : element.kind === "recess" ? 4
    : 1.2;
  const minW = element.kind === "light" || element.kind === "vent" || element.kind === "sign" ? 0.18 : 0.7;
  const maxH = element.kind === "door" ? 2.4
    : element.kind === "window" && ground ? 2.8
    : element.kind === "window" ? 1.7
    : element.kind === "balcony" ? 1.1
    : 0.9;
  const width = Math.min(maxW, Math.max(minW, element.width * widthM)) / widthM;
  const height = Math.min(maxH, Math.max(0.28, element.height * heightM)) / heightM;
  return { ...element, width, height, depth: Math.min(element.depth, element.kind === "balcony" ? 0.35 : 0.2) };
}

function fit(element: FacadeElement): FacadeElement {
  const width = Math.min(element.width, 0.94);
  const height = Math.min(element.height, 0.88);
  return {
    ...element,
    width,
    height,
    x: Math.min(1 - width / 2, Math.max(width / 2, element.x)),
    y: Math.min(1 - height / 2, Math.max(height / 2, element.y)),
  };
}

function fillGround(
  kept: FacadeElement[],
  description: FacadeDescription,
  widthM: number,
  heightM: number,
  sample: FacadeElement,
): FacadeElement[] {
  const shopW = 3.6 / widthM;
  const shopH = Math.min(2.4, Math.max(1.6, description.baseHeight * heightM * 0.7)) / heightM;
  const y = Math.max(0.09, description.baseHeight * 0.48);
  const occupied = kept.filter((element) => element.kind === "door" || element.kind === "window" || element.kind === "recess");
  const extras: FacadeElement[] = [];
  const count = Math.max(2, Math.round(widthM / 4.4));
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) / count;
    const hits = occupied.some((element) => Math.abs(element.x - x) < (element.width + shopW) * 0.55);
    if (hits) continue;
    extras.push({
      kind: "window",
      x,
      y,
      width: shopW,
      height: shopH,
      depth: 0.04,
      color: sample.color,
      accent: sample.accent,
      text: "",
      shutters: false,
    });
  }
  return [...kept, ...extras];
}

export function regularizeFacade(description: FacadeDescription, hint: WallHint): FacadeDescription {
  if (description.fidelity === "observed") return validateFacadeDescription(description, description.buildingId);
  const widthM = Math.max(4, hint.widthMetres);
  const heightM = Math.max(4, hint.heightMetres);
  const lifted = description.elements.map((element) => (
    element.kind === "door" && element.y > description.baseHeight + 0.06
      ? { ...element, kind: "window" as const }
      : element
  ));
  const clamped = lifted.map((element) => clampSize(element, widthM, heightM, description.baseHeight));
  const upper = clamped.filter((element) => element.kind === "window" && element.y > description.baseHeight + 0.05);
  const columns = cluster(upper.map((element) => element.x));
  const expectedCols = Math.max(3, Math.min(12, Math.round(widthM / 3.15)));
  const sparse = widthM >= 16 && columns.length < Math.max(6, expectedCols * 0.6) && upper.length > 0;

  let elements = clamped;
  if (sparse) {
    const rows = cluster(upper.map((element) => element.y), 0.055).filter((y) => y < 0.94);
    const sample = [...upper].sort((a, b) => b.width - a.width)[0];
    const windowW = Math.min(1.55, Math.max(0.95, median(upper.map((element) => element.width)) * widthM)) / widthM;
    const windowH = Math.min(1.6, Math.max(1.15, median(upper.map((element) => element.height)) * heightM)) / heightM;
    const balconySrc = clamped.find((element) => element.kind === "balcony");
    const keep = clamped.filter((element) => (
      element.kind === "sign" || element.kind === "light" || element.kind === "vent" || element.kind === "recess"
      || ((element.kind === "door" || element.kind === "window") && element.y <= description.baseHeight + 0.08)
    ));
    const ground = fillGround(keep, description, widthM, heightM, sample);
    const grid: FacadeElement[] = [...ground];
    for (const y of rows) {
      for (let col = 0; col < expectedCols; col++) {
        const x = (col + 0.5) / expectedCols;
        const hasBalcony = Boolean(balconySrc) && (col + 1) % 3 === 0;
        grid.push({
          kind: "window",
          x,
          y,
          width: windowW,
          height: windowH,
          depth: 0.04,
          color: sample.color,
          accent: sample.accent,
          text: "",
          shutters: sample.shutters,
        });
        if (hasBalcony && balconySrc) {
          grid.push({
            kind: "balcony",
            x,
            y: y - windowH * 0.42,
            width: Math.min(2.3 / widthM, windowW * 1.3),
            height: Math.min(0.95 / heightM, windowH * 0.5),
            depth: 0.22,
            color: balconySrc.color,
            accent: balconySrc.accent,
            text: "",
            shutters: false,
          });
        }
      }
    }
    elements = grid.slice(0, 80);
  }

  const overhang = description.overhang && widthM < 16;
  return validateFacadeDescription({ ...description, overhang, elements: elements.map(fit) }, description.buildingId);
}
