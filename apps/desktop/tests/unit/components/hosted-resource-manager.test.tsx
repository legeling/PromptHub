import { act } from "@testing-library/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HostedResourceManager } from "../../../src/renderer/components/resources/HostedResourceManager";
import { normalizeMcpServerDraft } from "@prompthub/shared/utils/mcp-config";
import type { McpLibraryFile } from "@prompthub/shared/types/mcp";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import { usePluginStore } from "../../../src/renderer/stores/plugin.store";
import type { PluginLibraryFile } from "@prompthub/shared/types/plugin";

vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "__PROMPTHUB_WEB__");
});

it("manages hosted Plugin favorites and deletion without local distribution controls", async () => {
  Reflect.set(window, "__PROMPTHUB_WEB__", true);
  let library: PluginLibraryFile = {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: new Date(0).toISOString(),
    plugins: [
      {
        id: "example",
        name: "writer",
        displayName: "Writer Plugin",
        source: { kind: "local" },
        trustLevel: "custom",
        classification: "bundle",
        inventory: {
          skills: 1,
          mcpServers: 0,
          apps: 0,
          commands: 0,
          hooks: 0,
          agents: 0,
          assets: 0,
          docs: 0,
          lspServers: 0,
          scripts: 0,
        },
        installedAt: 1,
        updatedAt: 1,
      },
    ],
  };
  vi.spyOn(window.api.plugin, "getLibrary").mockImplementation(async () =>
    structuredClone(library),
  );
  vi.spyOn(window.api.plugin, "updatePluginMetadata").mockImplementation(
    async (_id, patch) => {
      library = {
        ...library,
        plugins: library.plugins.map((plugin) => ({ ...plugin, ...patch })),
      };
      return library;
    },
  );
  vi.spyOn(window.api.plugin, "deletePlugin").mockImplementation(async () => {
    library = { ...library, plugins: [] };
    return library;
  });
  usePluginStore.setState({ searchQuery: "" });
  render(<HostedResourceManager kind="plugin" />);
  await screen.findByText("Writer Plugin");
  expect(screen.queryByText("plugin.distributeToSelectedAgents")).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "nav.favorites" })[1]);
  await waitFor(() =>
    expect(usePluginStore.getState().library?.plugins[0].isFavorite).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "common.delete" }));
  fireEvent.click(screen.getByRole("button", { name: "common.confirm" }));
  await waitFor(() => expect(screen.queryByText("Writer Plugin")).toBeNull());
  expect(usePluginStore.getState().library?.plugins).toEqual([]);
});

it("does not publish a late reload after leaving the hosted resource view", async () => {
  Reflect.set(window, "__PROMPTHUB_WEB__", true);
  const library: McpLibraryFile = {
    kind: "prompthub-mcp-library",
    version: 1,
    updatedAt: new Date(0).toISOString(),
    bindings: [],
    servers: [
      normalizeMcpServerDraft({
        id: "late",
        name: "late",
        displayName: "Late",
        command: "node",
      }),
    ],
  };
  const read = vi
    .spyOn(window.api.mcp, "getLibrary")
    .mockResolvedValue(library);
  let finish: (() => void) | undefined;
  vi.spyOn(window.api.mcp, "updateServer").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(library.servers[0]);
      }),
  );
  useMcpStore.setState({ searchQuery: "" });
  const view = render(<HostedResourceManager kind="mcp" />);
  await screen.findByText("Late");
  fireEvent.click(screen.getAllByRole("button", { name: "nav.favorites" })[1]);
  await waitFor(() => expect(finish).toBeDefined());
  view.unmount();
  await act(async () => {
    finish?.();
  });
  expect(read).toHaveBeenCalledTimes(1);
});

// Boundary: the preload transport is replaced. These checks exercise the real hosted
// component/store, while the HTTP suites separately cover tenant persistence.
it("refreshes favorites and deletion, retains visible data on failure and has no distribution controls", async () => {
  Reflect.set(window, "__PROMPTHUB_WEB__", true);
  let library: McpLibraryFile = {
    kind: "prompthub-mcp-library",
    version: 1,
    updatedAt: new Date(0).toISOString(),
    bindings: [],
    servers: [
      normalizeMcpServerDraft({
        id: "example",
        name: "writer",
        displayName: "Writer",
        command: "node",
      }),
    ],
  };
  vi.spyOn(window.api.mcp, "getLibrary").mockImplementation(async () =>
    structuredClone(library),
  );
  vi.spyOn(window.api.mcp, "updateServer").mockImplementation(
    async (id, draft) => {
      library = {
        ...library,
        servers: library.servers.map((server) =>
          server.id === id ? { ...server, ...draft } : server,
        ),
      };
      return library.servers[0];
    },
  );
  const remove = vi
    .spyOn(window.api.mcp, "deleteServer")
    .mockRejectedValueOnce(new Error("Storage unavailable"));
  useMcpStore.setState({ searchQuery: "" });
  render(<HostedResourceManager kind="mcp" />);
  await screen.findByText("Writer");
  expect(screen.queryByText("mcp.notDistributed")).toBeNull();
  expect(screen.queryByText("mcp.distribute")).toBeNull();
  const favorites = screen.getAllByRole("button", { name: "nav.favorites" });
  fireEvent.click(favorites[0]);
  expect(screen.queryByText("Writer")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "filter.all" }));
  fireEvent.click(screen.getAllByRole("button", { name: "nav.favorites" })[1]);
  await waitFor(() =>
    expect(useMcpStore.getState().library.servers[0].isFavorite).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "common.delete" }));
  fireEvent.click(screen.getByRole("button", { name: "common.confirm" }));
  await screen.findByText("Storage unavailable");
  expect(library.servers).toHaveLength(1);
  expect(screen.getByText("Writer")).toBeInTheDocument();
  remove.mockImplementation(async () => {
    library = { ...library, servers: [] };
    return library;
  });
  fireEvent.click(screen.getByRole("button", { name: "common.confirm" }));
  await waitFor(() => expect(screen.queryByText("Writer")).toBeNull());
  expect(useMcpStore.getState().library.servers).toEqual([]);
});
