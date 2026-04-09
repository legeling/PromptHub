import * as fs from "fs/promises";
import * as path from "path";
import type {
  SkillLocalFileEntry,
  SkillSafetyFinding,
  SkillSafetyLevel,
  SkillSafetyReport,
  SkillSafetyScanInput,
} from "../../shared/types";
import { resolvePublicAddress } from "./skill-installer-remote";

const MAX_SCAN_DEPTH = 5;
const MAX_SCAN_FILES = 200;
const MAX_TEXT_FILE_BYTES = 256 * 1024;
const TRUSTED_HOSTS = new Set([
  "github.com",
  "raw.githubusercontent.com",
  "skills.sh",
]);
const HIGH_RISK_FILE_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".dylib",
  ".so",
  ".app",
  ".pkg",
  ".msi",
  ".bat",
  ".cmd",
  ".ps1",
  ".psm1",
  ".jar",
]);
const SCRIPT_FILE_EXTENSIONS = new Set([
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".py",
  ".rb",
  ".js",
  ".ts",
  ".ps1",
  ".bat",
  ".cmd",
]);
const BLOCK_PATTERNS = [
  {
    code: "shell-pipe-exec",
    title: "Detected pipe-to-shell execution",
    detail:
      "The skill content contains a command that downloads remote content and pipes it directly into a shell.",
    regex:
      /\b(?:curl|wget)\b[\s\S]{0,120}?\|\s*(?:sh|bash|zsh|fish|pwsh|powershell)\b/i,
  },
  {
    code: "dangerous-delete",
    title: "Detected destructive delete command",
    detail:
      "The skill content contains a destructive delete command targeting root-level or wildcard paths.",
    regex: /\brm\s+-rf\s+(?:\/|\~\/|\$\w+\/|\*)/i,
  },
  {
    code: "encoded-powershell",
    title: "Detected encoded PowerShell execution",
    detail:
      "The skill content contains an encoded PowerShell command, which is commonly used to hide behavior.",
    regex: /\b(?:powershell|pwsh)\b[\s\S]{0,80}?(?:-enc|-encodedcommand)\b/i,
  },
  {
    code: "encoded-shell-bootstrap",
    title: "Detected encoded shell bootstrap",
    detail:
      "The skill content contains an encoded payload that is decoded and immediately executed.",
    regex:
      /\bbase64\b[\s\S]{0,120}?(?:-d|--decode)[\s\S]{0,80}?\|\s*(?:sh|bash|zsh|python|node)\b/i,
  },
];

const HIGH_RISK_PATTERNS = [
  {
    code: "privilege-escalation",
    title: "Requests elevated privileges",
    detail:
      "The skill content invokes sudo or another elevated execution path.",
    regex: /\bsudo\b/i,
  },
  {
    code: "system-persistence",
    title: "Touches persistence or system service mechanisms",
    detail:
      "The skill content refers to launch agents, cron jobs, scheduled tasks, or system services.",
    regex: /\b(?:launchctl|systemctl|service\s+\w+|crontab|schtasks)\b/i,
  },
  {
    code: "secret-access",
    title: "Reads secret-bearing paths",
    detail:
      "The skill content references files that commonly contain credentials or private keys.",
    regex:
      /(?:\.env\b|id_rsa\b|id_ed25519\b|\.ssh\/|aws\/credentials|\.npmrc\b|\.pypirc\b)/i,
  },
  {
    code: "security-bypass",
    title: "Suggests bypassing approvals or sandboxing",
    detail:
      "The skill content includes language about disabling approvals, bypassing sandboxing, or suppressing security prompts.",
    regex:
      /\b(?:disable|bypass|suppress|ignore)\b[\s\S]{0,40}?\b(?:approval|permission|sandbox|security)\b/i,
  },
  {
    code: "network-exfil",
    title: "Contains explicit upload or exfiltration behavior",
    detail:
      "The skill content combines secret-like file references with remote upload commands.",
    regex:
      /(?:\.env\b|id_rsa\b|\.ssh\/|aws\/credentials)[\s\S]{0,120}?\b(?:curl|wget|scp|rsync|nc|ftp)\b/i,
  },
];

const WARN_PATTERNS = [
  {
    code: "exec-bit",
    title: "Modifies executable permissions",
    detail:
      "The skill content changes file permissions, which is not always unsafe but deserves review.",
    regex: /\bchmod\b[\s\S]{0,40}?\b(?:777|755|\+x)\b/i,
  },
  {
    code: "network-bootstrap",
    title: "Downloads remote resources",
    detail:
      "The skill content downloads remote resources or bootstrap scripts.",
    regex: /\b(?:curl|wget|Invoke-WebRequest)\b/i,
  },
  {
    code: "env-mutation",
    title: "Mutates shell environment or startup files",
    detail:
      "The skill content edits shell rc files or environment variables, which may have long-lived effects.",
    regex: /\b(?:\.zshrc|\.bashrc|\.profile|export\s+[A-Z_][A-Z0-9_]*)\b/i,
  },
];

