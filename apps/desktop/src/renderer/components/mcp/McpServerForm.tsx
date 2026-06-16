import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  PackageIcon,
  SaveIcon,
  ServerIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import type {
  McpServerConfig,
  McpServerDraft,
  McpTransport,
} from "@prompthub/shared/types/mcp";
import {
  formToDraft,
  serverToForm,
  textAreaClass,
  textInputClass,
  type McpFormState,
} from "./mcp-form-utils";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1.5 text-sm">
      <span className="block truncate font-medium text-foreground">
        {label}
      </span>
      {children}
    </label>
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
    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xs text-foreground ${
          multiline
            ? "max-h-24 overflow-auto whitespace-pre-wrap break-all leading-5"
            : "truncate"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function formatCommand(server: McpServerConfig): string {
  if (server.transport === "stdio") {
    return [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
  }
  return server.url ?? "";
}

function formatRecord(record?: Record<string, string>): string {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
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

interface McpServerFormProps {
  selectedServer: McpServerConfig | null;
  distributedTargetCount: number;
  platformPanel?: ReactNode;
  variant?: "detail" | "modal";
  onBack?: () => void;
  onClose?: () => void;
  onSave: (serverId: string | null, draft: McpServerDraft) => Promise<void>;
  onDelete: (serverId: string) => Promise<void>;
}

/**
 * MCP detail editor following the Skill detail layout: header with actions,
 * source summary card, form fields, and the platform integration panel on
 * the right column.
 * 跟随 Skill 详情布局的 MCP 编辑器：头部操作区、来源摘要卡片、表单字段，
 * 右列为平台集成面板。
 */
export function McpServerForm({
  selectedServer,
  distributedTargetCount,
  platformPanel,
  variant = "detail",
  onBack,
  onClose,
  onSave,
  onDelete,
}: McpServerFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<McpFormState>(() =>
    serverToForm(selectedServer),
  );

  useEffect(() => {
    setForm(serverToForm(selectedServer));
  }, [selectedServer]);

  const update = (patch: Partial<McpFormState>) =>
    setForm((current) => ({ ...current, ...patch }));
  const sourceSummary = selectedServer
    ? getSourceSummary(selectedServer, t)
    : null;
  const hasPlatformPanel = Boolean(platformPanel);
  const bodyClassName = hasPlatformPanel
    ? variant === "detail"
      ? "grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_24rem]"
      : "grid flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
    : variant === "detail"
      ? "flex-1 overflow-y-auto p-6"
      : "flex-1 overflow-y-auto p-4";
  const fieldGridClassName = "grid h-fit min-w-0 gap-4 sm:grid-cols-2";
  const isDetailPage = variant === "detail";

  return (
    <form
      data-testid="mcp-server-form"
      className={
        isDetailPage
          ? "flex-1 flex flex-col h-full app-wallpaper-section overflow-hidden animate-in fade-in slide-in-from-right-4 duration-smooth"
          : "flex min-h-0 flex-col rounded-xl border border-border bg-card max-h-[min(760px,calc(100vh-8rem))] shadow-2xl"
      }
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(selectedServer?.id ?? null, formToDraft(form));
      }}
    >
      <div
        className={
          isDetailPage
            ? "flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 app-wallpaper-panel-strong z-10"
            : "flex items-center justify-between border-b border-border px-5 py-4"
        }
      >
        <div className="flex min-w-0 items-center gap-4">
          {isDetailPage || onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all active:scale-press-in"
              aria-label={t("common.back", "Back")}
              title={t("common.back", "Back")}
            >
              <ArrowLeftIcon className="w-5 h-5" aria-hidden="true" />
            </button>
          ) : null}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ServerIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div
              className={
                isDetailPage
                  ? "truncate text-xl font-bold text-foreground leading-tight"
                  : "flex items-center gap-2 text-sm font-semibold"
              }
            >
              {selectedServer
                ? selectedServer.displayName || t("mcp.detail", "MCP Detail")
                : t("mcp.newServer", "New MCP")}
            </div>
            {selectedServer ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{selectedServer.transport}</span>
                <span>·</span>
                <span>
                  {distributedTargetCount > 0
                    ? t("mcp.distributedTargets", {
                        count: distributedTargetCount,
                        defaultValue: `${distributedTargetCount} target(s) distributed`,
                      })
                    : t("mcp.notDistributed", "Not distributed")}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedServer ? (
            <button
              type="button"
              onClick={() => void onDelete(selectedServer.id)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <TrashIcon className="h-4 w-4" aria-hidden="true" />
              {t("common.delete", "Delete")}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={t("common.close", "Close")}
              title={t("common.close", "Close")}
            >
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="submit"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <SaveIcon className="h-4 w-4" aria-hidden="true" />
            {t("common.save", "Save")}
          </button>
        </div>
      </div>

      <div className={bodyClassName}>
        <div className={fieldGridClassName}>
          {selectedServer && sourceSummary ? (
            <section className="sm:col-span-2 rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <PackageIcon
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                    {t("mcp.sourceAndDetails", "Source and details")}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {sourceSummary.label}
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {sourceSummary.value}
                  </div>
                </div>
                {sourceSummary.url ? (
                  <a
                    href={sourceSummary.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-accent"
                  >
                    <ExternalLinkIcon className="h-4 w-4" aria-hidden="true" />
                    {t("mcp.openSource", "Open source")}
                  </a>
                ) : null}
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <DetailItem
                  label={t("mcp.serverId", "Server ID")}
                  value={selectedServer.id}
                />
                <DetailItem
                  label={t("mcp.sourceType", "Source type")}
                  value={selectedServer.source.type}
                />
                <DetailItem
                  label={t("mcp.transport", "Transport")}
                  value={selectedServer.transport}
                />
                <DetailItem
                  label={
                    selectedServer.transport === "stdio"
                      ? t("mcp.command", "Command")
                      : t("mcp.url", "URL")
                  }
                  multiline
                  value={formatCommand(selectedServer)}
                />
                <DetailItem
                  label={t("mcp.cwd", "Working Directory")}
                  value={selectedServer.cwd}
                />
                <DetailItem
                  label={t("mcp.env", "Environment")}
                  multiline
                  value={formatRecord(selectedServer.env)}
                />
                <DetailItem
                  label={t("mcp.headers", "Headers")}
                  multiline
                  value={formatRecord(selectedServer.headers)}
                />
                <DetailItem
                  label={t("mcp.createdAt", "Created")}
                  value={new Date(selectedServer.createdAt).toLocaleString()}
                />
                <DetailItem
                  label={t("mcp.updatedAt", "Updated")}
                  value={new Date(selectedServer.updatedAt).toLocaleString()}
                />
              </div>
            </section>
          ) : null}
          <Field label={t("mcp.name", "Name")}>
            <input
              className={textInputClass()}
              value={form.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </Field>
          <Field label={t("mcp.displayName", "Display Name")}>
            <input
              className={textInputClass()}
              value={form.displayName}
              onChange={(event) => update({ displayName: event.target.value })}
            />
          </Field>
          <Field label={t("mcp.transport", "Transport")}>
            <select
              className={textInputClass()}
              value={form.transport}
              onChange={(event) =>
                update({ transport: event.target.value as McpTransport })
              }
            >
              <option value="stdio">stdio</option>
              <option value="streamable-http">streamable-http</option>
              <option value="sse">sse</option>
            </select>
          </Field>
          <Field label={t("common.enabled", "Enabled")}>
            <button
              type="button"
              onClick={() => update({ enabled: !form.enabled })}
              className={`inline-flex h-9 w-full items-center justify-center rounded-md border text-sm font-medium ${
                form.enabled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              {form.enabled
                ? t("common.enabled", "Enabled")
                : t("common.disabled", "Disabled")}
            </button>
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("common.description", "Description")}>
              <textarea
                className={textAreaClass()}
                value={form.description}
                onChange={(event) =>
                  update({ description: event.target.value })
                }
              />
            </Field>
          </div>
          {form.transport === "stdio" ? (
            <>
              <Field label={t("mcp.command", "Command")}>
                <input
                  className={textInputClass()}
                  value={form.command}
                  onChange={(event) => update({ command: event.target.value })}
                />
              </Field>
              <Field label={t("mcp.cwd", "Working Directory")}>
                <input
                  className={textInputClass()}
                  value={form.cwd}
                  onChange={(event) => update({ cwd: event.target.value })}
                />
              </Field>
              <Field label={t("mcp.args", "Args")}>
                <textarea
                  className={textAreaClass()}
                  value={form.args}
                  onChange={(event) => update({ args: event.target.value })}
                />
              </Field>
              <Field label={t("mcp.env", "Environment")}>
                <textarea
                  className={textAreaClass()}
                  value={form.env}
                  onChange={(event) => update({ env: event.target.value })}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={t("mcp.url", "URL")}>
                <input
                  className={textInputClass()}
                  value={form.url}
                  onChange={(event) => update({ url: event.target.value })}
                />
              </Field>
              <Field label={t("mcp.headers", "Headers")}>
                <textarea
                  className={textAreaClass()}
                  value={form.headers}
                  onChange={(event) => update({ headers: event.target.value })}
                />
              </Field>
            </>
          )}
          <div className="sm:col-span-2">
            <Field label={t("common.tags", "Tags")}>
              <input
                className={textInputClass()}
                value={form.tags}
                onChange={(event) => update({ tags: event.target.value })}
              />
            </Field>
          </div>
        </div>
        {hasPlatformPanel ? (
          <div className="min-w-0">{platformPanel}</div>
        ) : null}
      </div>
    </form>
  );
}
