import { useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  EditIcon,
  FileJsonIcon,
  FolderOpenIcon,
  LinkIcon,
  ServerIcon,
  TerminalIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import type {
  McpCreateFromSourceRequest,
  McpCreateFromSourceResult,
  McpCreateSourceKind,
  McpServerDraft,
} from "@prompthub/shared/types/mcp";
import { McpServerForm } from "./McpServerForm";
import { textAreaClass, textInputClass } from "./mcp-form-utils";

type CreateMode = "choose" | "source" | "manual" | "raw";

interface McpCreateModalProps {
  onClose: () => void;
  onManualSave: (draft: McpServerDraft) => Promise<void>;
  onCreateFromSource: (
    request: McpCreateFromSourceRequest,
  ) => Promise<McpCreateFromSourceResult>;
}

function SourceAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent"
    >
      {icon}
      {label}
    </button>
  );
}

function MethodCard({
  description,
  icon,
  onClick,
  title,
  variant = "default",
}: {
  description: string;
  icon: ReactNode;
  onClick: () => void;
  title: string;
  variant?: "default" | "primary";
}) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors group ${
        isPrimary
          ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
          : "border-border bg-accent/50 hover:bg-accent"
      }`}
    >
      <div
        className={`rounded-lg p-3 transition-colors ${
          isPrimary
            ? "bg-primary text-primary-foreground"
            : "bg-background text-foreground group-hover:bg-primary/10"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

export function McpCreateModal({
  onClose,
  onManualSave,
  onCreateFromSource,
}: McpCreateModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CreateMode>("choose");
  const [sourceInput, setSourceInput] = useState("");
  const [rawConfig, setRawConfig] = useState("");
  const [sourceKind, setSourceKind] = useState<McpCreateSourceKind>("auto");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const resetStatus = () => {
    setError(null);
    setWarnings([]);
  };

  const goBack = () => {
    resetStatus();
    setMode("choose");
  };

  const createFromSource = async (
    input: string,
    kind: McpCreateSourceKind = sourceKind,
  ) => {
    const normalized = input.trim();
    if (!normalized || isLoading) {
      return;
    }
    setIsLoading(true);
    resetStatus();
    try {
      const result = await onCreateFromSource({ input: normalized, kind });
      setWarnings(result.warnings);
      if (result.imported.length > 0) {
        onClose();
        return;
      }
      setError(
        result.skipped.length > 0
          ? t("mcp.sourceSkipped", {
              names: result.skipped.join(", "),
              defaultValue: `Already exists: ${result.skipped.join(", ")}`,
            })
          : t("mcp.sourceImportEmpty", "No MCP servers were imported."),
      );
    } catch (sourceError) {
      setError(
        sourceError instanceof Error
          ? sourceError.message
          : String(sourceError),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    const filePath = file ? window.electron?.getPathForFile?.(file) : "";
    if (!filePath) {
      setError(
        t(
          "mcp.dropPathUnavailable",
          "PromptHub could not read a filesystem path from the dropped item.",
        ),
      );
      return;
    }
    void createFromSource(filePath, "path");
  };

  const chooseConfigFile = async () => {
    const filePath = await window.electron?.selectMcpConfigFile?.();
    if (filePath) {
      await createFromSource(filePath, "path");
    }
  };

  const chooseSourceFolder = async () => {
    const folderPath = await window.electron?.selectMcpSourceFolder?.();
    if (folderPath) {
      await createFromSource(folderPath, "path");
    }
  };

  if (mode === "manual") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
        <div
          role="presentation"
          aria-hidden="true"
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("mcp.newServer", "New MCP")}
          className="relative w-full max-w-2xl"
        >
          <McpServerForm
            selectedServer={null}
            distributedTargetCount={0}
            variant="modal"
            onBack={goBack}
            onClose={onClose}
            onSave={async (_serverId, draft) => onManualSave(draft)}
            onDelete={async () => undefined}
          />
        </div>
      </div>
    );
  }

  const title =
    mode === "source"
      ? t("mcp.addFromSource", "Add from source")
      : mode === "raw"
        ? t("mcp.pasteConfig", "Paste config")
        : t("mcp.newServer", "New MCP");
  const hint =
    mode === "source"
      ? t(
          "mcp.addFromSourceHint",
          "Paste a command or URL, choose a config file, or select a local MCP source folder.",
        )
      : mode === "raw"
        ? t(
            "mcp.pasteConfigHint",
            "Paste MCP JSON or Codex TOML and import the server entries into My MCP.",
          )
        : t(
            "mcp.chooseCreateMethodHint",
            "Choose how you want to add a new MCP server.",
          );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div
        role="presentation"
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative flex w-full flex-col overflow-hidden rounded-2xl border border-border app-wallpaper-panel-strong shadow-2xl animate-in fade-in zoom-in-95 duration-base ${
          mode === "choose" ? "max-w-lg" : "max-w-3xl"
        } max-h-[90vh]`}
        role="dialog"
        aria-modal="true"
        aria-label={t("mcp.newServer", "New MCP")}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {mode !== "choose" ? (
              <button
                type="button"
                onClick={goBack}
                className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={t("common.back", "Back")}
                title={t("common.back", "Back")}
              >
                <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : null}
            <ServerIcon
              className="h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">
                {title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("common.close", "Close")}
            title={t("common.close", "Close")}
          >
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {mode === "choose" ? (
            <div data-testid="mcp-create-method-chooser" className="space-y-3">
              <MethodCard
                variant="primary"
                icon={<TerminalIcon className="h-6 w-6" aria-hidden="true" />}
                title={t("mcp.addFromSource", "Add from source")}
                description={t(
                  "mcp.addFromSourceDesc",
                  "Use a command, URL, config file, or local source folder.",
                )}
                onClick={() => {
                  resetStatus();
                  setMode("source");
                }}
              />
              <MethodCard
                icon={<FileJsonIcon className="h-6 w-6" aria-hidden="true" />}
                title={t("mcp.pasteConfig", "Paste config")}
                description={t(
                  "mcp.pasteConfigDesc",
                  "Paste MCP JSON or Codex TOML and import server entries.",
                )}
                onClick={() => {
                  resetStatus();
                  setMode("raw");
                }}
              />
              <MethodCard
                icon={<EditIcon className="h-6 w-6" aria-hidden="true" />}
                title={t("mcp.manualSetup", "Manual setup")}
                description={t(
                  "mcp.manualSetupDesc",
                  "Create an MCP server from empty editable fields.",
                )}
                onClick={() => {
                  resetStatus();
                  setMode("manual");
                }}
              />
            </div>
          ) : null}

          {mode === "source" ? (
            <div className="space-y-5">
              <div
                data-testid="mcp-source-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 py-8 text-center"
              >
                <UploadIcon className="mb-3 h-9 w-9 text-muted-foreground" />
                <div className="text-sm font-medium text-foreground">
                  {t(
                    "mcp.dropSource",
                    "Drop an MCP config file or local source folder here",
                  )}
                </div>
                <p className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
                  {t(
                    "mcp.dropSourceHint",
                    "Config files are imported directly. Source folders are inspected for package.json, pyproject.toml, or Dockerfile and converted into an editable MCP command.",
                  )}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <SourceAction
                    icon={
                      <FileJsonIcon className="h-4 w-4" aria-hidden="true" />
                    }
                    label={t("mcp.chooseConfigFile", "Choose config file")}
                    onClick={() => void chooseConfigFile()}
                  />
                  <SourceAction
                    icon={
                      <FolderOpenIcon className="h-4 w-4" aria-hidden="true" />
                    }
                    label={t("mcp.chooseSourceFolder", "Choose source folder")}
                    onClick={() => void chooseSourceFolder()}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <label className="block text-sm font-medium text-foreground">
                  {t("mcp.sourceInput", "Command, URL, or path")}
                </label>
                <div className="mt-2 grid gap-2 md:grid-cols-[10rem_minmax(0,1fr)_auto]">
                  <select
                    className={textInputClass()}
                    value={sourceKind}
                    onChange={(event) =>
                      setSourceKind(event.target.value as McpCreateSourceKind)
                    }
                  >
                    <option value="auto">
                      {t("mcp.sourceKindAuto", "Auto")}
                    </option>
                    <option value="command">
                      {t("mcp.sourceKindCommand", "Command")}
                    </option>
                    <option value="url">{t("mcp.sourceKindUrl", "URL")}</option>
                    <option value="path">
                      {t("mcp.sourceKindPath", "Path")}
                    </option>
                  </select>
                  <input
                    aria-label={t("mcp.sourceInput", "Command, URL, or path")}
                    className={`${textInputClass()} font-mono text-xs`}
                    value={sourceInput}
                    onChange={(event) => setSourceInput(event.target.value)}
                    placeholder="npx -y @modelcontextprotocol/server-memory"
                  />
                  <button
                    type="button"
                    disabled={!sourceInput.trim() || isLoading}
                    onClick={() => void createFromSource(sourceInput)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {sourceKind === "url" ? (
                      <LinkIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <TerminalIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                    {isLoading
                      ? t("common.loading", "Loading...")
                      : t("mcp.addSource", "Add source")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {mode === "raw" ? (
            <div className="rounded-xl border border-border bg-background p-4">
              <label className="block text-sm font-medium text-foreground">
                {t("mcp.rawConfigInput", "MCP config JSON or TOML")}
              </label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(
                  "mcp.rawConfigInputHint",
                  "Supports JSON with mcpServers/servers/mcp keys and Codex TOML [mcp_servers.<name>] sections.",
                )}
              </p>
              <textarea
                aria-label={t("mcp.rawConfigInput", "MCP config JSON or TOML")}
                className={`${textAreaClass()} mt-3 min-h-64 font-mono text-xs`}
                value={rawConfig}
                onChange={(event) => setRawConfig(event.target.value)}
                placeholder={`{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}`}
              />
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  disabled={!rawConfig.trim() || isLoading}
                  onClick={() => void createFromSource(rawConfig, "config")}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <FileJsonIcon className="h-4 w-4" aria-hidden="true" />
                  {isLoading
                    ? t("common.loading", "Loading...")
                    : t("mcp.importConfig", "Import config")}
                </button>
              </div>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
              {warnings.join(" ")}
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
