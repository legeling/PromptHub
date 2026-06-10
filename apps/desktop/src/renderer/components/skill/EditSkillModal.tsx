import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import {
  XIcon,
  HashIcon,
  SaveIcon,
  LoaderIcon,
  AlertCircleIcon,
  Maximize2Icon,
  Minimize2Icon,
  FolderOpenIcon,
} from "lucide-react";
import { useSkillStore } from "../../stores/skill.store";
import type { Skill } from "@prompthub/shared/types";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { Spinner } from "../ui";
import { SkillIconPicker } from "./SkillIconPicker";
import { SKILL_NAME_REGEX } from "./detail-utils";
import {
  getExistingSkillTags,
  getUserSkillTags,
  inferOriginalSkillTags,
} from "./skill-modal-utils";

const LazySkillFileEditor = lazy(() =>
  import("./SkillFileEditor").then((module) => ({
    default: module.SkillFileEditor,
  })),
);

interface EditSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  skill: Skill | null;
}

export function EditSkillModal({
  isOpen,
  onClose,
  skill,
}: EditSkillModalProps) {
  const { t } = useTranslation();
  const updateSkill = useSkillStore((state) => state.updateSkill);
  const existingSkills = useSkillStore((state) => state.skills);
  const nameInputId = "edit-skill-name";
  const nameHintId = "edit-skill-name-hint";
  const nameErrorId = "edit-skill-name-error";
  const descriptionInputId = "edit-skill-description";
  const authorInputId = "edit-skill-author";
  const tagInputId = "edit-skill-tag";
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [iconUrl, setIconUrl] = useState<string | undefined>(undefined);
  const [iconEmoji, setIconEmoji] = useState<string | undefined>(undefined);
  const [iconBackground, setIconBackground] = useState<string | undefined>(
    undefined,
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Name validation state
  const [nameError, setNameError] = useState<string | null>(null);

  // Editor view state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFileEditorOpen, setIsFileEditorOpen] = useState(false);

  // Ref to hold save handler (defined after conditional return but needed in useEffect)
  const saveRef = useRef<() => void>(() => {});
  const existingTags = useMemo(
    () => getExistingSkillTags(existingSkills),
    [existingSkills],
  );

  // Initialize form when skill changes
  useEffect(() => {
    if (skill) {
      setName(skill.name || "");
      setDescription(skill.description || "");
      setAuthor(skill.author || "");
      setIconUrl(skill.icon_url || undefined);
      setIconEmoji(skill.icon_emoji || undefined);
      setIconBackground(skill.icon_background || undefined);
      setTags(getUserSkillTags(skill));
      setError(null);
      setNameError(null);
    }
  }, [skill]);

  // All hooks MUST be declared before any conditional return
  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !skill) return null;

  const hasUnsavedChanges = () => {
    return (
      name !== (skill.name || "") ||
      description !== (skill.description || "") ||
      author !== (skill.author || "") ||
      iconUrl !== (skill.icon_url || undefined) ||
      iconEmoji !== (skill.icon_emoji || undefined) ||
      iconBackground !== (skill.icon_background || undefined) ||
      JSON.stringify(tags) !== JSON.stringify(getUserSkillTags(skill))
    );
  };

  const handleCloseRequest = () => {
    if (hasUnsavedChanges()) {
      setShowUnsavedDialog(true);
    } else {
      handleClose();
    }
  };

  const validateName = (value: string): boolean => {
    if (!value.trim()) {
      setNameError(t("skill.nameRequired", "Please enter a skill name"));
      return false;
    }
    if (value.length > 64) {
      setNameError(
        t("skill.nameTooLong", "Name must not exceed 64 characters"),
      );
      return false;
    }
    if (!SKILL_NAME_REGEX.test(value)) {
      setNameError(
        t(
          "skill.nameInvalid",
          "Invalid name format (only lowercase letters, numbers, and hyphens)",
        ),
      );
      return false;
    }
    setNameError(null);
    return true;
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    // Validate
    if (!validateName(name)) return;

    setIsLoading(true);
    setError(null);

    try {
      await updateSkill(skill.id, {
        name,
        description: description.trim(),
        author: author.trim() || undefined,
        icon_url: iconUrl,
        icon_emoji: iconEmoji,
        icon_background: iconBackground,
        original_tags: inferOriginalSkillTags(skill),
        tags,
      });

      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("skill.updateFailed", "Update failed"),
      );
    } finally {
      setIsLoading(false);
    }
  };
  saveRef.current = handleSave;

  const handleClose = () => {
    setError(null);
    setNameError(null);
    setIsFullscreen(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        data-testid="edit-skill-backdrop"
        role="presentation"
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCloseRequest}
      />

      {/* Modal */}
      <div
        className={`relative app-wallpaper-panel-strong rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-base flex flex-col transition-all ${
          isFullscreen ? "w-[95vw] h-[95vh]" : "w-full max-w-2xl max-h-[90vh]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">
            {t("skill.editMetadata", "Edit Skill Metadata")}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={
                isFullscreen
                  ? t("common.exitFullscreen", "Exit Fullscreen")
                  : t("common.fullscreen", "Fullscreen")
              }
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              title={
                isFullscreen
                  ? t("common.exitFullscreen", "Exit Fullscreen")
                  : t("common.fullscreen", "Fullscreen")
              }
            >
              {isFullscreen ? (
                <Minimize2Icon aria-hidden="true" className="w-4 h-4" />
              ) : (
                <Maximize2Icon aria-hidden="true" className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              aria-label={t("common.close", "Close")}
              onClick={handleCloseRequest}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <XIcon aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center gap-2">
              <AlertCircleIcon
                aria-hidden="true"
                className="w-4 h-4 shrink-0"
              />
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label
              htmlFor={nameInputId}
              className="block text-sm font-medium mb-2"
            >
              {t("skill.skillName", "Skill Name")}{" "}
              <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
              id={nameInputId}
              type="text"
              value={name}
              aria-invalid={nameError ? "true" : undefined}
              aria-describedby={nameError ? nameErrorId : nameHintId}
              onChange={(e) => {
                const value = e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "");
                setName(value);
                if (value) validateName(value);
              }}
              placeholder="my-skill-name"
              className={`w-full px-4 py-2.5 bg-muted/50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                nameError ? "border-destructive" : "border-border"
              }`}
            />
            {nameError && (
              <p
                id={nameErrorId}
                className="mt-1.5 text-xs text-destructive flex items-center gap-1"
              >
                <AlertCircleIcon aria-hidden="true" className="w-3 h-3" />
                {nameError}
              </p>
            )}
            <p id={nameHintId} className="mt-1.5 text-xs text-muted-foreground">
              {t(
                "skill.nameHint",
                "Lowercase letters, numbers, and hyphens only, e.g. my-skill-name",
              )}
            </p>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor={descriptionInputId}
              className="block text-sm font-medium mb-2"
            >
              {t("skill.skillDescription", "Description")}
            </label>
            <input
              id={descriptionInputId}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(
                "skill.descriptionPlaceholder",
                "Briefly describe what this skill does",
              )}
              className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <SkillIconPicker
            name={name}
            iconUrl={iconUrl}
            iconEmoji={iconEmoji}
            iconBackground={iconBackground}
            onChange={({
              iconUrl: nextIconUrl,
              iconEmoji: nextIconEmoji,
              iconBackground: nextIconBackground,
            }) => {
              setIconUrl(nextIconUrl);
              setIconEmoji(nextIconEmoji);
              setIconBackground(nextIconBackground);
            }}
          />

          <div>
            <label
              htmlFor={authorInputId}
              className="block text-sm font-medium mb-2"
            >
              {t("skill.author", "Author")}
            </label>
            <input
              id={authorInputId}
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder={t("skill.authorPlaceholder", "Author name")}
              className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label
              htmlFor={tagInputId}
              className="block text-sm font-medium text-foreground"
            >
              {t("skill.tagsOptional", "Tags (Optional)")}
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-white"
                >
                  <HashIcon aria-hidden="true" className="w-3 h-3" />
                  {tag}
                  <button
                    type="button"
                    aria-label={t("skill.removeTagWithName", {
                      tag,
                      defaultValue: "Remove tag {{tag}}",
                    })}
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:text-white/70"
                  >
                    <XIcon aria-hidden="true" className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            {existingTags.length > 0 && (
              <div className="mb-2">
                <div className="text-xs text-muted-foreground mb-1.5">
                  {t("skill.selectExistingTags", "选择已有标签：")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {existingTags
                    .filter((existingTag) => !tags.includes(existingTag))
                    .map((existingTag) => (
                      <button
                        key={existingTag}
                        type="button"
                        aria-label={t("skill.addExistingTag", {
                          tag: existingTag,
                          defaultValue: "Add existing tag {{tag}}",
                        })}
                        onClick={() => setTags([...tags, existingTag])}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted hover:bg-accent transition-colors"
                      >
                        <HashIcon aria-hidden="true" className="w-3 h-3" />
                        {existingTag}
                      </button>
                    ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <input
                id={tagInputId}
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={t("skill.enterTagHint", "输入新标签后按回车")}
                className="flex-1 h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all duration-base"
              />
              <button
                type="button"
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
                className="px-3 py-2 bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {t("skill.addTag", "添加标签")}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-accent/20 p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium">
                  {t(
                    "skill.instructionsManagedInFiles",
                    "指令内容在文件编辑器中维护",
                  )}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-5">
                  {t(
                    "skill.instructionsManagedInFilesHint",
                    "SKILL.md 和其他文件请在文件页或文件编辑器里直接修改。这里仅编辑名称、描述、作者、标签等元数据。",
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFileEditorOpen(true)}
                className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <FolderOpenIcon aria-hidden="true" className="w-4 h-4" />
                {t("skill.openFileEditor", "打开文件编辑器")}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0 app-wallpaper-surface">
          <button
            type="button"
            onClick={handleCloseRequest}
            className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            {t("common.cancel", "取消")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !!nameError}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <LoaderIcon
                aria-hidden="true"
                className="w-4 h-4 animate-spin"
              />
            ) : (
              <SaveIcon aria-hidden="true" className="w-4 h-4" />
            )}
            {t("common.save", "保存")}
          </button>
        </div>
      </div>
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onSave={() => {
          setShowUnsavedDialog(false);
          handleSave();
        }}
        onDiscard={() => {
          setShowUnsavedDialog(false);
          handleClose();
        }}
      />
      {skill && isFileEditorOpen ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30">
              <Spinner
                size="lg"
                tone="current"
                label={t("common.loading", "Loading...")}
                className="text-white"
              />
            </div>
          }
        >
          <LazySkillFileEditor
            skillId={skill.id}
            skillName={skill.name}
            isOpen={isFileEditorOpen}
            onClose={() => setIsFileEditorOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
