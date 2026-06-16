import { useTranslation } from "react-i18next";
import {
  StarIcon,
  HashIcon,
  ClockIcon,
  CopyIcon,
  CheckIcon,
  SparklesIcon,
  EditIcon,
  Maximize2Icon,
  Minimize2Icon,
  GlobeIcon,
  PlayIcon,
  VideoIcon,
  BracesIcon,
  Share2Icon,
  GitBranchIcon,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { ImagePreviewModal } from "../ui/ImagePreviewModal";
import { LocalImage } from "../ui/LocalImage";
import { PromptQuickRewriteDialog } from "./PromptQuickRewriteDialog";
import { PromptQuickRewriteTrigger } from "./PromptQuickRewriteTrigger";
import { PromptRelationshipPanel } from "./PromptRelationshipPanel";
import type {
  CreatePromptRelationDTO,
  Prompt,
  PromptRelation,
} from "@prompthub/shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { defaultSchema } from "hast-util-sanitize";
import { resolveLocalVideoSrc } from "../../utils/media-url";
import { copyTextToClipboard } from "./prompt-copy-utils";
import { parsePromptVariables } from "./prompt-modal-utils";
import { resolvePromptMarkdownHref } from "./prompt-markdown-url";

interface PromptDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt | null;
  onCopy?: (prompt: Prompt) => void | Promise<void>;
  onEdit?: (prompt: Prompt) => void;
  onQuickRewriteEdit?: (prompt: Prompt) => void;
  prompts?: Prompt[];
  relations?: PromptRelation[];
  onCreateRelation?: (data: CreatePromptRelationDTO) => Promise<void> | void;
  onDeleteRelation?: (id: string) => Promise<void> | void;
  onSelectPrompt?: (promptId: string) => void;
}

