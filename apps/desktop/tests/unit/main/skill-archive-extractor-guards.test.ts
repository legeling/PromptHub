/**
 * @vitest-environment node
 */
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SKILL_PACKAGE_PATH_LENGTH,
  MAX_SKILL_PACKAGE_TOTAL_BYTES,
} from "@prompthub/shared/constants/skill-package";

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unzipSync: vi.fn(),
  isPathWithin: vi.fn(() => true),
}));

vi.mock("fs/promises", () => ({
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}));

vi.mock("fflate", () => ({
  unzipSync: mocks.unzipSync,
}));

vi.mock("path", async (original) => {
  const actual = await original<typeof import("path")>();
  const relative = (from: string, to: string): string =>
    mocks.isPathWithin() ? actual.relative(from, to) : `..${actual.sep}outside`;
  return { ...actual, relative, default: { ...actual, relative } };
});

import { extractSkillZipArchive } from "../../../src/main/services/skill-archive-extractor";

type ArchiveFilter = (file: { name: string; originalSize: number }) => boolean;

function runFilter(
  options: { filter: ArchiveFilter },
  entries: Array<{ name: string; originalSize?: number }>,
) {
  const files: Record<string, { byteLength: number }> = {};
  for (const entry of entries) {
    if (
      options.filter({
        name: entry.name,
        originalSize: entry.originalSize ?? 1,
      })
    ) {
      files[entry.name] = { byteLength: entry.originalSize ?? 1 };
    }
  }
  return files;
}

describe("Skill Zip extraction defensive guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPathWithin.mockReturnValue(true);
  });

  it.each([
    "",
    "a".repeat(MAX_SKILL_PACKAGE_PATH_LENGTH + 1),
    "bad\0name.txt",
    "/absolute.txt",
    "C:/drive.txt",
    "./file.txt",
    "dir//file.txt",
  ])("rejects an invalid central-directory path: %s", async (entryName) => {
    mocks.unzipSync.mockImplementation((_bytes, options) =>
      runFilter(options, [{ name: entryName }]),
    );

    await expect(
      extractSkillZipArchive(new Uint8Array(), "/extract"),
    ).rejects.toThrow(/Path traversal detected/);
  });

  it("normalizes Windows separators and ignores directory entries", async () => {
    mocks.unzipSync.mockImplementation((_bytes, options) =>
      runFilter(options, [
        { name: "scripts/", originalSize: 0 },
        { name: "scripts\\run.ts" },
      ]),
    );

    await extractSkillZipArchive(new Uint8Array(), "/extract");

    expect(mocks.writeFile).toHaveBeenCalledWith(
      path.resolve("/extract", "scripts", "run.ts"),
      expect.objectContaining({ byteLength: 1 }),
    );
  });

  it("rejects an archive whose advertised files exceed the total budget", async () => {
    const fileSize = Math.ceil(MAX_SKILL_PACKAGE_TOTAL_BYTES / 6);
    mocks.unzipSync.mockImplementation((_bytes, options) =>
      runFilter(
        options,
        Array.from({ length: 6 }, (_, index) => ({
          name: `file-${index}.bin`,
          originalSize: fileSize,
        })),
      ),
    );

    await expect(
      extractSkillZipArchive(new Uint8Array(), "/extract"),
    ).rejects.toThrow(/total size limit/);
  });

  it("rechecks the actual expanded byte budget", async () => {
    const fileSize = Math.ceil(MAX_SKILL_PACKAGE_TOTAL_BYTES / 6);
    mocks.unzipSync.mockImplementation((_bytes, options) => {
      const files = runFilter(
        options,
        Array.from({ length: 6 }, (_, index) => ({
          name: `file-${index}.bin`,
          originalSize: 0,
        })),
      );
      for (const file of Object.values(files)) file.byteLength = fileSize;
      return files;
    });

    await expect(
      extractSkillZipArchive(new Uint8Array(), "/extract"),
    ).rejects.toThrow(/total size limit/);
  });

  it("rejects output paths that fail the final containment check", async () => {
    mocks.unzipSync.mockImplementation((_bytes, options) =>
      runFilter(options, [{ name: "SKILL.md" }]),
    );
    mocks.isPathWithin.mockReturnValue(false);

    await expect(
      extractSkillZipArchive(new Uint8Array(), "/extract"),
    ).rejects.toThrow(/Path traversal detected/);
  });

  it("rejects an expanded entry that was not accepted by the filter", async () => {
    mocks.unzipSync.mockReturnValue({
      "unvalidated.txt": { byteLength: 1 },
    });

    await expect(
      extractSkillZipArchive(new Uint8Array(), "/extract"),
    ).rejects.toThrow(/was not validated/);
  });
});
