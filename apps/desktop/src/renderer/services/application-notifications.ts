import { flushRendererPersistence } from "./renderer-persistence-writes";
import type { AppNotificationEvent } from "@prompthub/shared/types/notifications";

async function deliver(event: AppNotificationEvent): Promise<void> {
  try {
    const api = window.electron?.applicationNotifications;
    if (!api) return;
    await flushRendererPersistence();
    const result = await api.publish(event);
    if (!result?.success)
      console.error("Application notification was rejected:", result?.error);
  } catch (error) {
    console.error("Application notification transport failed:", error);
  }
}

export function publishNotification(event: AppNotificationEvent): void {
  void deliver(event);
}

export function notifyTaskResult(
  category: "promptTest" | "generation" | "resourceTask",
  outcome: "success" | "error" | "attention",
  module?: "skill" | "mcp" | "plugin",
  inAppHandled = false,
): void {
  publishNotification({
    category,
    outcome,
    id: crypto.randomUUID(),
    ...(module ? { module } : {}),
    ...(inAppHandled ? { inAppHandled } : {}),
  });
}
