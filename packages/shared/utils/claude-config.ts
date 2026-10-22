/** Claude cloud switches use explicit Boolean spellings, not string presence. */
export function isClaudeCloudProviderEnabled(value: unknown): boolean {
  return (
    typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
  );
}

/** Resolves only the selected settings file, not CLI/process/project overrides. */
export function getClaudeConfiguredModel(
  data: Record<string, unknown>,
): string | null {
  const env = data.env;
  const values =
    env && typeof env === "object" && !Array.isArray(env)
      ? [
          Reflect.get(env, "ANTHROPIC_MODEL"),
          data.model,
          Reflect.get(env, "ANTHROPIC_DEFAULT_MODEL"),
        ]
      : [data.model];
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
