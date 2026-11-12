import { afterEach, beforeEach, expect, it } from "vitest";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import {
  createSkillTestRuntime,
  invokeSkillIPC,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { FolderDB, getDatabase, PromptDB } from "../../src/main/database";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { registerImageIPC } from "../../src/main/ipc/image.ipc";
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

it("retains video classification, tags and ordered reference image bytes after reopen", async () => {
  registerImageIPC();
  const references = [
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh1sAAAAASUVORK5CYII=",
    "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  ];
  const images: string[] = [];
  for (const source of references) {
    const name = await invokeSkillIPC(IPC_CHANNELS.IMAGE_SAVE_BUFFER, Buffer.from(source, "base64"));
    if (typeof name !== "string") throw new Error("Reference image was not saved");
    images.push(name);
  }
  const tags = ["cinematic", "landscape"];
  const created = await promptApi.create({
    title: "Camera move", userPrompt: "Slow dolly out.", promptType: "video", tags, images,
  });
  await promptApi.update(created.id, { title: "Opening shot" });
  await runtime.reopen();
  registerDomain();
  registerImageIPC();
  expect(await promptApi.get(created.id)).toMatchObject({ title: "Opening shot", promptType: "video", tags, images });
  for (const [index, name] of images.entries()) {
    expect(await invokeSkillIPC(IPC_CHANNELS.IMAGE_READ_BASE64, name)).toBe(references[index]);
  }
  expect(await promptApi.getAll()).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, promptType: "video" })]));
});
