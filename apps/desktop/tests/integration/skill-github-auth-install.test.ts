/** @vitest-environment node */
import {
  createSkillTestRuntime,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { CoreSettingsStore } from "@prompthub/core/settings-store";
import { initDatabase } from "../../src/main/database";
import { SkillInstaller } from "../../src/main/services/skill-installer";
import * as git from "../../src/main/services/skill-installer-utils";
import { buildSkillPackageOperationSource } from "../../src/renderer/services/skill-package-operation";

let runtime: SkillTestRuntime;
const content = "---\nname: writer\ndescription: Fixture\n---\n# Writer\n";
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
});
afterEach(() => {
  vi.restoreAllMocks();
  runtime?.dispose();
});

it("reports GitHub token rejection separately from Git failure without creating a partial Skill", async () => {
  new CoreSettingsStore({
    database: initDatabase(),
    rootPath: runtime.profile,
  }).patchSettings({ githubToken: "ghp_RejectedFixture" });
  vi.spyOn(git, "gitClone").mockRejectedValue(
    new Error("Failed to connect to 127.0.0.1 port 7892"),
  );
  const fetch = vi
    .spyOn(SkillInstaller, "fetchRemoteBytes")
    .mockRejectedValue(new Error("GitHub HTTP 401 fetching remote content"));
  const source = {
    repoUrl: "https://github.com/acme/private-skills",
    directory: "skills/writer",
  };
  await expect(skillApi.getRemoteGitPackageSnapshot(source)).rejects.toThrow(
    /^SKILL_PACKAGE_READ:github-authentication$/,
  );
  expect(await skillApi.getAll()).toEqual([]);
  new CoreSettingsStore({
    database: initDatabase(),
    rootPath: runtime.profile,
  }).patchSettings({ githubToken: "ghp_CorrectedFixture" });
  fetch.mockResolvedValue(
    zipSync({ "repo-main/skills/writer/SKILL.md": strToU8(content) }),
  );
  expect((await skillApi.getRemoteGitPackageSnapshot(source)).content).toBe(
    content,
  );
  expect(fetch).toHaveBeenLastCalledWith(
    "https://api.github.com/repos/acme/private-skills/zipball/HEAD",
    0,
    { githubToken: "ghp_CorrectedFixture" },
  );
});

it("uses the persisted GitHub token for snapshot and complete package installation after reopen", async () => {
  new CoreSettingsStore({
    database: initDatabase(),
    rootPath: runtime.profile,
  }).patchSettings({ githubToken: "ghp_SyntheticFixture" });
  await runtime.reopen();
  vi.spyOn(git, "gitClone").mockRejectedValue(
    new Error("Git authentication failed"),
  );
  const fetch = vi.spyOn(SkillInstaller, "fetchRemoteBytes").mockResolvedValue(
    zipSync({
      "repo-abc/skills/writer/SKILL.md": strToU8(content),
      "repo-abc/skills/writer/assets/data.bin": new Uint8Array([0, 255]),
    }),
  );
  const source = {
    repoUrl: "https://github.com/acme/private-skills",
    branch: "release/v1",
    directory: "skills/writer",
  };
  const snapshot = await skillApi.getRemoteGitPackageSnapshot(source);
  const result = await skillApi.runPackageOperation({
    operation: "install",
    source: { kind: "remote-git", ...source },
    content,
    approvedPackageFingerprint: snapshot.directoryFingerprint,
    registrySkill: {
      slug: "writer",
      name: "writer",
      description: "Fixture",
      category: "general",
      author: "acme",
      tags: [],
      version: "1",
      content,
      source_url: source.repoUrl,
      source_branch: source.branch,
      source_directory: source.directory,
    },
  });
  expect(result.status, JSON.stringify(result)).toBe("completed");
  expect(fetch).toHaveBeenCalledWith(
    "https://api.github.com/repos/acme/private-skills/zipball/release%2Fv1",
    0,
    { githubToken: "ghp_SyntheticFixture" },
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(result)).not.toContain("ghp_SyntheticFixture");
  if (result.status !== "completed" || !result.skill.local_repo_path)
    throw new Error("Install missing");
  expect(
    await fs.readFile(
      path.join(result.skill.local_repo_path, "assets/data.bin"),
    ),
  ).toEqual(Buffer.from([0, 255]));
  await runtime.reopen();
  expect((await skillApi.get(result.skill.id))?.source_url).toBe(
    source.repoUrl,
  );
});

it.each([
  "git@github.com:acme/skills.git",
  "git@gitea.example.com:acme/skills.git",
])("keeps SSH from scan through install and reopen: %s", async (url) => {
  const clone = vi
    .spyOn(git, "gitClone")
    .mockImplementation(async (_url, destination) => {
      await fs.mkdir(path.join(destination, "skills/writer/docs"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(destination, "skills/writer/SKILL.md"),
        content,
      );
      await fs.writeFile(
        path.join(destination, "skills/writer/docs/guide.md"),
        "# Guide",
      );
    });
  const fetch = vi.spyOn(SkillInstaller, "fetchRemoteBytes");
  const [entry] = await skillApi.scanRemoteGithub(url, [], "main");
  expect(entry.source_url).toBe(url);
  const source = buildSkillPackageOperationSource(entry, content);
  expect(source).toMatchObject({
    kind: "remote-git",
    repoUrl: url,
    directory: "skills/writer",
  });
  const snapshot = await skillApi.getRemoteGitPackageSnapshot({
    repoUrl: url,
    branch: "main",
    directory: entry.source_directory,
  });
  const result = await skillApi.runPackageOperation({
    operation: "install",
    source,
    content,
    registrySkill: entry,
    approvedPackageFingerprint: snapshot.directoryFingerprint,
  });
  expect(result.status, JSON.stringify(result)).toBe("completed");
  expect(clone.mock.calls.every(([sourceUrl]) => sourceUrl === url)).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  if (result.status !== "completed") throw new Error("Install missing");
  await runtime.reopen();
  expect((await skillApi.get(result.skill.id))?.source_url).toBe(url);
});
