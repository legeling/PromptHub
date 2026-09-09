import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RegistrySkill,
  SkillPackageOperationRequest,
  SkillPackageOperationResult,
} from "@prompthub/shared/types";
import { installWindowMocks } from "../../helpers/window";

const BASE_SKILL: RegistrySkill = {
  slug: "writer",
  name: "Writer",
  description: "Writer Skill",
  category: "general",
  author: "PromptHub",
  source_url: "https://gitea.example.com/team/skills.git",
  source_branch: "main",
  canonical_skill_path: "skills/writer/SKILL.md",
  tags: [],
  version: "1.0.0",
  content: "# Writer\n",
};

async function loadService() {
  return import("../../../src/renderer/services/skill-package-operation");
}

describe("renderer Skill package operation adapter", () => {
  beforeEach(() => {
    installWindowMocks({
      api: { skill: { runPackageOperation: vi.fn() } },
    });
  });

  it.each([
    {
      name: "complete Cloud package",
      skill: BASE_SKILL,
      files: [
        { path: "SKILL.md", content: "# Writer\n" },
        { path: "scripts/install.sh", content: "echo ok\n" },
      ],
      expected: {
        kind: "files",
        sourceUrl: BASE_SKILL.source_url,
        files: [
          { path: "SKILL.md", content: "# Writer\n" },
          { path: "scripts/install.sh", content: "echo ok\n" },
        ],
      },
    },
    {
      name: "local directory",
      skill: {
        ...BASE_SKILL,
        source_url: "/Users/me/skills/writer/",
        content_url: "/Users/me/skills/writer/SKILL.md",
      },
      expected: {
        kind: "local-directory",
        directory: "/Users/me/skills/writer",
      },
    },
    {
      name: "remote Zip",
      skill: {
        ...BASE_SKILL,
        package_url: "https://gitea.example.com/team/skills/archive/main.zip",
      },
      expected: {
        kind: "remote-zip",
        zipUrl: "https://gitea.example.com/team/skills/archive/main.zip",
      },
    },
    {
      name: "remote Git package",
      skill: BASE_SKILL,
      expected: {
        kind: "remote-git",
        repoUrl: "https://gitea.example.com/team/skills",
        branch: "main",
        directory: "skills/writer",
      },
    },
    {
      name: "GitHub raw package",
      skill: {
        ...BASE_SKILL,
        source_url: "https://github.com/acme/skills",
        source_branch: undefined,
        canonical_skill_path: undefined,
        content_url:
          "https://raw.githubusercontent.com/acme/skills/release/skills/writer/SKILL.md",
      },
      expected: {
        kind: "remote-git",
        repoUrl: "https://github.com/acme/skills",
        branch: "release",
        directory: "skills/writer",
      },
    },
    {
      name: "skills.sh multi-Skill Git package",
      skill: {
        ...BASE_SKILL,
        slug: "mattpocock-skills-grill-me",
        name: "Relentless interviewing",
        install_name: "grill-me",
        source_url: "https://github.com/mattpocock/skills",
        source_branch: undefined,
        canonical_skill_path: undefined,
        store_url: "https://skills.sh/mattpocock/skills/grill-me",
      },
      expected: {
        kind: "remote-git",
        repoUrl: "https://github.com/mattpocock/skills",
        skillName: "grill-me",
      },
    },
    {
      name: "single remote content",
      skill: {
        ...BASE_SKILL,
        source_url: "https://skills.example.com/writer",
        source_branch: undefined,
        canonical_skill_path: undefined,
        content_url: "https://skills.example.com/writer/SKILL.md",
      },
      expected: {
        kind: "content",
        sourceUrl: "https://skills.example.com/writer/SKILL.md",
        content: "# Resolved\n",
      },
    },
  ])(
    "builds the $name source without dropping package files",
    async (fixture) => {
      const { buildSkillPackageOperationSource } = await loadService();
      expect(
        buildSkillPackageOperationSource(
          fixture.skill,
          "# Resolved\n",
          fixture.files,
        ),
      ).toEqual(fixture.expected);
    },
  );

  it("returns an untrusted review and converts terminal failures to typed errors", async () => {
    const { resolveSkillPackageOperationResult, SkillPackageOperationError } =
      await loadService();
    const failureResult: SkillPackageOperationResult = {
      status: "blocked",
      operation: "update",
      report: {} as never,
      failure: {
        code: "SAFETY_BLOCKED",
        phase: "scanning",
        summary: "Blocked package",
      },
    };

    expect(() => resolveSkillPackageOperationResult(failureResult)).toThrow(
      SkillPackageOperationError,
    );
    try {
      resolveSkillPackageOperationResult(failureResult);
    } catch (error) {
      expect(error).toMatchObject({
        message: "Blocked package",
        failure: failureResult.failure,
      });
    }
    expect(
      resolveSkillPackageOperationResult({
        status: "cancelled",
        operation: "install",
      }),
    ).toEqual({ status: "cancelled" });
  });

  it("preserves completed and review-required result payloads", async () => {
    const { resolveSkillPackageOperationResult } = await loadService();
    const installed = { id: "skill-1", name: "writer" } as never;
    const review = {
      sourceKey: "source-writer",
      packageFingerprint: "c".repeat(64),
      report: {} as never,
    };

    expect(
      resolveSkillPackageOperationResult({
        status: "completed",
        operation: "install",
        skill: installed,
      }),
    ).toEqual({ status: "completed", skill: installed });
    expect(
      resolveSkillPackageOperationResult({
        status: "review-required",
        operation: "install",
        review,
      }),
    ).toEqual({ status: "review-required", review });
  });

  it("formats stable lifecycle failures without exposing raw diagnostics", async () => {
    const { formatSkillPackageOperationError, SkillPackageOperationError } =
      await loadService();
    const t = vi.fn((key: string) => `localized:${key}`);
    const error = new SkillPackageOperationError({
      code: "ROLLBACK_INCOMPLETE",
      phase: "rollback",
      summary: "disk path /private/secret",
    });

    expect(formatSkillPackageOperationError(error, t as never)).toBe(
      "localized:skill.packageFailure.rollbackIncomplete",
    );
    expect(
      formatSkillPackageOperationError(new Error("network down"), t as never),
    ).toBe("network down");
    expect(formatSkillPackageOperationError(404, t as never)).toBe("404");
    expect(
      new SkillPackageOperationError({
        code: "CONFLICT",
        phase: "applying",
        summary: "",
      }).message,
    ).toBe("CONFLICT");
  });

  it.each([
    ["git-unavailable", "skill.packageFailure.gitUnavailable"],
    ["git-http-fallback-failed", "skill.packageFailure.gitHttpFallbackFailed"],
  ] as const)(
    "formats the bounded transport reason %s",
    async (reason, key) => {
      const { formatSkillPackageOperationError, SkillPackageOperationError } =
        await loadService();
      const t = vi.fn(
        (translationKey: string) => `localized:${translationKey}`,
      );
      const error = new SkillPackageOperationError({
        code: "SOURCE_UNAVAILABLE",
        phase: "staging",
        reason,
        summary: "spawn git ENOENT at C:\\Users\\secret",
      });

      expect(formatSkillPackageOperationError(error, t as never)).toBe(
        `localized:${key}`,
      );
      expect(formatSkillPackageOperationError(error, t as never)).not.toContain(
        "ENOENT",
      );
    },
  );

  it("falls back to source URL for a single-content package", async () => {
    const { buildSkillPackageOperationSource } = await loadService();

    expect(
      buildSkillPackageOperationSource(
        {
          ...BASE_SKILL,
          source_url: "https://skills.example.com/writer/SKILL.md",
          source_branch: undefined,
          canonical_skill_path: undefined,
          content_url: undefined,
        },
        "# Writer\n",
        [],
      ),
    ).toEqual({
      kind: "content",
      sourceUrl: "https://skills.example.com/writer/SKILL.md",
      content: "# Writer\n",
    });
  });
});
