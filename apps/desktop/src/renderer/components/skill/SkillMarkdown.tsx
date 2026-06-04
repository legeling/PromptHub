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
        a: ({ href, ...props }: ComponentProps<"a">) => (
          <a
            {...props}
            href={
              typeof href === "string"
                ? resolveGitHubMarkdownUrl(href, markdownBase, "link")
                : href
            }
            target="_blank"
            rel="noreferrer"
          />
        ),
        img: ({ src, alt, ...props }: ComponentProps<"img">) => (
          <img
            {...props}
            src={
              typeof src === "string"
                ? resolveGitHubMarkdownUrl(src, markdownBase, "image")
                : src
            }
            alt={alt || ""}
            loading="lazy"
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
