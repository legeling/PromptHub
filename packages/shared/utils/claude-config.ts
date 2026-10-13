/** Claude cloud switches use explicit Boolean spellings, not string presence. */
export function isClaudeCloudProviderEnabled(value: unknown): boolean {
  return (
    typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
  );
}
