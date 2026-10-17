/** @vitest-environment node */
import {
  createSkillTestRuntime,
  fileInventory,
  invokeSkillIPC,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import { SkillInstaller } from "../../src/main/services/skill-installer";
import * as git from "../../src/main/services/skill-installer-utils";

const content =
  "---\nname: meeting\ndescription: Archive fixture\n---\n# Meeting\n";
const binary = Buffer.from([0, 128, 255]);
function archive(directory: string, count = 600): Uint8Array {
  const prefix = `skills-main/${directory}`;
  const files: Record<string, Uint8Array> = {
    [`${prefix}/SKILL.md`]: strToU8(content),
    [`${prefix}/reference/guide.md`]: strToU8("# Guide\n"),
    [`${prefix}/assets/icon.bin`]: binary,
  };
  for (let i = 0; i < count; i++)
    files[`skills-main/other/${i}.md`] = strToU8("other");
  return zipSync(files);
}

describe("Store archive download, preview and install through public APIs", () => {
  let runtime: SkillTestRuntime;
  beforeEach(async () => {
    runtime = await createSkillTestRuntime();
    vi.spyOn(git, "gitClone").mockRejectedValue(
      new Error("Failed to connect to 127.0.0.1 port 7892"),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    runtime?.dispose();
  });

  it.each([
    ["openai/skills", "skills/.curated/meeting"],
    ["anthropics/skills", "skills/meeting"],
  ])(
    "imports the complete selected package from a large %s archive and reopens it",
    async (repo, directory) => {
      const fetch = vi
        .spyOn(SkillInstaller, "fetchRemoteBytes")
        .mockResolvedValue(archive(directory));
      const source = {
        repoUrl: `https://github.com/${repo}`,
        branch: "main",
        directory,
      };
      const snapshot = await skillApi.getRemoteGitPackageSnapshot(source);
      expect(snapshot.content).toBe(content);
      expect(snapshot.resolvedDirectory).toBe(directory);
      const result = await skillApi.runPackageOperation({
        operation: "install",
        source: { kind: "remote-git", ...source },
        content,
        approvedPackageFingerprint: snapshot.directoryFingerprint,
        registrySkill: {
          slug: "meeting",
          name: "meeting",
          description: "Archive fixture",
          category: "general",
          author: "Fixture",
          source_id: `git:${repo}:${directory}`,
          source_url: source.repoUrl,
          source_branch: "main",
          source_directory: directory,
          version: "1.0.0",
          tags: [],
          content,
        },
      });
      expect(result.status, JSON.stringify(result)).toBe("completed");
      if (result.status !== "completed" || !result.skill.local_repo_path)
        throw new Error("Missing installed package");
      const packagePath = result.skill.local_repo_path;
      expect(
        Object.keys(fileInventory(packagePath))
          .filter((file) => !file.startsWith(".prompthub/"))
          .sort(),
      ).toEqual(["SKILL.md", "assets/icon.bin", "reference/guide.md"]);
      expect(
        fs.readFileSync(path.join(packagePath, "assets/icon.bin")),
      ).toEqual(binary);
      expect(
        fs.readFileSync(path.join(packagePath, "reference/guide.md"), "utf8"),
      ).toBe("# Guide\n");
      expect(fetch).toHaveBeenCalledWith(
        `https://codeload.github.com/${repo}/zip/main`,
      );
      await runtime.reopen();
      expect(await skillApi.get(result.skill.id)).toMatchObject({
        name: "meeting",
      });
      expect(fs.readFileSync(path.join(packagePath, "SKILL.md"), "utf8")).toBe(
        content,
      );
    },
  );

  it("returns a bounded proxy failure through IPC and preload, then retries without creating partial Skills", async () => {
    const fetch = vi
      .spyOn(SkillInstaller, "fetchRemoteBytes")
      .mockRejectedValue(new Error("connect ETIMEDOUT 20.205.243.166:443"));
    const source = {
      repoUrl: "https://github.com/anthropics/skills",
      directory: "skills/meeting",
    };
    expect(
      await invokeSkillIPC(
        IPC_CHANNELS.SKILL_GET_REMOTE_GIT_PACKAGE_SNAPSHOT,
        source,
      ),
    ).toEqual({ ok: false, errorCode: "proxy-unavailable" });
    await expect(skillApi.getRemoteGitPackageSnapshot(source)).rejects.toThrow(
      /^SKILL_PACKAGE_READ:proxy-unavailable$/,
    );
    expect(await skillApi.getAll()).toEqual([]);
    fetch.mockResolvedValue(archive(source.directory));
    expect((await skillApi.getRemoteGitPackageSnapshot(source)).content).toBe(
      content,
    );
    expect(await skillApi.getAll()).toEqual([]);
    expect(
      fs
        .readdirSync(path.join(runtime.profile, "data/skills"))
        .filter((name) => name.startsWith(".remote-")),
    ).toEqual([]);
  });
});
