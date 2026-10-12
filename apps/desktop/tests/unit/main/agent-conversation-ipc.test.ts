import { AgentConversationService } from "../../../src/main/services/agent-conversation-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: { handle: handleMock },
}));

type Handler = (...args: unknown[]) => Promise<unknown>;

async function setup() {
  vi.resetModules();
  handleMock.mockReset();
  const [{ registerAgentConversationIPC }, { IPC_CHANNELS }] =
    await Promise.all([
      import("../../../src/main/ipc/agent-conversation.ipc"),
      import("@prompthub/shared/constants/ipc-channels"),
    ]);
  const unexpected = (): never => {
    throw new Error(
      "Unexpected conversation dependency call in IPC contract test",
    );
  };
  const service = new AgentConversationService({
    repository: {
      listMetadata: unexpected,
      upsertMetadata: unexpected,
      deleteMetadata: unexpected,
      createHandoff: unexpected,
      updateHandoff: unexpected,
    },
    sessions: {
      list: unexpected,
      read: unexpected,
      canDelete: unexpected,
      delete: unexpected,
    },
    resolveExecutable: unexpected,
    launch: unexpected,
    copyText: unexpected,
    homeDir: "/unused-ipc-fixture",
  });
  const methods = {
    listMetadata: vi.fn<AgentConversationService["listMetadata"]>(() => []),
    updateMetadata: vi.fn<AgentConversationService["updateMetadata"]>(
      (input) => ({
        ...input,
        id: "metadata-1",
        title: input.title ?? null,
        projectId: input.projectId ?? null,
        projectPath: input.projectPath ?? null,
        note: input.note ?? null,
        favorite: input.favorite ?? false,
        archivedAt: input.archived ? 1 : null,
        createdAt: 1,
        updatedAt: 1,
      }),
    ),
    deleteConversation: vi.fn<AgentConversationService["deleteConversation"]>(
      async (agentId, sessionId) => ({
        agentId,
        sessionId,
      }),
    ),
    resume: vi.fn<AgentConversationService["resume"]>(async () => ({
      status: "launched",
      mode: "native-resume",
    })),
    previewHandoff: vi.fn<AgentConversationService["previewHandoff"]>(
      async (request) => ({
        ...request,
        previewToken: "00000000-0000-4000-8000-000000000001",
        sourceTitle: "Session",
        payload: "portable context",
        payloadDigest: `sha256:${"a".repeat(64)}`,
        transport: "direct",
        cliCommand: "cd '/workspace/project' && codex 'portable context'",
      }),
    ),
    continueInAgent: vi.fn<AgentConversationService["continueInAgent"]>(
      async () => ({
        status: "launched",
        mode: "cross-agent",
      }),
    ),
    exportConversation: vi.fn<AgentConversationService["exportConversation"]>(
      async () => ({
        fileName: "session.md",
        content: "# Session",
        mimeType: "text/markdown",
      }),
    ),
  };
  Object.assign(service, methods);
  const saveExport = vi.fn(async () => "/tmp/session.md");
  registerAgentConversationIPC({ service, saveExport });
  return {
    IPC_CHANNELS,
    service,
    saveExport,
    handlers: Object.fromEntries(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
    ) as Record<string, Handler>,
  };
}

