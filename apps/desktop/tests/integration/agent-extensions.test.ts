import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAgentExtensionsService } from "@prompthub/core/agent-management/agent-extensions";
import { createAgentUserConfigFileService } from "@prompthub/core/agent-management/agent-user-config-files";
import { registerAgentExtensionIPC } from "../../src/main/ipc/agent-extension.ipc";
import { getDatabase } from "../../src/main/database";
import { agentApi } from "../../src/preload/api/agent";

let runtime: SkillTestRuntime;
function register(): void {
  registerAgentExtensionIPC(
    getDatabase(),
    createAgentExtensionsService(
      createAgentUserConfigFileService({
        createBackup: async ({ content, sourcePath }) => {
          if (content !== null)
            fs.writeFileSync(
              path.join(runtime.root, `backup-${path.basename(sourcePath)}`),
              content,
            );
        },
      }),
    ),
  );
}
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  register();
});
afterEach(() => runtime.dispose());
const body =
  "---\nname: reviewer\ndescription: Review fixture\nmemory: user\n---\nNATIVE_AGENT_MARKER\n";
it("routes CLI user extensions to the sibling shared config, not CLI settings", async () => {
  const target = {
    agentId: "antigravity-cli",
    scope: "user" as const,
    kind: "hooks" as const,
    relativePath: "hooks.json",
  };
  const content =
    '{"audit":{"enabled":false,"SessionStart":[{"command":"printf fixture"}]}}';
  const saved = await agentApi.writeAgentExtension({ ...target, content });
  const sharedPath = path.resolve(
    runtime.platformRoot("antigravity-cli"),
    "../config/hooks.json",
  );
  expect(JSON.parse(fs.readFileSync(sharedPath, "utf8"))).toEqual(
    JSON.parse(content),
  );
  expect(
    fs.existsSync(
      path.join(runtime.platformRoot("antigravity-cli"), "hooks.json"),
    ),
  ).toBe(false);
  await runtime.reopen();
  register();
  expect(
    JSON.parse((await agentApi.readAgentExtension(target)).content),
  ).toEqual(JSON.parse(content));
  await agentApi.writeAgentExtension({
    ...target,
    expectedRevision: saved.revision!,
    content: "{}",
  });
  expect(JSON.parse(fs.readFileSync(sharedPath, "utf8"))).toEqual({});
});

