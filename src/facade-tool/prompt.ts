import type { ResolvedAddress, WallHint } from "./types";

export function facadePrompt(address: ResolvedAddress, hint: WallHint) {
  return `You are reading one street photograph to dress a measured 3D house in Adliswil, Switzerland.

Target house: ${address.label} (EGAID ${address.egaid}).
Measured street wall: ${hint.widthMetres} m wide, ${hint.heightMetres} m tall, about ${hint.storeys} storeys, ${hint.depthMetres} m deep.

The photograph is attached. Neighbours, cars, sky, plants and pavement may be in frame. Measure ONLY this addressed house — ignore every other building.

This JSON is not applied as a photo texture. A local engine paints the existing swissBUILDINGS3D mesh with wall/base/roof colours, optionally carves an undercroft, and places simple 3D boxes for each element. Wrong colours or a smeared window grid look worse than a missing ornament.

Coordinates are fractions of THIS house's photographed street wall:
- x = 0 at the left edge of this house, x = 1 at the right edge
- y = 0 at this house's pavement line (not the bottom of the photo), y = 1 at the gable peak, or the eaves if there is no gable
- x,y is the centre of each element

Fill the JSON schema. Use fidelity="observed": preserve the visible evidence, including irregular spacing and different window sizes.

Rules:
- Sample colours from sunlit plaster and roof tiles, not from shadow, sky, trees or cars.
- wallColor is the main upper plaster. baseColor is the darker ground storey if it differs; otherwise copy wallColor.
- baseHeight is the fraction from pavement to gable/eaves taken by that ground band. Use at least 0.18 when a distinct ground storey is visible.
- gable=true only if THIS street wall rises to a triangular peak. overhang=true only if the upper floors cantilever over a recessed ground storey.
- undercroft is a walk-in ground-floor void (open parking or a deep entrance on pillars): x/width/height on the street wall, depth as a fraction of the ${hint.depthMetres} m building depth, pillars = visible supports. Use null when the ground floor is a closed wall.
- A small covered porch is kind "recess", not undercroft.
- Add every clearly visible window and the entrance door on THIS wall. Add a sign only if house-number text is readable. Gable vents are kind "vent". A wall lamp is kind "light". A projecting balcony is kind "balcony".
- Account for photographic perspective. Align windows only when they clearly belong to the same physical storey; preserve asymmetric columns and different opening widths.
- Use the measured wall as a scale hint, not a template. Preserve narrow slit windows and wide glazing as separate sizes; do not force them to typical dimensions.
- Doors belong on the ground storey only. An upper French door is kind "window", plus kind "balcony" if it opens onto one.
- If only part of the wall is visible, leave unseen areas without elements. Never repeat bays or invent windows, balconies or shopfronts to fill space. Describe incomplete coverage in observations.
- A recess sits behind the door; give the opening width/height and depth 0.2–0.8.
- shutters=true only when louvred shutters are visible beside that window; shutter colour belongs in accent. blind is the visible roller-blind closure from 0 (open) to 1 (closed); use 0 on non-window elements.
- Element depth is in metres and is an estimate from the photograph. Preserve wide balcony spans; undercroft depth separately remains a fraction of building depth.
- Sign text must be the readable plaque only (for example "22a"). Never invent occupants or shop names.
- observations: one short paragraph — plaster, storeys, window grid (for example "2 rows of 3"), entrance, gable/undercroft. Do not mention neighbours.
- Do not describe unseen side or rear walls.`;
}
