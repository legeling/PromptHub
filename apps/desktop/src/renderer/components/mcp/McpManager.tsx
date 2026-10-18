import { ResourceDistributionNotice } from "../resources/ResourceDistributionNotice";
import { Spinner } from "../ui/Spinner";
import { isWebRuntime } from "../../runtime";
import { HostedResourceManager } from "../resources/HostedResourceManager";
import { McpManagerDialogLayer } from "./McpManagerDialogLayer";
import { McpManagerViewRouter } from "./McpManagerViewRouter";
import { useMcpManagerController } from "./useMcpManagerController";

/**
 * MCP page composition root. State, derived data, lifecycle effects, and
 * side-effect actions are owned by the controller's focused hooks.
 */
export function McpManager() {
  return isWebRuntime() ? (
    <HostedResourceManager kind="mcp" />
  ) : (
    <DesktopMcpManager />
  );
}

function DesktopMcpManager() {
  const model = useMcpManagerController();
  if (model.isLoading && !model.library) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {model.selectedTab === "library" && (
        <ResourceDistributionNotice
          unknown={model.libraryCounts.unknown}
          error={model.statusError ?? model.targetInventoryError}
          onRefresh={() => void model.refreshVisibleTargetStatus()}
        />
      )}
      <McpManagerViewRouter model={model} />
      <McpManagerDialogLayer model={model} />
    </div>
  );
}

export default McpManager;
