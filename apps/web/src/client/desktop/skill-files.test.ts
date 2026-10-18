import { expect, it } from "vitest";
import { createHostedSkillFiles } from "./skill-files";
import { managedSkillFilesRevision } from "@prompthub/shared/utils/managed-skill-files";
import type { SkillFileSnapshot } from "@prompthub/shared/types";

it("edits only the selected text, retains binary siblings and refuses stale writes instead of retrying", async () => {
  let files: SkillFileSnapshot[] = [
    { relativePath: "SKILL.md", content: "# Initial" },
    { relativePath: "assets/icon.bin", content: "AP8D", encoding: "base64" },
  ];
  const writes: unknown[] = [];
  const request = async <T>(_path: string, init?: RequestInit): Promise<T> => {
    if (!init) return structuredClone(files) as T; // Replaces HTTP only; server CAS has real route tests.
    const value = JSON.parse(String(init.body));
    writes.push(value);
    if (value.revision !== managedSkillFilesRevision(files))
      throw new Error("Skill package changed during editing; reload and retry");
    files = value.files;
    return {} as T;
  };
  const bridge = createHostedSkillFiles(request);
  expect(await bridge.listLocalFiles("writer")).toEqual([
    { path: "SKILL.md", isDirectory: false, size: 9 },
    { path: "assets/icon.bin", isDirectory: false, size: 3 },
  ]);
  expect(await bridge.readLocalFile("writer", "SKILL.md")).toMatchObject({
    content: "# Initial",
    encoding: "text",
  });
  await bridge.writeLocalFile("writer", "SKILL.md", "# Saved 👋");
  expect(files).toEqual([
    { relativePath: "SKILL.md", content: "# Saved 👋", encoding: "utf8" },
    { relativePath: "assets/icon.bin", content: "AP8D", encoding: "base64" },
  ]);
  files = [
    { relativePath: "SKILL.md", content: "# Another user tab" },
    files[1],
  ];
  await bridge.listLocalFiles("writer"); // A list refresh must not rebase the open draft.
  await expect(
    bridge.writeLocalFile("writer", "SKILL.md", "# stale"),
  ).rejects.toThrow("changed during editing");
  expect(files[0].content).toBe("# Another user tab");
  expect(writes).toHaveLength(2);
  expect(await bridge.readLocalFile("writer", "assets/icon.bin")).toMatchObject(
    { encoding: "placeholder", content: "" },
  );
  await expect(
    bridge.writeLocalFile("writer", "assets/icon.bin", "text"),
  ).rejects.toThrow("text files");
});
