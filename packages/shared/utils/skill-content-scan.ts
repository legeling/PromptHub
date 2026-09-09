import type {
  SkillFileSnapshot,
  SkillSafetyFinding,
  SkillSafetyReport,
  SkillSafetyScanInput,
} from "../types/skill";
import {
  scanSkillPackageSecrets,
  MAX_SKILL_PACKAGE_SECRET_FINDINGS,
} from "./skill-package-policy";

interface ContentScanInput extends SkillSafetyScanInput {
  files?: readonly SkillFileSnapshot[];
}

const CONTENT_RULES = [
  {
    code: "shell-pipe-exec",
    title: "Remote content is piped into an interpreter",
    pattern:
      /\b(?:curl|wget)\b[^\n]{0,120}\|\s*(?:sh|bash|zsh|fish|pwsh|powershell|python|node)\b/i,
  },
  {
    code: "dangerous-delete",
    title: "Destructive deletion targets a broad path",
    pattern: /\brm\s+-rf\s+(?:\/(?:\s|$)|~\/(?:\s|$)|\$\w+\/(?:\s|$)|\*)/i,
  },
  {
    code: "encoded-powershell",
    title: "Encoded PowerShell content is executed",
    pattern: /\b(?:powershell|pwsh)\b[^\n]{0,80}-(?:enc|encodedcommand)\b/i,
  },
  {
    code: "encoded-shell-bootstrap",
    title: "Decoded content is piped into an interpreter",
    pattern:
      /\bbase64\b[^\n]{0,120}(?:-d|--decode)[^\n]{0,80}\|\s*(?:sh|bash|zsh|python|node)\b/i,
  },
] as const;

function scanCommands(path: string, content: string): SkillSafetyFinding[] {
  const findings: SkillSafetyFinding[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    // Warnings about commands are not instructions to execute those commands.
    if (/\b(?:never|avoid|do not|don't)\b|不要|禁止|切勿/iu.test(line))
      continue;
    for (const rule of CONTENT_RULES) {
      if (seen.has(rule.code) || !rule.pattern.test(line)) continue;
      seen.add(rule.code);
      findings.push({
        code: rule.code,
        severity: "high",
        title: rule.title,
        detail:
          "Review the command in context. This content assessment does not execute or block the package.",
        filePath: path,
      });
    }
  }
  return findings;
}

function selectedTextFiles(
  input: ContentScanInput,
): Array<{ path: string; content: string }> {
  const files = (input.files ?? [])
    .filter((file) => file.encoding !== "base64")
    .map((file) => ({ path: file.relativePath, content: file.content }));
  if (input.content !== undefined) {
    const entry = files.find((file) => file.path.toLowerCase() === "skill.md");
    if (entry) entry.content = input.content;
    else if (input.content)
      files.unshift({ path: "SKILL.md", content: input.content });
  }
  return files;
}

/** Pure advisory assessment. Source, channel, reputation and network are not inputs. */
export function scanSkillContent(
  input: ContentScanInput,
  scannedAt = Date.now(),
): SkillSafetyReport {
  const files = selectedTextFiles(input);
  const findings = files.flatMap((file) =>
    scanCommands(file.path, file.content),
  );
  for (const finding of scanSkillPackageSecrets(files)) {
    findings.push({
      code: finding.code,
      severity: "high",
      title: "Potential credential material",
      detail: `Review potential credential material at line ${finding.line}; matched values are not included in this report.`,
      filePath: finding.path,
    });
  }
  const bounded = findings.slice(0, MAX_SKILL_PACKAGE_SECRET_FINDINGS);
  return {
    level: bounded.length ? "high-risk" : "safe",
    summary: bounded.length
      ? "Potential content risks found. Review the findings in context."
      : "No matching content risks found. Static analysis is not a safety guarantee.",
    findings: bounded,
    recommendedAction: bounded.length ? "review" : "allow",
    scannedAt,
    checkedFileCount: files.length,
    scanMethod: "preflight",
  };
}
