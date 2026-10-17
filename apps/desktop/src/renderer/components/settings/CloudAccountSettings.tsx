import { requestConfirmation } from "../ui/confirmation";
import { useEffect, useState } from "react";
import {
  CloudIcon,
  CheckCircle2Icon,
  DownloadIcon,
  KeyRoundIcon,
  LogInIcon,
  LogOutIcon,
  Loader2Icon,
  MailCheckIcon,
  MonitorSmartphoneIcon,
  RefreshCwIcon,
  SaveIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  CloudAccountOverview,
  CloudAuthState,
  CloudEntitlementSnapshot,
  CloudInstallRecord,
  CloudSession,
} from "@prompthub/shared/types";
import { useToast } from "../ui/Toast";
import { SettingSection } from "./shared";

const DEFAULT_CLOUD_URL = "https://api.prompthub.cloud";

export function CloudAccountSettings() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [state, setState] = useState<CloudAuthState>({
    authenticated: false,
    user: null,
    baseUrl: DEFAULT_CLOUD_URL,
  });
  const [baseUrl, setBaseUrl] = useState(DEFAULT_CLOUD_URL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [installations, setInstallations] = useState<CloudInstallRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [overview, setOverview] = useState<CloudAccountOverview | null>(null);
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [entitlements, setEntitlements] = useState<CloudEntitlementSnapshot | null>(null);

  const loadInstallations = async () => {
    if (!state.authenticated) {
      setInstallations([]);
      return;
    }
    setHistoryLoading(true);
    try {
      setInstallations(await window.api.cloud.store.listInstallations());
    } catch {
      setInstallations([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadAccountData = async () => {
    if (!state.authenticated) {
      setOverview(null);
      setSessions([]);
      setEntitlements(null);
      return;
    }
    setAccountLoading(true);
    try {
      const [nextOverview, nextSessions, nextEntitlements] = await Promise.all([
        window.api.cloud.account.getOverview(),
        window.api.cloud.account.listSessions(),
        window.api.cloud.account.getEntitlements().catch(() => null),
      ]);
      setOverview(nextOverview);
      setSessions(nextSessions);
      setEntitlements(nextEntitlements);
      setProfileName(nextOverview.account.name ?? state.user?.name ?? "");
    } catch {
      setOverview(null);
      setSessions([]);
      setEntitlements(null);
    } finally {
      setAccountLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void window.api.cloud.auth
      .getState()
      .then((next) => {
        if (cancelled) return;
        setState(next);
        if (next.baseUrl) setBaseUrl(next.baseUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            authenticated: false,
            user: null,
            baseUrl: DEFAULT_CLOUD_URL,
            unavailable: true,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadInstallations();
    void loadAccountData();
  }, [state.authenticated]);

  const handleProfileSave = async () => {
    setAccountSubmitting(true);
    try {
      const user = await window.api.cloud.account.updateProfile({ name: profileName.trim() || null });
      setState((current) => ({ ...current, user }));
      await loadAccountData();
      showToast(t("settings.cloudAccountProfileSaved", "Profile updated."), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("settings.cloudAccountProfileFailed", "Profile update failed."), "error");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handlePasswordChange = async () => {
    if (currentPassword.length < 8 || newPassword.length < 8) {
      showToast(t("settings.cloudAccountPasswordInvalid", "Enter both passwords with at least 8 characters."), "error");
      return;
    }
    setAccountSubmitting(true);
    try {
      await window.api.cloud.account.changePassword({ currentPassword, newPassword, revokeOtherSessions: false });
      setCurrentPassword("");
      setNewPassword("");
      await loadAccountData();
      showToast(t("settings.cloudAccountPasswordSaved", "Password updated."), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("settings.cloudAccountPasswordFailed", "Password update failed."), "error");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleVerifyEmail = async () => {
    setAccountSubmitting(true);
    try {
      await window.api.cloud.account.requestEmailVerification();
      showToast(t("settings.cloudAccountVerificationSent", "Verification email sent."), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("settings.cloudAccountVerificationFailed", "Could not send verification email."), "error");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleRevokeSession = async (session: CloudSession) => {
    if (session.isCurrent) return;
    setAccountSubmitting(true);
    try {
      await window.api.cloud.account.revokeSession(session.id);
      await loadAccountData();
      showToast(t("settings.cloudAccountSessionRevoked", "Session revoked."), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("settings.cloudAccountSessionFailed", "Could not revoke session."), "error");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleRevokeOthers = async () => {
    setAccountSubmitting(true);
    try {
      const count = await window.api.cloud.account.revokeOtherSessions();
      await loadAccountData();
      showToast(t("settings.cloudAccountSessionsRevoked", "{{count}} other sessions revoked.", { count }), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("settings.cloudAccountSessionFailed", "Could not revoke sessions."), "error");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleExport = async () => {
    setAccountSubmitting(true);
    try {
      const job = await window.api.cloud.account.requestExport();
      await loadAccountData();
      showToast(t("settings.cloudAccountExportRequested", "Export request recorded: {{status}}.", { status: job.status }), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("settings.cloudAccountExportFailed", "Could not request export."), "error");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleOpenExport = async (jobId: string) => {
    setAccountSubmitting(true);
    try {
      await window.api.cloud.account.openExportDownload(jobId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("settings.cloudAccountExportOpenFailed", "Could not open export."), "error");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleDeletion = async () => {
    if (!(await requestConfirmation({
      message: t(
        "settings.cloudAccountDeleteConfirm",
        "Request account deletion? You can cancel during the grace period.",
      ),
      variant: "destructive",
      confirmText: t("common.delete"),
    }))) return;
    setAccountSubmitting(true);
    try {
      await window.api.cloud.account.requestDeletion();
      await loadAccountData();
      showToast(t("settings.cloudAccountDeleteRequested", "Account deletion request recorded."), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("settings.cloudAccountDeleteFailed", "Could not request account deletion."), "error");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleCancelDeletion = async () => {
    setAccountSubmitting(true);
    try {
      await window.api.cloud.account.cancelDeletion();
      await loadAccountData();
      showToast(t("settings.cloudAccountDeleteCancelled", "Account deletion request cancelled."), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("settings.cloudAccountDeleteCancelFailed", "Could not cancel account deletion."), "error");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || password.length < 8 || !baseUrl.trim()) {
      showToast(t("settings.cloudAccountInvalid", "Enter a valid Cloud URL, email, and password."), "error");
      return;
    }
    setSubmitting(true);
    try {
      const next = await window.api.cloud.auth.login({
        baseUrl,
        email,
        password,
      });
      setState({ authenticated: true, user: next.user, baseUrl: next.baseUrl });
      setPassword("");
      showToast(t("settings.cloudAccountLoginSuccess", "Signed in to PromptHub Cloud."), "success");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t("settings.cloudAccountLoginFailed", "Cloud sign-in failed."),
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setSubmitting(true);
    try {
      await window.api.cloud.auth.logout();
      setState({ authenticated: false, user: null, baseUrl });
      setInstallations([]);
      setEntitlements(null);
      showToast(t("settings.cloudAccountLogoutSuccess", "Signed out of PromptHub Cloud."), "success");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t("settings.cloudAccountLogoutFailed", "Cloud sign-out failed."),
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.cloudAccount", "PromptHub Cloud") }>
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("common.loading", "Loading...")}
          </div>
        ) : state.unavailable && state.authenticated ? (
          <div className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <CloudIcon className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  {t("settings.cloudAccountUnavailable", "Cloud is temporarily unreachable. Your local session is retained.")}
                </p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{state.baseUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={submitting}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <LogOutIcon className="h-4 w-4" aria-hidden="true" />
                {t("settings.cloudAccountLogout", "Sign out")}
              </button>
            </div>
          </div>
        ) : state.authenticated && state.user ? (
          <div className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <CloudIcon className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{state.user.name || state.user.email}</p>
                <p className="mt-1 text-sm text-muted-foreground">{state.user.email}</p>
                <p className="mt-2 break-all text-xs text-muted-foreground">{state.baseUrl}</p>
                {state.unavailable ? (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                    {t("settings.cloudAccountUnavailable", "Cloud is temporarily unreachable. Your local session is retained.")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={submitting}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <LogOutIcon className="h-4 w-4" aria-hidden="true" />
                {t("settings.cloudAccountLogout", "Sign out")}
              </button>
            </div>
            <div className="border-t border-border pt-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CloudIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                    {t("settings.cloudAccountProfile", "Profile")}
                  </div>
                  <label className="mt-3 block space-y-1 text-xs">
                    <span className="text-muted-foreground">{t("settings.cloudAccountName", "Display name")}</span>
                    <input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="h-9 w-full rounded-lg app-settings-input px-3 text-sm" maxLength={100} />
                  </label>
                  <p className="mt-2 text-xs text-muted-foreground">{state.user.email}</p>
                  <button type="button" onClick={() => void handleProfileSave()} disabled={accountSubmitting || accountLoading} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                    <SaveIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("settings.cloudAccountSaveProfile", "Save profile")}
                  </button>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <MailCheckIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                    {t("settings.cloudAccountEmailStatus", "Email and password")}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{state.user.email}</span>
                    {overview?.account.emailVerified ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2Icon className="h-3.5 w-3.5" />{t("settings.cloudAccountVerified", "Verified")}</span>
                    ) : (
                      <button type="button" onClick={() => void handleVerifyEmail()} disabled={accountSubmitting} className="inline-flex items-center gap-1 text-amber-600 hover:underline disabled:opacity-50"><MailCheckIcon className="h-3.5 w-3.5" />{t("settings.cloudAccountVerify", "Send verification")}</button>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder={t("settings.cloudAccountCurrentPassword", "Current password")} autoComplete="current-password" className="h-9 rounded-lg app-settings-input px-3 text-xs" />
                    <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={t("settings.cloudAccountNewPassword", "New password")} autoComplete="new-password" className="h-9 rounded-lg app-settings-input px-3 text-xs" />
                  </div>
                  <button type="button" onClick={() => void handlePasswordChange()} disabled={accountSubmitting} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
                    <KeyRoundIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("settings.cloudAccountChangePassword", "Change password")}
                  </button>
                </div>
              </div>
            </div>
            {entitlements && (
              <div className="border-t border-border pt-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CloudIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t("settings.cloudAccountEntitlements", "Plan and entitlements")}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  <EntitlementStat label={t("settings.cloudAccountPlan", "Plan")} value={entitlements.effectivePlan} />
                  <EntitlementStat label={t("settings.cloudAccountSyncDevices", "Sync devices")} value={String(entitlements.maxSyncDevices)} />
                  <EntitlementStat label={t("settings.cloudAccountStorage", "Cloud storage")} value={formatBytes(entitlements.maxCloudStorageBytes)} />
                  <EntitlementStat label={t("settings.cloudAccountOfficialAi", "Official AI")} value={entitlements.officialAiEnabled ? t("common.enabled", "Enabled") : t("common.disabled", "Disabled")} />
                </div>
              </div>
            )}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {t("settings.cloudAccountSessions", "Sessions")}
                </p>
                <button type="button" onClick={() => void handleRevokeOthers()} disabled={accountSubmitting || sessions.filter((session) => !session.isCurrent).length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                  <MonitorSmartphoneIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("settings.cloudAccountRevokeOthers", "Sign out other sessions")}
                </button>
              </div>
              {accountLoading ? <p className="mt-3 text-xs text-muted-foreground">{t("common.loading", "Loading...")}</p> : sessions.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">{t("settings.cloudAccountNoSessions", "No session details available.")}</p> : (
                <ul className="mt-3 space-y-2">
                  {sessions.slice(0, 8).map((session) => (
                    <li key={session.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-xs">
                      <span className="min-w-0 truncate text-foreground">{session.clientPlatform} {session.clientVersion || ""} · {new Date(session.lastActiveAt).toLocaleString()}</span>
                      {session.isCurrent ? <span className="shrink-0 text-emerald-600 dark:text-emerald-400">{t("settings.cloudAccountCurrentSession", "This device")}</span> : <button type="button" onClick={() => void handleRevokeSession(session)} disabled={accountSubmitting} className="shrink-0 text-destructive hover:underline disabled:opacity-50">{t("settings.cloudAccountRevoke", "Revoke")}</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {t("settings.cloudAccountNotifications", "Security notifications")}
                </p>
                <span className="text-xs text-muted-foreground">{overview?.notifications.filter((item) => !item.readAt).length ?? 0} {t("settings.cloudAccountUnread", "unread")}</span>
              </div>
              {overview?.notifications.length ? <ul className="mt-3 space-y-2">{overview.notifications.slice(0, 5).map((notification) => <li key={notification.id} className={`rounded-lg px-3 py-2 text-xs ${notification.readAt ? "bg-muted/20 text-muted-foreground" : "bg-primary/10 text-foreground"}`}>{notification.type} · {new Date(notification.createdAt).toLocaleString()}</li>)}</ul> : <p className="mt-3 text-xs text-muted-foreground">{t("settings.cloudAccountNoNotifications", "No security notifications.")}</p>}
            </div>
            <div className="border-t border-border pt-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground"><DownloadIcon className="h-4 w-4 text-primary" aria-hidden="true" />{t("settings.cloudAccountData", "Your data")}</div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleExport()} disabled={accountSubmitting} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"><DownloadIcon className="h-3.5 w-3.5" />{t("settings.cloudAccountRequestExport", "Request export")}</button>
                    {overview?.exportJobs.filter((job) => job.status === "completed").slice(0, 1).map((job) => <button type="button" key={job.id} onClick={() => void handleOpenExport(job.id)} disabled={accountSubmitting} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"><DownloadIcon className="h-3.5 w-3.5" />{t("settings.cloudAccountOpenExport", "Open latest export")}</button>)}
                  </div>
                </div>
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground"><ShieldAlertIcon className="h-4 w-4 text-destructive" aria-hidden="true" />{t("settings.cloudAccountDangerZone", "Account lifecycle")}</div>
                  <p className="mt-2 text-xs text-muted-foreground">{t("settings.cloudAccountDeleteDesc", "Deletion is delayed so you can cancel it during the grace period.")}</p>
                  {overview?.account.deletionRequest?.status === "pending" ? <button type="button" onClick={() => void handleCancelDeletion()} disabled={accountSubmitting} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"><RefreshCwIcon className="h-3.5 w-3.5" />{t("settings.cloudAccountCancelDelete", "Cancel deletion")}</button> : <button type="button" onClick={() => void handleDeletion()} disabled={accountSubmitting} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2Icon className="h-3.5 w-3.5" />{t("settings.cloudAccountRequestDelete", "Request deletion")}</button>}
                </div>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {t("settings.cloudAccountActivity", "Recent Store activity")}
                </p>
                <button
                  type="button"
                  onClick={() => void loadInstallations()}
                  disabled={historyLoading}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  <RefreshCwIcon
                    className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {t("settings.cloudAccountRefreshActivity", "Refresh")}
                </button>
              </div>
              {installations.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("settings.cloudAccountNoActivity", "No Store activity recorded yet.")}
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {installations.slice(0, 5).map((installation) => (
                    <li
                      key={installation.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate text-foreground">
                        {installation.listingTitle || installation.listingId} · {installation.operation}
                        {installation.versionLabel ? <span> · {installation.versionLabel}</span> : null} · {installation.target}
                      </span>
                      <span
                        className={`shrink-0 ${
                          installation.status === "succeeded"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : installation.status === "failed"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {installation.status} · {new Date(installation.createdAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4">

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t("settings.cloudAccountUrl", "Cloud API URL")}</span>
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  className="h-10 w-full rounded-lg app-settings-input px-3"
                  type="url"
                  autoComplete="url"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t("settings.cloudAccountEmail", "Email")}</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-10 w-full rounded-lg app-settings-input px-3"
                  type="email"
                  autoComplete="username"
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">{t("settings.cloudAccountPassword", "Password")}</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 w-full rounded-lg app-settings-input px-3"
                type="password"
                autoComplete="current-password"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={submitting}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogInIcon className="h-4 w-4" aria-hidden="true" />}
              {t("settings.cloudAccountLogin", "Sign in")}
            </button>
          </div>
        )}
      </SettingSection>
    </div>
  );
}

function EntitlementStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024) / 3), units.length - 1);
  return `${(bytes / 1024 ** (index * 3)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
