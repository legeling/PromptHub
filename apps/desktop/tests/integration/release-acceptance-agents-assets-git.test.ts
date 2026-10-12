import assert from "node:assert/strict";
import type { SkillTestRuntime } from "./helpers/skill-runtime";
import type {
  Skill,
  SkillPackageOperationRequest,
} from "@prompthub/shared/types";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, it, expect, vi } from "vitest";
import {
  createSkillTestRuntime,
  fileInventory,
  skillApi,
} from "./helpers/skill-runtime";
import * as utils from "../../src/main/services/skill-installer-utils";
let runtime: SkillTestRuntime;
afterEach(() => {
  vi.restoreAllMocks();
  runtime?.dispose();
});
it("two nested Git Skills preserve exact identity/package through update and reopen", async () => {
  runtime = await createSkillTestRuntime();
  const repo = path.join(runtime.root, "git-source");
  fs.mkdirSync(repo);
  const gitCommandTimeoutMs = 10_000;
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: repo,
      timeout: gitCommandTimeoutMs,
      stdio: "pipe",
    });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "acceptance@example.test"]);
  git(["config", "user.name", "Acceptance Fixture"]);
  const make = (name: string, bytes: number[]) => {
    const root = path.join(repo, "catalog/category", name);
    fs.mkdirSync(path.join(root, "assets"), { recursive: true });
    fs.mkdirSync(path.join(root, "docs/nested"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "SKILL.md"),
      `---\nname: ${name}\ndescription: Git fixture\n---\n# ${name}\n`,
    );
    fs.writeFileSync(path.join(root, "assets/data.bin"), Buffer.from(bytes));
    fs.writeFileSync(path.join(root, "docs/nested/note.txt"), "Nested " + name);
  };
  make("alpha", [0, 1, 255]);
  make("beta", [0, 2, 254]);
  git(["add", "."]);
  git(["-c", "commit.gpgsign=false", "commit", "-m", "Fixture"]);
  // Redirect only remote transport; clone, package resolution, IPC and storage remain real.
  vi.spyOn(utils, "gitClone").mockImplementation(async (_url, dest, branch) => {
    git(["clone", "--branch", branch || "main", "--", repo, dest]);
  });
  const repoUrl = "https://gitea.example.test/acceptance/packages.git";
  const request = (name: string): SkillPackageOperationRequest => {
    const directory = "catalog/category/" + name;
    const content = fs.readFileSync(
      path.join(repo, directory, "SKILL.md"),
      "utf8",
    );
    return {
      operation: "install",
      registrySkill: {
        slug: name,
        name,
        description: "Git fixture",
        category: "general",
        author: "Fixture",
        version: "1.0.0",
        tags: [],
        source_id: "git-fixture-" + name,
        source_url: repoUrl,
        source_branch: "main",
        source_directory: directory,
        canonical_skill_path: directory + "/SKILL.md",
        content,
      },
      content,
      source: { kind: "remote-git", repoUrl, branch: "main", skillName: name },
    };
  };
  const installed: Skill[] = [];
  for (const name of ["alpha", "beta"]) {
    const result = await skillApi.runPackageOperation(request(name));
    expect(result.status, JSON.stringify(result)).toBe("completed");
    if (result.status !== "completed") throw new Error(JSON.stringify(result));
    const skill = result.skill;
    installed.push(skill);
    assert(skill.local_repo_path);
    const actual = fileInventory(skill.local_repo_path);
    delete actual[".canonical-bundle-hash"];
    expect(actual).toEqual(
      fileInventory(path.join(repo, "catalog/category", name)),
    );
  }
  assert(installed[1].local_repo_path);
  assert(installed[0].local_repo_path);
  const beforeBeta = fileInventory(installed[1].local_repo_path);
  const beforeAlpha = fileInventory(installed[0].local_repo_path);
  const preview = await skillApi.getRemoteGitPackageSnapshot({
    repoUrl,
    branch: "main",
    skillName: "alpha",
  });
  expect(preview.resolvedDirectory).toBe("catalog/category/alpha");
  fs.writeFileSync(
    path.join(repo, "catalog/category/alpha/assets/data.bin"),
    Buffer.from([0, 3, 253]),
  );
  git(["add", "."]);
  git(["-c", "commit.gpgsign=false", "commit", "-m", "Asset-only update"]);
  const update = await skillApi.runPackageOperation({
    ...request("alpha"),
    operation: "update",
    skillId: installed[0].id,
  });
  expect(update.status, JSON.stringify(update)).toBe("completed");
  await runtime.reopen();
  const alpha = await skillApi.get(installed[0].id);
  const beta = await skillApi.get(installed[1].id);
  expect(alpha.source_directory).toBe("catalog/category/alpha");
  expect(alpha.canonical_skill_path).toBe("catalog/category/alpha/SKILL.md");
  expect(alpha.source_branch).toBe("main");
  expect(alpha.source_url).toBe(repoUrl);
  expect(fileInventory(beta.local_repo_path)).toEqual(beforeBeta);
  const afterAlpha = fileInventory(alpha.local_repo_path);
  delete afterAlpha[".canonical-bundle-hash"];
  expect(afterAlpha).toEqual(
    fileInventory(path.join(repo, "catalog/category/alpha")),
  );
  expect(afterAlpha["assets/data.bin"]).not.toBe(
    beforeAlpha["assets/data.bin"],
  );
  const beforeFailure = fileInventory(alpha.local_repo_path);
  const beforeVersions = await skillApi.versionGetAll(alpha.id);
  const fail = await skillApi.runPackageOperation({
    ...request("alpha"),
    operation: "update",
    skillId: alpha.id,
    source: {
      kind: "remote-git",
      repoUrl,
      branch: "main",
      directory: "missing",
    },
  });
  expect(fail).toMatchObject({ status: "failed" });
  await runtime.reopen();
  expect(fileInventory((await skillApi.get(alpha.id)).local_repo_path)).toEqual(
    beforeFailure,
  );
  expect(await skillApi.versionGetAll(alpha.id)).toEqual(beforeVersions);
});
