import { useEffect } from "react";
import type { AppCommand } from "@prompthub/shared/types";
import type { useToast } from "../ui/Toast";
import { useUIStore } from "../../stores/ui.store";
import { usePromptStore } from "../../stores/prompt.store";

export function useApplicationNotificationFeedback(
  showToast: ReturnType<typeof useToast>["showToast"],
): void {
  useEffect(
    () =>
      window.electron?.applicationNotifications?.onFeedback((message) => {
        const outcome = message.event.outcome;
        showToast(
          `${message.title}: ${message.body}`,
          outcome === "error"
            ? "error"
            : outcome === "attention"
              ? "warning"
              : "success",
        );
      }),
    [showToast],
  );
}

export function openNotificationTarget(
  command: Extract<AppCommand, { type: "notification:open" }>,
  navigate: (page: "home" | "settings") => void,
  openUpdater: () => void,
): void {
  if (command.category === "appUpdate") {
    openUpdater();
    return;
  }
  if (
    command.category === "syncSuccess" ||
    command.category === "syncFailure"
  ) {
    useUIStore.getState().requestSettingsSection("data");
    navigate("settings");
    return;
  }
  navigate("home");
  useUIStore.getState().setAppModule(command.module ?? "prompt");
  if (command.category === "generation")
    usePromptStore.getState().setViewMode("generation");
}
