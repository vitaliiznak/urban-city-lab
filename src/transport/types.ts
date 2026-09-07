export type Pattern = {
  id: string; ref: string; headsign: string; agencyId: string;
  polyline: number[][]; length: number; starts: number[];
  stops: { x: number; z: number; distance: number; arrivalOffset: number; departureOffset: number }[];
};
export type Catalog = { patterns: Pattern[] };
export type TransportManifest = {
  catalogs: { bus: Catalog; rail: Catalog };
  models: Record<string, { file: string; bytes: number }>;
};
export type VehiclePose = { id: string; ref: string; headsign: string; agencyId: string; x: number; z: number; angle: number; distance: number; dwelling: boolean };
export type Vehicle = VehiclePose & { kind: "bus" | "rail"; file: string; height: number; pitch: number };
export type TransitRequest = { seconds: number; x: number; z: number; sequence: number };
export type TransitResponse = { vehicles: Vehicle[]; sequence: number; seconds: number; error?: string };
