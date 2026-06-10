import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ImageIcon, UploadIcon, XIcon } from "lucide-react";
import {
  ICON_ARCHITECTURE,
  ICON_BARCHART,
  ICON_BOT,
  ICON_BRUSH,
  ICON_CSS,
  ICON_DOCUMENT,
  ICON_DOCKER,
  ICON_FOLDER,
  ICON_GITHUB,
  ICON_GLOBE,
  ICON_HTML5,
  ICON_IMAGE,
  ICON_LIGHTBULB,
  ICON_LOCK,
  ICON_MCP,
  ICON_OPENAI,
  ICON_PDF,
  ICON_PEN,
  ICON_PLAYWRIGHT,
  ICON_POSTGRESQL,
  ICON_REACT,
  ICON_RESEARCH,
  ICON_SWATCHES,
  ICON_TARGET,
  ICON_TERMINAL,
} from "@prompthub/shared/constants/skill-icons";
import { SkillIcon } from "./SkillIcon";
import { useSettingsStore } from "../../stores/settings.store";

interface SkillIconPickerProps {
  name: string;
  iconUrl?: string;
  iconEmoji?: string;
  iconBackground?: string;
  onChange: (next: {
    iconUrl?: string;
    iconEmoji?: string;
    iconBackground?: string;
  }) => void;
}

interface PresetIconOption {
  id: string;
  name: string;
  iconUrl: string;
  background: string;
}

const LIGHT_PRESET_BACKGROUNDS = [
  "#f2d6de",
  "#e8d9f7",
  "#dce8ff",
  "#d9efe7",
  "#f6e3d3",
  "#f5e6bf",
  "#dceff5",
  "#e7e4fb",
  "#f2dfcf",
  "#dfe7ce",
  "#eadff0",
  "#dce7e6",
];

const DARK_PRESET_BACKGROUNDS = [
  "#4f2d3b",
  "#4a3559",
  "#30435f",
  "#27473f",
  "#5b4032",
  "#5c4b22",
  "#28414f",
  "#38385f",
  "#5a4338",
  "#465032",
  "#514159",
  "#364748",
];

const LIGHT_PRESET_ICONS: PresetIconOption[] = [
  { id: "document", name: "Document", iconUrl: ICON_DOCUMENT, background: "#efe6dc" },
  { id: "folder", name: "Folder", iconUrl: ICON_FOLDER, background: "#dce8ff" },
  { id: "pdf", name: "PDF", iconUrl: ICON_PDF, background: "#e8d7f3" },
  { id: "github", name: "GitHub", iconUrl: ICON_GITHUB, background: "#e1e4fb" },
  { id: "terminal", name: "Terminal", iconUrl: ICON_TERMINAL, background: "#dce7e6" },
  { id: "mcp", name: "MCP", iconUrl: ICON_MCP, background: "#d6ece7" },
  { id: "html", name: "HTML", iconUrl: ICON_HTML5, background: "#f5ddd2" },
  { id: "css", name: "CSS", iconUrl: ICON_CSS, background: "#f2d6de" },
  { id: "react", name: "React", iconUrl: ICON_REACT, background: "#d9edf7" },
  { id: "docker", name: "Docker", iconUrl: ICON_DOCKER, background: "#d9e5ff" },
  { id: "database", name: "PostgreSQL", iconUrl: ICON_POSTGRESQL, background: "#dfe7ce" },
  { id: "chart", name: "Chart", iconUrl: ICON_BARCHART, background: "#ece0f4" },
  { id: "research", name: "Research", iconUrl: ICON_RESEARCH, background: "#d8ebed" },
  { id: "target", name: "Target", iconUrl: ICON_TARGET, background: "#f5e6bf" },
  { id: "image", name: "Image", iconUrl: ICON_IMAGE, background: "#dce8ff" },
  { id: "design", name: "Design", iconUrl: ICON_BRUSH, background: "#f2d6de" },
  { id: "palette", name: "Palette", iconUrl: ICON_SWATCHES, background: "#eadff0" },
  { id: "playwright", name: "Playwright", iconUrl: ICON_PLAYWRIGHT, background: "#e6d9f5" },
  { id: "architecture", name: "Architecture", iconUrl: ICON_ARCHITECTURE, background: "#dbe8e7" },
  { id: "globe", name: "Globe", iconUrl: ICON_GLOBE, background: "#d8eef0" },
  { id: "lightbulb", name: "Idea", iconUrl: ICON_LIGHTBULB, background: "#f3e4b8" },
  { id: "pen", name: "Writing", iconUrl: ICON_PEN, background: "#f2dfcf" },
  { id: "security", name: "Security", iconUrl: ICON_LOCK, background: "#e4dcf7" },
  { id: "bot", name: "Bot", iconUrl: ICON_BOT, background: "#dce7ff" },
  { id: "openai", name: "OpenAI", iconUrl: ICON_OPENAI, background: "#e9dfd0" },
];

