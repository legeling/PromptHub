import type { RemoteWriteCondition } from "../types/remote-sync";

export function parseRemoteWriteCondition(
  value: unknown,
): RemoteWriteCondition | undefined {
  if (value === undefined) return undefined;
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1
  ) {
    if ("ifNoneMatch" in value && value.ifNoneMatch === "*")
      return { ifNoneMatch: "*" };
    // If-Match uses strong comparison. Reject wildcards, lists and control bytes.
    if (
      "ifMatch" in value &&
      typeof value.ifMatch === "string" &&
      /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value.ifMatch)
    ) {
      return { ifMatch: value.ifMatch };
    }
  }
  throw new Error(
    "Invalid remote write condition: expected one strong ETag or create-only condition",
  );
}

export function remoteWriteHeaders(value: unknown): Record<string, string> {
  const condition = parseRemoteWriteCondition(value);
  if (!condition) return {};
  return "ifMatch" in condition
    ? { "If-Match": condition.ifMatch }
    : { "If-None-Match": "*" };
}
