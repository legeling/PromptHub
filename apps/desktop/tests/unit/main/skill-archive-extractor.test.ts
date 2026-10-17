/**
 * @vitest-environment node
 */
import fs from "fs/promises";
import os from "os";
import path from "path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractSkillZipArchive } from "../../../src/main/services/skill-archive-extractor";
import {
  MAX_SKILL_PACKAGE_DEPTH,
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_FILES,
} from "../../../src/main/services/skill-package-validation";

describe("Skill Zip extraction", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "prompthub-zip-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("extracts normalized bounded files", async () => {
    const archive = zipSync({
      "SKILL.md": strToU8("# Skill\n"),
      "scripts/run.ts": strToU8("run();\n"),
      ".git/config": strToU8("ignored\n"),
    });

    await extractSkillZipArchive(archive, tempDir);

    await expect(
      fs.readFile(path.join(tempDir, "SKILL.md"), "utf8"),
    ).resolves.toBe("# Skill\n");
    await expect(fs.stat(path.join(tempDir, ".git"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("extracts a complete selected Skill without counting unrelated repository files", async () => {
    const files: Record<string, Uint8Array> = {
      "skills-main/skills/.curated/meeting/SKILL.md": strToU8("# Meeting\n"),
      "skills-main/skills/.curated/meeting/reference/guide.md":
        strToU8("# Guide\n"),
      "skills-main/skills/.curated/meeting/assets/icon.bin": new Uint8Array([
        0, 128, 255,
      ]),
    };
    for (let i = 0; i <= MAX_SKILL_PACKAGE_FILES; i++)
      files[`skills-main/other/${i}.md`] = strToU8("other");
    await extractSkillZipArchive(zipSync(files), tempDir, {
      repositoryDirectory: "skills/.curated/meeting",
    });
    const target = path.join(tempDir, "skills-main/skills/.curated/meeting");
    expect(
      await fs.readFile(path.join(target, "reference/guide.md"), "utf8"),
    ).toBe("# Guide\n");
    expect(await fs.readFile(path.join(target, "assets/icon.bin"))).toEqual(
      Buffer.from([0, 128, 255]),
    );
    await expect(
      fs.stat(path.join(tempDir, "skills-main/other")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the selected package limit and rejects ambiguous or unsafe repository roots", async () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i <= MAX_SKILL_PACKAGE_FILES; i++)
      files[`repo/skills/meeting/${i}.md`] = strToU8("x");
    const options = { repositoryDirectory: "skills/meeting" };
    await expect(
      extractSkillZipArchive(zipSync(files), tempDir, options),
    ).rejects.toThrow(/too many files/);
    await expect(
      extractSkillZipArchive(
        zipSync({
          "repo/skills/meeting/SKILL.md": strToU8("# Skill"),
          "second/README.md": strToU8("other"),
        }),
        tempDir,
        options,
      ),
    ).rejects.toThrow(/one repository root/);
    await expect(
      extractSkillZipArchive(
        zipSync({
          "repo/skills/meeting/SKILL.md": strToU8("# Skill"),
          "repo/other/../../escape": strToU8("other"),
        }),
        tempDir,
        options,
      ),
    ).rejects.toThrow(/Path traversal/);
    expect(await fs.readdir(tempDir)).toEqual([]);
  });

  it("rejects traversal and case-insensitive duplicate paths", async () => {
    const traversal = zipSync({
      "../outside.txt": strToU8("outside"),
      "SKILL.md": strToU8("# Skill\n"),
    });
    const duplicate = zipSync({
      "SKILL.md": strToU8("# One\n"),
      "skill.md": strToU8("# Two\n"),
    });

    await expect(extractSkillZipArchive(traversal, tempDir)).rejects.toThrow(
      /Path traversal detected/,
    );
    await expect(extractSkillZipArchive(duplicate, tempDir)).rejects.toThrow(
      /duplicate path/i,
    );
  });

  it("rejects oversized decompressed entries before extraction", async () => {
    const archive = zipSync(
      {
        "SKILL.md": strToU8("# Skill\n"),
        "large.bin": new Uint8Array(MAX_SKILL_PACKAGE_FILE_BYTES + 1),
      },
      { level: 9 },
    );

    await expect(extractSkillZipArchive(archive, tempDir)).rejects.toThrow(
      /file size limit/,
    );
  });

  it("rejects archive inventories beyond the package file limit", async () => {
    const files: Record<string, Uint8Array> = {
      "SKILL.md": strToU8("# Skill\n"),
    };
    for (let index = 0; index < MAX_SKILL_PACKAGE_FILES; index += 1) {
      files[`files/${index}.txt`] = strToU8("x");
    }

    await expect(
      extractSkillZipArchive(zipSync(files), tempDir),
    ).rejects.toThrow(/too many files/);
  });

  it("rejects over-deep paths before writing archive entries", async () => {
    const tooDeepPath = `${Array.from(
      { length: MAX_SKILL_PACKAGE_DEPTH + 2 },
      (_, index) => `level-${index}`,
    ).join("/")}/g.txt`;
    const archive = zipSync({
      "SKILL.md": strToU8("# Skill\n"),
      [tooDeepPath]: strToU8("too deep"),
    });

    await expect(extractSkillZipArchive(archive, tempDir)).rejects.toThrow(
      /depth limit/,
    );
    await expect(fs.stat(path.join(tempDir, "a"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("extracts legitimate nested template paths within the package depth budget", async () => {
    const nestedPath = `${Array.from(
      { length: 12 },
      (_, index) => `level-${index}`,
    ).join("/")}/template.md`;
    const archive = zipSync({
      "SKILL.md": strToU8("# Skill\n"),
      [nestedPath]: strToU8("template\n"),
    });

    await extractSkillZipArchive(archive, tempDir);

    await expect(
      fs.readFile(path.join(tempDir, nestedPath), "utf8"),
    ).resolves.toBe("template\n");
  });
});
