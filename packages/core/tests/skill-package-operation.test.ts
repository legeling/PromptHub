import { describe, expect, it } from "vitest";
import {
  buildSkillPackageOperationKey,
  buildStoreInstallSkillData,
  buildStoreUpdateSkillData,
  sanitizeSkillPackageDiagnostic,
  sanitizeSkillPackageSourceUrl,
  validateSkillPackageOperationRequest,
} from "../src/skills/package-operation";
import type {
  RegistrySkill,
  Skill,
  SkillPackageOperationRequest,
} from "@prompthub/shared/types";
import {
  MAX_SKILL_PACKAGE_DEPTH,
  MAX_SKILL_PACKAGE_PATH_LENGTH,
  MAX_SKILL_PACKAGE_TEXT_BYTES,
} from "@prompthub/shared/constants/skill-package";

const registrySkill: RegistrySkill = {
  slug: "writer",
  name: "Writer",
  description: "Write better",
  category: "general",
  author: "PromptHub",
  source_id: "source-writer",
  source_url: "https://gitea.example.com/team/skills",
  source_branch: "main",
  source_directory: "skills/writer",
  tags: ["writing"],
  version: "2.0.0",
  content: "# Writer",
};

function installRequest(
  overrides: Partial<SkillPackageOperationRequest> = {},
): SkillPackageOperationRequest {
  return {
    operation: "install",
    registrySkill,
    source: {
      kind: "remote-git",
      repoUrl: registrySkill.source_url,
      branch: registrySkill.source_branch,
      directory: registrySkill.source_directory,
    },
    content: registrySkill.content,
    ...overrides,
  } as SkillPackageOperationRequest;
}

function expectInvalidRequest(
  overrides: Partial<SkillPackageOperationRequest>,
  pattern: RegExp,
): void {
  expect(() =>
    validateSkillPackageOperationRequest(installRequest(overrides)),
  ).toThrow(pattern);
}

