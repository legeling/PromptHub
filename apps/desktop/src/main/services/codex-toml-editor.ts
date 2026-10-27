import { AgentCodexProviderError } from "./agent-codex-provider-error";

// ---------------------------------------------------------------------------
// Surgical TOML text editing
//
// smol-toml re-stringification drops comments and reorders nothing but does
// reformat, so provider writes edit the raw text in place: only the targeted
// table/key lines change and every unrelated byte (comments, other tables,
// formatting) is preserved. The editor only ever runs on documents that
// smol-toml already parsed successfully.
// ---------------------------------------------------------------------------

interface TomlHeader {
  segments: string[];
  isArray: boolean;
}

interface TomlSection {
  segments: string[];
  isArray: boolean;
  start: number;
  end: number;
}

interface TomlStructure {
  lines: string[];
  sections: TomlSection[];
  topLevelKeys: Array<{ line: number; key: string }>;
}

interface TomlKeyEntry {
  key: string;
  start: number;
  end: number;
}

function unquoteSegment(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      // TOML basic-string escapes are JSON-compatible for key segments.
      const parsed: unknown = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

function splitDottedKey(inner: string): string[] | null {
  const parts: string[] = [];
  let current = "";
  let inBasic = false;
  let inLiteral = false;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (inBasic) {
      current += char;
      if (char === "\\") {
        index += 1;
        current += inner[index] ?? "";
      } else if (char === '"') {
        inBasic = false;
      }
      continue;
    }
    if (inLiteral) {
      current += char;
      if (char === "'") inLiteral = false;
      continue;
    }
    if (char === '"') {
      inBasic = true;
      current += char;
      continue;
    }
    if (char === "'") {
      inLiteral = true;
      current += char;
      continue;
    }
    if (char === ".") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  const segments = parts.map(unquoteSegment);
  return segments.every((segment): segment is string => segment !== null)
    ? segments
    : null;
}

function parseTableHeader(line: string): TomlHeader | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("[")) return null;
  const isArray = trimmed.startsWith("[[");
  const closer = isArray ? "]]" : "]";
  let inner = "";
  let inBasic = false;
  let inLiteral = false;
  for (let index = isArray ? 2 : 1; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inBasic) {
      inner += char;
      if (char === "\\") {
        index += 1;
        inner += trimmed[index] ?? "";
      } else if (char === '"') {
        inBasic = false;
      }
      continue;
    }
    if (inLiteral) {
      inner += char;
      if (char === "'") inLiteral = false;
      continue;
    }
    if (char === '"') {
      inBasic = true;
      inner += char;
      continue;
    }
    if (char === "'") {
      inLiteral = true;
      inner += char;
      continue;
    }
    if (trimmed.startsWith(closer, index)) {
      const rest = trimmed.slice(index + closer.length).trim();
      if (rest && !rest.startsWith("#")) return null;
      const segments = splitDottedKey(inner);
      return segments ? { segments, isArray } : null;
    }
    inner += char;
  }
  return null;
}

/** Whether a TOML value expression ends on the accumulated text. */
function isValueComplete(text: string): boolean {
  let depth = 0;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      if (text.startsWith('"""', index)) {
        const end = text.indexOf('"""', index + 3);
        if (end === -1) return false;
        index = end + 3;
        continue;
      }
      index += 1;
      while (index < text.length && text[index] !== '"') {
        if (text[index] === "\\") index += 1;
        index += 1;
      }
      if (index >= text.length) return false;
      index += 1;
      continue;
    }
    if (char === "'") {
      if (text.startsWith("'''", index)) {
        const end = text.indexOf("'''", index + 3);
        if (end === -1) return false;
        index = end + 3;
        continue;
      }
      const end = text.indexOf("'", index + 1);
      if (end === -1) return false;
      index = end + 1;
      continue;
    }
    if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") depth -= 1;
    else if (char === "#" && depth === 0) return true;
    index += 1;
  }
  return depth <= 0;
}

function matchKeyValue(line: string): { key: string; value: string } | null {
  const match =
    /^\s*([A-Za-z0-9_-]+|"(?:[^"\\\n]|\\.)*"|'[^'\n]*')\s*=(.*)$/.exec(line);
  if (!match) return null;
  const key = unquoteSegment(match[1]);
  if (key === null) return null;
  return { key, value: match[2] };
}