const DARK_PRESET_ICONS: PresetIconOption[] = [
  { id: "document", name: "Document", iconUrl: ICON_DOCUMENT, background: "#5b463b" },
  { id: "folder", name: "Folder", iconUrl: ICON_FOLDER, background: "#334766" },
  { id: "pdf", name: "PDF", iconUrl: ICON_PDF, background: "#4c3b63" },
  { id: "github", name: "GitHub", iconUrl: ICON_GITHUB, background: "#39425f" },
  { id: "terminal", name: "Terminal", iconUrl: ICON_TERMINAL, background: "#314646" },
  { id: "mcp", name: "MCP", iconUrl: ICON_MCP, background: "#284842" },
  { id: "html", name: "HTML", iconUrl: ICON_HTML5, background: "#5d4036" },
  { id: "css", name: "CSS", iconUrl: ICON_CSS, background: "#5b3441" },
  { id: "react", name: "React", iconUrl: ICON_REACT, background: "#224a5b" },
  { id: "docker", name: "Docker", iconUrl: ICON_DOCKER, background: "#304c6d" },
  { id: "database", name: "PostgreSQL", iconUrl: ICON_POSTGRESQL, background: "#475536" },
  { id: "chart", name: "Chart", iconUrl: ICON_BARCHART, background: "#4a405d" },
  { id: "research", name: "Research", iconUrl: ICON_RESEARCH, background: "#29494e" },
  { id: "target", name: "Target", iconUrl: ICON_TARGET, background: "#5f5129" },
  { id: "image", name: "Image", iconUrl: ICON_IMAGE, background: "#304863" },
  { id: "design", name: "Design", iconUrl: ICON_BRUSH, background: "#5d3642" },
  { id: "palette", name: "Palette", iconUrl: ICON_SWATCHES, background: "#503f5d" },
  { id: "playwright", name: "Playwright", iconUrl: ICON_PLAYWRIGHT, background: "#4b3c5f" },
  { id: "architecture", name: "Architecture", iconUrl: ICON_ARCHITECTURE, background: "#344a4a" },
  { id: "globe", name: "Globe", iconUrl: ICON_GLOBE, background: "#284953" },
  { id: "lightbulb", name: "Idea", iconUrl: ICON_LIGHTBULB, background: "#5a4a25" },
  { id: "pen", name: "Writing", iconUrl: ICON_PEN, background: "#5c4337" },
  { id: "security", name: "Security", iconUrl: ICON_LOCK, background: "#433f5f" },
  { id: "bot", name: "Bot", iconUrl: ICON_BOT, background: "#344864" },
  { id: "openai", name: "OpenAI", iconUrl: ICON_OPENAI, background: "#54493f" },
];

