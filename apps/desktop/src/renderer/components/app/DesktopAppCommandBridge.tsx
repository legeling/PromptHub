import { useCallback, useEffect, useState } from "react";
import { openNotificationTarget } from "./application-notification-feedback";
import type { AgentAssetCommand, AppCommand } from "@prompthub/shared/types";

import { AgentDeepLinkImportDialog } from "../agent/AgentDeepLinkImportDialog";
import { useAgentStore } from "../../stores/agent.store";
import { useUIStore, type AppModule } from "../../stores/ui.store";
import {
  APP_ASSET_WORKFLOW_READY_EVENT,
  type AssetWorkflowReadyEventDetail,
  dispatchAgentAssetCommand,
  dispatchQuickAddPrompt,
} from "./app-command-events";

type PageType = "home" | "settings";
type WorkflowCommand =
  | AgentAssetCommand
  | Extract<
      AppCommand,
      {
        type: "prompt:quick-add";
      }
    >;

interface DesktopAppCommandBridgeProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
  onOpenUpdater: () => void;
}

function getTargetModule(command: WorkflowCommand): AppModule {
  if (command.type === "prompt:quick-add") {
    return "prompt";
  }
  return command.asset === "rule" ? "rules" : command.asset;
}

export function DesktopAppCommandBridge({
  currentPage,
  onNavigate,
  onOpenUpdater,
}: DesktopAppCommandBridgeProps) {
  const appModule = useUIStore((state) => state.appModule);
  const setAppModule = useUIStore((state) => state.setAppModule);
  const [pendingWorkflow, setPendingWorkflow] =
    useState<WorkflowCommand | null>(null);
  const [pendingAgentDeepLink, setPendingAgentDeepLink] = useState<Extract<
    AppCommand,
    { type: "agent:import-provider" | "agent:import-error" }
  > | null>(null);
  const [readyWorkflows, setReadyWorkflows] = useState<Set<"mcp" | "plugin">>(
    () => new Set(),
  );

  const handleCommand = useCallback(
    (command: AppCommand) => {
      switch (command.type) {
        case "notification:open":
          openNotificationTarget(command, onNavigate, onOpenUpdater);
          return;
        case "settings:open":
          onNavigate("settings");
          return;
        case "updater:open":
          onOpenUpdater();
          return;
        case "agent:manage":
          onNavigate("home");
          setAppModule("agents");
          return;
        case "agent:import-provider":
          onNavigate("home");
          setAppModule("agents");
          useAgentStore
            .getState()
            .selectAgent(command.preview.profile.platformId);
          setPendingAgentDeepLink(command);
          return;
        case "agent:import-error":
          onNavigate("home");
          setAppModule("agents");
          setPendingAgentDeepLink(command);
          return;
        case "asset:create":
        case "asset:manage":
        case "prompt:quick-add":
          onNavigate("home");
          setAppModule(getTargetModule(command));
          setPendingWorkflow(command);
      }
    },
    [onNavigate, onOpenUpdater, setAppModule],
  );

  useEffect(() => {
    const unsubscribe = window.electron?.onAppCommand?.(handleCommand);
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [handleCommand]);

  useEffect(() => {
    const handleReady = (event: Event) => {
      const { asset, ready } = (
        event as CustomEvent<AssetWorkflowReadyEventDetail>
      ).detail;
      setReadyWorkflows((current) => {
        const next = new Set(current);
        if (ready) {
          next.add(asset);
        } else {
          next.delete(asset);
        }
        return next;
      });
    };
    document.addEventListener(APP_ASSET_WORKFLOW_READY_EVENT, handleReady);
    return () => {
      document.removeEventListener(APP_ASSET_WORKFLOW_READY_EVENT, handleReady);
    };
  }, []);

  useEffect(() => {
    const targetModule = pendingWorkflow
      ? getTargetModule(pendingWorkflow)
      : null;
    const requiresReadyWorkflow =
      targetModule === "mcp" || targetModule === "plugin";
    if (
      !pendingWorkflow ||
      currentPage !== "home" ||
      appModule !== targetModule ||
      (requiresReadyWorkflow && !readyWorkflows.has(targetModule))
    ) {
      return;
    }

    if (pendingWorkflow.type === "prompt:quick-add") {
      dispatchQuickAddPrompt(pendingWorkflow.mode);
    } else {
      dispatchAgentAssetCommand(pendingWorkflow);
    }
    setPendingWorkflow(null);
  }, [appModule, currentPage, pendingWorkflow, readyWorkflows]);

  return (
    <AgentDeepLinkImportDialog
      command={pendingAgentDeepLink}
      onClose={() => setPendingAgentDeepLink(null)}
    />
  );
}
