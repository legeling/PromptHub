import {
  GlobeIcon,
  Settings2Icon,
  MessageSquareIcon,
  CodeXmlIcon,
  BookOpenIcon,
} from "lucide-react";
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
      labelIcon={
        <Settings2Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      }
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
      textareaClassName="w-full min-h-[80px] max-h-[70vh] resize-y [field-sizing:content] rounded-none border border-border/70 bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground outline-none appearance-none placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-inset focus:ring-primary/20"
      rows={3}
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
      labelIcon={
        <MessageSquareIcon
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0"
        />
      }
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
      textareaClassName="w-full min-h-[320px] max-h-[70vh] resize-y [field-sizing:content] rounded-none border border-border/70 bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground outline-none appearance-none placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-inset focus:ring-primary/20"
      rows={12}
      headerAction={
        <button
          type="button"
          onClick={detail.toggleRenderMarkdown}
          disabled={detail.isDetailInlineEditing}
          className="inline-flex items-center gap-1.5 h-6 px-1 rounded text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {detail.renderMarkdownEnabled ? (
            <CodeXmlIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <BookOpenIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          )}
          {detail.renderMarkdownEnabled
            ? t("prompt.viewRaw", "Show Plain Text")
            : t("prompt.viewMarkdown", "Markdown")}
        </button>
      }
    />
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
      <PromptDetailAiResponse />
    </>
  );
}
