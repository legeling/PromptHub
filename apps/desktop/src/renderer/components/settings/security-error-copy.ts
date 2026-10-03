import type { TFunction } from "i18next";

/**
 * Map known main-process security errors to localized, actionable copy.
 * 把主进程安全错误映射为本地化、可行动的文案（#64：不再向用户透传英文报错）。
 *
 * Unknown errors fall back to a generic localized message while the raw
 * message is preserved in the console for troubleshooting.
 * 未知错误显示通用文案，原始信息进 console 保留排障细节。
 */
const SECURITY_ERROR_COPY: Record<string, string> = {
  "Password too short": "settings.errPasswordTooShort",
  "Master password is already configured": "settings.errAlreadyConfigured",
  "Current password is required": "settings.errCurrentRequired",
  "Master password is not configured": "settings.errNotConfigured",
  "Current password is incorrect": "settings.currentPwdWrong",
};

export function getSecurityErrorCopy(error: unknown, t: TFunction): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const mapped = SECURITY_ERROR_COPY[raw];
  if (mapped) {
    return t(mapped);
  }

  console.error("Security operation failed:", raw || error);
  return t("settings.securityOpFailed");
}
