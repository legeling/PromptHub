/** Git non-cone patterns are gitignore patterns, not literal directory names. */
export function gitPackageDirectoryPattern(directory: string): string {
  if (/[\u0000\r\n]/u.test(directory))
    throw new Error(
      "Git package directory contains an invalid control character",
    );
  // Anchor at the repository root; the trailing slash includes the whole tree.
  // Escape spaces too, since Git otherwise trims trailing pattern whitespace.
  return `/${directory.replace(/[\\*?\[\] ]/gu, "\\$&")}/`;
}
