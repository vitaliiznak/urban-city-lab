# Adliswil · A World to Wander

A React + TypeScript + CesiumJS city experience beside `adliswil-explorer`. The scope is a realistic city world with game-style entry, a third-person Explorer character, fast running and obstacles. No planning interface.

## Run

Node 22 or newer:

```sh
cd city-lab
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Internet and WebGL are required. No API key or Cesium ion account is needed. `npm run build` checks TypeScript and produces `dist/`; `npm run preview` serves it. `npm test` checks movement, collision clearance, water, bridges, courtyards and bounds. The Cesium engine and bundled geography produce a large bundle; the build reports a size advisory.

The entrance imports only destination metadata (212 KB JavaScript, 66 KB gzip in the current build). Walking geography and collision data load with the lazy 3D scene, so the entrance does not parse those datasets before it can render. This changes when the data loads, not the overall geographic coverage.

## Controls

- **WASD** walks at the original Explorer's 4.6 metres/second; **Shift** runs at 8 metres/second. The on-screen **Run mode** toggle also works with touch movement buttons.
- **Drag** or **arrow keys** orbit the following camera; **Q / R** also turn it. **Scroll** adjusts camera distance.
- **Esc** pauses. The visible character has the Explorer's idle, walking and running animations.
- **From above** switches to aerial exploration. Drag pans, scroll zooms, Ctrl + drag tilts. Choose the town centre, railway station, Sihl, valley cable station or Felsenegg to travel.
- **Clean streets** covers nearby mapped roads, paved paths and 299 surface parking areas with generated materials. It hides photographed vehicles and shadows inside those footprints while preserving surrounding aerial detail. 77 explicitly marked OSM crossings receive generated Swiss yellow stripes. The mapped Sihl also receives animated water. **Original imagery** hides these cleanup surfaces, so you can compare with SWISSIMAGE. Street cleanup fades back to imagery between 180 and 300 metres (river: 180–350 metres) and is disabled in aerial mode.
- **Daylight** changes the sun for an illustrative June day in Swiss local time, not live weather. Evening hours warm the sky and light some generated windows.
- The 3D view adapts quality while you walk: shadows stay close to the character, distant tiles get cheaper, and a slow machine drops resolution instead of stuttering.

## Geography and visual detail

- [Swiss terrain](https://docs.geo.admin.ch/visualize-data/terrain-service.html) and [SWISSIMAGE imagery](https://docs.geo.admin.ch/visualize-data/wmts.html) stream from swisstopo.
- [swissBUILDINGS3D and Swiss 3D vegetation / landscape structures](https://docs.geo.admin.ch/visualize-data/3d-tiles.html) provide building shapes, trees and infrastructure. Building tiles are pinned to **20260520**, matching the original Explorer's measured building collider source; other Swiss layers use current available tiles.
- Window glass, frames, wall detail and roof shading are procedural shaders. They are illustrative decoration on measured building shapes, not photographic or surveyed façade details. Some windows glow after late afternoon.
- Street cleanup is selective procedural resurfacing, not vehicle detection or image inpainting. Asphalt/gravel grain is evaluated by a shader in fixed geographic space; no per-frame image inference or texture uploads are needed. Covered, underground, multi-storey and incomplete parking outlines are excluded. Paved-path material tags are retained; natural paths and gardens keep the original imagery. Road widths, untagged parking materials and crossing stripe dimensions have visual defaults. Cars outside mapped footprints, photographic building/tree shadows and unmapped markings can remain; a reviewed offline vehicle-and-shadow mask plus inpainting would be needed for object-level removal.
- The actual Explorer character is exported as `public/explorer.glb` with Idle, Walk and Run clips. It is a stylized character within the geographic world.

© swisstopo. © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), **ODbL 1.0**. Keep attribution and applicable derivative-database obligations when distributing. Source metadata is preserved in the derived JSON files and the adjacent explorer. Snapshot acquisition dates are not survey dates. Google Fonts supplies interface fonts with system fallbacks.

## Movement and collision

`src/collision.ts` uses a 0.42 m body radius, measured building footprints (including courtyards), water polygons, bridge corridors and the town / summit boundary. Collision queries use a spatial index. Movement uses steps no longer than 0.18 m and slides along walls, so high speed cannot tunnel across thin obstacles. The camera shortens its follow distance before buildings and uses rendered-geometry ray checks for trees and structures, while staying above terrain. The ray API is isolated in `src/player.ts` and relies on the pinned Cesium 1.145 runtime. Ground sampling rejects steep steps. The third-person avatar's visual feet rest on terrain or sampled bridge geometry. Bridge samples are cached in 0.75 m cells, refreshed after five seconds (one second after a failed sample), with at most five new nearby probes per second while moving. The bounded cache clears at destination changes; this avoids synchronous GPU readback every frame.

Building colliders follow the measured building set rendered here. Nearby loaded cars, benches, bins, lamp posts, hydrants, recycling containers, construction fences and other solid furniture also block movement. Their convex footprints are derived from the rendered geometry between 0.12 and 1.65 metres above the source terrain. Overhead signs and open goal frames are excluded; the Bushof uses its four explicit pier footprints, leaving the platform open. Collisions activate only for ready, visible street sections, and a newly loaded object around the player waits until they step clear before becoming solid.

Visible pedestrians also have body clearance. They wait when approaching the player and can continue moving away; the player can step around them. This is a lightweight movement system, not a general physics engine. Tree trunks, playground equipment and open structures do not have comprehensive collision. Bridge widths have fallback assumptions and deck transitions can be approximate. Some terrain elevations and live visual objects can differ from the original source snapshot. There are no interiors, jumping, driveable vehicles or multiplayer in this app.

## Reproduce derived assets

`npm run prepare:geography` reads the adjacent explorer's existing snapshots and derives paths, landmarks, building and water colliders, land cover and road surfaces. It makes no live acquisition requests. Files used:

- `outputs/adliswil/src/data/adliswil.json`
- `outputs/adliswil/src/data/felsenegg.json`
- `outputs/adliswil/src/data/felsenegg-station.json`
- `outputs/adliswil/public/data/adliswil-buildings.json`

`npm run prepare:avatar` imports the original `createCharacter()` and exports the local GLB. Regeneration needs the adjacent Explorer's npm dependencies installed (`npm --prefix ../adliswil-explorer/outputs/adliswil ci`). The finished avatar is bundled; this is not needed to run the city.

The existing Explorer and its local changes are untouched. No deployment has been performed.

## Reproduce street cleanup

`npm run prepare:street-cleanup` derives `src/data/street-cleanup.json` from the Explorer’s bundled OSM street-prop snapshot (8 September 2026), merged ways and road catalog. It does not modify source photography or fetch new data. OSM feature IDs and attribution remain in the derived catalog. Multipolygon parking relations are omitted rather than filling potential islands.

`src/street-cleanup.ts` batches terrain-only surfaces into nearby 200 m sections with distance fading, generated material grain and no picking buffers. Whole-feature bounds keep long roads eligible. At most 32 sections are selected, two nearby sections prepare at once, and 40 sections stay cached. Surface geometry is prepared through Cesium workers. The original broad land-cover replacement is no longer connected to the scene. GPU materials are retained across toggles and disposed with the viewer.

## Street life and detailed landmarks

`npm run prepare:world-details` reuses the Explorer’s source-backed builders to export 490 street sections and six architectural sections under `public/world-details/`. This includes bins, benches, lamps, bicycles, generic parked cars, playgrounds, civic furniture, street signs, 2,167 generated official house-number plates and the Bushof. The 58 detailed architectural replacements include Migros / Sunnemärt, the gallery, Soodstrasse and civic buildings. Generated sign textures are embedded locally.

At runtime, nearby street sections load with two concurrent requests and bounded residency. The architectural models replace matching UUIDs in the live Swiss building layer only after all local sections are ready. Their bodies are extracted from the original measured mesh using its validated ownership ranges; they are not reshaped. Terrain-grid placement can differ slightly from live terrain. House-number plaque dimensions and mounting heights are illustrative.

Asset regeneration needs the adjacent Explorer’s dependencies and city-lab’s development canvas dependency. No canvas library or Three.js renderer is added to the browser bundle. `tests/world-assets.test.mjs` checks actual exported object counts, measured replacement ownership, GLB buffers and non-empty Migros sign pixels. See `WORLD-PARITY.md` for the remaining parity and performance work; imported catalogs alone are not completion evidence.

## Buses, S4 and railway detail

`npm run prepare:transport` exports 19 generated vehicle variants with destination displays (11.2 MB total), the saved Swiss timetable for 8 September 2026 and its mapped local routes. It also copies the Explorer’s pure route/timetable functions with SHA-256 provenance into `src/transport/vendor/`. The browser needs neither the original Explorer checkout nor Three.js. The finished transport catalog is 108 KB and terrain grid 960 KB.

Vehicle positions and source-grid slope samples run in a dedicated worker at five updates per second. Cesium interpolates the results and loads at most two vehicle models concurrently, with at most 12 nearby vehicles. Coincident bodies are suppressed to avoid overlapping service variants at the same stop. The time-of-day slider selects a minute in the saved service day; transport advances while exploring and pauses with the game. These are illustrative vehicles and timetable movements, not live delays, actual fleet assignments, traffic simulation, collision-aware driving or rideable vehicles. Routes terminate at the ends of their saved local coverage.

The Station & Bushof starting point gives access to the interchange. World-detail generation also prepares 4.06 km of ground-level railway across 52 mapped ways, using tagged gauge (1,435 mm default), rails, sleepers and ballast. The 588 KB catalog contains 18 sections of 200 metres. Cesium drapes nearby surfaces on the streamed terrain, avoiding clipping against the older elevation grid. Up to 12 sections are visible, with two sections prepared per update and a bounded cache; aerial mode hides them. Tunnel, elevated and bridge ways are excluded from this ground treatment. Sleeper/ballast dimensions are illustrative. Nearby vehicles sample the loaded terrain at their wheelbase endpoints, with the source grid as fallback. Broader location/performance checks are tracked in `WORLD-PARITY.md`.

## People on foot

`npm run prepare:population` reuses the Explorer's character builder and public-path route planner, exporting 28 fictional characters with Idle and Walk animations (6.1 MB total). The 24 routes are checked against measured buildings, water and the actual exported solid street furniture. These characters are anonymous visual inhabitants, not actual residents or observed pedestrian counts. The exporter retains source hashes and route provenance without copying the original fictional biographies.

A dedicated worker advances their routes five times per second. At most eight nearby people are selected within 125 metres; only two models load concurrently. Cesium interpolates motion and uses loaded terrain height, with the saved terrain grid as fallback. People keep right, leave space behind a stopped person, turn at route ends, pause with the game and disappear in aerial mode. Loaded, visible bodies stop the player's walk or sprint. Their routes avoid static obstacles; this is not a crowd simulation with rerouting around queues or blocked intersections.

The single bridge route samples the rendered deck where available; its height transitions still need a location check. Tests sample every exported route through its full movement cycle and validate the GLB animation channels. Browser evidence for town-centre movement, sprint contact, stepping around a person, pause and aerial visibility is in `output/playwright/PEDESTRIANS.md`.

## Felseneggbahn

`npm run prepare:cableway` exports the original Explorer cabin proportions and a generated cable/support model into `public/cableway/`. The two assets total 272,736 bytes: four material batches per cabin and one for the cables/support. Three Cesium models load sequentially near the route, with shared lighting and no cabin shadow-map capture. The two opposing cabins follow the same curved tracks in walking and nearby aerial views. Pausing freezes the animation.

The saved OSM way 27582347 supplies the station/support alignment. [SZU's operator data](https://www.szu.ch/de/ueber-die-szu/felseneggbahn/) supplies the 497 m and 804 m station elevations, 44 m support height and two-cabin layout (checked 9 September 2026). The five-minute traversal, 20-second dwell, small sag, support bracing, cabin appearance and terminal offsets are illustrative. This is not a live service or rideable transport. Cabin position is a small direct animation calculation; the bus/train and pedestrian simulations continue to run in their workers.

The Swiss structure tile contains a coarse cableway tube with `NAME=Adliswil-Felsenegg`, UUID `8EC07EDC-1BE2-4695-82FC-4C277237FA08` and `BufferRadius=1`. Only that feature is hidden while the local cable model is ready and visible. Its tile URL and extracted metadata are retained in `scripts/data/cableway-swiss-feature.json`; other infrastructure and both measured terminal buildings remain streamed. A failed or hidden local model retains the source feature as fallback.

`npm run check:cableway` checks 538 approach poses against the actual measured summit exterior and the full measured valley station section using triangle/box intersection. It requires the adjacent Explorer snapshots and dependencies, like asset regeneration. The regular tests check terrain clearance throughout both journeys, track continuity, dwell, complete assets and their size budget. Browser evidence is in `output/playwright/CABLEWAY.md`. Station platforms, steps and passenger boarding are not modeled in this pass.

## Wildlife and the Sihl

Population generation also exports ten fictional ambient animals: five mallards, a heron, fox, deer, squirrel and a walker's dog (1.47 MB of GLBs). The existing population worker advances them at five updates per second. Up to six nearby animals share the people's two concurrent model loads; there are at most eight selected people and six animals. Ducks circle within mapped water, woodland animals remain in validated forest habitat discs and shy away from the player, and the dog follows its owner's recorded route. Animals pause with the game and hide in aerial mode. They are illustrative inhabitants, not wildlife sightings or an ecological model, and do not block the player.

The same preparation command derives `public/population/river.json`: two mapped Sihl outer polygons with three island holes. `src/river.ts` adds one terrain-only surface with generated ripples and geographic distance fading. This removes photographic river shadows from the walking view while retaining the mapped boundaries and streamed bridge geometry. It is an appearance treatment draped on terrain, not a reconstructed riverbed or water-level simulation. Banks and their photographic artifacts remain; ducks use loaded terrain height rather than a surveyed water elevation. Street and river shaders reconstruct metre coordinates from Cesium's homogeneous depth coordinates, keeping texture scale and distance fading stable.

Tests check complete duck orbits against water and island boundaries, woodland habitat clearance against buildings and solid furniture, the dog's owner trail and complete animated GLBs. River browser evidence, pause and aerial behavior are recorded in `output/playwright/WILDLIFE.md`; woodland and dog close-up visual checks remain.

## Prepared façades: Poststrasse 9 and Bahnhofplatz 4

For the user's **Poststrasse 9** photograph: enter the world → **Paint a house from a photo** → **Try Poststrasse 9** → choose or drop the same photo → **Paint this house**. The file chooser and drop area accept an image and show its filename only; the photograph is not displayed. Painting automatically opens the full-width prepared 3D model, with a toggle between the original and enhanced building. **Back to exploring** (or Escape) restores walking.

The reviewed façade is prepared ahead of time and bundled. Selecting a file enables painting; the example assumes the user selects the same photo and does not interpret or verify the selected image. Applying it makes no generation request or LLM call, including with no vision service. Uploads for buildings without a prepared façade use the usual vision flow.

The Poststrasse 9 entry uses the tall model shown in the supplied photo, UUID `C507D4AC-25B0-4F5C-9C28-D95B628F250F`, and retains the user's requested address label. The local derived address-to-model mapping points Poststrasse 9 to a different body; `addressBasis: "user-photo"` records this deliberate photo-based selection, also noted in the UI. Reproduce with `npm run prepare:facade:poststrasse`. [Photo sources and placement notes](public/reference/poststrasse-9-prepared/README.md).

The previously prepared **Bahnhofplatz 4, 8134 Adliswil** entry remains available when selecting that address in the local world. Both entries use the same photographed model. The local catalog associates that model with Bahnhofplatz 4 by entrance containment. The address records are official; their association with mesh UUIDs is derived locally. Run `npm run prepare:facade` to reproduce that entry from the reviewed geometry and local geographic snapshots; this preparation makes no network requests.

The reviewed example preserves asymmetric windows, four principal storeys, the right-hand balcony stack, broad shopfront glazing and the measured recessed top storey. Collinear footprint samples become complete wall spans. Details are assigned to separate visible faces, and old corridor decorations are temporarily hidden by exact building UUID ranges, then restored on reset. The shared Explorer corridor builder now retains those ownership ranges without changing its geometry or appearance.

New vision responses request `fidelity: "observed"`: no invented repeated bays or unseen side windows, no automatic size/grid replacement, and visible roller-blind closure. Existing saved legacy jobs retain their older adjustment behavior. The supplied example is manually reviewed; no fresh vision-model accuracy claim is made.

Source and limitations: [prepared reference notes](public/reference/bahnhofplatz-4/README.md). Earlier geometry comparison: [photo QA](output/playwright/POSTSTRASSE-9.md), which retains the old address label.
