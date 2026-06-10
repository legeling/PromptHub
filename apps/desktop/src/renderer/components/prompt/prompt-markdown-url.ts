const SAFE_PROMPT_MARKDOWN_LINK_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
  "tel:",
]);

export function resolvePromptMarkdownHref(href: unknown): string | undefined {
  if (typeof href !== "string") {
    return undefined;
  }

  const trimmed = href.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("#")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    return SAFE_PROMPT_MARKDOWN_LINK_PROTOCOLS.has(parsed.protocol)
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
