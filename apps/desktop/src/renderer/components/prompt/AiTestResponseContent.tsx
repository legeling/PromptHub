import type { ComponentProps, ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { resolvePromptMarkdownHref } from "./prompt-markdown-url";

const rehypePlugins = [rehypeSanitize, rehypeHighlight];
const markdownComponents = {
  a: ({
    children,
    href,
    node: _node,
    ...props
  }: ComponentProps<"a"> & { node?: unknown }) => {
    const safeHref = resolvePromptMarkdownHref(href);
    if (!safeHref) return <span {...props}>{children}</span>;
    return (
      <a {...props} href={safeHref} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

export function AiTestResponseContent({
  content,
}: {
  content?: string;
}): ReactElement | null {
  if (!content) return null;
  return (
    <div className="text-[15px] leading-relaxed markdown-content space-y-3 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
