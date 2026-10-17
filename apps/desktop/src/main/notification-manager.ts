import {
  notificationDelivery,
  normalizeNotificationPreferences,
} from "@prompthub/shared/utils/notifications";
import type {
  AppNotificationEvent,
  AppNotificationMessage,
  NotificationDelivery,
} from "@prompthub/shared/types/notifications";

interface NotificationManagerOptions {
  readSetting: (key: string) => unknown;
  writeSetting: (key: string, value: unknown) => void;
  isForeground: () => boolean;
  format: (event: AppNotificationEvent) => AppNotificationMessage;
  showSystem: (
    message: AppNotificationMessage,
    silent: boolean,
  ) => Promise<boolean>;
  showInApp: (message: AppNotificationMessage) => void;
  now?: () => number;
}

class NotificationManager {
  private readonly seen = new Map<string, number>();
  private readonly pending = new Set<string>();
  private readonly now: () => number;
  constructor(private readonly options: NotificationManagerOptions) {
    this.now = options.now ?? Date.now;
  }

  private receipts(): string[] {
    const value = this.options.readSetting("notificationUpdateReceipts");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string").slice(-40)
      : [];
  }

  private duplicate(key: string, event: AppNotificationEvent): boolean {
    const last = this.seen.get(key);
    const cooldown = event.category === "syncFailure" ? 10 * 60_000 : Infinity;
    return (
      this.pending.has(key) ||
      (last !== undefined && this.now() - last < cooldown) ||
      (event.category === "appUpdate" && this.receipts().includes(key))
    );
  }

  private remember(key: string, event: AppNotificationEvent): void {
    this.seen.set(key, this.now());
    if (this.seen.size > 256)
      this.seen.delete(this.seen.keys().next().value ?? "");
    if (event.category === "appUpdate")
      this.options.writeSetting(
        "notificationUpdateReceipts",
        [...this.receipts(), key].slice(-40),
      );
  }

  private async system(
    message: AppNotificationMessage,
    silent: boolean,
  ): Promise<boolean> {
    try {
      return await this.options.showSystem(message, silent);
    } catch (error) {
      console.error("System notification delivery failed:", error);
      return false;
    }
  }

  async publish(event: AppNotificationEvent): Promise<NotificationDelivery> {
    const key = [
      event.category,
      event.outcome,
      event.module ?? "",
      event.id,
    ].join(":");
    if (this.duplicate(key, event)) return "off";
    const prefs = normalizeNotificationPreferences(
      this.options.readSetting("notificationPreferences"),
    );
    const enabled = this.options.readSetting("enableNotifications") !== false;
    let delivery = notificationDelivery(
      prefs,
      event.category,
      enabled,
      this.options.isForeground(),
    );
    if (delivery === "off") return delivery;
    this.pending.add(key);
    try {
      const message = this.options.format(event);
      if (
        delivery === "system" &&
        !(await this.system(message, !prefs.sound))
      ) {
        delivery = "inApp";
      }
      if (delivery === "inApp" && !event.inAppHandled)
        this.options.showInApp(message);
      this.remember(key, event);
      return delivery;
    } finally {
      this.pending.delete(key);
    }
  }
}

export function createNotificationManager(
  options: NotificationManagerOptions,
): Pick<NotificationManager, "publish"> {
  return new NotificationManager(options);
}
