export type QualityTier = "high" | "medium" | "low";
export type ViewMode = "intro" | "overview" | "walk";

export type QualitySettings = {
  resolutionScale: number;
  shadows: boolean;
  shadowMapSize: number;
  shadowDistance: number;
  globeSSE: number;
  buildingSSE: number;
  vegetationSSE: number;
  structureSSE: number;
  hdr: boolean;
};

const walk: Record<QualityTier, QualitySettings> = {
  high: {
    resolutionScale: 1,
    shadows: true,
    shadowMapSize: 1024,
    shadowDistance: 420,
    globeSSE: 2,
    buildingSSE: 10,
    vegetationSSE: 28,
    structureSSE: 12,
    hdr: true,
  },
  medium: {
    resolutionScale: 1,
    shadows: true,
    shadowMapSize: 512,
    shadowDistance: 260,
    globeSSE: 2.6,
    buildingSSE: 14,
    vegetationSSE: 36,
    structureSSE: 16,
    hdr: true,
  },
  low: {
    resolutionScale: 1,
    shadows: false,
    shadowMapSize: 512,
    shadowDistance: 180,
    globeSSE: 3.4,
    buildingSSE: 18,
    vegetationSSE: 48,
    structureSSE: 22,
    hdr: true,
  },
};

const aerial: QualitySettings = {
  resolutionScale: 1,
  shadows: false,
  shadowMapSize: 512,
  shadowDistance: 200,
  globeSSE: 2.8,
  buildingSSE: 16,
  vegetationSSE: 40,
  structureSSE: 18,
  hdr: true,
};

export function settingsFor(mode: ViewMode, tier: QualityTier): QualitySettings {
  if (mode !== "walk") return aerial;
  return walk[tier];
}

export function createQualityController() {
  let tier: QualityTier = "high";
  let mode: ViewMode = "intro";
  let frames = 0;
  let time = 0;
  let pending: QualityTier | null = null;
  let changed = true;

  return {
    settings() {
      return settingsFor(mode, tier);
    },
    consume() {
      const dirty = changed;
      changed = false;
      return dirty;
    },
    setMode(next: ViewMode) {
      if (mode === next) return;
      mode = next;
      changed = true;
    },
    sample(dt: number) {
      if (mode !== "walk") return;
      frames += 1;
      time += dt;
      if (frames < 36) return;
      const average = time / frames;
      frames = 0;
      time = 0;
      const target: QualityTier =
        average > 0.026 ? "low" : average > 0.0185 ? "medium" : "high";
      if (target === tier) {
        pending = null;
        return;
      }
      if (pending !== target) {
        pending = target;
        return;
      }
      const rank = { high: 2, medium: 1, low: 0 };
      if (Math.abs(rank[target] - rank[tier]) > 1 && average > 0.016 && average < 0.024)
        pending = null;
      else {
        tier = target;
        pending = null;
        changed = true;
      }
    },
  };
}
