import { useWorkspaceDraft } from "../../hooks/useWorkspaceDraft";
import {
  useState,
  useLayoutEffect,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type WheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { isWebRuntime } from "../../runtime";
import { useTranslation } from "react-i18next";
import {
  XIcon,
  FileTextIcon,
  FileIcon,
  SaveIcon,
  Loader2Icon,
  PencilIcon,
  RotateCcwIcon,
} from "lucide-react";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { useToast } from "../ui/Toast";
import type {
  SkillLocalFileEntry,
  SkillLocalFileTreeEntry,
} from "@prompthub/shared/types";
import { getSkillFileErrorFeedback } from "../../services/skill-file-error";
import { scheduleAllSaveSync } from "../../services/webdav-save-sync";
import {
  SkillCodeEditor,
  getSkillCodeEditorLanguageName,
} from "./SkillCodeEditor";
import { getSkillFileIconUrl } from "./skill-file-icons";
import {
  ResourceImageFullscreenPreview,
  ResourcePreview,
} from "./SkillFileResourcePreview";
import {
  SkillFileContextMenu,
  type SkillFileContextMenuAction,
} from "./SkillFileContextMenu";
import { SkillFileMutationDialogs } from "./SkillFileMutationDialogs";
import { SkillFileTree } from "./SkillFileTree";
import {
  MAX_RESOURCE_ZOOM,
  MIN_RESOURCE_ZOOM,
  RESOURCE_ZOOM_STEP,
  buildTree,
  clampResourceZoom,
  formatFileSize,
  isEditableFile,
  isHiddenSkillRepoEntry,
  isMarkdownFile,
  normalizeFileTreeEntry,
  normalizeSkillRelativePath,
  type ContextMenuState,
  type FileEntry,
  type FileTreeEntry,
} from "./skill-file-editor-utils";
import "./SkillFileEditor.css";

// ─── Types ──────────────────────────────────────────────

interface SkillFileEditorSurfaceLabels {
  noFiles?: string;
  modalTitle?: string;
}

export interface SkillFileEditorSource {
  key: string;
  listFiles: () => Promise<SkillLocalFileTreeEntry[]>;
  readFile: (relativePath: string) => Promise<SkillLocalFileEntry | null>;
  writeFile?: (
    relativePath: string,
    content: string,
    expectedRevision?: string,
  ) => Promise<SkillLocalFileEntry | void>;
  openInFileManager?: () => void | Promise<void>;
}

interface SkillFileEditorProps {
  skillId: string;
  currentVersion?: number;
  localPath?: string;
  fileSource?: SkillFileEditorSource;
  /** Human-readable skill name shown in the modal header. Falls back to a
   *  truncated skillId when omitted. */
  skillName?: string;
  isOpen: boolean;
  onClose?: () => void;
  onSave?: () => void;
  /** "modal" (default for backward compat) renders in a portal overlay;
   *  "inline" renders as a plain panel – no portal, no backdrop, no header. */
  mode?: "modal" | "inline";
  onUnsavedChange?: (hasUnsaved: boolean) => void;
  readOnly?: boolean;
  /** Limits the visible tree to exact relative file paths. Parent folders are
   * synthesized by the tree builder, so unrelated files never reach the UI. */
  visibleFilePaths?: string[];
  /** Selects a preferred file after the source is loaded. */
  initialFilePath?: string;
  /** Shows declared files even before they exist so an explicit save can
   * create the native configuration file. */
  includeMissingVisibleFiles?: boolean;
  /** Content-only mode keeps Edit/Save while hiding create, rename and delete. */
  allowStructuralMutations?: boolean;
  /** Hides host-native file manager affordances for browser runtimes. */
  showFileManagerActions?: boolean;
  surfaceLabels?: SkillFileEditorSurfaceLabels;
}

// ─── Helpers ────────────────────────────────────────────

function getFileIcon(name: string, isDirectory: boolean, isOpen: boolean) {
  return (
    <img
      src={getSkillFileIconUrl(name, isDirectory, isOpen)}
      alt=""
      aria-hidden="true"
      className="skill-file-editor__tree-item-icon"
      draggable={false}
    />
  );
}

function selectVisibleFileEntries(
  result: SkillLocalFileTreeEntry[],
  visiblePaths: string[],
  hasAllowlist: boolean,
  includeMissing: boolean,
): FileTreeEntry[] {
  const publicEntries = result
    .map(normalizeFileTreeEntry)
    .filter((entry) => !isHiddenSkillRepoEntry(entry.path));
  if (!hasAllowlist) return publicEntries;
  const allowlisted = publicEntries.filter(
    (entry) => !entry.isDirectory && visiblePaths.includes(entry.path),
  );
  if (!includeMissing) return allowlisted;
  const missing = visiblePaths
    .filter((filePath) => !allowlisted.some((entry) => entry.path === filePath))
    .map((filePath) => ({
      path: filePath,
      isDirectory: false,
      size: 0,
    }));
  return [...allowlisted, ...missing];
}

function getInitialSelectedFile(
  entries: FileTreeEntry[],
  preferredPath?: string,
): string | null {
  return (
    entries.find((entry) => !entry.isDirectory && entry.path === preferredPath)
      ?.path ||
    entries.find(
      (entry) => !entry.isDirectory && entry.path.toLowerCase() === "skill.md",
    )?.path ||
    entries.find((entry) => !entry.isDirectory)?.path ||
    null
  );
}

function retainLoadedFiles(
  entries: FileTreeEntry[],
  loaded: Record<string, FileEntry>,
): Record<string, FileEntry> {
  return Object.fromEntries(
    entries
      .filter((entry) => !entry.isDirectory && loaded[entry.path])
      .map((entry) => [entry.path, loaded[entry.path]]),
  );
}

// ─── Main Component ─────────────────────────────────────

export function SkillFileEditor({
  skillId,
  currentVersion,
  localPath,
  fileSource,
  skillName,
  isOpen,
  onClose,
  onSave,
  mode = "modal",
  onUnsavedChange,
  readOnly = false,
  visibleFilePaths,
  initialFilePath,
  includeMissingVisibleFiles = false,
  allowStructuralMutations = !isWebRuntime(),
  showFileManagerActions = !isWebRuntime(),
  surfaceLabels,
}: SkillFileEditorProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const isInline = mode === "inline";
  const noFilesLabel =
    surfaceLabels?.noFiles ??
    t("skill.noFiles", "No local files for this skill");
  const modalTitle =
    surfaceLabels?.modalTitle ?? t("skill.fileEditor", "File Editor");

  // State
  const [files, setFiles] = useState<FileTreeEntry[]>([]);
  const [loadedFiles, setLoadedFiles] = useState<Record<string, FileEntry>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFilePath, setLoadingFilePath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [modifiedFiles, setModifiedFiles] = useState<Record<string, string>>(
    {},
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Dialog states
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [deleteDialogFile, setDeleteDialogFile] = useState<string | null>(null);
  const [renameDialogPath, setRenameDialogPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [createParentPath, setCreateParentPath] = useState<string | null>(null);
  const [dialogInput, setDialogInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUnsavedDialogOpen, setIsUnsavedDialogOpen] = useState(false);
  const [isEditingFileContent, setIsEditingFileContent] = useState(false);
  const [resourceZoom, setResourceZoom] = useState(1);
  const [isResourceFullscreenOpen, setIsResourceFullscreenOpen] =
    useState(false);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<
    (() => void) | null
  >(null);

  const activeSourceKeyRef = useRef<string | null>(null);
  const loadedVersionRef = useRef(currentVersion);
  const inventorySourceKeyRef = useRef<string | null>(null);
  const sourceGenerationRef = useRef(0);
  const selectedFileRef = useRef(selectedFile);
  useLayoutEffect(() => { selectedFileRef.current = selectedFile; }, [selectedFile]);
  const isPathMode = Boolean(localPath || fileSource);
  const normalizedVisibleFilePaths = useMemo(
    () =>
      Array.from(
        new Set(
          (visibleFilePaths ?? [])
            .map(normalizeSkillRelativePath)
            .filter(Boolean),
        ),
      ),
    [visibleFilePaths],
  );
  const normalizedInitialFilePath = initialFilePath
    ? normalizeSkillRelativePath(initialFilePath)
    : undefined;
  const hasVisibleFileAllowlist = visibleFilePaths !== undefined;
  const canMutateStructure = !readOnly && allowStructuralMutations;
  const sourceKey = `${fileSource?.key ?? (localPath ? `path:${localPath}` : `skill:${skillId}`)}:visible:${normalizedVisibleFilePaths.join("|")}:initial:${normalizedInitialFilePath ?? ""}`;
  const isCurrentSourceRequest = useCallback(
    (expectedSourceKey: string | null, expectedGeneration: number) =>
      activeSourceKeyRef.current === expectedSourceKey &&
      sourceGenerationRef.current === expectedGeneration,
    [],
  );

  const listFiles = useCallback(async () => {
    if (fileSource) {
      return fileSource.listFiles();
    }
    if (localPath) {
      return window.api.skill.listLocalFilesByPath(localPath);
    }
    return window.api.skill.listLocalFiles(skillId);
  }, [fileSource, localPath, skillId]);

  const readFile = useCallback(
    async (relativePath: string) => {
      if (fileSource) {
        return fileSource.readFile(relativePath);
      }
      if (localPath) {
        return window.api.skill.readLocalFileByPath(localPath, relativePath);
      }
      return window.api.skill.readLocalFile(skillId, relativePath);
    },
    [fileSource, localPath, skillId],
  );

  const writeFile = useCallback(
    async (
      relativePath: string,
      content: string,
      expectedRevision?: string,
    ) => {
      if (readOnly) {
        return;
      }
      if (fileSource) {
        if (!fileSource.writeFile) {
          throw new Error("This file source is read only");
        }
        return fileSource.writeFile(relativePath, content, expectedRevision);
      }
      if (localPath) {
        return window.api.skill.writeLocalFileByPath(
          localPath,
          relativePath,
          content,
        );
      }
      return window.api.skill.writeLocalFile(skillId, relativePath, content);
    },
    [fileSource, localPath, readOnly, skillId],
  );

  const createDir = useCallback(
    async (relativePath: string) => {
      if (readOnly) {
        return;
      }
      if (localPath) {
        return window.api.skill.createLocalDirByPath(localPath, relativePath);
      }
      return window.api.skill.createLocalDir(skillId, relativePath);
    },
    [localPath, readOnly, skillId],
  );

  const renamePath = useCallback(
    async (oldRelativePath: string, newRelativePath: string) => {
      if (readOnly) {
        return;
      }
      if (localPath) {
        return window.api.skill.renameLocalPathByPath(
          localPath,
          oldRelativePath,
          newRelativePath,
        );
      }
      return window.api.skill.renameLocalPath(
        skillId,
        oldRelativePath,
        newRelativePath,
      );
    },
    [localPath, readOnly, skillId],
  );

  const deleteFile = useCallback(
    async (relativePath: string) => {
      if (readOnly) {
        return;
      }
      if (localPath) {
        return window.api.skill.deleteLocalFileByPath(localPath, relativePath);
      }
      return window.api.skill.deleteLocalFile(skillId, relativePath);
    },
    [localPath, readOnly, skillId],
  );

  // Load files
  const loadFiles = useCallback(
    async (
      expectedSourceKey = activeSourceKeyRef.current,
      expectedGeneration = sourceGenerationRef.current,
    ) => {
      setIsLoading(true);
      try {
        const result = await listFiles();
        if (!isCurrentSourceRequest(expectedSourceKey, expectedGeneration))
          return;
        const visibleEntries = selectVisibleFileEntries(
          result,
          normalizedVisibleFilePaths,
          hasVisibleFileAllowlist,
          includeMissingVisibleFiles,
        );
        inventorySourceKeyRef.current = expectedSourceKey;
        setFiles(visibleEntries);
        const firstFile = getInitialSelectedFile(
          visibleEntries,
          normalizedInitialFilePath,
        );
        setSelectedFile((current) => {
          if (
            current &&
            visibleEntries.some((entry) => entry.path === current)
          ) {
            return current;
          }
          return firstFile;
        });
        setLoadedFiles((prev) => retainLoadedFiles(visibleEntries, prev));
        const dirs = visibleEntries
          .filter((entry) => entry.isDirectory)
          .map((entry) => entry.path);
        setExpandedDirs(new Set(dirs));
      } catch (error) {
        if (!isCurrentSourceRequest(expectedSourceKey, expectedGeneration))
          return;
        console.error("Failed to load skill files:", error);
        showToast(
          `${t("skill.loadFailed", "Load failed")}: ${String(error)}`,
          "error",
        );
      } finally {
        if (isCurrentSourceRequest(expectedSourceKey, expectedGeneration)) {
          setIsLoading(false);
        }
      }
    },
    [
      hasVisibleFileAllowlist,
      includeMissingVisibleFiles,
      isCurrentSourceRequest,
      listFiles,
      normalizedInitialFilePath,
      normalizedVisibleFilePaths,
      showToast,
      t,
    ],
  );

  const hasAnyUnsaved = useMemo(
    () => Object.keys(modifiedFiles).length > 0,
    [modifiedFiles],
  );

  useWorkspaceDraft("skill", {
    dirty: isOpen && hasAnyUnsaved,
    saving: isOpen && isSaving,
    discard: () => {
      setModifiedFiles({});
      setIsEditingFileContent(false);
    },
    prepare: isOpen
      ? async () => {
          const generation = sourceGenerationRef.current;
          const entries = selectVisibleFileEntries(
            await listFiles(),
            normalizedVisibleFilePaths,
            hasVisibleFileAllowlist,
            includeMissingVisibleFiles,
          );
          const nextSelected = entries.some(
            (entry) => entry.path === selectedFile,
          )
            ? selectedFile
            : null;
          const content = nextSelected ? await readFile(nextSelected) : null;
          if (nextSelected && !content)
            throw new Error("Selected Skill file disappeared during refresh");
          return {
            isCurrent: () =>
              activeSourceKeyRef.current === sourceKey &&
              sourceGenerationRef.current === generation &&
              selectedFileRef.current === selectedFile,
            commit: () => {
              sourceGenerationRef.current += 1;
              setFiles(entries);
              setSelectedFile(nextSelected);
              setLoadedFiles(
                content && nextSelected
                  ? {
                      [nextSelected]: {
                        ...content,
                        path: normalizeSkillRelativePath(
                          content.path || nextSelected,
                        ),
                      },
                    }
                  : {},
              );
              setLoadingFilePath(null);
              setIsLoading(false);
              return !!selectedFile && !nextSelected;
            },
          };
        }
      : undefined,
  });

  useEffect(() => {
    if (!isOpen) {
      activeSourceKeyRef.current = null;
      inventorySourceKeyRef.current = null;
      sourceGenerationRef.current += 1;
      return;
    }

    // A published package invalidates cached files, not unsaved editor drafts.
    // Metadata-only updates and callback changes must not reload the package.
    const sourceChanged = activeSourceKeyRef.current !== sourceKey;
    if (!sourceChanged && loadedVersionRef.current === currentVersion) {
      return;
    }

    const generation = sourceGenerationRef.current + 1;
    sourceGenerationRef.current = generation;
    activeSourceKeyRef.current = sourceKey;
    loadedVersionRef.current = currentVersion;
    inventorySourceKeyRef.current = null;
    setLoadedFiles({});
    setLoadingFilePath(null);
    if (sourceChanged) {
      setFiles([]);
      setSelectedFile(null);
      setModifiedFiles({});
    }
    void loadFiles(sourceKey, generation);
  }, [currentVersion, isOpen, loadFiles, sourceKey]);

  useEffect(() => {
    onUnsavedChange?.(hasAnyUnsaved);
    (
      window as Window & { __PROMPTHUB_SKILL_EDITOR_DIRTY?: boolean }
    ).__PROMPTHUB_SKILL_EDITOR_DIRTY = hasAnyUnsaved;

    return () => {
      (
        window as Window & { __PROMPTHUB_SKILL_EDITOR_DIRTY?: boolean }
      ).__PROMPTHUB_SKILL_EDITOR_DIRTY = false;
    };
  }, [hasAnyUnsaved, onUnsavedChange]);

  useEffect(() => {
    if (!readOnly) {
      return;
    }
    setModifiedFiles({});
    setIsEditingFileContent(false);
    setNewFileDialogOpen(false);
    setNewFolderDialogOpen(false);
    setDeleteDialogFile(null);
    setRenameDialogPath(null);
    setContextMenu(null);
  }, [readOnly]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("blur", closeContextMenu);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("blur", closeContextMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!isOpen || !hasAnyUnsaved) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasAnyUnsaved, isOpen]);

  const discardUnsavedChanges = useCallback(() => {
    setModifiedFiles({});
  }, []);

  const discardCurrentFileChanges = useCallback(() => {
    if (!selectedFile) {
      return;
    }
    setModifiedFiles((prev) => {
      if (!(selectedFile in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[selectedFile];
      return next;
    });
  }, [selectedFile]);

  const cancelCurrentFileEditing = useCallback(() => {
    discardCurrentFileChanges();
    setIsEditingFileContent(false);
  }, [discardCurrentFileChanges]);

  const runWithUnsavedChangesCheck = useCallback(
    (action: () => void) => {
      if (!hasAnyUnsaved) {
        action();
        return;
      }

      setPendingUnsavedAction(() => action);
      setIsUnsavedDialogOpen(true);
    },
    [hasAnyUnsaved],
  );

  const loadSelectedFileContent = useCallback(
    async (path: string) => {
      const expectedSourceKey = sourceKey;
      const expectedGeneration = sourceGenerationRef.current;
      if (inventorySourceKeyRef.current !== expectedSourceKey) {
        return;
      }
      if (path in modifiedFiles || loadedFiles[path]) {
        return;
      }
      setLoadingFilePath(path);
      try {
        const result = await readFile(path);
        if (
          activeSourceKeyRef.current !== expectedSourceKey ||
          inventorySourceKeyRef.current !== expectedSourceKey ||
          sourceGenerationRef.current !== expectedGeneration
        ) {
          return;
        }
        if (result && !result.isDirectory) {
          setLoadedFiles((prev) => ({
            ...prev,
            [path]: {
              ...result,
              path: normalizeSkillRelativePath(result.path || path),
            },
          }));
        }
      } catch (error) {
        if (
          activeSourceKeyRef.current !== expectedSourceKey ||
          sourceGenerationRef.current !== expectedGeneration
        ) {
          return;
        }
        console.error("Failed to read skill file:", error);
        showToast(
          `${t("skill.loadFailed", "Load failed")}: ${String(error)}`,
          "error",
        );
      } finally {
        if (
          activeSourceKeyRef.current === expectedSourceKey &&
          sourceGenerationRef.current === expectedGeneration
        ) {
          setLoadingFilePath((current) => (current === path ? null : current));
        }
      }
    },
    [loadedFiles, modifiedFiles, readFile, showToast, sourceKey, t],
  );

  useEffect(() => {
    if (!selectedFile) {
      return;
    }
    const currentMeta = files.find(
      (file) => file.path === selectedFile && !file.isDirectory,
    );
    if (!currentMeta) {
      return;
    }
    void loadSelectedFileContent(selectedFile);
  }, [files, loadSelectedFileContent, selectedFile]);

  useEffect(() => {
    setIsEditingFileContent(false);
    setResourceZoom(1);
    setIsResourceFullscreenOpen(false);
  }, [selectedFile]);

  // Build tree
  const tree = useMemo(() => buildTree(files), [files]);
  const fileCount = useMemo(
    () => files.filter((file) => !file.isDirectory).length,
    [files],
  );
  const modifiedFilePathsKey = Object.keys(modifiedFiles).sort().join("\u0000");
  const modifiedFilePaths = useMemo(
    () =>
      new Set(modifiedFilePathsKey ? modifiedFilePathsKey.split("\u0000") : []),
    [modifiedFilePathsKey],
  );

  // Current file data
  const currentFile = useMemo(() => {
    if (!selectedFile) return null;
    const fileMeta =
      files.find((f) => f.path === selectedFile && !f.isDirectory) || null;
    if (!fileMeta) return null;
    return (
      loadedFiles[selectedFile] || {
        path: fileMeta.path,
        content: "",
        isDirectory: false,
      }
    );
  }, [files, loadedFiles, selectedFile]);

  const currentContent = useMemo(() => {
    if (!selectedFile) return "";
    if (selectedFile in modifiedFiles) return modifiedFiles[selectedFile];
    return currentFile?.content || "";
  }, [selectedFile, modifiedFiles, currentFile]);

  const currentLanguageName = useMemo(
    () => getSkillCodeEditorLanguageName(selectedFile || ""),
    [selectedFile],
  );
  const canEditCurrentFile = !readOnly && isEditableFile(currentFile);
  const fullscreenResourceFile =
    currentFile?.encoding === "data-url" && currentFile.previewKind === "image"
      ? currentFile
      : null;

  useEffect(() => {
    if (!canEditCurrentFile) {
      setIsEditingFileContent(false);
    }
  }, [canEditCurrentFile]);

  const isModified = useCallback(
    (path: string) => path in modifiedFiles,
    [modifiedFiles],
  );

  // Edit content
  const handleContentChange = useCallback(
    (newContent: string) => {
      if (readOnly || !selectedFile) return;
      const original = currentFile?.content || "";
      if (newContent === original) {
        setModifiedFiles((prev) => {
          const next = { ...prev };
          delete next[selectedFile];
          return next;
        });
      } else {
        setModifiedFiles((prev) => ({ ...prev, [selectedFile]: newContent }));
      }
    },
    [readOnly, selectedFile, currentFile],
  );

  const zoomResourceBy = useCallback((delta: number) => {
    setResourceZoom((current) => clampResourceZoom(current + delta));
  }, []);

  const handleImageWheelZoom = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      zoomResourceBy(
        event.deltaY < 0 ? RESOURCE_ZOOM_STEP : -RESOURCE_ZOOM_STEP,
      );
    },
    [zoomResourceBy],
  );

  // Save current file
  const saveCurrentFile = useCallback(async () => {
    if (readOnly || !selectedFile || !(selectedFile in modifiedFiles)) return;
    setIsSaving(true);
    try {
      const nextContent = modifiedFiles[selectedFile];
      const savedFile = await writeFile(
        selectedFile,
        nextContent,
        currentFile?.revision,
      );
      const persistedFile =
        savedFile && !savedFile.isDirectory
          ? {
              ...savedFile,
              path: normalizeSkillRelativePath(savedFile.path || selectedFile),
            }
          : {
              path: selectedFile,
              content: nextContent,
              isDirectory: false,
            };
      setFiles((prev) =>
        prev.map((file) =>
          file.path === selectedFile
            ? {
                ...file,
                size: new TextEncoder().encode(persistedFile.content).length,
              }
            : file,
        ),
      );
      setLoadedFiles((prev) => ({
        ...prev,
        [selectedFile]: persistedFile,
      }));
      setModifiedFiles((prev) => {
        const next = { ...prev };
        delete next[selectedFile];
        return next;
      });
      if (!isPathMode) {
        scheduleAllSaveSync("skill:file-save");
      }
      showToast(t("skill.fileSaved", "File saved"), "success");
      if (onSave) {
        await onSave();
      }
    } catch (error) {
      console.error("Failed to save file:", error);
      const feedback = getSkillFileErrorFeedback(error, "save", t);
      showToast(feedback.message, feedback.type);
    } finally {
      setIsSaving(false);
    }
  }, [
    currentFile?.revision,
    modifiedFiles,
    onSave,
    readOnly,
    selectedFile,
    showToast,
    t,
    writeFile,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveCurrentFile();
      }
      // Escape only closes in modal mode
      if (e.key === "Escape" && !isInline && onClose) {
        // Don't close if a dialog is open
        if (newFileDialogOpen || newFolderDialogOpen || deleteDialogFile)
          return;
        runWithUnsavedChangesCheck(() => {
          onClose();
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    isInline,
    saveCurrentFile,
    onClose,
    newFileDialogOpen,
    newFolderDialogOpen,
    deleteDialogFile,
    runWithUnsavedChangesCheck,
  ]);

  // Toggle directory
  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // New file
  const handleNewFile = useCallback(async () => {
    if (!canMutateStructure) return;
    const rawName = dialogInput.trim();
    const name = createParentPath
      ? [createParentPath, rawName].filter(Boolean).join("/")
      : rawName;
    if (!name) return;
    try {
      // If path has intermediate dirs, create them first
      const dirParts = name.split("/");
      if (dirParts.length > 1) {
        const dirPath = dirParts.slice(0, -1).join("/");
        await createDir(dirPath);
      }
      await writeFile(name, "");
      await loadFiles();
      setSelectedFile(name);
      setNewFileDialogOpen(false);
      setDialogInput("");
      setLoadedFiles((prev) => ({
        ...prev,
        [name]: { path: name, content: "", isDirectory: false },
      }));
      if (!isPathMode) {
        scheduleAllSaveSync("skill:file-create");
      }
    } catch (error) {
      console.error("Failed to create file:", error);
      const feedback = getSkillFileErrorFeedback(error, "create", t);
      showToast(feedback.message, feedback.type);
    }
  }, [
    createDir,
    createParentPath,
    dialogInput,
    loadFiles,
    canMutateStructure,
    t,
    showToast,
    writeFile,
  ]);

  // New folder
  const handleNewFolder = useCallback(async () => {
    if (!canMutateStructure) return;
    const rawName = dialogInput.trim();
    const name = createParentPath
      ? [createParentPath, rawName].filter(Boolean).join("/")
      : rawName;
    if (!name) return;
    try {
      await createDir(name);
      await loadFiles();
      setExpandedDirs((prev) => new Set([...prev, name]));
      setNewFolderDialogOpen(false);
      setDialogInput("");
      if (!isPathMode) {
        scheduleAllSaveSync("skill:dir-create");
      }
    } catch (error) {
      console.error("Failed to create folder:", error);
      const feedback = getSkillFileErrorFeedback(error, "createFolder", t);
      showToast(feedback.message, feedback.type);
    }
  }, [
    createDir,
    createParentPath,
    dialogInput,
    loadFiles,
    canMutateStructure,
    t,
    showToast,
  ]);

  const handleRenamePath = useCallback(async () => {
    if (!canMutateStructure || !renameDialogPath) return;
    const nextName = dialogInput.trim();
    if (!nextName) return;

    const pathParts = renameDialogPath.split("/");
    pathParts[pathParts.length - 1] = nextName;
    const nextPath = pathParts.join("/");

    try {
      await renamePath(renameDialogPath, nextPath);
      setModifiedFiles((prev) => {
        if (!(renameDialogPath in prev)) {
          return prev;
        }
        const next = { ...prev, [nextPath]: prev[renameDialogPath] };
        delete next[renameDialogPath];
        return next;
      });
      setLoadedFiles((prev) => {
        if (!prev[renameDialogPath]) {
          return prev;
        }
        const next = {
          ...prev,
          [nextPath]: { ...prev[renameDialogPath], path: nextPath },
        };
        delete next[renameDialogPath];
        return next;
      });
      if (selectedFile === renameDialogPath) {
        setSelectedFile(nextPath);
      }
      await loadFiles();
      setRenameDialogPath(null);
      setDialogInput("");
      if (!isPathMode) {
        scheduleAllSaveSync("skill:path-rename");
      }
      showToast(t("skill.fileSaved", "File saved"), "success");
    } catch (error) {
      console.error("Failed to rename path:", error);
      const feedback = getSkillFileErrorFeedback(error, "rename", t);
      showToast(feedback.message, feedback.type);
    }
  }, [
    dialogInput,
    loadFiles,
    renameDialogPath,
    canMutateStructure,
    selectedFile,
    showToast,
    t,
    renamePath,
  ]);

  // Delete file
  const handleDeleteFile = useCallback(async () => {
    if (!canMutateStructure || !deleteDialogFile) return;
    try {
      await deleteFile(deleteDialogFile);
      if (selectedFile === deleteDialogFile) {
        setSelectedFile(null);
      }
      // Remove from modifiedFiles if present
      setModifiedFiles((prev) => {
        const next = { ...prev };
        delete next[deleteDialogFile];
        return next;
      });
      await loadFiles();
      setDeleteDialogFile(null);
      setLoadedFiles((prev) => {
        const next = { ...prev };
        delete next[deleteDialogFile];
        return next;
      });
      if (!isPathMode) {
        scheduleAllSaveSync("skill:file-delete");
      }
    } catch (error) {
      console.error("Failed to delete file:", error);
      const feedback = getSkillFileErrorFeedback(error, "delete", t);
      showToast(feedback.message, feedback.type);
    }
  }, [
    deleteFile,
    deleteDialogFile,
    loadFiles,
    canMutateStructure,
    selectedFile,
    showToast,
    t,
  ]);

  const requestSelectFile = useCallback(
    (path: string) => {
      if (path === selectedFile) {
        return;
      }

      runWithUnsavedChangesCheck(() => {
        setSelectedFile(path);
      });
    },
    [runWithUnsavedChangesCheck, selectedFile],
  );

  // Open in system file manager
  const handleOpenInExplorer = useCallback(async () => {
    try {
      if (fileSource?.openInFileManager) {
        await fileSource.openInFileManager();
        return;
      }
      const repoPath =
        localPath ?? (await window.api.skill.getRepoPath(skillId));
      if (!repoPath) {
        showToast(t("skill.noLocalRepo", "No local repository found"), "error");
        return;
      }
      window.electron?.openPath?.(repoPath);
    } catch (error) {
      console.error("Failed to open in file manager:", error);
    }
  }, [fileSource, localPath, skillId, showToast, t]);

  const handleCreateFileFromRoot = useCallback(() => {
    setDialogInput("");
    setCreateParentPath(null);
    setNewFileDialogOpen(true);
  }, []);

  const handleCreateFolderFromRoot = useCallback(() => {
    setDialogInput("");
    setCreateParentPath(null);
    setNewFolderDialogOpen(true);
  }, []);

  const handleContextMenuAction = (action: SkillFileContextMenuAction) => {
    if (action.type === "rename") {
      setDialogInput(action.path.split("/").pop() || action.path);
      setRenameDialogPath(action.path);
    } else if (action.type === "delete") {
      setDeleteDialogFile(action.path);
    } else {
      setDialogInput("");
      setCreateParentPath("parentPath" in action ? action.parentPath : null);
      if (action.type === "new-file") setNewFileDialogOpen(true);
      else setNewFolderDialogOpen(true);
    }
    setContextMenu(null);
  };

  // ─── Render ──────────────────────────────────────────

  if (!isOpen) return null;

  const fullscreenPreview = (
    <ResourceImageFullscreenPreview
      file={fullscreenResourceFile}
      isOpen={isResourceFullscreenOpen}
      imageZoom={resourceZoom}
      onClose={() => setIsResourceFullscreenOpen(false)}
      onImageWheelZoom={handleImageWheelZoom}
      onZoomIn={() => zoomResourceBy(RESOURCE_ZOOM_STEP)}
      onZoomOut={() => zoomResourceBy(-RESOURCE_ZOOM_STEP)}
      onResetZoom={() => setResourceZoom(1)}
      zoomOutLabel={t("skill.zoomOut", "Zoom out")}
      zoomInLabel={t("skill.zoomIn", "Zoom in")}
      resetZoomLabel={t("skill.resetZoom", "Reset zoom")}
      fullscreenLabel={t("skill.fullscreenPreview", "Fullscreen preview")}
      closeLabel={t("common.close", "Close")}
    />
  );

  // ─── Shared body (file tree + editor) ─────────────────
  const editorBody = (
    <>
      <div className="skill-file-editor__body">
        <SkillFileTree
          canMutateStructure={canMutateStructure}
          expandedDirs={expandedDirs}
          isLoading={isLoading}
          modifiedFilePaths={modifiedFilePaths}
          noFilesLabel={noFilesLabel}
          onContextMenuChange={setContextMenu}
          onCreateFile={handleCreateFileFromRoot}
          onCreateFolder={handleCreateFolderFromRoot}
          onDeleteFile={setDeleteDialogFile}
          onOpenInExplorer={handleOpenInExplorer}
          onRequestSelectFile={requestSelectFile}
          onToggleDir={toggleDir}
          selectedFile={selectedFile}
          showFileManagerActions={showFileManagerActions}
          t={t}
          tree={tree}
        />

        {/* Right: editor */}
        <div className="skill-file-editor__editor bg-card">
          {!selectedFile || !currentFile ? (
            <div className="skill-file-editor__editor-empty">
              <FileTextIcon
                style={{ width: "2rem", height: "2rem", opacity: 0.3 }}
              />
              <span>
                {fileCount > 0
                  ? t("skill.noContent", "Select a file to edit")
                  : noFilesLabel}
              </span>
            </div>
          ) : (
            <>
              {/* Editor header */}
              <div className="skill-file-editor__editor-header">
                <div className="skill-file-editor__editor-file-name">
                  {getFileIcon(currentFile.path, false, false)}
                  {currentFile.path}
                  {isModified(selectedFile) && (
                    <span className="skill-file-editor__tree-item-dot" />
                  )}
                </div>
                <div className="skill-file-editor__editor-tabs">
                  {readOnly ? (
                    <div className="skill-file-editor__edit-state skill-file-editor__edit-state--readonly">
                      <FileIcon
                        style={{ width: "0.875rem", height: "0.875rem" }}
                      />
                      {t("common.readOnly", "Read only")}
                    </div>
                  ) : !canEditCurrentFile ? (
                    !currentFile?.previewKind ? (
                      <div className="skill-file-editor__edit-state skill-file-editor__edit-state--readonly">
                        <FileIcon
                          style={{ width: "0.875rem", height: "0.875rem" }}
                        />
                        {t("skill.binaryFile", "Binary file cannot be edited")}
                      </div>
                    ) : null
                  ) : !isEditingFileContent ? (
                    <button
                      type="button"
                      className="skill-file-editor__editor-tab"
                      onClick={() => setIsEditingFileContent(true)}
                      title={t("prompt.edit", "Edit")}
                    >
                      <PencilIcon
                        aria-hidden="true"
                        style={{ width: "0.875rem", height: "0.875rem" }}
                      />
                      <span>{t("prompt.edit", "Edit")}</span>
                    </button>
                  ) : (
                    <>
                      <div className="skill-file-editor__edit-state">
                        <PencilIcon
                          style={{ width: "0.875rem", height: "0.875rem" }}
                        />
                        {t("skill.editing", "Editing")}
                      </div>
                      <button
                        type="button"
                        className="skill-file-editor__editor-tab skill-file-editor__editor-tab--icon"
                        onClick={discardCurrentFileChanges}
                        disabled={!isModified(selectedFile)}
                        title={t(
                          "skill.discardCurrentFileChanges",
                          "Discard changes",
                        )}
                        aria-label={t(
                          "skill.discardCurrentFileChanges",
                          "Discard changes",
                        )}
                      >
                        <RotateCcwIcon
                          aria-hidden="true"
                          style={{ width: "0.875rem", height: "0.875rem" }}
                        />
                      </button>
                      <button
                        type="button"
                        className="skill-file-editor__editor-tab skill-file-editor__editor-tab--icon"
                        onClick={cancelCurrentFileEditing}
                        title={t("common.cancel", "Cancel")}
                        aria-label={t("common.cancel", "Cancel")}
                      >
                        <XIcon
                          aria-hidden="true"
                          style={{ width: "0.875rem", height: "0.875rem" }}
                        />
                      </button>
                    </>
                  )}
                  {!readOnly ? (
                    <button
                      type="button"
                      className="skill-file-editor__editor-tab skill-file-editor__editor-tab--icon"
                      onClick={saveCurrentFile}
                      disabled={isSaving || !isModified(selectedFile)}
                      title="Cmd/Ctrl+S"
                      aria-label={t("common.save", "Save")}
                    >
                      {isSaving ? (
                        <Loader2Icon
                          aria-hidden="true"
                          style={{
                            width: "0.875rem",
                            height: "0.875rem",
                            animation: "spin 1s linear infinite",
                          }}
                        />
                      ) : (
                        <SaveIcon
                          aria-hidden="true"
                          style={{ width: "0.875rem", height: "0.875rem" }}
                        />
                      )}
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Editor content */}
              <div className="skill-file-editor__editor-content">
                {loadingFilePath === selectedFile &&
                !(selectedFile in modifiedFiles) &&
                !loadedFiles[selectedFile] ? (
                  <div className="skill-file-editor__loading">
                    <Loader2Icon style={{ width: "1rem", height: "1rem" }} />
                  </div>
                ) : currentFile.previewKind ||
                  currentFile.encoding === "data-url" ? (
                  <ResourcePreview
                    file={currentFile}
                    imageZoom={resourceZoom}
                    onImageWheelZoom={handleImageWheelZoom}
                    onZoomIn={() => zoomResourceBy(RESOURCE_ZOOM_STEP)}
                    onZoomOut={() => zoomResourceBy(-RESOURCE_ZOOM_STEP)}
                    onResetZoom={() => setResourceZoom(1)}
                    onOpenFullscreen={() => setIsResourceFullscreenOpen(true)}
                    zoomOutLabel={t("skill.zoomOut", "Zoom out")}
                    zoomInLabel={t("skill.zoomIn", "Zoom in")}
                    resetZoomLabel={t("skill.resetZoom", "Reset zoom")}
                    fullscreenLabel={t(
                      "skill.fullscreenPreview",
                      "Fullscreen preview",
                    )}
                    emptyLabel={t(
                      "skill.binaryFile",
                      "Binary file cannot be edited",
                    )}
                  />
                ) : (
                  <SkillCodeEditor
                    path={selectedFile}
                    value={currentContent}
                    editable={isEditingFileContent}
                    onChange={handleContentChange}
                  />
                )}
              </div>

              {/* Status bar */}
              <div className="skill-file-editor__status-bar">
                <div className="skill-file-editor__status-left">
                  <span className="skill-file-editor__status-path">
                    {selectedFile}
                  </span>
                </div>
                <div className="skill-file-editor__status-right">
                  <span>
                    {formatFileSize(
                      new TextEncoder().encode(currentContent).length,
                    )}
                  </span>
                  <span>UTF-8</span>
                  <span>{currentFile?.mimeType || currentLanguageName}</span>
                  {isModified(selectedFile) && (
                    <span style={{ color: "hsl(var(--primary))" }}>
                      {t("skill.unsavedFile", "Unsaved")}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <SkillFileMutationDialogs
        deletePath={deleteDialogFile}
        input={dialogInput}
        isNewFileOpen={newFileDialogOpen}
        isNewFolderOpen={newFolderDialogOpen}
        renamePath={renameDialogPath}
        onCloseDelete={() => setDeleteDialogFile(null)}
        onCloseNewFile={() => setNewFileDialogOpen(false)}
        onCloseNewFolder={() => setNewFolderDialogOpen(false)}
        onCloseRename={() => setRenameDialogPath(null)}
        onCreateFile={handleNewFile}
        onCreateFolder={handleNewFolder}
        onDelete={handleDeleteFile}
        onInputChange={setDialogInput}
        onRename={handleRenamePath}
      />

      <SkillFileContextMenu
        contextMenu={contextMenu}
        readOnly={!canMutateStructure}
        labels={{
          delete: t("common.delete", "Delete"),
          newFile: t("skill.newFile", "New File"),
          newFolder: t("skill.newFolder", "New Folder"),
          rename: t("folder.rename", "重命名"),
        }}
        onAction={handleContextMenuAction}
      />
    </>
  );

  // ─── Inline mode: render as a plain panel ─────────────
  if (isInline) {
    return (
      <>
        <div className="skill-file-editor skill-file-editor--inline">
          {editorBody}
        </div>
        {fullscreenPreview}
        <UnsavedChangesDialog
          isOpen={isUnsavedDialogOpen}
          onClose={() => {
            setIsUnsavedDialogOpen(false);
            setPendingUnsavedAction(null);
          }}
          onSave={() => {
            void saveCurrentFile().finally(() => {
              setIsUnsavedDialogOpen(false);
              pendingUnsavedAction?.();
              setPendingUnsavedAction(null);
            });
          }}
          onDiscard={() => {
            discardUnsavedChanges();
            setIsUnsavedDialogOpen(false);
            pendingUnsavedAction?.();
            setPendingUnsavedAction(null);
          }}
        />
      </>
    );
  }

  // ─── Modal mode: render in a portal with overlay ──────
  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        data-testid="skill-file-editor-backdrop"
        role="presentation"
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          runWithUnsavedChangesCheck(() => {
            onClose?.();
          });
        }}
      />

      {/* Modal */}
      <div className="relative app-wallpaper-panel-strong rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-base skill-file-editor">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            {modalTitle}
            <span className="text-xs font-normal text-muted-foreground">
              —{" "}
              {skillName ||
                (isPathMode
                  ? localPath
                  : skillId.length > 16
                    ? `${skillId.slice(0, 8)}…${skillId.slice(-4)}`
                    : skillId)}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {hasAnyUnsaved && (
              <span className="text-xs text-amber-500 font-medium">
                {t("skill.unsavedFile", "File has unsaved changes")}
              </span>
            )}
            <button
              type="button"
              aria-label={t("common.close", "Close")}
              onClick={() => {
                runWithUnsavedChangesCheck(() => {
                  onClose?.();
                });
              }}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <XIcon aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {editorBody}
      </div>
    </div>
  );

  return (
    <>
      {createPortal(modalContent, document.body)}
      {fullscreenPreview}
      <UnsavedChangesDialog
        isOpen={isUnsavedDialogOpen}
        onClose={() => {
          setIsUnsavedDialogOpen(false);
          setPendingUnsavedAction(null);
        }}
        onSave={() => {
          void saveCurrentFile().finally(() => {
            setIsUnsavedDialogOpen(false);
            pendingUnsavedAction?.();
            setPendingUnsavedAction(null);
          });
        }}
        onDiscard={() => {
          discardUnsavedChanges();
          setIsUnsavedDialogOpen(false);
          pendingUnsavedAction?.();
          setPendingUnsavedAction(null);
        }}
      />
    </>
  );
}
