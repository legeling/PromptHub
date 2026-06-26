import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock3Icon,
  FileTextIcon,
  HistoryIcon,
  Loader2Icon,
  RotateCcwIcon,
  TrashIcon,
} from "lucide-react";
import type {
  PluginFileSnapshot,
  PluginLibraryEntry,
  PluginVersion,
} from "@prompthub/shared/types/plugin";
import { usePluginStore } from "../../stores/plugin.store";
import { Modal } from "../ui";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";

interface PluginVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  plugin: PluginLibraryEntry;
}

const EMPTY_PLUGIN_VERSIONS: PluginVersion[] = [];

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function decodeSnapshotText(file: PluginFileSnapshot | null): string {
  if (!file?.contentBase64) return "";
  try {
    const binary = globalThis.atob(file.contentBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text) ? "" : text;
  } catch {
    return "";
  }
}

function sortSnapshotFiles(files: PluginFileSnapshot[]): PluginFileSnapshot[] {
  return [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

function VersionListItem({
  isSelected,
  onSelect,
  version,
}: {
  isSelected: boolean;
  onSelect: () => void;
  version: PluginVersion;
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
        isSelected
          ? "border-primary/40 bg-primary/10"
          : "border-border bg-background/70 hover:bg-accent/50"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          v{version.version}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(version.createdAt).toLocaleString()}
        </span>
      </div>
      {version.note ? (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {version.note}
        </p>
      ) : null}
    </button>
  );
}

export function PluginVersionHistoryModal({
  isOpen,
  onClose,
  plugin,
}: PluginVersionHistoryModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const versions = usePluginStore(
    (state) => state.versionsByPluginId[plugin.id] ?? EMPTY_PLUGIN_VERSIONS,
  );
  const loadPluginVersions = usePluginStore(
    (state) => state.loadPluginVersions,
  );
  const rollbackPluginVersion = usePluginStore(
    (state) => state.rollbackPluginVersion,
  );
  const deletePluginVersion = usePluginStore(
    (state) => state.deletePluginVersion,
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [versionToDelete, setVersionToDelete] = useState<PluginVersion | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextVersions = await loadPluginVersions(plugin.id);
      setSelectedVersionId((current) => current ?? nextVersions[0]?.id ?? null);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t("plugin.versionLoadFailed", "Failed to load Plugin versions"),
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  }, [loadPluginVersions, plugin.id, showToast, t]);

  useEffect(() => {
    if (!isOpen) return;
    void loadVersions();
  }, [isOpen, loadVersions]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  );
  const packageFiles = useMemo(
    () => sortSnapshotFiles(selectedVersion?.packageSnapshot?.files ?? []),
    [selectedVersion],
  );

  useEffect(() => {
    if (!selectedVersion) {
      setSelectedVersionId(versions[0]?.id ?? null);
    }
  }, [selectedVersion, versions]);

  useEffect(() => {
    if (
      selectedFilePath &&
      packageFiles.some((file) => file.relativePath === selectedFilePath)
    ) {
      return;
    }
    setSelectedFilePath(packageFiles[0]?.relativePath ?? null);
  }, [packageFiles, selectedFilePath]);

  const selectedFile =
    packageFiles.find((file) => file.relativePath === selectedFilePath) ?? null;
  const selectedFileContent = decodeSnapshotText(selectedFile);

  const handleRestore = async () => {
    if (!selectedVersion || isRestoring) return;
    setIsRestoring(true);
    try {
      const result = await rollbackPluginVersion(
        plugin.id,
        selectedVersion.version,
      );
      if (result) {
        showToast(
          t("plugin.restoreVersionSuccess", {
            defaultValue: "Restored Plugin to v{{version}}",
            version: selectedVersion.version,
          }),
          "success",
        );
      }
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t(
              "plugin.restoreVersionFailed",
              "Failed to restore Plugin version",
            ),
        "error",
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDelete = async () => {
    if (!versionToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deletePluginVersion(plugin.id, versionToDelete.id);
      showToast(t("plugin.deleteVersionSuccess", "Version deleted"), "success");
      setVersionToDelete(null);
      setSelectedVersionId((current) =>
        current === versionToDelete.id ? null : current,
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t("plugin.deleteVersionFailed", "Failed to delete Plugin version"),
        "error",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t("plugin.versionHistory", "Version History")}
        subtitle={plugin.displayName}
        size="full"
      >
        <div className="flex h-[min(72vh,760px)] min-h-0 gap-4">
          <aside className="flex w-80 shrink-0 flex-col rounded-2xl border border-border bg-background/60">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <HistoryIcon aria-hidden="true" className="h-4 w-4" />
                {t("plugin.versionTimeline", "Timeline")}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {isLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2Icon
                    aria-hidden="true"
                    className="h-5 w-5 animate-spin"
                  />
                </div>
              ) : versions.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  <HistoryIcon
                    aria-hidden="true"
                    className="mb-3 h-8 w-8 opacity-50"
                  />
                  <div className="font-medium text-foreground">
                    {t("plugin.versionsEmpty", "No version history yet")}
                  </div>
                  <p className="mt-2">
                    {t(
                      "plugin.versionsEmptyHint",
                      "Create a snapshot before updating or editing this Plugin.",
                    )}
                  </p>
                </div>
              ) : (
                versions.map((version) => (
                  <VersionListItem
                    key={version.id}
                    isSelected={version.id === selectedVersionId}
                    onSelect={() => setSelectedVersionId(version.id)}
                    version={version}
                  />
                ))
              )}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-border bg-background/60">
            <div className="shrink-0 border-b border-border px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    {selectedVersion ? (
                      <>v{selectedVersion.version}</>
                    ) : (
                      t("plugin.versionHistory", "Version History")
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {selectedVersion ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock3Icon aria-hidden="true" className="h-3 w-3" />
                        {new Date(selectedVersion.createdAt).toLocaleString()}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-muted px-2.5 py-1">
                      {t("plugin.versionPackageFilesCount", {
                        count: packageFiles.length,
                        defaultValue: "{{count}} package file(s)",
                      })}
                    </span>
                  </div>
                  {selectedVersion?.note ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {selectedVersion.note}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      selectedVersion && setVersionToDelete(selectedVersion)
                    }
                    disabled={!selectedVersion || isDeleting || isRestoring}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={t("plugin.deleteVersion", "Delete version")}
                    title={t("plugin.deleteVersion", "Delete version")}
                  >
                    <TrashIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRestore()}
                    disabled={!selectedVersion || isRestoring}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {isRestoring ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    ) : (
                      <RotateCcwIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                    {isRestoring
                      ? t("plugin.restoringVersion", "Restoring...")
                      : t("plugin.restoreVersion", "Restore")}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,300px)_1fr]">
              <div className="min-h-0 border-r border-border">
                <div className="border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("plugin.versionPackageFiles", "Package Files")}
                </div>
                <div className="min-h-0 max-h-full overflow-y-auto p-2">
                  {packageFiles.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {t(
                        "plugin.versionNoPackageSnapshot",
                        "No package snapshot for this version.",
                      )}
                    </div>
                  ) : (
                    packageFiles.map((file) => (
                      <button
                        key={file.relativePath}
                        type="button"
                        onClick={() => setSelectedFilePath(file.relativePath)}
                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                          file.relativePath === selectedFilePath
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        <FileTextIcon
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate font-mono">
                          {file.relativePath}
                        </span>
                        <span className="shrink-0 text-[11px] opacity-70">
                          {formatFileSize(file.size)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto p-4">
                {selectedFile ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate font-mono text-sm font-medium text-foreground">
                        {selectedFile.relativePath}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(selectedFile.size)}
                      </div>
                    </div>
                    {selectedFileContent ? (
                      <pre className="min-h-[360px] overflow-auto rounded-2xl border border-border bg-background p-4 text-xs leading-6 text-foreground whitespace-pre-wrap">
                        {selectedFileContent}
                      </pre>
                    ) : (
                      <div className="rounded-2xl border border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                        {t(
                          "plugin.versionBinaryFile",
                          "This file is empty or not readable as text.",
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {t(
                      "plugin.versionSelectFile",
                      "Select a package file to preview.",
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(versionToDelete)}
        onClose={() => {
          if (!isDeleting) setVersionToDelete(null);
        }}
        onConfirm={() => void handleDelete()}
        title={t("plugin.deleteVersionConfirmTitle", "Delete version snapshot")}
        message={t("plugin.deleteVersionConfirmMessage", {
          defaultValue:
            "Delete v{{version}}? This history entry cannot be recovered.",
          version: versionToDelete?.version ?? "",
        })}
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isDeleting}
      />
    </>
  );
}
