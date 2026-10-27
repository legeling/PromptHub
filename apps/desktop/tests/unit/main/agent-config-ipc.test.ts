import type { AgentUsageQuota } from "@prompthub/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentUsageService } from "../../../src/main/services/agent-usage-service";

const handleMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const listConfigFilesMock = vi.fn();
const readConfigFileMock = vi.fn();
const writeConfigFileMock = vi.fn();
const getBuiltinAgentOverrideMock = vi.fn();
const getPlatformRootDirMock = vi.fn();
const inspectAgentModelConfigMock = vi.fn();
const updateAgentModelConfigMock = vi.fn();
const resolveNativeCommandMock = vi.fn();
const runNativeCommandMock = vi.fn();
const launchAgentPlatformMock = vi.fn();
const updatePiCustomProviderMock = vi.fn();
const updatePiCustomModelMock = vi.fn();
const testPiModelMock = vi.fn();
const importCurrentPiProviderMock = vi.fn();

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/prompthub") },
  ipcMain: { handle: handleMock },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(value)),
    decryptString: vi.fn((value: Buffer) => value.toString("utf8")),
  },
  shell: { openPath: vi.fn() },
}));

vi.mock("../../../src/main/services/skill-installer", () => ({
  SkillInstaller: {
    getSupportedPlatforms: vi.fn(() => [
      {
        id: "codex",
        name: "Codex CLI",
        icon: "Terminal",
        rootDir: {
          darwin: "~/.codex",
          win32: "%USERPROFILE%\\.codex",
          linux: "~/.codex",
        },
        skillsRelativePath: "skills",
        configFiles: ["config.toml"],
        launchPaths: { darwin: ["/Applications/Codex.app"] },
      },
      {
        id: "pi",
        name: "Pi",
        icon: "Terminal",
        rootDir: {
          darwin: "~/.pi/agent",
          win32: "%USERPROFILE%\\.pi\\agent",
          linux: "~/.pi/agent",
        },
        skillsRelativePath: "skills",
        configFiles: ["settings.json", "models.json"],
      },
      {
        id: "antigravity-cli",
        name: "Antigravity CLI",
        icon: "Sparkles",
        rootDir: {
          darwin: "~/.gemini/antigravity-cli",
          win32: "%USERPROFILE%\\.gemini\\antigravity-cli",
          linux: "~/.gemini/antigravity-cli",
        },
        skillsRelativePath: "skills",
      },
      {
        id: "kimi",
        name: "Kimi Code",
        icon: "Sparkles",
        rootDir: {
          darwin: "~/.kimi-code",
          win32: "%USERPROFILE%\\.kimi-code",
          linux: "~/.kimi-code",
        },
        skillsRelativePath: "skills",
        configFiles: ["config.toml", "tui.toml", "mcp.json"],
      },
    ]),
    readLocalRepoFileByPath: readFileMock,
    writeLocalRepoFileByPath: writeFileMock,
  },
}));

vi.mock("../../../src/main/services/skill-installer-utils", () => ({
  getBuiltinAgentOverride: getBuiltinAgentOverrideMock,
  getPlatformRootDir: getPlatformRootDirMock,
}));

vi.mock("../../../src/main/services/agent-user-config-files", () => ({
  createAgentUserConfigFileService: vi.fn(() => ({
    list: listConfigFilesMock,
    read: readConfigFileMock,
    write: writeConfigFileMock,
  })),
}));

vi.mock("../../../src/main/services/agent-model-config", () => ({
  inspectAgentModelConfig: inspectAgentModelConfigMock,
  updateAgentModelConfig: updateAgentModelConfigMock,
}));

vi.mock("../../../src/main/services/native-command", () => ({
  createNativeCommandRunner: vi.fn(() => ({
    resolve: resolveNativeCommandMock,
    run: runNativeCommandMock,
  })),
}));

vi.mock("../../../src/main/services/agent-launch-service", () => ({
  launchAgentPlatform: launchAgentPlatformMock,
}));

vi.mock("../../../src/main/services/agent-pi-model-test", () => ({
  testPiModel: testPiModelMock,
}));

vi.mock("../../../src/main/services/agent-pi-current-provider-import", () => ({
  importCurrentPiProvider: importCurrentPiProviderMock,
}));

vi.mock("../../../src/main/services/agent-pi-model-writes", () => ({
  addPiCustomModel: vi.fn(),
  addPiCustomProvider: vi.fn(),
  removePiCustomModel: vi.fn(),
  removePiCustomProvider: vi.fn(),
  setPiCredential: vi.fn(),
  updatePiCustomModel: updatePiCustomModelMock,
  updatePiCustomProvider: updatePiCustomProviderMock,
}));

