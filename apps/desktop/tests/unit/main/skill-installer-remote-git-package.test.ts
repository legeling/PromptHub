import * as childProcess from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/main/database", () => ({
  initDatabase: vi.fn(),
}));

vi.mock("@/main/settings/settings-readers", () => ({
  readGithubTokenSetting: vi.fn(),
}));

import {
  configureRuntimePaths,
  getSkillsDir,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import {
  SkillInstaller,
  SkillSafetyReviewRequiredError,
} from "../../../src/main/services/skill-installer";
import { invalidateCustomPathsCache } from "../../../src/main/services/skill-installer-utils";
import * as skillInstallerUtils from "../../../src/main/services/skill-installer-utils";
import { GitExecutableUnavailableError } from "../../../src/main/services/skill-installer-utils";

let tmpDir: string;

const CLAWHUB_FIXTURE_ZIP_BASE64 =
  "UEsDBBQAAAAIABeExFzcZ6wxHgAAACEAAAAIAAAAU0tJTEwubWTT1dXlykvMTbVSSM9MSy9KLeACiXApK7hnprmDuABQSwMEFAAAAAgAF4TEXDWwbU4JAAAABwAAAA0AAABza2lsbC1jYXJkLm1kU1ZwTixK4QIAUEsDBBQAAAAIABeExFwbtNTNFgAAABQAAAAKAAAAX21ldGEuanNvbqtWKkstKs7Mz1OyUjLUM9AzVKrlAgBQSwMEFAAAAAgAF4TEXBqhbbAeAAAAHAAAABEAAABzY3JpcHRzL3NlYXJjaC50c0utKMgvKlFIzs8rLlEoTk0sSs5QsFUoKSpNteYCAFBLAQIUABQAAAAIABeExFzcZ6wxHgAAACEAAAAIAAAAAAAAAAAAAAAAAAAAAABTS0lMTC5tZFBLAQIUABQAAAAIABeExFw1sG1OCQAAAAcAAAANAAAAAAAAAAAAAAAAAEQAAABza2lsbC1jYXJkLm1kUEsBAhQAFAAAAAgAF4TEXBu01M0WAAAAFAAAAAoAAAAAAAAAAAAAAAAAeAAAAF9tZXRhLmpzb25QSwECFAAUAAAACAAXhMRcGqFtsB4AAAAcAAAAEQAAAAAAAAAAAAAAAAC2AAAAc2NyaXB0cy9zZWFyY2gudHNQSwUGAAAAAAQABADoAAAAAwEAAAAA";
const UNSAFE_ZIP_BASE64 =
  "UEsDBBQAAAAIABeExFwEQPI4CQAAAAcAAAAOAAAALi4vb3V0c2lkZS50eHRLLU5OLEjlAgBQSwMEFAAAAAgAF4TEXLOr/W4LAAAACQAAAAgAAABTS0lMTC5tZFNWCM0rTkxL5QIAUEsBAhQAFAAAAAgAF4TEXARA8jgJAAAABwAAAA4AAAAAAAAAAAAAAAAAAAAAAC4uL291dHNpZGUudHh0UEsBAhQAFAAAAAgAF4TEXLOr/W4LAAAACQAAAAgAAAAAAAAAAAAAAAAANQAAAFNLSUxMLm1kUEsFBgAAAAACAAIAcgAAAGYAAAAAAA==";
const UNSAFE_SKILL_ZIP_BASE64 =
  "UEsDBBQAAAAIAEeR51yEnAO/RQAAAEMAAAAIAAAAU0tJTEwubWRTVgjNK05MS1UIzs7MyeHiCirNU0hILi3KUcgoKSkottLXTy3LzNFLrUjMLchJ1c/MKy5JzMnRK85QqFFISizOSNDjAgBQSwECFAMUAAAACABHkedchJwDv0UAAABDAAAACAAAAAAAAAAAAAAAgAEAAAAAU0tJTEwubWRQSwUGAAAAAAEAAQA2AAAAawAAAAAA";
const REPOSITORY_ARCHIVE_BASE64 =
  "UEsDBBQAAAAIAEdWIl1+ovTOGgAAAB8AAAAiAAAAc2tpbGxzLW1haW4vc2tpbGxzL3dyaXRlci9TS0lMTC5tZNPV1eXKS8xNtVIoL8osSS3iAglwKSuEQ3gAUEsDBBQAAAAIAEdWIl2ie6YPCgAAAAgAAAAnAAAAc2tpbGxzLW1haW4vc2tpbGxzL3dyaXRlci9kb2NzL2d1aWRlLm1kU1ZwL81MSeUCAFBLAwQUAAAACABHViJdGBbw9A0AAAALAAAAKgAAAHNraWxscy1tYWluL3NraWxscy93cml0ZXIvc2NyaXB0cy9zZXR1cC5zaEtNzshXKE4tKS3gAgBQSwMEFAAAAAgAR1YiXaW+61sGAAAABAAAACkAAABza2lsbHMtbWFpbi9za2lsbHMvd3JpdGVyL2Fzc2V0cy9pY29uLnBuZ+sM8HMHAFBLAQIUABQAAAAIAEdWIl1+ovTOGgAAAB8AAAAiAAAAAAAAAAAAAAAAAAAAAABza2lsbHMtbWFpbi9za2lsbHMvd3JpdGVyL1NLSUxMLm1kUEsBAhQAFAAAAAgAR1YiXaJ7pg8KAAAACAAAACcAAAAAAAAAAAAAAAAAWgAAAHNraWxscy1tYWluL3NraWxscy93cml0ZXIvZG9jcy9ndWlkZS5tZFBLAQIUABQAAAAIAEdWIl0YFvD0DQAAAAsAAAAqAAAAAAAAAAAAAAAAAKkAAABza2lsbHMtbWFpbi9za2lsbHMvd3JpdGVyL3NjcmlwdHMvc2V0dXAuc2hQSwECFAAUAAAACABHViJdpb7rWwYAAAAEAAAAKQAAAAAAAAAAAAAAAAD+AAAAc2tpbGxzLW1haW4vc2tpbGxzL3dyaXRlci9hc3NldHMvaWNvbi5wbmdQSwUGAAAAAAQABABUAQAASwEAAAAA";

function createRepositoryArchive(): Uint8Array {
  return Buffer.from(REPOSITORY_ARCHIVE_BASE64, "base64");
}

async function listRelativeFiles(baseDir: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      files.push(path.relative(baseDir, fullPath).replace(/\\/g, "/"));
    }
  };
  await walk(baseDir);
  return files.sort();
}

