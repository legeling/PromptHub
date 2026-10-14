/** Distinguish portable manifests from other vendors' root plugin.json files. */
export function isCodexPortablePluginManifest(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const schema: unknown = Reflect.get(value, "$schema");
  const extensions: unknown = Reflect.get(value, "extensions");
  return (
    schema === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" ||
    Boolean(
      extensions &&
      typeof extensions === "object" &&
      "com.openai" in extensions,
    )
  );
}

/** Portable identity always belongs to the root; inline OpenAI settings replace the legacy overlay. */
export function mergeCodexPortablePluginManifest(
  root: Record<string, unknown>,
  legacy: Record<string, unknown> = {},
): Record<string, unknown> {
  const extensions = root.extensions;
  const inline: unknown =
    extensions && typeof extensions === "object"
      ? Reflect.get(extensions, "com.openai")
      : undefined;
  const overlay = inline !== undefined ? inline : legacy;
  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay))
    throw new Error("Codex plugin extension must be an object");
  return { ...root, ...overlay, name: root.name, version: root.version };
}
