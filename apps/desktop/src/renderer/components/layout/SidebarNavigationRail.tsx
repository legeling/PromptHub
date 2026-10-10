import type { ReactElement } from "react";
import { usePromptStore } from "../../stores/prompt.store";
import { SidebarRail } from "./SidebarRail";
import type { SidebarProps } from "./sidebar-controller-types";
import { useSidebarShellController } from "./useSidebarShellController";

export function SidebarNavigationRail({
  currentPage,
  onNavigate,
}: SidebarProps): ReactElement {
  const promptViewMode = usePromptStore((state) => state.viewMode);
  const shell = useSidebarShellController(
    currentPage,
    onNavigate,
    "rail",
    null,
    promptViewMode,
  );

  return (
    <aside
      className={`relative z-20 flex shrink-0 overflow-hidden ${shell.asideClassName}`}
    >
      <SidebarRail
        controller={{ ...shell, currentPage, onNavigate, layout: "rail" }}
      />
    </aside>
  );
}
