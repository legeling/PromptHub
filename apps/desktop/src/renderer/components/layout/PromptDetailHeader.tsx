import {
  CheckIcon,
  EditIcon,
  Share2Icon,
  StarIcon,
  PaletteIcon,
  FileTextIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePromptStore } from "../../stores/prompt.store";
import { PromptDescriptionInput } from "../prompt/PromptDescriptionInput";
import { PromptQuickRewriteTrigger } from "../prompt/PromptQuickRewriteTrigger";
import { usePromptWorkspaceDetailContext } from "./PromptWorkspaceDetailContext";

function PromptDetailTitle() {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  const prompt = detail.selectedPrompt!;
  return (
    <div className="min-w-0 flex-1">
      {detail.isDetailInlineEditing ? (
        <input
          ref={detail.detailTitleInputRef}
          aria-label={t("prompt.titleLabel")}
          value={detail.detailInlineDraft.title}
          onChange={(event) =>
            detail.setDetailInlineDraft((draft) => ({
              ...draft,
              title: event.target.value,
            }))
          }
          onKeyDown={detail.handleDetailInlineEditKeyDown}
          placeholder={t("prompt.titlePlaceholder")}
          className="h-10 w-full rounded-none border border-border/70 bg-card px-4 text-xl font-bold text-foreground outline-none appearance-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-inset focus:ring-primary/20"
        />
      ) : (
        <h2
          onDoubleClick={() => detail.openDetailInlineEdit("title")}
          className="flex items-start gap-2 text-xl font-bold text-foreground mb-1 cursor-text [overflow-wrap:anywhere]"
        >
          {prompt.promptType === "image" ? (
            <PaletteIcon
              aria-hidden="true"
              className="mt-0.5 h-6 w-6 shrink-0 text-primary"
            />
          ) : (
            <FileTextIcon
              aria-hidden="true"
              className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground"
            />
          )}
          {prompt.title}
        </h2>
      )}
    </div>
  );
}

function PromptDetailHeaderActions() {
  return (
    <div
      data-testid="prompt-detail-header-actions"
      className="flex shrink-0 items-center gap-1"
    >
      <PromptDetailFavoriteAction />
      <PromptDetailUtilityActions />
    </div>
  );
}

function PromptDetailFavoriteAction() {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  const toggleFavorite = usePromptStore((state) => state.toggleFavorite);
  const prompt = detail.selectedPrompt!;
  const favoriteLabel = prompt.isFavorite
    ? t("prompt.removeFromFavorites")
    : t("prompt.addToFavorites");
  return (
    <button
      type="button"
      onClick={() => toggleFavorite(prompt.id)}
      aria-label={favoriteLabel}
      aria-pressed={prompt.isFavorite}
      title={favoriteLabel}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all duration-base ${prompt.isFavorite ? "text-yellow-500 bg-yellow-500/10" : "text-muted-foreground hover:bg-accent hover:text-foreground"} active:scale-press-in`}
    >
      <StarIcon
        aria-hidden="true"
        className={`w-4 h-4 ${prompt.isFavorite ? "fill-current" : ""}`}
      />
    </button>
  );
}

function PromptDetailUtilityActions() {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  const prompt = detail.selectedPrompt!;
  return (
    <>
      <PromptQuickRewriteTrigger
        onClick={() => detail.setQuickRewritePrompt(prompt)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 text-muted-foreground hover:bg-accent hover:text-primary transition-all duration-base active:scale-press-in"
      />
      <button
        type="button"
        onClick={() => detail.handleSharePrompt(prompt)}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all duration-base ${detail.shared ? "text-green-500 bg-green-500/10" : "text-muted-foreground hover:bg-accent hover:text-foreground"} active:scale-press-in`}
        aria-label={t("prompt.shareJSON", "分享为 JSON")}
        title={t("prompt.shareJSON", "分享为 JSON")}
      >
        {detail.shared ? (
          <CheckIcon aria-hidden="true" className="w-4 h-4" />
        ) : (
          <Share2Icon aria-hidden="true" className="w-4 h-4" />
        )}
      </button>
      {!detail.isDetailInlineEditing ? (
        <button
          type="button"
          onClick={() => detail.setEditingPrompt(prompt)}
          aria-label={t("prompt.editPrompt")}
          title={t("prompt.editPrompt")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-base active:scale-press-in"
        >
          <EditIcon aria-hidden="true" className="w-4 h-4" />
        </button>
      ) : null}
    </>
  );
}

function PromptDetailDescription() {
  const { t } = useTranslation();
  const prompts = usePromptStore((state) => state.prompts);
  const detail = usePromptWorkspaceDetailContext();
  const prompt = detail.selectedPrompt!;
  return detail.isDetailInlineEditing ? (
    <PromptDescriptionInput
      value={detail.detailInlineDraft.description}
      onChange={(description) =>
        detail.setDetailInlineDraft((draft) => ({ ...draft, description }))
      }
      inputRef={detail.detailDescriptionInputRef}
      onEditKeyDown={detail.handleDetailInlineEditKeyDown}
      prompts={prompts}
      currentPromptId={prompt.id}
      placeholder={t("prompt.descriptionPlaceholder")}
      ariaLabel={t("prompt.description")}
      t={t}
    />
  ) : (
    <button
      type="button"
      onClick={() => detail.openDetailInlineEdit("description")}
      className={`mt-1 block w-full text-left text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-md ${prompt.description ? "text-muted-foreground" : "text-muted-foreground/55"}`}
    >
      {prompt.description || t("prompt.addDescription")}
    </button>
  );
}

export function PromptDetailHeader() {
  return (
    <div className="mb-3">
      <div className="flex items-start justify-between gap-4">
        <PromptDetailTitle />
        <PromptDetailHeaderActions />
      </div>
      <PromptDetailDescription />
    </div>
  );
}
