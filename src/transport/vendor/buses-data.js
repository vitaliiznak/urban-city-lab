import {preparePolyline, samplePolyline} from './bus-route.js';
export {preparePolyline, samplePolyline} from './bus-route.js';
import {travelProgress, busHeading} from './bus-motion.js';

export function parseGtfsTime(value) {
  const match = /^(\d+):(\d+):(\d+)$/.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function formatClock(seconds) {
  const wrapped = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const zurichClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

export function zurichDaySeconds(now = Date.now()) {
  const parts = zurichClock.formatToParts(new Date(now));
  const value = type => Number(parts.find(part => part.type === type)?.value);
  return value('hour') * 3600 + value('minute') * 60 + value('second') + ((now % 1000) + 1000) % 1000 / 1000;
}

export function validateBusLayer(spec) {
  return validateTransitLayer(spec, 'adliswil-bus-layer-v1', 'bus-layer');
}

export function validateRailLayer(spec) {
  return validateTransitLayer(spec, 'adliswil-rail-layer-v1', 'rail-layer');
}

function validateTransitLayer(spec, format, label) {
  if (spec?.format !== format) throw Error(`Unexpected ${label} format`);
  if (!spec.source?.timetable?.provider || !Array.isArray(spec.patterns) || !spec.patterns.length) throw Error(`${label} is missing patterns`);
  for (const pattern of spec.patterns) {
    if (!pattern?.id || !pattern.ref || !Array.isArray(pattern.polyline) || pattern.polyline.length < 2) throw Error(`Invalid ${label.replace('-layer','')} pattern`);
    if (!Number.isFinite(pattern.length) || pattern.length <= 0) throw Error(`Invalid ${label.replace('-layer','')} pattern length`);
    if (!Array.isArray(pattern.stops) || !pattern.stops.length) throw Error(`${label.replace('-layer','')} pattern has no stops`);
    if (!Array.isArray(pattern.starts) || !pattern.starts.length) throw Error(`${label.replace('-layer','')} pattern has no trips`);
    if (!pattern.polyline.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) throw Error(`${label.replace('-layer','')} polyline is not finite`);
    for (const stop of pattern.stops) {
      if (![stop.x, stop.z, stop.distance, stop.arrivalOffset, stop.departureOffset].every(Number.isFinite)) throw Error(`Invalid ${label.replace('-layer','')} stop timing`);
    }
  }
  return spec;
}

export function preparePatterns(spec) {
  return spec.patterns.map(pattern => ({
    ...pattern,
    prepared: preparePolyline(pattern.polyline),
    color: pattern.color ? `#${pattern.color.replace(/^#/, '')}` : '#f0c23a',
  }));
}

function activeStart(pattern, daySeconds) {
  const duration = (pattern.stops.at(-1)?.departureOffset ?? 0) + 8;
  const t = ((daySeconds % 86400) + 86400) % 86400;
  const candidates = [t, t + 86400];
  for (const start of pattern.starts) {
    for (const clock of candidates) {
      if (clock + 2 >= start && clock <= start + duration) return {start, clock};
    }
  }
  return null;
}

export function poseOnPattern(pattern, daySeconds) {
  const hit = activeStart(pattern, daySeconds);
  if (!hit) return null;
  const elapsed = hit.clock - hit.start;
  const stops = pattern.stops;
  if (elapsed < (stops[0].arrivalOffset ?? 0) - 1) return null;
  for (const stop of stops) {
    if (elapsed >= stop.arrivalOffset && elapsed <= stop.departureOffset) {
      const pose = samplePolyline(pattern.prepared, stop.distance);
      return pose ? {...pose, angle: busHeading(pattern.prepared, pose.distance), dwelling: true, start: hit.start, clock: daySeconds} : null;
    }
  }
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1];
    const to = stops[i];
    if (elapsed > to.arrivalOffset) continue;
    const span = to.arrivalOffset - from.departureOffset;
    const u = span <= 0 ? 1 : Math.max(0, Math.min(1, (elapsed - from.departureOffset) / span));
    const distance = from.distance + travelProgress(u * span, span) * (to.distance - from.distance);
    const pose = samplePolyline(pattern.prepared, distance);
    return pose ? {...pose, angle: busHeading(pattern.prepared, pose.distance), dwelling: false, start: hit.start, clock: daySeconds} : null;
  }
  return null;
}

export function vehiclesAt(patterns, daySeconds, bounds) {
  const vehicles = [];
  for (const pattern of patterns) {
    const duration = (pattern.stops.at(-1)?.departureOffset ?? 0) + 8;
    const t = ((daySeconds % 86400) + 86400) % 86400;
    for (const start of pattern.starts) {
      let clock = null;
      if (t + 2 >= start && t <= start + duration) clock = t;
      else if (t + 86400 + 2 >= start && t + 86400 <= start + duration) clock = t + 86400;
      if (clock == null) continue;
      const pose = poseOnPattern({...pattern, starts: [start]}, clock);
      if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) continue;
      if (bounds && (pose.x < bounds.minX - 20 || pose.x > bounds.maxX + 20 || pose.z < bounds.minZ - 20 || pose.z > bounds.maxZ + 20)) continue;
      vehicles.push({
        id: `${pattern.id}:${start}`,
        ref: pattern.ref,
        headsign: pattern.headsign,
        color: pattern.color,
        agencyId: pattern.agencyId,
        ...pose,
        start,
      });
    }
  }
  return vehicles;
}

export function departuresForStop(patterns, {id, lifeId, name, x, z}, daySeconds, limit = 8) {
  const local = String(name || '').replace(/^Adliswil,\s*/i, '').trim().toLowerCase();
  const t = ((daySeconds % 86400) + 86400) % 86400;
  const rows = [];
  for (const pattern of patterns) {
    const stops = pattern.stops.filter(stop => (
      (lifeId && stop.lifeId === lifeId) ||
      (id && (stop.mapId === id || stop.lifeId === id)) ||
      (local && stop.localName.toLowerCase() === local) ||
      (Number.isFinite(x) && Math.hypot(stop.x - x, stop.z - z) < 14)
    ));
    for (const stop of stops) {
      for (const start of pattern.starts) {
        let departure = start + stop.departureOffset;
        if (departure < t - 20) departure += 86400;
        if (departure < t - 20) continue;
        rows.push({
          ref: pattern.ref,
          headsign: pattern.headsign,
          color: pattern.color,
          seconds: departure,
          wait: departure - t,
          clock: formatClock(departure),
          lifeId: stop.lifeId,
          stopName: stop.name,
        });
      }
    }
  }
  rows.sort((a, b) => a.seconds - b.seconds || a.ref.localeCompare(b.ref));
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = `${row.ref}|${row.headsign}|${row.clock}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}
