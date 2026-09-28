import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import {
  AgentSettingsRepository,
  createRendererPersistenceStore,
} from "@prompthub/core";
import {
  createSkillTestRuntime,
  invokeSkillIPC,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { getDatabase } from "../../src/main/database";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { getPlatformRootDir } from "../../src/main/services/skill-installer-utils";
import { getPlatformById } from "@prompthub/shared/constants/platforms";

let runtime: SkillTestRuntime | undefined;
afterEach(() => {
  runtime?.dispose();
  runtime = undefined;
});

function registerSettings(profile: string): void {
  registerSettingsIPC(getDatabase(), {
    rendererPersistence: createRendererPersistenceStore({
      rootPath: profile,
      encryption: {
        isEncryptionAvailable: () => false,
        encryptString: () => {
          throw new Error("No secrets in Agent tests");
        },
        decryptString: () => {
          throw new Error("No secrets in Agent tests");
        },
      },
    }),
  });
}

describe("Agent settings public IPC workflow", () => {
  it("shares explicit changes with CLI repository and installer, then clears and reopens", async () => {
    runtime = await createSkillTestRuntime();
    registerSettings(runtime.profile);
    const platform = getPlatformById("codex")!;
    const rootPath = path.join(runtime.root, "chosen-agent");
    await invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, {
      builtinAgentOverrides: { codex: { rootPath } },
    });
    expect(
      new AgentSettingsRepository(getDatabase()).read().builtinAgentOverrides,
    ).toEqual({ codex: { rootPath } });
    expect(getPlatformRootDir(platform)).toBe(rootPath);
    expect(await invokeSkillIPC(IPC_CHANNELS.SETTINGS_GET)).toMatchObject({
      builtinAgentOverrides: { codex: { rootPath } },
    });
    await invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, {
      builtinAgentOverrides: {},
    });
    const dbPath = path.join(runtime.profile, "data", "prompthub.db");
    expect(fs.existsSync(dbPath)).toBe(true);
    // Reopen a separate read connection: fixture.reopen intentionally seeds test installation roots.
    const { DatabaseAdapter } = await import("@prompthub/db");
    const reopened = new DatabaseAdapter(dbPath, { readOnly: true });
    try {
      expect(
        new AgentSettingsRepository(reopened).read().builtinAgentOverrides,
      ).toEqual({});
    } finally {
      reopened.close();
    }
    expect(await invokeSkillIPC(IPC_CHANNELS.SETTINGS_GET)).not.toHaveProperty(
      "customPlatformRootPaths",
    );
    expect(
      fs.existsSync(path.join(runtime.profile, "config/devices/agents.json")),
    ).toBe(false);
  });

  it("rejects retired keys and malformed current inputs without altering the persisted target", async () => {
    runtime = await createSkillTestRuntime();
    registerSettings(runtime.profile);
    const before = new AgentSettingsRepository(getDatabase()).read();
    await expect(
      invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, {
        customPlatformRootPaths: { codex: "/old" },
      }),
    ).rejects.toThrow(/requires data migration/);
    await expect(
      invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, {
        builtinAgentOverrides: null,
      }),
    ).rejects.toThrow();
    expect(new AgentSettingsRepository(getDatabase()).read()).toEqual(before);
  });
  it("converts a legacy renderer snapshot through registered migration IPC before acknowledging cleanup", async () => {
    runtime = await createSkillTestRuntime();
    const marker = path.join(
      runtime.profile,
      "data/operations/migrations/renderer-persistence-v1.json",
    );
    fs.rmSync(marker); // Fixture models a profile whose renderer has not been imported.
    registerSettings(runtime.profile);
    const rootPath = path.join(runtime.root, "legacy-agent");
    const result = await invokeSkillIPC(
      IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE,
      {
        settings: JSON.stringify({
          state: { customPlatformRootPaths: { codex: rootPath } },
          version: 11,
        }),
      },
    );
    expect(result).toMatchObject({ status: "migrated" });
    expect(
      await invokeSkillIPC(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_GET),
    ).toMatchObject({
      settings: { builtinAgentOverrides: { codex: { rootPath } } },
    });
    expect(
      fs.existsSync(path.join(runtime.profile, "config/devices/agents.json")),
    ).toBe(false);
    expect(
      getDatabase()
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("customPlatformRootPaths"),
    ).toBeNull();
  });
});