async function runGit(args: string[], cwd?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = childProcess.spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
    });
  });
}

async function createCommittedSkillRepo(
  repoDir: string,
  files: Record<string, string | Buffer>,
): Promise<void> {
  await fs.mkdir(repoDir, { recursive: true });
  await runGit(["init", "-b", "main"], repoDir);
  await runGit(["config", "user.email", "test@example.com"], repoDir);
  await runGit(["config", "user.name", "PromptHub Test"], repoDir);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(repoDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }

  await runGit(["add", "."], repoDir);
  await runGit(["commit", "-m", "fixture"], repoDir);
}

async function listRemoteImportTempDirs(): Promise<string[]> {
  const entries = await fs.readdir(getSkillsDir()).catch(() => []);
  return entries.filter((entry) => entry.startsWith(".remote-import-")).sort();
}

async function listRemoteZipTempDirs(): Promise<string[]> {
  const entries = await fs.readdir(getSkillsDir()).catch(() => []);
  return entries.filter((entry) => entry.startsWith(".remote-zip-")).sort();
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-remote-git-test-"));
  configureRuntimePaths({ userDataPath: tmpDir });
  invalidateCustomPathsCache();
});

afterEach(async () => {
  invalidateCustomPathsCache();
  resetRuntimePaths();
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId", () => {
  it("never invokes supplied content scanners during Git materialization", async () => {
    await SkillInstaller.init();
    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        const skillDir = path.join(destDir, "skills", "writer");
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Writer\n");
      },
    );
    const preflightScan = vi.fn().mockResolvedValue({
      level: "high-risk",
      summary: "Review one script.",
      findings: [
        {
          code: "script-file",
          severity: "high",
          title: "Script requires review",
          detail: "User-authored script",
        },
      ],
      recommendedAction: "review",
      scannedAt: 1,
      checkedFileCount: 1,
    });
    const aiScan = vi.fn().mockResolvedValue({
      level: "warn",
      summary: "Review three warning findings.",
      findings: ["network", "shell", "credential"].map((code) => ({
        code,
        severity: "warn",
        title: `${code} warning`,
        detail: "User-authored behavior requires review",
      })),
      recommendedAction: "review",
      scannedAt: 2,
      checkedFileCount: 4,
      scanMethod: "ai",
    });
    const safetyScan = {
      preflightScan,
      scan: aiScan,
      aiConfig: {
        provider: "openai",
        apiProtocol: "openai" as const,
        apiKey: "test-key",
        apiUrl: "https://example.com/v1",
        model: "test-model",
      },
    };
    const skill = {
      id: "skill-gitea-writer",
      name: "writer",
      source_id: "source-gitea-writer",
      source_url: "https://gitea.example.com/team/skills",
    };

    const repoPath =
      await SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(skill, {
        repoUrl: skill.source_url,
        directory: "skills/writer",
        safetyScan,
        approvedPackageFingerprint: "not-an-approval",
      });
    await expect(
      fs.readFile(path.join(repoPath, "SKILL.md"), "utf8"),
    ).resolves.toBe("# Writer\n");
    expect(preflightScan).not.toHaveBeenCalled();
    expect(aiScan).not.toHaveBeenCalled();
  });

  it("copies the full custom Git/Gitea skill package into the managed repo", async () => {
    await SkillInstaller.init();

    const skill = {
      id: "skill-gitea-writer",
      name: "writer",
      source_id: "source-gitea-writer",
      source_url: "https://gitea.example.com/team/skills",
      source_directory: "skills/writer",
      directory_fingerprint: "remote-fingerprint",
    };

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        const skillDir = path.join(destDir, "skills", "writer");
        await fs.mkdir(path.join(skillDir, "docs"), { recursive: true });
        await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });
        await fs.mkdir(path.join(skillDir, "assets"), { recursive: true });
        await fs.writeFile(
          path.join(skillDir, "SKILL.md"),
          "---\nname: writer\ndescription: Writes well\n---\n\n# Writer\n",
          "utf-8",
        );
        await fs.writeFile(
          path.join(skillDir, "docs", "guide.md"),
          "# Guide\n",
          "utf-8",
        );
        await fs.writeFile(
          path.join(skillDir, "scripts", "setup.sh"),
          "echo setup\n",
          "utf-8",
        );
        await fs.writeFile(
          path.join(skillDir, "assets", "icon.png"),
          Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        );
      },
    );

    const repoPath =
      await SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(skill, {
        repoUrl: "https://gitea.example.com/team/skills",
        branch: "main",
        directory: "skills/writer",
      });

    await expect(listRelativeFiles(repoPath)).resolves.toEqual([
      "SKILL.md",
      "assets/icon.png",
      "docs/guide.md",
      "scripts/setup.sh",
    ]);
    expect(skillInstallerUtils.gitClone).toHaveBeenCalledWith(
      "https://gitea.example.com/team/skills",
      expect.stringContaining("team-skills"),
      "main",
    );
  });

  it("installs a complete public HTTPS package through HTTP when Git is absent", async () => {
    await SkillInstaller.init();
    vi.spyOn(skillInstallerUtils, "gitClone").mockRejectedValue(
      new GitExecutableUnavailableError(),
    );
    vi.spyOn(SkillInstaller, "fetchRemoteBytes").mockResolvedValue(
      createRepositoryArchive(),
    );

    const repoPath =
      await SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(
        {
          id: "skill-http-writer",
          name: "writer",
          source_id: "source-http-writer",
          source_url: "https://github.com/acme/skills",
          source_directory: "skills/writer",
        },
        {
          repoUrl: "https://github.com/acme/skills",
          branch: "main",
          directory: "skills/writer",
        },
      );

    await expect(listRelativeFiles(repoPath)).resolves.toEqual([
      "SKILL.md",
      "assets/icon.png",
      "docs/guide.md",
      "scripts/setup.sh",
    ]);
    expect(SkillInstaller.fetchRemoteBytes).toHaveBeenCalledWith(
      "https://github.com/acme/skills/archive/main.zip",
    );
    expect(await listRemoteImportTempDirs()).toEqual([]);
  });

  it("uses a real local git clone fixture and excludes internal dirs and symlinks", async () => {
    await SkillInstaller.init();

    const sourceRepo = path.join(tmpDir, "source-git-repo");
    await createCommittedSkillRepo(sourceRepo, {
      "skills/writer/SKILL.md":
        "---\nname: writer\ndescription: Writes well\n---\n\n# Writer\n",
      "skills/writer/references/guide.md": "# Guide\n",
      "skills/writer/scripts/setup.sh": "echo setup\n",
      "skills/writer/assets/icon.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      "skills/writer/.prompthub/cache.json": "{}\n",
      "skills/writer/.git/ignored.txt": "not a real nested git dir\n",
    });
    await fs.symlink(
      path.join(sourceRepo, "skills", "writer", "references", "guide.md"),
      path.join(sourceRepo, "skills", "writer", "guide-link.md"),
    );
    await runGit(["add", "."], sourceRepo);
    await runGit(["commit", "-m", "add symlink"], sourceRepo);

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir, branch) => {
        await runGit([
          "clone",
          "--branch",
          branch || "main",
          "--",
          sourceRepo,
          destDir,
        ]);
      },
    );

    const repoPath =
      await SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(
        {
          id: "skill-real-git-writer",
          name: "writer",
          source_id: "source-real-git-writer",
          source_url: "https://gitea.example.com/team/skills",
          source_directory: "skills/writer",
          directory_fingerprint: "remote-fingerprint",
        },
        {
          repoUrl: "https://gitea.example.com/team/skills",
          branch: "main",
          directory: "skills/writer",
        },
      );

    await expect(listRelativeFiles(repoPath)).resolves.toEqual([
      "SKILL.md",
      "assets/icon.png",
      "references/guide.md",
      "scripts/setup.sh",
    ]);
    expect(await listRemoteImportTempDirs()).toEqual([]);
  });

  it("fingerprints a real Git package with deeply nested templates", async () => {
    await SkillInstaller.init();

    const sourceRepo = path.join(tmpDir, "source-deep-git-repo");
    const nestedTemplate = path.join(
      "skills",
      "writer",
      ...Array.from({ length: 12 }, (_, index) => `level-${index}`),
      "template.md",
    );
    await createCommittedSkillRepo(sourceRepo, {
      "skills/writer/SKILL.md": "---\nname: writer\n---\n\n# Writer\n",
      [nestedTemplate]: "template\n",
    });

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir, branch) => {
        await runGit([
          "clone",
          "--branch",
          branch || "main",
          "--",
          sourceRepo,
          destDir,
        ]);
      },
    );

    await expect(
      SkillInstaller.getRemoteGitSkillPackageFingerprint({
        repoUrl: "https://gitea.example.com/team/skills",
        branch: "main",
        directory: "skills/writer",
      }),
    ).resolves.toMatch(/^[a-f0-9]{64}$/);
    expect(await listRemoteImportTempDirs()).toEqual([]);
  });

  it.each([
    {
      name: "path traversal directory",
      directory: "../outside",
      expectedError: /Path traversal detected/,
      files: {
        "skills/writer/SKILL.md": "---\nname: writer\n---\n\n# Writer\n",
      },
    },
    {
      name: "missing SKILL.md in requested directory",
      directory: "skills/writer",
      expectedError: /SKILL\.md not found/,
      files: {
        "skills/writer/references/guide.md": "# Guide\n",
      },
    },
  ])(
    "rejects $name and removes the temporary clone",
    async ({ directory, expectedError, files }) => {
      await SkillInstaller.init();

      vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
        async (_url, destDir) => {
          for (const [relativePath, content] of Object.entries(files)) {
            const filePath = path.join(destDir, relativePath);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content, "utf-8");
          }
        },
      );

      await expect(
        SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(
          {
            id: "skill-invalid-package",
            name: "writer",
            source_id: "source-invalid-package",
            source_url: "https://gitea.example.com/team/skills",
            source_directory: "skills/writer",
            directory_fingerprint: "remote-fingerprint",
          },
          {
            repoUrl: "https://gitea.example.com/team/skills",
            branch: "main",
            directory,
          },
        ),
      ).rejects.toThrow(expectedError);
      expect(await listRemoteImportTempDirs()).toEqual([]);
    },
  );

  it("rejects ambiguous repositories when no skill directory is specified", async () => {
    await SkillInstaller.init();

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        await fs.mkdir(path.join(destDir, "skills", "alpha"), {
          recursive: true,
        });
        await fs.mkdir(path.join(destDir, "skills", "beta"), {
          recursive: true,
        });
        await fs.writeFile(
          path.join(destDir, "skills", "alpha", "SKILL.md"),
          "---\nname: alpha\n---\n\n# Alpha\n",
          "utf-8",
        );
        await fs.writeFile(
          path.join(destDir, "skills", "beta", "SKILL.md"),
          "---\nname: beta\n---\n\n# Beta\n",
          "utf-8",
        );
      },
    );

    await expect(
      SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(
        {
          id: "skill-ambiguous-package",
          name: "writer",
          source_id: "source-ambiguous-package",
          source_url: "https://gitea.example.com/team/skills",
          directory_fingerprint: "remote-fingerprint",
        },
        {
          repoUrl: "https://gitea.example.com/team/skills",
          branch: "main",
        },
      ),
    ).rejects.toThrow(/multiple skills/);
    expect(await listRemoteImportTempDirs()).toEqual([]);
  });

  it("selects a matching skill by SKILL.md frontmatter when the package directory is omitted", async () => {
    await SkillInstaller.init();

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        const reactDir = path.join(destDir, "skills", "react-best-practices");
        const nextDir = path.join(destDir, "skills", "next-best-practices");
        await fs.mkdir(reactDir, { recursive: true });
        await fs.mkdir(nextDir, { recursive: true });
        await fs.writeFile(
          path.join(reactDir, "SKILL.md"),
          "---\nname: vercel-react-best-practices\n---\n\n# React\n",
          "utf-8",
        );
        await fs.mkdir(path.join(reactDir, "scripts"), { recursive: true });
        await fs.writeFile(
          path.join(reactDir, "scripts", "check.ts"),
          "export {}\n",
          "utf-8",
        );
        await fs.writeFile(
          path.join(nextDir, "SKILL.md"),
          "---\nname: next-best-practices\n---\n\n# Next\n",
          "utf-8",
        );
      },
    );

    const repoPath =
      await SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(
        {
          id: "skill-vercel-react",
          name: "vercel-react-best-practices",
          source_id: "skills-sh-vercel-react",
          source_url: "https://github.com/vercel-labs/agent-skills",
          directory_fingerprint: "remote-fingerprint",
        },
        {
          repoUrl: "https://github.com/vercel-labs/agent-skills",
          branch: "main",
        },
      );

    await expect(listRelativeFiles(repoPath)).resolves.toEqual([
      "SKILL.md",
      "scripts/check.ts",
    ]);
    expect(await listRemoteImportTempDirs()).toEqual([]);
  });

  it("discovers a matching skills.sh package below repository category folders", async () => {
    await SkillInstaller.init();

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        const grillDir = path.join(
          destDir,
          "skills",
          "productivity",
          "grill-me",
        );
        const docsDir = path.join(
          destDir,
          "skills",
          "engineering",
          "grill-with-docs",
        );
        await fs.mkdir(grillDir, { recursive: true });
        await fs.mkdir(docsDir, { recursive: true });
        await fs.writeFile(
          path.join(grillDir, "SKILL.md"),
          "---\nname: grill-me\n---\n\nRun a grilling session.\n",
          "utf-8",
        );
        await fs.writeFile(
          path.join(grillDir, "reference.md"),
          "# Interview reference\n",
          "utf-8",
        );
        await fs.writeFile(
          path.join(docsDir, "SKILL.md"),
          "---\nname: grill-with-docs\n---\n\nRun with docs.\n",
          "utf-8",
        );
      },
    );

    const repoPath =
      await SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(
        {
          id: "skill-grill-me",
          name: "grill-me",
          source_id: "skills-sh-grill-me",
          source_url: "https://github.com/mattpocock/skills",
        },
        {
          repoUrl: "https://github.com/mattpocock/skills",
        },
      );

    await expect(listRelativeFiles(repoPath)).resolves.toEqual([
      "SKILL.md",
      "reference.md",
    ]);
    await expect(
      SkillInstaller.getRemoteGitSkillPackageSnapshot({
        repoUrl: "https://github.com/mattpocock/skills",
        skillName: "grill-me",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        content: expect.stringContaining("name: grill-me"),
        directoryFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        resolvedDirectory: "skills/productivity/grill-me",
      }),
    );
    expect(await listRemoteImportTempDirs()).toEqual([]);
  });

  it("uses the explicit catalog selector instead of a temporary display name", async () => {
    await SkillInstaller.init();

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        for (const name of ["grill-me", "grill-with-docs"]) {
          const skillDir = path.join(destDir, "skills", "productivity", name);
          await fs.mkdir(skillDir, { recursive: true });
          await fs.writeFile(
            path.join(skillDir, "SKILL.md"),
            `---\nname: ${name}\n---\n\n# ${name}\n`,
            "utf-8",
          );
        }
      },
    );

    const repoPath =
      await SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(
        {
          id: "skill-catalog-card",
          name: "Relentless interviewing",
          source_id: "skills-sh-grill-me",
          source_url: "https://github.com/mattpocock/skills",
        },
        {
          repoUrl: "https://github.com/mattpocock/skills",
          skillName: "grill-me",
        },
      );

    await expect(
      fs.readFile(path.join(repoPath, "SKILL.md"), "utf8"),
    ).resolves.toContain("name: grill-me");
  });

  it("rejects an explicit catalog selector that does not match the repository's only Skill", async () => {
    await SkillInstaller.init();

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        const skillDir = path.join(destDir, "skills", "different-skill");
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(
          path.join(skillDir, "SKILL.md"),
          "---\nname: different-skill\n---\n\n# Different\n",
          "utf-8",
        );
      },
    );

    await expect(
      SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(
        {
          id: "skill-catalog-card",
          name: "Catalog display name",
          source_id: "skills-sh-missing",
          source_url: "https://github.com/example/skills",
        },
        {
          repoUrl: "https://github.com/example/skills",
          skillName: "expected-skill",
        },
      ),
    ).rejects.toThrow(/none matches/i);
  });

  it("copies a large package inventory without dropping nested files", async () => {
    await SkillInstaller.init();

    const fileCount = 300;
    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        const skillDir = path.join(destDir, "skills", "bulk");
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(
          path.join(skillDir, "SKILL.md"),
          "---\nname: bulk\n---\n\n# Bulk\n",
          "utf-8",
        );
        await Promise.all(
          Array.from({ length: fileCount }, async (_, index) => {
            const filePath = path.join(
              skillDir,
              "references",
              `section-${String(index).padStart(3, "0")}.md`,
            );
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, `# Section ${index}\n`, "utf-8");
          }),
        );
      },
    );

    const start = performance.now();
    const repoPath =
      await SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(
        {
          id: "skill-bulk-package",
          name: "bulk",
          source_id: "source-bulk-package",
          source_url: "https://gitea.example.com/team/skills",
          source_directory: "skills/bulk",
          directory_fingerprint: "remote-fingerprint",
        },
        {
          repoUrl: "https://gitea.example.com/team/skills",
          branch: "main",
          directory: "skills/bulk",
        },
      );
    const elapsedMs = performance.now() - start;

    const files = await listRelativeFiles(repoPath);
    expect(files).toHaveLength(fileCount + 1);
    expect(files).toContain("SKILL.md");
    expect(files).toContain("references/section-000.md");
    expect(files).toContain("references/section-299.md");
    expect(elapsedMs).toBeLessThan(30_000);
  });

  it("copies the full remote zip skill package into the managed repo", async () => {
    await SkillInstaller.init();

    const archive = Buffer.from(CLAWHUB_FIXTURE_ZIP_BASE64, "base64");
    vi.spyOn(SkillInstaller, "fetchRemoteBytes").mockResolvedValue(archive);

    const repoPath =
      await SkillInstaller.saveRemoteZipSkillToLocalRepoBySkillId(
        {
          id: "skill-clawhub-gifgrep",
          name: "gifgrep",
          source_id: "source-clawhub-gifgrep",
          source_url: "https://clawhub.ai/clawhub/gifgrep",
          directory_fingerprint: "remote-fingerprint",
        },
        {
          zipUrl: "https://clawhub.ai/api/v1/download?slug=gifgrep",
        },
      );

    await expect(listRelativeFiles(repoPath)).resolves.toEqual([
      "SKILL.md",
      "_meta.json",
      "scripts/search.ts",
      "skill-card.md",
    ]);
    expect(SkillInstaller.fetchRemoteBytes).toHaveBeenCalledWith(
      "https://clawhub.ai/api/v1/download?slug=gifgrep",
    );
    expect(await listRemoteZipTempDirs()).toEqual([]);
  });

  it("rejects unsafe remote zip packages and removes the temporary extract directory", async () => {
    await SkillInstaller.init();

    const archive = Buffer.from(UNSAFE_ZIP_BASE64, "base64");
    vi.spyOn(SkillInstaller, "fetchRemoteBytes").mockResolvedValue(archive);

    await expect(
      SkillInstaller.saveRemoteZipSkillToLocalRepoBySkillId(
        {
          id: "skill-unsafe-zip",
          name: "unsafe",
          source_id: "source-unsafe-zip",
          source_url: "https://clawhub.ai/unsafe/zip",
          directory_fingerprint: "remote-fingerprint",
        },
        {
          zipUrl: "https://clawhub.ai/api/v1/download?slug=unsafe",
        },
      ),
    ).rejects.toThrow(/Path traversal detected/);
    expect(await listRemoteZipTempDirs()).toEqual([]);
  });

  it("does not block structurally valid ZIP content based on optional assessment", async () => {
    await SkillInstaller.init();

    const skill = {
      id: "skill-unsafe-update",
      name: "unsafe-update",
      source_id: "source-unsafe-update",
      source_url: "https://clawhub.ai/unsafe/update",
      directory_fingerprint: "remote-fingerprint",
    };
    const originalRepoPath =
      await SkillInstaller.saveContentToLocalRepoBySkillId(
        skill,
        "# Safe Skill\n\nKeep this content.\n",
      );
    const archive = Buffer.from(UNSAFE_SKILL_ZIP_BASE64, "base64");
    vi.spyOn(SkillInstaller, "fetchRemoteBytes").mockResolvedValue(archive);

    await expect(
      SkillInstaller.saveRemoteZipSkillToLocalRepoBySkillId(skill, {
        zipUrl: "https://clawhub.ai/api/v1/download?slug=unsafe-update",
        approvedPackageFingerprint: "0".repeat(64),
      }),
    ).resolves.toBe(originalRepoPath);

    await expect(
      fs.readFile(path.join(originalRepoPath, "SKILL.md"), "utf-8"),
    ).resolves.not.toBe("# Safe Skill\n\nKeep this content.\n");
    expect(await listRemoteZipTempDirs()).toEqual([]);
  });

  it("keeps the previous managed repo when remote git copy fails mid-apply", async () => {
    await SkillInstaller.init();

    const skill = {
      id: "skill-partial-copy",
      name: "partial-copy",
      source_id: "source-partial-copy",
      source_url: "https://gitea.example.com/team/skills",
      source_directory: "skills/partial-copy",
      directory_fingerprint: "remote-fingerprint",
    };
    const originalRepoPath =
      await SkillInstaller.saveContentToLocalRepoBySkillId(
        skill,
        "# Original Skill\n\nDo not remove.\n",
      );

    vi.spyOn(skillInstallerUtils, "gitClone").mockImplementation(
      async (_url, destDir) => {
        const skillDir = path.join(destDir, "skills", "partial-copy");
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(
          path.join(skillDir, "SKILL.md"),
          "---\nname: partial-copy\n---\n\n# Remote Skill\n",
          "utf-8",
        );
        const unreadableFile = path.join(skillDir, "blocked.txt");
        await fs.writeFile(unreadableFile, "blocked\n", "utf-8");
        await fs.chmod(unreadableFile, 0o000);
      },
    );

    await expect(
      SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(skill, {
        repoUrl: "https://gitea.example.com/team/skills",
        branch: "main",
        directory: "skills/partial-copy",
      }),
    ).rejects.toThrow();

    await expect(
      fs.readFile(path.join(originalRepoPath, "SKILL.md"), "utf-8"),
    ).resolves.toBe("# Original Skill\n\nDo not remove.\n");
    expect(await listRemoteImportTempDirs()).toEqual([]);
  });
});
