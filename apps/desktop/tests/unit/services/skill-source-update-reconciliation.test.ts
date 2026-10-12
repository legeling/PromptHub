import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { computeDirectoryFingerprint } from "@prompthub/shared/utils/skill-identity";
import {
  LEGACY_STABLE_TEXT_FINGERPRINT_ALGORITHM,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
  SKILL_SOURCE_UPDATE_STATUSES,
  buildSkillSourceUpdateCheck,
  classifyLegacyBaselineUpgrade,
  classifySkillSourceUpdate,
  computeContentUrlPackageSnapshot,
  computeSkillContentSha256,
  computeSkillPackageFingerprintV1,
  getSkillSourceUpdateActionPolicy,
  type SkillSourceSnapshot,
} from "@prompthub/shared/utils/skill-source-update";

function sha256Text(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function sha256Bytes(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function normalizeText(content: string): string {
  return content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trimEnd();
}

function snapshot(
  key: string,
  overrides: Partial<SkillSourceSnapshot> = {},
): SkillSourceSnapshot {
  return {
    contentHash: `${key}-content`,
    directoryFingerprint: `${key}-package`,
    fingerprintAlgorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    resolvedAt: 100,
    ...overrides,
  };
}

describe("skill source update reconciliation", () => {
  it("exposes only the v1 source status values", () => {
    expect(SKILL_SOURCE_UPDATE_STATUSES).toEqual([
      "no-source",
      "source-unavailable",
      "baseline-missing",
      "up-to-date",
      "update-available",
      "local-modified",
      "conflict",
    ]);
    expect(SKILL_SOURCE_UPDATE_STATUSES).not.toContain("source-moved");
    expect(SKILL_SOURCE_UPDATE_STATUSES).not.toContain("downstream-stale");
  });

  it.each([
    {
      name: "no source metadata",
      input: {
        hasSourceMetadata: false,
        baseline: null,
        local: snapshot("local"),
        remote: null,
      },
      expected: {
        status: "no-source",
        localModified: false,
        remoteChanged: false,
      },
    },
    {
      name: "source unavailable with no remote snapshot",
      input: {
        hasSourceMetadata: true,
        baseline: null,
        local: snapshot("local"),
        remote: null,
      },
      expected: {
        status: "source-unavailable",
        localModified: false,
        remoteChanged: false,
      },
    },
    {
      name: "baseline missing when local and remote cannot be proven equal",
      input: {
        hasSourceMetadata: true,
        baseline: null,
        local: snapshot("local"),
        remote: snapshot("remote"),
      },
      expected: {
        status: "baseline-missing",
        localModified: false,
        remoteChanged: false,
      },
    },
    {
      name: "initializes a missing baseline when local and remote match",
      input: {
        hasSourceMetadata: true,
        baseline: null,
        local: snapshot("same"),
        remote: snapshot("same"),
      },
      expected: {
        status: "up-to-date",
        localModified: false,
        remoteChanged: false,
        shouldInitializeBaseline: true,
      },
    },
    {
      name: "up to date",
      input: {
        hasSourceMetadata: true,
        baseline: snapshot("base"),
        local: snapshot("base"),
        remote: snapshot("base"),
      },
      expected: {
        status: "up-to-date",
        localModified: false,
        remoteChanged: false,
      },
    },
    {
      name: "update available",
      input: {
        hasSourceMetadata: true,
        baseline: snapshot("base"),
        local: snapshot("base"),
        remote: snapshot("remote"),
      },
      expected: {
        status: "update-available",
        localModified: false,
        remoteChanged: true,
      },
    },
    {
      name: "local modified",
      input: {
        hasSourceMetadata: true,
        baseline: snapshot("base"),
        local: snapshot("local"),
        remote: snapshot("base"),
      },
      expected: {
        status: "local-modified",
        localModified: true,
        remoteChanged: false,
      },
    },
    {
      name: "conflict",
      input: {
        hasSourceMetadata: true,
        baseline: snapshot("base"),
        local: snapshot("local"),
        remote: snapshot("remote"),
      },
      expected: {
        status: "conflict",
        localModified: true,
        remoteChanged: true,
      },
    },
  ])("classifies $name", ({ input, expected }) => {
    const expectedSource = input.hasSourceMetadata
      ? {
          sourceIdentity:
            "remote-store|https://example.com/skills|main|writer|SKILL.md",
        }
      : {};

    expect(
      classifySkillSourceUpdate({
        skillId: "skill-writer",
        sourceIdentity: input.hasSourceMetadata
          ? "remote-store|https://example.com/skills|main|writer|SKILL.md"
          : null,
        baseline: input.baseline,
        local: input.local,
        remote: input.remote,
      }),
    ).toMatchObject({
      skillId: "skill-writer",
      hasStaleTargets: false,
      ...expectedSource,
      ...expected,
    });
  });

  it("keeps stale downstream targets as auxiliary distribution data", () => {
    const check = classifySkillSourceUpdate({
      skillId: "skill-writer",
      sourceIdentity:
        "remote-store|https://example.com/skills|main|writer|SKILL.md",
      baseline: snapshot("base"),
      local: snapshot("base"),
      remote: snapshot("base"),
      staleTargets: [
        {
          targetType: "project",
          targetId: "project-a",
          installMode: "copy",
          currentFingerprint: "old",
          expectedFingerprint: "base-package",
        },
      ],
    });

    expect(check).toMatchObject({
      status: "up-to-date",
      hasStaleTargets: true,
      staleTargets: [
        {
          targetType: "project",
          targetId: "project-a",
          installMode: "copy",
        },
      ],
    });
  });

  it("chooses silent legacy upgrade only when old entry hashes match remote", () => {
    expect(
      classifyLegacyBaselineUpgrade({
        installedDirectoryFingerprint: undefined,
        installedContentHash: "entry-sha",
        remoteContentHash: "entry-sha",
      }),
    ).toBe("silent-upgrade");

    expect(
      classifyLegacyBaselineUpgrade({
        installedDirectoryFingerprint: undefined,
        installedContentHash: "local-entry-sha",
        remoteContentHash: "remote-entry-sha",
      }),
    ).toBe("baseline-missing");

    expect(
      classifyLegacyBaselineUpgrade({
        installedDirectoryFingerprint: "package-sha",
        installedContentHash: "entry-sha",
        remoteContentHash: "different-entry-sha",
      }),
    ).toBe("not-needed");
  });

  it("blocks direct remote overwrite for linked local folders in v1", () => {
    expect(
      getSkillSourceUpdateActionPolicy({
        status: "update-available",
        sourceMode: "local-linked",
      }),
    ).toMatchObject({
      canApplyRemoteUpdate: false,
      recommendedAction: "convert-to-managed-copy",
    });

    expect(
      getSkillSourceUpdateActionPolicy({
        status: "conflict",
        sourceMode: "local-linked",
      }),
    ).toMatchObject({
      canApplyRemoteUpdate: false,
      recommendedAction: "convert-to-managed-copy",
    });

    expect(
      getSkillSourceUpdateActionPolicy({
        status: "baseline-missing",
        sourceMode: "local-linked",
      }),
    ).toMatchObject({
      canApplyRemoteUpdate: false,
      recommendedAction: "convert-to-managed-copy",
    });

    expect(
      getSkillSourceUpdateActionPolicy({
        status: "update-available",
        sourceMode: "managed-copy",
      }),
    ).toMatchObject({
      canApplyRemoteUpdate: true,
      recommendedAction: "update-from-source",
    });
  });

  it("computes skill-package-sha256-v1 fingerprints with shared ignore rules", async () => {
    const binary = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const entries: Parameters<typeof computeDirectoryFingerprint>[0] = [
      { path: "SKILL.md", content: "# Writer\r\n", isDirectory: false },
      { path: ".env.example", content: "API_URL=  \r\n", isDirectory: false },
      { path: "assets/icon.bin", data: binary, isDirectory: false },
      { path: ".env.local", content: "SECRET=local", isDirectory: false },
      { path: ".prompthub/source.json", content: "{}", isDirectory: false },
      { path: ".git/config", content: "git", isDirectory: false },
      {
        path: "node_modules/pkg/index.js",
        content: "ignored",
        isDirectory: false,
      },
    ];

    const result = await computeSkillPackageFingerprintV1(entries);
    const expectedManifest = [
      `file:.env.example:${sha256Text(normalizeText("API_URL=  \r\n"))}`,
      `file:assets/icon.bin:${sha256Bytes(binary)}`,
      `file:SKILL.md:${sha256Text(normalizeText("# Writer\r\n"))}`,
    ].join("\n");

    expect(result).toEqual({
      algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
      fingerprint: sha256Text(expectedManifest),
    });
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.fingerprint).not.toBe(computeDirectoryFingerprint(entries));
  });

  it("keeps raw content-url package fingerprint equal to content hash", async () => {
    const content = "---\nname: writer\n---\r\n# Writer  \r\n";
    const contentHash = await computeSkillContentSha256(content);

    await expect(
      computeContentUrlPackageSnapshot(content, {
        version: "1.2.0",
        resolvedAt: 123,
      }),
    ).resolves.toEqual({
      contentHash,
      directoryFingerprint: contentHash,
      version: "1.2.0",
      fingerprintAlgorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
      resolvedAt: 123,
    });
  });

  it("treats null algorithm rows with package fingerprints as legacy snapshots", () => {
    const check = buildSkillSourceUpdateCheck({
      skillId: "legacy-skill",
      sourceIdentity: "source-legacy-skill",
      localContentHash: "local-content",
      installedContentHash: "baseline-content",
      remoteContentHash: "remote-content",
      localDirectoryFingerprint: "legacy-local-package",
      installedDirectoryFingerprint: "legacy-baseline-package",
      remoteDirectoryFingerprint: "remote-package",
      fingerprintAlgorithm: null,
      resolvedAt: 123,
    });

    expect(check.baseline?.fingerprintAlgorithm).toBe(
      LEGACY_STABLE_TEXT_FINGERPRINT_ALGORITHM,
    );
    expect(check.local?.fingerprintAlgorithm).toBe(
      SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    );
    expect(check.remote?.fingerprintAlgorithm).toBe(
      SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    );
  });

  it("does not report an update when legacy entry content and current v1 packages match", () => {
    const check = buildSkillSourceUpdateCheck({
      skillId: "private-gitea-skill",
      sourceIdentity: "gitea:team/prompthub-web",
      localContentHash: "same-entry-content",
      installedContentHash: "same-entry-content",
      remoteContentHash: "same-entry-content",
      localDirectoryFingerprint: "current-v1-package",
      installedDirectoryFingerprint: "legacy-package-fingerprint",
      remoteDirectoryFingerprint: "current-v1-package",
      fingerprintAlgorithm: LEGACY_STABLE_TEXT_FINGERPRINT_ALGORITHM,
      resolvedAt: 123,
    });

    expect(check).toMatchObject({
      status: "up-to-date",
      localModified: false,
      remoteChanged: false,
    });
  });

  it("keeps legacy stable text algorithm separate from sha256 package fingerprints", async () => {
    const content = "# Writer\n";
    const contentHash = await computeSkillContentSha256(content);

    expect(contentHash).toBe(sha256Text(normalizeText(content)));
    expect(contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(LEGACY_STABLE_TEXT_FINGERPRINT_ALGORITHM).toBe(
      "legacy-stable-text-v1",
    );
  });
});
