import { useEffect, useMemo, useState } from "react";
import { DatabaseIcon, FolderIcon, GlobeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import type { SkillStoreSource } from "@prompthub/shared/types";
import {
  isLikelyLocalSource,
  normalizeGitStoreSourceInput,
} from "../../services/skill-store-source";
import { isGitHubHost, parseGitRepo } from "@prompthub/shared/utils/git-repo";

type EditableSourceType = Extract<
  SkillStoreSource["type"],
  "marketplace-json" | "git-repo" | "local-dir"
>;

const TYPE_OPTIONS: Array<{
  value: EditableSourceType;
  icon: React.ReactNode;
}> = [
  { value: "marketplace-json", icon: <DatabaseIcon className="w-4 h-4" /> },
  { value: "git-repo", icon: <GlobeIcon className="w-4 h-4" /> },
  { value: "local-dir", icon: <FolderIcon className="w-4 h-4" /> },
];

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

interface SkillStoreSourceEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete: (sourceId: string) => void;
  onSave: (payload: {
    id: string;
    name: string;
    type: EditableSourceType;
    url: string;
    branch?: string;
    directory?: string;
  }) => void;
  onToggleEnabled: (sourceId: string) => void;
  onRefresh: (sourceId: string) => void;
  refreshingSourceId?: string | null;
  source: SkillStoreSource | null;
  typeOptions?: Array<{
    value: EditableSourceType;
    icon: React.ReactNode;
  }>;
}

export function SkillStoreSourceEditModal({
  isOpen,
  onClose,
  onDelete,
  onSave,
  onToggleEnabled,
  onRefresh,
  refreshingSourceId,
  source,
  typeOptions = TYPE_OPTIONS,
}: SkillStoreSourceEditModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<EditableSourceType>("marketplace-json");
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [directory, setDirectory] = useState("");
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !source) {
      return;
    }

    setName(source.name);
    setType(source.type as EditableSourceType);
    setUrl(source.url);
    setBranch(source.branch ?? "");
    setDirectory(source.directory ?? "");
  }, [isOpen, source]);

  useEffect(() => {
    let disposed = false;

    const loadBranches = async () => {
      if (!isOpen || type !== "git-repo") {
        setRemoteBranches([]);
        setBranchError(null);
        setIsLoadingBranches(false);
        return;
      }

      const trimmedUrl = url.trim();
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
  }, [isOpen, type, url]);

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

  if (!source) {
    return null;
  }

  const isRefreshingSource = refreshingSourceId === source.id;
  const canSave = Boolean(name.trim() && url.trim());

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={t("common.edit", "Edit")}
      subtitle={t(
        "skill.customStoresHint",
        "Add your own store endpoints here. A later step can connect remote manifests or registries.",
      )}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {typeOptions.map((option) => {
            const active = type === option.value;
            const label =
              option.value === "marketplace-json"
                ? t("skill.sourceTypeMarketplace", "Marketplace JSON")
                : option.value === "git-repo"
                  ? t("skill.sourceTypeGit", "Git Repository")
                  : t("skill.sourceTypeLocal", "Local Directory");

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setType(option.value)}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  active
                    ? "border-primary bg-primary/10 text-foreground shadow-[0_0_0_1px_rgba(96,165,250,0.2)]"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    aria-hidden="true"
                    className={active ? "text-primary" : "text-muted-foreground"}
                  >
                    {option.icon}
                  </span>
                  {label}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={t("skill.storeNamePlaceholder", "Store name")}
            placeholder={t("skill.storeNamePlaceholder", "Store name")}
            className="w-full rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
          <input
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-label={
              type === "local-dir"
                ? t("skill.storePathPlaceholder", "Local directory path")
                : t("skill.storeUrlPlaceholder", "Store URL / manifest URL")
            }
            placeholder={
              type === "local-dir"
                ? t("skill.storePathPlaceholder", "Local directory path")
                : t("skill.storeUrlPlaceholder", "Store URL / manifest URL")
            }
            className="w-full rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
          {type === "git-repo" && (
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
                  className="w-full rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
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
                className="w-full rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <div className="mr-auto flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => onToggleEnabled(source.id)}
            >
              {source.enabled
                ? t("common.disable", "Disable")
                : t("common.enable", "Enable")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={isRefreshingSource}
              onClick={() => onRefresh(source.id)}
            >
              <DatabaseIcon
                aria-hidden="true"
                className={`w-4 h-4 ${isRefreshingSource ? "animate-spin" : ""}`}
              />
              {t("common.refresh", "Refresh")}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={() => onDelete(source.id)}
            >
              {t("common.delete", "Delete")}
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) {
                return;
              }
              onSave({
                id: source.id,
                name,
                type,
                url,
                branch: branch.trim() || undefined,
                directory: directory.trim() || undefined,
              });
            }}
          >
            {t("common.save", "Save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
