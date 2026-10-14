import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentSessionService } from "../../../src/main/services/agent-session-service";

const temporaryRoots: string[] = [];

async function createHome(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-agent-session-"),
  );
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Agent session service", () => {
  it("uses Qwen's bounded JSONL session index and reads only the selected transcript", async () => {
    const homeDir = await createHome();
    const runtimeRoot = path.join(homeDir, "qwen-runtime");
    const transcriptPath = path.join(
      runtimeRoot,
      "projects",
      "workspace-project",
      "chats",
      "550e8400-e29b-41d4-a716-446655440000.jsonl",
    );
    await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
    await fs.writeFile(
      transcriptPath,
      [
        JSON.stringify({
          uuid: "message-1",
          parentUuid: null,
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          timestamp: "2026-07-22T08:00:00.000Z",
          type: "user",
          cwd: "/workspace/project",
          message: { role: "user", parts: [{ text: "Review Qwen support" }] },
        }),
        "{ malformed",
        JSON.stringify({
          uuid: "message-2",
          parentUuid: "message-1",
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          timestamp: "2026-07-22T08:01:00.000Z",
          type: "assistant",
          cwd: "/workspace/project",
          message: {
            role: "model",
            parts: [{ text: "The adapter is ready." }],
          },
        }),
      ].join("\n"),
    );
    const run = vi.fn().mockResolvedValue({
      stdout: [
        JSON.stringify({
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          startTime: "2026-07-22T08:00:00.000Z",
          mtime: "2026-07-22T08:01:00.000Z",
          prompt: "Review Qwen support",
          gitBranch: "main",
          customTitle: "Qwen integration",
          titleSource: "custom",
          filePath: transcriptPath,
          cwd: "/workspace/project",
        }),
        "{ malformed metadata",
      ].join("\n"),
      stderr: "",
    });
    const service = createAgentSessionService({
      homeDir,
      qwenRuntimeDir: runtimeRoot,
      commandRunner: {
        resolve: vi.fn().mockResolvedValue("/opt/homebrew/bin/qwen"),
        run,
      },
    });

    const list = await service.list("qwen", { limit: 20 });
    expect(list).toMatchObject({
      agentId: "qwen",
      adapter: "qwen-cli-jsonl-v1",
      total: 1,
      hasMore: false,
      sessions: [
        expect.objectContaining({
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "Qwen integration",
          projectPath: "/workspace/project",
          sizeBytes: (await fs.stat(transcriptPath)).size,
          nativeDeleteSupported: true,
          sourcePath: await fs.realpath(transcriptPath),
          resume: {
            executable: "/opt/homebrew/bin/qwen",
            args: ["--resume", "550e8400-e29b-41d4-a716-446655440000"],
            environment: { QWEN_RUNTIME_DIR: runtimeRoot },
            cwd: "/workspace/project",
          },
        }),
      ],
    });
    expect(run).toHaveBeenCalledWith(
      "/opt/homebrew/bin/qwen",
      ["sessions", "list", "--json", "--limit", "21"],
      expect.objectContaining({ maxBuffer: 2 * 1024 * 1024, env: expect.objectContaining({ QWEN_RUNTIME_DIR: runtimeRoot }) }),
    );

    const detail = await service.read(
      "qwen",
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(detail).toMatchObject({
      adapter: "qwen-cli-jsonl-v1",
      parseErrors: 1,
      truncated: false,
    });
    expect(detail.entries.map((entry) => [entry.role, entry.text])).toEqual([
      ["user", "Review Qwen support"],
      ["assistant", "The adapter is ready."],
    ]);
    await service.delete("qwen", "550e8400-e29b-41d4-a716-446655440000");
    await expect(fs.access(transcriptPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.skipIf(process.platform === "win32")(
    "rejects Qwen transcript symlinks that escape the runtime root",
    async () => {
      const homeDir = await createHome();
      const runtimeRoot = path.join(homeDir, "qwen-runtime");
      const chatsDir = path.join(runtimeRoot, "projects", "project", "chats");
      const outsidePath = path.join(homeDir, "outside-session.jsonl");
      const linkedPath = path.join(chatsDir, "session-link.jsonl");
      await fs.mkdir(chatsDir, { recursive: true });
      await fs.writeFile(
        outsidePath,
        `${JSON.stringify({ sessionId: "session-link", message: { parts: [{ text: "secret" }] } })}\n`,
      );
      await fs.symlink(outsidePath, linkedPath);
      const service = createAgentSessionService({
        homeDir,
        qwenRuntimeDir: runtimeRoot,
        commandRunner: {
          resolve: vi.fn().mockResolvedValue("/usr/local/bin/qwen"),
          run: vi.fn().mockResolvedValue({
            stdout: JSON.stringify({
              sessionId: "session-link",
              filePath: linkedPath,
              prompt: "Escaped session",
            }),
            stderr: "",
          }),
        },
      });

      await expect(service.list("qwen", { limit: 10 })).resolves.toMatchObject({
        total: 0,
        sessions: [],
      });
      await expect(service.read("qwen", "session-link")).rejects.toThrow(
        "AGENT_SESSION_NOT_FOUND",
      );
    },
  );

  it("indexes and reads Claude JSONL lazily with malformed rows isolated", async () => {
    const homeDir = await createHome();
    const projectDir = path.join(
      homeDir,
      ".claude",
      "projects",
      "-Users-test-project",
    );
    await fs.mkdir(projectDir, { recursive: true });
    const currentPath = path.join(projectDir, "session-new.jsonl");
    await fs.writeFile(
      currentPath,
      [
        JSON.stringify({
          type: "user",
          isMeta: true,
          cwd: "/Users/test/project",
          message: {
            role: "user",
            content:
              "<local-command-caveat>Generated command context</local-command-caveat>",
          },
        }),
        JSON.stringify({
          type: "system",
          subtype: "local_command",
          cwd: "/Users/test/project",
          content: "Fix the release workflow",
        }),
        JSON.stringify({
          type: "user",
          cwd: "/Users/test/project",
          message: {
            role: "user",
            content: "<command-name>review</command-name>",
          },
        }),
        JSON.stringify({
          type: "last-prompt",
          content: "Fix the release workflow",
        }),
        JSON.stringify({
          type: "user",
          sessionId: "session-new",
          cwd: "/Users/test/project",
          timestamp: "2026-07-15T10:00:00.000Z",
          message: { role: "user", content: "Fix the release workflow" },
        }),
        "{ malformed",
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-07-15T10:01:00.000Z",
          message: { role: "assistant", content: "I found the issue." },
        }),
        JSON.stringify({
          type: "user",
          timestamp: "2026-07-15T10:02:00.000Z",
          message: {
            role: "user",
            content: [{ type: "tool_result", content: "Read completed" }],
          },
        }),
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(projectDir, "session-old.jsonl"),
      `${JSON.stringify({
        type: "user",
        sessionId: "../unsafe-session",
        cwd: "relative/project",
        message: { content: "Older task" },
      })}\n`,
    );
    await fs.utimes(
      path.join(projectDir, "session-old.jsonl"),
      new Date("2026-01-01"),
      new Date("2026-01-01"),
    );

    const service = createAgentSessionService({ homeDir });
    const result = await service.list("claude", { limit: 1 });
    const currentSize = (await fs.stat(currentPath)).size;

    expect(result.adapter).toBe("claude-jsonl-v1");
    expect(result.hasMore).toBe(true);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      id: "session-new",
      title: "Fix the release workflow",
      projectLabel: "project",
      projectPath: "/Users/test/project",
      sizeBytes: currentSize,
      nativeDeleteSupported: true,
      resume: {
        executable: "claude",
        args: ["--resume", "session-new"],
        cwd: "/Users/test/project",
      },
    });

    const detail = await service.read("claude", "session-new");
    expect(detail.entries).toMatchObject([
      { role: "user", text: "Fix the release workflow" },
      { role: "assistant", text: "I found the issue." },
      { role: "tool", text: "Read completed" },
    ]);
    expect(detail.parseErrors).toBe(1);
    expect(detail.truncated).toBe(false);

    const legacy = await service.list("claude", { limit: 1, offset: 1 });
    expect(legacy.sessions[0]).toMatchObject({
      id: "session-old",
      projectLabel: "-Users-test-project",
      projectPath: null,
      resume: {
        executable: "claude",
        args: ["--resume", "session-old"],
      },
    });
    expect(legacy.sessions[0].resume).not.toHaveProperty("cwd");

    await service.delete("claude", "session-new");
    await expect(fs.access(currentPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("uses OpenCode's global bounded database projection and sanitized export", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            id: "ses_123",
            title: "Review Agent adapters",
            updated: 1783674347562,
            created: 1783674135075,
            projectId: "project-1",
            directory: "/workspace/project",
            sizeBytes: 4096,
            messageCount: 3,
            total: 1,
          },
        ]),
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          info: { id: "ses_123", title: "Review Agent adapters" },
          messages: [{ role: "user", content: "Audit the adapter" }],
        }),
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "",
      });
    const service = createAgentSessionService({
      homeDir: await createHome(),
      commandRunner: {
        resolve: vi.fn().mockResolvedValue("/opt/homebrew/bin/opencode"),
        run,
      },
    });

    const list = await service.list("opencode", { limit: 20 });
    expect(list.sessions[0]).toMatchObject({
      id: "ses_123",
      title: "Review Agent adapters",
      projectPath: "/workspace/project",
      sizeBytes: 4096,
      messageCount: 3,
      nativeDeleteSupported: true,
      resume: {
        executable: "/opt/homebrew/bin/opencode",
        args: ["--session", "ses_123"],
      },
    });
    const detail = await service.read("opencode", "ses_123");
    expect(detail.entries[0].text).toContain("Audit the adapter");
    expect(run).toHaveBeenNthCalledWith(
      1,
      "/opt/homebrew/bin/opencode",
      [
        "db",
        expect.stringMatching(/FROM session s[\s\S]*LIMIT 20 OFFSET 0/),
        "--format",
        "json",
      ],
      expect.objectContaining({ maxBuffer: 2 * 1024 * 1024 }),
    );
    expect(run).toHaveBeenNthCalledWith(
      2,
      "/opt/homebrew/bin/opencode",
      ["export", "ses_123", "--sanitize"],
      expect.objectContaining({ maxBuffer: 2 * 1024 * 1024 }),
    );
    await service.delete("opencode", "ses_123");
    expect(run).toHaveBeenNthCalledWith(
      3,
      "/opt/homebrew/bin/opencode",
      ["session", "delete", "ses_123"],
      expect.objectContaining({ maxBuffer: 2 * 1024 * 1024 }),
    );
  });

  it("treats an empty OpenCode session list as no local history", async () => {
    const service = createAgentSessionService({
      homeDir: await createHome(),
      commandRunner: {
        resolve: vi.fn().mockResolvedValue("/opt/homebrew/bin/opencode"),
        run: vi.fn().mockResolvedValue({ stdout: "\n", stderr: "" }),
      },
    });

    await expect(service.list("opencode", { limit: 20 })).resolves.toEqual({
      agentId: "opencode",
      adapter: "opencode-cli-v1",
      sessions: [],
      total: 0,
      hasMore: false,
    });
  });

  it("pages OpenCode metadata without exporting transcript bodies", async () => {
    const rows = Array.from({ length: 41 }, (_, index) => ({
      id: `ses_${index}`,
      title: `Session ${index}`,
      updated: 1_700_000_000_000 - index,
      directory: `/workspace/project-${index}`,
      sizeBytes: index + 1,
      total: 41,
    }));
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: JSON.stringify(rows.slice(20, 40)),
        stderr: "",
      });
    const service = createAgentSessionService({
      homeDir: await createHome(),
      commandRunner: {
        resolve: vi.fn().mockResolvedValue("/opt/homebrew/bin/opencode"),
        run,
      },
    });

    const page = await service.list("opencode", { limit: 20, offset: 20 });

    expect(page.sessions.map((session) => session.id)).toEqual(
      rows.slice(20, 40).map((row) => row.id),
    );
    expect(page).toMatchObject({ total: 41, hasMore: true });
    expect(
      page.sessions.every((session) => typeof session.sizeBytes === "number"),
    ).toBe(true);
    expect(run).toHaveBeenCalledWith(
      "/opt/homebrew/bin/opencode",
      [
        "db",
        expect.stringMatching(/FROM session s[\s\S]*LIMIT 20 OFFSET 20/),
        "--format",
        "json",
      ],
      expect.objectContaining({ maxBuffer: 2 * 1024 * 1024 }),
    );
    expect(run).not.toHaveBeenCalledWith(
      "/opt/homebrew/bin/opencode",
      expect.arrayContaining(["session", "list"]),
      expect.anything(),
    );
  });

  it("indexes Gemini project sessions and returns a bounded transcript", async () => {
    const homeDir = await createHome();
    const projectPath = path.join(homeDir, "workspace", "PromptHub");
    const projectCacheDir = path.join(
      homeDir,
      ".gemini",
      "tmp",
      "project-hash",
    );
    const chatsDir = path.join(projectCacheDir, "chats");
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(chatsDir, { recursive: true });
    await fs.writeFile(
      path.join(projectCacheDir, ".project_root"),
      projectPath,
    );
    await fs.writeFile(
      path.join(chatsDir, "session-2026-07-15-abcd1234.json"),
      JSON.stringify({
        sessionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        projectHash: "project-hash",
        summary: "Native Gemini title",
        startTime: "2026-07-15T10:00:00.000Z",
        lastUpdated: "2026-07-15T10:02:00.000Z",
        messages: [
          {
            id: "message-info",
            timestamp: "2026-07-15T09:59:00.000Z",
            type: "info",
            content: "Loaded project context",
          },
          {
            id: "message-1",
            timestamp: "2026-07-15T10:00:00.000Z",
            type: "user",
            content: [{ text: "Review the release plan" }],
          },
          {
            id: "message-2",
            timestamp: "2026-07-15T10:01:00.000Z",
            type: "gemini",
            content: [{ text: "The plan has one open risk." }],
          },
          {
            id: "message-tool",
            timestamp: "2026-07-15T10:01:30.000Z",
            type: "user",
            content: [
              {
                functionResponse: {
                  id: "read-1",
                  name: "read_file",
                  response: { output: "Tool completed" },
                },
              },
            ],
          },
          {
            id: "message-error",
            timestamp: "2026-07-15T10:01:45.000Z",
            type: "error",
            content: "A visible model error",
          },
          "malformed-message-row",
        ],
      }),
    );

    const service = createAgentSessionService({ homeDir });
    const list = await service.list("gemini", { limit: 20 });
    const sessionPath = path.join(chatsDir, "session-2026-07-15-abcd1234.json");

    expect(list.sessions[0]).toMatchObject({
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      title: "Native Gemini title",
      projectLabel: "PromptHub",
      projectPath,
      sizeBytes: (await fs.stat(sessionPath)).size,
      nativeDeleteSupported: true,
      resume: {
        executable: "gemini",
        args: ["--resume", "a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
        cwd: projectPath,
      },
    });
    const detail = await service.read(
      "gemini",
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    );
    expect(detail.entries.map((entry) => [entry.role, entry.text])).toEqual([
      ["user", "Review the release plan"],
      ["assistant", "The plan has one open risk."],
      ["tool", "Tool completed"],
      ["system", "A visible model error"],
    ]);
    expect(detail.parseErrors).toBe(1);
    expect(detail.truncated).toBe(false);

    await service.delete("gemini", "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    await expect(fs.access(sessionPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("keeps Gemini cache labels when project markers are unsafe", async () => {
    const homeDir = await createHome();
    const geminiRoot = path.join(homeDir, ".gemini", "tmp");
    const sessions = [
      ["missing-marker", "missing-session"],
      ["relative-marker", "relative-session"],
      ["oversized-marker", "oversized-session"],
      ["symlink-marker", "symlink-session"],
    ] as const;

    for (const [project, sessionId] of sessions) {
      const projectDir = path.join(geminiRoot, project);
      const chatsDir = path.join(projectDir, "chats");
      await fs.mkdir(chatsDir, { recursive: true });
      await fs.writeFile(
        path.join(chatsDir, `${sessionId}.json`),
        JSON.stringify({
          sessionId,
          messages: [{ type: "user", content: sessionId }],
        }),
      );
    }
    await fs.writeFile(
      path.join(geminiRoot, "relative-marker", ".project_root"),
      "relative/project",
    );
    await fs.writeFile(
      path.join(geminiRoot, "oversized-marker", ".project_root"),
      `/workspace/${"x".repeat(4 * 1024)}`,
    );
    const externalMarker = path.join(homeDir, "external-project-root");
    await fs.writeFile(externalMarker, "/workspace/external");
    await fs.symlink(
      externalMarker,
      path.join(geminiRoot, "symlink-marker", ".project_root"),
    );

    const service = createAgentSessionService({ homeDir });
    const list = await service.list("gemini", { limit: 20 });
    expect(
      Object.fromEntries(
        list.sessions.map((session) => [session.id, session.projectLabel]),
      ),
    ).toEqual({
      "missing-session": "missing-marker",
      "relative-session": "relative-marker",
      "oversized-session": "oversized-marker",
      "symlink-session": "symlink-marker",
    });
    expect(list.sessions.every((session) => session.projectPath === null)).toBe(
      true,
    );
  });

  it("reads current Kimi Code sessions from its bounded index and rejects escaped roots", async () => {
    const homeDir = await createHome();
    const kimiRootDir = path.join(homeDir, ".kimi-code");
    const sessionId = "session_12345678-1234-1234-1234-123456789abc";
    const sessionDir = path.join(
      kimiRootDir,
      "sessions",
      "wd_project_123456789abc",
      sessionId,
    );
    const emptySessionId = "session_empty_12345678";
    const emptySessionDir = path.join(
      kimiRootDir,
      "sessions",
      "wd_project_123456789abc",
      emptySessionId,
    );
    await fs.mkdir(path.join(sessionDir, "agents", "main"), {
      recursive: true,
    });
    await fs.mkdir(path.join(emptySessionDir, "agents", "main"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(kimiRootDir, "session_index.jsonl"),
      [
        JSON.stringify({
          sessionId: "escaped-session",
          sessionDir: path.join(homeDir, "outside-session"),
          workDir: "/workspace/escaped",
        }),
        "{ malformed",
        JSON.stringify({
          sessionId,
          sessionDir,
          workDir: "/workspace/kimi-project",
        }),
        JSON.stringify({
          sessionId: emptySessionId,
          sessionDir: emptySessionDir,
          workDir: "/workspace/kimi-project",
        }),
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(sessionDir, "state.json"),
      JSON.stringify({
        title: "Review Kimi Code integration",
        createdAt: "2026-07-17T08:00:00.000Z",
        updatedAt: "2026-07-17T08:02:00.000Z",
        workDir: "/workspace/kimi-project",
        lastPrompt: "Review the Kimi adapter",
      }),
    );
    await fs.writeFile(
      path.join(emptySessionDir, "state.json"),
      JSON.stringify({
        title: "New Session",
        createdAt: "2026-07-17T08:03:00.000Z",
        updatedAt: "2026-07-17T08:03:00.000Z",
        workDir: "/workspace/kimi-project",
      }),
    );
    await fs.writeFile(
      path.join(emptySessionDir, "agents", "main", "wire.jsonl"),
      `${JSON.stringify({ type: "metadata", protocol_version: "1.1" })}\n`,
    );
    await fs.writeFile(
      path.join(sessionDir, "agents", "main", "wire.jsonl"),
      [
        JSON.stringify({
          type: "metadata",
          protocol_version: "1.1",
          created_at: "2026-07-17T08:00:00.000Z",
        }),
        JSON.stringify({
          type: "turn.prompt",
          time: "2026-07-17T08:00:01.000Z",
          input: [{ type: "text", text: "Review the Kimi adapter" }],
          origin: { kind: "user" },
        }),
        JSON.stringify({
          type: "context.append_message",
          time: "2026-07-17T08:00:01.100Z",
          message: {
            role: "user",
            content: [{ type: "text", text: "Review the Kimi adapter" }],
            toolCalls: [],
          },
        }),
        "{ malformed",
        JSON.stringify({
          type: "context.append_loop_event",
          time: "2026-07-17T08:00:02.000Z",
          event: {
            type: "content.part",
            part: { type: "text", text: "The adapter is ready for review." },
          },
        }),
      ].join("\n"),
    );

    const service = createAgentSessionService({ homeDir, kimiRootDir });
    const list = await service.list("kimi", { limit: 20 });
    const wirePath = await fs.realpath(
      path.join(sessionDir, "agents", "main", "wire.jsonl"),
    );
    const sessionBytes =
      (await fs.stat(path.join(sessionDir, "state.json"))).size +
      (await fs.stat(wirePath)).size;

    expect(list).toMatchObject({
      adapter: "kimi-code-index-v1",
      total: 1,
      hasMore: false,
    });
    expect(list.sessions).toEqual([
      expect.objectContaining({
        id: sessionId,
        title: "Review Kimi Code integration",
        projectLabel: "kimi-project",
        projectPath: "/workspace/kimi-project",
        sizeBytes: sessionBytes,
        nativeDeleteSupported: true,
        sourcePath: wirePath,
        resume: {
          executable: "kimi",
          args: ["--session", sessionId],
          environment: { KIMI_CODE_HOME: kimiRootDir },
          cwd: "/workspace/kimi-project",
        },
      }),
    ]);

    const detail = await service.read("kimi", sessionId);
    expect(detail).toMatchObject({
      adapter: "kimi-code-index-v1",
      sessionId,
      parseErrors: 1,
      truncated: false,
    });
    expect(detail.entries.map((entry) => [entry.role, entry.text])).toEqual([
      ["user", "Review the Kimi adapter"],
      ["assistant", "The adapter is ready for review."],
    ]);
    await service.delete("kimi", sessionId);
    await expect(fs.access(sessionDir)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(service.list("kimi", { limit: 20 })).resolves.toMatchObject({
      total: 0,
      sessions: [],
    });
  });

  it("reads the newest Kimi session from the bounded tail of an oversized index", async () => {
    const homeDir = await createHome();
    const kimiRootDir = path.join(homeDir, ".kimi-code");
    const sessionId = "session_after_oversized_history";
    const sessionDir = path.join(
      kimiRootDir,
      "sessions",
      "wd_recent",
      sessionId,
    );
    await fs.mkdir(path.join(sessionDir, "agents", "main"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(sessionDir, "state.json"),
      JSON.stringify({
        title: "Newest bounded session",
        updatedAt: "2026-07-17T09:00:00.000Z",
        lastPrompt: "Newest bounded prompt",
      }),
    );
    await fs.writeFile(
      path.join(sessionDir, "agents", "main", "wire.jsonl"),
      `${JSON.stringify({
        type: "turn.prompt",
        input: "Newest bounded prompt",
      })}\n`,
    );
    await fs.writeFile(
      path.join(kimiRootDir, "session_index.jsonl"),
      `${"x".repeat(8 * 1024 * 1024 + 1024)}\n${JSON.stringify({
        sessionId,
        sessionDir,
        workDir: "/workspace/recent",
      })}\n`,
    );

    const service = createAgentSessionService({ homeDir, kimiRootDir });
    await expect(service.list("kimi", { limit: 1 })).resolves.toMatchObject({
      sessions: [
        expect.objectContaining({
          id: sessionId,
          title: "Newest bounded session",
        }),
      ],
      hasMore: true,
    });
  });

  it("fails closed when a Kimi session directory escapes through a symlink", async () => {
    const homeDir = await createHome();
    const kimiRootDir = path.join(homeDir, ".kimi-code");
    const sessionsRoot = path.join(kimiRootDir, "sessions");
    const outsideDir = path.join(homeDir, "outside-session");
    const sessionId = "session_symlink_escape";
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.mkdir(sessionsRoot, { recursive: true });
    await fs.symlink(
      outsideDir,
      path.join(sessionsRoot, "escaped"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await fs.writeFile(
      path.join(kimiRootDir, "session_index.jsonl"),
      `${JSON.stringify({
        sessionId,
        sessionDir: path.join(sessionsRoot, "escaped"),
        workDir: "/workspace/escaped",
      })}\n`,
    );

    const service = createAgentSessionService({ homeDir, kimiRootDir });
    await expect(service.list("kimi", { limit: 20 })).resolves.toMatchObject({
      sessions: [],
      total: 0,
    });
    await expect(service.read("kimi", sessionId)).rejects.toThrow(
      "AGENT_SESSION_NOT_FOUND",
    );
  });

  it("fails closed for unsupported Agents, missing commands and unsafe ids", async () => {
    const service = createAgentSessionService({
      homeDir: await createHome(),
      commandRunner: {
        resolve: vi.fn().mockResolvedValue(null),
        run: vi.fn(),
      },
    });

    await expect(service.list("cursor", { limit: 20 })).resolves.toMatchObject({
      sessions: [],
      total: 0,
    });
    await expect(service.list("trae", { limit: 20 })).rejects.toThrow(
      "AGENT_SESSION_UNSUPPORTED",
    );
    await expect(service.list("opencode", { limit: 20 })).rejects.toThrow(
      "AGENT_SESSION_COMMAND_NOT_FOUND",
    );
    await expect(service.read("claude", "../auth.json")).rejects.toThrow(
      "AGENT_SESSION_ID_INVALID",
    );
    await expect(service.list("claude", { limit: 0 })).rejects.toThrow(
      "AGENT_SESSION_LIMIT_INVALID",
    );
    await expect(
      service.list("claude", { limit: 20, offset: -1 }),
    ).rejects.toThrow("AGENT_SESSION_OFFSET_INVALID");
    await expect(
      service.list("claude", { limit: 20, offset: 49_990 }),
    ).rejects.toThrow("AGENT_SESSION_OFFSET_INVALID");
  });
});
