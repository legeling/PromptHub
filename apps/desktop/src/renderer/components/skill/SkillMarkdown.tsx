import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { ComponentProps } from "react";
import {
  resolveGitHubMarkdownBase,
  resolveGitHubMarkdownUrl,
} from "./detail-utils";

interface SkillMarkdownProps {
  content: string;
  sourceUrl?: string;
  contentUrl?: string;
  enableHighlight?: boolean;
}

export function SkillMarkdown({
  content,
  sourceUrl,
  contentUrl,
  enableHighlight = false,
}: SkillMarkdownProps) {
  const markdownBase = resolveGitHubMarkdownBase(sourceUrl, contentUrl);
  const rehypePlugins: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] =
    enableHighlight
      ? [[rehypeHighlight, { ignoreMissing: true }], rehypeSanitize]
      : [rehypeSanitize];

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={rehypePlugins}
      components={{
        a: ({
          children,
          href,
          node: _node,
          ...props
        }: ComponentProps<"a"> & { node?: unknown }) => {
          const safeHref =
            typeof href === "string"
              ? resolveGitHubMarkdownUrl(href, markdownBase, "link")
              : href;

          if (!safeHref) {
            return <span {...props}>{children}</span>;
          }

          return (
            <a
              {...props}
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          );
        },
        img: ({
          src,
          alt,
          node: _node,
          ...props
        }: ComponentProps<"img"> & { node?: unknown }) => {
          const safeSrc =
            typeof src === "string"
              ? resolveGitHubMarkdownUrl(src, markdownBase, "image")
              : src;

          if (!safeSrc) {
            return alt ? <span>{alt}</span> : null;
          }

          return (
            <img
              {...props}
              src={safeSrc}
              alt={alt || ""}
              loading="lazy"
            />
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
