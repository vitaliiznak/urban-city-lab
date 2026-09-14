# Bahnhofplatz 4 prepared façade

`job.json` is a ready-to-apply, manually reviewed façade for **Bahnhofplatz 4, 8134 Adliswil**. Loading it makes no LLM request. Its provider remains `reviewed-photo`; it is not the output of a new model run.

## Address correction

The measured building UUID is `C507D4AC-25B0-4F5C-9C28-D95B628F250F`. The local catalog (`adliswil-explorer/outputs/adliswil/public/data/building-places.json`) associates the official Bahnhofplatz 4 record, EGAID `100055006` / EGID `52460`, with this building by entrance containment, at zero metres. The address is official; its association with a mesh UUID is derived locally. The stored GWR response `adliswil-explorer/work/building-places/raw/gwr-52460-0.json` confirms the address; its export date is 6 September 2026.

The earlier `poststrasse-9` reference uses this same photographed building. The local derived mapping assigns the Poststrasse 9 record to UUID `9747C083-2DF3-4E6E-9F1F-64F6551EEA0F`; a nearest-centre fallback had selected the taller building instead. On 14 September the user supplied this photograph explicitly for Poststrasse 9, so the featured `poststrasse-9-prepared` entry now retains that user label and pins the photographed model with `addressBasis: "user-photo"`. This Bahnhofplatz entry follows the catalog association. Neither entry independently establishes the photograph's official street address. The old source folder is retained for provenance.

## Photograph and limits

The photo remains `/reference/poststrasse-9/source.png`, an unchanged user-supplied photograph documented in that folder's README. Its SHA-256 is `0cb3bcb8b18de3f446a489c07af077739ca23678382d8361bd0bf6095f941246`. Its capture date, photographer and physical measurements are unknown. The photograph has not been independently geolocated; the corrected address identifies the measured building receiving the prepared geometry. The image is displayed for comparison and is never applied as a texture.

The four reviewed surfaces preserve four main window rows, narrow/wide window pairs, four front balconies, the shopfront and three recessed top-storey openings. Positions, balcony depths, side-wall bays, materials and blind closure are visual approximations. Small signs, flowers, reflections, rail fittings and interiors are omitted; hidden rear/north faces receive no added openings. The camera is a chosen street view rather than a recovered photographic pose. This is a stylized reconstruction, not a survey.

© swisstopo; © OpenStreetMap contributors (ODbL) for the geographic sources. The façade geometry and photograph retain their existing provenance.

## Reproduce

From `city-lab`, run:

```sh
node --import tsx scripts/prepare-facade.ts
```

This reads only local snapshots, validates the source schema and photo checksum, checks the derived catalog association, and writes this `job.json`. It does not use nearest-centre matching, make network requests or change the historical source asset.
