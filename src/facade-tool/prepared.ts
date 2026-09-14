import bahnhofplatz4 from "../../public/reference/bahnhofplatz-4/job.json";
import poststrasse9 from "../../public/reference/poststrasse-9-prepared/job.json";
import { foldNumber, foldStreet, parseAddress } from "./address";
import type { PhotoFacadeJob } from "./types";

// Bundled at build time: applying the prepared example never needs a vision service.
export const preparedFacade = bahnhofplatz4 as PhotoFacadeJob;
export const featuredPreparedFacade = poststrasse9 as PhotoFacadeJob;
export const preparedFacades = [featuredPreparedFacade, preparedFacade];

export function preparedFacadeFor(house: { label: string; x: number; z: number } | null) {
  if (!house || !Number.isFinite(house.x) || !Number.isFinite(house.z)) return null;
  const parsed = parseAddress(house.label);
  return preparedFacades.find(({ address }) =>
    foldStreet(parsed.street) === foldStreet(address.street)
    && foldNumber(parsed.number) === foldNumber(address.number)
    && Math.hypot(house.x - address.x, house.z - address.z) <= 0.1
  ) ?? null;
}
