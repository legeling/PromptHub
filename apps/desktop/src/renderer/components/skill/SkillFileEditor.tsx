import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  XIcon,
  FileTextIcon,
  FileIcon,
  FolderPlusIcon,
  FilePlusIcon,
  Trash2Icon,
  ExternalLinkIcon,
  SaveIcon,
  Loader2Icon,
  ChevronRightIcon,
  PencilIcon,
  RotateCcwIcon,
  MusicIcon,
  MinusIcon,
  PlusIcon,
  Maximize2Icon,
} from "lucide-react";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { useToast } from "../ui/Toast";
import { scheduleAllSaveSync } from "../../services/webdav-save-sync";
import {
  SkillCodeEditor,
  getSkillCodeEditorLanguageName,
} from "./SkillCodeEditor";
import { getSkillFileIconUrl } from "./skill-file-icons";
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
  type TreeNode,
} from "./skill-file-editor-utils";
import "./SkillFileEditor.css";

// ─── Types ──────────────────────────────────────────────

interface SkillFileEditorSurfaceLabels {
  noFiles?: string;
  modalTitle?: string;
}

interface SkillFileEditorProps {
  skillId: string;
  localPath?: string;
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

type ResourceImageMode = "inline" | "fullscreen";

interface ImageZoomControlsProps {
  imageZoom: number;
  mode: ResourceImageMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onOpenFullscreen?: () => void;
  zoomOutLabel: string;
  zoomInLabel: string;
  resetZoomLabel: string;
  fullscreenLabel: string;
}

interface ImageResourceCanvasProps extends Omit<
  ImageZoomControlsProps,
  "mode"
> {
  file: FileEntry;
  mode?: ResourceImageMode;
  onImageWheelZoom: (event: WheelEvent<HTMLDivElement>) => void;
}

function ImageZoomControls({
  imageZoom,
  mode,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onOpenFullscreen,
  zoomOutLabel,
  zoomInLabel,
  resetZoomLabel,
  fullscreenLabel,
}: ImageZoomControlsProps) {
  const isFullscreenMode = mode === "fullscreen";
  const centerLabel = isFullscreenMode ? resetZoomLabel : fullscreenLabel;

  return (
    <div className="skill-file-editor__zoom-controls">
      <button
        className="skill-file-editor__editor-tab skill-file-editor__editor-tab--icon"
        type="button"
        onClick={onZoomOut}
        disabled={imageZoom <= MIN_RESOURCE_ZOOM}
        title={zoomOutLabel}
        aria-label={zoomOutLabel}
      >
        <MinusIcon
          aria-hidden="true"
          style={{ width: "0.875rem", height: "0.875rem" }}
        />
      </button>
      <button
        className="skill-file-editor__editor-tab"
        type="button"
        onClick={isFullscreenMode ? onResetZoom : onOpenFullscreen}
        disabled={isFullscreenMode ? imageZoom === 1 : !onOpenFullscreen}
        title={centerLabel}
        aria-label={centerLabel}
      >
        {isFullscreenMode ? (
          <RotateCcwIcon
            aria-hidden="true"
            style={{ width: "0.875rem", height: "0.875rem" }}
          />
        ) : (
          <Maximize2Icon
            aria-hidden="true"
            style={{ width: "0.875rem", height: "0.875rem" }}
          />
        )}
        <span>{Math.round(imageZoom * 100)}%</span>
      </button>
      <button
        className="skill-file-editor__editor-tab skill-file-editor__editor-tab--icon"
        type="button"
        onClick={onZoomIn}
        disabled={imageZoom >= MAX_RESOURCE_ZOOM}
        title={zoomInLabel}
        aria-label={zoomInLabel}
      >
        <PlusIcon
          aria-hidden="true"
          style={{ width: "0.875rem", height: "0.875rem" }}
        />
      </button>
    </div>
  );
}

function ImageResourceCanvas({
  file,
  imageZoom,
  onImageWheelZoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onOpenFullscreen,
  zoomOutLabel,
  zoomInLabel,
  resetZoomLabel,
  fullscreenLabel,
  mode = "inline",
}: ImageResourceCanvasProps) {
  const panStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [isPanningImage, setIsPanningImage] = useState(false);

  const handleImagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsPanningImage(true);
  };

