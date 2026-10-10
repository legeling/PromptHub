import { memo } from "react";
import type { MouseEvent } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CornerDownRightIcon,
  GitBranchIcon,
  GripVerticalIcon,
  ImageIcon,
  PinIcon,
  StarIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PromptSummary } from "@prompthub/shared/types";
import type { PromptCardProps } from "./prompt-list-types";
import { renderHighlightedText } from "./prompt-list-highlight";
import { Checkbox } from "../ui/Checkbox";

const PROMPT_CARD_TREE_INDENT_PX = 16;

function getHierarchyTone(isSelected: boolean) {
  return isSelected
    ? "text-white/75 border-white/20 bg-white/10"
    : "text-muted-foreground border-border/70 bg-muted/40";
}

function getCardClassName({
  depth,
  isDragging,
  isDropTarget,
  isSelected,
  dropPosition,
}: Pick<
  PromptCardProps,
  "depth" | "isDragging" | "isDropTarget" | "isSelected" | "dropPosition"
>) {
  const surface = isSelected
    ? "bg-primary text-white"
    : isDropTarget && dropPosition === "inside"
      ? "prompt-list-card bg-primary/10"
      : depth > 0
        ? "prompt-list-card border-l-2 border-l-primary/30 bg-primary/[0.045] hover:bg-primary/[0.075]"
        : "prompt-list-card bg-card hover:bg-accent";
  const dropClass =
    isDropTarget && dropPosition
      ? dropPosition === "inside"
        ? "ring-2 ring-primary/40 ring-inset"
        : dropPosition === "before"
          ? "border-t-2 border-t-primary"
          : "border-b-2 border-b-primary"
      : "";
  return `w-full text-left px-3 py-2.5 rounded-lg cursor-pointer relative transition-colors duration-base outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${surface} ${isDragging ? "opacity-50" : ""} ${dropClass}`;
}

function PromptCardStatus({
  prompt,
  childCount,
  isCollapsed,
  isSelected,
  isDropTarget,
  dropPosition,
  onToggleCollapse,
}: Pick<
  PromptCardProps,
  | "prompt"
  | "childCount"
  | "isCollapsed"
  | "isSelected"
  | "isDropTarget"
  | "dropPosition"
  | "onToggleCollapse"
>) {
  const { t } = useTranslation();
  const hierarchyTone = getHierarchyTone(isSelected);
  const label = t(
    isCollapsed ? "prompt.expandPrompt" : "prompt.collapsePrompt",
    {
      title: prompt.title,
    },
  );
  const childCountLabel = t("prompt.childPromptCountShort", {
    count: childCount,
  });
  return (
    <div className="flex flex-shrink-0 items-center gap-1">
      {isDropTarget && dropPosition ? (
        <PromptDropBadge tone={hierarchyTone} position={dropPosition} />
      ) : null}
      {childCount > 0 ? (
        <PromptCollapseButton
          isCollapsed={isCollapsed}
          label={label}
          childCountLabel={childCountLabel}
          onToggle={onToggleCollapse}
          tone={hierarchyTone}
          isSelected={isSelected}
        />
      ) : null}
      <PromptCardIndicators prompt={prompt} isSelected={isSelected} />
    </div>
  );
}

function PromptCardIndicators({
  prompt,
  isSelected,
}: Pick<PromptCardProps, "prompt" | "isSelected">) {
  return (
    <>
      {prompt.isPinned ? (
        <PinIcon
          aria-hidden="true"
          className={`w-3.5 h-3.5 ${isSelected ? "text-white" : "text-primary"}`}
        />
      ) : null}
      {prompt.promptType === "image" ? (
        <ImageIcon
          aria-hidden="true"
          className={`w-3.5 h-3.5 ${isSelected ? "text-white/70" : "text-blue-500"}`}
        />
      ) : null}
      {prompt.isFavorite ? (
        <StarIcon
          aria-hidden="true"
          className={`w-3.5 h-3.5 ${isSelected ? "fill-white text-white" : "fill-yellow-400 text-yellow-400"}`}
        />
      ) : null}
    </>
  );
}

function PromptDropBadge({
  tone,
  position,
}: {
  tone: string;
  position: "before" | "after" | "inside";
}) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 ${tone}`}
    >
      {position === "inside" ? (
        <CornerDownRightIcon aria-hidden="true" className="h-3 w-3" />
      ) : (
        <GitBranchIcon aria-hidden="true" className="h-3 w-3" />
      )}
    </span>
  );
}

function PromptCollapseButton({
  childCountLabel,
  isCollapsed,
  isSelected,
  label,
  onToggle,
  tone,
}: {
  childCountLabel: string;
  isCollapsed: boolean;
  isSelected: boolean;
  label: string;
  onToggle: () => void;
  tone: string;
}) {
  return (
    <button
      type="button"
      data-testid="prompt-card-collapse-toggle"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-none transition-colors ${tone} ${isSelected ? "hover:bg-white/15" : "hover:bg-accent hover:text-foreground"}`}
    >
      {isCollapsed ? (
        <ChevronRightIcon aria-hidden="true" className="h-3 w-3" />
      ) : (
        <ChevronDownIcon aria-hidden="true" className="h-3 w-3" />
      )}
      <GitBranchIcon aria-hidden="true" className="h-3 w-3" />
      {childCountLabel}
    </button>
  );
}

