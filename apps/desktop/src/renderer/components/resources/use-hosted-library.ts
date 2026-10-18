import { useCallback, useEffect, useRef, useState } from "react";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import { useMcpStore } from "../../stores/mcp.store";
import { usePluginStore } from "../../stores/plugin.store";
import {
  OPEN_CREATE_MCP_MODAL_EVENT,
  registerAssetWorkflowEvent,
} from "../app/app-command-events";
export type Resource = McpServerConfig | PluginLibraryEntry;
export type Kind = "mcp" | "plugin";

export function isMcp(resource: Resource): resource is McpServerConfig {
  return "transport" in resource;
}

async function readLibrary(kind: Kind): Promise<Resource[]> {
  if (kind === "mcp") {
    const library = await window.api.mcp.getLibrary();
    return library.servers;
  }
  const library = await window.api.plugin.getLibrary();
  return library.plugins;
}

export async function toggleFavorite(resource: Resource): Promise<void> {
  if (isMcp(resource))
    await window.api.mcp.updateServer(resource.id, {
      isFavorite: !resource.isFavorite,
    });
  else
    await window.api.plugin.updatePluginMetadata(resource.id, {
      isFavorite: !resource.isFavorite,
    });
}

export async function deleteResource(resource: Resource): Promise<void> {
  if (isMcp(resource)) await window.api.mcp.deleteServer(resource.id);
  else await window.api.plugin.deletePlugin(resource.id);
}

function publishLibrary(kind: Kind, items: Resource[]): void {
  if (kind === "mcp")
    useMcpStore.setState({
      library: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: new Date().toISOString(),
        servers: items.filter(isMcp),
        bindings: [],
      },
      selectedTab: "library",
    });
  else
    usePluginStore.setState({
      library: {
        kind: "prompthub-plugin-library",
        version: 1,
        updatedAt: new Date().toISOString(),
        plugins: items.filter(
          (item): item is PluginLibraryEntry => !isMcp(item),
        ),
      },
      selectedTab: "library",
    });
}
function useHostedLibraryState(kind: Kind) {
  const [items, setItems] = useState<Resource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Resource | "new" | null>(null);
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const [favorites, setFavorites] = useState(false);
  const epoch = useRef(0);
  const lifecycle = useRef(0);
  const writing = useRef(false);
  const mcpQuery = useMcpStore((state) => state.searchQuery);
  const pluginQuery = usePluginStore((state) => state.searchQuery);
  const query = (kind === "mcp" ? mcpQuery : pluginQuery).toLocaleLowerCase();
  const reload = useCallback(async (): Promise<boolean> => {
    const request = ++epoch.current;
    setLoading(true);
    try {
      const next = await readLibrary(kind);
      if (request === epoch.current) {
        setItems(next);
        publishLibrary(kind, next);
        setError(null);
        return true;
      }
      return false;
    } catch (cause) {
      if (request === epoch.current)
        setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      if (request === epoch.current) setLoading(false);
    }
  }, [kind]);
  useEffect(() => {
    lifecycle.current++;
    writing.current = false;
    setBusy(false);
    setItems([]);
    setSelected(null);
    setDeleting(null);
    void reload();
    return () => {
      epoch.current += 1;
      lifecycle.current++;
    };
  }, [reload]);
  useEffect(
    () =>
      kind === "mcp"
        ? registerAssetWorkflowEvent({
            asset: "mcp",
            eventName: OPEN_CREATE_MCP_MODAL_EVENT,
            listener: () => setSelected("new"),
          })
        : undefined,
    [kind],
  );
  async function run(operation: () => Promise<void>): Promise<boolean> {
    if (writing.current) return false;
    const generation = lifecycle.current;
    writing.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
      return generation === lifecycle.current ? await reload() : false;
    } catch (cause) {
      if (generation === lifecycle.current)
        setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      if (generation === lifecycle.current) {
        writing.current = false;
        setBusy(false);
      }
    }
  }
  const visible = items.filter(
    (item) =>
      (!favorites || item.isFavorite) &&
      `${item.name} ${item.displayName} ${item.description ?? ""}`
        .toLocaleLowerCase()
        .includes(query),
  );
  return {
    items,
    error,
    loading,
    busy,
    selected,
    setSelected,
    deleting,
    setDeleting,
    favorites,
    setFavorites,
    reload,
    run,
    visible,
  };
}
export type HostedLibraryState = ReturnType<typeof useHostedLibraryState>;
export function useHostedLibrary(kind: Kind): HostedLibraryState {
  return useHostedLibraryState(kind);
}
