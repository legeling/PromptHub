import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Skill } from "@prompthub/shared/types";
import { computeDirectoryFingerprint } from "@prompthub/shared/utils/skill-identity";
import {
  buildSkillSyncUpdateFromRepo,
  computeRepoDirectoryFingerprint,
  hasMetadataChanges,
  syncFrontmatterToRepo,
} from "../../../src/main/services/skill-repo-sync";
import { SkillInstaller } from "../../../src/main/services/skill-installer";

const baseSkill: Skill = {
  id: "skill-1",
  name: "write",
  description: "Old description",
  instructions: "---\ndescription: Old description\n---\n\n# Write",
  content: "---\ndescription: Old description\n---\n\n# Write",
  protocol_type: "skill",
  version: "1.0.0",
  author: "Local",
  tags: ["general"],
  compatibility: ["claude"],
  is_favorite: false,
  currentVersion: 1,
  created_at: Date.now(),
  updated_at: Date.now(),
};

// ---------------------------------------------------------------------------
// buildSkillSyncUpdateFromRepo
// ---------------------------------------------------------------------------

describe("buildSkillSyncUpdateFromRepo", () => {
  it("builds update payload from latest SKILL.md frontmatter", () => {
    const next = buildSkillSyncUpdateFromRepo(
      baseSkill,
      [
        "---",
        "description: Updated description",
        "version: 2.0.0",
        "author: Repo Author",
        "tags: [writing, local]",
        "compatibility: [claude, cursor]",
        "---",
        "",
        "# Write",
        "",
        "Updated body.",
      ].join("\n"),
      "repo-fingerprint-1",
    );

    expect(next).toMatchObject({
      description: "Updated description",
      version: "2.0.0",
      author: "Repo Author",
      tags: ["writing", "local"],
      compatibility: ["claude", "cursor"],
      directory_fingerprint: "repo-fingerprint-1",
    });
    expect(next?.instructions).toContain("Updated body.");
    expect(next?.content).toContain("Updated body.");
  });

  it("returns null when repo content matches current stored fields", () => {
    const next = buildSkillSyncUpdateFromRepo(
      baseSkill,
      baseSkill.content || "",
      baseSkill.directory_fingerprint,
    );
    expect(next).toBeNull();
  });

  it("detects only description change", () => {
    const md = [
      "---",
      "description: New desc",
      "version: 1.0.0",
      "author: Local",
      "tags: [general]",
      "---",
      "",
      "# Write",
    ].join("\n");
    const next = buildSkillSyncUpdateFromRepo(baseSkill, md);
    expect(next).not.toBeNull();
    expect(next?.description).toBe("New desc");
    // version/author unchanged → should not appear in the update
    expect(next).not.toHaveProperty("version");
    expect(next).not.toHaveProperty("author");
  });

  it("detects only body/instructions change", () => {
    const md = [
      "---",
      "description: Old description",
      "version: 1.0.0",
      "author: Local",
      "tags: [general]",
      "---",
      "",
      "# Completely new body",
    ].join("\n");
    const next = buildSkillSyncUpdateFromRepo(baseSkill, md);
    expect(next).not.toBeNull();
    expect(next?.instructions).toContain("Completely new body");
    expect(next?.content).toContain("Completely new body");
    // metadata unchanged
    expect(next).not.toHaveProperty("description");
  });

  it("handles SKILL.md without frontmatter", () => {
    const md = "# Just a body\n\nNo frontmatter here.";
    const next = buildSkillSyncUpdateFromRepo(baseSkill, md);
    // Body differs from stored instructions → expect instructions update
    expect(next).not.toBeNull();
    expect(next?.instructions).toBeDefined();
  });

  it("handles empty SKILL.md content", () => {
    const next = buildSkillSyncUpdateFromRepo(baseSkill, "");
    // parseSkillMd returns null for empty string → sanitized instructions is
    // the raw empty string, which differs from baseSkill.instructions →
    // instructions/content are included in the update
    expect(next).not.toBeNull();
    expect(next?.instructions).toBe("");
    expect(next?.content).toBe("");
  });

  it("preserves tags from DB when SKILL.md has no tags", () => {
    const md = ["---", "description: Same desc", "---", "", "# Same body"].join(
      "\n",
    );
    const skillWithTags: Skill = {
      ...baseSkill,
      tags: ["custom-tag"],
      instructions: md,
      content: md,
      description: "Same desc",
    };
    const next = buildSkillSyncUpdateFromRepo(skillWithTags, md);
    // No changes → null
    expect(next).toBeNull();
  });

  it("returns fingerprint-only update when repo files change outside SKILL.md", () => {
    const next = buildSkillSyncUpdateFromRepo(
      baseSkill,
      baseSkill.content || "",
      "new-directory-fingerprint",
    );

    expect(next).toEqual({
      directory_fingerprint: "new-directory-fingerprint",
    });
  });
});

