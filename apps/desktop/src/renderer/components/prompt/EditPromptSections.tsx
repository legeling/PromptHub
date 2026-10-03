import type {
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  ReactNode,
} from "react";
import type { TFunction } from "i18next";
import type { Folder } from "@prompthub/shared/types";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  HashIcon,
  Maximize2Icon,
  XIcon,
} from "lucide-react";

import { Button, Textarea, CollapsibleSection } from "../ui";
import { PromptSourceNotesFields } from "./PromptSourceNotesFields";
import { Select } from "../ui/Select";
import { renderFolderIcon } from "../layout/folderIconHelper";

interface EditPromptMoreSettingsProps {
  existingTags: string[];
  folderId?: string;
  folders: Folder[];
  mediaCount: number;
  notes: string;
  onAddTag: () => void;
  onNotesChange: (value: string) => void;
  onRemoveTag: (tag: string) => void;
  onSourceBlur: FocusEventHandler<HTMLInputElement>;
  onSourceFocus: FocusEventHandler<HTMLInputElement>;
  onTagKeyDown: KeyboardEventHandler<HTMLInputElement>;
  promptType: "text" | "image" | "video";
  referenceMedia: ReactNode;
  setFolderId: (value?: string) => void;
  setShowAttributes: (value: boolean) => void;
  setShowSourceSuggestions: (value: boolean) => void;
  setSource: (value: string) => void;
  setTagInput: (value: string) => void;
  setTags: (tags: string[]) => void;
  showAttributes: boolean;
  showSourceSuggestions: boolean;
  source: string;
  sourceHistory: string[];
  t: TFunction;
  tagInput: string;
  tags: string[];
}

