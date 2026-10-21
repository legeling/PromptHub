import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { cloneSkillRepository } from "../src/skills/git-transport";

it("checks out a selected branch with real Git and reports a missing branch", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-git-transport-"));
  try {
    const source = path.join(root, "repository");
    await fs.mkdir(source);
    const git = (...args: string[]): void => {
      execFileSync("git", ["-C", source, ...args], {
        stdio: "pipe",
        windowsHide: true,
      });
    };
    git("init", "--initial-branch=main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "core.autocrlf", "false");
    git("config", "core.hooksPath", path.join(source, ".git", "empty-hooks"));
    await fs.writeFile(path.join(source, ".gitattributes"), "* -text\n");
    await fs.writeFile(path.join(source, "SKILL.md"), "# Main\n");
    git("add", ".");
    git("-c", "commit.gpgsign=false", "commit", "-m", "fixture");
    git("checkout", "-b", "selected");
    await fs.writeFile(path.join(source, "SKILL.md"), "# Selected\n");
    git("-c", "commit.gpgsign=false", "commit", "-am", "selected");
    const destination = path.join(root, "checkout");
    const url = pathToFileURL(source).href;
    // Only the URL policy is replaced to permit this isolated local protocol fixture.
    const validateFixture = (candidate: string): void => {
      expect(candidate).toBe(url);
    };
    await cloneSkillRepository(
      url,
      destination,
      "selected",
      undefined,
      validateFixture,
    );
    expect(await fs.readFile(path.join(destination, "SKILL.md"), "utf8")).toBe(
      "# Selected\n",
    );
    await expect(
      cloneSkillRepository(
        url,
        path.join(root, "missing"),
        "absent",
        undefined,
        validateFixture,
      ),
    ).rejects.toThrow(/Git clone failed/);
    expect(await fs.readFile(path.join(destination, "SKILL.md"), "utf8")).toBe(
      "# Selected\n",
    );
    await expect(
      cloneSkillRepository(url, path.join(root, "rejected")),
    ).rejects.toThrow(/Only HTTPS/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}, 30_000);
