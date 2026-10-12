import type { AgentSessionIndexOperations } from "../../../src/main/ipc/agent-session-index.ipc";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: { handle: handleMock },
}));

type Handler = (...args: unknown[]) => Promise<unknown>;

function sender(id: number) {
  const value = new EventEmitter() as EventEmitter & {
    id: number;
    send: ReturnType<typeof vi.fn>;
  };
  value.id = id;
  value.send = vi.fn();
  return value;
}

async function setup(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  vi.resetModules();
  handleMock.mockReset();
  const [{ registerAgentSessionIndexIPC }, { IPC_CHANNELS }] =
    await Promise.all([
      import("../../../src/main/ipc/agent-session-index.ipc"),
      import("@prompthub/shared/constants/ipc-channels"),
    ]);
  const service = {
    canDelete: vi.fn(() => false),
    delete: vi.fn(async () => undefined),
    getState: vi.fn<AgentSessionIndexOperations["getState"]>(() => ({
      supported: true,
      enabled: false,
      source: null,
    })),
    setEnabled: vi.fn<AgentSessionIndexOperations["setEnabled"]>(() => ({
      supported: true,
      enabled: true,
      source: {
        id: "source-secret",
        platformId: "claude",
        rootPath: "/Users/test/.claude/projects",
        adapterId: "claude-jsonl-v1",
        adapterVersion: "1",
        enabled: true,
        scanCursor: "cursor-secret",
        lastStatus: "idle",
        lastScannedAt: null,
        lastErrorCode: null,
        createdAt: 1,
        updatedAt: 1,
      },
    })),
    refresh: vi.fn(async () => ({
      source: {
        id: "source-secret",
        platformId: "claude",
        rootPath: "/Users/test/.claude/projects",
        adapterId: "claude-jsonl-v1",
        adapterVersion: "1",
        enabled: true,
        scanCursor: "cursor-secret",
        lastStatus: "ok",
        lastScannedAt: 100,
        lastErrorCode: null,
        createdAt: 1,
        updatedAt: 2,
      },
      changedCount: 2,
    })),
    list: vi.fn(async () => ({
      agentId: "claude",
      adapter: "claude-jsonl-v1",
      sessions: [],
      total: 0,
      hasMore: false,
    })),
    read: vi.fn(async () => ({
      agentId: "claude",
      adapter: "claude-jsonl-v1",
      sessionId: "session-1",
      entries: [],
      parseErrors: 0,
      truncated: false,
    })),
    ...overrides,
  };
  const createService = vi.fn(() => service);
  registerAgentSessionIndexIPC({ createService });
  return {
    IPC_CHANNELS,
    service,
    createService,
    handlers: Object.fromEntries(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
    ) as Record<string, Handler>,
  };
}

