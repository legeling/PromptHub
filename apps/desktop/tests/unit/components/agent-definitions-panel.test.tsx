import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentDefinitionListResult,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import { AgentDefinitionsPanel } from "../../../src/renderer/components/agent/AgentDefinitionsPanel";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const qwenAgent = {
  id: "qwen",
  name: "Qwen Code",
} as ManagedAgentSummary;

const result: AgentDefinitionListResult = {
  agentId: "qwen",
  scope: "user",
  entries: [
    {
      kind: "subagent",
      scope: "user",
      relativePath: "reviewer.md",
      name: "reviewer",
      description: "Reviews changes",
      model: "qwen3-coder",
      approvalMode: "plan",
      tools: ["read_file"],
      disallowedTools: ["shell"],
      status: "valid",
      warnings: [],
      size: 240,
      modifiedAt: 1_700_000_000_000,
    },
    {
      kind: "command",
      scope: "user",
      relativePath: "review/frontend.md",
      name: "review:frontend",
      description: "Review the frontend",
      model: null,
      approvalMode: null,
      tools: [],
      disallowedTools: [],
      status: "valid",
      warnings: [],
      size: 120,
      modifiedAt: 1_700_000_000_100,
    },
    {
      kind: "subagent",
      scope: "user",
      relativePath: "writer.md",
      name: "writer",
      description: "Writes changes",
      model: null,
      approvalMode: null,
      tools: [],
      disallowedTools: [],
      status: "valid",
      warnings: [],
      size: 100,
      modifiedAt: 1_700_000_000_200,
    },
  ],
  truncated: false,
  visitedEntries: 2,
  readBytes: 360,
  skippedSymlinks: 0,
  skippedUnsafe: 0,
};

