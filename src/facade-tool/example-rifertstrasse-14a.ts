import type { FacadeDescription } from "./types";

export const rifertstrasse14aFacade: Omit<FacadeDescription, "buildingId" | "wallId"> = {
  version: 2,
  wallColor: "#d6cfc2",
  baseColor: "#d6cfc2",
  baseHeight: 0,
  roofColor: "#5c6164",
  overhang: true,
  gable: true,
  observations: "Rifertstrasse 14a: cream stucco, dark louvred shutters, gable roof, open ground-floor undercroft on three beige pillars.",
  undercroft: { x: 0.38, width: 0.52, height: 0.27, depth: 0.4, pillars: 3 },
  elements: [
    { kind: "door", x: 0.4, y: 0.12, width: 0.1, height: 0.2, depth: 0.35, color: "#8aa0aa", accent: "#e8e6dc", text: "", shutters: false },
    { kind: "sign", x: 0.08, y: 0.22, width: 0.05, height: 0.03, depth: 0.02, color: "#314c72", accent: "#f3f1e8", text: "14a", shutters: false },
    { kind: "window", x: 0.18, y: 0.48, width: 0.12, height: 0.13, depth: 0.03, color: "#4d5c62", accent: "#2b211c", text: "", shutters: true },
    { kind: "window", x: 0.4, y: 0.48, width: 0.12, height: 0.13, depth: 0.03, color: "#4d5c62", accent: "#2b211c", text: "", shutters: true },
    { kind: "window", x: 0.64, y: 0.48, width: 0.12, height: 0.13, depth: 0.03, color: "#4d5c62", accent: "#2b211c", text: "", shutters: true },
    { kind: "window", x: 0.86, y: 0.48, width: 0.09, height: 0.13, depth: 0.03, color: "#4d5c62", accent: "#efece3", text: "", shutters: false },
    { kind: "window", x: 0.18, y: 0.68, width: 0.12, height: 0.13, depth: 0.03, color: "#4d5c62", accent: "#2b211c", text: "", shutters: true },
    { kind: "window", x: 0.4, y: 0.68, width: 0.12, height: 0.13, depth: 0.03, color: "#4d5c62", accent: "#2b211c", text: "", shutters: true },
    { kind: "window", x: 0.64, y: 0.68, width: 0.12, height: 0.13, depth: 0.03, color: "#4d5c62", accent: "#2b211c", text: "", shutters: true },
    { kind: "window", x: 0.86, y: 0.68, width: 0.09, height: 0.13, depth: 0.03, color: "#4d5c62", accent: "#efece3", text: "", shutters: false },
  ],
};
