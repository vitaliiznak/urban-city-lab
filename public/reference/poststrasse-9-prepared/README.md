# Poststrasse 9 prepared photo facade

The user explicitly supplied this photograph under **Poststrasse 9**. This prepared job retains that requested address and the original reviewed facade on the fixed tall building mesh `C507D4AC-25B0-4F5C-9C28-D95B628F250F`. The `addressBasis: "user-photo"` marker records that choice. Loading and applying the local job require no LLM call.

The civic address is Poststrasse 9, 8134 Adliswil, EGAID `101013745`, at the original civic coordinates `x: -8.553`, `z: -60.748`. The local derived address-to-UUID map points this civic address to a different mesh (`9747C083-2DF3-4E6E-9F1F-64F6551EEA0F`). That automated mapping is not used to move the supplied photograph onto another building. Official GWR identifiers such as EGAID and EGID are not measured mesh UUIDs. This prepared example does not claim to resolve the difference or establish the photograph's official postal address.

`job.json` copies the four reviewed faces, facade colors, openings, balcony approximations, east-facing heading and comparison camera from `../poststrasse-9/job.json` without changing their geometry. The source image is the unchanged user-supplied `../poststrasse-9/source.png`, SHA-256 `0cb3bcb8b18de3f446a489c07af077739ca23678382d8361bd0bf6095f941246`. It is displayed for comparison and is never applied as a texture. Capture date, photographer and physical measurements are unknown.

The provider is `reviewed-photo`: this is manually reviewed geometry, not a new model response. Four main window rows, narrow/wide pairs, four right-hand balconies, the shopfront and three top-storey openings are retained. Their proportions were estimated by visual inspection, not calibrated photogrammetry. Side details, depths, materials and blind closure are approximate. The comparison camera is a selected street view, not a recovered photo camera pose. Existing measured building and roof geometry remain the source of the silhouette.

Reproduce from the `city-lab` directory:

```sh
node --import tsx scripts/prepare-poststrasse-9.ts
```

The script validates the source photo hash, civic identity, fixed tall building and all facade descriptions before copying the reviewed job. It reads only checked-in local inputs, including the sibling `adliswil-explorer/outputs/adliswil/` civic and building snapshots. It performs no network or model request and does not change the archival source files.

Geographic source attribution: © swisstopo; © OpenStreetMap contributors (ODbL).
