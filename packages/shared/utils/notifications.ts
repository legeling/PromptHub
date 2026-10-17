import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationDelivery,
  type NotificationPreferences,
  type AppNotificationEvent,
} from "../types/notifications";

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  return Object.fromEntries(Object.entries(value));
}

export function normalizeNotificationPreferences(
  value: unknown,
): NotificationPreferences {
  const input = record(value);
  const delivery = record(input.delivery);
  const mode = (
    key: NotificationCategory,
    fallback: NotificationDelivery,
  ): NotificationDelivery =>
    delivery[key] === "off" ||
    delivery[key] === "inApp" ||
    delivery[key] === "system"
      ? delivery[key]
      : fallback;
  return {
    onlyWhenAway:
      typeof input.onlyWhenAway === "boolean" ? input.onlyWhenAway : true,
    sound: typeof input.sound === "boolean" ? input.sound : false,
    delivery: {
      appUpdate: mode("appUpdate", "system"),
      syncSuccess: mode("syncSuccess", "off"),
      syncFailure: mode("syncFailure", "system"),
      promptTest: mode("promptTest", "system"),
      generation: mode("generation", "system"),
      resourceTask: mode("resourceTask", "system"),
      resourceUpdate: mode("resourceUpdate", "inApp"),
    },
  };
}

export function notificationDelivery(
  preferences: NotificationPreferences,
  category: NotificationCategory,
  enabled: boolean,
  foreground: boolean,
): NotificationDelivery {
  const mode = preferences.delivery[category];
  return mode === "system" &&
    (!enabled || (preferences.onlyWhenAway && foreground))
    ? "inApp"
    : mode;
}

export function parseNotificationEvent(value: unknown): AppNotificationEvent {
  const input = record(value);
  const category = NOTIFICATION_CATEGORIES.find(
    (item) => item === input.category,
  );
  const outcome = input.outcome;
  const module = input.module;
  const inAppHandled = input.inAppHandled;
  if (
    !category ||
    !["success", "error", "attention", "available", "downloaded"].some(
      (item) => item === outcome,
    ) ||
    typeof input.id !== "string" ||
    !input.id.trim() ||
    input.id.length > 256 ||
    /[\u0000-\u001f]/.test(input.id) ||
    Object.keys(input).some(
      (key) =>
        !["category", "outcome", "id", "module", "inAppHandled"].includes(key),
    )
  ) {
    throw new Error("Invalid notification event");
  }
  if (
    outcome !== "success" &&
    outcome !== "error" &&
    outcome !== "attention" &&
    outcome !== "available" &&
    outcome !== "downloaded"
  )
    throw new Error("Invalid notification outcome");
  if (
    module !== undefined &&
    module !== "skill" &&
    module !== "mcp" &&
    module !== "plugin"
  )
    throw new Error("Invalid notification module");
  if (inAppHandled !== undefined && typeof inAppHandled !== "boolean")
    throw new Error("Invalid notification feedback flag");
  if (
    (category === "appUpdate" &&
      outcome !== "available" &&
      outcome !== "downloaded") ||
    (category !== "appUpdate" && outcome === "downloaded") ||
    (category !== "appUpdate" &&
      category !== "resourceUpdate" &&
      outcome === "available")
  )
    throw new Error("Invalid notification category outcome");
  return {
    category,
    outcome,
    id: input.id,
    ...(module === "skill" || module === "mcp" || module === "plugin"
      ? { module }
      : {}),
    ...(typeof inAppHandled === "boolean" ? { inAppHandled } : {}),
  };
}
