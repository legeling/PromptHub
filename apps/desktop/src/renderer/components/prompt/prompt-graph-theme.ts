import { useMemo } from "react";
import { useSettingsStore } from "../../stores/settings.store";

interface GraphThemeColors {
  background: string;
  nodeIsolated: string;
  nodeConnected: string;
  nodeAccent: string;
  nodeSelected: string;
  nodeDimmed: string;
  nodeSelectedRing: string;
  link: string;
  linkActive: string;
  linkSelected: string;
  label: string;
  labelActive: string;
  labelHalo: string;
}

export function usePromptGraphTheme(): GraphThemeColors {
  const isDarkMode = useSettingsStore((state) => state.isDarkMode);
  const themeHue = useSettingsStore((state) => state.themeHue);
  const themeSaturation = useSettingsStore((state) => state.themeSaturation);
  // Canvas cannot resolve var() in paint colors. Resolve the CSS-owned palette
  // only when the settings owner changes the application's theme.
  return useMemo(() => {
    const style = window.getComputedStyle(document.documentElement);
    const color = (name: string, opacity?: number): string =>
      `hsl(${style.getPropertyValue(name).trim()}${opacity === undefined ? "" : ` / ${opacity}`})`;
    return {
      background: color("--background"),
      nodeIsolated: color("--muted-foreground"),
      nodeConnected: color("--accent-foreground", 0.8),
      nodeAccent: color("--accent-foreground"),
      nodeSelected: color("--primary"),
      nodeDimmed: color("--muted-foreground", 0.34),
      nodeSelectedRing: color("--primary", 0.4),
      link: color("--muted-foreground", 0.38),
      linkActive: color("--primary", 0.9),
      linkSelected: color("--primary", 0.6),
      label: color("--foreground", 0.88),
      labelActive: color("--foreground"),
      labelHalo: color("--background"),
    };
  }, [isDarkMode, themeHue, themeSaturation]);
}
