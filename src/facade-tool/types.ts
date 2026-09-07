export type HouseNumber = {
  id: string;
  egaid: number;
  number: string;
  street: string;
  x: number;
  z: number;
  heading: number;
};

export type BuildingRecord = {
  id: string;
  latitude: number;
  longitude: number;
  min: number[];
  max: number[];
  ownerChunk: string;
  overlapChunks?: string[];
  kind?: string;
};

export type BuildingCollider = {
  buildingId: string;
  x: number;
  z: number;
  w: number;
  d: number;
  p: number[][];
  holes: number[][][];
  baseY: number;
  height: number;
  ownerChunk: string;
  overlapChunks?: string[];
};

export type ParsedAddress = {
  street: string;
  number: string;
};

export type ResolvedAddress = {
  label: string;
  query: string;
  number: string;
  street: string;
  x: number;
  z: number;
  heading: number;
  egaid: number;
};

export type FacadeElementKind = "window" | "door" | "sign" | "vent" | "balcony" | "recess" | "light" | "band";

export type FacadeElement = {
  kind: FacadeElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  color: string;
  accent: string;
  text: string;
  shutters: boolean;
  blind?: number;
};

export type FacadeUndercroft = {
  x: number;
  width: number;
  height: number;
  depth: number;
  pillars: number;
};

export type FacadeDescription = {
  version: 2;
  fidelity?: "observed";
  buildingId: string;
  wallId: string;
  wallColor: string;
  baseColor: string;
  baseHeight: number;
  roofColor: string;
  overhang: boolean;
  gable: boolean;
  observations: string;
  undercroft: FacadeUndercroft | null;
  elements: FacadeElement[];
};

export type StreetWall = {
  id: string;
  buildingId: string;
  chunk: string;
  normal: [number, number, number];
  plane: number;
  uMin: number;
  uMax: number;
  yMin: number;
  yMax: number;
  visibleBase: number;
  points: number[];
  source: "mesh" | "bounds";
};

export type WallHint = {
  widthMetres: number;
  heightMetres: number;
  depthMetres: number;
  storeys: number;
};

export type PhotoFacadeJob = {
  provider: "codex-cli" | "api" | "fixture" | "reviewed-photo";
  reviewedFaces?: { wallId: string; facade: FacadeDescription; surface?: StreetWall }[];
  referenceView?: { position: [number, number, number]; target: [number, number, number] };
  photo?: string;
  address: ResolvedAddress;
  building: {
    id: string;
    latitude: number;
    longitude: number;
    chunk: string;
  };
  wallHint: WallHint;
  facade: FacadeDescription;
};