describe("Qwen Definitions panel", () => {
  beforeEach(() => {
    installWindowMocks({
      api: {
        agent: {
          listDefinitions: vi.fn().mockResolvedValue(result),
          openDefinition: vi.fn().mockResolvedValue({ opened: true }),
        },
      },
    });
    useSettingsStore.setState({
      skillProjects: [
        {
          id: "project-1",
          name: "Workbench",
          rootPath: "/private/workbench",
          scanPaths: [],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "project-2",
          name: "Second Project",
          rootPath: "/private/second",
          scanPaths: [],
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    });
  });

  it("lists SubAgents first, switches kind, searches and opens the selected file", async () => {
    await renderWithI18n(<AgentDefinitionsPanel agent={qwenAgent} />, {
      settleAsyncEffects: true,
    });

    expect(window.api.agent.listDefinitions).toHaveBeenCalledWith({
      agentId: "qwen",
      scope: "user",
    });
    const list = await screen.findByRole("list", { name: "Definitions" });
    expect(within(list).getByText("reviewer")).toBeInTheDocument();
    expect(screen.queryByText("review:frontend")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^commands$/i }));
    expect(within(list).getByText("review:frontend")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "review/" },
    });
    expect(within(list).getByText("review:frontend")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "the frontend" },
    });
    fireEvent.click(within(list).getByText("review:frontend"));
    const detail = screen.getByTestId("agent-definition-detail");
    expect(within(detail).getByText("review/frontend.md")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: /open file/i }));

    await waitFor(() =>
      expect(window.api.agent.openDefinition).toHaveBeenCalledWith({
        agentId: "qwen",
        scope: "user",
        kind: "command",
        relativePath: "review/frontend.md",
      }),
    );
  });

  it("selects project scope by id without sending its absolute path", async () => {
    await renderWithI18n(<AgentDefinitionsPanel agent={qwenAgent} />, {
      settleAsyncEffects: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /^project$/i }));

    await waitFor(() =>
      expect(window.api.agent.listDefinitions).toHaveBeenLastCalledWith({
        agentId: "qwen",
        scope: "project",
        projectId: "project-1",
      }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Project" }), {
      target: { value: "project-2" },
    });
    await waitFor(() =>
      expect(window.api.agent.listDefinitions).toHaveBeenLastCalledWith({
        agentId: "qwen",
        scope: "project",
        projectId: "project-2",
      }),
    );
    fireEvent.click(
      within(screen.getByTestId("agent-definition-detail")).getByRole(
        "button",
        { name: "Open file" },
      ),
    );
    await waitFor(() =>
      expect(window.api.agent.openDefinition).toHaveBeenLastCalledWith({
        agentId: "qwen",
        scope: "project",
        projectId: "project-2",
        kind: "subagent",
        relativePath: "reviewer.md",
      }),
    );
    expect(window.api.agent.listDefinitions).not.toHaveBeenCalledWith(
      expect.objectContaining({ rootPath: expect.anything() }),
    );
  });

  it("shows a project guidance state and does not call main when no project exists", async () => {
    useSettingsStore.setState({ skillProjects: [] });
    await renderWithI18n(<AgentDefinitionsPanel agent={qwenAgent} />, {
      settleAsyncEffects: true,
    });
    vi.mocked(window.api.agent.listDefinitions).mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^project$/i }));

    expect(
      await screen.findByText(
        /add a project before browsing project definitions/i,
      ),
    ).toBeInTheDocument();
    expect(window.api.agent.listDefinitions).not.toHaveBeenCalled();
  });

  it("selects the next available project when the current project disappears", async () => {
    await renderWithI18n(<AgentDefinitionsPanel agent={qwenAgent} />, {
      settleAsyncEffects: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Project" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Project" })).toHaveValue(
        "project-1",
      ),
    );

    act(() => {
      useSettingsStore.setState({
        skillProjects: [
          {
            id: "project-2",
            name: "Second Project",
            rootPath: "/private/second",
            scanPaths: [],
            createdAt: 2,
            updatedAt: 2,
          },
        ],
      });
    });

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Project" })).toHaveValue(
        "project-2",
      ),
    );
  });

  it("keeps a stable retry surface when discovery fails", async () => {
    vi.mocked(window.api.agent.listDefinitions).mockRejectedValueOnce(
      new Error("private path must not leak"),
    );
    await renderWithI18n(<AgentDefinitionsPanel agent={qwenAgent} />, {
      settleAsyncEffects: true,
    });

    expect(
      screen.getByText(/definitions could not be loaded/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/private path/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(window.api.agent.listDefinitions).toHaveBeenCalledTimes(2),
    );
  });

  it("renders bounded warning metadata, fallbacks and truncation without definition bodies", async () => {
    vi.mocked(window.api.agent.listDefinitions).mockResolvedValueOnce({
      ...result,
      truncated: true,
      entries: [
        {
          kind: "subagent",
          scope: "user",
          relativePath: "invalid.md",
          name: "invalid",
          description: null,
          model: null,
          approvalMode: null,
          tools: [],
          disallowedTools: [],
          status: "invalid",
          warnings: [
            "file-too-large",
            "invalid-frontmatter",
            "missing-body",
            "missing-name",
            "missing-description",
            "invalid-metadata",
            "metadata-truncated",
            "sensitive-metadata-redacted",
            "future-warning",
          ],
          size: 999,
          modifiedAt: 1,
        },
      ],
    });

    await renderWithI18n(<AgentDefinitionsPanel agent={qwenAgent} />, {
      settleAsyncEffects: true,
    });

    expect(
      await screen.findByText(/inventory reached its safety limit/i),
    ).toBeInTheDocument();
    const detail = screen.getByTestId("agent-definition-detail");
    expect(within(detail).getByText("Not declared")).toBeInTheDocument();
    expect(within(detail).getAllByText("Inherit")).toHaveLength(3);
    expect(within(detail).getByText("None")).toBeInTheDocument();
    expect(within(detail).getByText(/safe preview size/i)).toBeInTheDocument();
    expect(within(detail).getByText("future-warning")).toBeInTheDocument();
  });

  it("shows loading and empty states and supports an explicit refresh", async () => {
    let resolveList!: (value: AgentDefinitionListResult) => void;
    vi.mocked(window.api.agent.listDefinitions).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );
    await renderWithI18n(<AgentDefinitionsPanel agent={qwenAgent} />);

    const refresh = screen.getByRole("button", { name: "Refresh" });
    expect(refresh).toBeDisabled();
    resolveList({ ...result, entries: [] });
    expect(
      await screen.findByText(/no definitions match this view/i),
    ).toBeInTheDocument();
    fireEvent.click(refresh);
    await waitFor(() =>
      expect(window.api.agent.listDefinitions).toHaveBeenCalledTimes(2),
    );
  });

  it("does not query Qwen paths when rendered defensively for an unsupported Agent", async () => {
    await renderWithI18n(
      <AgentDefinitionsPanel
        agent={{ ...qwenAgent, id: "unsupported", name: "Unsupported" }}
      />,
      { settleAsyncEffects: true },
    );

    expect(window.api.agent.listDefinitions).not.toHaveBeenCalled();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(window.api.agent.listAgentExtensions).not.toHaveBeenCalled();
  });

  it("routes Codex to native extension configuration without querying Qwen", async () => {
    await renderWithI18n(
      <AgentDefinitionsPanel
        agent={{ ...qwenAgent, id: "codex", name: "Codex" }}
      />,
      { settleAsyncEffects: true },
    );
    expect(window.api.agent.listDefinitions).not.toHaveBeenCalled();
    expect(window.api.agent.listAgentExtensions).toHaveBeenCalledWith({
      agentId: "codex",
      scope: "user",
    });
    expect(screen.getByRole("tab", { name: "SubAgents" })).toBeInTheDocument();
  });
});
