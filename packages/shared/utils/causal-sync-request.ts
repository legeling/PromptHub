import type {
  CausalSyncResolution,
  DesktopCausalSyncRequest,
} from "../types/causal-sync";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid sync request");
  return value as Record<string, unknown>; // Checked JSON object boundary.
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("Unknown sync request field");
}
function choice(value: unknown): "local" | "remote" {
  if (value !== "local" && value !== "remote")
    throw new Error("Invalid sync selection");
  return value;
}
function identity(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || /\p{Cc}/u.test(value))
    throw new Error("Invalid sync resource identity");
  return value;
}
function resolution(raw: unknown): CausalSyncResolution {
  const value = record(raw);
  if (typeof value.token !== "string" || !/^[a-f0-9]{64}$/u.test(value.token))
    throw new Error("Invalid sync review token");
  if (value.kind === "baseline") {
    keys(value, ["kind", "token", "choice"]);
    return {
      kind: "baseline",
      token: value.token,
      choice: choice(value.choice),
    };
  }
  if (value.kind !== "conflicts" || !Array.isArray(value.choices))
    throw new Error("Invalid sync resolution");
  keys(value, ["kind", "token", "choices"]);
  return {
    kind: "conflicts",
    token: value.token,
    choices: value.choices.map((rawEntry) => {
      const entry = record(rawEntry);
      keys(entry, ["resourceType", "resourceId", "choice"]);
      return {
        resourceType: identity(entry.resourceType),
        resourceId: identity(entry.resourceId),
        choice: choice(entry.choice),
      };
    }),
  };
}
export function parseDesktopCausalSyncRequest(
  raw: unknown,
): DesktopCausalSyncRequest {
  const value = record(raw);
  keys(value, ["provider", "resolution"]);
  if (value.provider !== "webdav" && value.provider !== "s3")
    throw new Error("Invalid sync provider");
  return {
    provider: value.provider,
    ...(value.resolution === undefined
      ? {}
      : { resolution: resolution(value.resolution) }),
  };
}