  const handleImagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const panState = panStateRef.current;
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.scrollLeft =
      panState.scrollLeft - (event.clientX - panState.startX);
    event.currentTarget.scrollTop =
      panState.scrollTop - (event.clientY - panState.startY);
  };

  const stopImagePan = (event: PointerEvent<HTMLDivElement>) => {
    if (panStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    panStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setIsPanningImage(false);
  };

  return (
    <div
      className={`skill-file-editor__resource-preview skill-file-editor__resource-preview--image skill-file-editor__resource-preview--image-${mode}`}
      onWheel={onImageWheelZoom}
    >
      <div
        className={`skill-file-editor__resource-image-viewport${
          isPanningImage
            ? " skill-file-editor__resource-image-viewport--panning"
            : ""
        }`}
        onPointerDown={handleImagePointerDown}
        onPointerMove={handleImagePointerMove}
        onPointerUp={stopImagePan}
        onPointerCancel={stopImagePan}
      >
        <div
          className="skill-file-editor__resource-image-stage"
          style={{
            width: `${imageZoom * 100}%`,
            height: `${imageZoom * 100}%`,
          }}
        >
          <img
            src={file.content}
            alt={file.path}
            className="skill-file-editor__resource-image"
          />
        </div>
      </div>
      <ImageZoomControls
        imageZoom={imageZoom}
        mode={mode}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
        onOpenFullscreen={onOpenFullscreen}
        zoomOutLabel={zoomOutLabel}
        zoomInLabel={zoomInLabel}
        resetZoomLabel={resetZoomLabel}
        fullscreenLabel={fullscreenLabel}
      />
    </div>
  );
}

