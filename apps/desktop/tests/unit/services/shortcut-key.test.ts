import { describe, expect, it } from "vitest";
import { getShortcutKey } from "../../../src/renderer/services/shortcut-key";

describe("shortcut key identity", () => {
  it.each([
    ["Ô", "KeyJ", "J"],
    ["Dead", "KeyN", "N"],
    ["Ï", "KeyF", "F"],
    ["Í", "KeyS", "S"],
    ["¡", "Digit1", "1"],
  ])(
    "recognizes Option-modified %s by its accelerator key",
    (key, code, expected) => {
      expect(getShortcutKey({ key, code, altKey: true })).toBe(expected);
    },
  );

  it("preserves ordinary layout keys, space and named keys", () => {
    expect(getShortcutKey({ key: "z", code: "KeyY", altKey: false })).toBe("Z");
    expect(getShortcutKey({ key: " ", code: "Space", altKey: true })).toBe(
      "Space",
    );
    expect(getShortcutKey({ key: "F5", code: "F5", altKey: true })).toBe("F5");
  });
});
