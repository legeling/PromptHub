/** @vitest-environment node */
import {
  createSkillTestRuntime,
  skillApi,
  fileInventory,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { execFile, execFileSync, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { buildSkillPackageOperationSource } from "../../src/renderer/services/skill-package-operation";
import { gitListRemoteBranches } from "../../src/main/services/skill-installer-utils";

const fixtureTimeoutMs = 30_000;
const fixtureOutputBytes = 2 * 1024 * 1024;
const namespace = "eCore-ai/Skills/his-requirement-design-stable";
const content =
  "---\nname: design\ndescription: GitLab fixture\n---\n# Design\n";
const files = {
  "SKILL.md": Buffer.from(content),
  "docs/nested/guide.md": Buffer.from("# Guide\n"),
  "assets/icon.bin": Buffer.from([0, 255, 128, 42]),
};
let runtime: SkillTestRuntime;
let server: http.Server | undefined;
const children = new Set<ChildProcess>();
let repository: string;

function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    timeout: fixtureTimeoutMs,
    maxBuffer: fixtureOutputBytes,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  for (const [key, value] of Object.entries({
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "0",
    GIT_TERMINAL_PROMPT: "0",
  }))
    vi.stubEnv(key, value);
  repository = path.join(runtime.root, "gitlab", namespace);
  await fs.mkdir(repository, { recursive: true });
  git("init", "--initial-branch=main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "core.hooksPath", path.join(runtime.root, "no-hooks"));
  git("config", "uploadpack.allowFilter", "true");
  for (const [name, bytes] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(repository, name)), {
      recursive: true,
    });
    await fs.writeFile(path.join(repository, name), bytes);
  }
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "-m", "Fixture");
});

afterEach(async () => {
  for (const child of children) child.kill("SIGKILL");
  await Promise.all([...children].map((child) => once(child, "close")));
  children.clear();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
    server = undefined;
  }
  runtime?.dispose();
  vi.unstubAllEnvs();
});

// A real smart-HTTP Git endpoint; no clone, DNS, scanner or installer mocks.
async function startGitHttp(): Promise<string> {
  server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://fixture");
    const child = execFile(
      "git",
      ["http-backend"],
      {
        timeout: fixtureTimeoutMs,
        maxBuffer: fixtureOutputBytes,
        encoding: "buffer",
        env: {
          ...process.env,
          GIT_PROJECT_ROOT: path.join(runtime.root, "gitlab"),
          GIT_HTTP_EXPORT_ALL: "1",
          PATH_INFO: url.pathname,
          QUERY_STRING: url.search.slice(1),
          REQUEST_METHOD: request.method,
          CONTENT_TYPE: request.headers["content-type"] || "",
        },
      },
      (error, output) => {
        if (error) {
          response.writeHead(500);
          response.end("Git fixture failed");
          return;
        }
        const split = output.indexOf("\r\n\r\n");
        for (const header of output
          .subarray(0, split)
          .toString()
          .split("\r\n")) {
          const colon = header.indexOf(":");
          const name = header.slice(0, colon);
          const value = header.slice(colon + 1).trim();
          if (name.toLowerCase() === "status")
            response.statusCode = Number(value.split(" ")[0]);
          else response.setHeader(name, value);
        }
        response.end(output.subarray(split + 4));
      },
    );
    children.add(child);
    child.once("close", () => children.delete(child));
    request.pipe(child.stdin!);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  return `http://127.0.0.1:${address.port}/${namespace}`;
}

it.each(["http", "ssh"])(
  "scans, installs and reopens a nested GitLab repository over %s",
  async (transport) => {
    const url =
      transport === "http"
        ? await startGitHttp()
        : `git@gitlab.invalid:${namespace}.git`;
    if (transport === "ssh") {
      // Only SSH transport is redirected to an isolated file remote. URL validation,
      // native Git, registered IPC, package publication and SQLite are unchanged.
      vi.stubEnv("GIT_CONFIG_COUNT", "1");
      vi.stubEnv(
        "GIT_CONFIG_KEY_0",
        `url.${pathToFileURL(repository).href}.insteadOf`,
      );
      vi.stubEnv("GIT_CONFIG_VALUE_0", url);
    }
    expect(parseGitRepo(url)?.owner).toBe("eCore-ai/Skills");
    expect(await gitListRemoteBranches(url)).toEqual(["main"]);
    const entries = await skillApi.scanRemoteGithub(url, []);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.source_url).toBe(url);
    expect(entry.content_url).toBeUndefined();
    expect(entry.source_branch).toBe("main");
    expect(entry.source_label).toBe(namespace);
    const source = buildSkillPackageOperationSource(entry, content);
    expect(source).toMatchObject({ kind: "remote-git", repoUrl: url });
    const snapshot = await skillApi.getRemoteGitPackageSnapshot({
      repoUrl: url,
      branch: "main",
    });
    expect(snapshot.content).toBe(content);
    const result = await skillApi.runPackageOperation({
      operation: "install",
      source,
      content,
      registrySkill: entry,
      approvedPackageFingerprint: snapshot.directoryFingerprint,
    });
    expect(result.status, JSON.stringify(result)).toBe("completed");
    if (result.status !== "completed")
      throw new Error("Package install failed");
    await runtime.reopen();
    const reopened = await skillApi.get(result.skill.id);
    expect(reopened?.source_url).toBe(url);
    if (!reopened?.local_repo_path)
      throw new Error("Missing persisted package");
    const inventory = fileInventory(reopened.local_repo_path);
    delete inventory[".canonical-bundle-hash"];
    expect(inventory).toEqual(
      Object.fromEntries(
        Object.entries(files).map(([name, bytes]) => [
          name,
          bytes.toString("base64"),
        ]),
      ),
    );
    await expect(
      skillApi.scanRemoteGithub(`${url}-missing`, []),
    ).rejects.toThrow();
    expect(await skillApi.get(result.skill.id)).toEqual(reopened);
  },
  fixtureTimeoutMs,
);