it("real preload and IPC preserve user/project isolation through save, reopen and delete", async () => {
  const project = path.join(runtime.root, "project");
  fs.mkdirSync(project);
  const projects = [
    {
      id: "fixture",
      name: "Fixture",
      rootPath: project,
      scanPaths: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  getDatabase()
    .prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)")
    .run("skillProjects", JSON.stringify(projects));
  const user = {
    agentId: "claude",
    scope: "user" as const,
    kind: "subagent" as const,
    relativePath: "agents/reviewer.md",
  };
  const created = await agentApi.writeAgentExtension({
    ...user,
    content: body,
  });
  const projectTarget = {
    ...user,
    agentId: "claude",
    scope: "project" as const,
    projectId: "fixture",
  };
  await agentApi.writeAgentExtension({
    ...projectTarget,
    content: body.replace("NATIVE_AGENT_MARKER", "PROJECT_MARKER"),
  });
  const hooks = {
    agentId: "claude",
    scope: "local" as const,
    projectId: "fixture",
    kind: "hooks" as const,
    relativePath: "settings.local.json",
  };
  await agentApi.writeAgentExtension({
    ...hooks,
    content:
      '{"Stop":[{"hooks":[{"type":"prompt","prompt":"Verify completion"}]}]}',
  });
  expect(
    fs.readFileSync(path.join(project, ".claude/agents/reviewer.md"), "utf8"),
  ).toContain("PROJECT_MARKER");
  expect(fs.existsSync(path.join(project, ".claude/settings.local.json"))).toBe(
    true,
  );
  await runtime.reopen();
  register();
  expect(
    await agentApi.listAgentExtensions({ agentId: "claude", scope: "user" }),
  ).toEqual([user.relativePath]);
  expect((await agentApi.readAgentExtension(user)).content).toBe(body);
  await agentApi.deleteAgentExtension({
    ...user,
    expectedRevision: created.revision!,
  });
  expect(
    await agentApi.listAgentExtensions({ agentId: "claude", scope: "user" }),
  ).toEqual([]);
  expect(fs.existsSync(path.join(project, ".claude/agents/reviewer.md"))).toBe(
    true,
  );
  expect(
    fs.readFileSync(path.join(runtime.root, "backup-reviewer.md"), "utf8"),
  ).toBe(body);
});

it("rejects unregistered projects and wrong scope paths before native writes", async () => {
  await expect(
    agentApi.writeAgentExtension({
      agentId: "claude",
      scope: "project",
      projectId: "missing",
      kind: "subagent",
      relativePath: "agents/a.md",
      content: body,
    }),
  ).rejects.toThrow("PROJECT_NOT_FOUND");
  await expect(
    agentApi.writeAgentExtension({
      agentId: "claude",
      scope: "user",
      kind: "hooks",
      relativePath: "settings.local.json",
      content: "{}",
    }),
  ).rejects.toThrow("REQUEST_INVALID");
  await expect(
    agentApi.writeAgentExtension({
      agentId: "claude",
      scope: "user",
      kind: "subagent",
      relativePath: "agents/../../outside.md",
      content: body,
    }),
  ).rejects.toThrow("PATH_INVALID");
  expect(fs.existsSync(path.join(runtime.root, "outside.md"))).toBe(false);
});

it("routes every mainstream adapter through real preload, registered projects and native files", async () => {
  const project = path.join(runtime.root, "project");
  fs.mkdirSync(project);
  getDatabase()
    .prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)")
    .run(
      "skillProjects",
      JSON.stringify([
        {
          id: "fixture",
          name: "Fixture",
          rootPath: project,
          scanPaths: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );
  const adapters = [
    {
      agentId: "opencode",
      directory: ".opencode",
      extension: "md",
      content: "---\ndescription: Review\nmode: subagent\n---\nOPENCODE_MARKER",
    },
    {
      agentId: "cursor",
      directory: ".cursor",
      extension: "md",
      content: "---\nmodel: inherit\n---\nCURSOR_MARKER",
    },
    {
      agentId: "codex",
      directory: ".codex",
      extension: "toml",
      content:
        'name = "reviewer"\ndescription = "Review"\ndeveloper_instructions = "CODEX_MARKER"',
    },
    { agentId: "gemini", directory: ".gemini", extension: "md", content: body },
    {
      agentId: "antigravity",
      directory: ".agents",
      extension: "md",
      content: body,
    },
    {
      agentId: "antigravity-cli",
      directory: ".agents",
      extension: "md",
      content: body,
    },
  ];
  for (const adapter of adapters) {
    const request = {
      agentId: adapter.agentId,
      scope: "project" as const,
      projectId: "fixture",
      kind: "subagent" as const,
      relativePath: `agents/reviewer.${adapter.extension}`,
    };
    const created = await agentApi.writeAgentExtension({
      ...request,
      content: adapter.content,
    });
    expect(
      fs.readFileSync(
        path.join(project, adapter.directory, request.relativePath),
        "utf8",
      ),
    ).toBe(adapter.content);
    expect(await agentApi.listAgentExtensions(request)).toEqual([
      request.relativePath,
    ]);
    expect(
      await agentApi.listAgentExtensions({
        agentId: adapter.agentId,
        scope: "user",
      }),
    ).toEqual([]);
    await runtime.reopen();
    register();
    expect((await agentApi.readAgentExtension(request)).content).toBe(
      adapter.content,
    );
    await agentApi.deleteAgentExtension({
      ...request,
      expectedRevision: created.revision!,
    });
    expect(await agentApi.listAgentExtensions(request)).toEqual([]);
  }
  await expect(
    agentApi.writeAgentExtension({
      agentId: "opencode",
      scope: "user",
      kind: "hooks",
      relativePath: "hooks.json",
      content: "{}",
    }),
  ).rejects.toThrow("REQUEST_INVALID");
  await expect(
    agentApi.listAgentExtensions({
      agentId: "cursor",
      scope: "local",
      projectId: "fixture",
    }),
  ).rejects.toThrow("REQUEST_INVALID");
  await expect(
    agentApi.listAgentExtensions({ agentId: "unknown", scope: "user" }),
  ).rejects.toThrow("UNSUPPORTED");
});
