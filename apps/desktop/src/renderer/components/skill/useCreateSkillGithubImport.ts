import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { TFunction } from "i18next";
import type { RegistrySkill, Skill } from "@prompthub/shared/types/skill";
import { BUILTIN_SKILL_REGISTRY } from "@prompthub/shared/constants/skill-registry";
import { isGitHubHost, parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { getSkillPackageReadErrorCode } from "@prompthub/shared/utils/skill-package-read-error";
import { formatSkillPackageOperationError } from "../../services/skill-package-operation";
import { loadGitHubSkillRepo } from "../../services/github-skill-store";
import { findInstalledRegistrySkill } from "../../services/skill-store-update";
import type { SkillState } from "../../stores/skill/skill-store-types";
import {
  getRegistrySelectionKey,
  isCompleteImport,
} from "./create-skill-modal-utils";

type ErrorSetter = Dispatch<SetStateAction<string | null>>;
type BooleanSetter = Dispatch<SetStateAction<boolean>>;
type AnnotatedRegistrySkill = RegistrySkill & { isImported: boolean };

interface GitHubImportOptions {
  existingSkills: Skill[];
  installRegistrySkill: SkillState["installRegistrySkill"];
  setError: ErrorSetter;
  setIsLoading: BooleanSetter;
  t: TFunction;
}

interface GitHubImportSummary {
  failed: string[];
  importedCount: number;
  reviewRequired: string[];
  skipped: string[];
}

export function useCreateSkillGithubImport({
  existingSkills,
  installRegistrySkill,
  setError,
  setIsLoading,
  t,
}: GitHubImportOptions) {
  const [githubUrl, setGithubUrl] = useState("");
  const [githubScanResults, setGithubScanResults] = useState<RegistrySkill[]>(
    [],
  );
  const [selectedGitHubSkills, setSelectedGitHubSkills] = useState<Set<string>>(
    new Set(),
  );
  const [githubScanDone, setGithubScanDone] = useState(false);
  const [lastScannedGithubUrl, setLastScannedGithubUrl] = useState("");
  const [githubImportNotice, setGithubImportNotice] = useState<string | null>(
    null,
  );
  const annotatedGitHubResults = useMemo(
    () => annotateGitHubResults(githubScanResults, existingSkills),
    [existingSkills, githubScanResults],
  );
  const selectableGitHubResults = useMemo(
    () => annotatedGitHubResults.filter((skill) => !skill.isImported),
    [annotatedGitHubResults],
  );
  const normalizedGithubUrl = githubUrl.trim();
  const githubScanNeedsRefresh = Boolean(
    lastScannedGithubUrl &&
    normalizedGithubUrl &&
    normalizedGithubUrl !== lastScannedGithubUrl,
  );
  const resetGitHubImportState = useCallback(
    (options?: { preserveLastScannedUrl?: boolean; preserveUrl?: boolean }) => {
      setGithubScanResults([]);
      setSelectedGitHubSkills(new Set());
      setGithubScanDone(false);
      setGithubImportNotice(null);
      if (!options?.preserveUrl) setGithubUrl("");
      if (!options?.preserveLastScannedUrl) setLastScannedGithubUrl("");
    },
    [],
  );
  const scanRepository = useCallback(
    () =>
      scanGitHubRepository({
        existingSkills,
        normalizedGithubUrl,
        setError,
        setGithubImportNotice,
        setGithubScanDone,
        setGithubScanResults,
        setIsLoading,
        setLastScannedGithubUrl,
        setSelectedGitHubSkills,
        t,
      }),
    [existingSkills, normalizedGithubUrl, setError, setIsLoading, t],
  );
  const toggleGitHubSkill = useCallback((key: string) => {
    setSelectedGitHubSkills((selected) => toggleSelection(selected, key));
  }, []);
  const importSelected = useCallback(
    () =>
      importSelectedGitHubSkills({
        annotatedGitHubResults,
        installRegistrySkill,
        selectedGitHubSkills,
        setError,
        setGithubImportNotice,
        setIsLoading,
        t,
      }),
    [
      annotatedGitHubResults,
      installRegistrySkill,
      selectedGitHubSkills,
      setError,
      setIsLoading,
      t,
    ],
  );
  return {
    githubUrl,
    setGithubUrl,
    githubScanResults,
    setGithubScanResults,
    selectedGitHubSkills,
    setSelectedGitHubSkills,
    githubScanDone,
    setGithubScanDone,
    lastScannedGithubUrl,
    githubImportNotice,
    setGithubImportNotice,
    annotatedGitHubResults,
    selectableGitHubResults,
    normalizedGithubUrl,
    githubScanNeedsRefresh,
    resetGitHubImportState,
    scanRepository,
    toggleGitHubSkill,
    importSelected,
  };
}

function annotateGitHubResults(
  skills: RegistrySkill[],
  existingSkills: Skill[],
): AnnotatedRegistrySkill[] {
  return skills.map((skill) => ({
    ...skill,
    isImported: Boolean(findInstalledRegistrySkill(existingSkills, skill)),
  }));
}

async function scanGitHubRepository({
  existingSkills,
  normalizedGithubUrl,
  setError,
  setGithubImportNotice,
  setGithubScanDone,
  setGithubScanResults,
  setIsLoading,
  setLastScannedGithubUrl,
  setSelectedGitHubSkills,
  t,
}: {
  existingSkills: Skill[];
  normalizedGithubUrl: string;
  setError: ErrorSetter;
  setGithubImportNotice: Dispatch<SetStateAction<string | null>>;
  setGithubScanDone: BooleanSetter;
  setGithubScanResults: Dispatch<SetStateAction<RegistrySkill[]>>;
  setIsLoading: BooleanSetter;
  setLastScannedGithubUrl: Dispatch<SetStateAction<string>>;
  setSelectedGitHubSkills: Dispatch<SetStateAction<Set<string>>>;
  t: TFunction;
}) {
  if (!normalizedGithubUrl) {
    setError(t("skill.enterGithubUrl", "Please enter a Git repository URL"));
    return;
  }
  setIsLoading(true);
  setError(null);
  let parsedRepo: ReturnType<typeof parseGitRepo> | null = null;
  try {
    parsedRepo = parseGitRepo(normalizedGithubUrl);
    if (!parsedRepo)
      throw new Error(
        t("skill.invalidGithubUrl", "Invalid Git repository URL format"),
      );
    const skills = await loadRepositorySkills(
      normalizedGithubUrl,
      parsedRepo,
      t,
    );
    if (!skills.length)
      throw new Error(
        t(
          "skill.githubNoImportableSkills",
          "No importable SKILL.md or README.md files were found in this repository.",
        ),
      );
    setGithubScanResults(skills);
    setSelectedGitHubSkills(getUninstalledSkillKeys(skills, existingSkills));
    setGithubScanDone(true);
    setLastScannedGithubUrl(normalizedGithubUrl);
    setGithubImportNotice(null);
  } catch (error) {
    setError(formatGitHubScanError(error, parsedRepo, t));
  } finally {
    setIsLoading(false);
  }
}

async function loadRepositorySkills(
  url: string,
  parsedRepo: NonNullable<ReturnType<typeof parseGitRepo>>,
  t: TFunction,
): Promise<RegistrySkill[]> {
  if (!isGitHubHost(parsedRepo.host) || parsedRepo.protocol === "ssh") {
    return window.api.skill.scanRemoteGithub(url, BUILTIN_SKILL_REGISTRY);
  }
  return loadGitHubSkillRepo(url, {
    formatError: (error) => formatSkillPackageOperationError(error, t),
    branch: undefined,
    directory: undefined,
    fetchRemoteContent: (remoteUrl) =>
      window.api.skill.fetchRemoteContent(remoteUrl),
    registrySkills: BUILTIN_SKILL_REGISTRY,
    rateLimitMessage: t(
      "skill.remoteStoreRateLimitHint",
      "GitHub API rate limit reached. Try again in a few minutes, or switch this repository URL to SSH to avoid the anonymous API limit.",
    ),
    networkMessage: t(
      "skill.remoteStoreNetworkHint",
      "Failed to reach GitHub. Check your network connection or switch to another network and retry.",
    ),
    invalidRepoMessage: t(
      "skill.remoteStoreInvalidRepoHint",
      "Repository not found or URL is invalid. Check the GitHub repository address and try again.",
    ),
  });
}

function getUninstalledSkillKeys(
  skills: RegistrySkill[],
  existingSkills: Skill[],
) {
  return new Set(
    skills
      .filter((skill) => !findInstalledRegistrySkill(existingSkills, skill))
      .map(getRegistrySelectionKey),
  );
}

function formatGitHubScanError(
  error: unknown,
  parsedRepo: ReturnType<typeof parseGitRepo> | null,
  t: TFunction,
): string {
  if (getSkillPackageReadErrorCode(error) !== "read-failed")
    return formatSkillPackageOperationError(error, t);
  const message =
    error instanceof Error
      ? error.message
      : t("skill.installFailed", "Failed to install from GitHub");
  return parsedRepo?.protocol !== "ssh" &&
    message.includes("GitHub API rate limit reached")
    ? t(
        "skill.remoteStoreRateLimitHint",
        "GitHub API rate limit reached. Try again in a few minutes, or switch this repository URL to SSH to avoid the anonymous API limit.",
      )
    : message;
}

function toggleSelection(selection: Set<string>, key: string): Set<string> {
  const next = new Set(selection);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

async function importSelectedGitHubSkills({
  annotatedGitHubResults,
  installRegistrySkill,
  selectedGitHubSkills,
  setError,
  setGithubImportNotice,
  setIsLoading,
  t,
}: {
  annotatedGitHubResults: AnnotatedRegistrySkill[];
  installRegistrySkill: SkillState["installRegistrySkill"];
  selectedGitHubSkills: Set<string>;
  setError: ErrorSetter;
  setGithubImportNotice: Dispatch<SetStateAction<string | null>>;
  setIsLoading: BooleanSetter;
  t: TFunction;
}): Promise<boolean> {
  const targets = annotatedGitHubResults.filter(
    (skill) =>
      !skill.isImported &&
      selectedGitHubSkills.has(getRegistrySelectionKey(skill)),
  );
  if (!targets.length) return false;
  setIsLoading(true);
  setError(null);
  setGithubImportNotice(null);
  try {
    const summary = await installGitHubSkills(targets, installRegistrySkill);
    if (
      isCompleteImport(
        summary.importedCount,
        summary.skipped.length,
        summary.failed.length + summary.reviewRequired.length,
      )
    )
      return true;
    setGithubImportNotice(
      formatGitHubImportSummary(summary, targets.length, t),
    );
    return false;
  } finally {
    setIsLoading(false);
  }
}

async function installGitHubSkills(
  skills: RegistrySkill[],
  installRegistrySkill: SkillState["installRegistrySkill"],
): Promise<GitHubImportSummary> {
  const summary: GitHubImportSummary = {
    importedCount: 0,
    reviewRequired: [],
    skipped: [],
    failed: [],
  };
  for (const skill of skills) {
    try {
      const result = await installRegistrySkill(skill);
      if (result?.status === "installed") summary.importedCount += 1;
      else if (result?.status === "safety-review-required") {
        summary.reviewRequired.push(skill.name);
      } else summary.skipped.push(skill.name);
    } catch (error) {
      summary.failed.push(
        `${skill.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return summary;
}

function formatGitHubImportSummary(
  { failed, importedCount, reviewRequired, skipped }: GitHubImportSummary,
  total: number,
  t: TFunction,
): string {
  return t(
    "skill.githubImportSummary",
    "Imported {{imported}} / {{total}}, awaiting review {{reviewRequired}}, skipped {{skipped}}, failed {{failed}}.",
  )
    .replace("{{imported}}", String(importedCount))
    .replace("{{total}}", String(total))
    .replace("{{reviewRequired}}", String(reviewRequired.length))
    .replace("{{skipped}}", String(skipped.length))
    .replace("{{failed}}", String(failed.length));
}
