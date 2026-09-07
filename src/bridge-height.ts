type Point = { x: number; z: number };
type Sample = Point & { height: number | undefined; time: number };

// Deck geometry changes only as tiles arrive. Reuse nearby samples instead of
// forcing a synchronous GPU render/readback for every animation frame.
export class BridgeHeight {
  private samples = new Map<string, Sample>();
  private previous?: Sample;
  sample(point: Point, now: number, probe: () => number | undefined) {
    const key = `${Math.round(point.x / .75)}:${Math.round(point.z / .75)}`;
    const cached = this.samples.get(key);
    if (cached && now - cached.time < (cached.height === undefined ? 1000 : 5000)) return cached.height;
    const previous = this.previous;
    if (previous && now - previous.time < 200 && Math.hypot(point.x - previous.x, point.z - previous.z) < 2.5) return previous.height;
    const value = probe();
    const sample = { ...point, time: now, height: Number.isFinite(value) ? value : undefined };
    this.samples.delete(key); this.samples.set(key, sample); this.previous = sample;
    if (this.samples.size > 128) this.samples.delete(this.samples.keys().next().value!);
    return sample.height;
  }
  clear() { this.samples.clear(); this.previous = undefined; }
}
