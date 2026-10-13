import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { FolderDB, getDatabase, PromptDB } from "../../src/main/database";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { promptApi } from "../../src/preload/api/prompt";
import { versionApi } from "../../src/preload/api/version";

let runtime: SkillTestRuntime;
function registerDomain(): void {
  const database = getDatabase();
  registerPromptIPC(new PromptDB(database), new FolderDB(database), database);
}
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerDomain();
});
afterEach(() => runtime?.dispose());

// Only Electron transport/native homes are substituted; preload, IPC, DB,
// canonical publication, filesystem and close/reopen are real.
it("saves and reopens a system-only Prompt through preload, preserving rejected edits (#225)", async () => {
  const created = await promptApi.create({
    title: "System policy",
    systemPrompt: "Only output JSON. 中文 🦌",
    userPrompt: "",
  });
  expect(await promptApi.get(created.id)).toMatchObject({
    title: "System policy",
    systemPrompt: "Only output JSON. 中文 🦌",
    userPrompt: "",
  });
  await promptApi.update(created.id, { title: "Renamed policy" });
  const before = await promptApi.get(created.id);
  const history = await versionApi.getAll(created.id);
  await expect(
    promptApi.update(created.id, {
      title: "Must not save",
      systemPrompt: " \n\t ",
    }),
  ).rejects.toThrow("At least one");
  await expect(
    promptApi.create({ title: "Empty", userPrompt: " \n " }),
  ).rejects.toThrow("At least one");
  expect(await promptApi.get(created.id)).toEqual(before);
  expect(await versionApi.getAll(created.id)).toEqual(history);
  await runtime.reopen();
  registerDomain();
  expect(await promptApi.get(created.id)).toEqual(before);
  expect(await versionApi.getAll(created.id)).toEqual(history);
  expect(await promptApi.getAll()).toHaveLength(1);
});
