import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { inspectPiModelCatalog } from "../../../src/main/services/agent-pi-model-catalog";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

it("reads the installed Pi JSON catalog without executing the CLI, then overlays its refreshed cache", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-native-catalog-"));
  roots.push(root);
  const packageRoot = path.join(root, "installation");
  const aiRoot = path.join(packageRoot, "node_modules/@earendil-works/pi-ai");
  const dataRoot = path.join(aiRoot, "dist/providers/data");
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(
    path.join(dataRoot, ".manifest.json"),
    JSON.stringify({ schemaVersion: 1, files: { "native.json": "fixture" } }),
  );
  await fs.mkdir(path.join(packageRoot, "dist"));
  const executable = path.join(packageRoot, "dist/cli.js");
  await fs.writeFile(
    executable,
    "throw new Error('This CLI must not execute');",
  );
  await fs.writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: "@earendil-works/pi-coding-agent" }),
  );
  await fs.writeFile(
    path.join(aiRoot, "package.json"),
    JSON.stringify({
      name: "@earendil-works/pi-ai",
      main: "dist/index.js",
      exports: { ".": { import: "./dist/index.js" } },
    }),
  );
  await fs.writeFile(
    path.join(aiRoot, "dist/index.js"),
    "throw new Error('This module must not execute');",
  );
  await fs.writeFile(
    path.join(dataRoot, "native.json"),
    JSON.stringify({
      "openai-responses": {
        selected: {
          id: "selected",
          api: "openai-responses",
          baseUrl: "https://native.example.test/v1",
          contextWindow: 16000,
        },
      },
    }),
  );
  const linkedExecutable = path.join(root, "pi");
  await fs.symlink(executable, linkedExecutable);
  const options = {
    resolveExecutable: async () => linkedExecutable,
    environment: {},
  };
  const catalog = await inspectPiModelCatalog(root, options);
  expect(catalog[0]).toMatchObject({
    id: "native",
    api: "openai-responses",
    credentialReady: false,
    models: [
      {
        id: "selected",
        source: "built-in",
        endpoint: "https://native.example.test/v1",
        contextWindow: 16000,
      },
    ],
  });
  expect((await fs.readdir(root)).sort()).toEqual(["installation", "pi"]);
  await fs.writeFile(
    path.join(root, "models-store.json"),
    JSON.stringify({
      native: { models: [{ id: "refreshed", api: "openai-responses" }] },
    }),
  );
  const refreshed = await inspectPiModelCatalog(root, options);
  expect(refreshed[0].models.map((model) => model.id)).toEqual(["refreshed"]);
  expect(refreshed).toEqual(await inspectPiModelCatalog(root, options));
  await fs.writeFile(path.join(dataRoot, "invalid.json"), "{ invalid");
  await expect(inspectPiModelCatalog(root, options)).rejects.toThrow();
  await fs.unlink(path.join(dataRoot, "invalid.json"));
  await fs.symlink(
    path.join(dataRoot, "native.json"),
    path.join(dataRoot, "unsafe.json"),
  );
  await expect(inspectPiModelCatalog(root, options)).rejects.toThrow(
    "AGENT_MODEL_CONFIG_SYMLINK_INVALID",
  );
});
