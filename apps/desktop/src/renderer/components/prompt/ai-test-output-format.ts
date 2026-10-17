import type { ChatCompletionOptions } from "../../services/ai-types";

/** Single and comparison tests share the same structured-output contract. */
export function parseTestResponseFormat(
  type: "text" | "json_object" | "json_schema",
  name: string,
  content: string,
): ChatCompletionOptions["responseFormat"] {
  if (type === "text") return undefined;
  if (type === "json_object") return { type };
  const schema: unknown = JSON.parse(content);
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("JSON Schema must be an object");
  }
  return {
    type,
    jsonSchema: {
      name: name.trim() || "response",
      strict: true,
      schema: Object.fromEntries(Object.entries(schema)),
    },
  };
}
