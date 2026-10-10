import {
  useSidebarController,
  type PageType,
  type SidebarLayout,
  type SidebarProps,
} from "./useSidebarController";
import { SidebarView } from "./SidebarView";
import { SidebarNavigationRail } from "./SidebarNavigationRail";

export type { PageType, SidebarLayout, SidebarProps };

function SidebarWithPanel(props: SidebarProps) {
  const controller = useSidebarController(props);
  return <SidebarView controller={controller} />;
}

export function Sidebar(props: SidebarProps) {
  return props.layout === "rail" ? (
    <SidebarNavigationRail {...props} />
  ) : (
    <SidebarWithPanel {...props} />
  );
}
