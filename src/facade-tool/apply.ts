import * as THREE from "three";
import { createFacadeDetails } from "@explorer/facade-details.js";
import { WORLD_SCALE } from "../three-world/geo";
import type { BuildingCollider, FacadeDescription, FacadeElement, StreetWall, WallHint, PhotoFacadeJob } from "./types";
import {
  facadeBands,
  gableSkinPoints,
  paintBuilding,
  paintStreetWall,
  restoreStreetWall,
  wallSkinPoints,
  type PaintableMesh,
  type WallPaintEdit,
} from "./paint-wall";
import { alignWallsToStreet } from "./extract-wall";
import { carveUndercroft, restoreBuildingShape, type ShapeEdit } from "./carve-undercroft";
import { resolveUndercroft, undercroftBounds } from "./undercroft";
import { regularizeFacade } from "./regularize";
import { sideWindows } from "./sides";

export function disposePhotoFacade(group: THREE.Object3D) {
  restoreStreetWall((group.userData.wallPaint as WallPaintEdit[]) || []);
  restoreBuildingShape((group.userData.shapeEdits as ShapeEdit[]) || []);
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    if (mesh.material) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
      }
    }
  });
  for (const material of materials) {
    const record = material as THREE.MeshStandardMaterial;
    if (record.map) record.map.dispose();
    material.dispose();
  }
}

function faceOf(wall: StreetWall) {
  return {
    id: wall.id,
    normal: wall.normal,
    plane: wall.plane,
    uMin: wall.uMin,
    uMax: wall.uMax,
    yMin: wall.yMin,
    yMax: wall.yMax,
    groundY: wall.visibleBase,
  };
}

function skinMaterial(color: string) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

function addSkin(host: THREE.Group, points: number[], color: string) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(points), 3));
  geometry.computeVertexNormals();
  host.add(new THREE.Mesh(geometry, skinMaterial(color)));
}

