import { Cartesian2, Cartesian3, ImageBasedLighting } from "cesium";

// A shared diffuse sky keeps shaded street faces legible without per-model cubemap captures.
export function createStreetSkyLight() {
  const lighting = new ImageBasedLighting();
  lighting.imageBasedLightingFactor = new Cartesian2(1, 0);
  lighting.sphericalHarmonicCoefficients = [
    new Cartesian3(0.34, 0.37, 0.41),
    ...Array.from({ length: 8 }, () => new Cartesian3()),
  ];
  // Cesium 1.145 implements disposal but omits it from this class's declarations.
  return lighting as ImageBasedLighting & { destroy(): void };
}
