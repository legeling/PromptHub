/** Shared by the updater and the Node 24 packaging configuration. */
export function extractReleaseSection(
  content: string,
  version: string,
): string {
  const target = version.replace(/^v/, "").split("+")[0];
  const headings = [...content.matchAll(/^## \[([^\]\r\n]+)\].*$/gm)];
  const index = headings.findIndex((heading) => heading[1] === target);
  if (index < 0) return "";
  return content
    .slice(headings[index].index, headings[index + 1]?.index ?? content.length)
    .trim();
}