describe("Skill package operation policy", () => {
  it("validates install/update requests and rejects malformed package files", () => {
    expect(validateSkillPackageOperationRequest(installRequest())).toEqual(
      installRequest(),
    );
    expect(() =>
      validateSkillPackageOperationRequest({
        ...installRequest(),
        operation: "update",
      }),
    ).toThrow(/skillId/);
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          source: {
            kind: "files",
            sourceUrl: "https://cloud.example.com/writer",
            files: [{ path: "../secret", content: "no" }],
          },
        }),
      ),
    ).toThrow(/relative package path/);
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          approvedPackageFingerprint: "not-sha256",
        }),
      ),
    ).not.toThrow();
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          source: {
            kind: "files",
            sourceUrl: "https://cloud.example.com/writer",
            files: [{ path: "README.md", content: "missing entrypoint" }],
          },
        }),
      ),
    ).toThrow(/SKILL\.md/);
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          source: {
            kind: "files",
            sourceUrl: "https://cloud.example.com/writer",
            files: [
              { path: "SKILL.md", content: "one" },
              { path: "skill.md", content: "two" },
            ],
          },
        }),
      ),
    ).toThrow(/duplicate/i);
    expect(
      validateSkillPackageOperationRequest(
        installRequest({
          source: {
            kind: "remote-git",
            repoUrl: registrySkill.source_url,
            skillName: "writer",
          },
        }),
      ).source,
    ).toEqual(
      expect.objectContaining({ kind: "remote-git", skillName: "writer" }),
    );
    expect(() =>
      validateSkillPackageOperationRequest({
        ...installRequest(),
        source: {
          kind: "remote-git",
          repoUrl: registrySkill.source_url,
          skillName: 42,
        },
      }),
    ).toThrow(/skillName/);
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({ source: { kind: "unknown" } as never }),
      ),
    ).toThrow(/source.kind/);
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          registrySkill: { ...registrySkill, source_id: 42 } as never,
        }),
      ),
    ).toThrow(/registrySkill.source_id/);
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          source: {
            kind: "remote-git",
            repoUrl: registrySkill.source_url,
            branch: { unexpected: true } as never,
          },
        }),
      ),
    ).toThrow(/source.branch/);
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({ markAsBuiltin: "yes" as never }),
      ),
    ).toThrow(/markAsBuiltin/);
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({ safetyScan: { aiConfig: { apiKey: 42 } } as never }),
      ),
    ).not.toThrow();
    expect(
      validateSkillPackageOperationRequest(
        installRequest({ safetyScan: { mode: "disabled" } }),
      ).safetyScan,
    ).toEqual({ mode: "disabled" });
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          source: {
            kind: "files",
            sourceUrl: "https://cloud.example.com/writer",
            files: [
              { path: "SKILL.md", content: "# Writer" },
              ...Array.from({ length: 500 }, (_, index) => ({
                path: `files/${index}.txt`,
                content: "x",
              })),
            ],
          },
        }),
      ),
    ).toThrow(/exceeds 500 entries/);
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          source: {
            kind: "files",
            sourceUrl: "https://cloud.example.com/writer",
            files: [
              { path: "SKILL.md", content: "# Writer" },
              {
                path: `${Array.from(
                  { length: MAX_SKILL_PACKAGE_DEPTH + 2 },
                  (_, index) => `level-${index}`,
                ).join("/")}/g.txt`,
                content: "too deep",
              },
            ],
          },
        }),
      ),
    ).toThrow(/depth limit/);
  });

  it("accepts legitimate nested template files within the package depth budget", () => {
    const nestedPath = `${Array.from(
      { length: 12 },
      (_, index) => `level-${index}`,
    ).join("/")}/template.md`;

    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          source: {
            kind: "files",
            sourceUrl: "https://cloud.example.com/writer",
            files: [
              { path: "SKILL.md", content: "# Writer" },
              { path: nestedPath, content: "template\n" },
            ],
          },
        }),
      ),
    ).not.toThrow();
  });

  it("accepts Skill markdown larger than ordinary metadata fields", () => {
    const content = `# Writer\n${"x".repeat(20_000)}`;

    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          registrySkill: { ...registrySkill, content },
          source: {
            kind: "content",
            sourceUrl: registrySkill.source_url,
            content,
          },
          content,
        }),
      ),
    ).not.toThrow();
  });

  it("enforces metadata, package text, and list budgets independently", () => {
    expectInvalidRequest(
      { registrySkill: { ...registrySkill, slug: "x".repeat(16_385) } },
      /slug exceeds the text length limit/,
    );
    expectInvalidRequest(
      {
        registrySkill: {
          ...registrySkill,
          description: "x".repeat(16_385),
        },
      },
      /description exceeds the text length limit/,
    );
    expectInvalidRequest({ content: "" }, /content must be a non-empty string/);
    const oversizedContent = "x".repeat(MAX_SKILL_PACKAGE_TEXT_BYTES + 1);
    expectInvalidRequest(
      { content: oversizedContent },
      /content exceeds the package text size limit/,
    );
    expectInvalidRequest(
      { registrySkill: { ...registrySkill, tags: "writing" as never } },
      /bounded string array/,
    );
    expectInvalidRequest(
      {
        registrySkill: {
          ...registrySkill,
          tags: Array.from({ length: 501 }, () => "tag"),
        },
      },
      /bounded string array/,
    );
    expectInvalidRequest(
      { registrySkill: { ...registrySkill, tags: [1] as never } },
      /tags item must be a string/,
    );
  });

  it.each([
    "",
    "/absolute.txt",
    "C:/drive.txt",
    "bad\0name.txt",
    "./file.txt",
    "dir//file.txt",
  ])("rejects unsafe file package path %s", (filePath) => {
    expectInvalidRequest(
      {
        source: {
          kind: "files",
          sourceUrl: "https://cloud.example.com/writer",
          files: [
            { path: "SKILL.md", content: "# Writer" },
            { path: filePath, content: "bad" },
          ],
        },
      },
      /safe relative package path/,
    );
  });

  it("rejects file path, content, and aggregate package boundary violations", () => {
    expectInvalidRequest(
      {
        source: {
          kind: "files",
          sourceUrl: "https://cloud.example.com/writer",
          files: [],
        },
      },
      /at least one package file/,
    );
    expectInvalidRequest(
      {
        source: {
          kind: "files",
          sourceUrl: "https://cloud.example.com/writer",
          files: [
            { path: "SKILL.md", content: "# Writer" },
            {
              path: "x".repeat(MAX_SKILL_PACKAGE_PATH_LENGTH + 1),
              content: "too long",
            },
          ],
        },
      },
      /path length limit/,
    );
    expectInvalidRequest(
      {
        source: {
          kind: "files",
          sourceUrl: "https://cloud.example.com/writer",
          files: [
            { path: "SKILL.md", content: "# Writer" },
            { path: "invalid.txt", content: 7 as never },
          ],
        },
      },
      /file.content must be a string/,
    );
    expectInvalidRequest(
      {
        source: {
          kind: "files",
          sourceUrl: "https://cloud.example.com/writer",
          files: [
            { path: "SKILL.md", content: "# Writer" },
            {
              path: "large.txt",
              content: "x".repeat(MAX_SKILL_PACKAGE_TEXT_BYTES),
            },
          ],
        },
      },
      /package text size limit/,
    );
  });

  it("accepts every supported source adapter and rejects malformed source contracts", () => {
    const sources: SkillPackageOperationRequest["source"][] = [
      { kind: "remote-zip", zipUrl: "https://example.com/writer.zip" },
      {
        kind: "content",
        sourceUrl: "https://example.com/SKILL.md",
        content: "# Writer",
      },
      { kind: "local-directory", directory: "/tmp/writer" },
      {
        kind: "files",
        sourceUrl: "https://example.com/package",
        files: [{ path: "SKILL.md", content: "# Writer" }],
      },
    ];
    for (const source of sources) {
      expect(() =>
        validateSkillPackageOperationRequest(installRequest({ source })),
      ).not.toThrow();
    }
    expectInvalidRequest(
      { source: { kind: "remote-zip", zipUrl: "" } },
      /source.zipUrl/,
    );
    expectInvalidRequest(
      { source: { kind: "local-directory", directory: "" } },
      /source.directory/,
    );
    expectInvalidRequest({ source: null as never }, /source must be an object/);
  });

  it("rejects malformed top-level, registry, operation, and safety inputs", () => {
    expect(() => validateSkillPackageOperationRequest(null)).toThrow(
      /request must be an object/,
    );
    expect(() => validateSkillPackageOperationRequest([])).toThrow(
      /request must be an object/,
    );
    expectInvalidRequest({ operation: "remove" as never }, /operation must be/);
    expectInvalidRequest({ registrySkill: null as never }, /must be an object/);
    expectInvalidRequest({ registrySkill: [] as never }, /must be an object/);
    expect(() => validateSkillPackageOperationRequest(installRequest({ safetyScan: null as never }))).not.toThrow();
    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          safetyScan: {
            aiConfig: {
              provider: "openai",
              apiProtocol: "openai",
              apiKey: "key",
              apiUrl: "https://example.com/v1",
              model: "model",
            },
          },
          approvedPackageFingerprint: "a".repeat(64),
        }),
      ),
    ).not.toThrow();

    expect(() =>
      validateSkillPackageOperationRequest(
        installRequest({
          registrySkill: { ...registrySkill, content: "" },
          safetyScan: {},
          approvedPackageFingerprint: "a".repeat(64),
        }),
      ),
    ).not.toThrow();
  });

  it("builds deterministic in-flight keys without leaking source credentials", () => {
    const request = installRequest({
      registrySkill: { ...registrySkill, source_id: undefined },
      source: {
        kind: "remote-git",
        repoUrl: "https://user:secret@gitea.example.com/team/skills?token=abc",
        branch: "main",
        directory: "skills/writer",
      },
    });

    const key = buildSkillPackageOperationKey(request);

    expect(key).toMatch(/^install:/);
    expect(key).not.toContain("secret");
    expect(key).not.toContain("token");
    expect(buildSkillPackageOperationKey(request)).toBe(key);
    const otherSelectedSkill = installRequest({
      registrySkill: { ...registrySkill, source_id: undefined },
      source: {
        kind: "remote-git",
        repoUrl: "https://user:secret@gitea.example.com/team/skills?token=abc",
        branch: "main",
        skillName: "reviewer",
      },
    });
    const selectedWriter = installRequest({
      registrySkill: { ...registrySkill, source_id: undefined },
      source: {
        kind: "remote-git",
        repoUrl: "https://user:secret@gitea.example.com/team/skills?token=abc",
        branch: "main",
        skillName: "writer",
      },
    });
    expect(buildSkillPackageOperationKey(otherSelectedSkill)).not.toBe(
      buildSkillPackageOperationKey(selectedWriter),
    );
    const updateRequest = installRequest({
      operation: "update",
      skillId: "skill-writer",
    });
    const alternateSourceUpdate = installRequest({
      operation: "update",
      skillId: "skill-writer",
      registrySkill: { ...registrySkill, source_id: "alternate-source" },
    });
    expect(buildSkillPackageOperationKey(alternateSourceUpdate)).toBe(
      buildSkillPackageOperationKey(updateRequest),
    );
    expect(
      sanitizeSkillPackageSourceUrl(
        "https://user:secret@gitea.example.com/team/skills?token=abc#readme",
      ),
    ).toBe("https://gitea.example.com/team/skills");
    expect(sanitizeSkillPackageSourceUrl("not a url ? token=abc")).toBe(
      "notaurltokenabc",
    );
  });

  it("builds deterministic keys for every source kind and target shape", () => {
    const sources: SkillPackageOperationRequest["source"][] = [
      {
        kind: "remote-git",
        repoUrl: "https://gitea.example.com/team/skills",
      },
      { kind: "remote-zip", zipUrl: "https://example.com/writer.zip" },
      {
        kind: "content",
        sourceUrl: "https://example.com/SKILL.md",
        content: "# Writer",
      },
      {
        kind: "files",
        sourceUrl: "https://example.com/package",
        files: [{ path: "SKILL.md", content: "# Writer" }],
      },
      { kind: "local-directory", directory: "/tmp/writer" },
    ];

    const keys = sources.map((source) =>
      buildSkillPackageOperationKey(
        installRequest({
          skillId: " imported-writer ",
          registrySkill: { ...registrySkill, source_id: undefined },
          source,
        }),
      ),
    );

    expect(new Set(keys)).toHaveLength(sources.length);
    expect(
      keys.every((key) => key.startsWith("install:imported-writer:")),
    ).toBe(true);
  });

  it("builds install and update metadata from one canonical policy", () => {
    const installData = buildStoreInstallSkillData({
      registrySkill,
      content: "---\nname: Writer\n---\n# Body\n",
      contentHash: "content-hash",
      directoryFingerprint: "directory-fingerprint",
      sourceId: registrySkill.source_id!,
      now: 100,
    });
    const installedSkill = {
      ...installData,
      id: "skill-writer",
      created_at: 1,
      updated_at: 1,
      source_label: "Private Gitea",
      is_builtin: false,
    } as Skill;

    expect(installData).toMatchObject({
      name: "writer",
      source_id: "source-writer",
      installed_version: "2.0.0",
      installed_directory_fingerprint: "directory-fingerprint",
      fingerprint_algorithm: "skill-package-sha256-v1",
      source_binding_state: "bound",
    });
    expect(
      buildStoreUpdateSkillData({
        installedSkill,
        registrySkill,
        content: "# Updated",
        contentHash: "updated-hash",
        directoryFingerprint: "updated-directory",
        sourceId: registrySkill.source_id!,
        now: 200,
        markAsBuiltin: false,
      }),
    ).toMatchObject({
      source_label: "Private Gitea",
      is_builtin: false,
      installed_version: "2.0.0",
      installed_directory_fingerprint: "updated-directory",
      updated_from_store_at: 200,
    });

    const namedInstall = buildStoreInstallSkillData({
      registrySkill: { ...registrySkill, install_name: "writer-pro" },
      content: "# Writer",
      contentHash: "content-hash",
      directoryFingerprint: "directory-fingerprint",
      sourceId: registrySkill.source_id!,
      now: 300,
    });
    expect(namedInstall.name).toBe("writer-pro");

    const sourceFallbackUpdate = buildStoreUpdateSkillData({
      installedSkill: {
        ...installedSkill,
        source_label: undefined,
        is_builtin: false,
      },
      registrySkill: { ...registrySkill, source_label: "Registry" },
      content: "# Updated",
      contentHash: "updated-hash",
      directoryFingerprint: "updated-directory",
      sourceId: registrySkill.source_id!,
      now: 400,
      markAsBuiltin: true,
    });
    expect(sourceFallbackUpdate).toMatchObject({
      source_label: "Registry",
      is_builtin: true,
    });
  });

  it("uses staged SKILL.md metadata without overwriting user-owned tags", () => {
    const stagedContent = [
      "---",
      "name: writer",
      "description: Package description",
      "version: 3.1.0",
      "author: Package Author",
      "tags: [package, reviewed]",
      "compatibility: [claude, codex]",
      "---",
      "# Updated package",
    ].join("\n");
    const input = {
      registrySkill: { ...registrySkill, version: "source" },
      content: stagedContent,
      contentHash: "updated-hash",
      directoryFingerprint: "updated-directory",
      sourceId: registrySkill.source_id!,
      now: 500,
    };

    const installData = buildStoreInstallSkillData(input);
    const updateData = buildStoreUpdateSkillData({
      ...input,
      installedSkill: {
        ...installData,
        id: "skill-writer",
        tags: ["my-private-tag"],
        is_favorite: false,
        created_at: 1,
        updated_at: 1,
      } as Skill,
      markAsBuiltin: false,
    });

    expect(installData).toMatchObject({
      description: "Package description",
      version: "3.1.0",
      installed_version: "3.1.0",
      author: "Package Author",
      original_tags: ["package", "reviewed"],
      compatibility: ["claude", "codex"],
    });
    expect(updateData).toMatchObject({
      description: "Package description",
      version: "3.1.0",
      installed_version: "3.1.0",
      author: "Package Author",
      original_tags: ["package", "reviewed"],
      compatibility: ["claude", "codex"],
    });
    expect(updateData).not.toHaveProperty("tags");
  });

  it("keeps the current version when source frontmatter is malformed", () => {
    const installed = {
      ...buildStoreInstallSkillData({
        registrySkill,
        content: "# Writer",
        contentHash: "content-hash",
        directoryFingerprint: "directory-fingerprint",
        sourceId: registrySkill.source_id!,
        now: 600,
      }),
      id: "skill-writer",
      version: "2.4.0",
      installed_version: undefined,
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    } as Skill;

    const updateData = buildStoreUpdateSkillData({
      registrySkill: { ...registrySkill, version: "source" },
      content: "---\ntags: [unterminated\n---\n# Writer",
      contentHash: "updated-hash",
      directoryFingerprint: "updated-directory",
      sourceId: registrySkill.source_id!,
      now: 700,
      installedSkill: installed,
      markAsBuiltin: false,
    });

    expect(updateData).toMatchObject({
      description: registrySkill.description,
      version: "2.4.0",
      installed_version: "2.4.0",
    });
  });

  it("redacts URL credentials and bounded secret query values", () => {
    const diagnostic = sanitizeSkillPackageDiagnostic(
      "fetch https://user:pass@example.com/repo?token=abc&mode=raw password=hunter2",
    );

    expect(diagnostic).not.toContain("user:pass");
    expect(diagnostic).not.toContain("abc");
    expect(diagnostic).not.toContain("hunter2");
    expect(diagnostic.length).toBeLessThanOrEqual(300);
    expect(
      sanitizeSkillPackageDiagnostic(
        new Error("fetch https://user:pass@example.com/repo?key=secret"),
      ),
    ).toBe("fetch https://[REDACTED]@example.com/repo?key=[REDACTED]");
    expect(sanitizeSkillPackageDiagnostic(null)).toBe("");
  });
});
