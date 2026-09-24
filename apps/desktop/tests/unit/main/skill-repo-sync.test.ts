import { afterEach, describe, expect, it, vi } from "vitest";

import type { Skill } from "@prompthub/shared/types";
import {
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import {
  buildSkillSyncUpdateFromRepo,
  computeRepoDirectoryFingerprint,
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
      original_tags: ["writing", "local"],
      compatibility: ["claude", "cursor"],
      directory_fingerprint: "repo-fingerprint-1",
    });
    // Frontmatter (source) tags must not overwrite the user/DB tag set.
    expect(next).not.toHaveProperty("tags");
    expect(next?.tags).toBeUndefined();
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
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    });
  });

  it("preserves full SKILL.md content above the generic import field limit", () => {
    const largeBody = `# Large Skill\n\n${"Use this long package instruction.\n".repeat(600)}`;
    const skillMd = [
      "---",
      "description: Large package skill",
      "version: 2.0.0",
      "---",
      "",
      largeBody,
    ].join("\n");

    expect(skillMd.length).toBeGreaterThan(10_000);

    const next = buildSkillSyncUpdateFromRepo(baseSkill, skillMd);

    expect(next?.instructions).toBe(skillMd);
    expect(next?.content).toBe(skillMd);
    expect(next?.instructions?.length).toBe(skillMd.length);
  });
});

describe("computeRepoDirectoryFingerprint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes a fingerprint from full repo file bytes", async () => {
    vi.spyOn(
      SkillInstaller,
      "readLocalRepoFileBuffersByPath",
    ).mockResolvedValue([
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
      computeSkillPackageFingerprintV1Sync([
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
      ]).fingerprint,
    );
  });
});
