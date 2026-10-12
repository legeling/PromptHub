import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { array, inventory, invoke, isolateAgents, object, string } from "./release-acceptance-cross-surface-runtime";

const WORKFLOW_TIMEOUT_MS = 60_000;
let root = "";
let profile = "";

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cross-cli-agents-")));
  profile = path.join(root, "profile");
  isolateAgents(profile, root);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it("persists Agent paths, config reads, identity and custom lifecycle across independent CLI processes", async () => {
  const nativeRoot = path.join(root, "custom");
  fs.mkdirSync(nativeRoot);
  const original = 'model = "fixture-model"\napi_key = "synthetic-test-credential"\n';
  fs.writeFileSync(path.join(nativeRoot, "config.toml"), original);
  fs.writeFileSync(path.join(nativeRoot, "sentinel.bin"), Buffer.from([0, 128, 255]));
  const before = inventory(nativeRoot);
  const added = await invoke(profile, ["agent", "add", "--id", "acceptance-agent", "--name", "Acceptance Agent", "--root", nativeRoot, "--config-paths", "config.toml"]);
  expect(added).toMatchObject({ id: "acceptance-agent", isCustom: true, enabled: true });
  const configuredRoot = path.join(root, "configured-codex");
  fs.mkdirSync(configuredRoot);
  await invoke(profile, ["agent", "configure", "codex", "--root", configuredRoot, "--skills-path", "assets/skills"]);
  expect(await invoke(profile, ["agent", "get", "codex"])).toMatchObject({ id: "codex", paths: { root: configuredRoot, skills: path.join(configuredRoot, "assets/skills") } });
  await invoke(profile, ["agent", "identity", "set", "--name", "chatgpt", "--icon", "chatgpt"]);
  expect(await invoke(profile, ["agent", "identity", "get"])).toEqual({ name: "chatgpt", icon: "chatgpt" });
  expect(await invoke(profile, ["agent", "get", "codex"])).toMatchObject({ id: "codex", name: "ChatGPT" });
  const files = array(await invoke(profile, ["agent", "config", "list", "acceptance-agent"]));
  expect(files).toEqual(expect.arrayContaining([expect.objectContaining({ path: "config.toml" })]));
  const read = object(await invoke(profile, ["agent", "config", "read", "acceptance-agent", "config.toml"]));
  expect(read.redacted).toBe(true);
  expect(string(read.content)).not.toContain("synthetic-test-credential");
  expect(string(read.revision)).toMatch(/^[a-f0-9]{64}$/);
  await invoke(profile, ["agent", "update", "acceptance-agent", "--name", "Updated Agent", "--skills-path", "packages", "--disabled"]);
  expect(await invoke(profile, ["agent", "get", "acceptance-agent", "--include-disabled"])).toMatchObject({ name: "Updated Agent", enabled: false, paths: { skills: path.join(nativeRoot, "packages") } });
  await invoke(profile, ["agent", "enable", "acceptance-agent"]);
  expect(await invoke(profile, ["agent", "get", "acceptance-agent"])).toMatchObject({ enabled: true });
  await invoke(profile, ["agent", "delete", "acceptance-agent"]);
  expect(array(await invoke(profile, ["agent", "list", "--include-disabled"])).some((value) => object(value).id === "acceptance-agent")).toBe(false);
  expect(inventory(nativeRoot)).toEqual(before);
  expect(await invoke(profile, ["agent", "identity", "get"])).toEqual({ name: "chatgpt", icon: "chatgpt" });
}, WORKFLOW_TIMEOUT_MS);

it("rejects invalid Agent path, duplicate and identity inputs without changing settings or native files", async () => {
  const nativeRoot = path.join(root, "custom");
  fs.mkdirSync(nativeRoot);
  fs.writeFileSync(path.join(nativeRoot, "sentinel"), "unchanged");
  await invoke(profile, ["agent", "add", "--id", "one", "--name", "One", "--root", nativeRoot]);
  const before = await invoke(profile, ["agent", "list", "--include-disabled"]);
  const identity = await invoke(profile, ["agent", "identity", "get"]);
  const failures = [
    { args: ["agent", "configure", "codex", "--skills-path", "../outside"], status: 2 },
    { args: ["agent", "identity", "set", "--name", "invalid"], status: 2 },
    { args: ["agent", "add", "--id", "codex", "--name", "Duplicate", "--root", path.join(root, "duplicate")], status: 4 },
    { args: ["agent", "add", "--id", "two", "--name", "Duplicate root", "--root", nativeRoot], status: 4 },
  ];
  for (const failure of failures) {
    const result = await invoke(profile, failure.args, failure.status);
    expect(object(result).error).toHaveProperty("code");
  }
  expect(await invoke(profile, ["agent", "list", "--include-disabled"])).toEqual(before);
  expect(await invoke(profile, ["agent", "identity", "get"])).toEqual(identity);
  expect(fs.readFileSync(path.join(nativeRoot, "sentinel"), "utf8")).toBe("unchanged");
}, WORKFLOW_TIMEOUT_MS);

it("scans only the explicit package directory and preserves it through the import alias", async () => {
  const source = path.join(root, "sources", "scan-skill");
  fs.mkdirSync(path.join(source, "assets"), { recursive: true });
  fs.writeFileSync(path.join(source, "SKILL.md"), "---\nname: scan-skill\ndescription: Explicit scan\n---\nLiteral $& content\n");
  fs.writeFileSync(path.join(source, "assets", "blob.bin"), Buffer.from([0, 255, 128]));
  const before = inventory(source);
  const preview = array(await invoke(profile, ["skill", "scan", path.dirname(source)]));
  expect(preview).toHaveLength(1);
  expect(preview[0]).toMatchObject({ name: "scan-skill", localPath: source, platforms: ["Custom"] });
  await invoke(profile, ["skill", "import", source]);
  const imported = object(await invoke(profile, ["--full", "skill", "get", "scan-skill"]));
  const managed = string(imported.local_repo_path);
  expect(managed.startsWith(profile + path.sep)).toBe(true);
  const packageFiles = Object.fromEntries(Object.entries(inventory(managed)).filter(([name]) => !name.split(path.sep).some((segment) => segment === ".git" || segment === ".prompthub")));
  expect(packageFiles).toEqual(before);
  const rescan = array(await invoke(profile, ["skill", "scan", path.dirname(source)]));
  expect(rescan).toHaveLength(1);
  expect(rescan[0]).toMatchObject({ name: "scan-skill", localPath: source });
  expect(inventory(source)).toEqual(before);
}, WORKFLOW_TIMEOUT_MS);
