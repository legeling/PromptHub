import { describe, expect, it } from "vitest";

import {
  buildSkillSourceId,
  computeDirectoryFingerprint,
} from "@prompthub/shared/utils/skill-identity";

describe("skill identity utils", () => {
  it("normalizes equivalent source identity fields into the same source id", () => {
    const canonical = buildSkillSourceId({
      sourceType: "git-repo",
      sourceUrl: "https://github.com/Example/Skills/",
      branch: "Main",
      directory: "skills\\writer/",
      skillPath: "skills\\writer\\SKILL.md",
    });

    const normalized = buildSkillSourceId({
      sourceType: "Git-Repo",
      sourceUrl: "https://github.com/example/skills",
      branch: "main",
      directory: "skills/writer",
      skillPath: "skills/writer/skill.md",
    });

    expect(canonical).toBe(normalized);
  });

  it("produces different source ids when source, branch, directory, or skill path changes", () => {
    const base = {
      sourceType: "git-repo",
      sourceUrl: "https://github.com/example/skills",
      branch: "main",
      directory: "skills",
      skillPath: "skills/writer/SKILL.md",
    };

    expect(buildSkillSourceId(base)).not.toBe(
      buildSkillSourceId({ ...base, sourceUrl: "https://github.com/example/community-skills" }),
    );
    expect(buildSkillSourceId(base)).not.toBe(
      buildSkillSourceId({ ...base, branch: "dev" }),
    );
    expect(buildSkillSourceId(base)).not.toBe(
      buildSkillSourceId({ ...base, directory: "skills/.curated" }),
    );
    expect(buildSkillSourceId(base)).not.toBe(
      buildSkillSourceId({ ...base, skillPath: "skills/reviewer/SKILL.md" }),
    );
  });

  it("ignores sidecar and tooling files when computing directory fingerprints", () => {
    const baseline = computeDirectoryFingerprint([
      { path: "SKILL.md", content: "# Writer\r\n", isDirectory: false },
      { path: "assets/icon.txt", content: "icon\n", isDirectory: false },
      { path: ".prompthub/source.json", content: '{"a":1}', isDirectory: false },
      { path: ".git/config", content: "git", isDirectory: false },
      { path: "node_modules/pkg/index.js", content: "ignored", isDirectory: false },
      { path: ".DS_Store", content: "ignored", isDirectory: false },
    ]);

    const equivalent = computeDirectoryFingerprint([
      { path: "SKILL.md", content: "# Writer\n", isDirectory: false },
      { path: "assets\\icon.txt", content: "icon  \r\n", isDirectory: false },
      { path: ".prompthub/variant.json", content: '{"b":2}', isDirectory: false },
      { path: ".git/HEAD", content: "ref: refs/heads/main", isDirectory: false },
    ]);

    expect(baseline).toBe(equivalent);
  });

  it("changes the directory fingerprint when a non-ignored file changes", () => {
    const baseline = computeDirectoryFingerprint([
      { path: "SKILL.md", content: "# Writer\n", isDirectory: false },
      { path: "assets/icon.txt", content: "icon-a", isDirectory: false },
    ]);

    const changedAsset = computeDirectoryFingerprint([
      { path: "SKILL.md", content: "# Writer\n", isDirectory: false },
      { path: "assets/icon.txt", content: "icon-b", isDirectory: false },
    ]);

    expect(baseline).not.toBe(changedAsset);
  });

  it("changes the directory fingerprint when a binary file changes", () => {
    const baseline = computeDirectoryFingerprint([
      {
        path: "SKILL.md",
        content: "# Writer\n",
        isDirectory: false,
      },
      {
        path: "assets/icon.png",
        data: new Uint8Array([137, 80, 78, 71, 0, 1]),
        isDirectory: false,
      },
    ]);

    const changedAsset = computeDirectoryFingerprint([
      {
        path: "SKILL.md",
        content: "# Writer\n",
        isDirectory: false,
      },
      {
        path: "assets/icon.png",
        data: new Uint8Array([137, 80, 78, 71, 0, 2]),
        isDirectory: false,
      },
    ]);

    expect(baseline).not.toBe(changedAsset);
  });
});
