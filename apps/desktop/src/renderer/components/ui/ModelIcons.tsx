import React from "react";
import {
  CircleDotDashedIcon,
  CloudIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// AI model provider icon component
// Prioritize using local provider brand icons, fallback to first letter circle when no matching icon

import openaiSvg from "../../assets/providers/openai.svg";
import anthropicSvg from "../../assets/providers/anthropic.svg";
import azureAiSvg from "../../assets/providers/azureai.svg";
import geminiSvg from "../../assets/providers/gemini.svg";
import deepseekSvg from "../../assets/providers/deepseek.svg";
import qwenSvg from "../../assets/providers/qwen.svg";
import doubaoSvg from "../../assets/providers/doubao.svg";
import zhipuSvg from "../../assets/providers/zhipu.svg";
import moonshotSvg from "../../assets/providers/moonshot.svg";
import mistralSvg from "../../assets/providers/mistral.svg";
import zeroOneSvg from "../../assets/providers/zero-one.svg";
import tencentCloudTiSvg from "../../assets/providers/tencent-cloud-ti.svg";
import newApiSvg from "../../assets/providers/newapi.svg";
import ollamaSvg from "../../assets/providers/ollama.svg";
import grokSvg from "../../assets/providers/grok.svg";

// Map category names to local provider icon resources
// 按模型分类名称映射到本地 provider 图标资源
const CATEGORY_ICON_SRC: Record<string, string> = {
  GPT: openaiSvg,
  "Azure OpenAI": azureAiSvg,
  Claude: anthropicSvg,
  Gemini: geminiSvg,
  DeepSeek: deepseekSvg,
  Qwen: qwenSvg,
  Doubao: doubaoSvg,
  GLM: zhipuSvg,
  Moonshot: moonshotSvg,
  Mistral: mistralSvg,
  Yi: zeroOneSvg,
  Spark: tencentCloudTiSvg,
  Hunyuan: tencentCloudTiSvg, // Map Hunyuan to Tencent icon
  "New API": newApiSvg,
  Llama: ollamaSvg,
  Grok: grokSvg,
  ERNIE: "", // Placeholder for ERNIE
};

const SPECIAL_CATEGORY_ICON: Record<
  string,
  { Icon: LucideIcon; iconName: string }
> = {
  "Atlas Cloud": { Icon: CloudIcon, iconName: "CloudIcon" },
  Custom: { Icon: SlidersHorizontalIcon, iconName: "SlidersHorizontalIcon" },
  Other: { Icon: CircleDotDashedIcon, iconName: "CircleDotDashedIcon" },
};

const SPECIAL_CATEGORY_ICON_CLASS: Record<string, string> = {
  "Atlas Cloud":
    "border border-cyan-700/20 bg-gradient-to-br from-cyan-50 to-blue-100 text-cyan-700 dark:border-cyan-300/25 dark:from-cyan-950/80 dark:to-blue-950/70 dark:text-cyan-200",
};

const SPECIAL_CATEGORY_ICON_STYLE: Record<
  string,
  { background: string; color: string; border: string }
> = {
  Custom: {
    background: "linear-gradient(135deg, #eef2ff 0%, #dbeafe 100%)",
    color: "#2563eb",
    border: "1px solid rgba(37,99,235,0.18)",
  },
  Other: {
    background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
    color: "#475569",
    border: "1px solid rgba(71,85,105,0.18)",
  },
};

export function hasDedicatedCategoryIcon(category: string): boolean {
  return Boolean(
    CATEGORY_ICON_SRC[category] || SPECIAL_CATEGORY_ICON[category],
  );
}

function renderSpecialCategoryIcon(
  category: string,
  size: number,
): React.ReactNode {
  const iconConfig = SPECIAL_CATEGORY_ICON[category];
  if (!iconConfig) {
    return null;
  }

  const className = SPECIAL_CATEGORY_ICON_CLASS[category];
  const IconComponent = iconConfig.Icon;
  const style =
    SPECIAL_CATEGORY_ICON_STYLE[category] ?? SPECIAL_CATEGORY_ICON_STYLE.Other;
  return (
    <div
      data-category-icon={category}
      data-category-icon-name={iconConfig.iconName}
      className={
        className
          ? `flex shrink-0 items-center justify-center rounded-md shadow-sm ${className}`
          : undefined
      }
      style={
        className
          ? {
              width: size,
              height: size,
            }
          : {
              width: size,
              height: size,
              borderRadius: 6,
              background: style.background,
              border: style.border,
              color: style.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
            }
      }
    >
      <IconComponent size={size * 0.68} strokeWidth={2.2} />
    </div>
  );
}

/**
 * Get category icon
 * 获取分类图标
 */
export function getCategoryIcon(category: string, size = 20): React.ReactNode {
  // 0. nanobananai 🍌 special icon
  if (category === "nanobananai 🍌") {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.75,
          background: "linear-gradient(135deg, #fefce8 0%, #fef08a 100%)",
          borderRadius: 6,
          border: "1px solid #fde047",
          lineHeight: 1,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        🍌
      </div>
    );
  }

  // 1. Prioritize using local provider brand icons
  // 优先使用本地 provider 品牌图标
  const src = CATEGORY_ICON_SRC[category];

  if (src) {
    return (
      <img
        src={src}
        alt={category}
        width={size}
        height={size}
        style={{ borderRadius: 6, objectFit: "contain", display: "block" }}
        onError={(e) => {
          // If no matching icon, generate a colored circle with the first letter as fallback
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  const specialIcon = renderSpecialCategoryIcon(category, size);
  if (specialIcon) {
    return specialIcon;
  }

  // 2. Fallback: use first letter of category name when no local icon is found
  const letter = (category && category[0]) || "?";
  const fontSize = size * 0.55;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "999px",
        background:
          "linear-gradient(135deg, rgba(148,163,184,0.9), rgba(148,163,184,0.4))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#0f172a",
        fontSize,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}