function PromptCardTitle({
  prompt,
  depth,
  highlightClassName,
  highlightTerms,
  isSelected,
}: {
  prompt: PromptSummary;
  depth: number;
  highlightClassName: string;
  highlightTerms: string[];
  isSelected: boolean;
}) {
  const depthIndent =
    Math.min(Math.max(depth, 0), 5) * PROMPT_CARD_TREE_INDENT_PX;
  return (
    <div
      data-testid="prompt-card-title-row"
      className="flex min-w-0 flex-1 items-center gap-1"
      style={{ paddingLeft: `${depthIndent}px` }}
    >
      <GripVerticalIcon
        aria-hidden="true"
        className={`h-3.5 w-3.5 shrink-0 cursor-grab ${isSelected ? "text-white/65" : "text-muted-foreground/55"}`}
      />
      <h3
        data-testid="prompt-card-title"
        className="min-w-0 flex-1 break-words text-sm font-medium leading-snug line-clamp-2"
        title={prompt.title}
      >
        {renderHighlightedText(
          prompt.title,
          highlightTerms,
          highlightClassName,
        )}
      </h3>
    </div>
  );
}

function PromptCardSupplement({
  prompt,
  depth,
  parentTitle,
  isSelected,
  highlightTerms,
  highlightClassName,
}: Pick<
  PromptCardProps,
  "prompt" | "depth" | "parentTitle" | "isSelected" | "highlightTerms"
> & { highlightClassName: string }) {
  const { t } = useTranslation();
  const tone = getHierarchyTone(isSelected);
  const parentChipIndent =
    Math.min(Math.max(depth, 0), 5) * PROMPT_CARD_TREE_INDENT_PX + 18;
  return (
    <>
      {parentTitle ? (
        <div
          data-testid="prompt-card-parent-chip"
          className={`mt-1 inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-none ${tone}`}
          style={{ marginLeft: `${parentChipIndent}px` }}
        >
          <CornerDownRightIcon
            aria-hidden="true"
            className="h-3 w-3 shrink-0"
          />
          <span className="shrink-0">{t("prompt.parentPrompt")}</span>
          <span className="truncate">{parentTitle}</span>
        </div>
      ) : null}
      {prompt.description ? (
        <p
          className={`text-xs line-clamp-2 break-words mt-0.5 ${isSelected ? "text-white/70" : "text-muted-foreground"}`}
        >
          {renderHighlightedText(
            prompt.description,
            highlightTerms,
            highlightClassName,
          )}
        </p>
      ) : null}
    </>
  );
}

function selectWithKeyboard(
  event: React.KeyboardEvent,
  onSelect: (event: MouseEvent) => void,
) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelect(event as unknown as MouseEvent);
}

function PromptCardBatchCheckbox({
  prompt,
  isBatchSelected = false,
  onToggleBatchSelection,
}: Pick<PromptCardProps, "prompt" | "isBatchSelected" | "onToggleBatchSelection">) {
  const { t } = useTranslation();
  if (!onToggleBatchSelection) return null;
  return (
    <span
      className="shrink-0 pt-0.5"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Checkbox
        checked={isBatchSelected}
        onChange={onToggleBatchSelection}
        ariaLabel={t(
          isBatchSelected ? "prompt.deselectPromptRow" : "prompt.selectPromptRow",
          { title: prompt.title },
        )}
      />
    </span>
  );
}

export const PromptCard = memo(function PromptCard(props: PromptCardProps) {
  const highlightClassName = props.isSelected
    ? "bg-white/20 text-white rounded px-0.5"
    : "bg-primary/15 text-primary rounded px-0.5";
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      aria-pressed={props.isSelected}
      aria-label={props.prompt.title}
      onClick={props.onSelect}
      onDoubleClick={props.onDoubleClick}
      onKeyDown={(event) => selectWithKeyboard(event, props.onSelect)}
      onContextMenu={props.onContextMenu}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      onDragOver={props.onDragOver}
      onDragEnter={props.onDragEnter}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      className={getCardClassName(props)}
    >
      <div className="flex items-start gap-2">
        <PromptCardBatchCheckbox {...props} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <PromptCardTitle
              prompt={props.prompt}
              depth={props.depth}
              highlightTerms={props.highlightTerms}
              highlightClassName={highlightClassName}
              isSelected={props.isSelected}
            />
            <PromptCardStatus {...props} />
          </div>
          <PromptCardSupplement
            {...props}
            highlightClassName={highlightClassName}
          />
        </div>
      </div>
    </div>
  );
});
