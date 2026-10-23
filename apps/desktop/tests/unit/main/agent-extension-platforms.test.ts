import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAgentExtensionsService } from "@prompthub/core/agent-management/agent-extensions";
import { createAgentUserConfigFileService } from "@prompthub/core/agent-management/agent-user-config-files";

let root: string;
let service: ReturnType<typeof createAgentExtensionsService>;
beforeEach(async () => {
  root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-agent-extensions-"),
  );
  service = createAgentExtensionsService(
    createAgentUserConfigFileService({ createBackup: async () => undefined }),
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

it.each([
  [
    "opencode",
    "md",
    "---\ndescription: Review\nmode: subagent\npermission:\n  edit: deny\n---\nReview only.",
  ],
  ["cursor", "md", "---\nmodel: inherit\n---\nReview only."],
  [
    "codex",
    "toml",
    'name = "reviewer"\ndescription = "Review"\ndeveloper_instructions = "Review only."\n',
  ],
  [
    "gemini",
    "md",
    "---\nname: reviewer\ndescription: Review\ntools: []\n---\nReview only.",
  ],
  [
    "antigravity",
    "md",
    "---\nname: reviewer\ndescription: Review\ntools: []\n---\nReview only.",
  ],
])(
  "persists, reopens and deletes %s native subagents",
  async (agentId, extension, content) => {
    const target = {
      agentId,
      kind: "subagent" as const,
      relativePath: `agents/reviewer.${extension}`,
    };
    const created = await service.write(root, target, content);
    expect(await service.list(root, agentId)).toEqual([target.relativePath]);
    expect((await service.read(root, target)).content).toBe(content);
    const edited = await service.write(
      root,
      target,
      content.replace("Review only.", "Review carefully."),
      created.revision,
    );
    expect(
      await fs.readFile(path.join(root, target.relativePath), "utf8"),
    ).toContain("Review carefully.");
    await service.remove(root, target, edited.revision!);
    expect(await service.list(root, agentId)).toEqual([]);
  },
);

it.each([
  ["cursor", "hooks.json", { stop: [{ command: "printf fixture" }] }],
  [
    "codex",
    "hooks.json",
    {
      SessionStart: [
        { hooks: [{ type: "command", command: "printf fixture" }] },
      ],
    },
  ],
  [
    "gemini",
    "settings.json",
    {
      BeforeAgent: [
        { hooks: [{ type: "command", command: "printf fixture" }] },
      ],
    },
  ],
  [
    "antigravity",
    "hooks.json",
    {
      audit: { enabled: false, SessionStart: [{ command: "printf fixture" }] },
    },
  ],
])(
  "preserves %s native hooks shapes without executing them",
  async (agentId, relativePath, hooks) => {
    const target = { agentId, relativePath, kind: "hooks" as const };
    const created = await service.write(root, target, JSON.stringify(hooks));
    expect(JSON.parse((await service.read(root, target)).content)).toEqual(
      hooks,
    );
    const disk = JSON.parse(
      await fs.readFile(path.join(root, relativePath), "utf8"),
    );
    if (agentId === "antigravity") expect(disk).toEqual(hooks);
    else expect(disk.hooks).toEqual(hooks);
    if (agentId === "cursor") expect(disk.version).toBe(1);
    await service.write(root, target, "{}", created.revision);
    expect((await service.read(root, target)).content).toBe("{}");
  },
);

it("rejects cross-platform shapes and unsupported executable plugin writes", async () => {
  await expect(
    service.write(
      root,
      { agentId: "opencode", kind: "hooks", relativePath: "hooks.json" },
      "{}",
    ),
  ).rejects.toThrow("PATH_INVALID");
  await expect(
    service.write(
      root,
      { agentId: "codex", kind: "subagent", relativePath: "agents/a.md" },
      "---\nname: a\n---\n",
    ),
  ).rejects.toThrow("PATH_INVALID");
  await expect(
    service.write(
      root,
      { agentId: "cursor", kind: "hooks", relativePath: "hooks.json" },
      '{"stop":[{"hooks":[{"type":"command","command":"printf no"}]}]}',
    ),
  ).rejects.toThrow("HOOKS_INVALID");
  await expect(
    service.write(
      root,
      { agentId: "gemini", kind: "subagent", relativePath: "agents/a.md" },
      "---\nname: A space\ndescription: Review\n---\n",
    ),
  ).rejects.toThrow("SUBAGENT_INVALID");
  await expect(service.list(root, "unknown")).rejects.toThrow("UNSUPPORTED");
  expect(await fs.readdir(root)).toEqual([]);
});

it("retains Cursor version, comments and unrelated settings on hooks updates", async () => {
  const original =
    '{\n// owned by Cursor\n"version": 1, "custom": true, "hooks": {}}';
  await fs.writeFile(path.join(root, "hooks.json"), original);
  const target = {
    agentId: "cursor",
    kind: "hooks" as const,
    relativePath: "hooks.json",
  };
  const read = await service.read(root, target);
  await service.write(
    root,
    target,
    '{"stop":[{"command":"printf fixture"}]}',
    read.revision,
  );
  const disk = await fs.readFile(path.join(root, "hooks.json"), "utf8");
  expect(disk).toContain("// owned by Cursor");
  expect(disk).toContain('"custom": true');
  await expect(
    service.write(root, target, "{}", read.revision),
  ).rejects.toThrow("CONCURRENT_CHANGE");
  expect(await fs.readFile(path.join(root, "hooks.json"), "utf8")).toBe(disk);
});