function ResourceImageFullscreenPreview({
  file,
  isOpen,
  imageZoom,
  onClose,
  onImageWheelZoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  zoomOutLabel,
  zoomInLabel,
  resetZoomLabel,
  fullscreenLabel,
  closeLabel,
}: {
  file: FileEntry | null;
  isOpen: boolean;
  imageZoom: number;
  onClose: () => void;
  onImageWheelZoom: (event: WheelEvent<HTMLDivElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  zoomOutLabel: string;
  zoomInLabel: string;
  resetZoomLabel: string;
  fullscreenLabel: string;
  closeLabel: string;
}) {
  useEffect(() => {
    if (!isOpen || !file) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [file, isOpen, onClose]);

  if (!isOpen || !file) {
    return null;
  }

  return createPortal(
    <div
      className="skill-file-editor__fullscreen-preview"
      role="dialog"
      aria-modal="true"
      aria-label={fullscreenLabel}
    >
      <div className="skill-file-editor__fullscreen-preview-header">
        <span className="skill-file-editor__fullscreen-preview-title">
          {file.path}
        </span>
        <button
          className="skill-file-editor__fullscreen-preview-close"
          type="button"
          onClick={onClose}
          title={closeLabel}
          aria-label={closeLabel}
        >
          <XIcon aria-hidden="true" style={{ width: "1rem", height: "1rem" }} />
        </button>
      </div>
      <ImageResourceCanvas
        file={file}
        imageZoom={imageZoom}
        onImageWheelZoom={onImageWheelZoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
        zoomOutLabel={zoomOutLabel}
        zoomInLabel={zoomInLabel}
        resetZoomLabel={resetZoomLabel}
        fullscreenLabel={fullscreenLabel}
        mode="fullscreen"
      />
    </div>,
    document.body,
  );
}

function ResourcePreview({
  file,
  emptyLabel,
  imageZoom,
  onImageWheelZoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onOpenFullscreen,
  zoomOutLabel,
  zoomInLabel,
  resetZoomLabel,
  fullscreenLabel,
}: {
  file: FileEntry;
  emptyLabel: string;
  imageZoom: number;
  onImageWheelZoom: (event: WheelEvent<HTMLDivElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onOpenFullscreen: () => void;
  zoomOutLabel: string;
  zoomInLabel: string;
  resetZoomLabel: string;
  fullscreenLabel: string;
}) {
  if (file.encoding !== "data-url" || !file.previewKind) {
    return (
      <div className="skill-file-editor__resource-preview skill-file-editor__resource-preview--empty">
        <FileIcon style={{ width: "2rem", height: "2rem" }} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  if (file.previewKind === "image") {
    return (
      <ImageResourceCanvas
        file={file}
        imageZoom={imageZoom}
        onImageWheelZoom={onImageWheelZoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
        onOpenFullscreen={onOpenFullscreen}
        zoomOutLabel={zoomOutLabel}
        zoomInLabel={zoomInLabel}
        resetZoomLabel={resetZoomLabel}
        fullscreenLabel={fullscreenLabel}
      />
    );
  }

  if (file.previewKind === "audio") {
    return (
      <div className="skill-file-editor__resource-preview skill-file-editor__resource-preview--media">
        <MusicIcon style={{ width: "2rem", height: "2rem" }} />
        <audio
          controls
          src={file.content}
          className="skill-file-editor__resource-audio"
        />
      </div>
    );
  }

  if (file.previewKind === "video") {
    return (
      <div className="skill-file-editor__resource-preview">
        <video
          controls
          src={file.content}
          className="skill-file-editor__resource-video"
        />
      </div>
    );
  }

  return (
    <div className="skill-file-editor__resource-preview">
      <iframe
        src={file.content}
        title={file.path}
        className="skill-file-editor__resource-pdf"
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function SimpleDialog({
  isOpen,
  title,
  children,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  return createPortal(
    <div className="skill-file-editor__dialog-overlay">
      <div
        data-testid="skill-file-editor-dialog-backdrop"
        role="presentation"
        aria-hidden="true"
        className="skill-file-editor__dialog-backdrop"
        onClick={onClose}
      />
      <div className="skill-file-editor__dialog">
        <h3>{title}</h3>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ─── Main Component ─────────────────────────────────────

export function SkillFileEditor({
  skillId,
  localPath,
  skillName,
  isOpen,
  onClose,
  onSave,
  mode = "modal",
  onUnsavedChange,
  readOnly = false,
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
  const isPathMode = Boolean(localPath);
  const sourceKey = localPath ? `path:${localPath}` : `skill:${skillId}`;

  const listFiles = useCallback(async () => {
    if (localPath) {
      return window.api.skill.listLocalFilesByPath(localPath);
    }
    return window.api.skill.listLocalFiles(skillId);
  }, [localPath, skillId]);

  const readFile = useCallback(
    async (relativePath: string) => {
      if (localPath) {
        return window.api.skill.readLocalFileByPath(localPath, relativePath);
      }
      return window.api.skill.readLocalFile(skillId, relativePath);
    },
    [localPath, skillId],
  );

  const writeFile = useCallback(
    async (relativePath: string, content: string) => {
      if (readOnly) {
        return;
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
    [localPath, readOnly, skillId],
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
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listFiles();
      const normalizedEntries = result.map(normalizeFileTreeEntry);
      const visibleEntries = normalizedEntries.filter(
        (entry) => !isHiddenSkillRepoEntry(entry.path),
      );
      setFiles(visibleEntries);
      const firstFile =
        visibleEntries.find(
          (entry) =>
            !entry.isDirectory && entry.path.toLowerCase() === "skill.md",
        )?.path ||
        visibleEntries.find((entry) => !entry.isDirectory)?.path ||
        null;
      setSelectedFile((current) => {
        if (current && visibleEntries.some((entry) => entry.path === current)) {
          return current;
        }
        return firstFile;
      });
      setLoadedFiles((prev) => {
        const next: Record<string, FileEntry> = {};
        for (const entry of visibleEntries) {
          if (!entry.isDirectory && prev[entry.path]) {
            next[entry.path] = prev[entry.path];
          }
        }
        return next;
      });
      // Auto-expand all directories
      const dirs = visibleEntries
        .filter((entry) => entry.isDirectory)
        .map((entry) => entry.path);
      setExpandedDirs(new Set(dirs));
    } catch (error) {
      console.error("Failed to load skill files:", error);
      showToast(
        `${t("skill.loadFailed", "Load failed")}: ${String(error)}`,
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  }, [listFiles, showToast, t]);

  const hasAnyUnsaved = useMemo(
    () => Object.keys(modifiedFiles).length > 0,
    [modifiedFiles],
  );

  useEffect(() => {
    if (!isOpen) {
      activeSourceKeyRef.current = null;
      return;
    }

    // Re-run file bootstrap only when the editor opens or switches to a
    // different skill/path source. Callback identity changes (for example from
    // i18n updates) must not wipe in-progress edits.
    if (activeSourceKeyRef.current === sourceKey) {
      return;
    }

    activeSourceKeyRef.current = sourceKey;
    void loadFiles();
    setModifiedFiles({});
  }, [isOpen, loadFiles, sourceKey]);

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
      if (path in modifiedFiles || loadedFiles[path]) {
        return;
      }
      setLoadingFilePath(path);
      try {
        const result = await readFile(path);
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
        console.error("Failed to read skill file:", error);
        showToast(
          `${t("skill.loadFailed", "Load failed")}: ${String(error)}`,
          "error",
        );
      } finally {
        setLoadingFilePath((current) => (current === path ? null : current));
      }
    },
    [loadedFiles, modifiedFiles, readFile, showToast, t],
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
      await writeFile(selectedFile, nextContent);
      setFiles((prev) =>
        prev.map((file) =>
          file.path === selectedFile
            ? {
                ...file,
                size: new TextEncoder().encode(nextContent).length,
              }
            : file,
        ),
      );
      setLoadedFiles((prev) => ({
        ...prev,
        [selectedFile]: {
          path: selectedFile,
          content: nextContent,
          isDirectory: false,
        },
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
      showToast(
        `${t("skill.updateFailed", "Update failed")}: ${String(error)}`,
        "error",
      );
    } finally {
      setIsSaving(false);
    }
  }, [modifiedFiles, onSave, readOnly, selectedFile, showToast, t, writeFile]);

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
    if (readOnly) return;
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
      showToast(`Failed to create file: ${String(error)}`, "error");
    }
  }, [
    createDir,
    createParentPath,
    dialogInput,
    loadFiles,
    readOnly,
    showToast,
    writeFile,
  ]);

  // New folder
  const handleNewFolder = useCallback(async () => {
    if (readOnly) return;
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
      showToast(`Failed to create folder: ${String(error)}`, "error");
    }
  }, [
    createDir,
    createParentPath,
    dialogInput,
    loadFiles,
    readOnly,
    showToast,
  ]);

  const handleRenamePath = useCallback(async () => {
    if (readOnly || !renameDialogPath) return;
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
      showToast(`Failed to rename: ${String(error)}`, "error");
    }
  }, [
    dialogInput,
    loadFiles,
    renameDialogPath,
    readOnly,
    selectedFile,
    showToast,
    t,
    renamePath,
  ]);

  // Delete file
  const handleDeleteFile = useCallback(async () => {
    if (readOnly || !deleteDialogFile) return;
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
      showToast(`Failed to delete file: ${String(error)}`, "error");
    }
  }, [
    deleteFile,
    deleteDialogFile,
    loadFiles,
    readOnly,
    selectedFile,
    showToast,
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
  }, [localPath, skillId, showToast, t]);

  // ─── Render ──────────────────────────────────────────

  if (!isOpen) return null;

  // Render tree node recursively
  const renderTreeNode = (node: TreeNode): React.ReactNode => {
    const isExpanded = expandedDirs.has(node.path);
    const isActive = selectedFile === node.path;
    const modified = !node.isDirectory && isModified(node.path);
    const depthClass =
      node.depth <= 4
        ? `skill-file-editor__tree-item--depth-${node.depth}`
        : "";

    if (node.isDirectory) {
      return (
        <div key={node.path}>
          <button
            type="button"
            aria-expanded={isExpanded}
            className={`skill-file-editor__tree-item skill-file-editor__tree-item--directory ${depthClass}`}
            onClick={() => toggleDir(node.path)}
            onContextMenu={(event) => {
              if (readOnly) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                path: node.path,
                isDirectory: true,
              });
            }}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className="skill-file-editor__tree-item-icon"
              style={{
                transform: isExpanded ? "rotate(90deg)" : "none",
                transition: "transform 0.15s",
              }}
            />
            {getFileIcon(node.name, true, isExpanded)}
            <span className="skill-file-editor__tree-item-name">
              {node.name}
            </span>
          </button>
          {isExpanded && node.children.map((child) => renderTreeNode(child))}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        className="skill-file-editor__tree-file-row"
        onContextMenu={(event) => {
          if (readOnly) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            path: node.path,
            isDirectory: false,
          });
        }}
      >
        <button
          type="button"
          className={`skill-file-editor__tree-item ${depthClass} ${
            isActive ? "skill-file-editor__tree-item--active" : ""
          }`}
          onClick={() => {
            requestSelectFile(node.path);
          }}
        >
          {getFileIcon(node.name, false, false)}
          <span className="skill-file-editor__tree-item-name">{node.name}</span>
          {modified && <span className="skill-file-editor__tree-item-dot" />}
        </button>
        {!readOnly ? (
          <button
            type="button"
            className="skill-file-editor__tree-item-delete"
            onClick={() => {
              setDeleteDialogFile(node.path);
            }}
            title={t("skill.deleteFile", "Delete File")}
            aria-label={t("skill.deleteFile", "Delete File")}
          >
            <Trash2Icon
              aria-hidden="true"
              style={{ width: "0.75rem", height: "0.75rem" }}
            />
          </button>
        ) : null}
      </div>
    );
  };

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
        {/* Left: file tree */}
        <div className="skill-file-editor__tree">
          <div className="skill-file-editor__tree-header">
            <span className="skill-file-editor__tree-title">
              {t("skill.fileEditor", "Files")}
            </span>
            {!readOnly ? (
              <div className="skill-file-editor__tree-actions">
                <button
                  type="button"
                  className="skill-file-editor__tree-btn"
                  onClick={() => {
                    setDialogInput("");
                    setCreateParentPath(null);
                    setNewFileDialogOpen(true);
                  }}
                  title={t("skill.newFile", "New File")}
                >
                  <FilePlusIcon
                    aria-hidden="true"
                    style={{ width: "0.875rem", height: "0.875rem" }}
                  />
                </button>
                <button
                  type="button"
                  className="skill-file-editor__tree-btn"
                  onClick={() => {
                    setDialogInput("");
                    setCreateParentPath(null);
                    setNewFolderDialogOpen(true);
                  }}
                  title={t("skill.newFolder", "New Folder")}
                >
                  <FolderPlusIcon
                    aria-hidden="true"
                    style={{ width: "0.875rem", height: "0.875rem" }}
                  />
                </button>
              </div>
            ) : null}
          </div>

          <div
            className="skill-file-editor__tree-list"
            onContextMenu={(event) => {
              if (readOnly) {
                return;
              }
              if (event.target !== event.currentTarget) {
                return;
              }
              event.preventDefault();
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                path: null,
                isDirectory: true,
              });
            }}
          >
            {isLoading ? (
              <div className="skill-file-editor__loading">
                <Loader2Icon style={{ width: "1rem", height: "1rem" }} />
              </div>
            ) : tree.length === 0 ? (
              <div className="skill-file-editor__tree-empty">
                <FileIcon
                  style={{ width: "1.5rem", height: "1.5rem", opacity: 0.4 }}
                />
                <span>{noFilesLabel}</span>
              </div>
            ) : (
              tree.map((node) => renderTreeNode(node))
            )}
          </div>

          <div className="skill-file-editor__tree-footer">
            <button
              type="button"
              className="skill-file-editor__open-explorer-btn"
              onClick={handleOpenInExplorer}
            >
              <ExternalLinkIcon
                aria-hidden="true"
                style={{ width: "0.75rem", height: "0.75rem" }}
              />
              {t("skill.openInExplorer", "Open in File Manager")}
            </button>
          </div>
        </div>

        {/* Right: editor */}
        <div className="skill-file-editor__editor">
          {!selectedFile || !currentFile ? (
            <div className="skill-file-editor__editor-empty">
              <FileTextIcon
                style={{ width: "2rem", height: "2rem", opacity: 0.3 }}
              />
              <span>
                {files.filter((f) => !f.isDirectory).length > 0
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

      {/* New File Dialog */}
      <SimpleDialog
        isOpen={newFileDialogOpen}
        title={t("skill.newFile", "New File")}
        onClose={() => setNewFileDialogOpen(false)}
      >
        <input
          type="text"
          className="skill-file-editor__dialog-input"
          aria-label={t("skill.enterFileName", "Enter file name")}
          value={dialogInput}
          onChange={(e) => setDialogInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNewFile();
            if (e.key === "Escape") setNewFileDialogOpen(false);
          }}
          placeholder={t("skill.enterFileName", "Enter file name")}
          autoFocus
        />
        <p className="skill-file-editor__dialog-hint">
          e.g. helpers/utils.py, README.md
        </p>
        <div className="skill-file-editor__dialog-actions">
          <button
            type="button"
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--cancel"
            onClick={() => setNewFileDialogOpen(false)}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--primary"
            onClick={handleNewFile}
            disabled={!dialogInput.trim()}
          >
            {t("common.confirm", "Confirm")}
          </button>
        </div>
      </SimpleDialog>

      {/* New Folder Dialog */}
      <SimpleDialog
        isOpen={newFolderDialogOpen}
        title={t("skill.newFolder", "New Folder")}
        onClose={() => setNewFolderDialogOpen(false)}
      >
        <input
          type="text"
          className="skill-file-editor__dialog-input"
          aria-label={t("skill.enterFolderName", "Enter folder name")}
          value={dialogInput}
          onChange={(e) => setDialogInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNewFolder();
            if (e.key === "Escape") setNewFolderDialogOpen(false);
          }}
          placeholder={t("skill.enterFolderName", "Enter folder name")}
          autoFocus
        />
        <div className="skill-file-editor__dialog-actions">
          <button
            type="button"
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--cancel"
            onClick={() => setNewFolderDialogOpen(false)}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--primary"
            onClick={handleNewFolder}
            disabled={!dialogInput.trim()}
          >
            {t("common.confirm", "Confirm")}
          </button>
        </div>
      </SimpleDialog>

      {/* Delete Confirmation Dialog */}
      <SimpleDialog
        isOpen={!!deleteDialogFile}
        title={t("common.delete", "Delete")}
        onClose={() => setDeleteDialogFile(null)}
      >
        <p
          style={{
            fontSize: "0.85rem",
            color: "hsl(var(--muted-foreground))",
            marginBottom: "0.5rem",
          }}
        >
          {t(
            "skill.deletePathConfirm",
            "Are you sure you want to delete this file or folder? This action cannot be undone.",
          )}
        </p>
        <p
          style={{
            fontSize: "0.8rem",
            fontFamily: "monospace",
            background: "hsl(var(--muted) / 0.5)",
            padding: "0.375rem 0.5rem",
            borderRadius: "0.375rem",
          }}
        >
          {deleteDialogFile}
        </p>
        <div className="skill-file-editor__dialog-actions">
          <button
            type="button"
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--cancel"
            onClick={() => setDeleteDialogFile(null)}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--destructive"
            onClick={handleDeleteFile}
          >
            {t("common.delete", "Delete")}
          </button>
        </div>
      </SimpleDialog>

      <SimpleDialog
        isOpen={!!renameDialogPath}
        title={t("folder.rename", "重命名")}
        onClose={() => setRenameDialogPath(null)}
      >
        <input
          type="text"
          className="skill-file-editor__dialog-input"
          aria-label={t("folder.rename", "重命名")}
          value={dialogInput}
          onChange={(e) => setDialogInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenamePath();
            if (e.key === "Escape") setRenameDialogPath(null);
          }}
          placeholder={t("skill.enterFileName", "Enter file name")}
          autoFocus
        />
        <div className="skill-file-editor__dialog-actions">
          <button
            type="button"
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--cancel"
            onClick={() => setRenameDialogPath(null)}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--primary"
            onClick={handleRenamePath}
            disabled={!dialogInput.trim()}
          >
            {t("common.confirm", "Confirm")}
          </button>
        </div>
      </SimpleDialog>

      {contextMenu && !readOnly && (
        <div
          className="skill-file-editor__context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.path && !contextMenu.isDirectory && (
            <>
              <button
                type="button"
                className="skill-file-editor__context-item"
                onClick={() => {
                  const currentName =
                    contextMenu.path?.split("/").pop() ||
                    contextMenu.path ||
                    "";
                  setDialogInput(currentName);
                  setRenameDialogPath(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                <PencilIcon aria-hidden="true" className="w-4 h-4" />
                {t("folder.rename", "重命名")}
              </button>
              <button
                type="button"
                className="skill-file-editor__context-item skill-file-editor__context-item--danger"
                onClick={() => {
                  setDeleteDialogFile(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                <Trash2Icon aria-hidden="true" className="w-4 h-4" />
                {t("common.delete", "Delete")}
              </button>
            </>
          )}
          <button
            type="button"
            className="skill-file-editor__context-item"
            onClick={() => {
              setDialogInput("");
              setCreateParentPath(
                contextMenu.path && contextMenu.isDirectory
                  ? contextMenu.path
                  : contextMenu.path?.split("/").slice(0, -1).join("/") || null,
              );
              setNewFileDialogOpen(true);
              setContextMenu(null);
            }}
          >
            <FilePlusIcon aria-hidden="true" className="w-4 h-4" />
            {t("skill.newFile", "New File")}
          </button>
          <button
            type="button"
            className="skill-file-editor__context-item"
            onClick={() => {
              setDialogInput("");
              setCreateParentPath(
                contextMenu.path && contextMenu.isDirectory
                  ? contextMenu.path
                  : contextMenu.path?.split("/").slice(0, -1).join("/") || null,
              );
              setNewFolderDialogOpen(true);
              setContextMenu(null);
            }}
          >
            <FolderPlusIcon aria-hidden="true" className="w-4 h-4" />
            {t("skill.newFolder", "New Folder")}
          </button>
          {contextMenu.path && contextMenu.isDirectory && (
            <>
              <button
                type="button"
                className="skill-file-editor__context-item"
                onClick={() => {
                  const currentName =
                    contextMenu.path?.split("/").pop() ||
                    contextMenu.path ||
                    "";
                  setDialogInput(currentName);
                  setRenameDialogPath(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                <PencilIcon aria-hidden="true" className="w-4 h-4" />
                {t("folder.rename", "重命名")}
              </button>
              <button
                type="button"
                className="skill-file-editor__context-item skill-file-editor__context-item--danger"
                onClick={() => {
                  setDeleteDialogFile(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                <Trash2Icon aria-hidden="true" className="w-4 h-4" />
                {t("common.delete", "Delete")}
              </button>
            </>
          )}
        </div>
      )}
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
