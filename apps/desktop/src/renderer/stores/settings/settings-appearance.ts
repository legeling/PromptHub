import { resolveLocalImageSrc } from "../../utils/media-url";
import type { SettingsState, ThemeMode } from "./settings-types";

export const MORANDI_THEMES = [
  { id: "royal-blue", hue: 220, saturation: 70, name: "Royal Blue" },
  { id: "blue", hue: 210, saturation: 35, name: "Misty Blue" },
  { id: "purple", hue: 260, saturation: 30, name: "Smoky Purple" },
  { id: "green", hue: 150, saturation: 30, name: "Bean Green" },
  { id: "orange", hue: 25, saturation: 40, name: "Apricot Orange" },
  { id: "teal", hue: 175, saturation: 30, name: "Teal Blue" },
  { id: "rose", hue: 340, saturation: 42, name: "Rose" },
  { id: "coral", hue: 12, saturation: 55, name: "Coral" },
  { id: "amber", hue: 42, saturation: 52, name: "Amber" },
  { id: "olive", hue: 80, saturation: 28, name: "Olive" },
  { id: "slate", hue: 215, saturation: 14, name: "Slate" },
];

export const FONT_SIZES = [
  { id: "small", value: 14, name: "Small" },
  { id: "medium", value: 16, name: "Medium" },
  { id: "large", value: 18, name: "Large" },
];

export const DEFAULT_BACKGROUND_IMAGE_OPACITY = 1;
export const DEFAULT_BACKGROUND_IMAGE_BLUR = 0;
const LEGACY_BACKGROUND_IMAGE_BLUR_DEFAULT = 14;
const LOCAL_IMAGE_PROTOCOL_PREFIX = "local-image://";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export function clampBackgroundImageOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_IMAGE_OPACITY;
  }
  return clamp(Number(value), 0, 1);
}

export function clampBackgroundImageBlur(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_IMAGE_BLUR;
  }
  return Number(clamp(Number(value), 0, 50).toFixed(1));
}

function decodeBackgroundImageFileName(fileName: string): string {
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

export function normalizeBackgroundImageFileName(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const hasLocalImageProtocol = trimmed.startsWith(LOCAL_IMAGE_PROTOCOL_PREFIX);
  const rawFileName = hasLocalImageProtocol
    ? trimmed.slice(LOCAL_IMAGE_PROTOCOL_PREFIX.length)
    : trimmed;
  const fileName = hasLocalImageProtocol
    ? decodeBackgroundImageFileName(rawFileName)
    : rawFileName;

  if (
    !fileName ||
    /^(https?:|data:|blob:)/i.test(fileName) ||
    fileName.includes("..") ||
    /[\0/\\?#]/.test(fileName)
  ) {
    return undefined;
  }

  return fileName;
}

export function normalizeBackgroundImageBlur(
  value: number,
  persistedVersion?: number,
): number {
  const normalized = clampBackgroundImageBlur(value);
  if (
    (persistedVersion ?? 0) < 6 &&
    normalized === LEGACY_BACKGROUND_IMAGE_BLUR_DEFAULT
  ) {
    return DEFAULT_BACKGROUND_IMAGE_BLUR;
  }
  return normalized;
}

export function getRenderedBackgroundImageOpacity(value: number): number {
  return clamp(value, 0, 1);
}

export function getRenderedBackgroundImageBlur(value: number): number {
  return clampBackgroundImageBlur(value);
}

export function applyBackgroundImageVars(options: {
  backgroundImageFileName?: string;
  backgroundImageOpacity?: number;
  backgroundImageBlur?: number;
}): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const fileName = normalizeBackgroundImageFileName(
    options.backgroundImageFileName,
  );
  const resolvedSrc = fileName ? resolveLocalImageSrc(fileName) : "";

  root.style.setProperty(
    "--app-background-image",
    resolvedSrc ? `url(\"${resolvedSrc.replace(/\"/g, '\\\"')}\")` : "none",
  );
  root.style.setProperty(
    "--app-background-opacity",
    String(
      clampBackgroundImageOpacity(
        options.backgroundImageOpacity ?? DEFAULT_BACKGROUND_IMAGE_OPACITY,
      ),
    ),
  );
  root.style.setProperty(
    "--app-background-blur",
    `${clampBackgroundImageBlur(
      options.backgroundImageBlur ?? DEFAULT_BACKGROUND_IMAGE_BLUR,
    )}px`,
  );
}

export function hexToHs(hex: string): { hue: number; saturation: number } {
  const normalized = (hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }

  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return {
    hue: clamp(hue, 0, 360),
    saturation: clamp(Math.round(saturation * 100), 0, 100),
  };
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function normalizeFontSize(value: unknown): string {
  return FONT_SIZES.some((fontSize) => fontSize.id === value)
    ? (value as string)
    : "medium";
}

export function normalizeMotionPreference(
  value: unknown,
): "off" | "reduced" | "standard" {
  return value === "off" || value === "reduced" || value === "standard"
    ? value
    : "standard";
}

export function normalizeAppearanceSettings(
  next: Pick<
    SettingsState,
    "themeMode" | "fontSize" | "motionPreference" | "language"
  >,
  normalizeLanguage: (language: string) => SettingsState["language"],
): void {
  next.themeMode = normalizeThemeMode(next.themeMode);
  next.fontSize = normalizeFontSize(next.fontSize);
  next.motionPreference = normalizeMotionPreference(next.motionPreference);
  next.language = normalizeLanguage(
    typeof next.language === "string" ? next.language : "",
  );
}
