import { GitCompareIcon, GlobeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PromptAiResponsePanel } from "../prompt/PromptAiResponsePanel";
import { PromptContentField } from "../prompt/PromptContentField";
import { useToast } from "../ui/Toast";
import { usePromptWorkspaceDetailContext } from "./PromptWorkspaceDetailContext";
import { PromptDetailMarkdown } from "./PromptDetailMarkdown";

function PromptDetailLanguageToggle() {
  const { t, i18n } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  const prompt = detail.selectedPrompt!;
  const hasTranslation = prompt.systemPromptEn || prompt.userPromptEn;
  if (!hasTranslation || i18n.language.startsWith("en")) return null;
  return (
    <div className="flex justify-end mb-4">
      <button
        type="button"
        onClick={() => detail.setShowEnglish(!detail.showEnglish)}
        disabled={detail.isDetailInlineEditing}
        aria-pressed={detail.showEnglish}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-base active:scale-press-in disabled:opacity-50 disabled:cursor-not-allowed ${detail.showEnglish ? "bg-primary text-white" : "bg-accent text-muted-foreground hover:text-foreground"}`}
        title={
          detail.showEnglish
            ? t("prompt.showLocalized", "显示当前语言")
            : t("prompt.showEnglish")
        }
      >
        <GlobeIcon aria-hidden="true" className="w-3.5 h-3.5" />
        {detail.showEnglish ? "EN" : detail.uiLangTag}
      </button>
    </div>
  );
}

function updateDetailDraftField(
  setDraft: ReturnType<
    typeof usePromptWorkspaceDetailContext
  >["setDetailInlineDraft"],
  field: "systemPrompt" | "userPrompt",
  value: string,
) {
  setDraft((draft) => ({ ...draft, [field]: value }));
}

function PromptDetailSystemField() {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  const prompt = detail.selectedPrompt!;
  const content = detail.showEnglish
    ? prompt.systemPromptEn || ""
    : prompt.systemPrompt || "";
  if (!content && !detail.isDetailInlineEditing) return null;
  return (
    <PromptContentField
      label={t("prompt.systemPromptLabel", "System Prompt")}
      showEnglishBadge={detail.showEnglish}
      isEditing={detail.isDetailInlineEditing}
      value={detail.detailInlineDraft.systemPrompt}
      onChange={(value) =>
        updateDetailDraftField(
          detail.setDetailInlineDraft,
          "systemPrompt",
          value,
        )
      }
      textareaRef={detail.detailSystemPromptTextareaRef}
      onEditKeyDown={detail.handleDetailInlineEditKeyDown}
      onStartEdit={() => detail.openDetailInlineEdit("systemPrompt")}
      renderedContent={<PromptDetailMarkdown content={content} />}
      editAriaLabel={t(
        "prompt.inlineEditSystemPromptAria",
        "Double-click to edit system prompt",
      )}
      textareaClassName="w-full min-h-[120px] resize-none rounded-xl border border-border/70 bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-sm outline-none appearance-none placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
      rows={4}
    />
  );
}

function PromptDetailUserField() {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  const prompt = detail.selectedPrompt!;
  const content = detail.showEnglish
    ? prompt.userPromptEn || prompt.userPrompt
    : prompt.userPrompt;
  return (
    <PromptContentField
      label={t("prompt.userPromptLabel", "User Prompt")}
      showEnglishBadge={detail.showEnglish}
      isEditing={detail.isDetailInlineEditing}
      value={detail.detailInlineDraft.userPrompt}
      onChange={(value) =>
        updateDetailDraftField(detail.setDetailInlineDraft, "userPrompt", value)
      }
      textareaRef={detail.detailUserPromptTextareaRef}
      onEditKeyDown={detail.handleDetailInlineEditKeyDown}
      onStartEdit={() => detail.openDetailInlineEdit("userPrompt")}
      renderedContent={<PromptDetailMarkdown content={content} />}
      editAriaLabel={t(
        "prompt.inlineEditUserPromptAria",
        "Double-click to edit user prompt",
      )}
      textareaClassName="w-full min-h-[280px] resize-none rounded-xl border border-border/70 bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-sm outline-none appearance-none placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
      rows={12}
      headerAction={
        <button
          type="button"
          onClick={detail.toggleRenderMarkdown}
          disabled={detail.isDetailInlineEditing}
          className="text-[12px] px-3 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {detail.renderMarkdownEnabled
            ? t("prompt.viewRaw", "Show Plain Text")
            : t("prompt.viewMarkdown", "Markdown")}
        </button>
      }
    />
  );
}

function PromptDetailComparePanel() {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  const prompt = detail.selectedPrompt!;
  if (prompt.promptType === "image" || !detail.hasCompareModels) return null;
  return (
    <div className="mb-4 p-4 rounded-xl app-wallpaper-panel border border-border">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitCompareIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            {t("settings.multiModelCompare")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("prompt.selectModelsHint")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => detail.handleAiTest(prompt, "compare")}
          disabled={detail.isDetailInlineEditing}
          className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <GitCompareIcon aria-hidden="true" className="w-3 h-3" />
          <span>{t("settings.runCompare")}</span>
        </button>
      </div>
    </div>
  );
}

function PromptDetailAiResponse() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const detail = usePromptWorkspaceDetailContext();
  const prompt = detail.selectedPrompt!;
  return (
    <PromptAiResponsePanel
      isTestingAI={detail.isTestingAI}
      aiResponse={detail.aiResponse}
      aiThinking={detail.aiThinking}
      isImage={prompt.promptType === "image" || detail.isAiResponseImage}
      modelLabel={detail.aiResponseModelLabel}
      t={t}
      showToast={showToast}
      onPreviewImage={detail.setPreviewImage}
      renderMarkdown={(content) => (
        <PromptDetailMarkdown content={content} inline />
      )}
    />
  );
}

export function PromptDetailFields() {
  const { t } = useTranslation();
  const detail = usePromptWorkspaceDetailContext();
  return (
    <>
      <PromptDetailLanguageToggle />
      <PromptDetailSystemField />
      {detail.isDetailInlineEditing && !detail.hasDetailInlineContent && (
        <p role="status" className="mb-2 text-sm text-destructive">
          {t("prompt.contentRequired")}
        </p>
      )}
      <PromptDetailUserField />
      <PromptDetailComparePanel />
      <PromptDetailAiResponse />
    </>
  );
}