export function SkillIconPicker({
  name,
  iconUrl,
  iconEmoji,
  iconBackground,
  onChange,
}: SkillIconPickerProps) {
  const { t } = useTranslation();
  const isDarkMode = useSettingsStore((state) => state.isDarkMode);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const presetIcons = useMemo(
    () => (isDarkMode ? DARK_PRESET_ICONS : LIGHT_PRESET_ICONS),
    [isDarkMode],
  );
  const presetBackgrounds = useMemo(
    () => (isDarkMode ? DARK_PRESET_BACKGROUNDS : LIGHT_PRESET_BACKGROUNDS),
    [isDarkMode],
  );

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) {
        onChange({
          iconUrl: result,
          iconEmoji: undefined,
          iconBackground,
        });
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/10 dark:bg-muted/5 p-4">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <SkillIcon
            iconUrl={iconUrl}
            iconEmoji={iconEmoji}
            backgroundColor={iconBackground}
            name={name || "Skill"}
            size="xl"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="text-sm font-medium text-foreground">
              {t("skill.icon", "图标")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("skill.iconHint", "可以上传自己的图标，或从预置图标里直接选择。")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <UploadIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {t("skill.uploadIcon", "上传图标")}
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({
                  iconUrl: undefined,
                  iconEmoji: undefined,
                  iconBackground: undefined,
                })
              }
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <XIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {t("common.clear", "清空")}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            aria-label={t("skill.uploadIcon", "上传图标")}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {t("skill.presetIcons", "预置图标")}
        </div>
        <div className="grid grid-cols-5 gap-2 md:grid-cols-8">
          {presetIcons.map((preset) => {
            const active = iconUrl === preset.iconUrl && !iconEmoji;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                aria-label={t("skill.selectPresetIcon", {
                  name: preset.name,
                  defaultValue: "Select {{name}} icon",
                })}
                onClick={() =>
                  onChange({
                    iconUrl: preset.iconUrl,
                    iconEmoji: undefined,
                    iconBackground: iconBackground || preset.background,
                  })
                }
                className={`rounded-xl border p-2 transition-all ${
                  active
                    ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(96,165,250,0.2)] dark:bg-primary/15"
                    : "border-border bg-background/80 dark:bg-background/40 hover:border-primary/40 hover:bg-accent/60"
                }`}
                title={preset.name}
              >
                <div className="flex items-center justify-center">
                  <SkillIcon
                    aria-hidden="true"
                    iconUrl={preset.iconUrl}
                    backgroundColor={preset.background}
                    name={preset.name}
                    size="md"
                    decorative
                  />
                </div>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={!iconUrl && !iconEmoji}
            aria-label={t("skill.useDefaultIcon", "使用默认图标")}
            onClick={() =>
              onChange({
                iconUrl: undefined,
                iconEmoji: undefined,
                iconBackground: undefined,
              })
            }
            className={`rounded-xl border p-2 transition-all ${
              !iconUrl && !iconEmoji
                ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(96,165,250,0.2)] dark:bg-primary/15"
                : "border-border bg-background/80 dark:bg-background/40 hover:border-primary/40 hover:bg-accent/60"
            }`}
            title={t("skill.useDefaultIcon", "使用默认图标")}
          >
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-muted/80 dark:bg-muted/40 text-muted-foreground">
              <ImageIcon aria-hidden="true" className="h-4 w-4" />
            </div>
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {t("skill.iconBackground", "图标背景")}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {t(
            "skill.iconBackgroundHint",
            "为图标选择一个更稳定的背景色，详情页里不会再出现悬浮阴影效果。",
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {presetBackgrounds.map((background) => {
            const active = iconBackground === background;
            return (
              <button
                key={background}
                type="button"
                aria-pressed={active}
                aria-label={t("skill.selectIconBackground", {
                  color: background,
                  defaultValue: "Select icon background {{color}}",
                })}
                onClick={() =>
                  onChange({
                    iconUrl,
                    iconEmoji,
                    iconBackground: background,
                  })
                }
                className={`h-9 w-9 rounded-xl border transition-all ${
                  active
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/40"
                }`}
                style={{ backgroundColor: background }}
                title={background}
              />
            );
          })}
          <button
            type="button"
            aria-pressed={!iconBackground}
            aria-label={t(
              "skill.useDefaultIconBackground",
              "Use default icon background",
            )}
            onClick={() =>
              onChange({
                iconUrl,
                iconEmoji,
                iconBackground: undefined,
              })
            }
            className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-medium transition-all ${
              !iconBackground
                ? "border-primary bg-primary/10 text-primary dark:bg-primary/15"
                : "border-border bg-background/80 dark:bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {t("skill.useDefaultBackground", "默认")}
          </button>
        </div>
      </div>
    </div>
  );
}
