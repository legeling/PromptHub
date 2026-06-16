import { CopyIcon, DownloadIcon, LoaderIcon, SparklesIcon, ZoomInIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { useTranslation } from "react-i18next";
import { CollapsibleThinking } from "../ui/CollapsibleThinking";
import { copyTextToClipboard } from "./prompt-copy-utils";

type ShowToast = (
  message: string,
  type?: "success" | "error" | "info" | "warning",
) => void;

interface PromptAiResponsePanelProps {
  /** Whether an AI test is currently running. */
  isTestingAI: boolean;
  /** The response text, or image data URL when isImage is true. */
  aiResponse: string | null;
  /** Collapsible reasoning/thinking trace, if any. */
  aiThinking: string | null;
  /** Render the response as an image instead of markdown text. */
  isImage: boolean;
  /** Model name shown beside the heading. */
  modelLabel: string;
  t: ReturnType<typeof useTranslation>["t"];
  showToast: ShowToast;
  onPreviewImage: (url: string) => void;
  /** Renders the response body as markdown (kept in the parent). */
  renderMarkdown: (content?: string) => ReactNode;
}

export function PromptAiResponsePanel({
  isTestingAI,
  aiResponse,
  aiThinking,
  isImage,
  modelLabel,
  t,
  showToast,
  onPreviewImage,
  renderMarkdown,
}: PromptAiResponsePanelProps) {
  if (!isTestingAI && !aiResponse) {
    return null;
  }

  return (
    <div className="mb-4 p-4 rounded-xl app-wallpaper-panel border border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            {t("prompt.aiResponse", "AI 响应")}
          </span>
          <span className="text-xs text-muted-foreground">({modelLabel})</span>
        </div>
        {aiResponse && (
          <button
            type="button"
            onClick={async () => {
              await copyTextToClipboard(aiResponse);
              showToast(t("toast.copied"), "success");
            }}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            aria-label={t("prompt.copy")}
            title={t("prompt.copy")}
          >
            <CopyIcon aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
      {isTestingAI && !aiResponse ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <LoaderIcon className="w-4 h-4 animate-spin" />
          <span className="text-sm">{t("prompt.testing", "测试中...")}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {isTestingAI ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderIcon className="w-3 h-3 animate-spin" />
              <span>{t("prompt.testing", "测试中...")}</span>
            </div>
          ) : null}
          {/* Collapsible thinking process / 可折叠的思考过程 */}
          <CollapsibleThinking content={aiThinking} isLoading={isTestingAI} />
          <div className="text-sm leading-relaxed max-h-80 overflow-y-auto">
            {isImage && aiResponse ? (
              <div className="relative group">
                <button
                  type="button"
                  className="block max-w-full rounded-lg bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={t("settings.generatedImageAlt")}
                  onClick={() => onPreviewImage(aiResponse)}
                >
                  <img
                    src={aiResponse}
                    className="max-w-full rounded-lg shadow-sm bg-black/5 hover:opacity-90 transition-opacity"
                    alt=""
                    aria-hidden="true"
                  />
                </button>
                {/* Image action buttons */}
                <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onPreviewImage(aiResponse)}
                    className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
                    aria-label={t("common.preview", "放大预览")}
                    title={t("common.preview", "放大预览")}
                  >
                    <ZoomInIcon aria-hidden="true" className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const { downloadGeneratedImage } = await import(
                          "../../utils/download-generated-image"
                        );
                        await downloadGeneratedImage({
                          imageUrl: aiResponse,
                          fileName: `ai-generated-${Date.now()}.png`,
                        });
                        showToast(t("common.downloadSuccess"), "success");
                      } catch (err) {
                        console.error("Failed to download image:", err);
                        showToast(t("common.downloadFailed"), "error");
                      }
                    }}
                    className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
                    aria-label={t("common.download", "下载图片")}
                    title={t("common.download", "下载图片")}
                  >
                    <DownloadIcon aria-hidden="true" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              renderMarkdown(aiResponse ?? undefined)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