describe("Agent conversation IPC", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("forwards bounded metadata CRUD and native resume requests", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    expect(handlers).not.toHaveProperty("agent:conversation:restore");
    await handlers[IPC_CHANNELS.AGENT_CONVERSATION_METADATA_LIST](
      {},
      {
        agentId: "claude",
        sessionIds: ["session-1"],
      },
    );
    expect(service.listMetadata).toHaveBeenCalledWith("claude", ["session-1"]);

    const update = {
      agentId: "claude",
      sessionId: "session-1",
      title: "Release fix",
      projectId: "project-1",
      projectPath: "/workspace/project",
      tags: ["release"],
      note: "note",
      favorite: true,
      archived: false,
    };
    await handlers[IPC_CHANNELS.AGENT_CONVERSATION_METADATA_UPDATE]({}, update);
    expect(service.updateMetadata).toHaveBeenCalledWith(update);
    await handlers[IPC_CHANNELS.AGENT_CONVERSATION_RESUME](
      {},
      {
        agentId: "claude",
        sessionId: "session-1",
      },
    );
    expect(service.resume).toHaveBeenCalledWith({
      agentId: "claude",
      sessionId: "session-1",
    });
    await handlers[IPC_CHANNELS.AGENT_CONVERSATION_DELETE](
      {},
      {
        agentId: "claude",
        sessionId: "session-1",
      },
    );
    expect(service.deleteConversation).toHaveBeenCalledWith(
      "claude",
      "session-1",
    );
  });

  it("previews and confirms a cross-Agent handoff with an exact digest", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    const request = {
      sourceAgentId: "claude",
      sourceSessionId: "session-1",
      targetAgentId: "codex",
      projectId: "project-1",
      projectPath: "/workspace/project",
    };
    const preview = await handlers[
      IPC_CHANNELS.AGENT_CONVERSATION_HANDOFF_PREVIEW
    ]({}, request);
    await handlers[IPC_CHANNELS.AGENT_CONVERSATION_HANDOFF_CONTINUE](
      {},
      {
        ...(preview as object),
        confirmedPayloadDigest: `sha256:${"a".repeat(64)}`,
      },
    );
    expect(service.previewHandoff).toHaveBeenCalledWith(request);
    expect(service.continueInAgent).toHaveBeenCalledWith(
      expect.objectContaining({ targetAgentId: "codex" }),
    );
  });

  it("saves an export through the trusted main-process boundary", async () => {
    const { handlers, IPC_CHANNELS, saveExport } = await setup();
    await expect(
      handlers[IPC_CHANNELS.AGENT_CONVERSATION_EXPORT](
        {},
        {
          agentId: "claude",
          sessionId: "session-1",
          format: "markdown",
        },
      ),
    ).resolves.toEqual({ canceled: false, filePath: "/tmp/session.md" });
    expect(saveExport).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "session.md" }),
    );
  });

  it("rejects oversized batches and malformed handoff payloads", async () => {
    const { handlers, IPC_CHANNELS } = await setup();
    await expect(
      handlers[IPC_CHANNELS.AGENT_CONVERSATION_METADATA_LIST](
        {},
        {
          agentId: "claude",
          sessionIds: Array.from({ length: 201 }, (_, index) => `s-${index}`),
        },
      ),
    ).rejects.toThrow("AGENT_CONVERSATION_REQUEST_INVALID");
    await expect(
      handlers[IPC_CHANNELS.AGENT_CONVERSATION_HANDOFF_CONTINUE](
        {},
        {
          sourceAgentId: "claude",
        },
      ),
    ).rejects.toThrow("AGENT_CONVERSATION_REQUEST_INVALID");
  });

  it("accepts launch-only handoffs and rejects the removed copy transport", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    const digest = `sha256:${"b".repeat(64)}`;
    const request = {
      sourceAgentId: "codex",
      sourceSessionId: "session-2",
      targetAgentId: "antigravity",
      projectPath: "/workspace/project",
      sourceTitle: "Session 2",
      previewToken: "00000000-0000-4000-8000-000000000002",
      payload: "Reviewed context",
      payloadDigest: digest,
      confirmedPayloadDigest: digest,
      cliCommand: null,
    };

    await expect(
      handlers[IPC_CHANNELS.AGENT_CONVERSATION_HANDOFF_CONTINUE](
        {},
        {
          ...request,
          transport: "launch",
        },
      ),
    ).resolves.toEqual({ status: "launched", mode: "cross-agent" });
    expect(service.continueInAgent).toHaveBeenCalledWith(
      expect.objectContaining({ transport: "launch" }),
    );

    await expect(
      handlers[IPC_CHANNELS.AGENT_CONVERSATION_HANDOFF_CONTINUE](
        {},
        {
          ...request,
          transport: "launch-and-copy",
        },
      ),
    ).rejects.toThrow("AGENT_CONVERSATION_REQUEST_INVALID");
  });
});
