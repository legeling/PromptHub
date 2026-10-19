// Structural view of the Markdown nodes this remark transform edits; all other
// properties stay on the original nodes so links, images and code remain intact.
interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  spread?: boolean;
  data?: { hProperties?: Record<string, string> };
}

export type ReleaseCategory =
  | "features"
  | "fixes"
  | "improvements"
  | "maintenance"
  | "security"
  | "upgradeNotes"
  | "architecture";

interface ReleaseNotesLocale {
  chinese: boolean;
  categoryLabel: (category: ReleaseCategory) => string;
}

// These spellings are the category names already published in CHANGELOG.md.
const RELEASE_CATEGORIES: Readonly<Record<string, ReleaseCategory>> = {
  features: "features",
  added: "features",
  fixes: "fixes",
  fixed: "fixes",
  improvements: "improvements",
  changed: "improvements",
  maintenance: "maintenance",
  security: "security",
  "upgrade notes": "upgradeNotes",
  architecture: "architecture",
};
const HAN_CHARACTER = /\p{Script=Han}/u;

function nodeText(node: MarkdownNode): string {
  return node.value ?? (node.children ?? []).map(nodeText).join("");
}

function projectEntry(item: MarkdownNode, chinese: boolean): void {
  const [primary, translations, ...shared] = item.children ?? [];
  if (
    primary?.type !== "paragraph" ||
    !primary.children?.some((node) => node.type === "strong") ||
    !HAN_CHARACTER.test(nodeText(primary)) ||
    translations?.type !== "list" ||
    translations.children?.length !== 1
  ) {
    return;
  }

  const translated = translations.children[0];
  const paragraph = translated.children?.[0];
  const title = paragraph?.children?.find((node) => node.type === "strong");
  if (
    paragraph?.type !== "paragraph" ||
    !title ||
    HAN_CHARACTER.test(nodeText(title)) ||
    !/[a-z]/i.test(nodeText(title))
  ) {
    return;
  }

  item.children = chinese
    ? [primary, ...shared]
    : [...(translated.children ?? []), ...shared];
}

function styleEntry(item: MarkdownNode): void {
  item.data = { ...item.data, hProperties: { dataReleaseEntry: "true" } };
  const [paragraph, ...blocks] = item.children ?? [];
  if (paragraph?.type !== "paragraph") return;
  const [title, ...body] = paragraph.children ?? [];
  if (title?.type !== "strong" || body.length === 0) return;
  const first = body[0];
  if (first.type === "text" && first.value) {
    first.value = first.value.replace(/^[\s:：]+/u, "");
  }
  // Separate title/body paragraphs must survive Markdown's tight-list rendering.
  item.spread = true;
  item.children = [
    {
      type: "paragraph",
      data: { hProperties: { dataReleaseTitle: "true" } },
      children: [title],
    },
    { ...paragraph, children: body },
    ...blocks,
  ];
}

export function remarkLocalizeReleaseNotes(
  options: ReleaseNotesLocale,
): (tree: MarkdownNode) => void {
  return (tree) => {
    let bilingualCategory = false;
    let recognizedCategory = false;
    for (const node of tree.children ?? []) {
      if (node.type === "heading") {
        const title = nodeText(node).trim();
        const parts = title.split(/\s+\/\s+/);
        const sourceCategory = parts[parts.length - 1].toLowerCase();
        const category = Object.hasOwn(RELEASE_CATEGORIES, sourceCategory)
          ? RELEASE_CATEGORIES[sourceCategory]
          : undefined;
        bilingualCategory = Boolean(
          category && parts.length === 2 && HAN_CHARACTER.test(parts[0]),
        );
        recognizedCategory = Boolean(category);
        if (category) {
          node.data = {
            ...node.data,
            hProperties: { dataReleaseCategory: category },
          };
          node.children = [
            { type: "text", value: options.categoryLabel(category) },
          ];
        }
      } else if (node.type === "list" && recognizedCategory) {
        node.data = {
          ...node.data,
          hProperties: { dataReleaseEntries: "true" },
        };
        for (const item of node.children ?? []) {
          if (bilingualCategory) projectEntry(item, options.chinese);
          styleEntry(item);
        }
      }
    }
  };
}
