import {
  BookOpenIcon,
  CheckIcon,
  CopyIcon,
  LanguagesIcon,
  Loader2Icon,
  RefreshCwIcon,
  GlobeIcon,
} from "lucide-react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { TFunction } from "i18next";
import type { Skill } from "../../../shared/types";
import { normalizeStringArray } from "../../services/skill-normalize";
import { SkillRenderBoundary } from "./SkillRenderBoundary";
import {
  renderImmersiveSegments,
  stripFrontmatter,
} from "./detail-utils";

interface SkillPreviewPaneProps {
  cachedDescriptionTranslation: string | null;
  cachedInstructionsTranslation: string | null;
  copyStatus: Record<string, boolean>;
  handleCopy: (text: string, key: string) => void;
  handleTranslateSkill: (forceRefresh?: boolean) => void;
  isTranslating: boolean;
  resolvedDescription: string;
  selectedSkill: Skill;
  showTranslation: boolean;
  skillContent: string;
  t: TFunction;
  translationMode: "immersive" | "full";
}

export function SkillPreviewPane({
  cachedDescriptionTranslation,
  cachedInstructionsTranslation,
  copyStatus,
  handleCopy,
  handleTranslateSkill,
  isTranslating,
  resolvedDescription,
  selectedSkill,
  showTranslation,
  skillContent,
  t,
  translationMode,
}: SkillPreviewPaneProps) {
  const visibleTags = useMemo(
    () => normalizeStringArray(selectedSkill.tags).slice(0, 4),
    [selectedSkill.tags],
  );
  const safeCategory =
    typeof selectedSkill.category === "string" ? selectedSkill.category : undefined;
  const safeAuthor =
    typeof selectedSkill.author === "string" ? selectedSkill.author : undefined;

  return (
    <div className="lg:col-span-2 flex h-full min-h-0 flex-col overflow-hidden space-y-6">
      <section className="shrink-0 space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
          {t("skill.skillDescription", "技能描述")}
        </h3>
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          {showTranslation && cachedDescriptionTranslation ? (
            <p className="text-sm text-primary/80 leading-relaxed italic">
              {cachedDescriptionTranslation}
            </p>
          ) : (
            <p className="text-sm text-foreground/90 leading-relaxed">
              {resolvedDescription || t("skill.defaultDescriptionLong")}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {safeAuthor && (
              <span className="text-xs bg-accent px-2 py-1 rounded-full font-medium text-foreground/80 flex items-center gap-1">
                <GlobeIcon className="w-3 h-3 text-muted-foreground" />
                {safeAuthor}
              </span>
            )}
            {safeCategory && (
              <span className="text-xs bg-accent px-2 py-1 rounded-full font-medium capitalize">
                {safeCategory}
              </span>
            )}
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
            {t("skill.skillContent", "Skill 内容")}
          </h3>
          <div className="flex gap-2">
            {skillContent.trim() && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleTranslateSkill(false)}
                  disabled={isTranslating}
                  className={`p-1 px-3 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                    showTranslation && cachedInstructionsTranslation
                      ? "bg-primary/10 text-primary"
                      : "bg-accent/50 hover:bg-accent"
                  } disabled:opacity-50`}
                >
                  {isTranslating ? (
                    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LanguagesIcon className="w-3.5 h-3.5" />
                  )}
                  {isTranslating
                    ? t("skill.translating", "Translating...")
                    : showTranslation && cachedInstructionsTranslation
                      ? t("skill.showOriginal", "Original")
                      : cachedInstructionsTranslation
                        ? t("skill.showTranslation", "Translation")
                        : t("skill.translate", "AI Translate")}
                </button>
                {cachedInstructionsTranslation && (
                  <button
                    onClick={() => handleTranslateSkill(true)}
                    disabled={isTranslating}
                    className="p-1 px-3 rounded-lg text-xs flex items-center gap-1.5 bg-accent/50 hover:bg-accent transition-colors disabled:opacity-50"
                    title={t("skill.refreshTranslation", "刷新翻译")}
                  >
                    <RefreshCwIcon
                      className={`w-3.5 h-3.5 ${isTranslating ? "animate-spin" : ""}`}
                    />
                    {t("skill.refreshTranslation", "刷新翻译")}
                  </button>
                )}
              </div>
            )}
            <button
              onClick={() => handleCopy(skillContent, "instr")}
              className="p-1 px-3 bg-accent/50 hover:bg-accent rounded-lg text-xs flex items-center gap-1.5 transition-colors"
            >
              {copyStatus.instr ? (
                <CheckIcon className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <CopyIcon className="w-3.5 h-3.5" />
              )}
              {copyStatus.instr ? t("skill.copied") : t("skill.copyMd")}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="skill-markdown-body min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
            <SkillRenderBoundary
              compact
              resetKey={`${selectedSkill.id}:${selectedSkill.updated_at}:${showTranslation ? "translated" : "original"}:${translationMode}`}
              title={t("skill.previewRenderError", "Skill 预览暂时无法渲染")}
              description={t(
                "skill.previewRenderErrorHint",
                "这份 Skill 的内容或元数据格式存在兼容性问题，但不会再把整个详情页冲白。你可以稍后重试，或切回文件视图继续检查原始内容。",
              )}
              secondaryActionLabel={t("common.retry", "重试")}
            >
              {skillContent.trim() ? (
                showTranslation && cachedInstructionsTranslation ? (
                  translationMode === "immersive" ? (
                    <div className="markdown-body">
                      {renderImmersiveSegments(cachedInstructionsTranslation).map((segment, index) =>
                        segment.type === "translation" ? (
                          <div
                            key={index}
                            className="border-l-2 border-primary/40 pl-3 my-1 text-primary/70 text-[12px] italic"
                          >
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                            >
                              {segment.text}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <ReactMarkdown
                            key={index}
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                          >
                            {segment.text}
                          </ReactMarkdown>
                        ),
                      )}
                    </div>
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                      >
                        {cachedInstructionsTranslation}
                      </ReactMarkdown>
                    </div>
                  )
                ) : (
                  <div className="markdown-body">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                    >
                      {stripFrontmatter(skillContent)}
                    </ReactMarkdown>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-16 opacity-30">
                  <BookOpenIcon className="w-12 h-12 mb-2" />
                  <p>{t("skill.noInstructions")}</p>
                </div>
              )}
            </SkillRenderBoundary>
          </div>
        </div>
      </section>
    </div>
  );
}
