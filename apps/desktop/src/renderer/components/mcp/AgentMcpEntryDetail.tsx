import { ArrowLeftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  McpServerConfig,
  McpTargetKind,
} from "@prompthub/shared/types/mcp";
import {
  getMcpTargetEntryObject,
  getMcpServersJsonKey,
} from "@prompthub/shared/utils/mcp-config";
import { AgentMcpDetailActions } from "./AgentMcpDetailActions";
import { AgentMcpPreviewSidebar } from "./AgentMcpPreviewSidebar";

type AgentMcpSourceIconVariant = "platform" | "project";

interface AgentMcpEntryDetailProps {
  iconVariant?: AgentMcpSourceIconVariant;
  isImporting?: boolean;
  isManaged: boolean;
  isUninstalling?: boolean;
  openConfigLabel?: string;
  platformId: string;
  platformName: string;
  removeEntryLabel?: string;
  sectionTitle?: string;
  server: McpServerConfig;
  target: McpTargetKind;
  sourcePath: string;
  onBack: () => void;
  onImport?: () => void | Promise<void>;
  onOpenAgentConfig: () => void | Promise<void>;
  onOpenManagedMcp?: () => void | Promise<void>;
  onUninstall: () => void | Promise<void>;
}

function formatRecord(record?: Record<string, string>): string {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function buildAgentServerConfig(
  server: McpServerConfig,
  target: McpTargetKind,
): string {
  return JSON.stringify(
    {
      [getMcpServersJsonKey(target)]: {
        [server.name]: getMcpTargetEntryObject(target, server, {
          redactValues: true,
        }),
      },
    },
    null,
    2,
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
  if (!value) return null;
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

function ManagementStatus({ isManaged }: { isManaged: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
        isManaged
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      }`}
    >
      {isManaged
        ? t("mcp.managedByPromptHub", "Managed in PromptHub")
        : t("mcp.notInLibrary", "Not in PromptHub library")}
    </span>
  );
}

function DetailHeader(props: AgentMcpEntryDetailProps) {
  const { t } = useTranslation();
  const displayName = props.server.displayName || props.server.name;
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border app-wallpaper-panel-strong px-6 py-4">
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          onClick={props.onBack}
          className="-ml-2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t("common.back", "Back")}
          title={t("common.back", "Back")}
        >
          <ArrowLeftIcon aria-hidden="true" className="h-5 w-5" />
        </button>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-semibold text-primary">
          {displayName.trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-bold text-foreground">
              {displayName}
            </h2>
            <ManagementStatus isManaged={props.isManaged} />
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {props.platformName} · {props.sourcePath}
          </p>
        </div>
      </div>
      <div
        data-testid="mcp-agent-detail-actions"
        className="flex shrink-0 items-center gap-2"
      >
        <AgentMcpDetailActions
          isImporting={props.isImporting}
          isManaged={props.isManaged}
          isUninstalling={props.isUninstalling}
          openConfigLabel={props.openConfigLabel}
          removeEntryLabel={props.removeEntryLabel}
          onImport={props.onImport}
          onOpenAgentConfig={props.onOpenAgentConfig}
          onOpenManagedMcp={props.onOpenManagedMcp}
          onUninstall={props.onUninstall}
          t={t}
        />
      </div>
    </div>
  );
}

function SourceDetails({ server }: { server: McpServerConfig }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-border app-wallpaper-panel-strong p-5">
      <div className="mb-4 text-sm font-semibold text-foreground">
        {t("mcp.sourceAndDetails", "Source and details")}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <DetailItem label={t("mcp.name", "Name")} value={server.name} />
        <DetailItem
          label={t("mcp.transport", "Transport")}
          value={server.transport}
        />
        <DetailItem
          label={t("mcp.command", "Command")}
          value={server.command}
        />
        <DetailItem label={t("mcp.url", "URL")} value={server.url} />
        <DetailItem
          label={t("mcp.cwd", "Working Directory")}
          value={server.cwd}
        />
        <DetailItem
          label={t("mcp.args", "Args")}
          multiline
          value={server.args?.join("\n")}
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
      </div>
    </section>
  );
}

function ConfigPreview({ content }: { content: string }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-border app-wallpaper-panel-strong p-5">
      <div className="mb-4 text-sm font-semibold text-foreground">
        {t("mcp.copyConfig", "Copy config")}
      </div>
      <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-card p-4 text-xs leading-5 text-foreground">
        {content}
      </pre>
    </section>
  );
}

function DetailContent(props: AgentMcpEntryDetailProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div
        data-testid="mcp-agent-entry-detail-layout"
        data-layout="split-sidebar"
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="space-y-4">
          <SourceDetails server={props.server} />
          <ConfigPreview
            content={buildAgentServerConfig(props.server, props.target)}
          />
        </div>
        <aside className="space-y-4">
          <AgentMcpPreviewSidebar
            iconVariant={props.iconVariant ?? "platform"}
            isImporting={props.isImporting ?? false}
            isManaged={props.isManaged}
            openConfigLabel={props.openConfigLabel}
            onImport={props.onImport}
            onOpenAgentConfig={props.onOpenAgentConfig}
            onOpenManagedMcp={props.onOpenManagedMcp}
            platformId={props.platformId}
            platformName={props.platformName}
            sectionTitle={props.sectionTitle}
            sourcePath={props.sourcePath}
            t={t}
          />
        </aside>
      </div>
    </div>
  );
}

export function AgentMcpEntryDetail(props: AgentMcpEntryDetailProps) {
  return (
    <div
      data-testid="mcp-agent-entry-detail"
      className="flex h-full min-h-0 flex-1 flex-col app-wallpaper-section animate-in fade-in slide-in-from-right-4 duration-smooth"
    >
      <DetailHeader {...props} />
      <DetailContent {...props} />
    </div>
  );
}
