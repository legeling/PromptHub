import { memo, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { defaultSchema } from "hast-util-sanitize";
import {
  SparklesIcon,
  BugIcon,
  ZapIcon,
  WrenchIcon,
  ShieldCheckIcon,
  ArrowUpCircleIcon,
  LayersIcon,
  type LucideIcon,
} from "lucide-react";
import { resolvePromptMarkdownHref } from "./prompt/prompt-markdown-url";
import {
  remarkLocalizeReleaseNotes,
  type ReleaseCategory,
} from "../utils/release-notes-localization";

const categoryIcons: Record<ReleaseCategory, LucideIcon> = {
  features: SparklesIcon,
  fixes: BugIcon,
  improvements: ZapIcon,
  maintenance: WrenchIcon,
  security: ShieldCheckIcon,
  upgradeNotes: ArrowUpCircleIcon,
  architecture: LayersIcon,
};
type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
const headingTags: HeadingTag[] = ["h1", "h2", "h3", "h4", "h5", "h6"];
const releaseNoteSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    ...Object.fromEntries(
      headingTags.map((tag) => [
        tag,
        [...(defaultSchema.attributes?.[tag] ?? []), "dataReleaseCategory"],
      ]),
    ),
    ul: [...(defaultSchema.attributes?.ul ?? []), "dataReleaseEntries"],
    ol: [...(defaultSchema.attributes?.ol ?? []), "dataReleaseEntries"],
    li: [...(defaultSchema.attributes?.li ?? []), "dataReleaseEntry"],
    p: [...(defaultSchema.attributes?.p ?? []), "dataReleaseTitle"],
  },
};

function releaseHeading(
  Tag: HeadingTag,
): (props: ComponentProps<"h3"> & ExtraProps) => ReactNode {
  return function ReleaseHeading({ children, node, ...props }) {
    const category = node?.properties?.dataReleaseCategory;
    const Icon = Object.entries(categoryIcons).find(
      ([key]) => key === category,
    )?.[1];
    if (!Icon) {
      return (
        <Tag
          {...props}
          className="mb-3 mt-6 text-base font-semibold text-foreground first:mt-0"
        >
          {children}
        </Tag>
      );
    }
    return (
      <Tag
        {...props}
        className="mb-3 mt-7 flex items-center gap-3 text-sm font-semibold text-foreground first:mt-0"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <span>{children}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
      </Tag>
    );
  };
}

const releaseNoteMarkdownComponents: ComponentProps<
  typeof ReactMarkdown
>["components"] = {
  ...Object.fromEntries(headingTags.map((tag) => [tag, releaseHeading(tag)])),
  p: ({ children, node }) => (
    <p
      className={
        node?.properties?.dataReleaseTitle === "true"
          ? "mb-1 font-semibold text-foreground"
          : "mb-3 leading-6 last:mb-0"
      }
    >
      {children}
    </p>
  ),
  ul: ({ children, node, ...props }) => (
    <ul
      {...props}
      role="list"
      className={
        node?.properties?.dataReleaseEntries === "true"
          ? "ml-11 list-none divide-y divide-border/60"
          : "my-3 list-disc space-y-2 pl-5"
      }
    >
      {children}
    </ul>
  ),
  ol: ({ children, node: _node, ...props }) => (
    <ol {...props} className="my-3 list-decimal space-y-2 pl-5">
      {children}
    </ol>
  ),
  li: ({ children, node, ...props }) => (
    <li
      {...props}
      className={
        node?.properties?.dataReleaseEntry === "true"
          ? "py-3 first:pt-0 last:pb-0"
          : "leading-6"
      }
    >
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-muted/30 p-4 text-xs [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code
      className={`rounded bg-muted px-1 py-0.5 text-xs text-foreground ${className ?? ""}`}
    >
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/40 pl-4">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-border" />,
  a: ({
    children,
    href,
    node: _node,
    ...props
  }: ComponentProps<"a"> & { children?: ReactNode; node?: unknown }) => {
    const safeHref = resolvePromptMarkdownHref(href);

    if (!safeHref) {
      return <span {...props}>{children}</span>;
    }

    return (
      <a
        {...props}
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
      >
        {children}
      </a>
    );
  },
  img: ({
    alt,
    node: _node,
    src,
    ...props
  }: ComponentProps<"img"> & { node?: unknown }) => {
    const safeSrc = resolveReleaseNoteImageSrc(src);

    if (!safeSrc) {
      return alt ? <span className="text-muted-foreground">{alt}</span> : null;
    }

    return (
      <img
        {...props}
        src={safeSrc}
        alt={alt || ""}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="my-3 max-w-full rounded-md"
      />
    );
  },
};

const RELEASE_NOTE_IMAGE_HOSTS = new Set([
  "avatars.githubusercontent.com",
  "github.com",
  "img.shields.io",
  "private-user-images.githubusercontent.com",
  "raw.githubusercontent.com",
  "user-images.githubusercontent.com",
]);

function resolveReleaseNoteImageSrc(src: unknown): string | undefined {
  if (typeof src !== "string" || !src.trim()) {
    return undefined;
  }

  try {
    const parsed = new URL(src.trim());
    return parsed.protocol === "https:" &&
      RELEASE_NOTE_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export const UpdateReleaseNotes = memo(function UpdateReleaseNotes({
  notes,
}: {
  notes: string;
}): ReactNode {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  return (
    <div className="max-w-none break-words text-sm leading-6 text-muted-foreground [&_table]:my-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted/30 [&_th]:px-3 [&_th]:py-2 [&_th]:text-foreground">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [
            remarkLocalizeReleaseNotes,
            {
              chinese: language.toLowerCase().startsWith("zh"),
              categoryLabel: (category: string) =>
                t(`settings.updateCategories.${category}`),
            },
          ],
        ]}
        rehypePlugins={[[rehypeSanitize, releaseNoteSchema]]}
        components={releaseNoteMarkdownComponents}
      >
        {notes}
      </ReactMarkdown>
    </div>
  );
});
