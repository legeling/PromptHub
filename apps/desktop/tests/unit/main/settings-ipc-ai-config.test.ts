import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { coreAIConfigService } from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import {
  createSkillTestRuntime,
  invokeSkillIPC,
  type SkillTestRuntime,
} from "../../integration/helpers/skill-runtime";
import { getDatabase } from "../../../src/main/database";
import { registerSettingsIPC } from "../../../src/main/ipc/settings.ipc";
import { settingsApi } from "../../../src/preload/api/settings";

let runtime: SkillTestRuntime | undefined;
afterEach(() => {
  runtime?.dispose();
  runtime = undefined;
});

describe("settings IPC and shared AI configuration", () => {
  it("writes through preload, shares the SQL owner with CLI service and clears after reopen", async () => {
    runtime = await createSkillTestRuntime();
    registerSettingsIPC(getDatabase());
    const provider = {
      id: "provider-work",
      provider: "openai",
      apiProtocol: "openai",
      apiKey: "synthetic-provider-secret",
      apiUrl: "https://api.example.test/v1",
    };
    await invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, {
      language: "fr",
      aiProviders: [provider],
    });
    expect(coreAIConfigService.read().providers).toEqual([
      expect.objectContaining(provider),
    ]);
    const model = coreAIConfigService.addModel({
      provider: provider.id,
      model: "fixture-model",
    });
    expect(await settingsApi.get()).toMatchObject({
      language: "fr",
      aiModels: [
        expect.objectContaining({ id: model.id, apiKey: provider.apiKey }),
      ],
    });
    expect(
      JSON.stringify(getDatabase().prepare("SELECT * FROM settings").all()),
    ).not.toContain(provider.apiKey);
    for (const name of ["app", "providers", "ai-models", "sync-providers"])
      expect(
        fs.existsSync(path.join(runtime.profile, `config/${name}.json`)),
      ).toBe(false);
    await invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, {
      aiProviders: [],
      aiModels: [],
    });
    await runtime.reopen();
    registerSettingsIPC(getDatabase());
    expect(coreAIConfigService.read()).toMatchObject({
      providers: [],
      models: [],
    });
    expect(await settingsApi.get()).toMatchObject({
      aiProviders: [],
      aiModels: [],
    });
  });

  it("does not expose or replace the master password through ordinary settings", async () => {
    runtime = await createSkillTestRuntime();
    registerSettingsIPC(getDatabase());
    getDatabase()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("master_password", JSON.stringify({ hash: "fixture-hash" }));
    expect(await settingsApi.get()).not.toHaveProperty("master_password");
    await expect(
      invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, { master_password: null }),
    ).rejects.toThrow(/owner/);
    expect(
      getDatabase()
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("master_password"),
    ).toEqual({ value: JSON.stringify({ hash: "fixture-hash" }) });
  });
});
