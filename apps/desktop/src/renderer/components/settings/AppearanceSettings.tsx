import type { ReactElement } from "react";
import { isWebRuntime } from "../../runtime";
import { BackgroundSettings } from "./appearance/BackgroundSettings";
import { ThemeColorSettings } from "./appearance/ThemeColorSettings";
import {
  FontSizeSettings,
  MotionSettings,
  ThemeModeSettings,
} from "./appearance/ThemeSettings";
import { WorkspaceSettings } from "./appearance/WorkspaceSettings";

export function AppearanceSettings(): ReactElement {
  const desktop = !isWebRuntime();
  return (
    <div className="min-w-0 space-y-5">
      <ThemeModeSettings />
      <ThemeColorSettings />
      <FontSizeSettings />
      {desktop && <WorkspaceSettings />}
      <MotionSettings />
      {desktop && <BackgroundSettings />}
    </div>
  );
}
