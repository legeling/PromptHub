import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppCommand } from "@prompthub/shared/types";
import { DesktopAppCommandBridge } from "../../../src/renderer/components/app/DesktopAppCommandBridge";
import { APP_ASSET_WORKFLOW_READY_EVENT } from "../../../src/renderer/components/app/app-command-events";
import { useAgentStore } from "../../../src/renderer/stores/agent.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { installWindowMocks } from "../../helpers/window";

type PageType = "home" | "settings";

describe("DesktopAppCommandBridge", () => {
  it("opens a notification's module, sync settings or updater", () => {
    const view = render(<Harness />);
    act(() => deliverCommand({ type: "notification:open", category: "resourceTask", module: "plugin" }));
    expect(useUIStore.getState().appModule).toBe("plugin");
    act(() => deliverCommand({ type: "notification:open", category: "syncFailure" }));
    expect(view.getByTestId("page")).toHaveTextContent("settings");
    expect(useUIStore.getState().pendingSettingsSection).toBe("data");
    act(() => deliverCommand({ type: "notification:open", category: "appUpdate" }));
    expect(onOpenUpdater).toHaveBeenCalledOnce();
  });
  let deliverCommand: (command: AppCommand) => void;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let onOpenUpdater: ReturnType<typeof vi.fn>;

  function Harness({ initialPage = "home" }: { initialPage?: PageType }) {
    const [page, setPage] = useState<PageType>(initialPage);
    return (
      <>
        <output data-testid="page">{page}</output>
        <DesktopAppCommandBridge
          currentPage={page}
          onNavigate={setPage}
          onOpenUpdater={onOpenUpdater}
        />
      </>
    );
  }

  beforeEach(() => {
    unsubscribe = vi.fn();
    onOpenUpdater = vi.fn();
    installWindowMocks({
      electron: {
        onAppCommand: vi.fn((callback: (command: AppCommand) => void) => {
          deliverCommand = callback;
          return unsubscribe;
        }),
      },
    });
    useUIStore.setState({ appModule: "prompt", viewMode: "prompt" });
    useAgentStore.setState({ selectedAgentId: null });
  });

  it.each([
    ["prompt", "shortcut:newPrompt", window],
    ["skill", "open-create-skill-modal", document],
    ["mcp", "open-create-mcp-modal", document],
    ["plugin", "open-add-plugin-modal", document],
  ] as const)(
    "navigates to %s before opening its existing workflow",
    async (asset, eventName, eventTarget) => {
      const listener = vi.fn();
      eventTarget.addEventListener(eventName, listener);
      render(<Harness initialPage="settings" />);

      act(() => {
        deliverCommand({
          type: "asset:create",
          asset,
        } as AppCommand);
      });

      if (asset === "mcp" || asset === "plugin") {
        expect(listener).not.toHaveBeenCalled();
        act(() => {
          document.dispatchEvent(
            new CustomEvent(APP_ASSET_WORKFLOW_READY_EVENT, {
              detail: { asset, ready: true },
            }),
          );
        });
      }

      await waitFor(() => {
        expect(useUIStore.getState().appModule).toBe(asset);
        expect(listener).toHaveBeenCalledOnce();
      });
      if (asset === "mcp" || asset === "plugin") {
        act(() => {
          document.dispatchEvent(
            new CustomEvent(APP_ASSET_WORKFLOW_READY_EVENT, {
              detail: { asset, ready: false },
            }),
          );
        });
      }
      eventTarget.removeEventListener(eventName, listener);
    },
  );

  it("navigates to Rules without fabricating a creation event", async () => {
    const listener = vi.fn();
    document.addEventListener("open-create-rule-modal", listener);
    const view = render(<Harness initialPage="settings" />);

    act(() => {
      deliverCommand({ type: "asset:manage", asset: "rule" });
    });

    await waitFor(() => {
      expect(view.getByTestId("page")).toHaveTextContent("home");
      expect(useUIStore.getState().appModule).toBe("rules");
    });
    expect(listener).not.toHaveBeenCalled();
    document.removeEventListener("open-create-rule-modal", listener);
  });

  it.each(["analyze", "generate"] as const)(
    "delivers Quick Add mode %s after returning to Prompts",
    async (mode) => {
      const listener = vi.fn();
      window.addEventListener("app:quick-add-prompt", listener);
      render(<Harness initialPage="settings" />);

      act(() => {
        deliverCommand({ type: "prompt:quick-add", mode });
      });

      await waitFor(() => {
        expect(useUIStore.getState().appModule).toBe("prompt");
        expect(listener).toHaveBeenCalledOnce();
      });
      expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
        mode,
      });
      window.removeEventListener("app:quick-add-prompt", listener);
    },
  );

  it("opens settings and updater without changing asset state", () => {
    const view = render(<Harness />);

    act(() => deliverCommand({ type: "settings:open" }));
    expect(view.getByTestId("page")).toHaveTextContent("settings");
    expect(useUIStore.getState().appModule).toBe("prompt");

    act(() => deliverCommand({ type: "updater:open" }));
    expect(onOpenUpdater).toHaveBeenCalledOnce();
  });

  it("opens the Agent workspace and unsubscribes cleanly", async () => {
    const view = render(<Harness initialPage="settings" />);

    act(() => deliverCommand({ type: "agent:manage" }));
    await waitFor(() => {
      expect(view.getByTestId("page")).toHaveTextContent("home");
      expect(useUIStore.getState().appModule).toBe("agents");
    });

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("opens a sanitized Provider import preview on its declared Agent", async () => {
    const view = render(<Harness initialPage="settings" />);

    act(() =>
      deliverCommand({
        type: "agent:import-provider",
        preview: {
          version: 1,
          profile: {
            platformId: "codex",
            name: "Imported",
            providerKind: "openai-compatible",
            protocol: "openai-responses",
            endpoint: null,
            config: {},
            source: "import",
          },
          modelMappings: [],
          requiresSecret: true,
        },
      }),
    );

    await waitFor(() => {
      expect(view.getByTestId("page")).toHaveTextContent("home");
      expect(useUIStore.getState().appModule).toBe("agents");
      expect(useAgentStore.getState().selectedAgentId).toBe("codex");
      expect(view.getByRole("dialog")).toHaveTextContent("Imported");
    });

    fireEvent.click(view.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(view.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("opens a stable deep-link error in the Agent workspace", async () => {
    const view = render(<Harness initialPage="settings" />);

    act(() =>
      deliverCommand({
        type: "agent:import-error",
        errorCode: "AGENT_DEEP_LINK_INVALID",
      }),
    );

    await waitFor(() => {
      expect(view.getByTestId("page")).toHaveTextContent("home");
      expect(useUIStore.getState().appModule).toBe("agents");
      expect(view.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("unmounts safely when the preload subscription returns no disposer", () => {
    installWindowMocks({
      electron: {
        onAppCommand: vi.fn((callback: (command: AppCommand) => void) => {
          deliverCommand = callback;
          return undefined;
        }),
      },
    });

    const view = render(<Harness />);
    expect(() => view.unmount()).not.toThrow();
  });
});
