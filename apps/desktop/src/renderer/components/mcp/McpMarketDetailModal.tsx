import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpenIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  ServerIcon,
  XIcon,
} from "lucide-react";
import type { McpMarketTemplate } from "@prompthub/shared/types/mcp";
import { copyTextToClipboard } from "../../utils/clipboard";
import { getMcpTemplateSourceLabel } from "./mcp-market-labels";

interface McpMarketDetailModalProps {
  isInstalled: boolean;
  template: McpMarketTemplate;
  onClose: () => void;
  onInstall: (template: McpMarketTemplate | string) => Promise<void>;
}

function buildTemplateConfig(template: McpMarketTemplate): string {
  const config =
    template.transport === "stdio"
      ? {
          command: template.command ?? "",
          args: template.args ?? [],
          cwd: template.cwd || undefined,
          env: template.env,
        }
      : {
          type: template.transport,
          url: template.url ?? "",
          headers: template.headers,
        };

  return JSON.stringify(
    {
      mcpServers: {
        [template.name]: Object.fromEntries(
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

function formatInstallCommand(template: McpMarketTemplate): string {
  if (template.transport !== "stdio") {
    return template.url ?? "";
  }

  return [template.command, ...(template.args ?? [])].filter(Boolean).join(" ");
}

function getInstallLabel(
  template: McpMarketTemplate,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (template.transport !== "stdio") {
    return t("mcp.remoteEndpoint", "Remote endpoint");
  }

  return t("mcp.installCommand", "Install command");
}

function getEnvDescription(
  name: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const normalized = name.toUpperCase();
  const descriptions: Record<string, string> = {
    GITHUB_PERSONAL_ACCESS_TOKEN: t(
      "mcp.envDescriptions.githubPat",
      "GitHub Personal Access Token used to read repositories, issues, pull requests, and code search results.",
    ),
    SLACK_BOT_TOKEN: t(
      "mcp.envDescriptions.slackBotToken",
      "Slack bot token used to access workspace channels and messages.",
    ),
    SLACK_TEAM_ID: t(
      "mcp.envDescriptions.slackTeamId",
      "Slack workspace/team ID that scopes which workspace the MCP server connects to.",
    ),
    AMAP_MAPS_API_KEY: t(
      "mcp.envDescriptions.amapKey",
      "AMap/Gaode API key used for maps, routes, location, and geocoding tools.",
    ),
    BRAVE_API_KEY: t(
      "mcp.envDescriptions.braveKey",
      "Brave Search API key used for web and local search requests.",
    ),
    GOOGLE_MAPS_API_KEY: t(
      "mcp.envDescriptions.googleMapsKey",
      "Google Maps API key used for geocoding, place search, and directions.",
    ),
    FIRECRAWL_API_KEY: t(
      "mcp.envDescriptions.firecrawlKey",
      "Firecrawl API key used for web scraping and page extraction.",
    ),
    MYSQL_HOST: t(
      "mcp.envDescriptions.mysqlHost",
      "MySQL server host address.",
    ),
    MYSQL_PORT: t("mcp.envDescriptions.mysqlPort", "MySQL server port."),
    MYSQL_USER: t(
      "mcp.envDescriptions.mysqlUser",
      "MySQL username used by the MCP server.",
    ),
    MYSQL_PASSWORD: t(
      "mcp.envDescriptions.mysqlPassword",
      "MySQL password used by the MCP server.",
    ),
    MYSQL_DATABASE: t(
      "mcp.envDescriptions.mysqlDatabase",
      "Default MySQL database to query.",
    ),
  };

  return (
    descriptions[normalized] ??
    t(
      "mcp.envDescriptions.generic",
      "{{name}} value required by this MCP server.",
      { name },
    )
  );
}

function getPlaceholderDescriptions(
  values: string[],
  t: ReturnType<typeof useTranslation>["t"],
): Array<{ name: string; description: string }> {
  return values
    .filter((value) => /^<[^>]+>$/.test(value))
    .map((value) => ({
      name: value,
      description: t(
        "mcp.placeholderValueHint",
        "Replace {{name}} with a real value before installing or running this MCP server.",
        { name: value },
      ),
    }));
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/20 px-3 py-2">
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words font-mono text-xs text-foreground">
        {value}
      </div>
    </div>
  );
}

/**
 * MCP Store detail modal. Mirrors the Skill Store interaction: clicking a
 * store card opens details first, while install is an explicit action.
 */
export function McpMarketDetailModal({
  isInstalled,
  template,
  onClose,
  onInstall,
}: McpMarketDetailModalProps) {
  const { t } = useTranslation();
  const [isInstalling, setIsInstalling] = useState(false);
  const [copyStatus, setCopyStatus] = useState(false);
  const configContent = useMemo(
    () => buildTemplateConfig(template),
    [template],
  );
  const installCommand = useMemo(
    () => formatInstallCommand(template),
    [template],
  );
  const installLabel = getInstallLabel(template, t);
  const envKeys = Object.keys(template.env ?? {}).join("\n");
  const headerKeys = Object.keys(template.headers ?? {}).join("\n");
  const requiredEnvEntries = useMemo(
    () =>
      Object.keys(template.env ?? {}).map((name) => ({
        name,
        description: getEnvDescription(name, t),
      })),
    [t, template.env],
  );
  const placeholderEntries = useMemo(
    () =>
      getPlaceholderDescriptions(
        [
          ...(template.args ?? []),
          template.url ?? "",
          ...Object.values(template.headers ?? {}),
        ],
        t,
      ),
    [t, template.args, template.headers, template.url],
  );
  const hasConfigRequirements =
    requiredEnvEntries.length > 0 || placeholderEntries.length > 0;

  const handleInstall = async () => {
    if (isInstalled || isInstalling) {
      return;
    }

    setIsInstalling(true);
    try {
      await onInstall(template);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopy = async () => {
    await copyTextToClipboard(configContent);
    setCopyStatus(true);
    window.setTimeout(() => setCopyStatus(false), 1600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label={template.displayName}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[min(820px,calc(100vh-4rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ServerIcon className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-bold text-foreground">
                  {template.displayName}
                </h2>
                {isInstalled ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                    <CheckIcon className="h-3 w-3" aria-hidden="true" />
                    {t("common.installed", "Installed")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {template.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  {template.transport}
                </span>
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={t("common.close", "Close")}
            title={t("common.close", "Close")}
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div data-testid="mcp-market-detail-content" className="space-y-5">
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                <BookOpenIcon className="h-4 w-4" aria-hidden="true" />
                {t("mcp.overview", "Overview")}
              </h3>
              <div className="rounded-2xl border border-border app-wallpaper-surface p-4">
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {t("mcp.whatItDoes", "What it does")}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-foreground/85">
                      {template.description}
                    </p>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {t("mcp.useCases", "Use cases")}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {template.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  {installCommand ? (
                    <div>
                      <div className="text-[11px] font-medium text-muted-foreground">
                        {installLabel}
                      </div>
                      <div className="mt-1 break-words rounded-xl bg-muted/50 px-3 py-2 font-mono text-xs text-foreground">
                        {installCommand}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {t(
                          "mcp.installExplanation",
                          "PromptHub imports this template into My MCP, then distributes the generated MCP JSON/TOML to selected agent platforms.",
                        )}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                <KeyRoundIcon className="h-4 w-4" aria-hidden="true" />
                {t("mcp.configuration", "Configuration")}
              </h3>
              <div className="rounded-2xl border border-border app-wallpaper-surface p-4">
                {hasConfigRequirements ? (
                  <div className="space-y-4">
                    {requiredEnvEntries.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium text-muted-foreground">
                          {t(
                            "mcp.requiredVariables",
                            "Required environment variables",
                          )}
                        </div>
                        {requiredEnvEntries.map((entry) => (
                          <div
                            key={entry.name}
                            className="rounded-xl border border-border bg-background px-3 py-2"
                          >
                            <div className="font-mono text-xs font-semibold text-foreground">
                              {entry.name}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {entry.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {placeholderEntries.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium text-muted-foreground">
                          {t("mcp.requiredValues", "Required values")}
                        </div>
                        {placeholderEntries.map((entry) => (
                          <div
                            key={entry.name}
                            className="rounded-xl border border-border bg-background px-3 py-2"
                          >
                            <div className="font-mono text-xs font-semibold text-foreground">
                              {entry.name}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {entry.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t(
                      "mcp.noExtraConfigRequired",
                      "No API key or extra value is required for this template. Install it, then adjust paths or permissions if the target platform asks for them.",
                    )}
                  </p>
                )}
              </div>
            </section>

            <section
              data-testid="mcp-market-source-section"
              className="space-y-3"
            >
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {t("mcp.sourceMarket", "Imported from MCP Store")}
              </h3>
              <div className="rounded-2xl border border-border app-wallpaper-surface p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {template.homepage ? (
                    <a
                      href={template.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ExternalLinkIcon
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                      {t("mcp.officialLink", "Official link")}
                    </a>
                  ) : null}

                  {template.documentationUrl &&
                  template.documentationUrl !== template.homepage ? (
                    <a
                      href={template.documentationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ExternalLinkIcon
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                      {t("mcp.documentation", "Documentation")}
                    </a>
                  ) : null}

                  {template.repository &&
                  template.repository !== template.homepage ? (
                    <a
                      href={template.repository}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ExternalLinkIcon
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                      {t("mcp.repository", "Repository")}
                    </a>
                  ) : null}
                </div>
                <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2">
                  <div className="break-words font-mono text-xs text-foreground/80">
                    {template.source?.url || template.homepage || template.id}
                  </div>
                  {template.source?.trustLevel ? (
                    <div className="mt-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {template.source.trustLevel}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {t("skill.metadata", "Metadata")}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow
                  label={t("mcp.name", "Name")}
                  value={template.name}
                />
                <DetailRow
                  label={t("mcp.transport", "Transport")}
                  value={template.transport}
                />
                <DetailRow
                  label={t("mcp.source", "Source")}
                  value={getMcpTemplateSourceLabel(template, null, t)}
                />
                <DetailRow
                  label={t("mcp.runtime", "Runtime")}
                  value={template.runtime}
                />
                <DetailRow
                  label={t("mcp.packageOrScript", "Package / Script")}
                  value={template.packageName}
                />
                <DetailRow
                  label={t("mcp.command", "Command")}
                  value={
                    template.transport === "stdio"
                      ? [template.command, ...(template.args ?? [])]
                          .filter(Boolean)
                          .join(" ")
                      : template.url
                  }
                />
                <DetailRow
                  label={t("mcp.env", "Environment")}
                  value={envKeys}
                />
                <DetailRow
                  label={t("mcp.headers", "Headers")}
                  value={headerKeys}
                />
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {t("common.content", "Source")}
                </h3>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent/50 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  {copyStatus ? (
                    <CheckIcon
                      className="h-3.5 w-3.5 text-green-500"
                      aria-hidden="true"
                    />
                  ) : (
                    <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copyStatus
                    ? t("skill.copied", "Copied")
                    : t("mcp.copyConfig", "Copy config")}
                </button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border app-wallpaper-panel">
                <pre className="max-h-[44vh] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-5 text-foreground/80">
                  {configContent}
                </pre>
              </div>
            </section>
          </div>
        </div>

        <div
          data-testid="mcp-market-install-footer"
          className="shrink-0 border-t border-border p-5"
        >
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={isInstalled || isInstalling}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isInstalling ? (
              <Loader2Icon
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : isInstalled ? (
              <CheckIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
            )}
            {isInstalled
              ? t("common.installed", "Installed")
              : isInstalling
                ? t("skill.installing", "Installing...")
                : t("common.install", "Install")}
          </button>
        </div>
      </div>
    </div>
  );
}