export function EditPromptMoreSettings({
  existingTags,
  folderId,
  folders,
  mediaCount,
  notes,
  onAddTag,
  onNotesChange,
  onRemoveTag,
  onSourceBlur,
  onSourceFocus,
  onTagKeyDown,
  promptType,
  referenceMedia,
  setFolderId,
  setShowAttributes,
  setShowSourceSuggestions,
  setSource,
  setTagInput,
  setTags,
  showAttributes,
  showSourceSuggestions,
  source,
  sourceHistory,
  t,
  tagInput,
  tags,
}: EditPromptMoreSettingsProps) {
  const summary = [
    folders.find((folder) => folder.id === folderId)?.name,
    tags.length > 0 ? `${tags.length} ${t("prompt.tags", "tags")}` : null,
    promptType !== "image" && mediaCount > 0
      ? `${mediaCount} ${t("prompt.media", "media")}`
      : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="border border-border/50 rounded-xl bg-muted/20 overflow-hidden">
      <button
        type="button"
        aria-expanded={showAttributes}
        onClick={() => setShowAttributes(!showAttributes)}
        className="flex items-center gap-2 px-4 py-3 w-full text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        {showAttributes ? (
          <ChevronDownIcon
            className="w-4 h-4 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ChevronRightIcon
            className="w-4 h-4 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <span>{t("prompt.moreSettings", "More Settings")}</span>
        {!showAttributes && summary && (
          <span className="text-xs text-muted-foreground ml-2 font-normal truncate max-w-[400px]">
            {summary}
          </span>
        )}
      </button>

      {showAttributes && (
        <div className="px-4 pb-4 space-y-4 animate-in fade-in slide-in-from-top-1">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              {t("prompt.folderOptional")}
            </label>
            <Select
              value={folderId || ""}
              onChange={(value) => setFolderId(value || undefined)}
              placeholder={t("prompt.noFolder")}
              options={[
                { value: "", label: t("prompt.noFolder") },
                ...folders.map((folder) => ({
                  value: folder.id,
                  label: (
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 flex items-center justify-center w-4 h-4 text-muted-foreground">
                        {renderFolderIcon(folder.icon)}
                      </span>
                      <span className="truncate">{folder.name}</span>
                    </div>
                  ),
                })),
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              {t("prompt.tagsOptional")}
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-white"
                >
                  <HashIcon className="w-3 h-3" aria-hidden="true" />
                  {tag}
                  <button
                    type="button"
                    aria-label={t("prompt.removeTag", { tag })}
                    onClick={() => onRemoveTag(tag)}
                    className="ml-1 hover:text-white/70"
                  >
                    <XIcon className="w-3 h-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            {existingTags.length > 0 && (
              <div className="mb-2">
                <div className="text-xs text-muted-foreground mb-1.5">
                  {t("prompt.selectExistingTags")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {existingTags
                    .filter((tag) => !tags.includes(tag))
                    .map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setTags([...tags, tag])}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted hover:bg-accent transition-colors"
                      >
                        <HashIcon className="w-3 h-3" aria-hidden="true" />
                        {tag}
                      </button>
                    ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={t("prompt.enterTagHint")}
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={onTagKeyDown}
                className="flex-1 h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-base"
              />
              <Button variant="secondary" size="md" onClick={onAddTag}>
                {t("prompt.addTag")}
              </Button>
            </div>
          </div>

          <CollapsibleSection title={t("prompt.supplementaryInfo")}>
            <PromptSourceNotesFields
              source={source}
              setSource={setSource}
              notes={notes}
              setNotes={onNotesChange}
              handleSourceFocus={onSourceFocus}
              handleSourceBlur={onSourceBlur}
              showSourceSuggestions={showSourceSuggestions}
              setShowSourceSuggestions={setShowSourceSuggestions}
              sourceHistory={sourceHistory}
            />
          </CollapsibleSection>

          {promptType !== "image" && referenceMedia}
        </div>
      )}
    </div>
  );
}

interface PromptEditorFieldProps {
  englishId: string;
  englishLabel: string;
  englishPlaceholder: string;
  englishValue: string;
  id: string;
  label: string;
  minHeight: 200 | 280;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
  onEnglishChange: ChangeEventHandler<HTMLTextAreaElement>;
  onEnglishFullscreen: () => void;
  onFullscreen: () => void;
  placeholder: string;
  renderPreview: (content: string) => ReactNode;
  required?: boolean;
  showEnglishVersion: boolean;
  t: TFunction;
  value: string;
}

export function PromptEditorField({
  englishId,
  englishLabel,
  englishPlaceholder,
  englishValue,
  id,
  label,
  minHeight,
  onChange,
  onEnglishChange,
  onEnglishFullscreen,
  onFullscreen,
  placeholder,
  renderPreview,
  required,
  showEnglishVersion,
  t,
  value,
}: PromptEditorFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-foreground"
        >
          {label}
          {required && <span className="ml-2 text-xs text-destructive">*</span>}
        </label>
        <button
          type="button"
          aria-label={t("prompt.fullscreen", "Fullscreen Edit")}
          onClick={onFullscreen}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
          title={t("prompt.fullscreen", "全屏编辑")}
        >
          <Maximize2Icon className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <div
        className="flex rounded-xl border border-border overflow-hidden"
        style={{ minHeight }}
      >
        <div className="w-1/2 border-r border-border flex flex-col">
          <Textarea
            id={id}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            className="flex-1 rounded-none border-0"
            style={{ minHeight }}
            enableMarkdownList
          />
        </div>
        <div className="w-1/2 flex flex-col bg-muted/30">
          <div className="px-3 py-1.5 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground shrink-0">
            {t("prompt.preview", "预览")}
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="prose prose-sm max-w-none markdown-content">
              {value ? (
                renderPreview(value)
              ) : (
                <div className="text-muted-foreground text-sm italic">
                  {t("prompt.noContent", "暂无内容")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {showEnglishVersion && (
        <div className="mt-2 pl-4 border-l-2 border-primary/20 space-y-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor={englishId}
              className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"
            >
              <span className="bg-primary/10 text-primary px-1 rounded text-[10px]">
                EN
              </span>
              {englishLabel}
            </label>
            <button
              type="button"
              aria-label={t("prompt.fullscreen")}
              onClick={onEnglishFullscreen}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={t("prompt.fullscreen")}
            >
              <Maximize2Icon className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
          <Textarea
            id={englishId}
            placeholder={englishPlaceholder}
            value={englishValue}
            onChange={onEnglishChange}
            className={minHeight === 280 ? "min-h-[120px]" : "min-h-[80px]"}
            enableMarkdownList
          />
        </div>
      )}
    </div>
  );
}
