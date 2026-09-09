import { useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginSourceUpdateCheck,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "@prompthub/shared/types/plugin";
import type { SkillSafetyReport } from "@prompthub/shared/types";

const SAFE_PLUGIN_ICON_URL_PATTERN =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;

function getPluginInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function resolvePluginIconUrl(iconUrl?: string | null): string {
  const trimmed = iconUrl?.trim() ?? "";
  if (!trimmed) return "";
  if (SAFE_PLUGIN_ICON_URL_PATTERN.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

function getPluginBrandStyle(brandColor?: string): CSSProperties | undefined {
  if (!brandColor || !/^#[0-9a-f]{6}$/i.test(brandColor)) {
    return undefined;
  }
  return {
    backgroundColor: `${brandColor}1A`,
    color: brandColor,
  };
}

export function getSourceUpdateTone(
  status?: PluginSourceUpdateCheck["status"],
) {
  if (status === "update-available") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "local-modified" || status === "conflict") {
    return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300";
  }
  if (status === "up-to-date") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  }
  return "border-border bg-background text-muted-foreground";
}

export function getSourceUpdateLabel(
  check: PluginSourceUpdateCheck | undefined,
  isChecking: boolean,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (isChecking) return t("plugin.checkingUpdates", "Checking...");
  if (!check) return t("plugin.checkForUpdates", "Check updates");
  if (check.status === "update-available") {
    return t("plugin.updateAvailable", "Update available");
  }
  if (check.status === "local-modified") {
    return t("plugin.localChanges", "Local changes");
  }
  if (check.status === "conflict") {
    return t("plugin.updateConflict", "Update conflict");
  }
  if (check.status === "up-to-date") {
    return t("plugin.upToDate", "Up to date");
  }
  return t("plugin.noSourceUpdate", "No source update");
}

export function PluginDetailAvatar({ plugin }: { plugin: PluginLibraryEntry }) {
  const [imageFailed, setImageFailed] = useState(false);
  const iconUrl = resolvePluginIconUrl(plugin.iconUrl || plugin.logoUrl);
  const brandStyle = getPluginBrandStyle(plugin.brandColor);

  if (iconUrl && !imageFailed) {
    return (
      <div
        className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/60 bg-background"
        style={brandStyle}
      >
        <img
          data-testid="plugin-detail-avatar-image"
          src={iconUrl}
          alt=""
          aria-hidden="true"
          className="h-11 w-11 object-contain"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary"
      style={brandStyle}
    >
      {getPluginInitial(plugin.displayName)}
    </div>
  );
}

function getInventoryUnitLabel(
  key: keyof PluginInventorySummary,
  count: number,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const suffix = count === 1 ? "One" : "Other";
  const labels: Record<keyof PluginInventorySummary, string> = {
    skills: t(`plugin.inventoryUnit.skills${suffix}`, "Skill"),
    mcpServers: t(`plugin.inventoryUnit.mcpServers${suffix}`, "MCP server"),
    apps: t(`plugin.inventoryUnit.apps${suffix}`, "App"),
    commands: t(`plugin.inventoryUnit.commands${suffix}`, "command"),
    hooks: t(`plugin.inventoryUnit.hooks${suffix}`, "hook"),
    agents: t(`plugin.inventoryUnit.agents${suffix}`, "agent"),
    assets: t(`plugin.inventoryUnit.assets${suffix}`, "asset"),
    docs: t(`plugin.inventoryUnit.docs${suffix}`, "doc"),
    lspServers: t(`plugin.inventoryUnit.lspServers${suffix}`, "LSP server"),
    scripts: t(`plugin.inventoryUnit.scripts${suffix}`, "script"),
  };
  return labels[key];
}

export function InventorySummary({
  inventory,
}: {
  inventory: PluginInventorySummary;
}) {
  const { t } = useTranslation();
  const chips = PLUGIN_INVENTORY_KEYS.map((key) => ({
    key,
    count: inventory[key],
    label: t("plugin.inventoryChip", {
      count: inventory[key],
      defaultValue: "{{count}} {{label}}",
      label: getInventoryUnitLabel(key, inventory[key], t),
    }),
  })).filter((item) => item.count > 0);

  if (chips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("plugin.inventoryEmpty", "No child assets detected.")}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

export function getPluginLocalPackagePath(plugin: PluginLibraryEntry): string {
  return (
    plugin.localPackagePath ||
    plugin.source.localPackagePath ||
    plugin.managedPath ||
    plugin.localRepositoryPath ||
    plugin.source.localRepositoryPath ||
    ""
  );
}

export function computePluginSafetyScore(report: SkillSafetyReport): number {
  const findingCount = report.findings.length;
  switch (report.level) {
    case "blocked":
      return Math.max(0, 10 - findingCount * 2);
    case "high-risk":
      return Math.max(20, 40 - findingCount * 3);
    case "warn":
      return Math.max(50, 70 - findingCount * 4);
    case "safe":
      return Math.max(80, 100 - findingCount * 5);
    default:
      return 50;
  }
}

export function getPluginSafetySourceUrl(plugin: PluginLibraryEntry): string {
  return (
    plugin.repository ||
    plugin.source.repository ||
    plugin.source.url ||
    plugin.homepage ||
    ""
  );
}

export function buildPluginSafetyScanContent(plugin: PluginLibraryEntry): string {
  return [plugin.description, plugin.longDescription].filter(Boolean).join("\n\n");
}

export function getPluginDescriptionText(
  plugin: PluginLibraryEntry,
  fallback: string,
): string {
  const sections = [plugin.description, plugin.longDescription]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return sections.length > 0 ? sections.join("\n\n") : fallback;
}

export function getPluginTextFingerprint(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) >>> 0;
  }
  return `${content.length}:${hash.toString(16)}`;
}

function stripPluginTranslationFrontmatter(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) {
    return trimmed;
  }

  const lines = trimmed.split(/\r?\n/);
  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line === "---",
  );
  if (endIndex === -1) {
    return trimmed;
  }
  return lines
    .slice(endIndex + 1)
    .join("\n")
    .trim();
}

