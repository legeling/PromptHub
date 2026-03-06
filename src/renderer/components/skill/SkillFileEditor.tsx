import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  XIcon,
  FileTextIcon,
  FileCodeIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FilePlusIcon,
  Trash2Icon,
  ExternalLinkIcon,
  SaveIcon,
  Loader2Icon,
  ChevronRightIcon,
} from "lucide-react";
import { useToast } from "../ui/Toast";
import { Textarea } from "../ui/Textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import "./SkillFileEditor.css";

// ─── Types ──────────────────────────────────────────────

interface SkillFileEditorProps {
  skillId: string;
  /** Human-readable skill name shown in the modal header. Falls back to a
   *  truncated skillId when omitted. */
  skillName?: string;
  isOpen: boolean;
  onClose?: () => void;
  onSave?: () => void;
  /** "modal" (default for backward compat) renders in a portal overlay;
   *  "inline" renders as a plain panel – no portal, no backdrop, no header. */
  mode?: "modal" | "inline";
}

interface FileEntry {
  path: string;
  content: string;
  isDirectory: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
  depth: number;
}

// ─── Helpers ────────────────────────────────────────────

function getFileIcon(name: string, isDirectory: boolean, isOpen: boolean) {
  if (isDirectory) {
    return isOpen ? (
      <FolderOpenIcon className="skill-file-editor__tree-item-icon" />
    ) : (
      <FolderIcon className="skill-file-editor__tree-item-icon" />
    );
  }
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["md", "mdx"].includes(ext)) {
    return <FileTextIcon className="skill-file-editor__tree-item-icon" />;
  }
  if (
    [
      "py",
      "js",
      "ts",
      "tsx",
      "jsx",
      "sh",
      "yaml",
      "yml",
      "toml",
      "json",
      "css",
      "html",
    ].includes(ext)
  ) {
    return <FileCodeIcon className="skill-file-editor__tree-item-icon" />;
  }
  return <FileIcon className="skill-file-editor__tree-item-icon" />;
}

function isMarkdownFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ["md", "mdx"].includes(ext);
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  // Sort: directories first, then alphabetical
  const sorted = [...files].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const file of sorted) {
    const parts = file.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const partName = parts[i];
      const partPath = parts.slice(0, i + 1).join("/");
      const isLast = i === parts.length - 1;

      let existing = currentLevel.find((n) => n.name === partName);

      if (!existing) {
        existing = {
          name: partName,
          path: partPath,
          isDirectory: isLast ? file.isDirectory : true,
          children: [],
          depth: i,
        };
        currentLevel.push(existing);
      }

      if (!isLast) {
        currentLevel = existing.children;
      }
    }
  }

  return root;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  return createPortal(
    <div className="skill-file-editor__dialog-overlay">
      <div className="skill-file-editor__dialog-backdrop" onClick={onClose} />
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
  skillName,
  isOpen,
  onClose,
  onSave,
  mode = "modal",
}: SkillFileEditorProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const isInline = mode === "inline";

  // State
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [modifiedFiles, setModifiedFiles] = useState<Record<string, string>>(
    {},
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Dialog states
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [deleteDialogFile, setDeleteDialogFile] = useState<string | null>(null);
  const [dialogInput, setDialogInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load files
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.api.skill.readLocalFiles(skillId);
      setFiles(result);
      // Auto-expand all directories
      const dirs = result.filter((f) => f.isDirectory).map((f) => f.path);
      setExpandedDirs(new Set(dirs));
    } catch (e) {
      console.error("Failed to load skill files:", e);
    } finally {
      setIsLoading(false);
    }
  }, [skillId]);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
      setSelectedFile(null);
      setModifiedFiles({});
      setEditorTab("edit");
    }
  }, [isOpen, loadFiles]);

  // Build tree
  const tree = useMemo(() => buildTree(files), [files]);

  // Current file data
  const currentFile = useMemo(() => {
    if (!selectedFile) return null;
    return files.find((f) => f.path === selectedFile && !f.isDirectory) || null;
  }, [files, selectedFile]);

  const currentContent = useMemo(() => {
    if (!selectedFile) return "";
    if (selectedFile in modifiedFiles) return modifiedFiles[selectedFile];
    return currentFile?.content || "";
  }, [selectedFile, modifiedFiles, currentFile]);

  const isModified = useCallback(
    (path: string) => path in modifiedFiles,
    [modifiedFiles],
  );

  const hasAnyUnsaved = useMemo(
    () => Object.keys(modifiedFiles).length > 0,
    [modifiedFiles],
  );

  // Edit content
  const handleContentChange = useCallback(
    (newContent: string) => {
      if (!selectedFile) return;
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
    [selectedFile, currentFile],
  );

  // Save current file
  const saveCurrentFile = useCallback(async () => {
    if (!selectedFile || !(selectedFile in modifiedFiles)) return;
    setIsSaving(true);
    try {
      await window.api.skill.writeLocalFile(
        skillId,
        selectedFile,
        modifiedFiles[selectedFile],
      );
      // Update local state
      setFiles((prev) =>
        prev.map((f) =>
          f.path === selectedFile
            ? { ...f, content: modifiedFiles[selectedFile] }
            : f,
        ),
      );
      setModifiedFiles((prev) => {
        const next = { ...prev };
        delete next[selectedFile];
        return next;
      });
      showToast(t("skill.fileSaved", "File saved"), "success");
      onSave?.();
    } catch (e) {
      console.error("Failed to save file:", e);
      showToast(`${t("skill.updateFailed", "Update failed")}: ${e}`, "error");
    } finally {
      setIsSaving(false);
    }
  }, [selectedFile, modifiedFiles, skillId, showToast, t, onSave]);

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
        // Warn about unsaved changes before closing
        // 关闭前提醒用户未保存的修改
        if (Object.keys(modifiedFiles).length > 0) {
          const confirmed = window.confirm(
            t(
              "skill.unsavedChangesWarning",
              "You have unsaved changes. Discard and close?",
            ),
          );
          if (!confirmed) return;
        }
        onClose();
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
    modifiedFiles,
    t,
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
    const name = dialogInput.trim();
    if (!name) return;
    try {
      // If path has intermediate dirs, create them first
      const dirParts = name.split("/");
      if (dirParts.length > 1) {
        const dirPath = dirParts.slice(0, -1).join("/");
        await window.api.skill.createLocalDir(skillId, dirPath);
      }
      await window.api.skill.writeLocalFile(skillId, name, "");
      await loadFiles();
      setSelectedFile(name);
      setEditorTab("edit");
      setNewFileDialogOpen(false);
      setDialogInput("");
    } catch (e) {
      console.error("Failed to create file:", e);
      showToast(`Failed to create file: ${e}`, "error");
    }
  }, [dialogInput, skillId, loadFiles, showToast]);

  // New folder
  const handleNewFolder = useCallback(async () => {
    const name = dialogInput.trim();
    if (!name) return;
    try {
      await window.api.skill.createLocalDir(skillId, name);
      await loadFiles();
      setExpandedDirs((prev) => new Set([...prev, name]));
      setNewFolderDialogOpen(false);
      setDialogInput("");
    } catch (e) {
      console.error("Failed to create folder:", e);
      showToast(`Failed to create folder: ${e}`, "error");
    }
  }, [dialogInput, skillId, loadFiles, showToast]);

  // Delete file
  const handleDeleteFile = useCallback(async () => {
    if (!deleteDialogFile) return;
    try {
      await window.api.skill.deleteLocalFile(skillId, deleteDialogFile);
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
    } catch (e) {
      console.error("Failed to delete file:", e);
      showToast(`Failed to delete file: ${e}`, "error");
    }
  }, [deleteDialogFile, skillId, selectedFile, loadFiles, showToast]);

  // Open in system file manager
  const handleOpenInExplorer = useCallback(async () => {
    try {
      const repoPath = await window.api.skill.getRepoPath(skillId);
      if (!repoPath) {
        showToast(t("skill.noLocalRepo", "No local repository found"), "error");
        return;
      }
      window.electron?.openPath?.(repoPath);
    } catch (e) {
      console.error("Failed to open in file manager:", e);
    }
  }, [skillId, showToast, t]);

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
            className={`skill-file-editor__tree-item skill-file-editor__tree-item--directory ${depthClass}`}
            onClick={() => toggleDir(node.path)}
          >
            <ChevronRightIcon
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
      <button
        key={node.path}
        className={`skill-file-editor__tree-item ${depthClass} ${
          isActive ? "skill-file-editor__tree-item--active" : ""
        }`}
        onClick={() => {
          setSelectedFile(node.path);
          setEditorTab("edit");
        }}
      >
        {getFileIcon(node.name, false, false)}
        <span className="skill-file-editor__tree-item-name">{node.name}</span>
        {modified && <span className="skill-file-editor__tree-item-dot" />}
        <div
          role="button"
          tabIndex={0}
          className="skill-file-editor__tree-item-delete"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteDialogFile(node.path);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              setDeleteDialogFile(node.path);
            }
          }}
          title={t("skill.deleteFile", "Delete File")}
        >
          <Trash2Icon style={{ width: "0.75rem", height: "0.75rem" }} />
        </div>
      </button>
    );
  };

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
            <div className="skill-file-editor__tree-actions">
              <button
                className="skill-file-editor__tree-btn"
                onClick={() => {
                  setDialogInput("");
                  setNewFileDialogOpen(true);
                }}
                title={t("skill.newFile", "New File")}
              >
                <FilePlusIcon
                  style={{ width: "0.875rem", height: "0.875rem" }}
                />
              </button>
              <button
                className="skill-file-editor__tree-btn"
                onClick={() => {
                  setDialogInput("");
                  setNewFolderDialogOpen(true);
                }}
                title={t("skill.newFolder", "New Folder")}
              >
                <FolderPlusIcon
                  style={{ width: "0.875rem", height: "0.875rem" }}
                />
              </button>
            </div>
          </div>

          <div className="skill-file-editor__tree-list">
            {isLoading ? (
              <div className="skill-file-editor__loading">
                <Loader2Icon style={{ width: "1rem", height: "1rem" }} />
              </div>
            ) : tree.length === 0 ? (
              <div className="skill-file-editor__tree-empty">
                <FileIcon
                  style={{ width: "1.5rem", height: "1.5rem", opacity: 0.4 }}
                />
                <span>
                  {t("skill.noFiles", "No local files for this skill")}
                </span>
              </div>
            ) : (
              tree.map((node) => renderTreeNode(node))
            )}
          </div>

          <div className="skill-file-editor__tree-footer">
            <button
              className="skill-file-editor__open-explorer-btn"
              onClick={handleOpenInExplorer}
            >
              <ExternalLinkIcon
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
                  : t("skill.noFiles", "No local files for this skill")}
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
                  <button
                    className={`skill-file-editor__editor-tab ${
                      editorTab === "edit"
                        ? "skill-file-editor__editor-tab--active"
                        : ""
                    }`}
                    onClick={() => setEditorTab("edit")}
                  >
                    {t("prompt.edit", "Edit")}
                  </button>
                  {isMarkdownFile(selectedFile) && (
                    <button
                      className={`skill-file-editor__editor-tab ${
                        editorTab === "preview"
                          ? "skill-file-editor__editor-tab--active"
                          : ""
                      }`}
                      onClick={() => setEditorTab("preview")}
                    >
                      {t("prompt.preview", "Preview")}
                    </button>
                  )}
                  <button
                    className="skill-file-editor__editor-tab"
                    onClick={saveCurrentFile}
                    disabled={isSaving || !isModified(selectedFile)}
                    style={{
                      opacity: isSaving || !isModified(selectedFile) ? 0.4 : 1,
                    }}
                    title="Cmd/Ctrl+S"
                  >
                    {isSaving ? (
                      <Loader2Icon
                        style={{
                          width: "0.875rem",
                          height: "0.875rem",
                          animation: "spin 1s linear infinite",
                        }}
                      />
                    ) : (
                      <SaveIcon
                        style={{ width: "0.875rem", height: "0.875rem" }}
                      />
                    )}
                  </button>
                </div>
              </div>

              {/* Editor content */}
              <div className="skill-file-editor__editor-content">
                {editorTab === "edit" ? (
                  isMarkdownFile(selectedFile) ? (
                    <Textarea
                      ref={textareaRef}
                      value={currentContent}
                      onChange={(e) => handleContentChange(e.target.value)}
                      enableMarkdownList
                      className="skill-file-editor__textarea"
                      style={{ minHeight: "100%", borderRadius: 0 }}
                    />
                  ) : (
                    <textarea
                      ref={textareaRef}
                      className="skill-file-editor__textarea"
                      value={currentContent}
                      onChange={(e) => handleContentChange(e.target.value)}
                      spellCheck={false}
                    />
                  )
                ) : (
                  <div className="skill-file-editor__preview">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {currentContent ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                        >
                          {currentContent}
                        </ReactMarkdown>
                      ) : (
                        <div className="text-muted-foreground text-sm italic">
                          {t("skill.noContent", "No content")}
                        </div>
                      )}
                    </div>
                  </div>
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
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--cancel"
            onClick={() => setNewFileDialogOpen(false)}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
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
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--cancel"
            onClick={() => setNewFolderDialogOpen(false)}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
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
        title={t("skill.deleteFile", "Delete File")}
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
            "skill.deleteFileConfirm",
            "Are you sure you want to delete this file? This action cannot be undone.",
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
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--cancel"
            onClick={() => setDeleteDialogFile(null)}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            className="skill-file-editor__dialog-btn skill-file-editor__dialog-btn--destructive"
            onClick={handleDeleteFile}
          >
            {t("common.delete", "Delete")}
          </button>
        </div>
      </SimpleDialog>
    </>
  );

  // ─── Inline mode: render as a plain panel ─────────────
  if (isInline) {
    return (
      <div className="skill-file-editor skill-file-editor--inline">
        {editorBody}
      </div>
    );
  }

  // ─── Modal mode: render in a portal with overlay ──────
  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          // Warn about unsaved changes before closing via backdrop click
          // 通过背景点击关闭前提醒用户未保存的修改
          if (Object.keys(modifiedFiles).length > 0) {
            const confirmed = window.confirm(
              t(
                "skill.unsavedChangesWarning",
                "You have unsaved changes. Discard and close?",
              ),
            );
            if (!confirmed) return;
          }
          onClose?.();
        }}
      />

      {/* Modal */}
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200 skill-file-editor">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            {t("skill.fileEditor", "File Editor")}
            <span className="text-xs font-normal text-muted-foreground">
              —{" "}
              {skillName ||
                (skillId.length > 16
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
              onClick={() => {
                // Warn about unsaved changes before closing via X button
                // 通过 X 按钮关闭前提醒用户未保存的修改
                if (Object.keys(modifiedFiles).length > 0) {
                  const confirmed = window.confirm(
                    t(
                      "skill.unsavedChangesWarning",
                      "You have unsaved changes. Discard and close?",
                    ),
                  );
                  if (!confirmed) return;
                }
                onClose?.();
              }}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {editorBody}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
