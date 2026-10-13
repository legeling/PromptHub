import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createIndex: vi.fn(),
  createReader: vi.fn(),
  getContext: vi.fn(),
  getNativeDirectory: vi.fn(),
  homedir: vi.fn(() => "/Users/test"),
}));

vi.mock("node:os", () => ({
  default: { homedir: mocks.homedir },
}));
vi.mock("../../../src/main/services/agent-session-index-service", () => ({
  createAgentSessionIndexService: mocks.createIndex,
}));
vi.mock("../../../src/main/services/agent-session-service", () => ({
  createAgentSessionService: mocks.createReader,
}));
vi.mock("../../../src/main/services/agent-platform-context", () => ({
  getAgentConfigContext: mocks.getContext,
  getClaudeNativeConfigDirectory: mocks.getNativeDirectory,
}));

import {
  createAgentSessionIndexOperations,
  resolveAgentSessionIndexSource,
} from "../../../src/main/services/agent-session-index-operations";

describe("Agent session index operation factory", () => {
  const originalClaudeRoot = process.env.CLAUDE_CONFIG_DIR;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLAUDE_CONFIG_DIR;
    mocks.getContext.mockImplementation((agentId: string) => ({
      rootPath: `/roots/${agentId}`,
    }));
    mocks.getNativeDirectory.mockImplementation((root: string) => root);
    mocks.createReader.mockReturnValue({
      reader: true,
      getIndexSource: vi.fn(() => null),
    });
    mocks.createIndex.mockReturnValue({ operations: true });
  });

  afterEach(() => {
    if (originalClaudeRoot === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeRoot;
    }
  });

  it.each([
    ["claude", "claudeConfigDir"],
    ["copilot", "copilotRootDir"],
    ["cline", "clineRootDir"],
    ["cursor", "cursorRootDir"],
    ["codex", "codexRootDir"],
    ["grok", "grokRootDir"],
    ["kimi", "kimiRootDir"],
    ["openclaw", "openclawRootDir"],
    ["pi", "piRootDir"],
    ["oh-my-pi", "ohMyPiRootDir"],
    ["kiro", "kiroRootDir"],
  ])(
    "passes the verified %s root through its native option",
    (agentId, key) => {
      const index = { index: true };

      expect(
        createAgentSessionIndexOperations(index as never, agentId),
      ).toEqual({
        operations: true,
      });
      expect(mocks.createReader).toHaveBeenCalledWith({
        homeDir: "/Users/test",
        [key]: `/roots/${agentId}`,
      });
      expect(mocks.createIndex).toHaveBeenCalledWith({
        index,
        reader: expect.objectContaining({ reader: true }),
      });
    },
  );

  it("keeps the resolved Claude root instead of reapplying an inherited environment override", () => {
    process.env.CLAUDE_CONFIG_DIR = "/managed/claude";
    createAgentSessionIndexOperations({} as never, "claude");
    expect(mocks.createReader).toHaveBeenLastCalledWith({
      homeDir: "/Users/test",
      claudeConfigDir: "/roots/claude",
    });

    process.env.CLAUDE_CONFIG_DIR = "relative/claude";
    createAgentSessionIndexOperations({} as never, "claude");
    expect(mocks.createReader).toHaveBeenLastCalledWith({
      homeDir: "/Users/test",
      claudeConfigDir: "/roots/claude",
    });
  });

  it("does not invent a native root option for unsupported adapters", () => {
    createAgentSessionIndexOperations({} as never, "custom-agent");

    expect(mocks.createReader).toHaveBeenCalledWith({
      homeDir: "/Users/test",
    });
  });

  it("resolves Claude backup descriptors through the same configured reader", () => {
    const descriptor = {
      platformId: "claude",
      rootPath: "/Users/test/.claude/projects",
      adapterId: "claude-jsonl-v1",
      adapterVersion: "1",
    };
    mocks.createReader.mockReturnValue({
      getIndexSource: vi.fn(() => descriptor),
    });

    expect(resolveAgentSessionIndexSource("claude")).toEqual(descriptor);
    expect(mocks.createReader).toHaveBeenCalledWith({
      homeDir: "/Users/test",
      claudeConfigDir: "/roots/claude",
    });
    expect(mocks.getContext).toHaveBeenCalledWith("claude");

    process.env.CLAUDE_CONFIG_DIR = "/managed/claude";
    expect(resolveAgentSessionIndexSource("claude")).toEqual(descriptor);
    expect(mocks.createReader).toHaveBeenLastCalledWith({
      homeDir: "/Users/test",
      claudeConfigDir: "/roots/claude",
    });
    expect(mocks.getContext).toHaveBeenCalledTimes(2);

    expect(resolveAgentSessionIndexSource("gemini")).toEqual(descriptor);
    expect(mocks.createReader).toHaveBeenLastCalledWith({
      homeDir: "/Users/test",
    });
    expect(mocks.getContext).toHaveBeenCalledTimes(2);

    expect(resolveAgentSessionIndexSource("codex")).toBeNull();
    expect(mocks.createReader).toHaveBeenCalledTimes(3);
    expect(mocks.getContext).toHaveBeenCalledTimes(2);
  });
});
