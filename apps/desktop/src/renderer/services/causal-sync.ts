import type {
  CausalSyncResolution,
  DesktopCausalSyncRequest,
  DesktopCausalSyncResult,
} from "@prompthub/shared/types/causal-sync";
import i18n from "i18next";
import type { SyncResult } from "./sync-backup-core";
import {
  presentSyncReview,
  useSyncReviewStore,
} from "../stores/sync-review.store";

async function refreshSyncedWorkspace(): Promise<void> {
  const [
    { usePromptStore },
    { useFolderStore },
    { useSkillStore },
    { useMcpStore },
    { usePluginStore },
    { useRulesStore },
    { useAgentProviderStore },
    { loadSettingsFromMainProcess },
    { loadGenerationBatches },
  ] = await Promise.all([
    import("../stores/prompt.store"),
    import("../stores/folder.store"),
    import("../stores/skill.store"),
    import("../stores/mcp.store"),
    import("../stores/plugin.store"),
    import("../stores/rules.store"),
    import("../stores/agent-provider.store"),
    import("../stores/settings.store"),
    import("./generation-workbench-runner"),
  ]);
  const provider = useAgentProviderStore.getState();
  await Promise.all([
    usePromptStore.getState().fetchPrompts(),
    usePromptStore.getState().fetchRelations(),
    usePromptStore.getState().fetchOutputFormatItems(),
    useFolderStore.getState().fetchFolders(),
    useSkillStore.getState().loadSkills(),
    useMcpStore.getState().load(),
    usePluginStore.getState().load({ force: true }),
    useRulesStore.getState().refreshFromSync(),
    provider.platformId
      ? provider.load(provider.platformId)
      : Promise.resolve(),
    loadSettingsFromMainProcess(),
    loadGenerationBatches(),
  ]);
  const { refreshCanonicalSources } = await import("./renderer-persistence");
  await refreshCanonicalSources();
}

export async function runDesktopCausalSync(
  provider: DesktopCausalSyncRequest["provider"],
  resolution?: CausalSyncResolution,
): Promise<SyncResult> {
  const invoke = window.electron?.causalSync;
  if (!invoke)
    return { success: false, message: i18n.t("syncReview.unavailable") };
  const { flushRendererPersistence } = await import("./renderer-persistence");
  await flushRendererPersistence();
  const result: DesktopCausalSyncResult = await invoke({
    provider,
    resolution,
  });
  if (result.status === "conflict" || result.status === "baseline-required")
    presentSyncReview(provider, result);
  if (result.status === "committed") {
    if (useSyncReviewStore.getState().pending?.provider === provider)
      useSyncReviewStore.setState({ pending: null, isOpen: false });
    if (result.localChanged) await refreshSyncedWorkspace();
    return {
      success: true,
      localChanged: result.localChanged,
      message: i18n.t("syncReview.completed"),
    };
  }
  const message =
    result.status === "unsupported"
      ? "unsupported"
      : result.status === "conflict" || result.status === "baseline-required"
        ? "required"
        : result.status === "review-changed" ||
            result.status === "remote-changed" ||
            result.status === "local-changed"
          ? "changed"
          : result.status === "uncertain"
            ? "uncertain"
            : "failed";
  return { success: false, message: i18n.t(`syncReview.${message}`) };
}
