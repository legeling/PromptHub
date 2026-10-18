import { PluginManagerView } from "./PluginManagerView";
import { isWebRuntime } from "../../runtime";
import { HostedResourceManager } from "../resources/HostedResourceManager";
import { usePluginManagerController } from "./usePluginManagerController";

export function PluginManager() {
  return isWebRuntime() ? (
    <HostedResourceManager kind="plugin" />
  ) : (
    <DesktopPluginManager />
  );
}

function DesktopPluginManager() {
  const model = usePluginManagerController();
  return <PluginManagerView model={model} />;
}
