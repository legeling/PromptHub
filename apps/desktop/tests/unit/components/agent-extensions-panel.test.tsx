import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AgentExtensionsPanel } from "../../../src/renderer/components/agent/AgentExtensionsPanel";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (
    select: (s: { skillProjects: { id: string; name: string }[] }) => unknown,
  ) =>
    select({
      skillProjects: [
        { id: "project-one", name: "Project One" },
        { id: "project-two", name: "Project Two" },
      ],
    }),
}));
const api = {
  listAgentExtensions: vi.fn(),
  readAgentExtension: vi.fn(),
  writeAgentExtension: vi.fn(),
  deleteAgentExtension: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { agent: api },
  });
  api.listAgentExtensions.mockResolvedValue(["agents/review.md"]);
  api.readAgentExtension.mockResolvedValue({
    path: "agents/review.md",
    content: "original",
    revision: "rev-1",
  });
  api.writeAgentExtension.mockResolvedValue({
    path: "agents/review.md",
    content: "edited",
    revision: "rev-2",
  });
});
it("keeps edits until explicit confirmation and sends the read revision", async () => {
  render(<AgentExtensionsPanel agentId="claude" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "agents/review.md" }),
  );
  const editor = await screen.findByRole("textbox", {
    name: "agents.agentExtensions.content",
  });
  await waitFor(() => expect(editor).toHaveValue("original"));
  fireEvent.change(editor, { target: { value: "edited" } });
  expect(
    screen.getByRole("tab", { name: "agents.agentExtensions.hooks" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "agents.agentExtensions.scope" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "common.save" }));
  expect(api.writeAgentExtension).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "common.confirm" }));
  await waitFor(() =>
    expect(api.writeAgentExtension).toHaveBeenCalledWith({
      agentId: "claude",
      scope: "user",
      kind: "subagent",
      relativePath: "agents/review.md",
      content: "edited",
      expectedRevision: "rev-1",
    }),
  );
});

it("uses keyboard-accessible tabs and custom scope/project menus", async () => {
  const { container } = render(<AgentExtensionsPanel agentId="claude" />);
  await screen.findByRole("button", { name: "agents/review.md" });
  const subagent = screen.getByRole("tab", {
    name: "agents.agentExtensions.subagent",
  });
  const hooks = screen.getByRole("tab", {
    name: "agents.agentExtensions.hooks",
  });
  expect(subagent).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(subagent, { key: "ArrowRight" });
  await waitFor(() => expect(hooks).toHaveAttribute("aria-selected", "true"));
  expect(hooks).toHaveFocus();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "agents.agentExtensions.scope" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "agents.agentExtensions.scope" }),
  );
  expect(screen.getByRole("listbox")).toBeVisible();
  expect(
    screen.getByRole("option", { name: "agents.agentExtensions.local" }),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("option", {
      name: "agents.definitionsPanel.scope.project",
    }),
  );
  await waitFor(() =>
    expect(api.readAgentExtension).toHaveBeenLastCalledWith({
      agentId: "claude",
      scope: "project",
      projectId: "project-one",
      kind: "hooks",
      relativePath: "settings.json",
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "agents.definitionsPanel.project" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "agents.definitionsPanel.project" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "Project Two" }));
  await waitFor(() =>
    expect(api.readAgentExtension).toHaveBeenLastCalledWith({
      agentId: "claude",
      scope: "project",
      projectId: "project-two",
      kind: "hooks",
      relativePath: "settings.json",
    }),
  );
  expect(container.querySelector("select")).toBeNull();
  expect(screen.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    hooks.id,
  );
});

it("retains tab focus while native configuration is loading", async () => {
  let finishRead:
    | ((value: { content: string; revision: string }) => void)
    | undefined;
  api.readAgentExtension.mockReturnValue(
    new Promise((resolve) => {
      finishRead = resolve;
    }),
  );
  render(<AgentExtensionsPanel agentId="claude" />);
  await screen.findByRole("button", { name: "agents/review.md" });
  const hooks = screen.getByRole("tab", {
    name: "agents.agentExtensions.hooks",
  });
  fireEvent.keyDown(
    screen.getByRole("tab", { name: "agents.agentExtensions.subagent" }),
    { key: "ArrowRight" },
  );
  expect(hooks).toHaveFocus();
  expect(hooks).toBeEnabled();
  expect(hooks).toHaveAttribute("aria-disabled", "true");
  finishRead?.({ content: "{}", revision: "hooks-revision" });
  await waitFor(() => expect(hooks).toHaveAttribute("aria-disabled", "false"));
  expect(hooks).toHaveFocus();
});

it("explains OpenCode plugin hooks without exposing a fake JSON editor", async () => {
  render(<AgentExtensionsPanel agentId="opencode" />);
  await screen.findByRole("button", { name: "agents/review.md" });
  fireEvent.click(
    screen.getByRole("tab", { name: "agents.agentExtensions.hooks" }),
  );
  expect(
    await screen.findByText("agents.agentExtensions.pluginHooks"),
  ).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "agents.agentExtensions.content" }),
  ).toBeNull();
  expect(api.readAgentExtension).not.toHaveBeenCalled();
  expect(
    screen.getByRole("link", { name: "agents.agentExtensions.documentation" }),
  ).toHaveAttribute("href", "https://opencode.ai/docs/plugins/");
});

it("creates Codex TOML paths and does not offer Claude local scope", async () => {
  api.listAgentExtensions.mockResolvedValue([]);
  render(<AgentExtensionsPanel agentId="codex" />);
  await waitFor(() =>
    expect(
      screen.getByLabelText("agents.agentExtensions.filename"),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("agents.agentExtensions.filename"), {
    target: { value: "reviewer" },
  });
  fireEvent.click(screen.getByRole("button", { name: "common.add" }));
  await waitFor(() =>
    expect(api.readAgentExtension).toHaveBeenCalledWith({
      agentId: "codex",
      scope: "user",
      kind: "subagent",
      relativePath: "agents/reviewer.toml",
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("tab", { name: "agents.agentExtensions.hooks" }),
    ).toHaveAttribute("aria-disabled", "false"),
  );
  fireEvent.click(
    screen.getByRole("tab", { name: "agents.agentExtensions.hooks" }),
  );
  await waitFor(() =>
    expect(api.readAgentExtension).toHaveBeenLastCalledWith({
      agentId: "codex",
      scope: "user",
      kind: "hooks",
      relativePath: "hooks.json",
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "agents.agentExtensions.scope" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "agents.agentExtensions.scope" }),
  );
  expect(
    screen.queryByRole("option", { name: "agents.agentExtensions.local" }),
  ).toBeNull();
});
