import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
  ServerIcon,
  StickyNoteIcon,
  UploadIcon,
  SaveIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import type {
  McpEnvImportResult,
  McpHealthCheckResult,
  McpServerConfig,
  McpServerDraft,
} from "@prompthub/shared/types/mcp";
import { inferMcpEnvRequirements } from "@prompthub/shared/utils/mcp-config";
import { copyTextToClipboard } from "../../utils/clipboard";
import {
  DETAIL_PAGE_CONTENT_CLASS,
  DETAIL_PAGE_PREVIEW_GRID_CLASS,
} from "../layout/detailPageLayout";
import { Textarea } from "../ui";
import { McpServerForm } from "./McpServerForm";

type McpDetailTab = "preview" | "code";

interface McpFullDetailPageProps {
  distributedTargetCount: number;
  platformPanel: ReactNode;
  server: McpServerConfig;
  healthCheck?: McpHealthCheckResult;
  onBack: () => void;
  onCheckServer: (serverId: string) => Promise<McpHealthCheckResult>;
  onDelete: (serverId: string) => Promise<void>;
  onImportEnv: (
    serverId: string,
    envFilePath: string,
    selectedKeys?: string[],
  ) => Promise<McpEnvImportResult>;
  onSave: (serverId: string | null, draft: McpServerDraft) => Promise<void>;
}

function formatCommand(server: McpServerConfig): string {
  if (server.transport === "stdio") {
    return [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
  }
  return server.url ?? "";
}

function getExecutableName(command?: string): string {
  return command?.split(/[\\/]/).pop()?.trim() ?? "";
}

function looksLikePackageOrScript(value: string): boolean {
  if (!value || value.startsWith("-")) {
    return false;
  }

  return (
    value.startsWith("@") ||
    /\.(cjs|js|mjs|ts)$/i.test(value) ||
    /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9._-]+)?$/i.test(value)
  );
}

function inferPackageOrScript(server: McpServerConfig): string | undefined {
  if (server.transport !== "stdio") {
    return server.url;
  }

  return (server.args ?? []).find(looksLikePackageOrScript);
}

function getRuntimeDetails(server: McpServerConfig): {
  runtime?: string;
  packageOrScript?: string;
} {
  if (server.transport === "stdio") {
    return {
      runtime: getExecutableName(server.command),
      packageOrScript: inferPackageOrScript(server),
    };
  }

  return {
    runtime: server.transport.toUpperCase(),
    packageOrScript: server.url,
  };
}

function formatRecord(record?: Record<string, string>): string {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString();
}

function getSourceSummary(
  server: McpServerConfig,
  t: ReturnType<typeof useTranslation>["t"],
): { label: string; value: string; url?: string } {
  if (server.source.type === "market") {
    return {
      label: t("mcp.sourceMarket", "Imported from MCP Store"),
      value: server.source.label || server.source.id || server.displayName,
      url: server.source.url,
    };
  }
  if (server.source.type === "import") {
    const isAgentImport = Boolean(server.source.id || server.source.label);
    const labelKey = isAgentImport
      ? "mcp.sourceAgentImport"
      : "mcp.sourceImport";
    const fallback = isAgentImport
      ? "Imported from Agent"
      : "Imported from config file";
    return {
      label: t(labelKey, fallback),
      value: server.source.label || server.source.id || server.name,
      url: server.source.url,
    };
  }
  return {
    label: t("mcp.sourceManual", "Manually created"),
    value: server.source.label || server.name,
    url: server.source.url,
  };
}

function buildMcpConfigContent(server: McpServerConfig): string {
  const config =
    server.transport === "stdio"
      ? {
          command: server.command ?? "",
          args: server.args ?? [],
          cwd: server.cwd || undefined,
          env: server.env,
        }
      : {
          type: server.transport,
          url: server.url ?? "",
          headers: server.headers,
        };

  return JSON.stringify(
    {
      mcpServers: {
        [server.name]: Object.fromEntries(
          Object.entries(config).filter(
            ([, value]) =>
              value !== undefined &&
              (!Array.isArray(value) || value.length > 0) &&
              (typeof value !== "object" ||
                value === null ||
                Object.keys(value).length > 0),
          ),
        ),
      },
    },
    null,
    2,
  );
}

function MetadataCell({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-xs">{value}</div>
    </div>
  );
}

