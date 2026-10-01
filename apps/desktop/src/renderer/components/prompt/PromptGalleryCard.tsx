import { memo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Prompt } from "@prompthub/shared/types";
import {
  CheckIcon,
  ImageIcon,
  FolderIcon,
  PlayIcon,
  StarIcon,
  VideoIcon,
} from "lucide-react";
import { resolveLocalImageSrc, resolveLocalVideoSrc } from "../../utils/media-url";

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(
  text: string,
  terms: string[],
  highlightClassName: string,
) {
  if (!text || terms.length === 0) return text;

  const pattern = terms.map(escapeRegExp).join("|");
  if (!pattern) return text;

  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);

  if (parts.length <= 1) return text;

  return parts.map((part, idx) => {
    if (!part) return null;
    if (idx % 2 === 1) {
      return (
        <span key={idx} className={highlightClassName}>
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export interface GalleryCardProps {
  prompt: Prompt;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  folderName?: string;
  highlightTerms: string[];
  videoLabel: string;
  titleClassName: string;
  /** Batch selection mode (v0.6.2). When false the card renders as before. */
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (e: React.MouseEvent) => void;
}

export const GalleryCard = memo(function GalleryCard({
  prompt,
  onSelect,
  onToggleFavorite,
  folderName,
  highlightTerms,
  videoLabel,
  titleClassName,
  selectable,
  selected,
  onToggleSelect,
}: GalleryCardProps) {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const highlightClassName = "bg-primary/15 text-primary rounded px-0.5";
  const favoriteLabel = prompt.isFavorite
    ? t("prompt.removeFromFavorites", "Remove from Favorites")
    : t("prompt.addToFavorites", "Add to Favorites");
  const selectLabel = t("prompt.selectPromptRow", {
    title: prompt.title,
    defaultValue: "Select {{title}}",
  });
  const selectCheckboxLabel = selected
    ? t("prompt.deselectPromptRow", {
        title: prompt.title,
        defaultValue: "Deselect {{title}}",
      })
    : selectLabel;

  // Determine media source: prioritize image, then video
  // 确定媒体源：优先图片，其次视频
  const hasImage = prompt.images && prompt.images.length > 0 && !imageError;
  const hasVideo = prompt.videos && prompt.videos.length > 0 && !videoError;
  const imageSrc = hasImage ? resolveLocalImageSrc(prompt.images![0]) : null;
  const videoSrc = hasVideo ? resolveLocalVideoSrc(prompt.videos![0]) : null;
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelect();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={prompt.title}
      aria-pressed={selectable ? selected : undefined}
      className={`group relative flex flex-col app-wallpaper-panel rounded-xl overflow-hidden border transition-all duration-smooth hover:shadow-lg hover:-translate-y-1 cursor-pointer h-full ${
        selected
          ? "border-primary ring-2 ring-primary/40"
          : "border-border"
      }`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      {/* Image / Video / Placeholder Area */}
      {/* 图片 / 视频 / 占位区域 */}
      <div className="aspect-[4/3] w-full bg-muted/30 relative overflow-hidden">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={prompt.title}
            className="w-full h-full object-cover transition-transform duration-slow group-hover:scale-110"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : videoSrc ? (
          <>
            <video
              src={videoSrc}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
              onError={() => setVideoError(true)}
            />
            {/* Play button overlay / 播放按钮覆盖层 */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <PlayIcon
                  aria-hidden="true"
                  className="w-6 h-6 text-primary fill-current ml-1"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30">
            <ImageIcon aria-hidden="true" className="w-12 h-12 mb-2 opacity-50" />
          </div>
        )}

        {/* Video indicator badge (when has both image and video) */}
        {/* 视频指示器徽章（当同时有图片和视频时） */}
        {hasImage && hasVideo && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-white text-xs">
            <VideoIcon aria-hidden="true" className="w-3 h-3" />
            <span>{videoLabel}</span>
          </div>
        )}

        {/* Batch selection checkbox / 批量选择复选框 */}
        {selectable && (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={selectCheckboxLabel}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(e);
            }}
            className={`absolute top-2 left-2 z-10 w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center transition-all ${
              selected
                ? "bg-primary border-primary text-white opacity-100"
                : "border-white/80 bg-black/25 text-transparent opacity-0 group-hover:opacity-100 hover:border-primary/70"
            }`}
          >
            <CheckIcon aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Helper Actions Overlay / 快捷操作浮层 */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-base">
          <button
            type="button"
            onClick={onToggleFavorite}
            className={`p-1.5 rounded-full backdrop-blur-md bg-black/20 hover:bg-black/40 transition-colors ${
              prompt.isFavorite ? "text-yellow-400" : "text-white"
            }`}
            title={favoriteLabel}
            aria-label={favoriteLabel}
          >
            <StarIcon
              aria-hidden="true"
              className={`w-4 h-4 ${prompt.isFavorite ? "fill-current" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Content Area / 内容区域 */}
      <div className="flex-1 p-3 flex flex-col gap-2">
        <h3 className={titleClassName} title={prompt.title}>
          {renderHighlightedText(prompt.title, highlightTerms, highlightClassName)}
        </h3>

        {/* Tags / 标签 */}
        <div className="flex flex-wrap gap-1 h-5 overflow-hidden">
          {prompt.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground truncate"
            >
              #{tag}
            </span>
          ))}
          {prompt.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{prompt.tags.length - 3}
            </span>
          )}
        </div>

        {/* Footer: Folder & Date / 底部：文件夹与日期 */}
        <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/50">
          <div className="flex items-center gap-1 truncate max-w-[70%]">
            <FolderIcon aria-hidden="true" className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{folderName || "Uncategorized"}</span>
          </div>
          <span>{new Date(prompt.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
});
GalleryCard.displayName = "GalleryCard";
