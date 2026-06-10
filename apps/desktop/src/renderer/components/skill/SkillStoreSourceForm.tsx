import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import type { SkillStoreSource } from "@prompthub/shared/types";
import {
  isLikelyLocalSource,
  normalizeGitStoreSourceInput,
} from "../../services/skill-store-source";
import { isGitHubHost, parseGitRepo } from "@prompthub/shared/utils/git-repo";

interface SkillStoreSourceFormProps {
  branch: string;
  directory: string;
  handleAddSource: () => void;
  setBranch: (value: string) => void;
  setDirectory: (value: string) => void;
  setSourceName: (value: string) => void;
  setSourceType: (
    value: Extract<
      SkillStoreSource["type"],
      "marketplace-json" | "git-repo" | "local-dir"
    >,
  ) => void;
  setSourceUrl: (value: string) => void;
  sourceName: string;
  sourceType: Extract<
    SkillStoreSource["type"],
    "marketplace-json" | "git-repo" | "local-dir"
  >;
  sourceUrl: string;
  t: TFunction;
  typeOptions: Array<{
    value: Extract<
      SkillStoreSource["type"],
      "marketplace-json" | "git-repo" | "local-dir"
    >;
    icon: React.ReactNode;
  }>;
}

function prioritizeBranchSuggestions(branches: string[], currentBranch: string): string[] {
  const current = currentBranch.trim().toLowerCase();
  const priority = new Map<string, number>();

  if (current) {
    priority.set(current, 0);
  }
  if (!priority.has("main")) {
    priority.set("main", 1);
  }
  if (!priority.has("master")) {
    priority.set("master", 2);
  }

  return [...branches].sort((left, right) => {
    const leftPriority = priority.get(left.toLowerCase()) ?? Number.POSITIVE_INFINITY;
    const rightPriority = priority.get(right.toLowerCase()) ?? Number.POSITIVE_INFINITY;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.localeCompare(right);
  });
}

function buildBranchSuggestions(branches: string[], currentBranch: string): string[] {
  const current = currentBranch.trim().toLowerCase();

  return prioritizeBranchSuggestions(branches, currentBranch).filter(
    (item) => item.toLowerCase() !== current,
  );
}

