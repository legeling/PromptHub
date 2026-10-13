/** @vitest-environment node */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentConversationDB, AgentSessionIndexDB } from "@prompthub/db";
import {
  buildManagedAgents,
  closeDatabase,
  configureRuntimePaths,
  getDatabase,
  getMcpTargetPresets,
  initDatabase,
  resetRuntimePaths,
  CoreMcpLibraryService,
} from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import { getAgentConfigContext } from "../../../src/main/services/agent-platform-context";
import {
  createAgentSessionIndexOperations,
  resolveAgentSessionIndexSource,
} from "../../../src/main/services/agent-session-index-operations";
import { createAgentSessionService } from "../../../src/main/services/agent-session-service";
import { AgentConversationService } from "../../../src/main/services/agent-conversation-service";
import { createAgentTerminalLauncher } from "../../../src/main/services/agent-terminal-launcher";
import { invalidateCustomPathsCache } from "../../../src/main/services/skill-installer-utils";
import { SkillInstaller } from "../../../src/main/services/skill-installer";
import { registerAgentConversationIPC } from "../../../src/main/ipc/agent-conversation.ipc";
import { registerMcpIPC } from "../../../src/main/ipc/mcp.ipc";
import { agentApi } from "../../../src/preload/api/agent";
import { mcpApi } from "../../../src/preload/api/mcp";

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const transport = vi.hoisted(() => ({ handlers: new Map<string, Handler>() }));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) =>
      transport.handlers.set(channel, handler),
  },
  ipcRenderer: {
    invoke: async (channel: string, ...args: unknown[]) => {
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error(`Unregistered channel ${channel}`);
      return handler({}, ...args);
    },
  },
  app: { isPackaged: false },
  session: {},
}));

