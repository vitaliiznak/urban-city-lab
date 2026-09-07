# City Lab

Cesium/Three world next to `adliswil-explorer`. Browser evidence lives in `output/playwright/`.

Playwright: reuse one named session (`world-detail`). Headless unless the user asked to watch. Wait for the world to be ready, screenshot, then `playwright-cli --session world-detail close`. Do not leave that session running — the WebGL loop keeps the GPU busy with no window.
