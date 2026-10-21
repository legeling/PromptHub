/** @vitest-environment node */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSkillTestRuntime,
  fileInventory,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { loadGitHubSkillRepo } from "../../src/renderer/services/github-skill-store";
import { initDatabase } from "../../src/main/database";
import { getSkillsDir } from "../../src/main/runtime-paths";
import * as packageRepo from "../../src/main/services/skill-installer-repo";
import type { RegistrySkill, Skill } from "@prompthub/shared/types";

const gitTransport = vi.hoisted(() => ({
  source: "",
  directories: [] as (string | undefined)[],
}));
vi.mock(
  "../../src/main/services/skill-installer-utils",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/main/services/skill-installer-utils")
      >();
    return {
      ...actual,
      // Only source URL/policy change; production sparse Git, IPC, publication
      // and SQLite reopen all execute against an isolated local Git server.
      gitClone: async (
        url: string,
        destination: string,
        branch?: string,
        selectedDirectory?: string,
      ) => {
        expect(url).toBe(
          "https://github.com/hechtcarmel/jetbrains-index-mcp-plugin",
        );
        gitTransport.directories.push(selectedDirectory);
        const { cloneSkillRepository } =
          await import("@prompthub/core/skills/git-transport");
        const source = pathToFileURL(gitTransport.source).href;
        await cloneSkillRepository(
          source,
          destination,
          branch,
          selectedDirectory,
          (candidate) => {
            expect(candidate).toBe(source);
          },
        );
        if (selectedDirectory)
          expect(fs.existsSync(path.join(destination, "other-skill"))).toBe(
            false,
          );
      },
    };
  },
);
vi.mock(
  "../../src/main/services/skill-installer-remote",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/main/services/skill-installer-remote")
      >();
    return {
      ...actual,
      fetchRemoteText: (url: string) => githubContent(gitTransport.source, url),
      fetchRemoteBytes: async (url: string) => {
        throw new Error(`Unexpected archive fixture request: ${url}`);
      },
    };
  },
);
vi.mock("../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));

const repoUrl = "https://github.com/hechtcarmel/jetbrains-index-mcp-plugin";
const directory = "src/main/resources/skill/ide-index-mcp";
const treeUrl = `${repoUrl}/tree/main/${directory}`;
const initialContent =
  "---\nname: ide-index-mcp\ndescription: Nested Git package\nversion: 1.0.0\n---\n\n# IDE index\n";
const initialBinary = Buffer.from([0, 255, 128, 42]);
const updatedBinary = Buffer.from([0, 254, 129, 43]);
type RendererStore = typeof import("../../src/renderer/stores/skill.store");

function git(repo: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: repo, timeout: 10_000, stdio: "pipe" });
}

function writeRepository(repo: string): void {
  fs.mkdirSync(path.join(repo, directory, "docs/nested"), { recursive: true });
  fs.mkdirSync(path.join(repo, directory, "assets"), { recursive: true });
  fs.mkdirSync(path.join(repo, "other-skill"), { recursive: true });
  fs.writeFileSync(path.join(repo, "README.md"), "Repository, not a Skill\n");
  fs.writeFileSync(path.join(repo, directory, "SKILL.md"), initialContent);
  fs.writeFileSync(
    path.join(repo, directory, "docs/nested/reference.md"),
    "Reference v1\n",
  );
  fs.writeFileSync(
    path.join(repo, directory, "assets/index.bin"),
    initialBinary,
  );
  fs.writeFileSync(
    path.join(repo, "other-skill/SKILL.md"),
    "---\nname: other-skill\n---\n\n# Other\n",
  );
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "fixture@example.com");
  git(repo, "config", "user.name", "Skill fixture");
  git(repo, "config", "uploadpack.allowFilter", "true");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "Initial nested package");
}

function githubContent(repo: string, url: string): Promise<string> {
  if (
    url ===
    "https://api.github.com/repos/hechtcarmel/jetbrains-index-mcp-plugin"
  )
    return Promise.resolve(JSON.stringify({ default_branch: "main" }));
  if (
    url ===
    "https://api.github.com/repos/hechtcarmel/jetbrains-index-mcp-plugin/git/trees/main?recursive=1"
  )
    return Promise.resolve(
      JSON.stringify({
        tree: [
          { path: `${directory}/SKILL.md`, type: "blob" },
          { path: "other-skill/SKILL.md", type: "blob" },
        ],
      }),
    );
  if (
    url ===
    `https://raw.githubusercontent.com/hechtcarmel/jetbrains-index-mcp-plugin/main/${directory}/SKILL.md`
  )
    return Promise.resolve(
      fs.readFileSync(path.join(repo, directory, "SKILL.md"), "utf8"),
    );
  throw new Error(`Unexpected GitHub fixture request: ${url}`);
}