interface ScanDeps {
  now?: () => number;
  readRepoFiles?: (absolutePath: string) => Promise<SkillLocalFileEntry[]>;
  resolveAddress?: typeof resolvePublicAddress;
}

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) {
    return /(^|\/)(readme|skill|manifest|package|config)(\.|$)/i.test(filePath);
  }
  return !HIGH_RISK_FILE_EXTENSIONS.has(ext);
}

function dedupeFindings(findings: SkillSafetyFinding[]): SkillSafetyFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = [
      finding.code,
      finding.severity,
      finding.filePath || "",
      finding.evidence || "",
    ].join("::");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function addFinding(
  findings: SkillSafetyFinding[],
  finding: SkillSafetyFinding,
): void {
  findings.push(finding);
}

function scanTextContent(
  findings: SkillSafetyFinding[],
  text: string,
  filePath?: string,
): void {
  for (const rule of BLOCK_PATTERNS) {
    const match = text.match(rule.regex);
    if (match) {
      addFinding(findings, {
        code: rule.code,
        severity: "high",
        title: rule.title,
        detail: rule.detail,
        filePath,
        evidence: match[0].slice(0, 160),
      });
    }
  }

  for (const rule of HIGH_RISK_PATTERNS) {
    const match = text.match(rule.regex);
    if (match) {
      addFinding(findings, {
        code: rule.code,
        severity: "high",
        title: rule.title,
        detail: rule.detail,
        filePath,
        evidence: match[0].slice(0, 160),
      });
    }
  }

  for (const rule of WARN_PATTERNS) {
    const match = text.match(rule.regex);
    if (match) {
      addFinding(findings, {
        code: rule.code,
        severity: "warn",
        title: rule.title,
        detail: rule.detail,
        filePath,
        evidence: match[0].slice(0, 160),
      });
    }
  }
}

async function readRepoFilesFromPath(
  absolutePath: string,
): Promise<SkillLocalFileEntry[]> {
  const results: SkillLocalFileEntry[] = [];
  const basePath = path.resolve(absolutePath);
  const realBasePath = await fs.realpath(basePath).catch(() => basePath);

  const walk = async (currentPath: string, depth: number): Promise<void> => {
    if (depth > MAX_SCAN_DEPTH || results.length >= MAX_SCAN_FILES) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= MAX_SCAN_FILES) {
        return;
      }

      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      const lstat = await fs.lstat(fullPath);
      if (lstat.isSymbolicLink()) {
        continue;
      }

      const realFullPath = await fs.realpath(fullPath).catch(() => fullPath);
      const relativeToBase = path.relative(realBasePath, realFullPath);
      if (
        relativeToBase.startsWith("..") ||
        path.isAbsolute(relativeToBase)
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        results.push({
          path: relativePath,
          content: "",
          isDirectory: true,
        });
        await walk(fullPath, depth + 1);
        continue;
      }

      let content = "";
      if (isTextFile(relativePath) && lstat.size <= MAX_TEXT_FILE_BYTES) {
        content = await fs.readFile(fullPath, "utf-8").catch(() => "");
      } else if (!isTextFile(relativePath)) {
        content = "[binary file]";
      } else {
        content = "[file too large]";
      }

      results.push({
        path: relativePath,
        content,
        isDirectory: false,
      });
    }
  };

  try {
    await walk(basePath, 0);
  } catch {
    return [];
  }

  return results;
}

function deriveLevel(findings: SkillSafetyFinding[]): SkillSafetyLevel {
  const highFindings = findings.filter((finding) => finding.severity === "high");
  const warnFindings = findings.filter((finding) => finding.severity === "warn");

  if (
    findings.some((finding) =>
      [
        "shell-pipe-exec",
        "dangerous-delete",
        "encoded-powershell",
        "encoded-shell-bootstrap",
        "internal-source",
      ].includes(finding.code),
    )
  ) {
    return "blocked";
  }

  if (highFindings.length > 0) {
    return "high-risk";
  }

  if (warnFindings.length > 0) {
    return "warn";
  }

  return "safe";
}

function buildSummary(
  level: SkillSafetyLevel,
  findings: SkillSafetyFinding[],
  checkedFileCount: number,
): string {
  if (level === "safe") {
    return `No obvious malicious patterns were detected across ${checkedFileCount} scanned files.`;
  }

  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const warnCount = findings.filter((finding) => finding.severity === "warn").length;
  const blockedText =
    level === "blocked" ? " Installation should be blocked until reviewed." : "";

  return `Detected ${highCount} high-risk and ${warnCount} warning findings across ${checkedFileCount} scanned files.${blockedText}`;
}

