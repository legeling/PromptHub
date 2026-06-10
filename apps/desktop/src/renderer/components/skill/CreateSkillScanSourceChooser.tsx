import type { TFunction } from "i18next";
import { BotIcon, FolderOpenIcon, LoaderIcon } from "lucide-react";

interface CreateSkillScanSourceChooserProps {
  isScanning: boolean;
  onChooseLocalFolder: () => void | Promise<void>;
  onImportFromAgents: () => void;
  t: TFunction;
}

export function CreateSkillScanSourceChooser({
  isScanning,
  onChooseLocalFolder,
  onImportFromAgents,
  t,
}: CreateSkillScanSourceChooserProps) {
  return (
    <div className="space-y-3">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">
          {t("skill.scanLocalChoicesTitle", "Choose local import source")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "skill.scanLocalChoicesHint",
            "Agent skill folders and arbitrary local skill folders are handled separately.",
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onImportFromAgents}
        className="w-full flex items-center gap-4 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group text-left"
      >
        <div className="p-3 bg-background rounded-lg group-hover:bg-primary/10 transition-colors">
          <BotIcon aria-hidden="true" className="w-6 h-6 text-foreground" />
        </div>
        <div>
          <h3 className="font-medium text-foreground">
            {t("skill.importFromAgentSkills", "Import from Agent Skills")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "skill.importFromAgentSkillsDesc",
              "Open the Agent Skill manager and import skills from Claude, Cline, Codex, or other agent folders.",
            )}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => void onChooseLocalFolder()}
        disabled={isScanning}
        className="w-full flex items-center gap-4 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group text-left disabled:opacity-60"
      >
        <div className="p-3 bg-background rounded-lg group-hover:bg-primary/10 transition-colors">
          {isScanning ? (
            <LoaderIcon
              aria-hidden="true"
              className="w-6 h-6 animate-spin text-foreground"
            />
          ) : (
            <FolderOpenIcon
              aria-hidden="true"
              className="w-6 h-6 text-foreground"
            />
          )}
        </div>
        <div>
          <h3 className="font-medium text-foreground">
            {t("skill.chooseLocalSkillFolder", "Choose Folder and Import")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "skill.chooseLocalSkillFolderDesc",
              "Select a folder such as /xxx/skills, then scan the skill folders inside it.",
            )}
          </p>
        </div>
      </button>
    </div>
  );
}