export function SkillStoreSourceForm({
  branch,
  directory,
  handleAddSource,
  setBranch,
  setDirectory,
  setSourceName,
  setSourceType,
  setSourceUrl,
  sourceName,
  sourceType,
  sourceUrl,
  t,
  typeOptions,
}: SkillStoreSourceFormProps) {
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const loadBranches = async () => {
      if (sourceType !== "git-repo") {
        setRemoteBranches([]);
        setBranchError(null);
        setIsLoadingBranches(false);
        return;
      }

      const trimmedUrl = sourceUrl.trim();
      const parsedRepo = trimmedUrl ? parseGitRepo(trimmedUrl) : null;
      const shouldLoad =
        Boolean(parsedRepo) &&
        !isLikelyLocalSource(trimmedUrl) &&
        (parsedRepo?.protocol === "ssh" || isGitHubHost(parsedRepo?.host ?? ""));

      if (!shouldLoad) {
        setRemoteBranches([]);
        setBranchError(null);
        setIsLoadingBranches(false);
        return;
      }

      setIsLoadingBranches(true);
      setBranchError(null);
      try {
        const normalizedSource = normalizeGitStoreSourceInput(trimmedUrl);
        const branches = await window.api.skill.listRemoteBranches(normalizedSource.url);
        if (!disposed) {
          setRemoteBranches(branches);
        }
      } catch (error) {
        if (!disposed) {
          setRemoteBranches([]);
          setBranchError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!disposed) {
          setIsLoadingBranches(false);
        }
      }
    };

    void loadBranches();

    return () => {
      disposed = true;
    };
  }, [sourceType, sourceUrl]);

  const filteredBranches = useMemo(() => {
    const query = branch.trim().toLowerCase();
    if (!query) {
      return buildBranchSuggestions(remoteBranches, branch).slice(0, 12);
    }
    return buildBranchSuggestions(
      remoteBranches.filter((item) => item.toLowerCase().includes(query)),
      branch,
    ).slice(0, 12);
  }, [branch, remoteBranches]);
  const canAddSource = Boolean(sourceName.trim() && sourceUrl.trim());

  return (
    <div className="space-y-4 app-wallpaper-surface border border-border rounded-2xl p-4">
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {t("skill.storeSourceType", "Store Type")}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {typeOptions.map((option) => {
            const active = sourceType === option.value;
            const label =
              option.value === "marketplace-json"
                ? t("skill.sourceTypeMarketplace", "Marketplace JSON")
                : option.value === "git-repo"
                  ? t("skill.sourceTypeGit", "Git Repository")
                  : t("skill.sourceTypeLocal", "Local Directory");
            const hint =
              option.value === "marketplace-json"
                ? t(
                    "skill.sourceTypeMarketplaceHint",
                    "Best for a direct marketplace.json URL. PromptHub will read the index and load store entries from it.",
                  )
                : option.value === "git-repo"
                  ? t(
                      "skill.sourceTypeGitHint",
                      "Best for a GitHub or Git repository URL. PromptHub will detect SKILL.md folders or a store index inside it.",
                    )
                  : t(
                      "skill.sourceTypeLocalHint",
                      "Best for a local folder path. PromptHub will scan it for skill folders.",
                    );

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setSourceType(option.value)}
                className={`text-left rounded-xl border px-4 py-3 transition-all ${
                  active
                    ? "border-primary bg-primary/10 text-foreground shadow-[0_0_0_1px_rgba(96,165,250,0.2)]"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    aria-hidden="true"
                    className={
                      active ? "text-primary" : "text-muted-foreground"
                    }
                  >
                    {option.icon}
                  </span>
                  {label}
                </div>
                <div className="mt-1 text-xs leading-5">{hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.35fr_auto] gap-2">
        <input
          type="text"
          value={sourceName}
          onChange={(event) => setSourceName(event.target.value)}
          aria-label={t("skill.storeNamePlaceholder", "Store name")}
          placeholder={t("skill.storeNamePlaceholder", "Store name")}
          className="px-3 py-2 text-sm bg-accent/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
        />
        <input
          type="text"
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          aria-label={
            sourceType === "local-dir"
              ? t("skill.storePathPlaceholder", "Local directory path")
              : t("skill.storeUrlPlaceholder", "Store URL / manifest URL")
          }
          placeholder={
            sourceType === "local-dir"
              ? t("skill.storePathPlaceholder", "Local directory path")
              : t("skill.storeUrlPlaceholder", "Store URL / manifest URL")
          }
          className="px-3 py-2 text-sm bg-accent/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
        />
        <button
          type="button"
          disabled={!canAddSource}
          onClick={() => {
            if (!canAddSource) {
              return;
            }
            handleAddSource();
          }}
          className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50"
        >
          {t("common.add", "Add")}
        </button>
      </div>

      {sourceType === "git-repo" && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="space-y-2">
            <input
              type="text"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              aria-label={t(
                "skill.storeBranchPlaceholder",
                "Branch (optional, default branch if empty)",
              )}
              placeholder={t(
                "skill.storeBranchPlaceholder",
                "Branch (optional, default branch if empty)",
              )}
              className="w-full px-3 py-2 text-sm bg-accent/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
            {isLoadingBranches ? (
              <div className="text-[11px] text-muted-foreground">
                {t("skill.loadingBranches", "Loading branches...")}
              </div>
            ) : null}
            {!isLoadingBranches && filteredBranches.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border bg-background/90 p-2">
                <div className="px-1 text-[11px] font-medium text-muted-foreground">
                  {t("skill.branchSuggestions", "Suggested branches")}
                </div>
                <div className="max-h-40 overflow-y-auto">
                {filteredBranches.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setBranch(item)}
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    <span>{item}</span>
                  </button>
                ))}
                </div>
              </div>
            ) : null}
            {!isLoadingBranches && branchError ? (
              <div className="text-[11px] text-muted-foreground">
                {t(
                  "skill.branchListFallbackHint",
                  "Could not load remote branches. You can still type one manually.",
                )}
              </div>
            ) : null}
          </div>
          <input
            type="text"
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
            aria-label={t(
              "skill.storeDirectoryPlaceholder",
              "Directory (optional, e.g. skills/.curated)",
            )}
            placeholder={t(
              "skill.storeDirectoryPlaceholder",
              "Directory (optional, e.g. skills/.curated)",
            )}
            className="px-3 py-2 text-sm bg-accent/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground leading-6">
        <div className="font-medium text-foreground mb-1">
          {t("skill.storeExamples", "Examples")}
        </div>
        {sourceType === "marketplace-json" && (
          <>
            <div>
              {t("skill.storeExampleMarketplace", "Marketplace JSON example")}
            </div>
            <div className="mt-1 font-mono break-all text-[11px]">
              https://raw.githubusercontent.com/docker/claude-code-plugin-manager/main/marketplace.json
            </div>
          </>
        )}
        {sourceType === "git-repo" && (
          <>
            <div>{t("skill.storeExampleGit", "Git repository example")}</div>
            <div className="mt-1 font-mono break-all text-[11px]">
              https://github.com/anthropics/skills
            </div>
            <div className="mt-1 font-mono break-all text-[11px]">
              {t("skill.branchLabel", "Branch")}: main | {t("skill.directoryLabel", "Directory")}: skills/.curated
            </div>
            <div className="mt-1 font-mono break-all text-[11px]">
              ~/Projects/my-skill-repo
            </div>
          </>
        )}
        {sourceType === "local-dir" && (
          <>
            <div>{t("skill.storeExampleLocal", "Local directory example")}</div>
            <div className="mt-1 font-mono break-all text-[11px]">
              ~/Documents/my-skills
            </div>
          </>
        )}
      </div>
    </div>
  );
}
