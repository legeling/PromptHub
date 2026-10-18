import type { ChangeEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { getRuntimeCapabilities } from "../../runtime";
import {
  BrainIcon,
  EditIcon,
  FolderOpenIcon,
  GithubIcon,
  Minimize2Icon,
  SaveIcon,
  UploadIcon,
} from "lucide-react";
import { SkillMarkdown } from "./SkillMarkdown";
import type { CreateMode } from "./useCreateSkillModalController";

interface CreateSkillFullscreenEditorProps {
  fileInputRef: RefObject<HTMLInputElement>;
  instructions: string;
  isLoading: boolean;
  name: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onCreate: () => void | Promise<void>;
  onExit: () => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onInstructionsChange: (value: string) => void;
}

export function CreateSkillFullscreenEditor({
  fileInputRef,
  instructions,
  isLoading,
  name,
  textareaRef,
  onCreate,
  onExit,
  onFileUpload,
  onInstructionsChange,
}: CreateSkillFullscreenEditorProps) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">
            {t("skill.instructions", "Instructions (SKILL.md)")}
          </h2>
          <span className="text-sm text-muted-foreground">
            {t("common.markdownSupported", "Supports Markdown")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
          >
            <UploadIcon className="w-4 h-4" aria-hidden="true" />
            {t("skill.uploadMd", "Upload .md")}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted text-sm font-medium transition-colors"
          >
            <Minimize2Icon className="w-4 h-4" aria-hidden="true" />
            {t("common.exitFullscreen", "Exit Fullscreen")}
          </button>
          <button
            type="button"
            onClick={() => {
              void onCreate();
              onExit();
            }}
            disabled={isLoading || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <SaveIcon className="w-4 h-4" aria-hidden="true" />
            {t("skill.create", "Create")}
          </button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 border-r border-border flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
            {t("prompt.edit", "Edit")}
          </div>
          <textarea
            ref={textareaRef}
            className="flex-1 w-full p-6 resize-none bg-background border-none outline-none text-base font-mono leading-relaxed"
            value={instructions}
            onChange={(event) => onInstructionsChange(event.target.value)}
            autoFocus
            placeholder={t(
              "skill.instructionsPlaceholder",
              "Enter skill instructions or SKILL.md content...",
            )}
          />
        </div>
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground shrink-0">
            {t("prompt.preview", "Preview")}
          </div>
          <div className="flex-1 overflow-auto p-6">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {instructions ? (
                <SkillMarkdown content={instructions} enableHighlight />
              ) : (
                <div className="text-muted-foreground text-sm italic">
                  {t("skill.noContent", "No content")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        aria-label={t("skill.uploadMd", "Upload .md")}
        accept=".md,.markdown,.txt"
        className="hidden"
        onChange={onFileUpload}
      />
    </div>
  );
}

export function CreateSkillMethodSelection({
  canScanLocal,
  onSelectMode,
  onSelectGit,
}: {
  canScanLocal: boolean;
  onSelectMode: (mode: CreateMode) => void;
  onSelectGit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        {t("skill.chooseAddMethod", "Choose how you want to add a new skill:")}
      </p>
      <MethodButton
        accent
        icon={<BrainIcon className="w-6 h-6 text-white" aria-hidden="true" />}
        title={t("skill.aiCreate", "AI Draft")}
        badge="skill-creator"
        description={t(
          "skill.aiCreateDesc",
          "Describe what you need, AI drafts the SKILL.md for review",
        )}
        onClick={() => onSelectMode("ai")}
      />
      {getRuntimeCapabilities().skillRemoteImport ? (
        <MethodButton
          icon={<GithubIcon className="w-6 h-6 text-foreground" aria-hidden />}
          title={t("skill.installFromGithub", "Install from Git Repository")}
          description={t(
            "skill.githubDesc",
            "Paste a GitHub, Gitea, or self-hosted Git repository URL",
          )}
          onClick={onSelectGit}
        />
      ) : null}
      <MethodButton
        icon={<EditIcon className="w-6 h-6 text-foreground" aria-hidden />}
        title={t("skill.createManually", "Create Manually")}
        description={t("skill.manualDesc", "Build a skill from scratch")}
        onClick={() => onSelectMode("manual")}
      />
      {canScanLocal ? (
        <MethodButton
          icon={
            <FolderOpenIcon className="w-6 h-6 text-foreground" aria-hidden />
          }
          title={t("skill.scanLocal", "Scan Local")}
          description={t(
            "skill.scanLocalDesc",
            "Detect existing SKILL.md files",
          )}
          onClick={() => onSelectMode("scan")}
        />
      ) : null}
    </div>
  );
}

function MethodButton({
  accent = false,
  badge,
  description,
  icon,
  title,
  onClick,
}: {
  accent?: boolean;
  badge?: string;
  description: string;
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors group text-left ${
        accent
          ? "bg-primary/5 hover:bg-primary/10 border border-primary/30"
          : "bg-accent/50 hover:bg-accent border border-border"
      }`}
    >
      <div
        className={`p-3 rounded-lg ${
          accent
            ? "bg-primary"
            : "bg-background group-hover:bg-primary/10 transition-colors"
        }`}
      >
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-foreground flex items-center gap-2">
          {title}
          {badge ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-normal">
              {badge}
            </span>
          ) : null}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
