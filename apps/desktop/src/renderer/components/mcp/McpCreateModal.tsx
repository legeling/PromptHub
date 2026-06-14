import { useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
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
import { textInputClass } from "./mcp-form-utils";

type CreateMode = "source" | "manual";

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

export function McpCreateModal({
  onClose,
  onManualSave,
  onCreateFromSource,
}: McpCreateModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CreateMode>("source");
  const [sourceInput, setSourceInput] = useState("");
  const [sourceKind, setSourceKind] = useState<McpCreateSourceKind>("auto");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const createFromSource = async (
    input: string,
    kind: McpCreateSourceKind = sourceKind,
  ) => {
    const normalized = input.trim();
    if (!normalized || isLoading) {
      return;
    }
    setIsLoading(true);
    setError(null);
    setWarnings([]);
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
      setError(sourceError instanceof Error ? sourceError.message : String(sourceError));
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label={t("mcp.newServer", "New MCP")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t("common.close", "Close")}
        >
          <XIcon className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ServerIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {t("mcp.newServer", "New MCP")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "mcp.newServerHint",
                  "Add from a command, URL, config file, or local MCP source project.",
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 inline-flex rounded-lg border border-border bg-background p-1">
            {(["source", "manual"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={`h-8 rounded-md px-3 text-sm font-medium ${
                  mode === item
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item === "source"
                  ? t("mcp.addFromSource", "Add from source")
                  : t("mcp.manualSetup", "Manual setup")}
              </button>
            ))}
          </div>
        </div>

        {mode === "manual" ? (
          <div className="max-h-[min(760px,calc(100vh-10rem))] overflow-hidden">
            <McpServerForm
              selectedServer={null}
              distributedTargetCount={0}
              variant="modal"
              onSave={async (_serverId, draft) => onManualSave(draft)}
              onDelete={async () => undefined}
            />
          </div>
        ) : (
          <div className="max-h-[min(760px,calc(100vh-10rem))] overflow-y-auto p-5">
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
                  icon={<FileJsonIcon className="h-4 w-4" aria-hidden="true" />}
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

            <div className="mt-5 rounded-xl border border-border bg-background p-4">
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
                  <option value="auto">Auto</option>
                  <option value="command">Command</option>
                  <option value="url">URL</option>
                  <option value="path">Path</option>
                </select>
                <input
                  aria-label={t("mcp.sourceInput", "Command, URL, or path")}
                  className={`${textInputClass()} font-mono text-xs`}
                  value={sourceInput}
                  onChange={(event) => setSourceInput(event.target.value)}
                  placeholder='npx -y @modelcontextprotocol/server-memory'
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
        )}
      </div>
    </div>
  );
}
