import {
  ClockIcon,
  CornerDownRightIcon,
  GitBranchIcon,
  ImageIcon,
  MessageSquareTextIcon,
} from "lucide-react";
import type { useTranslation } from "react-i18next";
import type { Prompt } from "@prompthub/shared/types";
import { Select, type SelectOption } from "../ui/Select";

interface PromptDetailMetadataProps {
  prompt: Prompt;
  parentPrompt: Prompt | null;
  childPrompts: Prompt[];
  folderOptions: SelectOption[];
  t: ReturnType<typeof useTranslation>["t"];
  onMoveToFolder: (prompt: Prompt, folderId: string | null) => void;
  onSelectPrompt: (promptId: string) => void;
}

const MAX_VISIBLE_CHILDREN = 4;

export function PromptDetailMetadata({
  prompt,
  parentPrompt,
  childPrompts,
  folderOptions,
  t,
  onMoveToFolder,
  onSelectPrompt,
}: PromptDetailMetadataProps) {
  const promptType = prompt.promptType || "text";

  return (
    <>
      {/* Metadata / 元信息 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm ${
            promptType === "image"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
              : promptType === "video"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                : "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
          }`}
        >
          {promptType === "image" ? (
            <ImageIcon className="h-3 w-3" />
          ) : (
            <MessageSquareTextIcon className="h-3 w-3" />
          )}
          {promptType === "image"
            ? t("prompt.typeImage")
            : promptType === "video"
              ? t("prompt.videoLabel")
              : t("prompt.typeText")}
        </span>
        <Select
          ariaLabel={t("prompt.folderOptional")}
          value={prompt.folderId ?? ""}
          options={folderOptions}
          onChange={(folderId) => {
            onMoveToFolder(prompt, folderId || null);
          }}
          className="min-w-[12rem] max-w-[22rem]"
          triggerClassName="flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-full border border-border bg-card px-3 text-left text-xs font-medium text-foreground shadow-sm transition-all duration-quick hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <span className="flex items-center gap-1">
          <ClockIcon className="w-3.5 h-3.5" />
          {new Date(prompt.updatedAt).toLocaleString()}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-accent text-accent-foreground text-xs font-medium">
          v{prompt.version}
        </span>
      </div>

      {(parentPrompt || childPrompts.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 border-l-2 border-primary/40 pl-3 text-xs">
          {parentPrompt && (
            <button
              type="button"
              onClick={() => onSelectPrompt(parentPrompt.id)}
              aria-label={t("prompt.openParentPrompt", {
                title: parentPrompt.title,
              })}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
            >
              <CornerDownRightIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0">{t("prompt.parentPrompt")}</span>
              <span className="max-w-[16rem] truncate text-foreground">
                {parentPrompt.title}
              </span>
            </button>
          )}

          {childPrompts.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <GitBranchIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {t("prompt.childPrompts")}
              </span>
              {childPrompts.slice(0, MAX_VISIBLE_CHILDREN).map((childPrompt) => (
                <button
                  key={childPrompt.id}
                  type="button"
                  onClick={() => onSelectPrompt(childPrompt.id)}
                  aria-label={t("prompt.openChildPrompt", {
                    title: childPrompt.title,
                  })}
                  className="max-w-[12rem] truncate rounded-full border border-border/70 bg-card px-2.5 py-1 text-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {childPrompt.title}
                </button>
              ))}
              {childPrompts.length > MAX_VISIBLE_CHILDREN && (
                <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-muted-foreground">
                  {t("prompt.moreChildPrompts", {
                    count: childPrompts.length - MAX_VISIBLE_CHILDREN,
                  })}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
