import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertConfigUnchanged,
  inspectAgentModelConfig,
  updateAgentModelConfig,
} from "../../../src/main/services/agent-model-config";

const temporaryRoots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-expanded-model-"),
  );
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("expanded native model configuration adapters", () => {
  it("detects both create and update races before native replacement", async () => {
    const root = await createRoot();
    const targetPath = path.join(root, "settings.json");
    await fs.writeFile(targetPath, '{"model":"external"}\n');

    await expect(assertConfigUnchanged(targetPath, null)).rejects.toThrow(
      "AGENT_MODEL_CONFIG_CONCURRENT_CHANGE",
    );
    await expect(
      assertConfigUnchanged(targetPath, '{"model":"baseline"}\n'),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_CONCURRENT_CHANGE");
  });

  it("declares verified missing states and keeps NanoClaw target-bound", async () => {
    const root = await createRoot();

    await expect(
      inspectAgentModelConfig({ agentId: "antigravity-cli", rootPath: root }),
    ).resolves.toMatchObject({
      adapter: "antigravity-settings-v1",
      status: "missing",
      canSetModel: true,
    });
    await expect(
      inspectAgentModelConfig({ agentId: "hermes", rootPath: root }),
    ).resolves.toMatchObject({
      adapter: "hermes-yaml-v1",
      status: "missing",
      canSetModel: true,
    });
    await expect(
      inspectAgentModelConfig({ agentId: "copaw", rootPath: root }),
    ).resolves.toMatchObject({
      adapter: "copaw-active-agent-v1",
      status: "missing",
      sourceRelativePath: "config.json",
      canSetModel: false,
    });
    await expect(
      inspectAgentModelConfig({ agentId: "nanoclaw", rootPath: root }),
    ).resolves.toMatchObject({
      adapter: null,
      status: "unsupported",
      canSetModel: false,
    });
  });

  it("inspects and updates Antigravity without replacing unrelated CLI settings", async () => {
    const root = await createRoot();
    await fs.writeFile(
      path.join(root, "settings.json"),
      `{
  // Antigravity CLI owns this file.
  "model": "gemini-3-pro",
  "theme": "system"
}\n`,
    );

    await expect(
      inspectAgentModelConfig({ agentId: "antigravity-cli", rootPath: root }),
    ).resolves.toMatchObject({
      adapter: "antigravity-settings-v1",
      status: "configured",
      model: "gemini-3-pro",
      provider: "google-antigravity",
      credentialStatus: "platform-managed",
      sourceRelativePath: "settings.json",
      canSetModel: true,
    });

    await updateAgentModelConfig(
      { agentId: "antigravity-cli", rootPath: root, model: "gemini-3-flash" },
      { backupRoot: path.join(root, "backups") },
    );
    const saved = await fs.readFile(path.join(root, "settings.json"), "utf8");
    expect(saved).toContain("Antigravity CLI owns this file");
    expect(saved).toContain('"model": "gemini-3-flash"');
    expect(saved).toContain('"theme": "system"');
  });

  it("keeps an empty Antigravity settings file editable", async () => {
    const root = await createRoot();
    await fs.writeFile(path.join(root, "settings.json"), "{}\n");

    await expect(
      inspectAgentModelConfig({ agentId: "antigravity-cli", rootPath: root }),
    ).resolves.toMatchObject({
      status: "not-configured",
      model: null,
      availableModels: [],
      canSetModel: true,
    });
  });

  it("sanitizes Qoder custom-model metadata and preserves literal credentials", async () => {
    const root = await createRoot();
    await fs.writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({
        model: { name: "private-gpt" },
        modelConfigs: {
          customModels: [
            {
              key: "private-gpt",
              displayName: "Private GPT",
              provider: "openai-compatible",
              model: "gpt-private",
              baseURL:
                "https://user:pass@qoder.example/v1?token=should-not-leak",
              apiKey: "qoder-secret",
              format: "openai",
            },
          ],
        },
        editor: { vimMode: true },
      }),
    );

    const inspected = await inspectAgentModelConfig({
      agentId: "qoder",
      rootPath: root,
    });
    expect(inspected).toMatchObject({
      adapter: "qoder-settings-v1",
      status: "configured",
      model: "private-gpt",
      provider: "openai-compatible",
      endpoint: "https://qoder.example/v1",
      availableModels: ["private-gpt"],
      credentialStatus: "configured",
      canSetModel: true,
    });
    expect(JSON.stringify(inspected)).not.toMatch(
      /qoder-secret|user:pass|should-not-leak/,
    );

    await updateAgentModelConfig(
      { agentId: "qoder", rootPath: root, model: "qoder-default" },
      { backupRoot: path.join(root, "backups") },
    );
    const saved = JSON.parse(
      await fs.readFile(path.join(root, "settings.json"), "utf8"),
    );
    expect(saved.model.name).toBe("qoder-default");
    expect(saved.modelConfigs.customModels[0].apiKey).toBe("qoder-secret");
    expect(saved.editor).toEqual({ vimMode: true });
  });

  it("distinguishes Qoder built-in and credential-missing custom models", async () => {
    const root = await createRoot();
    const settingsPath = path.join(root, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ model: { name: "qoder-built-in" } }),
    );
    await expect(
      inspectAgentModelConfig({ agentId: "qoder", rootPath: root }),
    ).resolves.toMatchObject({
      provider: "qoder",
      availableModels: ["qoder-built-in"],
      credentialStatus: "platform-managed",
    });

    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        model: { name: "custom-key" },
        modelConfigs: {
          customModels: [
            {
              key: "custom-key",
              model: "custom-native-model",
              provider: "custom",
            },
          ],
        },
      }),
    );
    await expect(
      inspectAgentModelConfig({ agentId: "qoder", rootPath: root }),
    ).resolves.toMatchObject({
      provider: "custom",
      availableModels: ["custom-key"],
      credentialStatus: "missing",
    });

    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        model: { name: "native-only-id" },
        modelConfigs: {
          customModels: [{ model: "native-only-id" }],
        },
      }),
    );
    await expect(
      inspectAgentModelConfig({ agentId: "qoder", rootPath: root }),
    ).resolves.toMatchObject({
      model: "native-only-id",
      provider: "qoder",
      availableModels: ["native-only-id"],
      credentialStatus: "missing",
    });

    await fs.writeFile(settingsPath, "{}\n");
    await expect(
      inspectAgentModelConfig({ agentId: "qoder", rootPath: root }),
    ).resolves.toMatchObject({
      status: "not-configured",
      model: null,
      availableModels: [],
    });
  });

  it("keeps AutoClaw credentials private while updating its top-level model", async () => {
    const root = await createRoot();
    await fs.writeFile(
      path.join(root, "setting.json"),
      JSON.stringify({
        model: "old-model",
        baseUrl: "https://user:pass@autoclaw.example/v1?api_key=secret",
        apiKey: "autoclaw-secret",
        workspace: "/tmp/autoclaw-workspace",
      }),
    );

    const inspected = await inspectAgentModelConfig({
      agentId: "autoclaw",
      rootPath: root,
    });
    expect(inspected).toMatchObject({
      adapter: "autoclaw-setting-v1",
      model: "old-model",
      provider: "openai-compatible",
      endpoint: "https://autoclaw.example/v1",
      credentialStatus: "configured",
      sourceRelativePath: "setting.json",
    });
    expect(JSON.stringify(inspected)).not.toMatch(/autoclaw-secret|user:pass/);

    await updateAgentModelConfig(
      { agentId: "autoclaw", rootPath: root, model: "new-model" },
      { backupRoot: path.join(root, "backups") },
    );
    const saved = JSON.parse(
      await fs.readFile(path.join(root, "setting.json"), "utf8"),
    );
    expect(saved).toMatchObject({
      model: "new-model",
      apiKey: "autoclaw-secret",
      workspace: "/tmp/autoclaw-workspace",
    });
  });

  it("keeps an empty AutoClaw config editable without inventing a provider", async () => {
    const root = await createRoot();
    await fs.writeFile(path.join(root, "setting.json"), "{}\n");

    await expect(
      inspectAgentModelConfig({ agentId: "autoclaw", rootPath: root }),
    ).resolves.toMatchObject({
      status: "not-configured",
      model: null,
      provider: "platform-default",
      endpoint: null,
      credentialStatus: "missing",
      canSetModel: true,
    });
  });

  it("uses QClaw's own root with its verified OpenClaw-compatible model shape", async () => {
    const root = await createRoot();
    await fs.writeFile(
      path.join(root, "openclaw.json"),
      JSON.stringify({
        agents: {
          defaults: {
            model: {
              primary: "openai/old",
              fallbacks: ["anthropic/fallback"],
            },
          },
        },
        models: {
          providers: { openai: { apiKey: "qclaw-secret" } },
        },
      }),
    );

    await expect(
      inspectAgentModelConfig({ agentId: "qclaw", rootPath: root }),
    ).resolves.toMatchObject({
      agentId: "qclaw",
      adapter: "qclaw-openclaw-config-v1",
      model: "openai/old",
      fallbackModels: ["anthropic/fallback"],
      provider: "openai",
    });
    await updateAgentModelConfig(
      { agentId: "qclaw", rootPath: root, model: "anthropic/new" },
      { backupRoot: path.join(root, "backups") },
    );
    const saved = JSON.parse(
      await fs.readFile(path.join(root, "openclaw.json"), "utf8"),
    );
    expect(saved.agents.defaults.model.primary).toBe("anthropic/new");
    expect(saved.models.providers.openai.apiKey).toBe("qclaw-secret");
  });

  it("updates Hermes YAML model.default while preserving routing configuration", async () => {
    const root = await createRoot();
    await fs.writeFile(
      path.join(root, "config.yaml"),
      [
        "model:",
        "  default: openrouter/old-model",
        "  provider: openrouter",
        "  base_url: https://user:pass@openrouter.example/v1?token=secret",
        "  api_key: hermes-secret",
        "tools:",
        "  enabled: true",
        "",
      ].join("\n"),
    );

    const inspected = await inspectAgentModelConfig({
      agentId: "hermes",
      rootPath: root,
    });
    expect(inspected).toMatchObject({
      adapter: "hermes-yaml-v1",
      model: "openrouter/old-model",
      provider: "openrouter",
      endpoint: "https://openrouter.example/v1",
      credentialStatus: "configured",
      sourceRelativePath: "config.yaml",
      formattingMayChange: true,
    });
    expect(JSON.stringify(inspected)).not.toContain("hermes-secret");

    await updateAgentModelConfig(
      { agentId: "hermes", rootPath: root, model: "openrouter/new-model" },
      { backupRoot: path.join(root, "backups") },
    );
    const saved = await fs.readFile(path.join(root, "config.yaml"), "utf8");
    expect(saved).toContain("default: openrouter/new-model");
    expect(saved).toContain("api_key: hermes-secret");
    expect(saved).toContain("enabled: true");
  });

  it("preserves Hermes scalar model shape and rolls back a failed replacement", async () => {
    const root = await createRoot();
    const configPath = path.join(root, "config.yaml");
    const original = "model: openrouter/old\ntools:\n  enabled: true\n";
    await fs.writeFile(configPath, original);

    await updateAgentModelConfig(
      { agentId: "hermes", rootPath: root, model: "openrouter/new" },
      { backupRoot: path.join(root, "backups") },
    );
    expect(await fs.readFile(configPath, "utf8")).toContain(
      "model: openrouter/new",
    );

    const beforeFailure = await fs.readFile(configPath, "utf8");
    vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk full"));
    await expect(
      updateAgentModelConfig(
        { agentId: "hermes", rootPath: root, model: "openrouter/broken" },
        { backupRoot: path.join(root, "backups") },
      ),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_UPDATE_FAILED");
    expect(await fs.readFile(configPath, "utf8")).toBe(beforeFailure);
  });

  it("rolls Hermes back when semantic re-read does not observe the model", async () => {
    const root = await createRoot();
    const configPath = path.join(root, "config.yaml");
    const original = "model:\n  default: provider/old\n";
    await fs.writeFile(configPath, original);
    vi.spyOn(fs, "rename").mockResolvedValueOnce(undefined);

    await expect(
      updateAgentModelConfig(
        { agentId: "hermes", rootPath: root, model: "provider/new" },
        { backupRoot: path.join(root, "backups") },
      ),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_UPDATE_FAILED");
    expect(await fs.readFile(configPath, "utf8")).toBe(original);
  });

  it("keeps empty Hermes config editable and rejects a non-string model shape", async () => {
    const root = await createRoot();
    const configPath = path.join(root, "config.yaml");
    await fs.writeFile(configPath, "tools:\n  enabled: true\n");
    await expect(
      inspectAgentModelConfig({ agentId: "hermes", rootPath: root }),
    ).resolves.toMatchObject({
      status: "not-configured",
      model: null,
      provider: null,
      credentialStatus: "platform-managed",
    });

    await fs.writeFile(configPath, "model: 42\n");
    await expect(
      updateAgentModelConfig(
        { agentId: "hermes", rootPath: root, model: "provider/model" },
        { backupRoot: path.join(root, "backups") },
      ),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_INVALID");

    await fs.writeFile(configPath, 'model: ""\n');
    await expect(
      inspectAgentModelConfig({ agentId: "hermes", rootPath: root }),
    ).resolves.toMatchObject({ status: "not-configured", model: null });

    await fs.rm(configPath);
    await expect(
      updateAgentModelConfig(
        { agentId: "hermes", rootPath: root, model: "provider/created" },
        { backupRoot: path.join(root, "backups") },
      ),
    ).resolves.toMatchObject({
      status: "configured",
      model: "provider/created",
      backupPath: null,
    });
  });

  it("rejects malformed Qoder and Hermes files without exposing their content", async () => {
    const root = await createRoot();
    await fs.writeFile(path.join(root, "settings.json"), "{ qoder-secret");
    await fs.writeFile(path.join(root, "config.yaml"), "model: [hermes-secret");

    const qoder = await inspectAgentModelConfig({
      agentId: "qoder",
      rootPath: root,
    });
    const hermes = await inspectAgentModelConfig({
      agentId: "hermes",
      rootPath: root,
    });
    expect(qoder).toMatchObject({ status: "invalid", canSetModel: false });
    expect(hermes).toMatchObject({ status: "invalid", canSetModel: false });
    expect(JSON.stringify({ qoder, hermes })).not.toMatch(
      /qoder-secret|hermes-secret/,
    );
  });

  it("resolves and updates only CoPaw's active Agent workspace", async () => {
    const root = await createRoot();
    const workspace = path.join(root, "workspaces", "research-agent");
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify({
        agents: {
          active_agent: "research-agent",
          profiles: {
            "research-agent": { workspace_dir: "workspaces/research-agent" },
          },
        },
      }),
    );
    await fs.writeFile(
      path.join(workspace, "agent.json"),
      JSON.stringify({
        active_model: { provider_id: "dashscope", model: "qwen-old" },
        memory: { enabled: true },
      }),
    );

    await expect(
      inspectAgentModelConfig({ agentId: "copaw", rootPath: root }),
    ).resolves.toMatchObject({
      adapter: "copaw-active-agent-v1",
      model: "dashscope/qwen-old",
      provider: "dashscope",
      sourceRelativePath: "workspaces/research-agent/agent.json",
      credentialStatus: "platform-managed",
    });

    await updateAgentModelConfig(
      {
        agentId: "copaw",
        rootPath: root,
        model: "openai-compatible/gpt-new",
      },
      { backupRoot: path.join(root, "backups") },
    );
    const saved = JSON.parse(
      await fs.readFile(path.join(workspace, "agent.json"), "utf8"),
    );
    expect(saved.active_model).toEqual({
      provider_id: "openai-compatible",
      model: "gpt-new",
    });
    expect(saved.memory).toEqual({ enabled: true });

    await updateAgentModelConfig(
      { agentId: "copaw", rootPath: root, model: "gpt-newer" },
      { backupRoot: path.join(root, "backups") },
    );
    const updated = JSON.parse(
      await fs.readFile(path.join(workspace, "agent.json"), "utf8"),
    );
    expect(updated.active_model).toEqual({
      provider_id: "openai-compatible",
      model: "gpt-newer",
    });
  });

  it("rejects a CoPaw active workspace that escapes the platform root", async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify({
        agents: {
          active_agent: "escaped",
          profiles: { escaped: { workspace_dir: outside } },
        },
      }),
    );

    await expect(
      inspectAgentModelConfig({ agentId: "copaw", rootPath: root }),
    ).resolves.toMatchObject({
      status: "invalid",
      canSetModel: false,
      errorCode: "AGENT_MODEL_CONFIG_INVALID",
    });
    await expect(
      updateAgentModelConfig(
        { agentId: "copaw", rootPath: root, model: "provider/model" },
        { backupRoot: path.join(root, "backups") },
      ),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_INVALID");
  });

  it("creates CoPaw's canonical active Agent config and rolls back write failure", async () => {
    const root = await createRoot();
    const workspace = path.join(root, "workspaces", "default-agent");
    const targetPath = path.join(workspace, "agent.json");
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify({ agents: { active_agent: "default-agent" } }),
    );

    await expect(
      inspectAgentModelConfig({ agentId: "copaw", rootPath: root }),
    ).resolves.toMatchObject({
      status: "missing",
      sourceRelativePath: "workspaces/default-agent/agent.json",
      canSetModel: true,
    });
    await updateAgentModelConfig(
      { agentId: "copaw", rootPath: root, model: "provider/first" },
      { backupRoot: path.join(root, "backups") },
    );
    const original = await fs.readFile(targetPath, "utf8");

    vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk full"));
    await expect(
      updateAgentModelConfig(
        { agentId: "copaw", rootPath: root, model: "provider/second" },
        { backupRoot: path.join(root, "backups") },
      ),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_UPDATE_FAILED");
    expect(await fs.readFile(targetPath, "utf8")).toBe(original);
  });

  it("rejects an invalid CoPaw active Agent identity", async () => {
    const root = await createRoot();
    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify({ agents: { active_agent: "../escaped" } }),
    );

    await expect(
      inspectAgentModelConfig({ agentId: "copaw", rootPath: root }),
    ).resolves.toMatchObject({ status: "invalid", canSetModel: false });
  });

  it("handles incomplete CoPaw active_model state without inventing a provider", async () => {
    const root = await createRoot();
    const workspace = path.join(root, "workspaces", "incomplete");
    const targetPath = path.join(workspace, "agent.json");
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify({ agents: { active_agent: "incomplete" } }),
    );
    await fs.writeFile(
      targetPath,
      JSON.stringify({ active_model: { model: "orphan-model" } }),
    );
    await expect(
      inspectAgentModelConfig({ agentId: "copaw", rootPath: root }),
    ).resolves.toMatchObject({
      status: "configured",
      model: "orphan-model",
      provider: null,
      availableModels: ["orphan-model"],
    });

    await fs.writeFile(targetPath, JSON.stringify({ active_model: {} }));
    await expect(
      inspectAgentModelConfig({ agentId: "copaw", rootPath: root }),
    ).resolves.toMatchObject({
      status: "not-configured",
      model: null,
      availableModels: [],
    });
    await expect(
      updateAgentModelConfig(
        { agentId: "copaw", rootPath: root, model: "bare-model" },
        { backupRoot: path.join(root, "backups") },
      ),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_MODEL_INVALID");
  });

  it.runIf(process.platform !== "win32")(
    "rejects a CoPaw workspace symlink that escapes the platform root",
    async () => {
      const root = await createRoot();
      const outside = await createRoot();
      await fs.mkdir(path.join(root, "workspaces"), { recursive: true });
      await fs.symlink(outside, path.join(root, "workspaces", "linked"));
      await fs.writeFile(
        path.join(root, "config.json"),
        JSON.stringify({
          agents: {
            active_agent: "linked",
            profiles: { linked: { workspace_dir: "workspaces/linked" } },
          },
        }),
      );

      await expect(
        inspectAgentModelConfig({ agentId: "copaw", rootPath: root }),
      ).resolves.toMatchObject({
        status: "invalid",
        canSetModel: false,
      });
    },
  );
});
