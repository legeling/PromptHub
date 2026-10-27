import { useState, type HTMLAttributes } from "react";
import {
  SparklesIcon,
  TerminalIcon,
  GithubIcon,
  WindIcon,
  SparkleIcon,
  ZapIcon,
  BotIcon,
  CodeIcon,
  BracesIcon,
  CommandIcon,
  LayoutGridIcon,
  BugIcon,
  PiIcon,
  BriefcaseBusinessIcon,
} from "lucide-react";

// Import platform icons
// 导入平台图标
import claudeIcon from "../../assets/platforms/claude.png";
import cursorIcon from "../../assets/platforms/cursor.png";
import copilotIcon from "../../assets/platforms/copilot.png";
import windsurfIcon from "../../assets/platforms/windsurf.png";
import kiroIcon from "../../assets/platforms/kiro.png";
import geminiIcon from "../../assets/platforms/gemini.png";
import antigravityIcon from "../../assets/platforms/antigravity.svg";
import clineIcon from "../../assets/platforms/cline.svg";
import traeIcon from "../../assets/platforms/trae.png";
import workbuddyIcon from "../../assets/platforms/workbuddy.svg";
import opencodeIcon from "../../assets/platforms/opencode.png";
import codexIcon from "../../assets/platforms/codex.png";
import codexDarkIcon from "../../assets/platforms/codex-dark.png";
import grokLightIcon from "../../assets/platforms/grok-light.svg";
import grokDarkIcon from "../../assets/platforms/grok-dark.svg";
import kiloLightIcon from "../../assets/platforms/kilo-light.svg";
import kiloDarkIcon from "../../assets/platforms/kilo-dark.svg";
import openclawIcon from "../../assets/platforms/openclaw.png";
import copawIcon from "../../assets/platforms/copaw.png";
import autoclawIcon from "../../assets/platforms/autoclaw.png";
import nanoclawIcon from "../../assets/platforms/nanoclaw.png";
import qclawIcon from "../../assets/platforms/qclaw.png";
import qoderIcon from "../../assets/platforms/qoder.png";
import qoderworkIcon from "../../assets/platforms/qoderwork.png";
import codebuddyLightIcon from "../../assets/platforms/codebuddy-light.svg";
import codebuddyDarkIcon from "../../assets/platforms/codebuddy-dark.svg";
import hermesIcon from "../../assets/platforms/hermes.png";
import cherryStudioIcon from "../../assets/platforms/cherry-studio.png";
import zcodeIcon from "../../assets/platforms/zcode.svg";
import reasonixIcon from "../../assets/platforms/reasonix.svg";
import augmentIcon from "../../assets/platforms/augment.svg";
import kimiIcon from "../../assets/platforms/kimi.png";
import qwenIcon from "../../assets/platforms/qwen.png";
import qwenWorkIcon from "../../assets/platforms/qwen-work.png";
import piIcon from "../../assets/platforms/pi.svg";
import ohMyPiIcon from "../../assets/platforms/oh-my-pi.svg";
import chatgptLightIcon from "../../assets/platforms/chatgpt-light.png";
import chatgptDarkIcon from "../../assets/platforms/chatgpt-dark.png";
import deepseekHarnessLightIcon from "../../assets/platforms/deepseek-harness-light.svg";
import deepseekHarnessDarkIcon from "../../assets/platforms/deepseek-harness-dark.svg";
import doubaoIcon from "../../assets/providers/doubao.svg";

type PlatformIconSource = string | { light: string; dark: string };

// Platform icon mapping
// 平台图标映射
const PLATFORM_ICONS: Record<string, PlatformIconSource> = {
  claude: claudeIcon,
  "deepseek-harness": {
    light: deepseekHarnessLightIcon,
    dark: deepseekHarnessDarkIcon,
  },
  cursor: cursorIcon,
  copilot: copilotIcon,
  windsurf: windsurfIcon,
  kiro: kiroIcon,
  gemini: geminiIcon,
  antigravity: antigravityIcon,
  "antigravity-cli": antigravityIcon,
  cline: clineIcon,
  trae: traeIcon,
  "trae-work": traeIcon,
  "trae-cn": traeIcon,
  "trae-work-cn": traeIcon,
  workbuddy: workbuddyIcon,
  opencode: opencodeIcon,
  codex: {
    light: codexIcon,
    dark: codexDarkIcon,
  },
  chatgpt: {
    light: chatgptLightIcon,
    dark: chatgptDarkIcon,
  },
  zcode: zcodeIcon,
  grok: {
    light: grokLightIcon,
    dark: grokDarkIcon,
  },
  kilo: {
    light: kiloLightIcon,
    dark: kiloDarkIcon,
  },
  openclaw: openclawIcon,
  copaw: copawIcon,
  autoclaw: autoclawIcon,
  nanoclaw: nanoclawIcon,
  qclaw: qclawIcon,
  qoder: qoderIcon,
  qoderwork: qoderworkIcon,
  reasonix: reasonixIcon,
  augment: augmentIcon,
  kimi: kimiIcon,
  qwen: qwenIcon,
  "qwen-work": qwenWorkIcon,
  pi: piIcon,
  "oh-my-pi": ohMyPiIcon,
  "cherry-studio": cherryStudioIcon,
  doubao: doubaoIcon,
  codebuddy: {
    light: codebuddyLightIcon,
    dark: codebuddyDarkIcon,
  },
  hermes: hermesIcon,
};