describe("Agent session index IPC", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns only redacted source state and forwards bounded list search", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    const event = { sender: sender(7) };

    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_SET_ENABLED](event, {
        agentId: "claude",
        enabled: true,
      }),
    ).resolves.toEqual({
      supported: true,
      enabled: true,
      lastStatus: "idle",
      lastScannedAt: null,
      lastErrorCode: null,
    });
    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSIONS_LIST](
        event,
        "claude",
        25,
        50,
        "review",
      ),
    ).resolves.toMatchObject({ agentId: "claude", total: 0 });
    expect(service.list).toHaveBeenCalledWith("claude", {
      limit: 25,
      offset: 50,
      search: "review",
    });
    expect(
      JSON.stringify(
        await handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_GET_STATE](
          event,
          "claude",
        ),
      ),
    ).not.toContain("/Users/test");
    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSIONS_LIST](
        event,
        "claude",
        25,
        0,
        undefined,
      ),
    ).resolves.toMatchObject({ total: 0 });
    expect(service.list).toHaveBeenLastCalledWith("claude", {
      limit: 25,
      offset: 0,
    });
    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSION_READ](event, "claude", "session-1", {
        cursor: "page-2",
        limit: 80,
      }),
    ).resolves.toMatchObject({ sessionId: "session-1" });
    expect(service.read).toHaveBeenCalledWith("claude", "session-1", {
      cursor: "page-2",
      limit: 80,
    });
    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSION_READ](event, "claude", "session-1", {
        cursor: "x".repeat(513),
        limit: 0,
      }),
    ).rejects.toThrow("AGENT_SESSION_DETAIL_REQUEST_INVALID");
  });

  it("scopes progress and cancellation to one renderer request", async () => {
    const refresh = vi.fn(
      async (
        _agentId: string,
        options: {
          signal: AbortSignal;
          onProgress: (value: { processed: number; total: number }) => void;
        },
      ) =>
        new Promise((resolve) => {
          options.onProgress({ processed: 1, total: 3 });
          options.signal.addEventListener(
            "abort",
            () =>
              resolve({
                source: {
                  id: "source-secret",
                  platformId: "claude",
                  rootPath: "/private",
                  adapterId: "claude-jsonl-v1",
                  adapterVersion: "1",
                  enabled: true,
                  scanCursor: null,
                  lastStatus: "idle",
                  lastScannedAt: null,
                  lastErrorCode: null,
                  createdAt: 1,
                  updatedAt: 1,
                },
                changedCount: 0,
              }),
            { once: true },
          );
        }),
    );
    const { handlers, IPC_CHANNELS } = await setup({
      refresh,
      getState: vi.fn(() => ({
        supported: true,
        enabled: true,
        source: {
          id: "source-secret",
          platformId: "claude",
          rootPath: "/private",
          adapterId: "claude-jsonl-v1",
          adapterVersion: "1",
          enabled: true,
          scanCursor: null,
          lastStatus: "ok",
          lastScannedAt: 100,
          lastErrorCode: null,
          createdAt: 1,
          updatedAt: 1,
        },
      })),
    });
    const first = sender(7);
    const running = handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_REFRESH](
      { sender: first },
      { agentId: "claude", requestId: "session-index-request-1" },
    );

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(first.send).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_SESSION_INDEX_PROGRESS,
      {
        agentId: "claude",
        requestId: "session-index-request-1",
        processed: 1,
        total: 3,
      },
    );
    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_CANCEL](
        { sender: sender(8) },
        { requestId: "session-index-request-1" },
      ),
    ).resolves.toBe(false);
    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_CANCEL](
        { sender: first },
        { requestId: "session-index-request-1" },
      ),
    ).resolves.toBe(true);
    await expect(running).resolves.toMatchObject({
      supported: true,
      enabled: true,
    });
  });

  it("aborts an active refresh when its renderer is destroyed", async () => {
    let signal: AbortSignal | null = null;
    const refresh = vi.fn(
      async (_agentId: string, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => {
              const error = new Error("cancelled");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          );
        });
      },
    );
    const { handlers, IPC_CHANNELS } = await setup({ refresh });
    const currentSender = sender(7);
    const running = handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_REFRESH](
      { sender: currentSender },
      { agentId: "gemini", requestId: "session-index-request-2" },
    );
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());

    currentSender.emit("destroyed");
    await expect(running).rejects.toThrow("AGENT_SESSION_SCAN_CANCELLED");
    expect(signal?.aborted).toBe(true);
    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_CANCEL](
        { sender: currentSender },
        { requestId: "session-index-request-2" },
      ),
    ).resolves.toBe(false);
  });

  it("rejects malformed requests and duplicate in-flight ids", async () => {
    const refresh = vi.fn(
      async (_agentId: string, options: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          options.signal.addEventListener(
            "abort",
            () =>
              resolve({
                source: {
                  id: "source",
                  platformId: "claude",
                  rootPath: "/private",
                  adapterId: "claude-jsonl-v1",
                  adapterVersion: "1",
                  enabled: true,
                  scanCursor: null,
                  lastStatus: "idle",
                  lastScannedAt: null,
                  lastErrorCode: null,
                  createdAt: 1,
                  updatedAt: 1,
                },
                changedCount: 0,
              }),
            { once: true },
          );
        }),
    );
    const { handlers, IPC_CHANNELS } = await setup({ refresh });
    const currentSender = sender(7);
    const request = {
      agentId: "claude",
      requestId: "session-index-request-3",
    };
    const running = handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_REFRESH](
      { sender: currentSender },
      request,
    );
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_REFRESH](
        { sender: currentSender },
        request,
      ),
    ).rejects.toThrow("AGENT_SESSION_INDEX_IN_PROGRESS");
    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_SET_ENABLED](
        { sender: currentSender },
        { agentId: "", enabled: "yes" },
      ),
    ).rejects.toThrow("AGENT_SESSION_INDEX_REQUEST_INVALID");
    await handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_CANCEL](
      { sender: currentSender },
      { requestId: request.requestId },
    );
    await running;
  });

  it("rejects every malformed renderer boundary without exposing internals", async () => {
    const { handlers, IPC_CHANNELS } = await setup();
    const currentSender = sender(7);
    const event = { sender: currentSender };
    const invalidSetRequests = [
      null,
      "invalid",
      [],
      { agentId: 7, enabled: true },
      { agentId: " " },
      { agentId: "claude\0unsafe", enabled: true },
      { agentId: "claude", enabled: "yes" },
    ];
    for (const request of invalidSetRequests) {
      await expect(
        handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_SET_ENABLED](event, request),
      ).rejects.toThrow("AGENT_SESSION_INDEX_REQUEST_INVALID");
    }

    for (const agentId of [undefined, "", "claude\0unsafe"]) {
      await expect(
        handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_GET_STATE](event, agentId),
      ).rejects.toThrow("AGENT_SESSION_INDEX_REQUEST_INVALID");
    }

    const invalidRefreshCases: Array<[unknown, unknown]> = [
      [null, {}],
      [{}, { agentId: "claude", requestId: "session-index-request-4" }],
      [
        { sender: { id: -1, send: vi.fn() } },
        { agentId: "claude", requestId: "session-index-request-4" },
      ],
      [
        { sender: { id: 1.5, send: vi.fn() } },
        { agentId: "claude", requestId: "session-index-request-4" },
      ],
      [
        { sender: { id: 1 } },
        { agentId: "claude", requestId: "session-index-request-4" },
      ],
      [event, { agentId: "claude", requestId: "short" }],
    ];
    for (const [invalidEvent, request] of invalidRefreshCases) {
      await expect(
        handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_REFRESH](
          invalidEvent,
          request,
        ),
      ).rejects.toThrow("AGENT_SESSION_INDEX_REQUEST_INVALID");
    }

    const invalidLists = [
      ["claude", "25", 0, undefined],
      ["claude", 1.5, 0, undefined],
      ["claude", 25, "0", undefined],
      ["claude", 25, 1.5, undefined],
      ["claude", 25, -1, undefined],
      ["claude", 25, 0, 7],
      ["claude", 25, 0, "x".repeat(513)],
    ];
    for (const args of invalidLists) {
      await expect(
        handlers[IPC_CHANNELS.AGENT_SESSIONS_LIST](event, ...args),
      ).rejects.toThrow("AGENT_SESSION_INDEX_REQUEST_INVALID");
    }
  });

  it("supports a sender without lifecycle hooks and maps unexpected failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const refresh = vi.fn(async () => undefined);
    const list = vi.fn(async () => {
      throw new Error("private filesystem failure");
    });
    const { handlers, IPC_CHANNELS } = await setup({ refresh, list });
    const event = { sender: { id: 9, send: vi.fn() } };

    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSION_INDEX_REFRESH](event, {
        agentId: "claude",
        requestId: "session-index-request-5",
      }),
    ).resolves.toMatchObject({
      supported: true,
      enabled: false,
      lastStatus: null,
    });
    await expect(
      handlers[IPC_CHANNELS.AGENT_SESSIONS_LIST](
        event,
        "claude",
        25,
        0,
        undefined,
      ),
    ).rejects.toThrow("AGENT_SESSION_INDEX_OPERATION_FAILED");
    expect(consoleError).toHaveBeenCalledWith(
      "[agent-session-index] operation failed",
    );
  });
});
