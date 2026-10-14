/** @vitest-environment node */
import fs from "node:fs/promises";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectPiModelCatalog } from "../../../src/main/services/agent-pi-model-catalog";
import { testPiModel } from "../../../src/main/services/agent-pi-model-test";
import {
  addPiCustomModel,
  addPiCustomProvider,
} from "../../../src/main/services/agent-pi-model-writes";
vi.mock("../../../src/main/services/network-proxy", () => ({
  getHttpRequestAgent: () => undefined,
}));

const roots: string[] = [];
const servers: Server[] = [];
const noInstallation = async (): Promise<null> => null;

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-resolution-"));
  roots.push(root);
  return root;
}

async function write(
  root: string,
  file: string,
  value: unknown,
): Promise<void> {
  await fs.writeFile(path.join(root, file), JSON.stringify(value));
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Pi effective model and credential resolution", () => {
  it("uses the selected model's API and endpoint instead of the provider defaults", async () => {
    const root = await fixture();
    await write(root, "models.json", {
      providers: {
        mixed: {
          api: "openai-completions",
          baseUrl: "https://default.example.test/v1",
          apiKey: "synthetic-native-key",
          models: [
            {
              id: "selected",
              api: "openai-responses",
              baseUrl: "https://selected.example.test/v1",
            },
          ],
        },
      },
    });
    const probe = vi.fn().mockResolvedValue({ status: "ok" });
    await testPiModel(
      root,
      { providerId: "mixed", modelId: "selected" },
      new AbortController().signal,
      { probe, resolveExecutable: noInstallation, environment: {} },
    );
    expect(probe.mock.calls[0][0]).toMatchObject({
      protocol: "openai-responses",
      endpoint: "https://selected.example.test/v1",
      credential: "synthetic-native-key",
      model: "selected",
    });
    const catalog = await inspectPiModelCatalog(root, {
      resolveExecutable: noInstallation,
    });
    expect(JSON.stringify(catalog)).not.toContain("synthetic-native-key");
    expect(catalog[0].models[0]).toMatchObject({
      api: "openai-responses",
      endpoint: "https://selected.example.test/v1",
    });
  });

  it("sends the selected Responses model through the real HTTP probe and leaves native files unchanged", async () => {
    const root = await fixture();
    let requestPath = "";
    let authorization = "";
    let body = "";
    const server = createServer((request, response) => {
      requestPath = request.url ?? "";
      authorization = request.headers.authorization ?? "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("end", () => {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end(
          'data: {"type":"response.output_text.delta","delta":"OK"}\n\ndata: [DONE]\n\n',
        );
      });
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing fixture TCP address");
    await write(root, "models.json", {
      providers: {
        local: {
          api: "openai-completions",
          baseUrl: "http://localhost:1/v1",
          apiKey: "synthetic-probe-key",
          models: [
            {
              id: "selected",
              api: "openai-responses",
              baseUrl: `http://127.0.0.1:${address.port}/v1`,
            },
          ],
        },
      },
    });
    const before = await fs.readFile(path.join(root, "models.json"), "utf8");
    const result = await testPiModel(
      root,
      { providerId: "local", modelId: "selected" },
      new AbortController().signal,
      { resolveExecutable: noInstallation, environment: {} },
    );
    expect(result).toMatchObject({
      status: "ok",
      protocol: "responses",
      outputPreview: "OK",
    });
    expect(requestPath).toBe("/v1/responses");
    expect(authorization).toBe("Bearer synthetic-probe-key");
    expect(JSON.parse(body)).toMatchObject({ model: "selected", stream: true });
    expect(JSON.stringify(result)).not.toContain("synthetic-probe-key");
    expect(await fs.readFile(path.join(root, "models.json"), "utf8")).toBe(
      before,
    );
    expect(
      (
        await inspectPiModelCatalog(root, { resolveExecutable: noInstallation })
      )[0].models[0].api,
    ).toBe("openai-responses");
  });

  it("inherits native routing, applies custom metadata defaults and modelOverrides", async () => {
    const root = await fixture();
    await write(root, "models-store.json", {
      native: {
        models: [
          {
            id: "selected",
            api: "anthropic-messages",
            baseUrl: "https://native.example.test",
            name: "Native",
            contextWindow: 16000,
            maxTokens: 4000,
          },
        ],
      },
    });
    await write(root, "models.json", {
      providers: {
        native: {
          models: [{ id: "selected", name: "Replacement" }],
          modelOverrides: {
            selected: { contextWindow: 32000 },
            unknown: { name: "Do not invent" },
          },
        },
      },
    });
    const options = { resolveExecutable: noInstallation, environment: {} };
    const first = await inspectPiModelCatalog(root, options);
    const reopened = await inspectPiModelCatalog(root, options);
    expect(first).toEqual(reopened);
    expect(first[0]).toMatchObject({
      source: "custom",
      api: "anthropic-messages",
      models: [
        {
          id: "selected",
          name: "Replacement",
          api: "anthropic-messages",
          endpoint: "https://native.example.test",
          contextWindow: 32000,
          maxTokens: 16384,
        },
      ],
    });
  });

  it("does not claim readiness from an unset reference, and shares resolution with the probe", async () => {
    const root = await fixture();
    await write(root, "models.json", {
      providers: {
        referenced: {
          api: "openai-responses",
          baseUrl: "https://native.example.test/v1",
          apiKey: "${PI_TEST_KEY}",
          models: [{ id: "selected" }],
        },
      },
    });
    const options = { resolveExecutable: noInstallation, environment: {} };
    expect((await inspectPiModelCatalog(root, options))[0]).toMatchObject({
      credentialReady: false,
      credentialSource: "environment",
    });
    const environment = { PI_TEST_KEY: "synthetic-env-key" };
    expect(
      (await inspectPiModelCatalog(root, { ...options, environment }))[0]
        .credentialReady,
    ).toBe(true);
    const probe = vi.fn().mockResolvedValue({ status: "ok" });
    await testPiModel(
      root,
      { providerId: "referenced", modelId: "selected" },
      new AbortController().signal,
      { ...options, environment, probe },
    );
    expect(probe.mock.calls[0][0].credential).toBe("synthetic-env-key");
    await write(root, "auth.json", {
      referenced: { type: "api_key", key: "synthetic-stored-key" },
    });
    await testPiModel(
      root,
      { providerId: "referenced", modelId: "selected" },
      new AbortController().signal,
      { ...options, environment, probe },
    );
    expect(probe.mock.calls[1][0].credential).toBe("synthetic-stored-key");
    await write(root, "auth.json", {
      referenced: {
        type: "api_key",
        key: "${STORED_KEY}",
        env: { STORED_KEY: "synthetic-stored-env" },
      },
    });
    await testPiModel(
      root,
      { providerId: "referenced", modelId: "selected" },
      new AbortController().signal,
      { ...options, environment, probe },
    );
    expect(probe.mock.calls[2][0].credential).toBe("synthetic-stored-env");
    await write(root, "auth.json", {
      referenced: { type: "api_key", key: "$$NOT_ENV$!literal" },
    });
    await testPiModel(
      root,
      { providerId: "referenced", modelId: "selected" },
      new AbortController().signal,
      { ...options, environment, probe },
    );
    expect(probe.mock.calls[3][0].credential).toBe("$NOT_ENV!literal");
    expect(
      JSON.stringify(
        await inspectPiModelCatalog(root, { ...options, environment }),
      ),
    ).not.toContain("synthetic-");
  });

  it("reports unsupported protocols, OAuth probes and command credentials without guessing or executing", async () => {
    const root = await fixture();
    await write(root, "models.json", {
      providers: {
        unsupported: { api: "native-only-api", models: [{ id: "selected" }] },
        oauth: { api: "openai-responses", models: [{ id: "selected" }] },
        command: {
          api: "openai-completions",
          apiKey: "!touch forbidden",
          models: [{ id: "selected" }],
        },
      },
    });
    await write(root, "auth.json", {
      oauth: { type: "oauth", access: "synthetic-oauth-token" },
    });
    const probe = vi.fn();
    for (const providerId of ["unsupported", "oauth", "command"]) {
      const result = await testPiModel(
        root,
        { providerId, modelId: "selected" },
        new AbortController().signal,
        { probe, resolveExecutable: noInstallation, environment: {} },
      );
      expect(result.status).toBe("unsupported");
      expect(JSON.stringify(result)).not.toContain("synthetic-oauth-token");
    }
    expect(probe).not.toHaveBeenCalled();
    expect((await fs.readdir(root)).sort()).toEqual([
      "auth.json",
      "models.json",
    ]);
  });

  it("keeps every legal provider and model and permits writing beyond the old model cap", async () => {
    const root = await fixture();
    const modelCount = 80;
    const providerCount = 70;
    const models = Array.from({ length: modelCount }, (_, index) => ({
      id: `model-${index}`,
    }));
    await write(
      root,
      "models-store.json",
      Object.fromEntries(
        Array.from({ length: providerCount }, (_, index) => [
          `native-${index}`,
          { models },
        ]),
      ),
    );
    const options = { backupRoot: path.join(root, "backups") };
    await addPiCustomProvider(
      root,
      {
        providerId: "custom",
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        models,
      },
      options,
    );
    await addPiCustomModel(root, "custom", { id: "last-model" }, options);
    const before = performance.now();
    const heapBefore = process.memoryUsage().heapUsed;
    const catalog = await inspectPiModelCatalog(root, {
      resolveExecutable: noInstallation,
    });
    console.info("Pi catalog measurement", {
      models: catalog.reduce(
        (count, provider) => count + provider.models.length,
        0,
      ),
      elapsedMs: performance.now() - before,
      heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    });
    expect(catalog).toHaveLength(providerCount + 1);
    expect(
      catalog.find((provider) => provider.id === "native-69")?.models,
    ).toHaveLength(modelCount);
    expect(
      catalog.find((provider) => provider.id === "custom")?.models,
    ).toHaveLength(modelCount + 1);
    expect(
      catalog.find((provider) => provider.id === "custom")?.models.at(-1)?.id,
    ).toBe("last-model");
  });
});