async function scanSourceUrls(
  input: SkillSafetyScanInput,
  findings: SkillSafetyFinding[],
  resolveAddress: typeof resolvePublicAddress,
): Promise<void> {
  const urls = [input.sourceUrl, input.contentUrl].filter(
    (value): value is string => Boolean(value && value.trim()),
  );

  if (urls.length === 0) {
    if (input.localRepoPath) {
      return;
    }
    addFinding(findings, {
      code: "unknown-source",
      severity: "warn",
      title: "Source provenance is missing",
      detail:
        "The skill does not declare a source URL. Review it carefully before trusting it.",
    });
    return;
  }

  for (const urlValue of urls) {
    let parsed: URL;
    try {
      parsed = new URL(urlValue);
    } catch {
      addFinding(findings, {
        code: "invalid-source-url",
        severity: "warn",
        title: "Source URL is invalid",
        detail:
          "The skill declares a malformed source URL, so provenance cannot be verified cleanly.",
        evidence: urlValue,
      });
      continue;
    }

    if (parsed.protocol !== "https:") {
      addFinding(findings, {
        code: "insecure-source-url",
        severity: "warn",
        title: "Source URL is not HTTPS",
        detail:
          "The skill uses a non-HTTPS source URL, which weakens transport integrity.",
        evidence: urlValue,
      });
    }

    const host = parsed.hostname.toLowerCase();
    if (!TRUSTED_HOSTS.has(host)) {
      addFinding(findings, {
        code: "untrusted-source-host",
        severity: "warn",
        title: "Source host is not a known marketplace host",
        detail:
          "The skill comes from a custom host. That is not necessarily unsafe, but it should be reviewed manually.",
        evidence: host,
      });
    }

    try {
      await resolveAddress(host);
    } catch (error) {
      addFinding(findings, {
        code: "internal-source",
        severity: "high",
        title: "Source resolves to a blocked or internal address",
        detail:
          "The declared source host resolves to a local or internal address and should not be trusted for marketplace delivery.",
        evidence: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function scanRepoFiles(
  files: SkillLocalFileEntry[],
  findings: SkillSafetyFinding[],
): number {
  let checkedFileCount = 0;

  for (const file of files) {
    if (file.isDirectory) {
      continue;
    }

    checkedFileCount += 1;
    const normalizedPath = file.path.toLowerCase();
    const ext = path.extname(normalizedPath);

    if (
      normalizedPath.includes(".github/workflows") ||
      normalizedPath.includes("launchagents") ||
      normalizedPath.includes("launchdaemons")
    ) {
      addFinding(findings, {
        code: "persistence-file",
        severity: "high",
        title: "Repository contains persistence-related files",
        detail:
          "The skill repo contains workflow or launch configuration files that deserve manual review.",
        filePath: file.path,
      });
    }

    if (HIGH_RISK_FILE_EXTENSIONS.has(ext)) {
      addFinding(findings, {
        code: "high-risk-binary",
        severity: "high",
        title: "Repository contains high-risk executable artifacts",
        detail:
          "The skill repo contains executable or platform-specific binary artifacts.",
        filePath: file.path,
      });
    } else if (SCRIPT_FILE_EXTENSIONS.has(ext) && file.path !== "SKILL.md") {
      addFinding(findings, {
        code: "script-file",
        severity: "warn",
        title: "Repository contains executable scripts",
        detail:
          "The skill repo contains script files. That is common for advanced skills, but it increases review surface.",
        filePath: file.path,
      });
    }

    if (file.content && !file.content.startsWith("[")) {
      scanTextContent(findings, file.content, file.path);
    }
  }

  return checkedFileCount;
}

export async function scanSkillSafety(
  input: SkillSafetyScanInput,
  deps: ScanDeps = {},
): Promise<SkillSafetyReport> {
  const findings: SkillSafetyFinding[] = [];
  const resolveAddress = deps.resolveAddress ?? resolvePublicAddress;
  const readRepoFiles = deps.readRepoFiles ?? readRepoFilesFromPath;
  const now = deps.now ?? Date.now;

  await scanSourceUrls(input, findings, resolveAddress);

  if (input.securityAudits?.length) {
    addFinding(findings, {
      code: "external-audits",
      severity: "info",
      title: "External marketplace audit metadata is available",
      detail:
        "The marketplace attached external security audit metadata. Treat it as a signal, not as a full guarantee.",
      evidence: input.securityAudits.join("; "),
    });
  }

  if (input.content) {
    scanTextContent(findings, input.content, "SKILL.md");
  }

  let checkedFileCount = input.content ? 1 : 0;
  if (input.localRepoPath) {
    const files = await readRepoFiles(input.localRepoPath);
    checkedFileCount = Math.max(checkedFileCount, scanRepoFiles(files, findings));
  }

  const dedupedFindings = dedupeFindings(findings);
  const level = deriveLevel(dedupedFindings);

  return {
    level,
    findings: dedupedFindings,
    recommendedAction:
      level === "blocked"
        ? "block"
        : level === "high-risk"
          ? "review"
          : "allow",
    scannedAt: now(),
    checkedFileCount,
    summary: buildSummary(level, dedupedFindings, checkedFileCount),
  };
}
