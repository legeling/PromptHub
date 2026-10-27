import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { materializeRemoteGitRepository } from "../src/skills/git-materialize";

let root: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = undefined;
});

it("passes the selected package directory to Git before any archive request", async () => {
  const repo = parseGitRepo("https://example.com/owner/skills");
  if (!repo) throw new Error("Invalid fixture repository");
  root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-git-materialize-"));
  const clone = vi.fn(async (_url: string, target: string) => {
    await fs.mkdir(target);
  });
  const archive = vi.fn(async () => new Uint8Array());
  await materializeRemoteGitRepository(
    repo,
    "release",
    root,
    archive,
    "skills/writer",
    clone,
  );
  expect(clone).toHaveBeenCalledWith(
    repo.cloneUrl,
    path.join(root, "checkout"),
    "release",
    "skills/writer",
  );
  expect(archive).not.toHaveBeenCalled();
});

it.each(["../escape", "/absolute", "C:\\outside", "skills/\0bad"])(
  "rejects unsafe directory %j before Git or archive acquisition",
  async (directory) => {
    const repo = parseGitRepo("https://example.com/owner/skills");
    if (!repo) throw new Error("Invalid fixture repository");
    const clone = vi.fn(async () => undefined);
    const archive = vi.fn(async () => new Uint8Array());
    await expect(
      materializeRemoteGitRepository(
        repo,
        undefined,
        "/fixture/staging",
        archive,
        directory,
        clone,
      ),
    ).rejects.toThrow(/relative path/);
    expect(clone).not.toHaveBeenCalled();
    expect(archive).not.toHaveBeenCalled();
  },
);