type Handler = (...args: unknown[]) => Promise<unknown>;

async function setup(usageService?: AgentUsageService) {
  vi.resetModules();
  handleMock.mockReset();
  const [{ registerAgentIPC }, { IPC_CHANNELS }] = await Promise.all([
    import("../../../src/main/ipc/agent.ipc"),
    import("@prompthub/shared/constants/ipc-channels"),
  ]);
  registerAgentIPC(usageService ? { usageService } : undefined);
  return {
    IPC_CHANNELS,
    handlers: Object.fromEntries(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
    ) as Record<string, Handler>,
  };
}

describe("Agent config file IPC", () => {
  it("reads the model-root redirect from the Agent definition and preserves custom roots", async () => {
    const { handlers, IPC_CHANNELS } = await setup();
    const { getAgentDefinitionById } =
      await import("@prompthub/shared/constants/agent-definitions");
    const definition = getAgentDefinitionById("antigravity-cli");
    if (!definition?.modelConfig)
      throw new Error("Missing Antigravity model fixture");
    const config = definition.modelConfig;
    const redirect = config.defaultRootRelativePath;
    config.defaultRootRelativePath = "../test-model-root";
    try {
      await handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_GET](
        null,
        "antigravity-cli",
      );
      expect(inspectAgentModelConfigMock).toHaveBeenLastCalledWith({
        agentId: "antigravity-cli",
        rootPath: "/Users/test/.gemini/test-model-root",
      });
      getPlatformRootDirMock.mockReturnValue(
        "/Users/test/.gemini/antigravity-cli/",
      );
      await handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_GET](
        null,
        "antigravity-cli",
      );
      expect(inspectAgentModelConfigMock).toHaveBeenLastCalledWith({
        agentId: "antigravity-cli",
        rootPath: "/Users/test/.gemini/test-model-root",
      });
      getPlatformRootDirMock.mockReturnValue("/Users/test/custom-agent");
      await handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_GET](
        null,
        "antigravity-cli",
      );
      expect(inspectAgentModelConfigMock).toHaveBeenLastCalledWith({
        agentId: "antigravity-cli",
        rootPath: "/Users/test/custom-agent",
      });
    } finally {
      config.defaultRootRelativePath = redirect;
    }
  });

  it("rejects every Pi model/provider action when its product switch is disabled", async () => {
    const { handlers, IPC_CHANNELS } = await setup();
    const { getAgentDefinitionById } =
      await import("@prompthub/shared/constants/agent-definitions");
    const definition = getAgentDefinitionById("pi");
    if (!definition) throw new Error("Missing Pi fixture");
    const capability = definition.capabilities.providerModel;
    const enabled = capability.enabled;
    capability.enabled = false;
    try {
      const channels = [
        IPC_CHANNELS.AGENT_PI_PROVIDER_ADD,
        IPC_CHANNELS.AGENT_PI_PROVIDER_IMPORT_CURRENT,
        IPC_CHANNELS.AGENT_PI_PROVIDER_UPDATE,
        IPC_CHANNELS.AGENT_PI_PROVIDER_REMOVE,
        IPC_CHANNELS.AGENT_PI_MODEL_ADD,
        IPC_CHANNELS.AGENT_PI_MODEL_UPDATE,
        IPC_CHANNELS.AGENT_PI_MODEL_REMOVE,
        IPC_CHANNELS.AGENT_PI_MODEL_TEST,
        IPC_CHANNELS.AGENT_PI_CREDENTIAL_SET,
      ];
      for (const channel of channels) {
        await expect(
          handlers[channel](null, { agentId: "pi" }),
        ).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
      }
      expect(getPlatformRootDirMock).not.toHaveBeenCalled();
      expect(updatePiCustomProviderMock).not.toHaveBeenCalled();
      expect(updatePiCustomModelMock).not.toHaveBeenCalled();
      expect(importCurrentPiProviderMock).not.toHaveBeenCalled();
      expect(testPiModelMock).not.toHaveBeenCalled();
    } finally {
      capability.enabled = enabled;
    }
  });

  beforeEach(() => {
    readFileMock.mockReset();
    writeFileMock.mockReset();
    listConfigFilesMock.mockReset();
    readConfigFileMock.mockReset();
    writeConfigFileMock.mockReset();
    getBuiltinAgentOverrideMock.mockReset();
    getPlatformRootDirMock.mockReset();
    inspectAgentModelConfigMock.mockReset();
    updateAgentModelConfigMock.mockReset();
    resolveNativeCommandMock.mockReset();
    runNativeCommandMock.mockReset();
    launchAgentPlatformMock.mockReset();
    updatePiCustomProviderMock.mockReset();
    updatePiCustomModelMock.mockReset();
    testPiModelMock.mockReset();
    importCurrentPiProviderMock.mockReset();
    getPlatformRootDirMock.mockImplementation((platform: { id: string }) => {
      if (platform.id === "kimi") return "/Users/test/.kimi-code";
      if (platform.id === "pi") return "/Users/test/.pi/agent";
      if (platform.id === "antigravity-cli")
        return "/Users/test/.gemini/antigravity-cli";
      return "/Users/test/.codex";
    });
    listConfigFilesMock.mockImplementation(
      (context: { relativePaths: string[] }) =>
        Promise.resolve(
          context.relativePaths.map((relativePath) => ({
            path: relativePath,
            isDirectory: false,
            size: 0,
          })),
        ),
    );
  });

  it("uses an injected process-wide usage service", async () => {
    const getUsage = vi.fn(
      async (agentId: string): Promise<AgentUsageQuota> => ({
        schemaVersion: 2,
        agentId,
        adapter: "test",
        status: "ok" as const,
        source: "provider" as const,
        plan: "pro",
        fetchedAt: 1,
        metrics: [],
      }),
    );
    const { handlers, IPC_CHANNELS } = await setup({ getUsage });

    await expect(
      handlers[IPC_CHANNELS.AGENT_USAGE_GET](null, "codex", {
        forceRefresh: true,
      }),
    ).resolves.toMatchObject({ agentId: "codex", status: "ok" });
    expect(getUsage).toHaveBeenCalledWith("codex", { forceRefresh: true });

    await expect(
      handlers[IPC_CHANNELS.AGENT_USAGE_GET](null, "codex", {
        forceRefresh: "yes",
      }),
    ).rejects.toThrow("forceRefresh must be a boolean");
    expect(getUsage).toHaveBeenCalledTimes(1);
  });

  it("launches only a known Agent through its platform allowlist", async () => {
    launchAgentPlatformMock.mockResolvedValue({ success: true });
    const { handlers, IPC_CHANNELS } = await setup();

    await expect(
      handlers[IPC_CHANNELS.AGENT_LAUNCH](null, "codex"),
    ).resolves.toEqual({ success: true });
    expect(launchAgentPlatformMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "codex" }),
      expect.objectContaining({ platform: process.platform }),
    );
    await expect(
      handlers[IPC_CHANNELS.AGENT_LAUNCH](null, "missing"),
    ).resolves.toEqual({ success: false, errorCode: "unsupported" });
  });

  it("lists, reads and writes only declared native config files", async () => {
    readConfigFileMock.mockResolvedValue({
      path: "config.toml",
      isDirectory: false,
      content: 'model = "gpt-5"',
      revision: "before",
    });
    writeConfigFileMock.mockResolvedValue({
      path: "config.toml",
      isDirectory: false,
      content: 'model = "gpt-5.1"',
      revision: "after",
    });
    const { handlers, IPC_CHANNELS } = await setup();

    await expect(
      handlers[IPC_CHANNELS.AGENT_CONFIG_FILES_LIST](null, "codex"),
    ).resolves.toEqual([{ path: "config.toml", isDirectory: false, size: 0 }]);
    await handlers[IPC_CHANNELS.AGENT_CONFIG_FILE_READ](
      null,
      "codex",
      "config.toml",
    );
    await handlers[IPC_CHANNELS.AGENT_CONFIG_FILE_WRITE](
      null,
      "codex",
      "config.toml",
      'model = "gpt-5.1"',
      "before",
    );

    expect(readConfigFileMock).toHaveBeenCalledWith(
      {
        agentId: "codex",
        rootPath: "/Users/test/.codex",
        relativePaths: ["config.toml"],
      },
      "config.toml",
    );
    expect(writeConfigFileMock).toHaveBeenCalledWith(
      {
        agentId: "codex",
        rootPath: "/Users/test/.codex",
        relativePaths: ["config.toml"],
      },
      "config.toml",
      'model = "gpt-5.1"',
      "before",
    );
  });

  it("honors normalized user overrides without exposing undeclared siblings", async () => {
    getBuiltinAgentOverrideMock.mockReturnValue({
      configRelativePaths: [
        " profiles\\work.config.toml ",
        "profiles/work.config.toml",
      ],
    });
    const { handlers, IPC_CHANNELS } = await setup();

    await expect(
      handlers[IPC_CHANNELS.AGENT_CONFIG_FILES_LIST](null, "codex"),
    ).resolves.toEqual([
      {
        path: "profiles/work.config.toml",
        isDirectory: false,
        size: 0,
      },
    ]);
  });

  it("rejects unknown Agents and malformed write payloads", async () => {
    const { handlers, IPC_CHANNELS } = await setup();

    await expect(
      handlers[IPC_CHANNELS.AGENT_CONFIG_FILES_LIST](null, "missing"),
    ).rejects.toThrow("Unknown Agent platform");
    await expect(
      handlers[IPC_CHANNELS.AGENT_CONFIG_FILES_LIST](null, ""),
    ).rejects.toThrow("non-empty agentId");
    await expect(
      handlers[IPC_CHANNELS.AGENT_CONFIG_FILE_WRITE](
        null,
        "codex",
        "config.toml",
        { model: "gpt-5" },
      ),
    ).rejects.toThrow("content must be a string");
    await expect(
      handlers[IPC_CHANNELS.AGENT_CONFIG_FILE_WRITE](
        null,
        "codex",
        "config.toml",
        'model = "gpt-5"',
        42,
      ),
    ).rejects.toThrow("revision must be a string");
    expect(readConfigFileMock).not.toHaveBeenCalled();
    expect(writeConfigFileMock).not.toHaveBeenCalled();
  });

  it("reads and updates only non-secret model settings through the validated Agent root", async () => {
    inspectAgentModelConfigMock.mockResolvedValue({
      agentId: "codex",
      model: "gpt-5.1",
    });
    updateAgentModelConfigMock.mockResolvedValue({
      agentId: "codex",
      model: "gpt-5.2",
      backupPath: "/tmp/prompthub/agent-config-backups/codex/config.toml",
    });
    const { handlers, IPC_CHANNELS } = await setup();

    await handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_GET](null, "codex");
    await handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_SET](null, {
      agentId: "codex",
      model: "gpt-5.2",
    });

    expect(inspectAgentModelConfigMock).toHaveBeenCalledWith({
      agentId: "codex",
      rootPath: "/Users/test/.codex",
    });
    expect(updateAgentModelConfigMock).toHaveBeenCalledWith(
      {
        agentId: "codex",
        rootPath: "/Users/test/.codex",
        model: "gpt-5.2",
        secondaryModel: undefined,
      },
      { backupRoot: "/tmp/prompthub/agent-config-backups" },
    );
  });

  it("routes Antigravity model IPC to its CLI settings root", async () => {
    const { handlers, IPC_CHANNELS } = await setup();

    await handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_GET](
      null,
      "antigravity-cli",
    );
    await handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_SET](null, {
      agentId: "antigravity-cli",
      model: "gemini-3-pro",
    });

    expect(inspectAgentModelConfigMock).toHaveBeenCalledWith({
      agentId: "antigravity-cli",
      rootPath: "/Users/test/.gemini/antigravity-cli",
    });
    expect(updateAgentModelConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "antigravity-cli",
        rootPath: "/Users/test/.gemini/antigravity-cli",
        model: "gemini-3-pro",
      }),
      { backupRoot: "/tmp/prompthub/agent-config-backups" },
    );
  });

  it("rejects malformed model updates before touching native configuration", async () => {
    const { handlers, IPC_CHANNELS } = await setup();

    await expect(
      handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_SET](null, null),
    ).rejects.toThrow("object payload");
    await expect(
      handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_SET](null, {
        agentId: "codex",
        model: 5,
      }),
    ).rejects.toThrow("agentId and model strings");
    await expect(
      handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_SET](null, {
        agentId: "codex",
        model: "gpt-5",
        secondaryModel: {},
      }),
    ).rejects.toThrow("secondaryModel");
    expect(updateAgentModelConfigMock).not.toHaveBeenCalled();
  });

  it("validates and routes Pi provider and model updates through main", async () => {
    updatePiCustomProviderMock.mockResolvedValue({ backupPath: null });
    updatePiCustomModelMock.mockResolvedValue({ backupPath: null });
    const { handlers, IPC_CHANNELS } = await setup();

    await handlers[IPC_CHANNELS.AGENT_PI_PROVIDER_UPDATE](null, {
      agentId: "pi",
      providerId: "foxcode",
      baseUrl: "https://new.example/v1",
      api: "openai-responses",
    });
    await handlers[IPC_CHANNELS.AGENT_PI_MODEL_UPDATE](null, {
      agentId: "pi",
      providerId: "foxcode",
      model: {
        originalId: "gpt-old",
        id: "gpt-new",
        contextWindow: 400000,
        maxTokens: 128000,
        reasoning: true,
      },
    });

    expect(updatePiCustomProviderMock).toHaveBeenCalledWith(
      "/Users/test/.pi/agent",
      {
        providerId: "foxcode",
        baseUrl: "https://new.example/v1",
        api: "openai-responses",
      },
      { backupRoot: "/tmp/prompthub/agent-config-backups" },
    );
    expect(updatePiCustomModelMock).toHaveBeenCalledWith(
      "/Users/test/.pi/agent",
      "foxcode",
      {
        originalId: "gpt-old",
        id: "gpt-new",
        contextWindow: 400000,
        maxTokens: 128000,
        reasoning: true,
      },
      { backupRoot: "/tmp/prompthub/agent-config-backups" },
    );
  });

  it("resolves Pi current-provider import entirely in main", async () => {
    importCurrentPiProviderMock.mockResolvedValue({ backupPath: null });
    const { handlers, IPC_CHANNELS } = await setup();

    await handlers[IPC_CHANNELS.AGENT_PI_PROVIDER_IMPORT_CURRENT](null, {
      agentId: "pi",
    });

    expect(importCurrentPiProviderMock).toHaveBeenCalledWith(
      "/Users/test/.pi/agent",
      { backupRoot: "/tmp/prompthub/agent-config-backups" },
    );
    await expect(
      handlers[IPC_CHANNELS.AGENT_PI_PROVIDER_IMPORT_CURRENT](null, {
        agentId: "codex",
        providerId: "renderer-cannot-select-this",
      }),
    ).rejects.toThrow("only apply to the pi platform");
    expect(importCurrentPiProviderMock).toHaveBeenCalledTimes(1);
  });

  it("routes a validated Pi model test without exposing credentials", async () => {
    testPiModelMock.mockResolvedValue({
      platformId: "pi",
      profileId: "pi:foxcode",
      model: "gpt-custom",
      status: "ok",
    });
    const { handlers, IPC_CHANNELS } = await setup();

    await handlers[IPC_CHANNELS.AGENT_PI_MODEL_TEST](null, {
      agentId: "pi",
      providerId: "foxcode",
      modelId: "gpt-custom",
    });

    expect(testPiModelMock).toHaveBeenCalledWith(
      "/Users/test/.pi/agent",
      { providerId: "foxcode", modelId: "gpt-custom" },
      expect.any(AbortSignal),
    );
  });

  it("rejects malformed Pi updates before touching the write service", async () => {
    const { handlers, IPC_CHANNELS } = await setup();

    await expect(
      handlers[IPC_CHANNELS.AGENT_PI_PROVIDER_UPDATE](null, {
        agentId: "pi",
        providerId: "foxcode",
      }),
    ).rejects.toThrow("provider update requires");
    await expect(
      handlers[IPC_CHANNELS.AGENT_PI_MODEL_UPDATE](null, {
        agentId: "pi",
        providerId: "foxcode",
        model: { id: "missing-original" },
      }),
    ).rejects.toThrow("model update requires");
    expect(updatePiCustomProviderMock).not.toHaveBeenCalled();
    expect(updatePiCustomModelMock).not.toHaveBeenCalled();
  });

  it("rejects Kimi model configuration before writes or native validation", async () => {
    resolveNativeCommandMock.mockResolvedValue("/usr/local/bin/kimi");
    runNativeCommandMock.mockResolvedValue({ stdout: "", stderr: "" });
    updateAgentModelConfigMock.mockImplementation(async (_context, options) => {
      await options.validateNativeConfig(
        "kimi",
        "/Users/test/.kimi-code/config.toml",
      );
      return { agentId: "kimi", model: "kimi-code/kimi-for-coding" };
    });
    const { handlers, IPC_CHANNELS } = await setup();

    await expect(
      handlers[IPC_CHANNELS.AGENT_MODEL_CONFIG_SET](null, {
        agentId: "kimi",
        model: "kimi-code/kimi-for-coding",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
    expect(updateAgentModelConfigMock).not.toHaveBeenCalled();
    expect(writeConfigFileMock).not.toHaveBeenCalled();
    expect(runNativeCommandMock).not.toHaveBeenCalled();
  });
});
