import { DatabaseAdapter, SettingsDB } from "@prompthub/db";
import "../../../packages/core/tests/helpers/settings-keyring";
import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { closeDatabase, resetRuntimePaths } from "@prompthub/core";
import { execCli, makeTempRoot, withDataDir } from "./helpers/cli-harness";

const roots: string[] = [];
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function readPersistedAI(root: string) {
  const database = new DatabaseAdapter(
    path.join(root, "user-data/data/prompthub.db"),
  );
  try {
    const settings = new SettingsDB(database);
    return {
      providers: settings.get("aiProviders"),
      models: settings.get("aiModels"),
      modelRouteDefaults: settings.get("modelRouteDefaults"),
    };
  } finally {
    database.close();
  }
}

it("clears only the selected route and deletes a provider profile without deleting self-contained models", async () => {
  const root = makeTempRoot(roots);
  const prefix = withDataDir(root);
  const created = [];
  for (const name of ["first", "second"]) {
    const provider = await execCli([
      ...prefix,
      "ai",
      "provider-add",
      "--provider",
      "openai",
      "--name",
      name,
      "--api-key",
      "synthetic-key",
      "--api-url",
      "https://example.invalid/v1",
    ]);
    expect(provider.exitCode, provider.joinedStderr).toBe(0);
    const model = await execCli([
      ...prefix,
      "ai",
      "model-add",
      "--provider",
      provider.json.id,
      "--model",
      name,
    ]);
    expect(model.exitCode, model.joinedStderr).toBe(0);
    created.push({ providerId: provider.json.id, modelId: model.json.id });
  }
  for (const [route, model] of [
    ["mainText", created[0].modelId],
    ["fastText", created[1].modelId],
  ]) {
    expect(
      (await execCli([...prefix, "ai", "route-set", route, model])).exitCode,
    ).toBe(0);
  }
  const cleared = await execCli([...prefix, "ai", "route-clear", "mainText"]);
  expect(cleared.exitCode, cleared.joinedStderr).toBe(0);
  expect(cleared.json.modelRouteDefaults.mainText).toBeUndefined();
  expect(cleared.json.modelRouteDefaults.fastText).toBe(created[1].modelId);
  expect(
    (
      await execCli([
        ...prefix,
        "ai",
        "route-set",
        "mainText",
        created[0].modelId,
      ])
    ).exitCode,
  ).toBe(0);
  const deleted = await execCli([
    ...prefix,
    "ai",
    "provider-delete",
    created[0].providerId,
  ]);
  expect(deleted.exitCode, deleted.joinedStderr).toBe(0);
  closeDatabase();
  resetRuntimePaths();
  const persisted = readPersistedAI(root);
  expect(persisted.providers).toMatchObject([{ id: created[1].providerId }]);
  expect(persisted.models).toMatchObject([
    { id: created[0].modelId },
    { id: created[1].modelId },
  ]);
  expect(persisted.modelRouteDefaults).toEqual({
    mainText: created[0].modelId,
    fastText: created[1].modelId,
  });
  const before = readPersistedAI(root);
  expect(
    (await execCli([...prefix, "ai", "provider-delete", "missing-provider"]))
      .exitCode,
  ).toBe(3);
  expect(
    (await execCli([...prefix, "ai", "route-clear", "invalid-route"])).exitCode,
  ).toBe(2);
  expect(readPersistedAI(root)).toEqual(before);
  expect(
    fs.existsSync(path.join(root, "user-data/config/ai-models.json")),
  ).toBe(false);
});
