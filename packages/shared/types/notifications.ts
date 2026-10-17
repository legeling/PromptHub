export const NOTIFICATION_CATEGORIES = [
  "appUpdate",
  "syncSuccess",
  "syncFailure",
  "promptTest",
  "generation",
  "resourceTask",
  "resourceUpdate",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationDelivery = "off" | "inApp" | "system";
export interface NotificationPreferences {
  onlyWhenAway: boolean;
  sound: boolean;
  delivery: Record<NotificationCategory, NotificationDelivery>;
}
export interface AppNotificationEvent {
  category: NotificationCategory;
  outcome: "success" | "error" | "attention" | "available" | "downloaded";
  id: string;
  module?: "skill" | "mcp" | "plugin";
  /** The initiating surface already displays actionable failure details. */
  inAppHandled?: boolean;
}
export interface AppNotificationMessage {
  event: AppNotificationEvent;
  title: string;
  body: string;
}
export interface NotificationPublishResult {
  success: boolean;
  delivery?: NotificationDelivery;
  error?: string;
}
