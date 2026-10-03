import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RendererHydratedState } from "@prompthub/core";
import {
  collectLegacyRendererPersistence,
  migrateRendererPersistence,
  resetRendererPersistenceForTests,
} from "../../../src/renderer/services/renderer-persistence";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";

const canonical: RendererHydratedState = {
  migrationComplete: true,
  settings: { language: "fr" },
  marketplaceSources: {
    skill: [
      {
        id: "skill-source",
        name: "Skill Source",
        type: "git-repo",
        url: "https://github.com/example/skills.git",
        enabled: true,
        order: 0,
        createdAt: 1,
      },
    ],
    mcp: [],
    plugin: [],
  },
  recoveryPaths: ["/safe/recovery"],
  selfHostedDeviceId: "desktop-device-1",
  indexedDbMigrationDone: true,
};

function installApi(status: "migrated" | "already-complete") {
  const rendererPersistence = {
    migrate: vi.fn(async () => ({
      status,
      redactLegacyKeys:
        status === "migrated"
          ? [
              "prompthub-settings",
              "skill-store",
              "prompthub-self-hosted-device-id",
            ]
          : [],
    })),
    get: vi.fn(async () => canonical),
    replaceSettings: vi.fn(async (_settings: Record<string, unknown>) => true),
    replaceSources: vi.fn(async () => true),
    replaceRecoveryPaths: vi.fn(async () => true),
    getOrCreateDeviceId: vi.fn(async () => "desktop-device-1"),
    isIndexedDbMigrationDone: vi.fn(async () => true),
    markIndexedDbMigrationDone: vi.fn(async () => true),
  };
  window.api.settings = {
    ...(window.api.settings ?? {}),
    rendererPersistence,
  };
  return rendererPersistence;
}

function expectNoDurableSkillSourcesInRendererStorage(): void {
  const raw = localStorage.getItem("skill-store");
  if (!raw) return;
  expect(JSON.parse(raw).state.customStoreSources).toBeUndefined();
}

beforeEach(() => {
  localStorage.clear();
  resetRendererPersistenceForTests();
});

afterEach(() => {
  resetRendererPersistenceForTests();
  if (window.api.settings) delete window.api.settings.rendererPersistence;
});

describe("renderer persistence bridge", () => {
  it("does not duplicate SQLite-owned prompt preferences in renderer settings", async () => {
    const api = installApi("already-complete");
    await migrateRendererPersistence();
    useSettingsStore.setState({
      startupFolderMode: "pinned",
      pinnedStartFolderId: "folder-pinned",
      lastActiveFolderId: "folder-last",
      backupGuideCollapsed: true,
      language: "ja",
    });
    await Promise.resolve();
    expect(api.replaceSettings).toHaveBeenCalledOnce();
    const [settings] = api.replaceSettings.mock.calls[0];
    expect(settings).toMatchObject({ language: "ja" });
    for (const key of ["startupFolderMode", "pinnedStartFolderId", "lastActiveFolderId", "backupGuideCollapsed"]) {
      expect(settings).not.toHaveProperty(key);
    }
  });

  it("collects only the explicitly routed legacy keys", () => {
    localStorage.setItem("prompthub-settings", "settings");
    localStorage.setItem("skill-store", "skills");
    localStorage.setItem("unrelated", "keep");
    expect(collectLegacyRendererPersistence(localStorage)).toMatchObject({
      settings: "settings",
      skillStore: "skills",
    });
    expect(
      Object.values(collectLegacyRendererPersistence(localStorage)),
    ).not.toContain("keep");
  });

  it("redacts migrated copies, restores canonical sources, and persists later changes", async () => {
    localStorage.setItem("prompthub-settings", "legacy-settings");
    localStorage.setItem("skill-store", "legacy-skills");
    localStorage.setItem(
      "prompthub-self-hosted-device-id",
      "legacy-device",
    );
    const api = installApi("migrated");

    await migrateRendererPersistence();

    expect(api.migrate).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: "legacy-settings",
        skillStore: "legacy-skills",
        selfHostedDeviceId: "legacy-device",
      }),
    );
    expect(localStorage.getItem("prompthub-settings")).toBeNull();
    expectNoDurableSkillSourcesInRendererStorage();
    expect(useSkillStore.getState().customStoreSources).toEqual(
      canonical.marketplaceSources.skill,
    );

    useSkillStore.setState({
      customStoreSources: [
        ...canonical.marketplaceSources.skill,
        {
          id: "second-source",
          name: "Second",
          type: "marketplace-json",
          url: "https://example.test/marketplace.json",
          enabled: true,
          order: 1,
          createdAt: 2,
        },
      ],
    });
    useSettingsStore.setState({ language: "de" });
    await Promise.resolve();

    expect(api.replaceSources).toHaveBeenCalledWith(
      "skill",
      expect.arrayContaining([
        expect.objectContaining({ id: "second-source" }),
      ]),
    );
    expect(api.replaceSettings).toHaveBeenCalledWith(
      expect.objectContaining({ language: "de" }),
    );
  });

  it("restores canonical sources after browser storage is cleared", async () => {
    installApi("already-complete");
    localStorage.clear();
    useSkillStore.setState({ customStoreSources: [] });

    await migrateRendererPersistence();

    expect(useSkillStore.getState().customStoreSources).toEqual(
      canonical.marketplaceSources.skill,
    );
    expectNoDurableSkillSourcesInRendererStorage();
  });
});
