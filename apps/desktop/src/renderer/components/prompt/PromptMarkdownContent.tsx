import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import { defaultSchema } from "hast-util-sanitize";
import { resolvePromptMarkdownHref } from "./prompt-markdown-url";

interface PromptMarkdownContentProps {
  content: string;
  highlightTerms: string[];
  highlightClassName?: string;
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(
  text: string,
  terms: string[],
  highlightClassName: string,
) {
  if (!text || terms.length === 0) return text;

  const pattern = terms.map(escapeRegExp).join("|");
  if (!pattern) return text;

  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);

  if (parts.length <= 1) return text;

  return parts.map((part, idx) => {
    if (!part) return null;
    if (idx % 2 === 1) {
      return (
        <span key={idx} className={highlightClassName}>
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function renderHighlightedChildren(
  children: ReactNode,
  terms: string[],
  highlightClassName: string,
  skipTypes: unknown[],
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return renderHighlightedText(child, terms, highlightClassName);
    }

    if (!isValidElement(child)) return child;

    if (skipTypes.includes(child.type)) return child;

    const props = (child.props ?? {}) as { children?: ReactNode };
    const nextChildren = renderHighlightedChildren(
      props.children,
      terms,
      highlightClassName,
      skipTypes,
    );
    return cloneElement(child, { ...props, children: nextChildren });
  });
}

export function PromptMarkdownContent({
  content,
  highlightTerms,
  highlightClassName = "bg-primary/15 text-primary rounded px-0.5",
}: PromptMarkdownContentProps) {
  const sanitizeSchema = useMemo(() => {
    const schema = {
      ...defaultSchema,
      attributes: { ...defaultSchema.attributes },
    };
    schema.attributes.code = [...(schema.attributes.code || []), ["className"]];
    schema.attributes.span = [...(schema.attributes.span || []), ["className"]];
    schema.attributes.pre = [...(schema.attributes.pre || []), ["className"]];
    return schema;
  }, []);

  const rehypePlugins: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] =
    useMemo(
    () => [
      [rehypeHighlight, { ignoreMissing: true }],
      [rehypeSanitize, sanitizeSchema],
    ],
    [sanitizeSchema],
  );

  const markdownComponents = useMemo(() => {
    const Code = (props: Record<string, unknown>) => (
      <code
        className="px-1 py-0.5 rounded bg-muted font-mono text-[13px]"
        {...props}
      />
    );
    const Pre = (props: Record<string, unknown>) => (
      <pre
        className="p-3 rounded-lg bg-muted overflow-x-auto text-[13px] leading-relaxed"
        {...props}
      />
    );
    const skipTypes = [Code, Pre];

    const withHighlight =
      (Tag: keyof JSX.IntrinsicElements, className: string) =>
      (props: { children?: ReactNode }) => (
        <Tag className={className} {...props}>
          {renderHighlightedChildren(
            props.children,
            highlightTerms,
            highlightClassName,
            skipTypes,
          )}
        </Tag>
      );

    return {
      h1: withHighlight("h1", "text-2xl font-bold mb-4 text-foreground"),
      h2: withHighlight(
        "h2",
        "text-xl font-semibold mb-3 mt-5 text-foreground",
      ),
      h3: withHighlight(
        "h3",
        "text-lg font-semibold mb-3 mt-4 text-foreground",
      ),
      h4: withHighlight(
        "h4",
        "text-base font-semibold mb-2 mt-3 text-foreground",
      ),
      p: withHighlight("p", "mb-3 leading-relaxed text-foreground/90"),
      ul: withHighlight("ul", "list-disc pl-5 mb-3 space-y-1"),
      ol: withHighlight("ol", "list-decimal pl-5 mb-3 space-y-1"),
      li: withHighlight("li", "leading-relaxed"),
      code: Code,
      pre: Pre,
      blockquote: withHighlight(
        "blockquote",
        "border-l-4 border-border pl-3 text-muted-foreground italic mb-3",
      ),
      hr: () => <hr className="my-4 border-border" />,
      table: (props: Record<string, unknown>) => (
        <table
          className="table-auto border-collapse w-full text-sm mb-3"
          {...props}
        />
      ),
      th: withHighlight(
        "th",
        "border border-border px-2 py-1 bg-muted text-left font-medium",
      ),
      td: withHighlight("td", "border border-border px-2 py-1"),
      a: ({ children, href, ...props }: { children?: ReactNode; href?: string }) => {
        const safeHref = resolvePromptMarkdownHref(href);
        const renderedChildren = renderHighlightedChildren(
          children,
          highlightTerms,
          highlightClassName,
          skipTypes,
        );

        if (!safeHref) {
          return <span {...props}>{renderedChildren}</span>;
        }

        return (
          <a
            className="text-primary hover:underline"
            {...props}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            {renderedChildren}
          </a>
        );
      },
      strong: withHighlight("strong", "font-semibold text-foreground"),
      em: withHighlight("em", "italic text-foreground/90"),
    };
  }, [highlightTerms, highlightClassName]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={rehypePlugins}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
