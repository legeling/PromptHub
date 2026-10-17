/** @vitest-environment node */
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { saveSkillExportFile } from "../../../src/main/services/skill-export-save";

const dialog = vi.hoisted(() => ({ showSaveDialog: vi.fn() }));
vi.mock("electron", () => ({ dialog, app: { getPath: () => os.tmpdir() } }));
let root = "";
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "skill-export-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

it("reports saved only after exact bytes are published, replacing the selected file", async () => {
  const target = path.join(root, "writer.zip");
  await writeFile(target, "previous export");
  dialog.showSaveDialog.mockResolvedValue({
    canceled: false,
    filePath: target,
  });
  const data = new Uint8Array([80, 75, 0, 255, 42]);
  expect(
    await saveSkillExportFile({
      fileName: "writer.zip",
      data,
      extension: "zip",
    }),
  ).toEqual({ status: "saved", fileName: "writer.zip" });
  expect(new Uint8Array(await readFile(target))).toEqual(data);
  expect(await readdir(root)).toEqual(["writer.zip"]);
});

it("does not create a file when the save dialog is canceled", async () => {
  dialog.showSaveDialog.mockResolvedValue({ canceled: true });
  expect(
    await saveSkillExportFile({
      fileName: "writer.md",
      data: new Uint8Array([42]),
      extension: "md",
    }),
  ).toEqual({ status: "canceled" });
  expect(await readdir(root)).toEqual([]);
});

it("propagates a write failure without reporting success or leaving a partial export", async () => {
  dialog.showSaveDialog.mockResolvedValue({
    canceled: false,
    filePath: path.join(root, "missing", "writer.md"),
  });
  await expect(
    saveSkillExportFile({
      fileName: "writer.md",
      data: new Uint8Array([42]),
      extension: "md",
    }),
  ).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
});
