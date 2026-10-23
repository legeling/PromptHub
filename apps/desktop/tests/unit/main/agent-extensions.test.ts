import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { parse } from "jsonc-parser";
import { createAgentUserConfigFileService } from "@prompthub/core/agent-management/agent-user-config-files";
import { createAgentExtensionsService } from "@prompthub/core/agent-management/agent-extensions";

let root: string;
let backups: Array<string | null>;
let service: ReturnType<typeof createAgentExtensionsService>;
const definition =
  "---\nname: Reviewer v2\ndescription: Review code\ntools: Read, Grep\ncustomField: retained\n---\nReview only.\n";
beforeEach(async () => {
  root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-agent-extensions-"),
  );
  backups = [];
  service = createAgentExtensionsService(
    createAgentUserConfigFileService({
      createBackup: async ({ content }) => {
        backups.push(content);
      },
    }),
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

it("creates, edits, reopens and removes a native SubAgent without changing unknown fields", async () => {
  const target = {
    agentId: "claude",
    kind: "subagent" as const,
    relativePath: "agents/review.md",
  };
  const created = await service.write(root, target, definition);
  expect(await service.list(root, "claude")).toEqual(["agents/review.md"]);
  const edited = await service.write(
    root,
    target,
    definition.replace("Review only.", "Review carefully."),
    created.revision,
  );
  expect((await service.read(root, target)).content).toContain(
    "customField: retained",
  );
  await service.remove(root, target, edited.revision!);
  expect(await service.list(root, "claude")).toEqual([]);
  expect(backups).toEqual([
    null,
    definition,
    definition.replace("Review only.", "Review carefully."),
  ]);
});

it("merges only hooks while preserving comments, unknown settings and masked credentials", async () => {
  const original =
    '{\n// preserved\n"env":{"ANTHROPIC_API_KEY":"fixture-private-secret"},"unknown":{"x":1}}';
  await fs.writeFile(path.join(root, "settings.json"), original);
  const target = {
    agentId: "claude",
    kind: "hooks" as const,
    relativePath: "settings.json",
  };
  const read = await service.read(root, target);
  expect(read.content).toBe("{}");
  const hooks = {
    SessionStart: [
      {
        hooks: [
          { type: "command", command: "printf fixture", customField: true },
        ],
      },
    ],
  };
  const saved = await service.write(
    root,
    target,
    JSON.stringify(hooks),
    read.revision,
  );
  const disk = await fs.readFile(path.join(root, "settings.json"), "utf8");
  expect(disk).toContain("// preserved");
  expect(disk).toContain("fixture-private-secret");
  expect(parse(disk).unknown).toEqual({ x: 1 });
  expect(JSON.parse(saved.content)).toEqual(hooks);
  await service.write(root, target, "{}", saved.revision);
  expect(JSON.parse((await service.read(root, target)).content)).toEqual({});
});

it("rejects stale saves/deletes, invalid YAML/hooks and escaping paths without mutation", async () => {
  const target = {
    agentId: "claude",
    kind: "subagent" as const,
    relativePath: "agents/review.md",
  };
  const created = await service.write(root, target, definition);
  await fs.writeFile(
    path.join(root, target.relativePath),
    `${definition}External change`,
  );
  await expect(
    service.write(root, target, definition, created.revision),
  ).rejects.toThrow("CONCURRENT_CHANGE");
  await expect(service.remove(root, target, created.revision!)).rejects.toThrow(
    "CONCURRENT_CHANGE",
  );
  await expect(
    service.write(
      root,
      { ...target, relativePath: "agents/new.md" },
      "---\nname: bad:name\n---\n",
    ),
  ).rejects.toThrow("AGENT_SUBAGENT_INVALID");
  await expect(
    service.write(
      root,
      { agentId: "claude", kind: "hooks", relativePath: "settings.json" },
      '{"SessionStart":[{"hooks":[{"type":"command"}]}]}',
    ),
  ).rejects.toThrow("AGENT_HOOKS_INVALID");
  await expect(
    service.write(
      root,
      { ...target, relativePath: "../escape.md" },
      definition,
    ),
  ).rejects.toThrow("AGENT_EXTENSION_PATH_INVALID");
  await fs.symlink(path.join(root, "agents"), path.join(root, "linked"));
  await fs.symlink(
    path.join(root, "agents/review.md"),
    path.join(root, "agents/link.md"),
  );
  await expect(
    service.read(root, { ...target, relativePath: "agents/link.md" }),
  ).rejects.toThrow("SYMLINK");
  expect(await fs.readFile(path.join(root, target.relativePath), "utf8")).toBe(
    `${definition}External change`,
  );
});

it("does not mutate files when backup fails", async () => {
  const target = {
    agentId: "claude",
    kind: "subagent" as const,
    relativePath: "agents/review.md",
  };
  const created = await service.write(root, target, definition);
  const failing = createAgentExtensionsService(
    createAgentUserConfigFileService({
      createBackup: async () => {
        throw new Error("BACKUP_FAILED");
      },
    }),
  );
  await expect(failing.remove(root, target, created.revision!)).rejects.toThrow(
    "BACKUP_FAILED",
  );
  expect(await fs.readFile(path.join(root, target.relativePath), "utf8")).toBe(
    definition,
  );
});
