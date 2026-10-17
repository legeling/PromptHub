import { useTranslation } from "react-i18next";
import type { AgentRootAssetPreview } from "../../services/agent-root-paths";

interface BuiltinAgentDetailsProps {
  detailsId: string;
  preview: AgentRootAssetPreview;
}

export function BuiltinAgentDetails({
  detailsId,
  preview,
}: BuiltinAgentDetailsProps) {
  const { t } = useTranslation();

  return (
    <div
      id={detailsId}
      className="grid gap-2 rounded-lg bg-muted/30 p-3 text-[11px] text-muted-foreground"
    >
      <div>
        {t("settings.platformDerivedSkillPath", "Derived skills path")}:
        <span className="ml-1 font-mono">
          {preview.skillScanPaths.join(", ")}
        </span>
      </div>
      {preview.ruleCandidates.length > 0 ? (
        <div>
          {t("settings.platformDerivedRulesPath", "Derived rules path")}:
          <span className="ml-1 font-mono">
            {preview.ruleCandidates.join(", ")}
          </span>
        </div>
      ) : null}
      {preview.configCandidates.length > 0 ? (
        <div>
          {t("settings.platformDerivedConfigPath", "Derived config files")}:
          <span className="ml-1 font-mono">
            {preview.configCandidates.join(", ")}
          </span>
        </div>
      ) : null}
      <div>
        {t("settings.agentDerivedMcpConfigPaths", "Derived MCP config paths")}:
        <span className="ml-1 font-mono">
          {preview.mcpConfigPaths.join(", ")}
        </span>
      </div>
      {preview.pluginDirectories.length > 0 ? (
        <div>
          {t("settings.agentDerivedPluginDirs", "Derived Plugin directories")}:
          <span className="ml-1 font-mono">
            {preview.pluginDirectories.join(", ")}
          </span>
        </div>
      ) : null}
      {preview.agentDirectories.length > 0 ? (
        <div>
          {t("settings.agentDerivedAgentDirs", "Derived agent directories")}:
          <span className="ml-1 font-mono">
            {preview.agentDirectories.join(", ")}
          </span>
        </div>
      ) : null}
      {preview.commandDirectories.length > 0 ? (
        <div>
          {t("settings.agentDerivedCommandDirs", "Derived command directories")}
          :
          <span className="ml-1 font-mono">
            {preview.commandDirectories.join(", ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