export function PromptDetailModal({
  isOpen,
  onClose,
  prompt,
  onCopy,
  onEdit,
  onQuickRewriteEdit,
  prompts = [],
  relations = [],
  onCreateRelation,
  onDeleteRelation,
  onSelectPrompt,
}: PromptDetailModalProps) {
  const { t, i18n } = useTranslation();
  const [copiedSystem, setCopiedSystem] = useState(false);
  const [copiedUser, setCopiedUser] = useState(false);
  const [copiedAi, setCopiedAi] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [shared, setShared] = useState(false);
  const [isQuickRewriteOpen, setIsQuickRewriteOpen] = useState(false);
  const [isRelationshipModalOpen, setIsRelationshipModalOpen] = useState(false);
  const feedbackTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout> | null>
  >({});

  const clearFeedbackTimer = (key: string) => {
    const timer = feedbackTimersRef.current[key];
    if (timer) {
      clearTimeout(timer);
      feedbackTimersRef.current[key] = null;
    }
  };

  const scheduleFeedbackReset = (key: string, reset: () => void) => {
    clearFeedbackTimer(key);
    feedbackTimersRef.current[key] = setTimeout(() => {
      reset();
      feedbackTimersRef.current[key] = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      Object.keys(feedbackTimersRef.current).forEach(clearFeedbackTimer);
    };
  }, []);

  const preferEnglish = useMemo(() => {
    const lang = (i18n.language || "").toLowerCase();
    return !lang.startsWith("zh");
  }, [i18n.language]);

  // 动态语言标签
  const uiLangTag = useMemo(() => {
    const lang = (i18n.language || "").toLowerCase();
    if (lang.startsWith("zh")) return "ZH";
    if (lang.startsWith("ja")) return "JA";
    if (lang.startsWith("de")) return "DE";
    if (lang.startsWith("fr")) return "FR";
    if (lang.startsWith("es")) return "ES";
    if (lang.startsWith("ko")) return "KO";
    if (lang.startsWith("en")) return "EN";
    return lang.split("-")[0].toUpperCase();
  }, [i18n.language]);

  // Automatically select Prompt language based on UI language (if English version exists)
  // 根据界面语言自动选择 Prompt 语言（如果有英文版本）
  // Note: Prompt currently only provides EN field, so non-Chinese interface defaults to showing English
  // 注意：Prompt 目前只提供 EN 字段，因此非中文界面默认优先显示英文
  useEffect(() => {
    if (!prompt) return;
    const hasEnglish = !!(prompt.systemPromptEn || prompt.userPromptEn);
    if (!hasEnglish) {
      setShowEnglish(false);
      return;
    }
    setShowEnglish(preferEnglish);
  }, [prompt?.id, prompt?.systemPromptEn, prompt?.userPromptEn, preferEnglish]);

  useEffect(() => {
    setIsRelationshipModalOpen(false);
  }, [isOpen, prompt?.id]);

  const sanitizeSchema: any = useMemo(() => {
    const schema = {
      ...defaultSchema,
      attributes: { ...defaultSchema.attributes },
    };
    schema.attributes.code = [...(schema.attributes.code || []), ["className"]];
    schema.attributes.span = [...(schema.attributes.span || []), ["className"]];
    schema.attributes.pre = [...(schema.attributes.pre || []), ["className"]];
    return schema;
  }, []);

  const rehypePlugins = useMemo(
    () => [
      [rehypeHighlight, { ignoreMissing: true }] as any,
      [rehypeSanitize, sanitizeSchema] as any,
    ],
    [sanitizeSchema],
  );

  const markdownComponents = useMemo(
    () => ({
      h1: (props: any) => (
        <h1 className="text-xl font-bold mb-3 text-foreground" {...props} />
      ),
      h2: (props: any) => (
        <h2
          className="text-lg font-semibold mb-2 mt-4 text-foreground"
          {...props}
        />
      ),
      h3: (props: any) => (
        <h3
          className="text-base font-semibold mb-2 mt-3 text-foreground"
          {...props}
        />
      ),
      p: (props: any) => (
        <p className="mb-2 leading-relaxed text-foreground/90" {...props} />
      ),
      ul: (props: any) => (
        <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />
      ),
      ol: (props: any) => (
        <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />
      ),
      li: (props: any) => <li className="leading-relaxed" {...props} />,
      code: (props: any) => (
        <code
          className="px-1 py-0.5 rounded bg-muted font-mono text-[12px]"
          {...props}
        />
      ),
      pre: (props: any) => (
        <pre
          className="p-3 rounded-lg bg-muted overflow-x-auto text-[12px] leading-relaxed"
          {...props}
        />
      ),
      blockquote: (props: any) => (
        <blockquote
          className="border-l-4 border-border pl-3 text-muted-foreground italic mb-3"
          {...props}
        />
      ),
      a: ({ href, children, ...props }: any) => {
        const safeHref = resolvePromptMarkdownHref(href);
        if (!safeHref) {
          return <span {...props}>{children}</span>;
        }
        return (
          <a
            className="text-primary hover:underline"
            {...props}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        );
      },
    }),
    [],
  );

  const renderPromptContent = (content?: string) => {
    if (!content) {
      return <span className="text-muted-foreground text-sm">-</span>;
    }
    return (
      <div className="p-4 rounded-lg bg-muted/30 border border-border text-sm leading-relaxed markdown-content space-y-2 break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={rehypePlugins}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  };

  if (!prompt) return null;
  const promptSourceHref = resolvePromptMarkdownHref(prompt.source);
  const modalRelations = relations.filter(
    (relation) =>
      relation.sourcePromptId === prompt.id ||
      relation.targetPromptId === prompt.id,
  );
  const modalRelationshipCount =
    modalRelations.length +
    (prompt.parentId ? 1 : 0) +
    prompts.filter((candidate) => candidate.parentId === prompt.id).length;
  const canEditRelations = Boolean(
    onCreateRelation && onDeleteRelation && onSelectPrompt,
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const allVariables = [
    ...parsePromptVariables(prompt.systemPrompt || ""),
    ...parsePromptVariables(prompt.userPrompt),
  ]
    .map((variable) => variable.name)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const handleCopySystem = async () => {
    const content = showEnglish
      ? prompt.systemPromptEn || prompt.systemPrompt
      : prompt.systemPrompt;
    if (content) {
      await copyTextToClipboard(content);
      setCopiedSystem(true);
      scheduleFeedbackReset("system", () => setCopiedSystem(false));
    }
  };

  const handleCopyUser = async () => {
    if (onCopy) {
      await onCopy(prompt);
      return;
    }

    const content = showEnglish
      ? prompt.userPromptEn || prompt.userPrompt
      : prompt.userPrompt;
    await copyTextToClipboard(content);
    setCopiedUser(true);
    scheduleFeedbackReset("user", () => setCopiedUser(false));
  };

  const handleCopyAi = async () => {
    if (prompt.lastAiResponse) {
      await copyTextToClipboard(prompt.lastAiResponse);
      setCopiedAi(true);
      scheduleFeedbackReset("ai", () => setCopiedAi(false));
    }
  };

  const handleShare = async () => {
    if (!prompt) return;

    const data = {
      name: prompt.title,
      description: prompt.description,
      userPrompt: prompt.userPrompt,
      systemPrompt: prompt.systemPrompt,
      userPromptEn: prompt.userPromptEn,
      systemPromptEn: prompt.systemPromptEn,
      tags: prompt.tags,
      variables: allVariables,
      source: "prompthub",
      version: "1.0",
    };

    const jsonStr = JSON.stringify(data, null, 2);
    await copyTextToClipboard(jsonStr);

    // Set a session flag to prevent the app from detecting its own copy as a new import
    const checksum = `${jsonStr.length}-${jsonStr.substring(0, 10)}`;
    sessionStorage.setItem("lastCopiedPromptSignature", checksum);

    setShared(true);
    scheduleFeedbackReset("share", () => setShared(false));
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      {/* 语言切换按钮 - 英文界面时隐藏 */}
      {(prompt.systemPromptEn || prompt.userPromptEn) &&
        !i18n.language.startsWith("en") && (
          <button
            type="button"
            onClick={() => setShowEnglish(!showEnglish)}
            className={`
            flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
            ${
              showEnglish
                ? "bg-primary text-white"
                : "bg-muted hover:bg-accent text-foreground"
            }
          `}
            title={
              showEnglish
                ? t("prompt.showLocalized", "显示当前语言")
                : t("prompt.showEnglish")
            }
          >
            <GlobeIcon aria-hidden="true" className="w-3.5 h-3.5" />
            {showEnglish ? "EN" : uiLangTag}
          </button>
        )}

      <button
        type="button"
        onClick={() => setIsFullscreen((v) => !v)}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title={
          isFullscreen
            ? t("common.exitFullscreen", "退出全屏")
            : t("common.fullscreen", "全屏")
        }
        aria-label={
          isFullscreen
            ? t("common.exitFullscreen", "退出全屏")
            : t("common.fullscreen", "全屏")
        }
      >
        {isFullscreen ? (
          <Minimize2Icon aria-hidden="true" className="w-4 h-4" />
        ) : (
          <Maximize2Icon aria-hidden="true" className="w-4 h-4" />
        )}
      </button>

      <PromptQuickRewriteTrigger
        onClick={() => setIsQuickRewriteOpen(true)}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      />

      {canEditRelations && (
        <button
          type="button"
          onClick={() => setIsRelationshipModalOpen((open) => !open)}
          aria-expanded={isRelationshipModalOpen}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          title={t("prompt.relationships.openPanel")}
          aria-label={t("prompt.relationships.openPanel")}
        >
          <GitBranchIcon aria-hidden="true" className="h-3.5 w-3.5" />
          <span>{t("prompt.relationships.openButton")}</span>
          <span className="text-[11px] text-muted-foreground/75">
            {modalRelationshipCount}
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={handleShare}
        className={`p-2 rounded-lg transition-all ${shared ? "text-green-500 bg-green-500/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
        title={t("prompt.shareJSON", "分享为 JSON")}
        aria-label={t("prompt.shareJSON", "分享为 JSON")}
      >
        {shared ? (
          <CheckIcon aria-hidden="true" className="w-4 h-4" />
        ) : (
          <Share2Icon aria-hidden="true" className="w-4 h-4" />
        )}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onEdit(prompt);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <EditIcon aria-hidden="true" className="w-4 h-4" />
          <span>{t("prompt.edit", "编辑")}</span>
        </button>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setIsFullscreen(false);
        onClose();
      }}
      title={prompt.title}
      size={isFullscreen ? "fullscreen" : "xl"}
      headerActions={headerActions}
    >
      <div className="space-y-6">
        {/* 基本信息 */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {prompt.isFavorite && (
            <div className="flex items-center gap-1">
              <StarIcon
                aria-hidden="true"
                className="w-4 h-4 fill-yellow-400 text-yellow-400"
              />
              <span>{t("nav.favorites")}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <ClockIcon aria-hidden="true" className="w-4 h-4" />
            <span>
              {t("prompt.updatedAt")}: {formatDate(prompt.updatedAt)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>
              {t("prompt.usageCount")}: {prompt.usageCount || 0}
            </span>
          </div>
        </div>

        {/* 描述 */}
        {prompt.description && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {t("prompt.description")}
            </h4>
            <p className="text-sm bg-muted/30 rounded-lg p-3">
              {prompt.description}
            </p>
          </div>
        )}

        {/* 来源 / Source */}
        {prompt.source && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <GlobeIcon aria-hidden="true" className="w-3.5 h-3.5" />
              {t("prompt.source")}
            </h4>
            <div className="text-sm bg-muted/30 rounded-lg p-3 break-all">
              {promptSourceHref ? (
                <a
                  href={promptSourceHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 inline-flex"
                >
                  <span className="truncate max-w-full">{prompt.source}</span>
                </a>
              ) : (
                <span className="text-foreground/90">{prompt.source}</span>
              )}
            </div>
          </div>
        )}

        {/* 备注 / Notes */}
        {prompt.notes && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {t("prompt.notes")}
            </h4>
            <div className="text-sm bg-yellow-500/5 border border-yellow-500/10 rounded-lg p-3 text-foreground/80 italic">
              {prompt.notes}
            </div>
          </div>
        )}

        {/* 图片 */}
        {prompt.images && prompt.images.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {t("prompt.referenceImages")}
            </h4>
            <div className="flex flex-wrap gap-4">
              {prompt.images.map((img, index) => (
                <div
                  key={index}
                  className="rounded-lg overflow-hidden border border-border shadow-sm"
                >
                  <LocalImage
                    src={img}
                    alt={`image-${index}`}
                    aria-label={t("prompt.previewReferenceImage", {
                      index: index + 1,
                    })}
                    className="max-w-[200px] max-h-[200px] object-cover hover:scale-105 transition-transform duration-smooth cursor-pointer"
                    fallbackClassName="w-[200px] h-[150px]"
                    onClick={() => setPreviewImage(img)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 视频 Videos */}
        {prompt.videos && prompt.videos.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <VideoIcon aria-hidden="true" className="w-4 h-4" />
              {t("prompt.previewVideos", "预览视频")}
            </h4>
            <div className="flex flex-wrap gap-4">
              {prompt.videos.map((video, index) => (
                <div
                  key={index}
                  className="relative rounded-lg overflow-hidden border border-border shadow-sm bg-muted"
                >
                  <video
                    src={resolveLocalVideoSrc(video)}
                    className="max-w-[300px] max-h-[200px] object-cover"
                    controls
                    preload="metadata"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 标签 */}
        {prompt.tags && prompt.tags.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {t("prompt.tags")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {prompt.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                >
                  <HashIcon aria-hidden="true" className="w-3 h-3" />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 关系（内联展开） */}
        {canEditRelations && isRelationshipModalOpen && (
          <PromptRelationshipPanel
            currentPrompt={prompt}
            prompts={prompts}
            relations={modalRelations}
            relationshipCount={modalRelationshipCount}
            onCreateRelation={onCreateRelation!}
            onDeleteRelation={onDeleteRelation!}
            onSelectPrompt={(promptId) => {
              onSelectPrompt!(promptId);
              setIsRelationshipModalOpen(false);
              onClose();
            }}
            className="mb-0"
          />
        )}

        {/* 变量 */}
        {allVariables.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <BracesIcon aria-hidden="true" className="w-4 h-4" />
              {t("prompt.variables")} ({allVariables.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {allVariables.map((variable) => (
                <span
                  key={variable}
                  className="px-2 py-0.5 rounded bg-accent text-xs font-mono"
                >
                  {`{{${variable}}}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* System Prompt */}
        {(showEnglish ? prompt.systemPromptEn : prompt.systemPrompt) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                {t("prompt.systemPrompt")}
                {showEnglish && (
                  <span className="px-1 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                    EN
                  </span>
                )}
              </h4>
              <button
                type="button"
                onClick={handleCopySystem}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {copiedSystem ? (
                  <CheckIcon aria-hidden="true" className="w-3.5 h-3.5" />
                ) : (
                  <CopyIcon aria-hidden="true" className="w-3.5 h-3.5" />
                )}
                {copiedSystem ? t("prompt.copied") : t("prompt.copy")}
              </button>
            </div>
            {renderPromptContent(
              showEnglish
                ? prompt.systemPromptEn || ""
                : prompt.systemPrompt || "",
            )}
          </div>
        )}

        {/* User Prompt */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              {t("prompt.userPrompt")}
              {showEnglish && (
                <span className="px-1 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                  EN
                </span>
              )}
            </h4>
            <button
              type="button"
              onClick={handleCopyUser}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {copiedUser ? (
                <CheckIcon aria-hidden="true" className="w-3.5 h-3.5" />
              ) : (
                <CopyIcon aria-hidden="true" className="w-3.5 h-3.5" />
              )}
              {copiedUser ? t("prompt.copied") : t("prompt.copy")}
            </button>
          </div>
          {renderPromptContent(
            showEnglish
              ? prompt.userPromptEn || prompt.userPrompt
              : prompt.userPrompt,
          )}
        </div>

        {/* AI 响应 */}
        {prompt.lastAiResponse && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <SparklesIcon
                  aria-hidden="true"
                  className="w-4 h-4 text-primary"
                />
                {t("prompt.aiResponse")}
              </h4>
              <button
                type="button"
                onClick={handleCopyAi}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {copiedAi ? (
                  <CheckIcon aria-hidden="true" className="w-3.5 h-3.5" />
                ) : (
                  <CopyIcon aria-hidden="true" className="w-3.5 h-3.5" />
                )}
                {copiedAi ? t("prompt.copied") : t("prompt.copyResponse")}
              </button>
            </div>
            {renderPromptContent(prompt.lastAiResponse)}
          </div>
        )}
      </div>

      {/* 图片预览弹窗 */}
      <ImagePreviewModal
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
        imageSrc={previewImage}
      />

      <PromptQuickRewriteDialog
        isOpen={isQuickRewriteOpen}
        onClose={() => setIsQuickRewriteOpen(false)}
        prompt={prompt}
        onContinueEditing={onQuickRewriteEdit ?? onEdit}
      />
    </Modal>
  );
}
