import { normalizeDesktopHomeModules } from "../stores/settings/settings-normalizers";
import type { DesktopHomeModule } from "../stores/settings/settings-types";

const WEB_DESKTOP_HOME_MODULES: readonly DesktopHomeModule[] = [
  "prompt",
  "skill",
  "agents",
  "mcp",
  "plugin",
  "rules",
];

export function resolveVisibleDesktopHomeModules(
  modules: readonly DesktopHomeModule[],
  webRuntime: boolean,
): DesktopHomeModule[] {
  if (webRuntime) {
    return modules.filter((moduleId) =>
      WEB_DESKTOP_HOME_MODULES.includes(moduleId),
    );
  }

  return normalizeDesktopHomeModules(modules, { includeNewDefaults: true });
}