function mixHex(hex: string, toward: string, amount: number) {
  const pair = (value: string, i: number) => Number.parseInt(value.slice(i, i + 2), 16);
  const channel = (i: number) => Math.round(pair(hex, i) * (1 - amount) + pair(toward, i) * amount);
  return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, "0")).join("")}`;
}

function dressUndercroft(
  details: ReturnType<typeof createFacadeDetails>,
  wall: StreetWall,
  description: FacadeDescription,
  carved: boolean,
  collider?: BuildingCollider,
) {
  const undercroft = resolveUndercroft(description);
  if (!undercroft) return false;
  const face = faceOf(wall);
  const { midU, openingW, openingH, inset, y1 } = undercroftBounds(wall, undercroft, collider);
  const floorY = wall.visibleBase + 0.03;
  const topY = y1;
  const midY = (floorY + topY) / 2;
  const inner = mixHex(description.wallColor, "#111111", 0.28);
  const pillar = mixHex(description.wallColor, "#ebe4d4", 0.2);
  const cavity = carved ? inset : Math.min(inset, 0.55);
  const front = carved ? -cavity + 0.01 : -cavity + 0.06;
  details.box(face, midU, midY, openingW, openingH, cavity, inner, { offset: front });
  details.box(face, midU, topY - 0.035, openingW + 0.12, 0.09, cavity + 0.16, description.wallColor, { offset: front });
  details.box(face, midU, floorY, openingW, 0.045, cavity, mixHex("#d8d2c6", description.wallColor, 0.2), { offset: front });
  details.box(face, midU, midY, openingW, openingH, 0.05, mixHex(description.wallColor, "#1a1a1a", 0.25), { offset: front });
  for (const side of [-1, 1]) {
    details.box(face, midU + side * openingW / 2, midY, 0.08, openingH, cavity, description.wallColor, { offset: front });
  }
  const count = Math.max(0, undercroft.pillars);
  for (let i = 0; i < count; i++) {
    const u = midU - openingW / 2 + ((i + 0.5) / count) * openingW;
    details.box(face, u, midY, 0.24, openingH - 0.05, 0.24, pillar, { offset: carved ? -0.02 : 0.02 });
  }
  const door = description.elements.find((element) => element.kind === "door");
  if (door) {
    const width = wall.uMax - wall.uMin;
    const height = Math.max(0.4, wall.yMax - wall.visibleBase);
    details.box(
      face,
      wall.uMin + door.x * width,
      wall.visibleBase + door.y * height,
      door.width * width,
      door.height * height,
      0.04,
      door.color,
      { glass: true, offset: carved ? -inset + 0.04 : front + 0.02 },
    );
  }
  return true;
}

function framedOpening(
  details: ReturnType<typeof createFacadeDetails>,
  face: ReturnType<typeof faceOf>,
  u: number,
  y: number,
  w: number,
  h: number,
  glass: string,
  frame: string,
  options: { shutters?: string | null; mullion?: boolean } = {},
) {
  const trim = Math.min(0.04, w * 0.1, h * 0.12);
  details.box(face, u, y, w, h, 0.03, glass, { glass: true, offset: 0.02 });
  for (const side of [-1, 1]) {
    details.box(face, u + side * (w - trim) / 2, y, trim, h, 0.04, frame, { offset: 0.03 });
    details.box(face, u, y + side * (h - trim) / 2, w, trim, 0.04, frame, { offset: 0.03 });
  }
  if (options.mullion) details.box(face, u, y, 0.02, h, 0.035, frame, { offset: 0.04 });
  if (options.shutters) {
    const shutterW = Math.min(w * 0.42, 0.32);
    for (const side of [-1, 1]) {
      details.box(face, u + side * (w / 2 + shutterW / 2 + 0.015), y, shutterW, h, 0.03, options.shutters, { offset: 0.03 });
    }
  }
}

function dressWall(
  details: ReturnType<typeof createFacadeDetails>,
  wall: StreetWall,
  description: FacadeDescription,
  elements: FacadeElement[],
  fallbackHost: THREE.Group,
  undercroft = resolveUndercroft(description),
  streetFace = true,
) {
  const face = faceOf(wall);
  const width = wall.uMax - wall.uMin;
  const { height, eaves, baseTop } = facadeBands(wall, description);
  const midU = (wall.uMin + wall.uMax) / 2;
  const upperOffset = 0.034;
  const groundOffset = description.overhang && width < 8 ? -0.16 : 0.02;
  if (streetFace) {
    addSkin(fallbackHost, wallSkinPoints(wall, baseTop, eaves, upperOffset), description.wallColor);
    if (description.gable && wall.yMax - eaves > 0.12) {
      addSkin(fallbackHost, gableSkinPoints(wall, eaves, upperOffset), description.wallColor);
    }
    if (description.baseHeight > 0.03) {
      const openingLeft = undercroft ? wall.uMin + (undercroft.x - undercroft.width / 2) * width : wall.uMin;
      const openingRight = undercroft ? wall.uMin + (undercroft.x + undercroft.width / 2) * width : wall.uMin;
      const bands = undercroft
        ? [[wall.uMin, openingLeft], [openingRight, wall.uMax]] as const
        : [[wall.uMin, wall.uMax] as const];
      for (const [u0, u1] of bands) {
        if (u1 - u0 < 0.18) continue;
        addSkin(fallbackHost, wallSkinPoints(wall, wall.visibleBase - 0.04, baseTop, groundOffset, u0, u1), description.baseColor);
        details.box(
          face,
          (u0 + u1) / 2,
          (wall.visibleBase + baseTop) / 2,
          u1 - u0,
          Math.max(0.12, baseTop - wall.visibleBase),
          0.05,
          description.baseColor,
          { offset: groundOffset },
        );
      }
      details.box(face, midU, baseTop, width + 0.08, 0.055, description.overhang && width < 8 ? 0.22 : 0.06, mixHex(description.baseColor, description.wallColor, 0.2), {
        offset: 0.01,
      });
    }
    if (width < 8) {
      details.box(face, midU, eaves - 0.02, width + 0.14, 0.08, description.overhang ? 0.22 : 0.12, description.roofColor, { offset: 0 });
      if (description.overhang) {
        details.box(face, midU, eaves + 0.03, width + 0.18, 0.035, 0.28, mixHex(description.roofColor, "#111111", 0.2), { offset: -0.02 });
      }
    }
  }
  for (const element of elements) {
    const u = wall.uMin + element.x * width;
    const y = wall.visibleBase + element.y * height;
    const w = element.width * width;
    const h = element.height * height;
    if (element.kind === "band") {
      details.box(face, u, y, w, h, Math.max(0.015, element.depth * WORLD_SCALE), element.color, {offset: 0.025});
    } else if (element.kind === "recess") {
      if (undercroft && Math.abs(element.x - undercroft.x) < undercroft.width * 0.6 && element.y < undercroft.height + 0.06) continue;
      const depth = description.fidelity === "observed" ? Math.max(0.02, element.depth * WORLD_SCALE) : Math.max(0.14, element.depth || 0.35);
      details.box(face, u, y, w, h, depth, element.color, { offset: -depth + 0.02 });
    } else if (element.kind === "window" && description.fidelity === "observed") {
      details.window(face, u, y, w, h, {frame: element.accent, glass: element.color, blind: element.blind ?? 0, shutters: element.shutters ? element.accent : null, mullion: w > 0.5});
    } else if (element.kind === "window") {
      framedOpening(details, face, u, y, w, h, element.color, element.accent, {
        shutters: element.shutters ? element.accent : null,
        mullion: w > 0.85,
      });
    } else if (element.kind === "door") {
      framedOpening(details, face, u, y, w, h, element.color, element.accent, { mullion: true });
    } else if (element.kind === "sign" && element.text) {
      details.sign(face, u, y, w, h, element.text, { background: element.color, color: element.accent });
    } else if (element.kind === "light") {
      const size = Math.max(0.05, Math.min(w, h) * 0.55);
      details.disc(face, u, y, size, element.color, { offset: 0.07, glass: true });
      details.box(face, u, y, size * 0.55, size * 0.55, 0.04, element.accent, { offset: 0.03 });
    } else if (element.kind === "vent") {
      const size = Math.min(w, h);
      details.box(face, u, y, size, size, size * 0.22, element.color, { offset: 0.04 });
    } else if (element.kind === "balcony") {
      if (description.fidelity === "observed") {
        const depth = Math.max(0.05, element.depth * WORLD_SCALE);
        const floor = y - h / 2;
        details.box(face, u, floor, w, 0.07, depth, element.color, {offset: 0});
        const panels = Math.max(3, Math.round(w / 0.19));
        for (let i = 0; i < panels; i++) {
          details.box(face, u - w / 2 + (i + 0.5) * w / panels, floor + h / 2, w / panels * 0.88, h, 0.025, element.accent, {offset: depth - 0.03});
        }
        details.box(face, u, floor + h, w, 0.022, 0.025, "#727d7c", {offset: depth - 0.03});
        for (const side of [-1, 1]) details.box(face, u + side * (w / 2 - 0.015), floor + h / 2, 0.025, h, depth, element.accent, {offset: 0});
        continue;
      }
      details.balcony(face, u, y - h / 2 + 0.04, Math.min(w, 1.15), Math.max(0.12, Math.min(h, 0.42)), 0.2, {
        slab: element.color,
        rail: element.accent,
      });
    }
  }
}

function hintForWall(wall: StreetWall, fallback?: WallHint): WallHint {
  const widthMetres = Math.max((wall.uMax - wall.uMin) / WORLD_SCALE, fallback?.widthMetres ?? 0);
  const heightMetres = Math.max((wall.yMax - wall.visibleBase) / WORLD_SCALE, fallback?.heightMetres ?? 0);
  return {
    widthMetres: Number(widthMetres.toFixed(2)),
    heightMetres: Number(heightMetres.toFixed(2)),
    depthMetres: fallback?.depthMetres ?? Number(widthMetres.toFixed(2)),
    storeys: fallback?.storeys ?? Math.max(2, Math.round(heightMetres / 3.2)),
  };
}

export function applyPhotoFacade(
  walls: StreetWall[],
  description: FacadeDescription,
  meshes: PaintableMesh[] = [],
  collider?: BuildingCollider,
  streetId?: string,
  streetY?: number,
  hint?: WallHint,
  reviewedFaces?: PhotoFacadeJob["reviewedFaces"],
  paintOnlyMapped = false,
) {
  const group = new THREE.Group();
  group.name = `photo-facade:${description.buildingId}`;
  const aligned = reviewedFaces ? walls : alignWallsToStreet(walls, streetY);
  const street = aligned.find((wall) => wall.id === streetId) ?? aligned[0];
  const dressed = street
    ? (() => {
      try {
        return regularizeFacade(description, hintForWall(street, hint));
      } catch {
        return description;
      }
    })()
    : description;
  const edits = !collider ? [] : paintOnlyMapped && reviewedFaces
    ? aligned.filter(wall => reviewedFaces.some(face => face.wallId === wall.id)).flatMap(wall => paintStreetWall(meshes, wall, collider, dressed))
    : paintBuilding(meshes, collider, dressed, aligned);
  const painted = edits.reduce((sum, edit) => sum + edit.vertices.length, 0);
  group.userData.wallPaint = edits;
  group.userData.paintedVertices = painted;
  group.userData.wallCount = aligned.length;

  const undercroft = resolveUndercroft(dressed);
  const shapeEdits = undercroft && street && collider
    ? carveUndercroft(meshes as unknown as Parameters<typeof carveUndercroft>[0], street, collider, undercroft)
    : [];
  group.userData.shapeEdits = shapeEdits;
  group.userData.undercroft = undercroft ? (shapeEdits.length ? "carved" : "shown") : "";

  const details = createFacadeDetails(group.name + "/details");
  if (street && undercroft) dressUndercroft(details, street, dressed, shapeEdits.length > 0, collider);
  for (const wall of aligned) {
    if (reviewedFaces) {
      const reviewed = reviewedFaces.find((face) => face.wallId === wall.id);
      if (reviewed) dressWall(details, wall, reviewed.facade, reviewed.facade.elements, group, null, false);
      continue;
    }
    const streetFace = wall === street || wall.id === street?.id;
    const elements = streetFace
      ? dressed.elements.filter((element) => {
        if (!undercroft) return true;
        if (element.kind === "door") return false;
        if (element.kind === "window" && element.y < undercroft.height + 0.05 && Math.abs(element.x - undercroft.x) < undercroft.width / 2) return false;
        return true;
      })
      : dressed.fidelity === "observed" ? [] : sideWindows(dressed, street ?? wall, wall);
    dressWall(details, wall, dressed, elements, group, streetFace ? undercroft : null, streetFace);
  }
  group.add(details.finish());
  group.userData.facade = dressed;
  group.userData.wall = street;
  group.userData.walls = aligned;
  return group;
}
