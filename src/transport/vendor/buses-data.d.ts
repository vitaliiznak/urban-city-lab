import type { Catalog, VehiclePose } from "../types";
export function preparePatterns(catalog: Catalog): unknown[];
export function vehiclesAt(patterns: unknown[], seconds: number, bounds?: object): VehiclePose[];
