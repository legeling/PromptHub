import { describe, expect, it } from "vitest";

import {
  buildSkillSourceId,
  computeDirectoryFingerprint,
  computeDirectoryFingerprintFromHashes,
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

  it("ignores Python runtime and analysis caches in directory fingerprints", () => {
    const baselineEntries = [
      { path: "SKILL.md", content: "# Data Analyst\n", isDirectory: false },
      {
        path: "scripts/analyze.py",
        content: "print('ok')\n",
        isDirectory: false,
      },
    ];
    const baseline = computeDirectoryFingerprint(baselineEntries);

    const withPythonCaches = computeDirectoryFingerprint([
      ...baselineEntries,
      {
        path: "scripts/__pycache__/analyze.cpython-312.pyc",
        data: new Uint8Array([0, 1, 2, 3]),
        isDirectory: false,
      },
      {
        path: "nested/tools/__pycache__/helper.cpython-311.pyo",
        data: new Uint8Array([4, 5, 6]),
        isDirectory: false,
      },
      {
        path: ".pytest_cache/v/cache/nodeids",
        content: "[]",
        isDirectory: false,
      },
      { path: ".mypy_cache/3.12/meta.json", content: "{}", isDirectory: false },
      { path: ".ruff_cache/content", content: "cache", isDirectory: false },
      { path: ".coverage", content: "coverage db", isDirectory: false },
    ]);

    expect(withPythonCaches).toBe(baseline);
  });

  it("ignores common cache, log, and editor-temporary files in directory fingerprints", () => {
    const baselineEntries = [
      { path: "SKILL.md", content: "# Web Helper\n", isDirectory: false },
      { path: "scripts/build.ts", content: "export {}\n", isDirectory: false },
    ];
    const baseline = computeDirectoryFingerprint(baselineEntries);

    const withGeneratedFiles = computeDirectoryFingerprint([
      ...baselineEntries,
      { path: ".cache/tool/state.json", content: "cache", isDirectory: false },
      { path: ".vite/deps/chunk.js", content: "cache", isDirectory: false },
      { path: ".vitest/results.json", content: "{}", isDirectory: false },
      { path: ".turbo/state.json", content: "cache", isDirectory: false },
      { path: ".parcel-cache/index", content: "cache", isDirectory: false },
      { path: ".next/cache/webpack/client", content: "cache", isDirectory: false },
      { path: ".nuxt/analyze/meta.json", content: "cache", isDirectory: false },
      { path: ".svelte-kit/generated/client.js", content: "cache", isDirectory: false },
      { path: "coverage/lcov.info", content: "coverage", isDirectory: false },
      { path: ".nyc_output/out.json", content: "coverage", isDirectory: false },
      { path: ".eslintcache", content: "lint cache", isDirectory: false },
      { path: "tsconfig.tsbuildinfo", content: "ts cache", isDirectory: false },
      { path: "npm-debug.log", content: "debug", isDirectory: false },
      { path: "yarn-error.log", content: "debug", isDirectory: false },
      { path: "pnpm-debug.log", content: "debug", isDirectory: false },
      { path: "scripts/build.ts.swp", content: "swap", isDirectory: false },
      { path: "scripts/build.ts~", content: "backup", isDirectory: false },
      { path: "tmp/session.json", content: "tmp", isDirectory: false },
      { path: ".tmp/session.json", content: "tmp", isDirectory: false },
      { path: "temp/session.json", content: "tmp", isDirectory: false },
      { path: ".npm/_cacache/index", content: "cache", isDirectory: false },
      { path: ".pnpm-store/v3/files/index", content: "cache", isDirectory: false },
      { path: ".yarn/cache/pkg.zip", data: new Uint8Array([1]), isDirectory: false },
    ]);

    expect(withGeneratedFiles).toBe(baseline);
  });

  it("ignores generated entries consistently when fingerprints are computed from hashes", () => {
    const baseline = computeDirectoryFingerprintFromHashes([
      { path: "SKILL.md", contentHash: "hash-skill" },
      { path: "scripts/analyze.py", contentHash: "hash-script" },
    ]);

    const withGeneratedEntries = computeDirectoryFingerprintFromHashes([
      { path: "SKILL.md", contentHash: "hash-skill" },
      { path: "scripts/analyze.py", contentHash: "hash-script" },
      {
        path: "scripts/__pycache__/analyze.cpython-312.pyc",
        contentHash: "hash-pyc",
      },
      { path: ".pytest_cache/v/cache/lastfailed", contentHash: "hash-cache" },
      { path: "tools/.mypy_cache/3.12/data.json", contentHash: "hash-mypy" },
      { path: ".cache/tool/state.json", contentHash: "hash-cache-dir" },
      { path: "coverage/lcov.info", contentHash: "hash-coverage" },
      { path: "npm-debug.log", contentHash: "hash-log" },
      { path: "tsconfig.tsbuildinfo", contentHash: "hash-tsbuild" },
    ]);

    expect(withGeneratedEntries).toBe(baseline);
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