export function normalizePluginTranslatedText(content: string): string {
  const body = stripPluginTranslationFrontmatter(content);
  const translatedLines = body
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .match(/^<t>(.*)<\/t>$/)?.[1]
        ?.trim(),
    )
    .filter((line): line is string => Boolean(line));

  if (translatedLines.length > 0) {
    return translatedLines.join("\n\n");
  }

  return body.replace(/<\/?t>/g, "").trim();
}

export function getPluginTranslationTargetLanguage(language?: string): string {
  const lang = (language || "").toLowerCase();
  if (lang.startsWith("zh")) return "中文";
  if (lang.startsWith("ja")) return "日本語";
  if (lang.startsWith("ko")) return "한국어";
  return "English";
}

export function DetailTabButton({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative py-3 text-sm font-semibold transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        {children}
      </div>
      {active ? (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />
      ) : null}
    </button>
  );
}

export function getPluginTargetPlatformId(targetId: string): string {
  const iconIds: Record<string, string> = {
    "claude-code": "claude",
    "gemini-cli": "gemini",
    "github-copilot": "copilot",
  };
  return iconIds[targetId] ?? targetId;
}

export function getPluginTargetMatrixForEntry(
  targets: PluginTargetCompatibility[],
  plugin: PluginLibraryEntry,
): PluginTargetCompatibility[] {
  const nativeTargetIds = new Set(plugin.nativeTargetIds ?? []);
  const invalidNativeTargetIds = new Set(plugin.invalidNativeTargetIds ?? []);
  return targets.map((target) => {
    if (invalidNativeTargetIds.has(target.id)) {
      return {
        ...target,
        enabled: false,
        unsupportedReason: "invalid-native-manifest",
      };
    }
    return target.enabled &&
      target.status !== "native" &&
      nativeTargetIds.has(target.id)
      ? { ...target, status: "native" }
      : target;
  });
}

export function getPluginTargetDescription(
  target: PluginTargetCompatibility,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const localizedDescription = t(`plugin.targetDescriptions.${target.id}`, {
    defaultValue: "",
    name: target.displayName,
  }).trim();
  if (localizedDescription) {
    return localizedDescription;
  }
  if (target.unsupportedReason === "invalid-native-manifest") {
    return t("plugin.targetDescriptions.invalidNativeManifest", {
      defaultValue:
        "Invalid native manifest: {{marker}}. Fix or remove it before distribution.",
      marker: target.nativeMarker ?? target.id,
    });
  }
  if (!target.enabled) {
    return t("plugin.targetDescriptions.unsupportedBundle", {
      defaultValue:
        "{{name}} does not expose a complete PromptHub Plugin bundle surface.",
      name: target.displayName,
    });
  }
  return (
    target.adapterOutput ||
    target.installSurface ||
    target.description ||
    t(
      "plugin.targetAdapterReady",
      "Ready for adapter-backed Plugin distribution.",
    )
  );
}
