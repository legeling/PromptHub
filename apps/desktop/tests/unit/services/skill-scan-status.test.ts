import { describe, expect, it } from "vitest";
import type { ScannedSkill, Skill } from "@prompthub/shared/types";
import { computeDirectoryFingerprint } from "@prompthub/shared/utils/skill-identity";
import {
  getSkillScanStatus,
  matchScannedSkillToLibrary,
} from "../../../src/renderer/services/skill-scan-status";

function librarySkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "library-writer",
    name: "writer",
    description: "Library writer",
    instructions: "# Writer",
    content: "# Writer",
    protocol_type: "skill",
    author: "PromptHub",
    local_repo_path: "/prompthub/skills/writer",
    source_url: "https://example.com/skills/writer",
    directory_fingerprint: "fingerprint-writer",
    tags: [],
    is_favorite: false,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

function scannedSkill(overrides: Partial<ScannedSkill> = {}): ScannedSkill {
  return {
    name: "writer",
    description: "Scanned writer",
    author: "PromptHub",
    tags: [],
    instructions: "# Writer",
    filePath: "/agent/skills/writer/SKILL.md",
    localPath: "/agent/skills/writer",
    platforms: ["Claude Code"],
    installMode: "copy",
    ...overrides,
  };
}

describe("skill scan status matrix", () => {
  it("matches My Skills by scanned local path, symlink target path, or directory fingerprint", () => {
    const pathSkill = librarySkill({
      id: "by-path",
      local_repo_path: "/agent/skills/writer",
      directory_fingerprint: undefined,
    });
    expect(matchScannedSkillToLibrary(scannedSkill(), [pathSkill])?.id).toBe(
      "by-path",
    );

    const symlinkTargetSkill = librarySkill({
      id: "by-symlink-target",
      local_repo_path: "/prompthub/library/writer",
      directory_fingerprint: undefined,
    });
    expect(
      matchScannedSkillToLibrary(
        scannedSkill({
          installMode: "symlink",
          symlinkTargetPath: "/prompthub/library/writer",
        }),
        [symlinkTargetSkill],
      )?.id,
    ).toBe("by-symlink-target");

    const fingerprintSkill = librarySkill({
      id: "by-fingerprint",
      local_repo_path: "/different/path",
      source_url: undefined,
      directory_fingerprint: "same-content",
    });
    expect(
      matchScannedSkillToLibrary(
        scannedSkill({ directory_fingerprint: "same-content" }),
        [fingerprintSkill],
      )?.id,
    ).toBe("by-fingerprint");
  });

  it("does not use same display name as a managed identity", () => {
    const sameNameDifferentIdentity = librarySkill({
      id: "same-name-different-identity",
      name: "writer",
      local_repo_path: "/library/another-writer",
      source_url: "https://example.com/another/writer",
      directory_fingerprint: "different-fingerprint",
    });

    expect(
      getSkillScanStatus(scannedSkill(), [sameNameDifferentIdentity], {
        surface: "agent",
      }),
    ).toMatchObject({
      managedSkill: null,
      isInMySkills: false,
      isExternalInstall: true,
      installBadge: "external",
    });
  });

  it("keeps scanned Python-cache variants matched to My Skills by fingerprint", () => {
    const cleanFingerprint = computeDirectoryFingerprint([
      { path: "SKILL.md", content: "# Writer\n", isDirectory: false },
      {
        path: "scripts/run.py",
        content: "print('write')\n",
        isDirectory: false,
      },
    ]);
    const scannedFingerprint = computeDirectoryFingerprint([
      { path: "SKILL.md", content: "# Writer\n", isDirectory: false },
      {
        path: "scripts/run.py",
        content: "print('write')\n",
        isDirectory: false,
      },
      {
        path: "scripts/__pycache__/run.cpython-312.pyc",
        data: new Uint8Array([1, 2, 3]),
        isDirectory: false,
      },
    ]);

    expect(scannedFingerprint).toBe(cleanFingerprint);
    expect(
      getSkillScanStatus(
        scannedSkill({ directory_fingerprint: scannedFingerprint }),
        [
          librarySkill({
            local_repo_path: "/different/path",
            source_url: undefined,
            directory_fingerprint: cleanFingerprint,
          }),
        ],
        { surface: "agent" },
      ),
    ).toMatchObject({
      isInMySkills: true,
      isExternalInstall: false,
      installBadge: "copy",
    });
  });

  it.each([
    {
      name: "unmanaged project copy",
      scanned: scannedSkill({ installMode: "copy" }),
      library: [],
      expected: {
        isInMySkills: false,
        isExternalInstall: true,
        installBadge: "external",
      },
    },
    {
      name: "unmanaged agent copy",
      scanned: scannedSkill({ installMode: "copy" }),
      library: [],
      options: { surface: "agent" as const },
      expected: {
        isInMySkills: false,
        isExternalInstall: true,
        installBadge: "external",
      },
    },
    {
      name: "managed copy",
      scanned: scannedSkill({ directory_fingerprint: "fingerprint-writer" }),
      library: [librarySkill()],
      expected: {
        isInMySkills: true,
        isExternalInstall: false,
        installBadge: "copy",
      },
    },
    {
      name: "PromptHub-managed symlink",
      scanned: scannedSkill({
        installMode: "symlink",
        isPromptHubManagedLink: true,
      }),
      library: [],
      expected: {
        isInMySkills: false,
        isExternalInstall: false,
        installBadge: "symlink",
      },
    },
    {
      name: "symlink matched through My Skills source target",
      scanned: scannedSkill({
        installMode: "symlink",
        symlinkTargetPath: "/prompthub/skills/writer",
      }),
      library: [librarySkill()],
      expected: {
        isInMySkills: true,
        isExternalInstall: false,
        installBadge: "symlink",
      },
    },
    {
      name: "external symlink",
      scanned: scannedSkill({
        installMode: "symlink",
        symlinkTargetPath: "/external/skills/writer",
        isPromptHubManagedLink: false,
      }),
      library: [librarySkill()],
      expected: {
        isInMySkills: false,
        isExternalInstall: true,
        installBadge: "external",
      },
    },
    {
      name: "unknown unmatched symlink",
      scanned: scannedSkill({
        installMode: "symlink",
        symlinkTargetPath: "/unknown/skills/writer",
      }),
      library: [],
      expected: {
        isInMySkills: false,
        isExternalInstall: true,
        installBadge: "external",
      },
    },
    {
      name: "platform built-in",
      scanned: scannedSkill({
        installMode: "copy",
        isPlatformBuiltin: true,
      }),
      library: [],
      expected: {
        isInMySkills: false,
        isExternalInstall: true,
        installBadge: "builtin",
      },
    },
  ])("classifies $name", ({ scanned, library, options, expected }) => {
    expect(getSkillScanStatus(scanned, library, options)).toMatchObject(
      expected,
    );
  });
});
