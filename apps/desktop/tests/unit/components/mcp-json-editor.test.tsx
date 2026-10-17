import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import { McpJsonEditor } from "../../../src/renderer/components/mcp/McpJsonEditor";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import { renderWithI18n } from "../../helpers/i18n";

// State/error handling only; the real shared code editor is exercised in Electron.
vi.mock("../../../src/renderer/components/skill/SkillCodeEditor", () => ({
  SkillCodeEditor: ({
    value,
    editable,
    ariaLabel,
    onChange,
  }: {
    value: string;
    editable: boolean;
    ariaLabel: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      disabled={!editable}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const server: McpServerConfig = {
  id: "fixture",
  name: "docs",
  displayName: "Docs",
  command: "node",
  transport: "stdio",
  env: { TOKEN: "[REDACTED]" },
  enabled: true,
  source: { type: "manual" },
  createdAt: 1,
  updatedAt: 1,
};
const originalUpdate = useMcpStore.getState().updateServer;
afterEach(() => {
  cleanup();
  act(() => useMcpStore.setState({ updateServer: originalUpdate }));
});

it("keeps the draft editable after a failed save without exposing backend error contents", async () => {
  // Component failure state only; real persistence and rollback are covered in Core/Electron tests.
  useMcpStore.setState({
    updateServer: vi.fn().mockRejectedValue(new Error("private-fixture-error")),
  });
  const user = userEvent.setup();
  await renderWithI18n(<McpJsonEditor server={server} />);
  await user.click(screen.getByRole("button", { name: "Edit" }));
  const editor = screen.getByRole("textbox", {
    name: "MCP JSON configuration",
  });
  const changed = JSON.stringify({
    mcpServers: { docs: { command: "changed" } },
  });
  fireEvent.change(editor, { target: { value: changed } });
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your draft is retained",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent(
    "private-fixture-error",
  );
  expect(editor).toHaveValue(changed);
  expect(editor).toBeEnabled();
});

it("blocks a stale draft and reopens the latest configuration after cancel", async () => {
  const user = userEvent.setup();
  const rendered = await renderWithI18n(<McpJsonEditor server={server} />);
  await user.click(screen.getByRole("button", { name: "Edit" }));
  rendered.rerender(
    <McpJsonEditor
      server={{ ...server, command: "external-change", updatedAt: 2 }}
    />,
  );
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("changed while editing");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Edit" }));
  const editor = screen.getByRole("textbox");
  if (!(editor instanceof HTMLTextAreaElement))
    throw new Error("JSON editor missing");
  expect(editor.value).toContain("external-change");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});
