import { describe, expect, it, vi, beforeEach } from "vitest";
import { getSecurityErrorCopy } from "../../../src/renderer/components/settings/security-error-copy";

const t = ((key: string) => `i18n:${key}`) as never;

describe("getSecurityErrorCopy", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("maps every known main-process security error to localized copy", () => {
    expect(
      getSecurityErrorCopy(new Error("Password too short"), t),
    ).toBe("i18n:settings.errPasswordTooShort");
    expect(
      getSecurityErrorCopy(new Error("Master password is already configured"), t),
    ).toBe("i18n:settings.errAlreadyConfigured");
    expect(
      getSecurityErrorCopy(new Error("Current password is required"), t),
    ).toBe("i18n:settings.errCurrentRequired");
    expect(
      getSecurityErrorCopy(new Error("Master password is not configured"), t),
    ).toBe("i18n:settings.errNotConfigured");
    expect(
      getSecurityErrorCopy(new Error("Current password is incorrect"), t),
    ).toBe("i18n:settings.currentPwdWrong");
  });

  it("accepts raw string errors from IPC rejections", () => {
    expect(getSecurityErrorCopy("Password too short", t)).toBe(
      "i18n:settings.errPasswordTooShort",
    );
  });

  it("falls back to generic copy and logs the raw error for unknown failures", () => {
    expect(getSecurityErrorCopy(new Error("disk on fire"), t)).toBe(
      "i18n:settings.securityOpFailed",
    );
    expect(console.error).toHaveBeenCalledWith(
      "Security operation failed:",
      "disk on fire",
    );
  });

  it("never throws on empty or non-error inputs", () => {
    expect(getSecurityErrorCopy(undefined, t)).toBe(
      "i18n:settings.securityOpFailed",
    );
    expect(getSecurityErrorCopy(null, t)).toBe("i18n:settings.securityOpFailed");
    expect(getSecurityErrorCopy(42, t)).toBe("i18n:settings.securityOpFailed");
    expect(getSecurityErrorCopy("", t)).toBe("i18n:settings.securityOpFailed");
  });
});
