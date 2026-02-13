import { useState } from 'react';
import { SparklesIcon, TerminalIcon, GithubIcon, WindIcon, SparkleIcon, ZapIcon, BotIcon, LayoutGridIcon, BugIcon } from 'lucide-react';

// Import platform icons
// 导入平台图标
import claudeIcon from '../../assets/platforms/claude.png';
import cursorIcon from '../../assets/platforms/cursor.png';
import copilotIcon from '../../assets/platforms/copilot.png';
import windsurfIcon from '../../assets/platforms/windsurf.png';
import kiroIcon from '../../assets/platforms/kiro.png';
import geminiIcon from '../../assets/platforms/gemini.png';
import traeIcon from '../../assets/platforms/trae.png';
import opencodeIcon from '../../assets/platforms/opencode.png';
import codexIcon from '../../assets/platforms/codex.png';
import rooIcon from '../../assets/platforms/roo.png';
import ampIcon from '../../assets/platforms/amp.png';
import openclawIcon from '../../assets/platforms/openclaw.png';

// Platform icon mapping
// 平台图标映射
const PLATFORM_ICONS: Record<string, string> = {
  claude: claudeIcon,
  cursor: cursorIcon,
  copilot: copilotIcon,
  windsurf: windsurfIcon,
  kiro: kiroIcon,
  gemini: geminiIcon,
  trae: traeIcon,
  opencode: opencodeIcon,
  codex: codexIcon,
  roo: rooIcon,
  amp: ampIcon,
  openclaw: openclawIcon,
};

// Fallback Lucide icons for platforms without PNG
// 没有 PNG 图标时的 Lucide 图标 fallback
const FALLBACK_ICONS: Record<string, React.ReactNode> = {
  claude: <SparklesIcon />,
  cursor: <TerminalIcon />,
  copilot: <GithubIcon />,
  windsurf: <WindIcon />,
  kiro: <SparkleIcon />,
  gemini: <SparklesIcon />,
  trae: <ZapIcon />,
  opencode: <TerminalIcon />,
  codex: <TerminalIcon />,
  roo: <BotIcon />,
  amp: <ZapIcon />,
  openclaw: <BugIcon />,
};

interface PlatformIconProps {
  platformId: string;
  size?: number;
  className?: string;
}

/**
 * Platform icon component with PNG icons and Lucide fallback
 * 平台图标组件，支持 PNG 图标和 Lucide 图标 fallback
 */
export function PlatformIcon({ platformId, size = 24, className = '' }: PlatformIconProps) {
  const [imageError, setImageError] = useState(false);
  
  const iconSrc = PLATFORM_ICONS[platformId];
  const fallbackIcon = FALLBACK_ICONS[platformId] || <LayoutGridIcon />;
  
  // If no PNG icon or image failed to load, use fallback
  // 如果没有 PNG 图标或图片加载失败，使用 fallback
  if (!iconSrc || imageError) {
    return (
      <span 
        className={`inline-flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        {/* Clone the icon element with proper size */}
        <span style={{ width: size, height: size }} className="flex items-center justify-center">
          {fallbackIcon}
        </span>
      </span>
    );
  }
  
  return (
    <img
      src={iconSrc}
      alt={`${platformId} icon`}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      onError={() => setImageError(true)}
      loading="lazy"
    />
  );
}

/**
 * Get platform icon as React element (for use in platform config)
 * 获取平台图标作为 React 元素（用于平台配置）
 */
export function getPlatformIconElement(platformId: string, size: number = 16): React.ReactNode {
  return <PlatformIcon platformId={platformId} size={size} />;
}