function scanToml(raw: string): TomlStructure {
  const lines = raw.split("\n");
  const sections: TomlSection[] = [];
  const topLevelKeys: Array<{ line: number; key: string }> = [];
  let pendingValue: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (pendingValue !== null) {
      pendingValue += `\n${line}`;
      if (isValueComplete(pendingValue)) pendingValue = null;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const header = parseTableHeader(line);
    if (header) {
      if (sections.length > 0) {
        sections[sections.length - 1].end = index;
      }
      sections.push({
        segments: header.segments,
        isArray: header.isArray,
        start: index,
        end: lines.length,
      });
      continue;
    }
    const keyValue = matchKeyValue(line);
    if (keyValue) {
      if (sections.length === 0) {
        topLevelKeys.push({ line: index, key: keyValue.key });
      }
      if (!isValueComplete(keyValue.value)) {
        pendingValue = keyValue.value;
      }
    }
  }
  return { lines, sections, topLevelKeys };
}

function scanSectionEntries(
  lines: string[],
  from: number,
  to: number,
): TomlKeyEntry[] {
  const entries: TomlKeyEntry[] = [];
  let pendingValue: string | null = null;
  for (let index = from; index < to; index += 1) {
    if (pendingValue !== null) {
      pendingValue += `\n${lines[index]}`;
      if (isValueComplete(pendingValue)) {
        entries[entries.length - 1].end = index + 1;
        pendingValue = null;
      }
      continue;
    }
    const keyValue = matchKeyValue(lines[index]);
    if (keyValue) {
      entries.push({ key: keyValue.key, start: index, end: index + 1 });
      if (!isValueComplete(keyValue.value)) {
        pendingValue = keyValue.value;
      }
    }
  }
  return entries;
}

function segmentsEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function segmentsStartWith(segments: string[], prefix: string[]): boolean {
  return (
    prefix.length <= segments.length &&
    prefix.every((segment, index) => segment === segments[index])
  );
}

function renderSegment(segment: string): string {
  return /^[A-Za-z0-9_-]+$/.test(segment) ? segment : JSON.stringify(segment);
}

function toTomlString(value: string): string {
  // JSON string escaping is a subset of TOML basic-string escaping.
  return JSON.stringify(value);
}

function extractTrailingComment(line: string): string {
  let inBasic = false;
  let inLiteral = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inBasic) {
      if (char === "\\") index += 1;
      else if (char === '"') inBasic = false;
      continue;
    }
    if (inLiteral) {
      if (char === "'") inLiteral = false;
      continue;
    }
    if (char === '"') {
      inBasic = true;
      continue;
    }
    if (char === "'") {
      inLiteral = true;
      continue;
    }
    if (char === "#") return line.slice(index).trim();
  }
  return "";
}

function renderReplacementLine(
  line: string,
  key: string,
  value: string,
): string {
  const indent = /^(\s*)/.exec(line)?.[1] ?? "";
  const comment = extractTrailingComment(line);
  return `${indent}${key} = ${toTomlString(value)}${comment ? ` ${comment}` : ""}`;
}

function renderNumberReplacementLine(
  line: string,
  key: string,
  value: number,
): string {
  const indent = /^(\s*)/.exec(line)?.[1] ?? "";
  const comment = extractTrailingComment(line);
  return `${indent}${key} = ${value}${comment ? ` ${comment}` : ""}`;
}

function assertSingleLineStringValue(line: string): void {
  const keyValue = matchKeyValue(line);
  const trimmed = keyValue?.value.trim() ?? "";
  if (
    !keyValue ||
    !isValueComplete(keyValue.value) ||
    !(trimmed.startsWith('"') || trimmed.startsWith("'"))
  ) {
    throw new AgentCodexProviderError("config-too-complex");
  }
}

export function setTopLevelString(
  raw: string,
  key: string,
  value: string,
): string {
  const structure = scanToml(raw);
  const lines = [...structure.lines];
  const existing = structure.topLevelKeys.find((entry) => entry.key === key);
  if (existing) {
    assertSingleLineStringValue(lines[existing.line]);
    lines[existing.line] = renderReplacementLine(
      lines[existing.line],
      key,
      value,
    );
    return lines.join("\n");
  }
  const firstSectionStart = structure.sections[0]?.start ?? lines.length;
  let insertAt = firstSectionStart;
  while (insertAt > 0 && !lines[insertAt - 1].trim()) insertAt -= 1;
  lines.splice(insertAt, 0, `${key} = ${toTomlString(value)}`);
  return lines.join("\n");
}

