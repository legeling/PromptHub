import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  McpLibraryFile,
  McpServerConfig,
} from "@prompthub/shared/types/mcp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readCanonicalMcpLibrary,
  type CanonicalMcpSecretStore,
  writeCanonicalMcpLibrary,
} from "../src/canonical-mcp-library";
import {
  CoreMcpLibraryService,
  readMcpLibraryRecoverySource,
} from "../src/mcp-library";
import { readMcpServerResourceBundle } from "../src/mcp-resource-schema";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import {
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "../src";

function server(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: "server-1",
    name: "github",
    displayName: "GitHub",
    transport: "streamable-http",
    url: "https://mcp.example.test/api",
    env: { TOKEN: "secret-value" },
    enabled: true,
    source: { type: "manual" },
    createdAt: Date.parse("2026-08-12T00:00:00.000Z"),
    updatedAt: Date.parse("2026-08-12T00:00:00.000Z"),
    ...overrides,
  };
}

function library(servers: McpServerConfig[]): McpLibraryFile {
  return {
    kind: "prompthub-mcp-library",
    version: 1,
    updatedAt: "2026-08-12T00:00:00.000Z",
    servers,
    bindings: [],
  };
}

describe("canonical MCP library", () => {
  let root: string;
  let secretStore: CanonicalMcpSecretStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-canonical-mcp-"));
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "b".repeat(64),
      operationId: "canonical-mcp-test",
    });
    const rendererPath = path.join(root, "config", "devices", "renderer.json");
    fs.mkdirSync(path.dirname(rendererPath), { recursive: true });
    fs.writeFileSync(
      rendererPath,
      JSON.stringify({ selfHostedDeviceId: "device-1" }),
    );
    const filePath = path.join(root, "secrets", "mcp-resource-secrets.json");
    secretStore = {
      filePath,
      read(ref) {
        if (!fs.existsSync(filePath)) return null;
        return (
          (
            JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
              string,
              string
            >
          )[ref] ?? null
        );
      },
      prepareUpdate(stagePath, input) {
        const current = fs.existsSync(filePath)
          ? (JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
              string,
              string
            >)
          : {};
        const next = Object.fromEntries(
          Object.entries(current).filter(([ref]) => input.retainRefs.has(ref)),
        );
        for (const secret of input.secrets) next[secret.ref] = secret.value;
        fs.mkdirSync(path.dirname(stagePath), { recursive: true });
        fs.writeFileSync(stagePath, JSON.stringify(next));
      },
    };
  });

  afterEach(() => {
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps OAuth secrets in the device vault and native options through versions and reopen", () => {
    const native = server({
      env: undefined,
      authProviderType: "google_credentials",
      oauth: { clientId: "client", clientSecret: "oauth-test-secret" },
      disabledTools: ["delete"],
    });
    writeCanonicalMcpLibrary(library([native]), { secretStore });
    const bundle = path.join(root, "data", "mcp", native.id);
    expect(
      fs.readFileSync(path.join(bundle, "server.json"), "utf8"),
    ).not.toContain("oauth-test-secret");
    expect(
      fs.readFileSync(path.join(bundle, "versions", "000001.json"), "utf8"),
    ).not.toContain("oauth-test-secret");
    expect(readCanonicalMcpLibrary({ secretStore }).servers[0]).toEqual(native);
    expect(
      readCanonicalMcpLibrary({ secretReadMode: "redacted" }).servers[0].oauth
        ?.clientSecret,
    ).toBe("[REDACTED]");
    writeCanonicalMcpLibrary(
      library([{ ...native, disabledTools: ["delete", "write"] }]),
      { secretStore },
    );
    expect(readMcpServerResourceBundle(bundle).currentVersion).toBe(2);
    expect(readCanonicalMcpLibrary({ secretStore }).servers[0].oauth).toEqual(
      native.oauth,
    );
  });

  it("creates, versions, reloads, and deletes server bundles with secrets", () => {
    writeCanonicalMcpLibrary(library([server()]), { secretStore });

    expect(readCanonicalMcpLibrary({ secretStore }).servers).toEqual([
      server(),
    ]);
    const bundlePath = path.join(root, "data", "mcp", "server-1");
    expect(readMcpServerResourceBundle(bundlePath).currentVersion).toBe(1);
    expect(
      fs.readFileSync(path.join(bundlePath, "server.json"), "utf8"),
    ).not.toContain("secret-value");

    const updated = server({
      displayName: "GitHub Cloud",
      updatedAt: Date.parse("2026-08-12T01:00:00.000Z"),
    });
    writeCanonicalMcpLibrary(library([updated]), { secretStore });
    const versioned = readMcpServerResourceBundle(bundlePath);
    expect(versioned.currentVersion).toBe(2);
    expect(versioned.bundleManifest.revision).toBe(2);
    expect(versioned.versions).toHaveLength(2);
    expect(readCanonicalMcpLibrary({ secretStore }).servers).toEqual([updated]);

    writeCanonicalMcpLibrary(library([]), { secretStore });
    expect(readCanonicalMcpLibrary({ secretStore }).servers).toEqual([]);
    expect(fs.existsSync(bundlePath)).toBe(false);
    expect(JSON.parse(fs.readFileSync(secretStore.filePath, "utf8"))).toEqual(
      {},
    );
  });

  it("rolls back bundles, binding config, and secrets together", () => {
    writeCanonicalMcpLibrary(library([server()]), { secretStore });
    const beforeSecret = fs.readFileSync(secretStore.filePath, "utf8");
    const updated = server({
      env: { TOKEN: "new-secret" },
      updatedAt: Date.parse("2026-08-12T02:00:00.000Z"),
    });

    expect(() =>
      writeCanonicalMcpLibrary(library([updated]), {
        secretStore,
        injectPublicationFailure(targetPath) {
          if (targetPath === secretStore.filePath) throw new Error("disk full");
        },
      }),
    ).toThrow("disk full");

    expect(readCanonicalMcpLibrary({ secretStore }).servers).toEqual([
      server(),
    ]);
    expect(fs.readFileSync(secretStore.filePath, "utf8")).toBe(beforeSecret);
    expect(
      readMcpServerResourceBundle(path.join(root, "data", "mcp", "server-1"))
        .currentVersion,
    ).toBe(1);
  });

  it("fails closed when canonical credentials have no device secret adapter", () => {
    expect(() => writeCanonicalMcpLibrary(library([server()]))).toThrow(
      /device-bound secret store/u,
    );
    expect(fs.existsSync(path.join(root, "data", "mcp", "server-1"))).toBe(
      false,
    );
  });

  it("keeps canonical file metadata readable for transport when the device vault is unavailable", () => {
    writeCanonicalMcpLibrary(library([server()]), { secretStore });
    expect(
      new CoreMcpLibraryService({ secretStore }).readForTransport().servers[0]
        .env,
    ).toEqual({ TOKEN: "secret-value" });
    expect(
      new CoreMcpLibraryService().readForTransport().servers[0].env,
    ).toEqual({ TOKEN: "[REDACTED]" });
    const missingStore: CanonicalMcpSecretStore = {
      ...secretStore,
      read: () => null,
    };
    expect(
      new CoreMcpLibraryService({
        secretStore: missingStore,
      }).readForTransport().servers[0].env,
    ).toEqual({ TOKEN: "[REDACTED]" });
    const unavailableStore: CanonicalMcpSecretStore = {
      ...secretStore,
      read() {
        throw new Error("MCP_RESOURCE_SECRET_STORE_INVALID");
      },
    };
    const service = new CoreMcpLibraryService({
      secretStore: unavailableStore,
    });

    expect(() => service.read()).toThrow("MCP_RESOURCE_SECRET_STORE_INVALID");
    expect(service.readForTransport().servers).toEqual([
      expect.objectContaining({
        id: "server-1",
        name: "github",
        env: { TOKEN: "[REDACTED]" },
      }),
    ]);

    fs.appendFileSync(
      path.join(root, "data", "mcp", "server-1", "server.json"),
      " ",
    );
    expect(() => service.readForTransport()).toThrow(/size mismatch/u);
  });

  it("routes the production MCP service through canonical authority", () => {
    const service = new CoreMcpLibraryService({ secretStore });
    const created = service.createServer({
      name: "filesystem",
      displayName: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: ["server-filesystem"],
      enabled: true,
      source: { type: "manual" },
    });

    expect(service.read().servers[0]).toMatchObject({
      id: created.id,
      name: "filesystem",
    });
    expect(
      fs.existsSync(path.join(root, "data", "mcp", created.id, "server.json")),
    ).toBe(true);
    expect(fs.existsSync(path.join(root, "data", "mcp", "library.json"))).toBe(
      false,
    );
  });

  it("coexists with exact legacy and independently managed MCP metadata files", () => {
    const mcpRoot = path.join(root, "data", "mcp");
    fs.mkdirSync(mcpRoot, { recursive: true });
    fs.writeFileSync(path.join(mcpRoot, "library.json"), "{}\n", "utf8");
    fs.writeFileSync(
      path.join(mcpRoot, "market-sources.json"),
      `${JSON.stringify({ kind: "prompthub-mcp-market-sources", version: 1 })}\n`,
      "utf8",
    );

    expect(readCanonicalMcpLibrary({ secretStore }).servers).toEqual([]);
  });

  it("migrates a superseded MCP library into canonical bundles without losing secrets", () => {
    const legacyPath = path.join(root, "data", "mcp", "library.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify(library([server()])), "utf8");

    const migrated = new CoreMcpLibraryService({ secretStore }).read();

    expect(migrated.servers).toHaveLength(1);
    expect(migrated.servers[0]).toMatchObject(server());
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(
      fs.existsSync(
        path.join(root, "data", "mcp", "server-1", "manifest.json"),
      ),
    ).toBe(true);
    expect(
      fs.readFileSync(
        path.join(root, "data", "mcp", "server-1", "server.json"),
        "utf8",
      ),
    ).not.toContain("secret-value");
    expect(
      Object.values(JSON.parse(fs.readFileSync(secretStore.filePath, "utf8"))),
    ).toContain("secret-value");
  });

  it("migrates empty credential placeholders into canonical files without writing empty vault entries", () => {
    const legacyPath = path.join(root, "data", "mcp", "library.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    const legacyServer = server({
      env: { TOKEN: "", OPTIONAL: "secret-value" },
      headers: { Authorization: "" },
    });
    fs.writeFileSync(
      legacyPath,
      JSON.stringify(library([legacyServer])),
      "utf8",
    );
    const rejectingEmptyStore: CanonicalMcpSecretStore = {
      ...secretStore,
      prepareUpdate(stagePath, input) {
        expect(input.secrets.every(({ value }) => value.length > 0)).toBe(true);
        secretStore.prepareUpdate(stagePath, input);
      },
    };

    const service = new CoreMcpLibraryService({
      secretStore: rejectingEmptyStore,
    });
    const migrated = service.read();

    expect(migrated.servers).toEqual([expect.objectContaining(legacyServer)]);
    expect(fs.existsSync(legacyPath)).toBe(false);
    const bundlePath = path.join(root, "data", "mcp", "server-1");
    const storedText = fs.readFileSync(
      path.join(bundlePath, "server.json"),
      "utf8",
    );
    expect(storedText).toContain('"TOKEN": ""');
    expect(storedText).toContain('"Authorization": ""');
    expect(storedText).not.toContain("secret-value");
    expect(
      Object.values(JSON.parse(fs.readFileSync(secretStore.filePath, "utf8"))),
    ).toEqual(["secret-value"]);

    const updated = {
      ...legacyServer,
      displayName: "GitHub Updated",
      updatedAt: Date.parse("2026-08-12T03:00:00.000Z"),
    };
    service.write(library([updated]));
    expect(service.read().servers).toEqual([expect.objectContaining(updated)]);
    const resource = readMcpServerResourceBundle(bundlePath);
    expect(resource.versions).toHaveLength(2);
    expect(resource.versions[0].server.env).toEqual({ TOKEN: "" });
    expect(resource.versions[0].server.headers).toEqual({ Authorization: "" });
  });

  it("reads a credential-bearing superseded library for recovery without publishing it", () => {
    const legacyPath = path.join(root, "data", "mcp", "library.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify(library([server()])), "utf8");

    const recoverySource = readMcpLibraryRecoverySource({
      canonicalOptions: { secretStore },
      supersededPath: legacyPath,
    });

    expect(recoverySource.servers).toEqual([expect.objectContaining(server())]);
    expect(fs.existsSync(legacyPath)).toBe(true);
    expect(fs.existsSync(path.join(root, "data", "mcp", "server-1"))).toBe(
      false,
    );
    expect(fs.existsSync(secretStore.filePath)).toBe(false);
  });

  it("rejects an oversized superseded MCP recovery source", () => {
    const legacyPath = path.join(root, "data", "mcp", "library.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, "{}");
    fs.truncateSync(legacyPath, 16 * 1024 * 1024 + 1);

    expect(() =>
      readMcpLibraryRecoverySource({
        canonicalOptions: { secretStore },
        supersededPath: legacyPath,
      }),
    ).toThrow("Superseded MCP library path is unsafe");
  });

  it("uses a stable local identity when renderer device identity is null", () => {
    const rendererPath = path.join(root, "config", "devices", "renderer.json");
    fs.writeFileSync(
      rendererPath,
      JSON.stringify({
        kind: "prompthub-renderer-devices",
        version: 1,
        selfHostedDeviceId: null,
      }),
    );
    const legacyPath = path.join(root, "data", "mcp", "library.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify(library([server()])), "utf8");

    expect(
      new CoreMcpLibraryService({ secretStore }).read().servers,
    ).toHaveLength(1);
    const bindingDocument = JSON.parse(
      fs.readFileSync(
        path.join(root, "config", "devices", "mcp-bindings.json"),
        "utf8",
      ),
    );
    expect(bindingDocument.deviceId).toMatch(/^device-[a-f0-9]{32}$/u);
  });

  it("preserves legacy MCP bindings and re-keys them on the next write", () => {
    const configured = library([server()]);
    configured.bindings = [
      {
        id: "binding-1",
        serverIds: ["server-1"],
        target: "codex",
        scope: "global",
        path: path.join(root, ".codex", "config.toml"),
        enabled: true,
        createdAt: Date.parse("2026-08-12T00:00:00.000Z"),
        updatedAt: Date.parse("2026-08-12T00:00:00.000Z"),
      },
    ];
    writeCanonicalMcpLibrary(configured, { secretStore });
    const bindingPath = path.join(
      root,
      "config",
      "devices",
      "mcp-bindings.json",
    );
    const legacy = JSON.parse(fs.readFileSync(bindingPath, "utf8"));
    legacy.deviceId = "desktop-legacy-mcp";
    fs.writeFileSync(bindingPath, JSON.stringify(legacy), "utf8");

    const restored = readCanonicalMcpLibrary({ secretStore });
    expect(restored.bindings).toEqual(configured.bindings);

    writeCanonicalMcpLibrary(restored, { secretStore });
    const rekeyed = JSON.parse(fs.readFileSync(bindingPath, "utf8"));
    expect(rekeyed.deviceId).toMatch(/^device-[a-f0-9]{32}$/u);
    expect(rekeyed.deviceId).not.toBe("desktop-legacy-mcp");
    expect(rekeyed.bindings).toEqual(configured.bindings);
  });

  it("keeps canonical MCP bundles authoritative over a stale legacy library", () => {
    const service = new CoreMcpLibraryService({ secretStore });
    service.write(library([server()]));
    const legacyPath = path.join(root, "data", "mcp", "library.json");
    fs.writeFileSync(
      legacyPath,
      JSON.stringify(
        library([
          server({ id: "stale-server", name: "stale", displayName: "Stale" }),
        ]),
      ),
      "utf8",
    );

    const current = service.read();
    expect(current.servers).toHaveLength(1);
    expect(current.servers[0]).toMatchObject(server());
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.existsSync(path.join(root, "data", "mcp", "stale-server"))).toBe(
      false,
    );
  });

  it("removes an empty superseded MCP library without creating bundles", () => {
    const legacyPath = path.join(root, "data", "mcp", "library.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify(library([])), "utf8");

    expect(new CoreMcpLibraryService({ secretStore }).read().servers).toEqual(
      [],
    );
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  it.each([
    ["library.json", "legacy library"],
    ["market-sources.json", "market source registry"],
  ])("rejects an unsafe MCP coexistence artifact at %s", (fileName, label) => {
    const artifactPath = path.join(root, "data", "mcp", fileName);
    fs.mkdirSync(artifactPath, { recursive: true });
    expect(() => readCanonicalMcpLibrary({ secretStore })).toThrow(
      new RegExp(`Canonical MCP ${label} path is unsafe`, "u"),
    );
  });

  it("rejects symlinked and undeclared MCP root artifacts", () => {
    const mcpRoot = path.join(root, "data", "mcp");
    const targetPath = path.join(root, "legacy-mcp-library.json");
    fs.mkdirSync(mcpRoot, { recursive: true });
    fs.writeFileSync(targetPath, "{}\n", "utf8");
    fs.symlinkSync(targetPath, path.join(mcpRoot, "library.json"));

    expect(() => readCanonicalMcpLibrary({ secretStore })).toThrow(
      /Canonical MCP legacy library path is unsafe/u,
    );

    fs.rmSync(path.join(mcpRoot, "library.json"));
    fs.writeFileSync(path.join(mcpRoot, "unexpected.json"), "{}\n", "utf8");
    expect(() => readCanonicalMcpLibrary({ secretStore })).toThrow(
      /Canonical MCP resource path is unsafe/u,
    );
  });
});
