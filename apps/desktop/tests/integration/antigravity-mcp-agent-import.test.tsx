/** @vitest-environment jsdom */
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import "../setup";
import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { safeStorage } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { mcpApi } from "../../src/preload/api/mcp";
import { createDesktopMcpLibraryService } from "../../src/main/services/desktop-mcp-library";
import { useMcpStore } from "../../src/renderer/stores/mcp.store";
import { useMcpManagerState } from "../../src/renderer/components/mcp/useMcpManagerState";
import { useMcpManagerTargets } from "../../src/renderer/components/mcp/useMcpManagerTargets";
import { useMcpTargetActions } from "../../src/renderer/components/mcp/useMcpTargetActions";
import { AgentMcpEntryDetail } from "../../src/renderer/components/mcp/AgentMcpEntryDetail";
import {
  serverToForm,
  formToDraft,
} from "../../src/renderer/components/mcp/mcp-form-utils";
import {
  getMcpTargetPresets,
  writeCanonicalMcpLibrary,
  getSecretsDir,
} from "@prompthub/core";
import { getDatabase, McpDB } from "@prompthub/db";
import { createCanonicalMcpResourceSecretStore } from "../../src/main/services/mcp-resource-secret-store";
import { initializeDesktopMcpStorage } from "../../src/main/services/desktop-mcp-library";
import { deriveProjectMcpTargetPresets } from "../../src/renderer/services/mcp-target-presets";
import { MCP_REDACTED_VALUE } from "@prompthub/shared/utils/mcp-config";

const masterKeys = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("@prompthub/core/mcp-credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@prompthub/core/mcp-credentials")>()),
  createMcpMasterKeyStore: () => ({
    read: (id: string) => masterKeys.get(id) ?? null,
    write: (id: string, value: Buffer) => {
      masterKeys.set(id, Buffer.from(value));
    },
  }),
}));

let runtime: SkillTestRuntime;
const i18n = createInstance();
const nativeEntry = {
  serverUrl: "https://example.test/mcp",
  headers: { Authorization: "Bearer native-fixture-token" },
  oauth: { clientId: "fixture-client", clientSecret: "native-fixture-secret" },
  disabledTools: ["delete_record"],
};
const windowApiDescriptor = Object.getOwnPropertyDescriptor(window, "api");

beforeEach(async () => {
  masterKeys.clear();
  // Substitute Electron's OS encryption boundary with real AES-GCM on a throwaway key.
  const key = randomBytes(32);
  vi.spyOn(safeStorage, "isEncryptionAvailable").mockReturnValue(true);
  vi.spyOn(safeStorage, "encryptString").mockImplementation((value) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
  });
  vi.spyOn(safeStorage, "decryptString").mockImplementation((value) => {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      value.subarray(0, 12),
    );
    decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([
      decipher.update(value.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  });
  runtime = await createSkillTestRuntime();
  registerMcpIPC();
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { mcp: mcpApi },
  });
  await i18n.init({ lng: "en", fallbackLng: "en", resources: {} });
  useMcpStore.setState({
    library: null,
    targetStatus: [],
    targetPresets: [],
    deployablePlatformIds: [],
    selectedServerId: null,
  });
});
afterEach(() => {
  cleanup();
  runtime?.dispose();
  vi.restoreAllMocks();
  if (windowApiDescriptor)
    Object.defineProperty(window, "api", windowApiDescriptor);
  else Reflect.deleteProperty(window, "api");
});