function DetailItem({
  label,
  multiline = false,
  value,
}: {
  label: string;
  multiline?: boolean;
  value?: string;
}) {
  if (!value) {
    return null;
  }
  return (
    <div className="min-w-0 rounded-2xl border border-border app-wallpaper-surface p-4">
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xs text-foreground ${
          multiline
            ? "max-h-32 overflow-auto whitespace-pre-wrap break-words leading-5"
            : "truncate"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function getHealthBadgeClass(status?: McpHealthCheckResult["status"]): string {
  if (status === "ok") {
    return "bg-emerald-500/10 text-emerald-600";
  }
  if (status === "warning") {
    return "bg-amber-500/10 text-amber-600";
  }
  if (status === "error") {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-muted text-muted-foreground";
}

/**
 * Full-width MCP detail page that mirrors SkillFullDetailPage's visual shell:
 * sticky header, icon/action strip, tab row, preview/source areas, and the
 * platform integration sidebar inside the preview tab.
 */
export function McpFullDetailPage({
  distributedTargetCount,
  healthCheck,
  platformPanel,
  server,
  onBack,
  onCheckServer,
  onDelete,
  onImportEnv,
  onSave,
}: McpFullDetailPageProps) {
  const { t } = useTranslation();
  const envInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<McpDetailTab>("preview");
  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isImportingEnv, setIsImportingEnv] = useState(false);
  const [isSavingEnv, setIsSavingEnv] = useState(false);
  const [envDraft, setEnvDraft] = useState<Record<string, string>>({});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(server.notes ?? "");
  const sourceSummary = useMemo(() => getSourceSummary(server, t), [server, t]);
  const configContent = useMemo(() => buildMcpConfigContent(server), [server]);
  const runtimeDetails = useMemo(() => getRuntimeDetails(server), [server]);
  const envRequirements = useMemo(
    () => inferMcpEnvRequirements(server),
    [server],
  );
  const envIssueByField = useMemo(
    () =>
      new Map(
        (healthCheck?.issues ?? [])
          .filter(
            (issue) =>
              (issue.code === "MISSING_ENV" ||
                issue.code === "INVALID_ENV_VALUE") &&
              Boolean(issue.field),
          )
          .map((issue) => [issue.field as string, issue]),
      ),
    [healthCheck?.issues],
  );
  const displayName = server.displayName || server.name;

  useEffect(() => {
    setEnvDraft(
      Object.fromEntries(
        envRequirements.map((requirement) => [
          requirement.name,
          server.env?.[requirement.name] ?? "",
        ]),
      ),
    );
  }, [envRequirements, server.env]);

  useEffect(() => {
    setDraftNotes(server.notes ?? "");
    setIsEditingNotes(false);
  }, [server.id, server.notes]);

  const handleCopy = async (text: string, key: string) => {
    await copyTextToClipboard(text);
    setCopyStatus((current) => ({ ...current, [key]: true }));
    window.setTimeout(() => {
      setCopyStatus((current) => ({ ...current, [key]: false }));
    }, 1600);
  };

  const handleEditSave = async (
    serverId: string | null,
    draft: McpServerDraft,
  ) => {
    await onSave(serverId, draft);
    setIsEditModalOpen(false);
  };

  const handleHealthCheck = async () => {
    setIsCheckingHealth(true);
    try {
      await onCheckServer(server.id);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleEnvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    const envFilePath = file ? window.electron?.getPathForFile?.(file) : "";
    if (!envFilePath) {
      return;
    }
    setIsImportingEnv(true);
    try {
      await onImportEnv(
        server.id,
        envFilePath,
        envRequirements.map((item) => item.name),
      );
      await onCheckServer(server.id);
    } finally {
      setIsImportingEnv(false);
    }
  };

  const handleSaveEnvValues = async () => {
    const nextEnv = {
      ...(server.env ?? {}),
      ...Object.fromEntries(
        Object.entries(envDraft)
          .map(([key, value]) => [key.trim(), value] as const)
          .filter(([key]) => key.length > 0),
      ),
    };
    setIsSavingEnv(true);
    try {
      await onSave(server.id, { env: nextEnv });
      await onCheckServer(server.id);
    } finally {
      setIsSavingEnv(false);
    }
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      await onSave(server.id, { notes: draftNotes });
      setIsEditingNotes(false);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleCancelNotes = () => {
    setDraftNotes(server.notes ?? "");
    setIsEditingNotes(false);
  };

  return (
    <div
      data-testid="mcp-full-detail-page"
      className="flex-1 flex flex-col h-full app-wallpaper-section overflow-hidden animate-in fade-in slide-in-from-right-4 duration-smooth"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 app-wallpaper-panel-strong z-10">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all active:scale-press-in"
            aria-label={t("common.back", "Back")}
            title={t("common.back", "Back")}
          >
            <ArrowLeftIcon className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ServerIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-foreground leading-tight">
              {displayName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                <GlobeIcon className="w-3.5 h-3.5" aria-hidden="true" />
                {sourceSummary.label}
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {server.transport}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  distributedTargetCount > 0
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {distributedTargetCount > 0
                  ? t("mcp.distributedTargets", {
                      count: distributedTargetCount,
                      defaultValue: `${distributedTargetCount} target(s) distributed`,
                    })
                  : t("mcp.notDistributed", "Not distributed")}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getHealthBadgeClass(
                  healthCheck?.status,
                )}`}
              >
                {healthCheck?.status
                  ? t(`mcp.health.${healthCheck.status}`, healthCheck.status)
                  : t("mcp.health.unchecked", "Unchecked")}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sourceSummary.url ? (
            <a
              href={sourceSummary.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              title={t("mcp.openSource", "Open source")}
            >
              <ExternalLinkIcon className="h-4 w-4" aria-hidden="true" />
              {t("common.open", "Open")}
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all active:scale-press-in"
            aria-label={t("mcp.editServer", "Edit MCP")}
            title={t("mcp.editServer", "Edit MCP")}
          >
            <PencilIcon className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void onDelete(server.id)}
            className="p-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-all active:scale-press-in"
            aria-label={t("common.delete", "Delete")}
            title={t("common.delete", "Delete")}
          >
            <TrashIcon className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex items-center px-6 gap-6 border-b border-border bg-accent/20">
        {[
          {
            icon: <BookOpenIcon className="w-4 h-4" aria-hidden="true" />,
            label: t("common.preview", "Preview"),
            value: "preview" as const,
          },
          {
            icon: <CodeIcon className="w-4 h-4" aria-hidden="true" />,
            label: t("common.content", "Source / Content"),
            value: "code" as const,
          },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`py-3 text-sm font-semibold relative transition-colors ${
              activeTab === tab.value
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              {tab.icon}
              {tab.label}
            </div>
            {activeTab === tab.value ? (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className={DETAIL_PAGE_CONTENT_CLASS}>
          {activeTab === "preview" ? (
            <div
              data-testid="mcp-detail-preview-layout"
              data-layout="split-sidebar"
              className={DETAIL_PAGE_PREVIEW_GRID_CLASS}
            >
              <div className="flex min-h-0 flex-col space-y-6">
                <section className="shrink-0 space-y-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                    {t("mcp.detail", "MCP Detail")}
                  </h3>
                  <div className="app-wallpaper-panel rounded-2xl border border-border p-5 space-y-4">
                    <p className="text-sm text-foreground/90 leading-relaxed">
                      {server.description ||
                        t(
                          "mcp.selectServerHint",
                          "Select or save an MCP first",
                        )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs bg-accent px-2 py-1 rounded-full font-medium text-foreground/80">
                        {server.name}
                      </span>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                        {server.transport}
                      </span>
                      {server.enabled ? (
                        <span className="text-xs bg-emerald-500/10 text-emerald-600 px-2 py-1 rounded-full font-medium">
                          {t("common.enabled", "Enabled")}
                        </span>
                      ) : (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full font-medium">
                          {t("common.disabled", "Disabled")}
                        </span>
                      )}
                      {(server.tags ?? []).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-accent px-2 py-1 rounded-full font-medium text-foreground/80"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="shrink-0 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                      {t("mcp.healthCheck", "Health check")}
                    </h3>
                    <button
                      type="button"
                      onClick={() => void handleHealthCheck()}
                      disabled={isCheckingHealth}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent/50 px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      <RefreshCwIcon
                        className={`h-3.5 w-3.5 ${
                          isCheckingHealth ? "animate-spin" : ""
                        }`}
                        aria-hidden="true"
                      />
                      {t("common.refresh", "Refresh")}
                    </button>
                  </div>
                  <div className="app-wallpaper-panel rounded-2xl border border-border p-4">
                    {healthCheck?.issues.length ? (
                      <div className="space-y-2">
                        {healthCheck.issues.map((issue) => (
                          <div
                            key={`${issue.code}-${issue.field ?? issue.message}`}
                            className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
                          >
                            <AlertCircleIcon
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
                              aria-hidden="true"
                            />
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {healthCheck
                          ? t("mcp.healthOk", "No static issues detected.")
                          : t(
                              "mcp.healthUncheckedHint",
                              "Run a static check for command, URL, env, placeholders, and working directory.",
                            )}
                      </p>
                    )}
                  </div>
                </section>

                {envRequirements.length > 0 ? (
                  <section className="shrink-0 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                        {t(
                          "mcp.requiredVariables",
                          "Required environment variables",
                        )}
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => envInputRef.current?.click()}
                          disabled={isImportingEnv || isSavingEnv}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
                        >
                          <UploadIcon
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {isImportingEnv
                            ? t("mcp.importingDotEnv", "Importing...")
                            : t("mcp.importDotEnv", "Import .env")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveEnvValues()}
                          disabled={isImportingEnv || isSavingEnv}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                        >
                          <SaveIcon
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {isSavingEnv
                            ? t("mcp.savingEnvValues", "Saving...")
                            : t("mcp.saveEnvValues", "Save env")}
                        </button>
                        <input
                          ref={envInputRef}
                          type="file"
                          accept=".env,text/plain"
                          className="hidden"
                          onChange={(event) => void handleEnvFileChange(event)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {envRequirements.map((requirement) => {
                        const value = envDraft[requirement.name] ?? "";
                        const missing =
                          requirement.required &&
                          (!value || /^<[^>]+>$/.test(value.trim()));
                        const envIssue = envIssueByField.get(requirement.name);
                        const invalid =
                          !missing && envIssue?.code === "INVALID_ENV_VALUE";
                        return (
                          <div
                            key={requirement.name}
                            className="rounded-xl border border-border app-wallpaper-surface px-3 py-2"
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <label
                                htmlFor={`mcp-env-${server.id}-${requirement.name}`}
                                className="font-mono text-xs font-semibold"
                              >
                                {requirement.name}
                              </label>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  missing
                                    ? "bg-destructive/10 text-destructive"
                                    : invalid
                                      ? "bg-amber-500/10 text-amber-600"
                                      : "bg-emerald-500/10 text-emerald-600"
                                }`}
                              >
                                {missing
                                  ? t("mcp.missing", "Missing")
                                  : invalid
                                    ? t("mcp.invalidEnvValue", "Check format")
                                    : t("mcp.filled", "Filled")}
                              </span>
                            </div>
                            <input
                              id={`mcp-env-${server.id}-${requirement.name}`}
                              aria-label={`${requirement.name} ${t(
                                "mcp.envValue",
                                "env value",
                              )}`}
                              value={value}
                              onChange={(event) =>
                                setEnvDraft((current) => ({
                                  ...current,
                                  [requirement.name]: event.target.value,
                                }))
                              }
                              className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                              placeholder={t("mcp.envValue", "env value")}
                            />
                            {invalid && envIssue?.message ? (
                              <p className="mt-2 text-xs leading-relaxed text-amber-600">
                                {envIssue.message}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                      {t("mcp.sourceAndDetails", "Source and details")}
                    </h3>
                    <button
                      type="button"
                      onClick={() => void handleCopy(configContent, "preview")}
                      className="p-1 px-3 bg-accent/50 hover:bg-accent rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                    >
                      {copyStatus.preview ? (
                        <CheckIcon
                          className="w-3.5 h-3.5 text-green-500"
                          aria-hidden="true"
                        />
                      ) : (
                        <CopyIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {copyStatus.preview
                        ? t("skill.copied", "Copied")
                        : t("skill.copyMd", "Copy")}
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <DetailItem
                      label={t("mcp.serverId", "Server ID")}
                      value={server.id}
                    />
                    <DetailItem
                      label={t("mcp.sourceType", "Source type")}
                      value={server.source.type}
                    />
                    <DetailItem
                      label={t("mcp.runtime", "Runtime")}
                      value={runtimeDetails.runtime}
                    />
                    <DetailItem
                      label={t("mcp.packageOrScript", "Package / Script")}
                      value={runtimeDetails.packageOrScript}
                    />
                    <DetailItem
                      label={t("mcp.command", "Command")}
                      multiline
                      value={formatCommand(server)}
                    />
                    <DetailItem
                      label={t("mcp.cwd", "Working Directory")}
                      value={server.cwd}
                    />
                    <DetailItem
                      label={t("mcp.env", "Environment")}
                      multiline
                      value={formatRecord(server.env)}
                    />
                    <DetailItem
                      label={t("mcp.headers", "Headers")}
                      multiline
                      value={formatRecord(server.headers)}
                    />
                    <DetailItem
                      label={t("mcp.createdAt", "Created")}
                      value={formatDate(server.createdAt)}
                    />
                    <DetailItem
                      label={t("mcp.updatedAt", "Updated")}
                      value={formatDate(server.updatedAt)}
                    />
                  </div>
                </section>
              </div>
              <div className="space-y-6">
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <StickyNoteIcon className="h-4 w-4 shrink-0 text-primary" />
                      <h3 className="truncate text-xs font-semibold uppercase tracking-[0.3em]">
                        {t("mcp.userNotes", "Personal Notes")}
                      </h3>
                    </div>
                    {isEditingNotes ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleSaveNotes()}
                          disabled={isSavingNotes}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                          aria-label={t("common.save", "Save")}
                          title={t("common.save", "Save")}
                        >
                          {isSavingNotes ? (
                            <Loader2Icon
                              aria-hidden="true"
                              className="h-4 w-4 animate-spin"
                            />
                          ) : (
                            <SaveIcon aria-hidden="true" className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelNotes}
                          disabled={isSavingNotes}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                          aria-label={t("common.cancel", "Cancel")}
                          title={t("common.cancel", "Cancel")}
                        >
                          <XIcon aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingNotes(true)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                        aria-label={t("mcp.editUserNotes", "Edit notes")}
                        title={t("mcp.editUserNotes", "Edit notes")}
                      >
                        <PencilIcon aria-hidden="true" className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div
                    data-testid="mcp-user-notes-card"
                    className="app-wallpaper-panel rounded-2xl border border-border p-4"
                  >
                    {isEditingNotes ? (
                      <Textarea
                        aria-label={t("mcp.userNotes", "Personal Notes")}
                        value={draftNotes}
                        onChange={(event) => setDraftNotes(event.target.value)}
                        placeholder={t(
                          "mcp.userNotesPlaceholder",
                          "Add private notes about how you use this MCP...",
                        )}
                        rows={5}
                        disabled={isSavingNotes}
                        className="min-h-[120px] resize-y"
                      />
                    ) : server.notes?.trim() ? (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">
                        {server.notes}
                      </p>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t("mcp.userNotesEmpty", "No personal notes yet.")}
                      </p>
                    )}
                  </div>
                </section>
                {platformPanel}
              </div>
            </div>
          ) : (
            <div className="w-full space-y-6">
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
                  {t("skill.metadata", "Metadata")}
                </h3>
                <div className="rounded-2xl border border-border app-wallpaper-surface p-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <MetadataCell
                      label={t("mcp.serverId", "Server ID")}
                      value={server.id}
                    />
                    <MetadataCell
                      label={t("mcp.transport", "Transport")}
                      value={server.transport}
                    />
                    <MetadataCell
                      label={t("mcp.runtime", "Runtime")}
                      value={runtimeDetails.runtime}
                    />
                    <MetadataCell
                      label={t("mcp.packageOrScript", "Package / Script")}
                      value={runtimeDetails.packageOrScript}
                    />
                    <MetadataCell
                      label={t("mcp.createdAt", "Created")}
                      value={formatDate(server.createdAt)}
                    />
                    <MetadataCell
                      label={t("mcp.updatedAt", "Updated")}
                      value={formatDate(server.updatedAt)}
                    />
                  </div>
                </div>
              </section>
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
                    {t("common.content", "Source / Content")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => void handleCopy(configContent, "raw")}
                    className="p-1 px-3 bg-accent/50 hover:bg-accent rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                  >
                    {copyStatus.raw ? (
                      <CheckIcon
                        className="w-3.5 h-3.5 text-green-500"
                        aria-hidden="true"
                      />
                    ) : (
                      <CopyIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {copyStatus.raw
                      ? t("skill.copied", "Copied")
                      : t("skill.copyMd", "Copy")}
                  </button>
                </div>
                <div className="app-wallpaper-panel border border-border rounded-2xl overflow-hidden">
                  <pre className="p-5 text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap break-words max-h-[68vh] overflow-y-auto">
                    {configContent}
                  </pre>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {isEditModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label={t("mcp.editServer", "Edit MCP")}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsEditModalOpen(false);
            }
          }}
        >
          <div className="relative w-full max-w-3xl">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={t("common.close", "Close")}
            >
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <McpServerForm
              selectedServer={server}
              distributedTargetCount={distributedTargetCount}
              variant="modal"
              onSave={handleEditSave}
              onDelete={onDelete}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
