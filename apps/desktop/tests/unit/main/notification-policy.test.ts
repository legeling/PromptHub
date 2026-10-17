import { describe, expect, it } from "vitest";
import {
  normalizeNotificationPreferences,
  notificationDelivery,
  parseNotificationEvent,
} from "@prompthub/shared/utils/notifications";

describe("notification policy", () => {
  it("restores defaults and preserves each configured category", () => {
    const prefs = normalizeNotificationPreferences({
      delivery: { promptTest: "off" },
      sound: true,
    });
    expect(prefs.delivery.promptTest).toBe("off");
    expect(prefs.delivery.appUpdate).toBe("system");
    expect(prefs.delivery.syncSuccess).toBe("off");
    expect(prefs.sound).toBe(true);
    expect(prefs.onlyWhenAway).toBe(true);
  });
  it("uses in-app feedback in front and system feedback only when allowed", () => {
    const prefs = normalizeNotificationPreferences(undefined);
    expect(notificationDelivery(prefs, "promptTest", true, true)).toBe("inApp");
    expect(notificationDelivery(prefs, "promptTest", true, false)).toBe(
      "system",
    );
    expect(notificationDelivery(prefs, "promptTest", false, false)).toBe(
      "inApp",
    );
    prefs.delivery.promptTest = "off";
    expect(notificationDelivery(prefs, "promptTest", true, false)).toBe("off");
  });
  it("validates event identity and rejects unknown events and injected content", () => {
    expect(
      parseNotificationEvent({
        category: "promptTest",
        outcome: "success",
        id: "test-1",
      }),
    ).toEqual({ category: "promptTest", outcome: "success", id: "test-1" });
    for (const event of [
      null,
      { category: "copy", outcome: "success", id: "1" },
      { category: "promptTest", outcome: "success", id: "\0" },
      { category: "promptTest", outcome: "success", id: "1", body: "secret" },
    ]) {
      expect(() => parseNotificationEvent(event)).toThrow();
    }
  });
});