describe("computeRepoDirectoryFingerprint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes a fingerprint from full repo file bytes", async () => {
    vi.spyOn(SkillInstaller, "readLocalRepoFileBuffersByPath").mockResolvedValue([
      {
        path: "SKILL.md",
        data: new Uint8Array([35, 32, 87, 114, 105, 116, 101, 114, 10]),
      },
      {
        path: "assets/icon.png",
        data: new Uint8Array([137, 80, 78, 71, 0, 1]),
      },
      {
        path: ".prompthub/source.json",
        data: new Uint8Array([123, 125]),
      },
    ]);

    const fingerprint = await computeRepoDirectoryFingerprint("/repo/path");

    expect(SkillInstaller.readLocalRepoFileBuffersByPath).toHaveBeenCalledWith(
      "/repo/path",
    );
    expect(fingerprint).toBe(
      computeDirectoryFingerprint([
        {
          path: "SKILL.md",
          data: new Uint8Array([35, 32, 87, 114, 105, 116, 101, 114, 10]),
          isDirectory: false,
        },
        {
          path: "assets/icon.png",
          data: new Uint8Array([137, 80, 78, 71, 0, 1]),
          isDirectory: false,
        },
        {
          path: ".prompthub/source.json",
          data: new Uint8Array([123, 125]),
          isDirectory: false,
        },
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// hasMetadataChanges
// ---------------------------------------------------------------------------

describe("hasMetadataChanges", () => {
  it("returns true when description is present in data", () => {
    expect(hasMetadataChanges({ description: "new" })).toBe(true);
  });

  it("returns true when author is present", () => {
    expect(hasMetadataChanges({ author: "Alice" })).toBe(true);
  });

  it("returns true when name is present", () => {
    expect(hasMetadataChanges({ name: "new-name" })).toBe(true);
  });

  it("returns true when tags is present", () => {
    expect(hasMetadataChanges({ tags: ["a"] })).toBe(true);
  });

  it("returns true when version is present", () => {
    expect(hasMetadataChanges({ version: "2.0.0" })).toBe(true);
  });

  it("returns true even when description is explicitly undefined (key exists)", () => {
    // Object.prototype.hasOwnProperty checks key existence, not truthiness
    expect(hasMetadataChanges({ description: undefined })).toBe(true);
  });

  it("returns false when only instructions is present", () => {
    expect(hasMetadataChanges({ instructions: "new body" })).toBe(false);
  });

  it("returns false when only content is present", () => {
    expect(hasMetadataChanges({ content: "new content" })).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(hasMetadataChanges({})).toBe(false);
  });

  it("returns true when metadata + instructions are both present", () => {
    expect(
      hasMetadataChanges({ description: "new", instructions: "body" }),
    ).toBe(true);
  });

  it("returns false when only non-metadata fields are present", () => {
    expect(
      hasMetadataChanges({
        instructions: "x",
        content: "y",
        is_favorite: true,
        icon_emoji: "rocket",
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// syncFrontmatterToRepo
// ---------------------------------------------------------------------------

describe("syncFrontmatterToRepo", () => {
  const existingSkillMd = [
    "---",
    "name: write",
    "description: Old description",
    "version: 1.0.0",
    "author: Local",
    "tags: [general]",
    "compatibility: prompthub",
    "---",
    "",
    "# Write Skill",
    "",
    "This is the body content.",
  ].join("\n");

  const updatedSkill: Skill = {
    ...baseSkill,
    description: "Updated via EditSkillModal",
    author: "New Author",
  };

  beforeEach(() => {
    vi.spyOn(SkillInstaller, "readLocalRepoFilesByPath").mockResolvedValue([
      {
        path: "SKILL.md",
        content: existingSkillMd,
        isDirectory: false,
      },
    ]);

    vi.spyOn(SkillInstaller, "writeLocalRepoFileByPath").mockResolvedValue(
      undefined,
    );

    vi.spyOn(SkillInstaller, "exportAsSkillMd");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rewrites SKILL.md with updated metadata and preserved body", async () => {
    await syncFrontmatterToRepo(updatedSkill, "/repo/path");

    expect(SkillInstaller.readLocalRepoFilesByPath).toHaveBeenCalledWith(
      "/repo/path",
    );
    expect(SkillInstaller.exportAsSkillMd).toHaveBeenCalledWith({
      name: "write",
      description: "Updated via EditSkillModal",
      version: "1.0.0",
      author: "New Author",
      tags: ["general"],
      instructions: expect.stringContaining("# Write Skill"),
      compatibility: "prompthub",
      license: undefined,
    });
    expect(SkillInstaller.writeLocalRepoFileByPath).toHaveBeenCalledWith(
      "/repo/path",
      "SKILL.md",
      expect.any(String),
    );
  });

  it("does nothing when repoPath is undefined", async () => {
    await syncFrontmatterToRepo(updatedSkill, undefined);
    expect(SkillInstaller.readLocalRepoFilesByPath).not.toHaveBeenCalled();
  });

  it("does nothing when repoPath is null", async () => {
    await syncFrontmatterToRepo(updatedSkill, null);
    expect(SkillInstaller.readLocalRepoFilesByPath).not.toHaveBeenCalled();
  });

  it("does nothing when repoPath is empty string", async () => {
    await syncFrontmatterToRepo(updatedSkill, "");
    expect(SkillInstaller.readLocalRepoFilesByPath).not.toHaveBeenCalled();
  });

  it("returns silently when readLocalRepoFilesByPath throws", async () => {
    vi.mocked(SkillInstaller.readLocalRepoFilesByPath).mockRejectedValue(
      new Error("ENOENT"),
    );
    // Should not throw
    await expect(
      syncFrontmatterToRepo(updatedSkill, "/nonexistent"),
    ).resolves.toBeUndefined();
    expect(SkillInstaller.writeLocalRepoFileByPath).not.toHaveBeenCalled();
  });

  it("returns silently when no SKILL.md found in repo", async () => {
    vi.mocked(SkillInstaller.readLocalRepoFilesByPath).mockResolvedValue([
      { path: "README.md", content: "readme", isDirectory: false },
    ]);
    await syncFrontmatterToRepo(updatedSkill, "/repo/path");
    expect(SkillInstaller.writeLocalRepoFileByPath).not.toHaveBeenCalled();
  });

  it("handles SKILL.md with no frontmatter (body only)", async () => {
    vi.mocked(SkillInstaller.readLocalRepoFilesByPath).mockResolvedValue([
      {
        path: "SKILL.md",
        content: "# Just body content",
        isDirectory: false,
      },
    ]);

    await syncFrontmatterToRepo(updatedSkill, "/repo/path");

    // Body should be the entire content (no frontmatter to strip)
    expect(SkillInstaller.exportAsSkillMd).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "# Just body content",
      }),
    );
    expect(SkillInstaller.writeLocalRepoFileByPath).toHaveBeenCalled();
  });

  it("handles skill with null description (converts to undefined)", async () => {
    const skillNullDesc: Skill = {
      ...baseSkill,
      description: null as unknown as string,
    };

    await syncFrontmatterToRepo(skillNullDesc, "/repo/path");

    expect(SkillInstaller.exportAsSkillMd).toHaveBeenCalledWith(
      expect.objectContaining({
        description: undefined,
      }),
    );
  });

  it("handles skill with empty tags (defaults to [])", async () => {
    const skillNoTags: Skill = {
      ...baseSkill,
      tags: undefined,
    };

    await syncFrontmatterToRepo(skillNoTags, "/repo/path");

    expect(SkillInstaller.exportAsSkillMd).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [],
      }),
    );
  });

  it("finds SKILL.md case-insensitively", async () => {
    vi.mocked(SkillInstaller.readLocalRepoFilesByPath).mockResolvedValue([
      {
        path: "skill.md",
        content: existingSkillMd,
        isDirectory: false,
      },
    ]);

    await syncFrontmatterToRepo(updatedSkill, "/repo/path");

    // The toLowerCase() comparison should match "skill.md"
    expect(SkillInstaller.writeLocalRepoFileByPath).toHaveBeenCalled();
  });

  it("skips directory entries named SKILL.md", async () => {
    vi.mocked(SkillInstaller.readLocalRepoFilesByPath).mockResolvedValue([
      {
        path: "SKILL.md",
        content: "",
        isDirectory: true,
      },
    ]);

    await syncFrontmatterToRepo(updatedSkill, "/repo/path");
    // existingContent would be undefined → should not write
    expect(SkillInstaller.writeLocalRepoFileByPath).not.toHaveBeenCalled();
  });

  it("preserves compatibility and license from original frontmatter", async () => {
    const mdWithExtras = [
      "---",
      "name: write",
      "description: Old description",
      "version: 1.0.0",
      "author: Local",
      "license: MIT",
      "tags: [general]",
      "compatibility: claude, cursor",
      "---",
      "",
      "# Body",
    ].join("\n");

    vi.mocked(SkillInstaller.readLocalRepoFilesByPath).mockResolvedValue([
      {
        path: "SKILL.md",
        content: mdWithExtras,
        isDirectory: false,
      },
    ]);

    await syncFrontmatterToRepo(updatedSkill, "/repo/path");

    expect(SkillInstaller.exportAsSkillMd).toHaveBeenCalledWith(
      expect.objectContaining({
        compatibility: "claude, cursor",
        license: "MIT",
      }),
    );
  });

  it("falls back to default compatibility when original has none", async () => {
    const mdNoCompat = [
      "---",
      "name: write",
      "description: Old description",
      "---",
      "",
      "# Body",
    ].join("\n");

    vi.mocked(SkillInstaller.readLocalRepoFilesByPath).mockResolvedValue([
      {
        path: "SKILL.md",
        content: mdNoCompat,
        isDirectory: false,
      },
    ]);

    await syncFrontmatterToRepo(updatedSkill, "/repo/path");

    // compatibility should be undefined (not set by original), exportAsSkillMd
    // will default to "prompthub" internally
    expect(SkillInstaller.exportAsSkillMd).toHaveBeenCalledWith(
      expect.objectContaining({
        compatibility: undefined,
      }),
    );
  });
});