const runFile = promisify(execFile);
const sessionId = "11111111-2222-4333-8444-555555555555";
let root: string;
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "claude-root-workflow-")),
  );
  configureRuntimePaths({ userDataPath: path.join(root, "userdata") });
  initDatabase();
  transport.handlers.clear();
});
afterEach(async () => {
  closeDatabase();
  invalidateCustomPathsCache();
  resetRuntimePaths();
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

function setRootOverride(value: string): void {
  getDatabase()
    .prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)")
    .run(
      "builtinAgentOverrides",
      JSON.stringify({ claude: { rootPath: value } }),
    );
  invalidateCustomPathsCache();
}
async function writeSession(base: string, text: string): Promise<string> {
  const project = path.join(base, "projects", "fixture-project");
  await fs.mkdir(project, { recursive: true });
  const file = path.join(project, `${sessionId}.jsonl`);
  await fs.writeFile(
    file,
    JSON.stringify({
      type: "user",
      sessionId,
      cwd: root,
      timestamp: "2026-10-13T09:00:00.000Z",
      message: { role: "user", content: text },
    }) + "\n",
  );
  return file;
}
function operations(): ReturnType<typeof createAgentSessionIndexOperations> {
  return createAgentSessionIndexOperations(
    new AgentSessionIndexDB(getDatabase()),
    "claude",
  );
}
function summary(): ReturnType<typeof buildManagedAgents>[number] {
  const platform = SkillInstaller.getSupportedPlatforms().find(
    (entry) => entry.id === "claude",
  );
  if (!platform) throw new Error("Claude platform missing");
  return buildManagedAgents({
    platforms: [platform],
    detectedPlatformIds: ["claude"],
    pinnedPlatformIds: [],
    builtinOverrides: {},
    osKey: "darwin",
  })[0];
}

it("keeps Provider, live/indexed sessions, backup source and registered MCP target on the selected root after reopen", async () => {
  const selected = path.join(root, "selected");
  const inherited = path.join(root, "inherited");
  const selectedFile = await writeSession(
    selected,
    "Selected account conversation",
  );
  const inheritedFile = await writeSession(
    inherited,
    "Other account conversation",
  );
  const otherBytes = await fs.readFile(inheritedFile);
  vi.stubEnv("CLAUDE_CONFIG_DIR", inherited);
  setRootOverride(selected);
  expect(getAgentConfigContext("claude").rootPath).toBe(selected);
  expect(resolveAgentSessionIndexSource("claude")?.rootPath).toBe(
    path.join(selected, "projects"),
  );
  const live = await operations().list("claude", { limit: 10 });
  expect(live.sessions.map((entry) => entry.title)).toEqual([
    "Selected account conversation",
  ]);
  expect(live.sessions[0].resume).toMatchObject({
    environment: { CLAUDE_CONFIG_DIR: selected },
  });
  const index = operations();
  expect(index.setEnabled("claude", true).source?.rootPath).toBe(
    path.join(selected, "projects"),
  );
  await index.refresh("claude");
  closeDatabase();
  invalidateCustomPathsCache();
  initDatabase();
  const reopened = operations();
  const list = await reopened.list("claude", { limit: 10 });
  expect(list.sessions[0]).toMatchObject({
    title: "Selected account conversation",
    sourcePath: selectedFile,
    resume: { environment: { CLAUDE_CONFIG_DIR: selected } },
  });
  expect(summary().paths.mcp).toBe(path.join(selected, ".claude.json"));
  registerMcpIPC(new CoreMcpLibraryService());
  const handler = transport.handlers.get(IPC_CHANNELS.MCP_TARGET_PRESETS);
  if (!handler) throw new Error("MCP presets not registered");
  expect(await handler({})).toContainEqual(
    expect.objectContaining({
      id: "claude",
      path: path.join(selected, ".claude.json"),
    }),
  );
  const preset = (await mcpApi.getTargetPresets()).find(
    (entry) => entry.id === "claude",
  );
  if (!preset) throw new Error("Claude preset missing");
  const inheritedMcp = path.join(inherited, ".claude.json");
  await fs.writeFile(inheritedMcp, '{"account":"other","mcpServers":{}}');
  const otherMcpBytes = await fs.readFile(inheritedMcp);
  await fs.writeFile(preset.path, '{"account":"selected","mcpServers":{}}');
  const imported = await mcpApi.createFromSource({
    kind: "config",
    input:
      '{"mcpServers":{"fixture":{"type":"http","url":"https://example.test/mcp"}}}',
  });
  const result = await mcpApi.apply({
    ...preset,
    serverIds: imported.imported.map((entry) => entry.id),
  });
  expect(result.path).toBe(path.join(selected, ".claude.json"));
  const written: unknown = JSON.parse(await fs.readFile(result.path, "utf8"));
  expect(written).toMatchObject({
    account: "selected",
    mcpServers: { fixture: { type: "http", url: "https://example.test/mcp" } },
  });
  expect(await fs.readFile(inheritedMcp)).toEqual(otherMcpBytes);
  await reopened.delete("claude", sessionId);
  await expect(fs.access(selectedFile)).rejects.toThrow();
  expect(await fs.readFile(inheritedFile)).toEqual(otherBytes);
});

it("matches summary and MCP preset for an environment-only root and preserves the native default location", () => {
  const selected = path.join(root, "environment");
  vi.stubEnv("CLAUDE_CONFIG_DIR", selected);
  expect(summary().paths.mcp).toBe(path.join(selected, ".claude.json"));
  expect(
    getMcpTargetPresets(root, "darwin", { CLAUDE_CONFIG_DIR: selected }).find(
      (entry) => entry.id === "claude",
    )?.path,
  ).toBe(path.join(selected, ".claude.json"));
  expect(
    getMcpTargetPresets(root, "darwin", {}).find(
      (entry) => entry.id === "claude",
    )?.path,
  ).toBe(path.join(root, ".claude.json"));
  expect(
    getMcpTargetPresets(root, "darwin", {
      CLAUDE_CONFIG_DIR: "relative/root",
    }).find((entry) => entry.id === "claude")?.path,
  ).toBe(path.join(root, ".claude.json"));
  const platform = getPlatformById("claude");
  if (!platform) throw new Error("Claude platform missing");
  const [agent] = buildManagedAgents({
    platforms: [platform],
    detectedPlatformIds: [],
    pinnedPlatformIds: [],
    builtinOverrides: { claude: { rootPath: selected } },
    osKey: "darwin",
  });
  expect(agent.paths.mcp).toBe(path.join(selected, ".claude.json"));
});

it("resumes through preload and registered IPC with the selected config environment, exact args and cwd", async () => {
  const selected = path.join(root, "account ' ; $(false)");
  const inherited = path.join(root, "wrong-account");
  await writeSession(selected, "Resume selected account");
  vi.stubEnv("CLAUDE_CONFIG_DIR", inherited);
  setRootOverride(selected);
  const executable = path.join(root, "recorder.cjs");
  const output = path.join(root, "observation.json");
  await fs.writeFile(
    executable,
    `#!${process.execPath}\nconst fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(output)}, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),configDir:process.env.CLAUDE_CONFIG_DIR}));\n`,
    { mode: 0o700 },
  );
  const cleanup: Array<() => Promise<void>> = [];
  const launcher = createAgentTerminalLauncher({
    platform: "darwin",
    tempRoot: path.join(root, "launches"),
    openPath: async (script) => {
      // Replace only the OS terminal opener; execute the real generated script
      // with a task-owned recorder, never Claude, hooks or a model request.
      await runFile("/bin/sh", [script], {
        timeout: 5_000,
        maxBuffer: 8_192,
        env: { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: inherited },
      });
      return "";
    },
    scheduleCleanup: (operation) => cleanup.push(operation),
  });
  registerAgentConversationIPC({
    service: new AgentConversationService({
      repository: new AgentConversationDB(getDatabase()),
      sessions: operations(),
      homeDir: root,
      resolveExecutable: async () => executable,
      launch: (command) => launcher.launch(command),
      copyText: () => undefined,
    }),
    saveExport: async () => null,
  });
  expect(
    await agentApi.resumeConversation({ agentId: "claude", sessionId }),
  ).toEqual({ status: "launched", mode: "native-resume" });
  const observation: unknown = JSON.parse(await fs.readFile(output, "utf8"));
  expect(observation).toEqual({
    args: ["--resume", sessionId],
    cwd: root,
    configDir: selected,
  });
  await Promise.all(cleanup.map((operation) => operation()));
  expect(await fs.readdir(path.join(root, "launches"))).toEqual([]);
});

it("clears inherited config scope for default-root transcripts without changing their files", async () => {
  const home = path.join(root, "home");
  const file = await writeSession(
    path.join(home, ".claude"),
    "Default conversation",
  );
  const reader = createAgentSessionService({ homeDir: home });
  const list = await reader.list("claude", { limit: 10 });
  expect(list.sessions[0].resume).toMatchObject({
    environment: { CLAUDE_CONFIG_DIR: null },
  });
  expect(await fs.readFile(file, "utf8")).toContain("Default conversation");
  const executable = path.join(root, "default-recorder.cjs");
  const output = path.join(root, "default-scope.json");
  await fs.writeFile(
    executable,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify({hasConfigDirectory:Object.hasOwn(process.env,'CLAUDE_CONFIG_DIR')}));\n`,
    { mode: 0o700 },
  );
  const launcher = createAgentTerminalLauncher({
    platform: "darwin",
    tempRoot: path.join(root, "default-launch"),
    openPath: async (script) => {
      await runFile("/bin/sh", [script], {
        timeout: 5_000,
        maxBuffer: 8_192,
        env: {
          PATH: process.env.PATH,
          CLAUDE_CONFIG_DIR: path.join(root, "other-account"),
        },
      });
      return "";
    },
    scheduleCleanup: () => undefined,
  });
  const command = list.sessions[0].resume;
  if (!command) throw new Error("Default resume unavailable");
  await launcher.launch({ ...command, executable });
  const observation: unknown = JSON.parse(await fs.readFile(output, "utf8"));
  expect(observation).toEqual({ hasConfigDirectory: false });
  expect(await fs.readdir(path.join(root, "default-launch"))).toEqual([]);
});

it("rejects invalid resume environment before staging launch artifacts", async () => {
  const tempRoot = path.join(root, "invalid-launch");
  const launcher = createAgentTerminalLauncher({
    platform: "darwin",
    tempRoot,
    openPath: async () => {
      throw new Error("Invalid environment must not launch");
    },
  });
  for (const directory of ["relative/root", "bad\0root"]) {
    await expect(
      launcher.launch({
        executable: process.execPath,
        args: [],
        environment: { CLAUDE_CONFIG_DIR: directory },
      }),
    ).rejects.toThrow("ENVIRONMENT_INVALID");
  }
  const command = { executable: process.execPath, args: [] };
  Reflect.set(command, "environment", null);
  await expect(launcher.launch(command)).rejects.toThrow("ENVIRONMENT_INVALID");
  await expect(fs.access(tempRoot)).rejects.toThrow();
});
