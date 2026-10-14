import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createQwenSessionAdapter } from "../../../src/main/services/agent-session-qwen";

const temporaryRoots: string[] = [];

async function createRuntimeRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-qwen-pagination-"),
  );
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, "projects", "demo", "chats"), {
    recursive: true,
  });
  return root;
}

async function writeTranscript(
  runtimeRoot: string,
  name: string,
  text: string,
): Promise<string> {
  const filePath = path.join(
    runtimeRoot,
    "projects",
    "demo",
    "chats",
    `${name}.jsonl`,
  );
  await fs.writeFile(
    filePath,
    `${JSON.stringify({
      id: `${name}-message`,
      type: "user",
      message: { role: "user", parts: [{ text }] },
    })}\n`,
  );
  return filePath;
}

function nativeRow(index: number, filePath: string): Record<string, unknown> {
  return {
    sessionId: `session-${index}`,
    startTime: `2026-07-29T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
    mtime: 1_785_283_200_000 + index,
    customTitle: `Session ${index}`,
    filePath,
    cwd: "/workspace/qwen",
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Qwen session deep-page continuity", () => {
  it("opens a listed session beyond row 200 with bounded metadata retention", async () => {
    const runtimeRoot = await createRuntimeRoot();
    const placeholder = await writeTranscript(
      runtimeRoot,
      "placeholder",
      "Placeholder session",
    );
    const selectedPath = await writeTranscript(
      runtimeRoot,
      "selected",
      "Deep-page session",
    );
    const rows = Array.from({ length: 302 }, (_, index) =>
      nativeRow(index, index === 300 ? selectedPath : placeholder),
    );
    const run = vi.fn(async (_executable: string, args: string[]) => {
      const limit = Number(args.at(-1));
      return {
        stdout: rows
          .slice(0, limit)
          .map((row) => JSON.stringify(row))
          .join("\n"),
        stderr: "",
      };
    });
    const adapter = createQwenSessionAdapter(runtimeRoot, {
      resolve: vi.fn().mockResolvedValue("/usr/local/bin/qwen"),
      run,
    });

    const page = await adapter.list(1, 300);
    expect(page.sessions).toEqual([
      expect.objectContaining({ id: "session-300", title: "Session 300" }),
    ]);

    await expect(adapter.read("session-300")).resolves.toMatchObject({
      sessionId: "session-300",
      entries: [expect.objectContaining({ text: "Deep-page session" })],
    });
    expect(run).toHaveBeenCalledTimes(1);

    await expect(adapter.read("session-0")).resolves.toMatchObject({
      sessionId: "session-0",
      entries: [expect.objectContaining({ text: "Placeholder session" })],
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map(([, args]) => args.at(-1))).toEqual([
      "302",
      "200",
    ]);
  });

  it.skipIf(process.platform === "win32")(
    "revalidates a cached transcript path before reading",
    async () => {
      const runtimeRoot = await createRuntimeRoot();
      const selectedPath = await writeTranscript(
        runtimeRoot,
        "selected",
        "Safe before replacement",
      );
      const outsideRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "prompthub-qwen-outside-"),
      );
      temporaryRoots.push(outsideRoot);
      const outsidePath = path.join(outsideRoot, "outside.jsonl");
      await fs.writeFile(outsidePath, '{"type":"user","content":"secret"}\n');
      const run = vi.fn().mockResolvedValue({
        stdout: JSON.stringify(nativeRow(0, selectedPath)),
        stderr: "",
      });
      const adapter = createQwenSessionAdapter(runtimeRoot, {
        resolve: vi.fn().mockResolvedValue("/usr/local/bin/qwen"),
        run,
      });

      await adapter.list(1);
      await fs.unlink(selectedPath);
      await fs.symlink(outsidePath, selectedPath);

      await expect(adapter.read("session-0")).rejects.toThrow(
        "AGENT_SESSION_NOT_FOUND",
      );
      expect(run).toHaveBeenCalledTimes(1);
    },
  );

  it("contains malformed native rows and projects only visible transcript roles", async () => {
    const runtimeRoot = await createRuntimeRoot();
    const transcriptPath = await writeTranscript(
      runtimeRoot,
      "mixed",
      "Initial user",
    );
    await fs.writeFile(
      transcriptPath,
      [
        JSON.stringify({
          uuid: "assistant-message",
          message: { role: "assistant", content: "Assistant reply" },
        }),
        JSON.stringify({
          id: "user-message",
          type: "user",
          content: "Direct user",
        }),
        JSON.stringify({
          message: { role: "model", parts: [{ text: "Model reply" }] },
        }),
        JSON.stringify({
          id: "nested-message",
          message: { role: "user", text: "Nested user" },
        }),
        JSON.stringify({ type: "system", content: "Hidden system" }),
        JSON.stringify({ type: "user", content: "" }),
        "{ malformed transcript",
      ].join("\n"),
    );
    const outsideRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompthub-qwen-native-outside-"),
    );
    temporaryRoots.push(outsideRoot);
    const outsidePath = path.join(outsideRoot, "outside.jsonl");
    await fs.writeFile(outsidePath, "{}\n");
    const rows = [
      "",
      "{ malformed metadata",
      "[]",
      JSON.stringify(nativeRow(1, outsidePath)),
      JSON.stringify({ ...nativeRow(2, transcriptPath), sessionId: "../bad" }),
      JSON.stringify({ sessionId: "missing-path" }),
      JSON.stringify({
        sessionId: "fallback-title",
        filePath: transcriptPath,
      }),
    ];
    const run = vi.fn().mockResolvedValue({
      stdout: rows.join("\n"),
      stderr: "More sessions are available",
    });
    const adapter = createQwenSessionAdapter(runtimeRoot, {
      resolve: vi.fn().mockResolvedValue("/usr/local/bin/qwen"),
      run,
    });

    await expect(adapter.list(10)).resolves.toEqual({
      agentId: "qwen",
      adapter: "qwen-cli-jsonl-v1",
      sessions: [
        {
          id: "fallback-title",
          title: "fallback-title",
          projectLabel: null,
          projectPath: null,
          createdAt: null,
          updatedAt: null,
          model: null,
          messageCount: null,
          sizeBytes: (await fs.stat(transcriptPath)).size,
          sourcePath: await fs.realpath(transcriptPath),
          resume: {
            executable: "/usr/local/bin/qwen",
            args: ["--resume", "fallback-title"],
            environment: { QWEN_RUNTIME_DIR: runtimeRoot },
          },
        },
      ],
      total: 1,
      hasMore: false,
    });

    const detail = await adapter.read("fallback-title");
    expect(
      detail.entries.map((entry) => [entry.id, entry.role, entry.text]),
    ).toEqual([
      ["assistant-message", "assistant", "Assistant reply"],
      ["user-message", "user", "Direct user"],
      ["2", "assistant", "Model reply"],
      ["nested-message", "user", "Nested user"],
    ]);
    expect(detail.parseErrors).toBe(1);
  });

  it("fails closed when the Qwen executable or requested session is absent", async () => {
    const runtimeRoot = await createRuntimeRoot();
    const missingExecutable = createQwenSessionAdapter(runtimeRoot, {
      resolve: vi.fn().mockResolvedValue(null),
      run: vi.fn(),
    });
    await expect(missingExecutable.list(1)).rejects.toThrow(
      "AGENT_SESSION_COMMAND_NOT_FOUND",
    );

    const missingSession = createQwenSessionAdapter(runtimeRoot, {
      resolve: vi.fn().mockResolvedValue("/usr/local/bin/qwen"),
      run: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    });
    await expect(missingSession.read("missing-session")).rejects.toThrow(
      "AGENT_SESSION_NOT_FOUND",
    );
  });
});
