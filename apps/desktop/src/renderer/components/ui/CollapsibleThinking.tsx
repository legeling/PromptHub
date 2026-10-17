import React, { useState, useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronRightIcon, BrainIcon } from "lucide-react";
import { Spinner } from "./Spinner";

interface CollapsibleThinkingProps {
  content: string | null;
  isLoading?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * Collapsible thinking process component for AI reasoning display
 * 可折叠的思考过程组件，用于显示 AI 推理过程
 */
export function CollapsibleThinking({
  content,
  isLoading = false,
  defaultExpanded = false,
  className = "",
}: CollapsibleThinkingProps): JSX.Element | null {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevContentLength = useRef(0);
  const contentId = useId();

  // Auto-scroll to bottom when content updates during streaming / 流式输出时自动滚动到底部
  useEffect(() => {
    if (
      isExpanded &&
      contentRef.current &&
      content &&
      content.length > prevContentLength.current
    ) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
    prevContentLength.current = content?.length || 0;
  }, [content, isExpanded]);

  // Auto-expand when streaming starts / 开始流式输出时自动展开
  useEffect(() => {
    if (isLoading && content) {
      setIsExpanded(true);
    }
  }, [isLoading, content]);

  if (!content?.trim()) {
    if (!isLoading) return null;
    return (
      <div
        role="status"
        className={`flex items-center gap-2 py-2 text-sm text-muted-foreground ${className}`}
      >
        <Spinner aria-hidden="true" size="sm" tone="primary" />
        <span>{t("prompt.generating")}</span>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden ${className}`}>
      {/* Header / 头部 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="w-full flex items-center gap-2 rounded-md py-2 text-left hover:text-foreground transition-colors group"
      >
        {/* Expand/Collapse Icon / 展开/折叠图标 */}
        <span className="text-muted-foreground transition-transform duration-base">
          {isExpanded ? (
            <ChevronDownIcon aria-hidden="true" className="w-4 h-4" />
          ) : (
            <ChevronRightIcon aria-hidden="true" className="w-4 h-4" />
          )}
        </span>

        {isLoading ? (
          <Spinner aria-hidden="true" size="sm" tone="primary" />
        ) : (
          <BrainIcon
            aria-hidden="true"
            className="h-4 w-4 text-muted-foreground"
          />
        )}
        <span className="text-sm font-medium text-muted-foreground">
          {t("settings.thinkingContent")}
        </span>
        {/* Character count / 字符数 */}
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          {content.length} {t("common.chars")}
        </span>
      </button>

      {/* Content / 内容 */}
      <div
        id={contentId}
        aria-hidden={!isExpanded}
        className={`overflow-hidden transition-all duration-smooth ease-in-out ${
          isExpanded ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div
          ref={contentRef}
          className="ml-6 border-l border-border pl-4 pb-2 max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent"
        >
          <div className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CollapsibleThinking;
