import {
  GlobeIcon,
  HashIcon,
  XIcon,
  StickyNoteIcon,
  ImageIcon,
  TagsIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { PromptDetailRow } from "../prompt/PromptDetailRow";
import { LocalImage } from "../ui/LocalImage";
import { resolvePromptMarkdownHref } from "../prompt/prompt-markdown-url";
import { usePromptWorkspaceDetailContext } from "./PromptWorkspaceDetailContext";

function PromptSourceValue({ source }: { source: string }) {
  const href = resolvePromptMarkdownHref(source);
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      <span className="max-w-full break-all">{source}</span>
    </a>
  ) : (
    <span className="text-foreground">{source}</span>
  );
}

function PromptDetailImages() {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  const images = detail.selectedPrompt?.images ?? [];
  if (images.length === 0) return null;
  return (
    <PromptDetailRow
      label={t("prompt.referenceImages")}
      icon={<ImageIcon aria-hidden="true" className="h-3.5 w-3.5" />}
    >
      <div className="flex flex-wrap gap-3">
        {images.map((image, index) => (
          <div
            key={image}
            className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-border bg-card"
          >
            <LocalImage
              src={image}
              alt={`image-${index}`}
              aria-label={t("prompt.previewReferenceImage", {
                index: index + 1,
              })}
              className="h-[86px] w-[86px] object-contain hover:scale-105 transition-transform duration-smooth cursor-pointer"
              fallbackClassName="h-[86px] w-[86px]"
              onClick={() => detail.setPreviewImage(image)}
            />
          </div>
        ))}
      </div>
    </PromptDetailRow>
  );
}

function PromptDetailTag({ tag }: { tag: string }) {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  const filtered = detail.filterTags.includes(tag);
  const removeLabel = `${t("prompt.removeTag", "Remove tag").replace(/\s*\{\{tag\}\}/g, "")}: ${tag}`;
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full text-xs font-medium transition-colors ${filtered ? "bg-primary text-white" : "bg-accent text-accent-foreground"}`}
    >
      <button
        type="button"
        onClick={() => detail.handleTagFilterClick(tag)}
        title={t("prompt.filterByTag", "Filter by tag")}
        className={`inline-flex min-w-0 items-center gap-1 rounded-l-full px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${filtered ? "hover:bg-primary/90" : "hover:bg-primary hover:text-white"}`}
      >
        <HashIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="max-w-[11rem] truncate">{tag}</span>
      </button>
      <button
        type="button"
        onClick={() => void detail.handleDetailRemoveTag(tag)}
        title={removeLabel}
        aria-label={removeLabel}
        className={`inline-flex items-center justify-center rounded-r-full py-1.5 pl-1 pr-2 transition-colors focus-visible:outline-none focus-visible:ring-2 ${filtered ? "text-white/85 hover:bg-primary/90 hover:text-white focus-visible:ring-primary-foreground/30" : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/30"}`}
      >
        <XIcon aria-hidden="true" className="h-3 w-3" />
      </button>
    </span>
  );
}

function PromptDetailTags() {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  const tags = detail.selectedPrompt?.tags ?? [];
  return (
    <PromptDetailRow
      label={t("nav.tags")}
      icon={<TagsIcon aria-hidden="true" className="h-3.5 w-3.5" />}
    >
      <div
        data-testid="prompt-detail-tags-dropzone"
        onDragOver={detail.handleDetailTagDragOver}
        onDrop={detail.handleDetailTagDrop}
        onDragLeave={detail.handleDetailTagDragLeave}
        className={`flex min-h-7 flex-wrap items-center gap-1.5 rounded border pr-1 transition-[background-color,border-color,box-shadow] ${detail.isTagDropActive ? "border-primary/25 bg-primary/6 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]" : "border-transparent"}`}
      >
        {tags.map((tag) => (
          <PromptDetailTag key={tag} tag={tag} />
        ))}
        {tags.length === 0 ? (
          <div className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs text-muted-foreground">
            <HashIcon className="h-3 w-3" />
            <span>
              {t(
                "prompt.emptyDetailTagsHint",
                "No tags yet. Edit this Prompt or drag tags from the sidebar.",
              )}
            </span>
          </div>
        ) : null}
      </div>
    </PromptDetailRow>
  );
}

function PromptDetailSourceAndNotes() {
  const { t } = useTranslation();
  const prompt = usePromptWorkspaceDetailContext().selectedPrompt!;
  return (
    <>
      {prompt.source ? (
        <PromptDetailRow
          label={t("prompt.source")}
          icon={<GlobeIcon aria-hidden="true" className="h-3.5 w-3.5" />}
        >
          <PromptSourceValue source={prompt.source} />
        </PromptDetailRow>
      ) : null}
      {prompt.notes ? (
        <PromptDetailRow
          label={t("prompt.notes")}
          icon={<StickyNoteIcon aria-hidden="true" className="h-3.5 w-3.5" />}
        >
          <div className="whitespace-pre-wrap break-words">{prompt.notes}</div>
        </PromptDetailRow>
      ) : null}
    </>
  );
}

export function PromptDetailSupplement() {
  return (
    <>
      <PromptDetailImages />
      <PromptDetailTags />
      <PromptDetailSourceAndNotes />
    </>
  );
}