// Fallback Lucide icons for platforms without a bundled brand asset
// 没有内置品牌资源时的 Lucide 图标 fallback
const FALLBACK_ICONS: Record<string, React.ReactNode> = {
  claude: <SparklesIcon />,
  "deepseek-harness": <BotIcon />,
  cursor: <TerminalIcon />,
  copilot: <GithubIcon />,
  windsurf: <WindIcon />,
  kiro: <SparkleIcon />,
  gemini: <SparklesIcon />,
  antigravity: <SparklesIcon />,
  "antigravity-cli": <SparklesIcon />,
  trae: <ZapIcon />,
  "trae-work": <ZapIcon />,
  "trae-cn": <ZapIcon />,
  "trae-work-cn": <ZapIcon />,
  opencode: <TerminalIcon />,
  pi: <PiIcon />,
  "oh-my-pi": <TerminalIcon />,
  cline: <TerminalIcon />,
  codex: <TerminalIcon />,
  chatgpt: <BotIcon />,
  grok: <TerminalIcon />,
  kilo: <BotIcon />,
  amp: <ZapIcon />,
  openclaw: <BugIcon />,
  copaw: <BotIcon />,
  autoclaw: <BotIcon />,
  nanoclaw: <BotIcon />,
  qclaw: <BugIcon />,
  qoder: <BotIcon />,
  qoderwork: <BotIcon />,
  qwen: <BotIcon />,
  "qwen-work": <BriefcaseBusinessIcon />,
  kimi: <CommandIcon />,
  reasonix: <CodeIcon />,
  augment: <BracesIcon />,
  workbuddy: <BotIcon />,
  codebuddy: <BotIcon />,
  hermes: <BotIcon />,
  "cherry-studio": <BotIcon />,
  "roo-code": <BotIcon />,
};

interface PlatformIconProps extends HTMLAttributes<HTMLSpanElement> {
  platformId: string;
  size?: number;
  className?: string;
}

/**
 * Platform icon component with bundled brand assets and Lucide fallback
 * 平台图标组件，支持内置品牌资源和 Lucide 图标 fallback
 */
export function PlatformIcon({
  platformId,
  size = 24,
  className = "",
  style,
  ...spanProps
}: PlatformIconProps) {
  const [imageError, setImageError] = useState(false);

  const iconSrc = PLATFORM_ICONS[platformId];
  const fallbackIcon = FALLBACK_ICONS[platformId] || <LayoutGridIcon />;

  // If no bundled asset or image failed to load, use fallback
  // 如果没有内置资源或图片加载失败，使用 fallback
  if (!iconSrc || imageError) {
    return (
      <span
        {...spanProps}
        className={`inline-flex items-center justify-center ${className}`}
        style={{ ...style, width: size, height: size }}
      >
        {/* Clone the icon element with proper size */}
        <span
          style={{ width: size, height: size }}
          className="flex items-center justify-center"
        >
          {fallbackIcon}
        </span>
      </span>
    );
  }

  return (
    <span
      {...spanProps}
      className={`inline-flex items-center justify-center ${className} ${
        platformId === "copilot"
          ? "rounded-xl bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800/80 dark:ring-slate-700"
          : ""
      }`}
      style={{ ...style, width: size, height: size }}
    >
      {typeof iconSrc === "string" ? (
        <img
          src={iconSrc}
          alt={`${platformId} icon`}
          width={size}
          height={size}
          className={`object-contain ${
            platformId === "copilot"
              ? "brightness-0 dark:brightness-0 dark:invert"
              : platformId === "augment"
                ? "brightness-0 dark:invert"
                : platformId === "oh-my-pi"
                  ? "rounded bg-[#0d0d0d] p-0.5"
                  : platformId === "hermes"
                    ? "rounded-full bg-white"
                    : ""
          }`}
          onError={() => setImageError(true)}
          loading="lazy"
        />
      ) : (
        <>
          <img
            src={iconSrc.light}
            alt={`${platformId} icon`}
            width={size}
            height={size}
            className="object-contain dark:hidden"
            onError={() => setImageError(true)}
            loading="lazy"
          />
          <img
            src={iconSrc.dark}
            alt={`${platformId} icon`}
            width={size}
            height={size}
            className="hidden object-contain dark:block"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        </>
      )}
    </span>
  );
}

/**
 * Get platform icon as React element (for use in platform config)
 * 获取平台图标作为 React 元素（用于平台配置）
 */
export function getPlatformIconElement(
  platformId: string,
  size: number = 16,
): React.ReactNode {
  return <PlatformIcon platformId={platformId} size={size} />;
}
