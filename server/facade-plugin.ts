import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";
import { resolveAddress, searchAddresses } from "../src/facade-tool/address";
import { houseAtPoint, matchBuilding, wallHint } from "../src/facade-tool/match-building";
import { configuredLlm, findCodex, interpretFacade } from "./facade-llm";
import type { BuildingCollider, BuildingRecord, HouseNumber } from "../src/facade-tool/types";

type Catalog = {
  houses: HouseNumber[];
  buildings: BuildingRecord[];
  colliders: BuildingCollider[];
  elevations: {uuid: string; walls: {normal: number[]; plane: number; uMin: number; uMax: number; yMax: number; groundY: number}[]}[];
};

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function loadCatalog(explorerRoot: string): Promise<Catalog> {
  const civic = await readJson<{ houseNumbers: HouseNumber[] }>(
    join(explorerRoot, "src/data/civic-layer.json"),
  );
  const buildings = await readJson<{ buildings: BuildingRecord[]; colliders: BuildingCollider[] }>(
    join(explorerRoot, "public/data/adliswil-buildings.json"),
  );
  const elevations = await readJson<{targets: Catalog["elevations"]}>(join(explorerRoot, "src/data/corridor-architecture.json"));
  return { houses: civic.houseNumbers, buildings: buildings.buildings, colliders: buildings.colliders, elevations: elevations.targets };
}

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(json));
  res.end(json);
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function extensionFor(mime: string) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

function parseDataUrl(image: string) {
  const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Send the photograph as a data URL.");
  const mime = match[1];
  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime)) {
    throw new Error("Use a JPEG, PNG or WebP photograph.");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length < 40) throw new Error("The photograph is empty.");
  if (buffer.length > 7_000_000) throw new Error("The photograph is larger than 7 MB.");
  return { mime, buffer, dataUrl: image };
}

export function facadeToolPlugin(options: { explorerRoot: string; projectRoot: string }): Plugin {
  let catalog: Catalog | undefined;
  const schemaPath = join(options.projectRoot, "src/facade-tool/facade-description.schema.json");

  async function catalogReady() {
    catalog ??= await loadCatalog(options.explorerRoot);
    return catalog;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname;
    try {
      if (path === "/api/facade/status" && req.method === "GET") {
        const codexPath = await findCodex();
        const llm = configuredLlm(codexPath);
        send(res, 200, {
          llm,
          codex: Boolean(codexPath),
          api: Boolean(process.env.FACADE_API_KEY || process.env.OPENAI_API_KEY),
          paywalled: llm === "none",
        });
        return true;
      }
      if (path === "/api/facade/at" && req.method === "GET") {
        const data = await catalogReady();
        const x = Number(url.searchParams.get("x"));
        const z = Number(url.searchParams.get("z"));
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
          send(res, 400, { error: "Click a house in the world." });
          return true;
        }
        const house = houseAtPoint(data.houses, data.colliders, x, z);
        send(res, 200, {
          house: house
            ? {
              label: `${house.street} ${house.number}`,
              number: house.number,
              street: house.street,
              x: house.x,
              z: house.z,
              heading: house.heading,
            }
            : null,
        });
        return true;
      }
      if (path === "/api/facade/job" && req.method === "GET") {
        const id = url.searchParams.get("id") || "";
        if (!/^[A-F0-9-]{36}$/i.test(id)) {
          send(res, 400, { error: "Unknown façade job." });
          return true;
        }
        const file = join(options.projectRoot, "output/facades", `${id}.json`);
        try {
          send(res, 200, await readJson(file));
        } catch {
          send(res, 404, { error: "No saved façade for that building." });
        }
        return true;
      }
      if (path === "/api/facade/search" && req.method === "GET") {
        const data = await catalogReady();
        const q = url.searchParams.get("q") || "";
        send(res, 200, {
          results: searchAddresses(data.houses, q, 8).map((house) => ({
            label: `${house.street} ${house.number}`,
            number: house.number,
            street: house.street,
            x: house.x,
            z: house.z,
            heading: house.heading,
          })),
        });
        return true;
      }
      if (path === "/api/facade/from-photo" && req.method === "POST") {
        const body = await readBody(req);
        if (typeof body.address !== "string" || typeof body.image !== "string") {
          send(res, 400, { error: "Send an address and a photograph." });
          return true;
        }
        const data = await catalogReady();
        const address = resolveAddress(data.houses, body.address);
        if (body.heading != null) {
          if (typeof body.heading !== "number" || !Number.isFinite(body.heading) || Math.abs(body.heading) > Math.PI * 2) throw new Error("Invalid selected wall direction.");
          address.heading = body.heading;
        }
        const { building, collider } = matchBuilding(address, data.colliders, data.buildings);
        const hint = wallHint(building, address.heading, collider);
        const measured = data.elevations.find(target => target.uuid === building.id)?.walls.filter(wall => wall.normal[0] * Math.sin(address.heading) + wall.normal[2] * Math.cos(address.heading) > 0.98) ?? [];
        const frontPlane = Math.max(...measured.map(wall => wall.plane));
        const elevation = measured.filter(wall => frontPlane - wall.plane < 2);
        if (elevation.length) {
          hint.widthMetres = Number(((Math.max(...elevation.map(w => w.uMax)) - Math.min(...elevation.map(w => w.uMin))) / 0.45).toFixed(2));
          hint.heightMetres = Number(((Math.max(...elevation.map(w => w.yMax)) - Math.min(...elevation.map(w => w.groundY))) / 0.45).toFixed(2));
          hint.storeys = Math.max(1, Math.round(hint.heightMetres / 3.2));
        }
        const photo = parseDataUrl(body.image);
        const schema = await readJson(schemaPath);
        const dir = await mkdtemp(join(tmpdir(), "city-lab-photo-"));
        const imagePath = join(dir, `street.${extensionFor(photo.mime)}`);
        try {
          await writeFile(imagePath, photo.buffer);
          const codexPath = await findCodex();
          let provider = configuredLlm(codexPath);
          if (provider === "none") {
            if (body.unlock === true || process.env.FACADE_UNLOCKED === "1") {
              provider = "fixture";
            } else {
              send(res, 402, {
                error: "Photo façades need vision. Use Codex on this machine, or unlock City Lab Photo.",
                paywalled: true,
              });
              return true;
            }
          }
          const outDir = join(options.projectRoot, "output/facades");
          await mkdir(outDir, { recursive: true });
          const interpreted = await interpretFacade({
            provider,
            codexPath,
            schemaPath,
            schema,
            imagePath,
            imageDataUrl: photo.dataUrl,
            address,
            hint,
            buildingId: building.id,
            eventsPath: join(outDir, `${building.id}.codex.jsonl`),
          });
          const job = {
            provider: interpreted.provider,
            address,
            building: {
              id: building.id,
              latitude: building.latitude,
              longitude: building.longitude,
              chunk: building.ownerChunk,
            },
            wallHint: hint,
            facade: interpreted.facade,
          };
          try {
            await writeFile(join(outDir, `${building.id}.json`), JSON.stringify(job, null, 2));
            await writeFile(join(outDir, `${building.id}.prompt.txt`), interpreted.prompt);
          } catch { /* keep the overlay even if the paper trail cannot be written */ }
          send(res, 200, job);
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
        return true;
      }
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : "Façade request failed." });
      return true;
    }
    return false;
  }

  return {
    name: "facade-tool",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (await handle(req, res)) return;
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (await handle(req, res)) return;
        next();
      });
    },
  };
}
