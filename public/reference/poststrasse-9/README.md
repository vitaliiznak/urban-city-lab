# Poststrasse 9 photographic reference

`source.png` is an unchanged copy of the photograph supplied by the user on 9 September 2026. Its capture date, photographer and physical measurements are unknown. It is displayed for comparison, not applied as a building texture.

SHA-256: `0cb3bcb8b18de3f446a489c07af077739ca23678382d8361bd0bf6095f941246`

`job.json` is a manually reviewed example, not the output of a live model run. It targets official building UUID `C507D4AC-25B0-4F5C-9C28-D95B628F250F` and the local official-address record for Poststrasse 9 (EGAID 101013745).

Run `node --import tsx scripts/prepare-poststrasse-reference.ts` from city-lab to reproduce it. The script uses the existing building and address snapshots and the measured recessed top-storey surface from the corridor catalog. It makes no network requests. © swisstopo; © OpenStreetMap contributors (ODbL) for the geographic sources.

The reviewed details preserve four main window rows, the narrow/wide pairs, four right-hand balconies, the shopfront and three top-storey openings. Their normalized positions were estimated by visual inspection, not calibrated photogrammetry. Balcony depth, side-wall bays, window materials and blind closure are approximate. Small signs, flowers, reflections, rail fittings and interiors are omitted. No details are added to unseen rear/north walls. This is a stylized reference reconstruction, not a survey.

The comparison camera is a clear street view selected within the existing world; it is not a recovered camera pose from the photograph. The terrain, measured building silhouette and collision footprint remain geographic source data. The original/enhanced toggle keeps the same camera and pauses the world.
