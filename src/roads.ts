import {
  Cartesian3,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  CorridorGeometry,
  CornerType,
  GeometryInstance,
  GroundPrimitive,
  PerInstanceColorAppearance,
  type Viewer,
} from "cesium";
import data from "./data/surfaces.json";

export function mappedRoads() {
  return data.surfaces.filter(
    (s) => s.type === "road" && s.coordinates.length > 1,
  );
}

export function addRoadSurfaces(viewer: Viewer) {
  const later =
    "requestIdleCallback" in window
      ? (fn: () => void) =>
          window.requestIdleCallback(fn, { timeout: 1400 })
      : (fn: () => void) => window.setTimeout(fn, 240);
  later(() => {
    if (viewer.isDestroyed()) return;
    const instances = mappedRoads().map(
      (s) =>
        new GeometryInstance({
          id: `surface-${s.id}`,
          geometry: new CorridorGeometry({
            positions: Cartesian3.fromDegreesArray(s.coordinates.flat()),
            width: s.width,
            cornerType: CornerType.ROUNDED,
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            granularity: 0.00002,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              Color.fromCssColorString("#5a5e5c"),
            ),
          },
        }),
    );
    viewer.scene.groundPrimitives.add(
      new GroundPrimitive({
        geometryInstances: instances,
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          flat: true,
        }),
        classificationType: ClassificationType.TERRAIN,
        asynchronous: true,
      }),
    );
    viewer.scene.requestRender();
  });
}
