import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { extractJsonObject, validateFacadeDescription } from "../src/facade-tool/schema";
import { facadePrompt } from "../src/facade-tool/prompt";
import { rifertstrasse22aFacade } from "../src/facade-tool/example-rifertstrasse-22a";
import { rifertstrasse14aFacade } from "../src/facade-tool/example-rifertstrasse-14a";
import { foldNumber, foldStreet } from "../src/facade-tool/address";
import type { FacadeDescription, PhotoFacadeJob, ResolvedAddress, WallHint } from "../src/facade-tool/types";

export type LlmKind = "codex-cli" | "api" | "fixture";

export function configuredLlm(codexPath: string | null): LlmKind | "none" {
  const forced = process.env.FACADE_LLM;
  if (forced === "codex" || forced === "codex-cli") return "codex-cli";
  if (forced === "api") return "api";
  if (forced === "fixture") return "fixture";
  if (codexPath) return "codex-cli";
  if (process.env.FACADE_API_KEY || process.env.OPENAI_API_KEY) return "api";
  return "none";
}

export async function findCodex() {
  const explicit = process.env.CODEX_BIN;
  const candidates = [explicit, "codex", join(process.env.HOME || "", ".local/bin/codex")].filter(Boolean) as string[];
  for (const bin of candidates) {
    try {
      if (bin === "codex") {
        const { execFile } = await import("node:child_process");
        const path = await new Promise<string | null>((resolve) => {
          execFile("which", ["codex"], (error, stdout) => resolve(error ? null : stdout.trim()));
        });
        if (path) return path;
        continue;
      }
      await access(bin, constants.X_OK);
      return bin;
    } catch {
      continue;
    }
  }
  return null;
}

function isRifert(address: ResolvedAddress, number: string) {
  return foldStreet(address.street).startsWith("rifertstr") && foldNumber(address.number) === number;
}

async function runCodex(
  bin: string,
  imagePath: string,
  schemaPath: string,
  prompt: string,
  eventsPath?: string,
) {
  const dir = await mkdtemp(join(tmpdir(), "city-lab-facade-"));
  const workDir = join(dir, "work");
  const outPath = join(dir, "facade.json");
  await mkdir(workDir, { recursive: true });
  let stdout = "";
  let stderr = "";
  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-rules",
        "--sandbox", "read-only",
        "--color", "never",
        "--json",
        "--cd", workDir,
        "--image", imagePath,
        "--output-schema", schemaPath,
        "-o", outPath,
      ];
      const model = process.env.FACADE_CODEX_MODEL;
      if (model) args.push("-m", model);
      args.push("-");
      const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.stdin.on("error", () => { /* closed before write finished */ });
      child.stdin.end(prompt);
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Codex vision timed out."));
      }, 180000);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `Codex exited ${code}`));
      });
    });
    return await readFile(outPath, "utf8");
  } finally {
    if (eventsPath && stdout) {
      try { await writeFile(eventsPath, stdout); } catch { /* keep the overlay even if the log cannot be written */ }
    }
    await rm(dir, { recursive: true, force: true });
  }
}

async function runApi(imageDataUrl: string, prompt: string, schema: unknown) {
  const key = process.env.FACADE_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Set OPENAI_API_KEY or FACADE_API_KEY for the API fallback.");
  const url = process.env.FACADE_API_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.FACADE_API_MODEL || "gpt-4.1";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "photo_facade", strict: true, schema },
      },
    }),
  });
  const body = await response.json() as { error?: { message?: string }; choices?: { message?: { content?: string } }[] };
  if (!response.ok) throw new Error(body.error?.message || `Vision API HTTP ${response.status}`);
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("The vision API returned an empty response.");
  return text;
}

export async function interpretFacade(options: {
  provider: LlmKind;
  codexPath: string | null;
  schemaPath: string;
  schema: unknown;
  imagePath: string;
  imageDataUrl: string;
  address: ResolvedAddress;
  hint: WallHint;
  buildingId: string;
  eventsPath?: string;
}): Promise<{ provider: LlmKind; facade: FacadeDescription; prompt: string }> {
  const prompt = facadePrompt(options.address, options.hint);
  if (options.provider === "fixture") {
    const raw = isRifert(options.address, "22a")
      ? rifertstrasse22aFacade
      : isRifert(options.address, "14a")
        ? rifertstrasse14aFacade
      : {
          version: 2 as const,
          wallColor: "#c8c2b4",
          baseColor: "#c8c2b4",
          baseHeight: 0,
          roofColor: "#6a5348",
          overhang: false,
          gable: false,
          observations: "Fixture without a photograph.",
          undercroft: null,
          elements: [{
            kind: "window" as const, x: 0.5, y: 0.55, width: 0.12, height: 0.18, depth: 0,
            color: "#304d58", accent: "#eeeedd", text: "", shutters: false,
          }],
        };
    return { provider: "fixture", facade: validateFacadeDescription(raw, options.buildingId), prompt };
  }

  const canApi = Boolean(process.env.FACADE_API_KEY || process.env.OPENAI_API_KEY);
  async function fromText(provider: LlmKind, text: string) {
    return { provider, facade: validateFacadeDescription(extractJsonObject(text), options.buildingId), prompt };
  }
  if (options.provider === "codex-cli") {
    if (!options.codexPath && canApi) return fromText("api", await runApi(options.imageDataUrl, prompt, options.schema));
    if (!options.codexPath) throw new Error("Codex CLI was not found. Install it or set OPENAI_API_KEY.");
    try {
      return fromText("codex-cli", await runCodex(
        options.codexPath,
        options.imagePath,
        options.schemaPath,
        prompt,
        options.eventsPath,
      ));
    } catch (error) {
      if (!canApi) throw error;
      return fromText("api", await runApi(options.imageDataUrl, prompt, options.schema));
    }
  }
  return fromText("api", await runApi(options.imageDataUrl, prompt, options.schema));
}

export type { PhotoFacadeJob };
