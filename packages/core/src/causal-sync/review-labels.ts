import type { CausalSyncPayload } from "./workflow";
import { resourceKey } from "./validation";

export function syncReviewLabels(
  resources: CausalSyncPayload[],
): Record<string, string> {
  const labels: Record<string, string> = {};
  const fields: Record<string, string> = {
    prompt: "prompt",
    skill: "skill",
    rule: "rule",
    mcp: "server",
    plugin: "plugin",
    "agent-provider": "profile",
    generation: "manifest",
  };
  for (const resource of resources) {
    const value: unknown = JSON.parse(resource.text);
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const field = fields[resource.resourceType];
    const content: unknown = field ? Reflect.get(value, field) : value;
    if (!content || typeof content !== "object" || Array.isArray(content))
      continue;
    const label: unknown =
      Reflect.get(content, "displayName") ??
      Reflect.get(content, "title") ??
      Reflect.get(content, "name") ??
      Reflect.get(content, "platformName");
    if (typeof label === "string" && label.trim())
      labels[resourceKey(resource)] = label;
  }
  return labels;
}
