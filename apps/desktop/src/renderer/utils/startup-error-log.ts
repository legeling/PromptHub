import { version } from "../../../package.json";

function redactStartupDiagnostic(text: string): string {
  // Keep stack locations useful without exporting credentials or home usernames.
  return text
    .replace(/\b(authorization\s*:\s*(?:basic|bearer)\s+)\S+/gi, "$1[REDACTED]")
    .replace(/(\w+:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, "$1[REDACTED]@")
    .replace(
      /([?&](?:access_token|token|secret|password|api[_-]?key|key)=)[^&\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /\b((?:access[_-]?)?token|secret|password|api[_-]?key)(["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi,
      "$1$2[REDACTED]",
    )
    .replace(/\b(?:cookie|set-cookie)\s*:[^\r\n]*/gi, "Cookie: [REDACTED]")
    .replace(/(?:\/Users\/|\/home\/)[^/\s]+/g, "~")
    .replace(/[A-Z]:[\\/]Users[\\/][^\\/\s]+/gi, "~");
}

export function formatStartupErrorLog(error: Error): string {
  const entries = [
    "PromptHub startup error",
    `Version: ${version}`,
    `Captured at: ${new Date().toISOString()}`,
    `Runtime: ${navigator.userAgent}`,
    "",
  ];
  const seen = new Set<Error>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    if (seen.size > 0) entries.push("Caused by:");
    seen.add(current);
    entries.push(current.stack || `${current.name}: ${current.message}`);
    current = current.cause;
  }
  if (typeof current === "string") entries.push("Caused by:", current);
  return redactStartupDiagnostic(entries.join("\n"));
}
