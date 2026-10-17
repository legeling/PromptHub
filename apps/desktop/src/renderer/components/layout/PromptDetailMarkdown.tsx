import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { renderHighlightedText } from "./PromptVirtualizedList";
import { usePromptWorkspaceDetailContext } from "./PromptWorkspaceDetailContext";

const PromptMarkdownContent = lazy(() =>
  import("../prompt/PromptMarkdownContent").then((module) => ({
    default: module.PromptMarkdownContent,
  })),
);

function PromptMarkdownFallback({
  content,
  inline,
}: {
  content: string;
  inline: boolean;
}) {
  const { highlightTerms } = usePromptWorkspaceDetailContext();
  const className = inline
    ? "whitespace-pre-wrap break-words text-sm leading-relaxed"
    : "whitespace-pre-wrap break-words font-mono text-[14px] leading-relaxed [overflow-wrap:anywhere]";
  return (
    <div className={className}>
      {inline
        ? content
        : renderHighlightedText(
            content,
            highlightTerms,
            "rounded bg-primary/15 px-0.5 text-primary",
          )}
    </div>
  );
}

function PromptMarkdownRendered({
  content,
  inline,
}: {
  content: string;
  inline: boolean;
}) {
  const { highlightTerms } = usePromptWorkspaceDetailContext();
  const className = inline
    ? "markdown-content space-y-3 break-words text-[15px] leading-relaxed"
    : "markdown-content space-y-3 break-words text-[14px] leading-relaxed [overflow-wrap:anywhere]";
  return (
    <div className={className}>
      <Suspense
        fallback={<PromptMarkdownFallback content={content} inline={inline} />}
      >
        <PromptMarkdownContent
          content={content}
          highlightTerms={highlightTerms}
          highlightClassName="rounded bg-primary/15 px-0.5 text-primary"
        />
      </Suspense>
    </div>
  );
}

export function PromptDetailMarkdown({
  content,
  inline = false,
}: {
  content?: string;
  inline?: boolean;
}) {
  const { t } = useTranslation();
  const { renderMarkdownEnabled } = usePromptWorkspaceDetailContext();
  if (!content)
    return inline ? null : (
      <div className="text-sm text-muted-foreground">
        {t("prompt.noContent")}
      </div>
    );
  return renderMarkdownEnabled ? (
    <PromptMarkdownRendered content={content} inline={inline} />
  ) : (
    <PromptMarkdownFallback content={content} inline={inline} />
  );
}