export function setTopLevelNumber(
  raw: string,
  key: string,
  value: number,
): string {
  if (!Number.isSafeInteger(value)) {
    throw new AgentCodexProviderError("config-too-complex");
  }
  const structure = scanToml(raw);
  const lines = [...structure.lines];
  const existing = structure.topLevelKeys.find((entry) => entry.key === key);
  if (existing) {
    const keyValue = matchKeyValue(lines[existing.line]);
    if (
      !keyValue ||
      !isValueComplete(keyValue.value) ||
      !/^[+-]?\d(?:_?\d)*$/.test(keyValue.value.trim())
    ) {
      throw new AgentCodexProviderError("config-too-complex");
    }
    lines[existing.line] = renderNumberReplacementLine(
      lines[existing.line],
      key,
      value,
    );
    return lines.join("\n");
  }
  const firstSectionStart = structure.sections[0]?.start ?? lines.length;
  let insertAt = firstSectionStart;
  while (insertAt > 0 && !lines[insertAt - 1].trim()) insertAt -= 1;
  lines.splice(insertAt, 0, `${key} = ${value}`);
  return lines.join("\n");
}

export function removeTopLevelScalar(raw: string, key: string): string {
  const structure = scanToml(raw);
  const existing = structure.topLevelKeys.find((entry) => entry.key === key);
  if (!existing) return raw;
  const lines = [...structure.lines];
  const keyValue = matchKeyValue(lines[existing.line]);
  if (
    !keyValue ||
    !isValueComplete(keyValue.value) ||
    /^[{[]/.test(keyValue.value.trim())
  ) {
    throw new AgentCodexProviderError("config-too-complex");
  }
  lines.splice(existing.line, 1);
  return lines.join("\n");
}

export function upsertTableEntries(
  raw: string,
  tablePath: string[],
  set: Array<[string, string]>,
  remove: string[],
): string {
  const structure = scanToml(raw);
  const lines = [...structure.lines];
  const section = structure.sections.find(
    (candidate) =>
      !candidate.isArray && segmentsEqual(candidate.segments, tablePath),
  );

  if (!section) {
    const block = [
      `[${tablePath.map(renderSegment).join(".")}]`,
      ...set.map(([key, value]) => `${key} = ${toTomlString(value)}`),
      "",
    ].join("\n");
    if (!raw.trim()) return block;
    const base = raw.endsWith("\n") ? raw : `${raw}\n`;
    const gap = base.endsWith("\n\n") ? "" : "\n";
    return `${base}${gap}${block}`;
  }

  const entries = scanSectionEntries(lines, section.start + 1, section.end);
  let insertAt = section.start + 1;
  for (const entry of entries) {
    insertAt = Math.max(insertAt, entry.end);
  }

  const missing: Array<[string, string]> = [];
  for (const [key, value] of set) {
    const entry = entries.find((candidate) => candidate.key === key);
    if (entry) {
      assertSingleLineStringValue(lines[entry.start]);
      lines[entry.start] = renderReplacementLine(
        lines[entry.start],
        key,
        value,
      );
    } else {
      missing.push([key, value]);
    }
  }

  // Remove from bottom up so earlier indices stay valid.
  const removedRanges = entries
    .filter((entry) => remove.includes(entry.key))
    .sort((left, right) => right.start - left.start);
  for (const entry of removedRanges) {
    assertSingleLineStringValue(lines[entry.start]);
    lines.splice(entry.start, entry.end - entry.start);
    if (entry.end <= insertAt) insertAt -= entry.end - entry.start;
  }

  if (missing.length > 0) {
    lines.splice(
      insertAt,
      0,
      ...missing.map(([key, value]) => `${key} = ${toTomlString(value)}`),
    );
  }
  return lines.join("\n");
}

export function removeTable(raw: string, tablePath: string[]): string {
  const structure = scanToml(raw);
  const targets = structure.sections
    .filter((section) => segmentsStartWith(section.segments, tablePath))
    .sort((left, right) => right.start - left.start);
  if (targets.length === 0) return raw;
  const lines = [...structure.lines];
  for (const target of targets) {
    lines.splice(target.start, target.end - target.start);
  }
  return lines.join("\n");
}

/** Remove owned fields in either inline-value or explicit-subtable form. */
export function removeTableFields(
  raw: string,
  tablePath: string[],
  keys: string[],
): string {
  let next = raw;
  for (const key of keys) next = removeTable(next, [...tablePath, key]);
  const structure = scanToml(next);
  const section = structure.sections.find(
    (candidate) =>
      !candidate.isArray && segmentsEqual(candidate.segments, tablePath),
  );
  if (!section) return next;
  const entries = scanSectionEntries(
    structure.lines,
    section.start + 1,
    section.end,
  );
  for (const entry of entries.reverse()) {
    if (keys.includes(entry.key))
      structure.lines.splice(entry.start, entry.end - entry.start);
  }
  return structure.lines.join("\n");
}
