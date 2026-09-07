import type { HouseNumber, ParsedAddress, ResolvedAddress } from "./types";

export function foldStreet(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replace(/strasse|straße|str\./g, "str")
    .replace(/[^a-z0-9]/g, "");
}

export function foldNumber(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function parseAddress(input: string): ParsedAddress {
  const trimmed = input.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  const end = trimmed.match(/^(.*?)[\s]*(\d+)\s*([a-zA-Z])?$/);
  if (end?.[1]?.trim()) {
    return { street: end[1].trim(), number: foldNumber(end[2] + (end[3] || "")) };
  }
  return { street: trimmed, number: "" };
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cur = row[j + 1];
      row[j + 1] = a[i] === b[j] ? prev : Math.min(prev, row[j], row[j + 1]) + 1;
      prev = cur;
    }
  }
  return row[b.length];
}

function streetScore(query: string, street: string) {
  const a = foldStreet(query);
  const b = foldStreet(street);
  if (!a || !b) return Infinity;
  if (a === b) return 0;
  if (a.startsWith(b) || b.startsWith(a)) return 0.4;
  if (a.includes(b) || b.includes(a)) return 0.8;
  return levenshtein(a, b);
}

export function searchAddresses(houses: HouseNumber[], query: string, limit = 8) {
  const parsed = parseAddress(query);
  if (!parsed.street && !parsed.number) return [];
  const ranked = houses
    .map((house) => {
      const street = streetScore(parsed.street, house.street);
      const number = parsed.number
        ? foldNumber(house.number) === parsed.number
          ? 0
          : foldNumber(house.number).startsWith(parsed.number)
            ? 0.5
            : 4
        : 0.6;
      return { house, score: street + number };
    })
    .filter((row) => row.score <= 3)
    .sort((a, b) => a.score - b.score || a.house.street.localeCompare(b.house.street) || a.house.number.localeCompare(b.house.number));
  const seen = new Set<string>();
  const out: HouseNumber[] = [];
  for (const row of ranked) {
    const key = `${row.house.street}|${row.house.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.house);
    if (out.length >= limit) break;
  }
  return out;
}

export function resolveAddress(houses: HouseNumber[], query: string): ResolvedAddress {
  const parsed = parseAddress(query);
  if (!parsed.number) throw new Error("Add a house number, for example Rifertstrasse 22a.");
  const matches = searchAddresses(houses, query, 6);
  const exact = matches.find((house) => foldNumber(house.number) === parsed.number);
  const house = exact ?? matches[0];
  if (!house) throw new Error("No matching Adliswil address was found.");
  return {
    label: `${house.street} ${house.number}`,
    query: query.trim(),
    number: house.number,
    street: house.street,
    x: house.x,
    z: house.z,
    heading: house.heading,
    egaid: house.egaid,
  };
}
