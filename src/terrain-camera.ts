// Test the whole line of sight, not just the camera's endpoint. Lift the
// following view over nearby terrain before shortening it toward the player.
export function terrainCamera(pitch: number, distance: number, clear: (distance: number, pitch: number) => boolean) {
  let best = { pitch, distance: .7 };
  for (let angle = pitch; ; angle = Math.max(-1.1, angle - .18)) {
    let available = distance;
    for (let d = .7; d <= distance + .001; d += .35) {
      if (!clear(Math.min(d, distance), angle)) { available = Math.max(.7, d - .35); break; }
    }
    if (available === distance && !clear(distance, angle)) available = Math.max(.7, distance - .35);
    if (available >= distance) return { pitch: angle, distance };
    if (available > best.distance) best = { pitch: angle, distance: available };
    if (angle <= -1.1) return best;
  }
}
