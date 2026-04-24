import {
  BrainIcon,
  DatabaseIcon,
  GlobeIcon,
  LaptopIcon,
  KeyIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getWebContext } from "../../runtime";
import { useToast } from "../ui/Toast";
import { PasswordInput, SettingSection } from "./shared";

interface WebWorkspaceSettingsProps {
  onNavigate: (section: string) => void;
}

export function WebWorkspaceSettings({
  onNavigate,
}: WebWorkspaceSettingsProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const webContext = getWebContext();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword) {
      showToast(t("settings.enterCurrentPwd"), "error");
      return;
    }
    if (newPassword.length < 8) {
      showToast(t("settings.webPasswordTooShort"), "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast(t("settings.pwdMismatch"), "error");
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message || t("settings.webPasswordChangeFailed"));
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
      showToast(t("settings.webPasswordChangeSuccess"), "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t("settings.webPasswordChangeFailed"),
        "error",
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  const clientLabel =
    typeof navigator === "undefined"
      ? "Browser"
      : `${/edg\//i.test(navigator.userAgent)
          ? "Microsoft Edge"
          : /chrome\//i.test(navigator.userAgent) &&
              !/edg\//i.test(navigator.userAgent)
            ? "Google Chrome"
            : /safari\//i.test(navigator.userAgent) &&
                !/chrome\//i.test(navigator.userAgent)
              ? "Safari"
              : /firefox\//i.test(navigator.userAgent)
                ? "Firefox"
                : "Browser"} · ${/mac os x/i.test(navigator.userAgent)
          ? "macOS"
          : /windows/i.test(navigator.userAgent)
            ? "Windows"
            : /android/i.test(navigator.userAgent)
              ? "Android"
              : /(iphone|ipad|ios)/i.test(navigator.userAgent)
                ? "iOS"
                : /linux/i.test(navigator.userAgent)
                  ? "Linux"
                  : "Unknown OS"}`;

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.selfHostedWeb")}>
        <div className="divide-y divide-border/70">
          <div className="px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GlobeIcon className="h-4 w-4 text-primary" />
              <span>{t("settings.webOrigin")}</span>
            </div>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              {window.location.origin}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("settings.selfHostedWebDesc")}
            </p>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserIcon className="h-4 w-4 text-primary" />
                <span>{t("settings.currentUser")}</span>
              </div>
              <p className="mt-2 text-sm text-foreground">
                {webContext?.username || "PromptHub User"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <LaptopIcon className="h-4 w-4 text-primary" />
                <span>{t("settings.connectedClient")}</span>
              </div>
              <p className="mt-2 text-sm text-foreground">{clientLabel}</p>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-3">
            <button
              onClick={() => onNavigate("devices")}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-left transition-colors hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-medium">
                  {t("settings.deviceManagement")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.deviceManagementDesc")}
                </p>
              </div>
              <GlobeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            <button
              onClick={() => onNavigate("data")}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-left transition-colors hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-medium">{t("settings.data")}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.skillBackupHint")}
                </p>
              </div>
              <DatabaseIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            <button
              onClick={() => onNavigate("ai")}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-left transition-colors hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-medium">{t("settings.ai")}</div>
              </div>
              <BrainIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <KeyIcon className="h-4 w-4 text-primary" />
                  <span>{t("settings.webLoginPassword")}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.webLoginPasswordDesc")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordForm((value) => !value)}
                className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted/60"
              >
                {showPasswordForm ? t("common.cancel") : t("settings.changePwdBtn")}
              </button>
            </div>

            {showPasswordForm && (
              <div className="mt-4 grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <PasswordInput
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder={t("settings.oldPwdPlaceholder")}
                />
                <PasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder={t("settings.webNewLoginPasswordPlaceholder")}
                />
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder={t("settings.webConfirmLoginPasswordPlaceholder")}
                />
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={isChangingPassword}
                  className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {isChangingPassword ? t("common.loading") : t("settings.confirmChange")}
                </button>
              </div>
            )}
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