it("adopts a historical Electron-encrypted vault into SQL and retires old credentials only after verified decryption", async () => {
  const database = getDatabase();
  database.run("DELETE FROM mcp_storage_state");
  const vault = path.join(getSecretsDir(), "mcp-resource-secrets.json");
  const oldStore = createCanonicalMcpResourceSecretStore({
    filePath: vault,
    encryption: safeStorage,
  });
  writeCanonicalMcpLibrary(
    {
      kind: "prompthub-mcp-library",
      version: 1,
      updatedAt: new Date(0).toISOString(),
      bindings: [],
      servers: [
        {
          id: "legacy-credential",
          name: "Legacy.API",
          displayName: "Legacy API",
          transport: "streamable-http",
          url: "https://example.test/mcp",
          headers: nativeEntry.headers,
          oauth: nativeEntry.oauth,
          enabled: true,
          isFavorite: false,
          source: { type: "import" },
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    },
    { secretStore: oldStore },
  );
  initializeDesktopMcpStorage(database);
  expect(new McpDB(database).server("legacy-credential")?.server.name).toBe(
    "Legacy.API",
  );
  expect(createDesktopMcpLibraryService().read().servers[0].headers).toEqual(
    nativeEntry.headers,
  );
  expect(
    JSON.stringify(database.all("SELECT * FROM mcp_secrets")),
  ).not.toContain("native-fixture");
  expect(fs.existsSync(vault)).toBe(false);
  await runtime.reopen();
  expect(createDesktopMcpLibraryService().read().servers[0].oauth).toEqual(
    nativeEntry.oauth,
  );
});

async function source() {
  const preset = getMcpTargetPresets(
    path.join(runtime.root, "home"),
    process.platform,
    {},
  ).find((entry) => entry.id === "antigravity");
  if (!preset) throw new Error("Missing Antigravity preset");
  fs.mkdirSync(path.dirname(preset.path), { recursive: true });
  fs.writeFileSync(
    preset.path,
    JSON.stringify({ mcpServers: { remote: nativeEntry } }),
  );
  const status = await mcpApi.getTargetStatus([preset]);
  const server = status[0].servers?.[0];
  if (!server) throw new Error("Missing native server inventory");
  expect(server.headers?.Authorization).toBe(MCP_REDACTED_VALUE);
  expect(server.oauth?.clientSecret).toBe(MCP_REDACTED_VALUE);
  return { preset, status, server };
}

it("imports selected Agent MCP through the renderer action and real preload/IPC, edits, reopens and projects real credentials", async () => {
  const { preset, status } = await source();
  useMcpStore.setState({
    targetPresets: [preset],
    targetStatus: status,
    deployablePlatformIds: ["antigravity"],
  });
  const bindings = {
    t: i18n.t,
    showToast: vi.fn(),
    disabledPlatformIds: [],
    skillProjects: [],
    mcpStore: useMcpStore.getState(),
  };
  const state = renderHook(() => useMcpManagerState());
  const targets = renderHook(() => useMcpManagerTargets(bindings));
  await waitFor(() =>
    expect(targets.result.current.visibleTargetStatus[0]?.serverNames).toEqual([
      "remote",
    ]),
  );
  const reportError = vi.fn();
  const actions = useMcpTargetActions({
    bindings,
    state: state.result.current,
    targets: targets.result.current,
    reportError,
    openServerDetail: vi.fn(),
  });
  await act(async () => actions.handleImportAgentMcp(preset, "remote"));
  expect(reportError).not.toHaveBeenCalled();
  const created = (await mcpApi.getLibrary()).servers[0];
  expect(created).toMatchObject({
    name: "remote",
    oauth: { clientId: "fixture-client", clientSecret: MCP_REDACTED_VALUE },
    disabledTools: ["delete_record"],
    source: { type: "import", id: preset.id, label: preset.label },
  });
  const form = serverToForm(created);
  form.displayName = "Edited native server";
  await mcpApi.updateServer(created.id, formToDraft(form));
  await runtime.reopen();
  registerMcpIPC();
  const reopened = (await mcpApi.getLibrary()).servers[0];
  expect(reopened.displayName).toBe("Edited native server");
  expect(reopened.oauth?.clientSecret).toBe(MCP_REDACTED_VALUE);
  const output = path.join(runtime.root, "projected", "mcp_config.json");
  const result = await mcpApi.apply({
    target: "antigravity",
    scope: "custom",
    path: output,
    serverIds: [created.id],
  });
  expect(result.content).not.toContain("native-fixture-secret");
  expect(result.content).not.toContain("native-fixture-token");
  expect(JSON.parse(fs.readFileSync(output, "utf8"))).toEqual({
    mcpServers: { remote: nativeEntry },
  });
  expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual({
    mcpServers: { remote: nativeEntry },
  });
  expect(
    createDesktopMcpLibraryService().read().servers[0].oauth?.clientSecret,
  ).toBe("native-fixture-secret");
});

it("previews native serverUrl, disabled state and authentication without leaking credentials", async () => {
  const { server, preset } = await source();
  const detail = render(
    <I18nextProvider i18n={i18n}>
      <AgentMcpEntryDetail
        server={{ ...server, enabled: false }}
        target={preset.target}
        isManaged={false}
        platformId="antigravity"
        platformName="Antigravity"
        sourcePath={preset.path}
        onBack={vi.fn()}
        onOpenAgentConfig={vi.fn()}
        onUninstall={vi.fn()}
      />
    </I18nextProvider>,
  );
  const content = detail.container.querySelector("pre")?.textContent;
  if (!content) throw new Error("Native configuration preview is missing");
  expect(JSON.parse(content)).toEqual({
    mcpServers: {
      remote: {
        ...nativeEntry,
        headers: { Authorization: MCP_REDACTED_VALUE },
        oauth: { clientId: "fixture-client", clientSecret: MCP_REDACTED_VALUE },
        disabled: true,
      },
    },
  });
});

it("rejects missing entries and malformed target paths without persisting an imported record", async () => {
  const { preset } = await source();
  const before = await mcpApi.getLibrary();
  await expect(
    mcpApi.createFromSource({
      kind: "target",
      preset,
      serverName: "missing",
    }),
  ).rejects.toThrow("MCP target server not found");
  await expect(
    mcpApi.createFromSource({
      kind: "target",
      preset: { ...preset, path: "relative.json" },
      serverName: "remote",
    }),
  ).rejects.toThrow("Invalid MCP target import request");
  expect(await mcpApi.getLibrary()).toEqual(before);
  expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual({
    mcpServers: { remote: nativeEntry },
  });
});

it("keeps native names distinct through inventory, selected import, reopen, apply and removal", async () => {
  const { preset } = await source();
  const entries = {
    "Docs.API": nativeEntry,
    "docs-api": { command: "node", args: ["other.mjs"] },
  };
  fs.writeFileSync(preset.path, JSON.stringify({ mcpServers: entries }));
  expect((await mcpApi.getTargetStatus([preset]))[0].serverNames).toEqual(
    Object.keys(entries),
  );
  const imported = await mcpApi.createFromSource({
    kind: "target",
    preset,
    serverName: "Docs.API",
  });
  const server = imported.imported[0];
  expect(server.name).toBe("Docs.API");
  await mcpApi.updateServer(server.id, { displayName: "Edited native name" });
  await runtime.reopen();
  registerMcpIPC();
  expect((await mcpApi.getLibrary()).servers[0].name).toBe("Docs.API");
  await expect(
    mcpApi.apply({ ...preset, serverIds: [server.id] }),
  ).rejects.toThrow("Docs.API");
  await mcpApi.apply({ ...preset, serverIds: [server.id], force: true });
  expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual({
    mcpServers: entries,
  });
  await mcpApi.removeNames({ ...preset, serverNames: ["Docs.API"] });
  expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual({
    mcpServers: { "docs-api": entries["docs-api"] },
  });
  expect((await mcpApi.getLibrary()).bindings).toEqual([]);
});

it("runs file import, preview, global and workspace deployment, env edits, sync, conflict override and removal through real IPC", async () => {
  const { preset: global } = await source();
  const projectRoot = path.join(runtime.root, "project with spaces");
  const workspace = deriveProjectMcpTargetPresets([
    {
      id: "antigravity-project",
      name: "Project",
      rootPath: projectRoot,
      scanPaths: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ]).find((preset) => preset.target === "antigravity");
  if (!workspace) throw new Error("Missing Antigravity workspace target");
  expect(workspace.path).toBe(
    path.join(projectRoot, ".agents", "mcp_config.json"),
  );
  const localEntry = {
    command: process.execPath,
    args: ["fixture.mjs"],
    cwd: projectRoot,
  };
  const input = JSON.stringify({
    mcpServers: {
      remote: nativeEntry,
      local: localEntry,
      google: {
        serverUrl: "https://example.test/google",
        authProviderType: "google_credentials",
      },
    },
  });
  const sourcePath = path.join(runtime.root, "import.json");
  fs.writeFileSync(sourcePath, input);
  const imported = await mcpApi.createFromSource({
    kind: "path",
    input: sourcePath,
  });
  expect(imported.imported).toHaveLength(3);
  expect(
    (await mcpApi.createFromSource({ kind: "config", input })).skipped.sort(),
  ).toEqual(["google", "local", "remote"]);
  const remote = imported.imported.find((server) => server.name === "remote");
  const local = imported.imported.find((server) => server.name === "local");
  if (!remote || !local) throw new Error("Imported MCP entries are missing");
  const preview = await mcpApi.preview("antigravity", [remote.id]);
  expect(JSON.parse(preview).mcpServers.remote).toMatchObject({
    serverUrl: nativeEntry.serverUrl,
    disabledTools: nativeEntry.disabledTools,
    oauth: { clientSecret: MCP_REDACTED_VALUE },
  });
  const unrelated = {
    command: "node",
    args: ["unrelated.mjs"],
    disabled: true,
  };
  const original = { keep: { value: "unchanged" }, mcpServers: { unrelated } };
  const targets = [global, workspace];
  for (const preset of targets) {
    fs.mkdirSync(path.dirname(preset.path), { recursive: true });
    fs.writeFileSync(preset.path, JSON.stringify(original));
    await mcpApi.apply({
      ...preset,
      serverIds: imported.imported.map((server) => server.id),
    });
    expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toMatchObject({
      ...original,
      mcpServers: { unrelated, remote: nativeEntry, local: localEntry },
    });
  }
  fs.mkdirSync(projectRoot, { recursive: true });
  expect((await mcpApi.checkServer(local.id)).status).toBe("ok");
  const envPath = path.join(runtime.root, "local.env");
  fs.writeFileSync(envPath, "MODE=fixture\nUNSELECTED=untouched\n");
  await mcpApi.importEnv(local.id, envPath, ["MODE"]);
  await mcpApi.updateServer(remote.id, {
    url: "https://example.test/updated",
    disabledTools: ["write_record"],
  });
  const external = JSON.parse(fs.readFileSync(workspace.path, "utf8"));
  external.mcpServers.remote.disabled = true;
  const externalBytes = JSON.stringify(external);
  fs.writeFileSync(workspace.path, externalBytes);
  const sync = await mcpApi.syncTargets(remote.id);
  expect(sync.updated.map((entry) => entry.path)).toEqual([global.path]);
  expect(sync.blocked).toEqual([
    expect.objectContaining({ path: workspace.path, status: "conflict" }),
  ]);
  expect(sync.failed).toEqual([]);
  expect(fs.readFileSync(workspace.path, "utf8")).toBe(externalBytes);
  expect(JSON.stringify(sync)).not.toContain("native-fixture-secret");
  expect(
    (await mcpApi.syncTargets(remote.id, { forceConflicts: true })).updated,
  ).toHaveLength(1);
  expect((await mcpApi.syncTargets(local.id)).updated).toHaveLength(2);
  await runtime.reopen();
  registerMcpIPC();
  expect(
    (await mcpApi.checkTargetSync(remote.id)).every(
      (entry) => entry.status === "synced",
    ),
  ).toBe(true);
  await mcpApi.updateServer(remote.id, { enabled: false });
  expect((await mcpApi.syncTargets(remote.id)).skipped).toHaveLength(2);
  await mcpApi.updateServer(remote.id, { enabled: true });
  for (const preset of targets) {
    const config = JSON.parse(fs.readFileSync(preset.path, "utf8"));
    expect(config.keep).toEqual(original.keep);
    expect(config.mcpServers.remote).toEqual({
      ...nativeEntry,
      serverUrl: "https://example.test/updated",
      disabledTools: ["write_record"],
    });
    expect(config.mcpServers.local).toEqual({
      ...localEntry,
      env: { MODE: "fixture" },
    });
    expect(config.mcpServers.google.authProviderType).toBe(
      "google_credentials",
    );
    expect(config.mcpServers.unrelated).toEqual(unrelated);
    await mcpApi.remove({ ...preset, serverIds: [remote.id] });
    await mcpApi.removeNames({ ...preset, serverNames: ["local", "google"] });
    expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual(original);
  }
  await mcpApi.deleteServer(remote.id);
  expect(
    (await mcpApi.getLibrary()).servers.map((server) => server.name).sort(),
  ).toEqual(["google", "local"]);
  expect((await mcpApi.getLibrary()).bindings).toEqual([]);
  expect(fs.readFileSync(sourcePath, "utf8")).toBe(input);
});

it("rolls back an Antigravity target on binding persistence failure and can retry without duplicate entries", async () => {
  const { preset } = await source();
  const imported = await mcpApi.createFromSource({
    kind: "target",
    preset,
    serverName: "remote",
  });
  await mcpApi.updateServer(imported.imported[0].id, {
    url: "https://example.test/updated",
  });
  const before = fs.readFileSync(preset.path, "utf8");
  const library = await mcpApi.getLibrary();
  await runtime.reopen();
  const service = createDesktopMcpLibraryService();
  registerMcpIPC(service);
  // Inject a persistence fault after the real target replacement, not a successful business result.
  const failure = vi.spyOn(service, "write").mockImplementationOnce(() => {
    throw new Error("fixture binding persistence failure");
  });
  const target = {
    ...preset,
    serverIds: [imported.imported[0].id],
    force: true,
  };
  await expect(mcpApi.apply(target)).rejects.toThrow(
    "fixture binding persistence failure",
  );
  expect(fs.readFileSync(preset.path, "utf8")).toBe(before);
  expect(await mcpApi.getLibrary()).toEqual(library);
  failure.mockRestore();
  await mcpApi.apply(target);
  expect(
    JSON.parse(fs.readFileSync(preset.path, "utf8")).mcpServers.remote,
  ).toEqual({ ...nativeEntry, serverUrl: "https://example.test/updated" });
  expect((await mcpApi.getLibrary()).bindings).toHaveLength(1);
  expect(fs.readdirSync(path.dirname(preset.path))).toEqual([
    "mcp_config.json",
  ]);
});