async function selectedPackage(repo: string): Promise<RegistrySkill> {
  const entries = await loadGitHubSkillRepo(treeUrl, {
    fetchRemoteContent: (url) => githubContent(repo, url),
    registrySkills: [],
    rateLimitMessage: "Fixture rate limit",
    networkMessage: "Fixture network failure",
    invalidRepoMessage: "Fixture invalid repository",
  });
  expect(entries).toHaveLength(1);
  const selected = entries[0];
  expect(selected.source_directory).toBe(directory);
  expect(selected.canonical_skill_path).toBe(`${directory}/SKILL.md`);
  return selected;
}

function expectInstalledPackage(skill: Skill, repo: string): void {
  expect(skill.local_repo_path).toBeTruthy();
  if (!skill.local_repo_path)
    throw new Error("Installed Skill has no package root");
  const inventory = fileInventory(skill.local_repo_path);
  delete inventory[".canonical-bundle-hash"];
  expect(inventory).toEqual(fileInventory(path.join(repo, directory)));
  expect(skill.source_directory).toBe(directory);
  expect(skill.canonical_skill_path).toBe(`${directory}/SKILL.md`);
}

describe("#218 nested Git Skill import and source update", () => {
  let runtime: SkillTestRuntime;
  let renderer: RendererStore;

  beforeEach(async () => {
    runtime = await createSkillTestRuntime();
    gitTransport.source = runtime.source;
    gitTransport.directories = [];
    writeRepository(runtime.source);
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal("window", {
      crypto: globalThis.crypto,
      api: {
        skill: {
          ...skillApi,
          fetchRemoteContent: (url: string) =>
            githubContent(runtime.source, url),
        },
      },
    });
    renderer = await import("../../src/renderer/stores/skill.store");
    renderer.useSkillStore.setState({
      skills: [],
      registrySkills: [],
      remoteStoreEntries: {},
      customStoreSources: [],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    runtime?.dispose();
    gitTransport.source = "";
    vi.unstubAllGlobals();
  });

  async function installSelected(): Promise<Skill> {
    const intermediateCopy = vi.spyOn(packageRepo, "copyRepoByPathToDirectory");
    const selected = await selectedPackage(runtime.source);
    const result = await renderer.useSkillStore
      .getState()
      .installRegistrySkill(selected);
    expect(result.status).toBe("installed");
    expect(gitTransport.directories).toEqual([directory]);
    expect(intermediateCopy).not.toHaveBeenCalled();
    if (result.status !== "installed")
      throw new Error("Nested Git installation failed");
    expectInstalledPackage(result.skill, runtime.source);
    return result.skill;
  }

  it("checks an imported deep subdirectory immediately and after reopening storage", async () => {
    const skill = await installSelected();
    const check = await renderer.useSkillStore
      .getState()
      .getInstalledSkillSourceUpdateStatus(skill.id);
    expect(check?.status).toBe("up-to-date");
    await runtime.reopen();
    await renderer.useSkillStore.getState().loadSkills();
    const reopened: Skill | null = await skillApi.get(skill.id);
    expect(reopened).not.toBeNull();
    if (!reopened) throw new Error("Imported Skill did not survive reopening");
    expectInstalledPackage(reopened, runtime.source);
    expect(
      (
        await renderer.useSkillStore
          .getState()
          .getInstalledSkillSourceUpdateStatus(skill.id)
      )?.status,
    ).toBe("up-to-date");
  });

  it("acquires an unknown directory once and persists discovery through reopening", async () => {
    const selected = await selectedPackage(runtime.source);
    fs.rmSync(path.join(runtime.source, "other-skill"), { recursive: true });
    git(runtime.source, "add", ".");
    git(runtime.source, "commit", "-m", "Single discoverable package");
    const result = await renderer.useSkillStore
      .getState()
      .installRegistrySkill({
        ...selected,
        source_directory: undefined,
        canonical_skill_path: undefined,
        source_url: repoUrl,
        content_url: undefined,
        content: "",
      });
    expect(result.status).toBe("installed");
    expect(gitTransport.directories).toEqual([undefined]);
    if (result.status !== "installed")
      throw new Error("Discovery installation failed");
    await runtime.reopen();
    const reopened = await skillApi.get(result.skill.id);
    if (!reopened) throw new Error("Discovered package missing after reopen");
    expectInstalledPackage(reopened, runtime.source);
  });

  it("updates only the selected complete package and persists its new baseline", async () => {
    const skill = await installSelected();
    fs.writeFileSync(
      path.join(runtime.source, directory, "docs/nested/reference.md"),
      "Reference v2\n",
    );
    fs.writeFileSync(
      path.join(runtime.source, directory, "assets/index.bin"),
      updatedBinary,
    );
    git(runtime.source, "add", ".");
    git(runtime.source, "commit", "-m", "Update nested package assets");
    expect(
      (
        await renderer.useSkillStore
          .getState()
          .getInstalledSkillSourceUpdateStatus(skill.id)
      )?.status,
    ).toBe("update-available");
    const result = await renderer.useSkillStore
      .getState()
      .updateInstalledSkillFromSource(skill.id);
    expect(result?.status).toBe("updated");
    if (result?.status !== "updated" || !result.skill)
      throw new Error("Nested Git update failed");
    expectInstalledPackage(result.skill, runtime.source);
    await runtime.reopen();
    await renderer.useSkillStore.getState().loadSkills();
    const reopened: Skill | null = await skillApi.get(skill.id);
    if (!reopened) throw new Error("Updated Skill did not survive reopening");
    expectInstalledPackage(reopened, runtime.source);
    expect(
      (
        await renderer.useSkillStore
          .getState()
          .getInstalledSkillSourceUpdateStatus(skill.id)
      )?.status,
    ).toBe("up-to-date");
  });

  it.each([false, true])(
    "reports a missing package without fabricating bytes from SQL (old checkout exists: %s)",
    async (existingCheckout) => {
      const skill = await installSelected();
      const obsoleteRoot = path.join(
        // Match the managed-root identity, including macOS /var symlink aliases.
        fs.realpathSync(getSkillsDir()),
        ".remote-import-old",
        "checkout",
      );
      if (existingCheckout)
        fs.cpSync(runtime.source, obsoleteRoot, { recursive: true });
      if (!skill.local_repo_path)
        throw new Error("Installed Skill has no workspace");
      fs.rmSync(skill.local_repo_path, { recursive: true });
      const before = await skillApi.get(skill.id);
      const versions = await skillApi.versionGetAll(skill.id);
      initDatabase()
        .prepare("UPDATE skills SET local_repo_path = ? WHERE id = ?")
        .run(obsoleteRoot, skill.id);
      await renderer.useSkillStore.getState().loadSkills();
      await expect(
        renderer.useSkillStore
          .getState()
          .getInstalledSkillSourceUpdateStatus(skill.id),
      ).rejects.toThrow(/SKILL.md/);
      expect(fs.existsSync(skill.local_repo_path)).toBe(false);
      expect(await skillApi.get(skill.id)).toMatchObject({
        ...before,
        local_repo_path: obsoleteRoot,
      });
      expect(await skillApi.versionGetAll(skill.id)).toEqual(versions);
    },
  );

  it("rejects a repository root and preserves the installed package when the remote entry disappears", async () => {
    const skill = await installSelected();
    await expect(
      skillApi.getLocalPackageSnapshot(runtime.source),
    ).rejects.toThrow("regular root SKILL.md");
    const versions: unknown = await skillApi.versionGetAll(skill.id);
    fs.unlinkSync(path.join(runtime.source, directory, "SKILL.md"));
    git(runtime.source, "add", ".");
    git(runtime.source, "commit", "-m", "Remove selected entrypoint");
    const check = await renderer.useSkillStore
      .getState()
      .getInstalledSkillSourceUpdateStatus(skill.id);
    expect(check?.status).toBe("source-unavailable");
    const retained: Skill | null = await skillApi.get(skill.id);
    if (!retained || !retained.local_repo_path)
      throw new Error("Failed check lost the local package");
    const inventory = fileInventory(retained.local_repo_path);
    delete inventory[".canonical-bundle-hash"];
    expect(inventory).toEqual({
      "SKILL.md": Buffer.from(initialContent).toString("base64"),
      "docs/nested/reference.md":
        Buffer.from("Reference v1\n").toString("base64"),
      "assets/index.bin": initialBinary.toString("base64"),
    });
    expect(retained.installed_directory_fingerprint).toBe(
      skill.installed_directory_fingerprint,
    );
    expect(await skillApi.versionGetAll(skill.id)).toEqual(versions);
  });
});
