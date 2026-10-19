import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import type { Prompt, PromptVersion } from "@prompthub/shared/types";

// Exact released source; only pure serialization declarations run in the VM.
const sourceRef =
  "28935b56186cdf213b3af500853b586bee9199d3:apps/desktop/src/main/services/prompt-workspace.ts";
const names = new Set([
  "formatFrontmatter",
  "formatPromptBody",
  "promptFrontmatter",
  "versionFrontmatter",
]);
const markers = new Set(["SYSTEM_MARKER", "USER_MARKER"]);
const source = execFileSync("git", ["show", sourceRef], {
  cwd: fileURLToPath(new URL("../../../..", import.meta.url)),
  encoding: "utf8",
  timeout: 10_000,
  maxBuffer: 512 * 1024,
});
const parsed = ts.createSourceFile(
  "historical-workspace.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const declarations = parsed.statements.filter(
  (statement) =>
    (ts.isFunctionDeclaration(statement) &&
      statement.name &&
      names.has(statement.name.text)) ||
    (ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) &&
          markers.has(declaration.name.text),
      )),
);
if (declarations.length !== names.size + markers.size)
  throw new Error("Historical writer declaration set changed");
const script = ts.transpileModule(
  declarations.map((node) => node.getText(parsed)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const encode: unknown = vm.runInNewContext(
  `${script}\n((kind, value) => formatFrontmatter(kind === 'prompt' ? promptFrontmatter(value) : versionFrontmatter(value)) + formatPromptBody(value.systemPrompt, value.userPrompt))`,
  Object.create(null),
  { timeout: 1_000 },
);

export function historicalWorkspaceBytes(
  kind: "prompt" | "version",
  value: Prompt | PromptVersion,
): string {
  if (typeof encode !== "function")
    throw new Error("Historical writer was not loaded");
  const result: unknown = encode(kind, value);
  if (typeof result !== "string")
    throw new Error("Historical writer returned non-text data");
  return result;
}
