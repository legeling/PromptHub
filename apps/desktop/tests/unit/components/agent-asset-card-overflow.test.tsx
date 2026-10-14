import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AgentAssetCard,
  AgentAssetCardContent,
} from "../../../src/renderer/components/agent/AgentAssetManagementSurface";

describe("Agent asset card width contract", () => {
  it("constrains long paths and labels without losing content or card actions", () => {
    const onOpen = vi.fn();
    const onAction = vi.fn();
    const source = `/fixture/plugins/${"long-package-name/".repeat(12)}entry`;
    const longTag = "unbroken-tag-".repeat(30);
    render(
      <AgentAssetCard
        testId="asset-card"
        actionsTestId="asset-actions"
        openLabel="Open asset"
        onOpen={onOpen}
        actions={<button onClick={onAction}>Inspect configuration</button>}
      >
        <AgentAssetCardContent
          icon={<span />}
          iconTestId="asset-icon"
          title="node_repl"
          status={<span>Managed in PromptHub</span>}
          description="MCP server configuration"
          source={source}
          metadata={
            <>
              <span>Codex</span>
              <span>{longTag}</span>
            </>
          }
        />
      </AgentAssetCard>,
    );
    const card = screen.getByTestId("asset-card");
    expect(card).toHaveClass("min-w-0");
    expect(screen.getByRole("button", { name: "Open asset" })).toHaveClass(
      "w-full",
    );
    expect(within(card).getByTestId("agent-asset-card-content")).toHaveClass(
      "w-full",
      "min-w-0",
    );
    expect(within(card).getByTestId("agent-asset-card-title-row")).toHaveClass(
      "flex-wrap",
    );
    expect(within(card).getByTestId("agent-asset-card-source")).toHaveAttribute(
      "title",
      source,
    );
    expect(within(card).getByText(longTag)).toHaveTextContent(longTag);
    expect(within(card).getByTestId("agent-asset-card-metadata")).toHaveClass(
      "[&>*]:max-w-full",
      "[&>*]:[overflow-wrap:anywhere]",
    );
    fireEvent.click(screen.getByRole("button", { name: "Open asset" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect configuration" }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
