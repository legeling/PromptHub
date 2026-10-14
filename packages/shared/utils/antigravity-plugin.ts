/** IDE plugins may omit name and use their containing directory as identity. */
export function isAntigravityPluginManifest(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (
    "name" in value &&
    (typeof value.name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value.name))
  ) {
    return false;
  }
  return !("description" in value) || typeof value.description === "string";
}
