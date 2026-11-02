import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  CloudAccountOverview,
  CloudEntitlementSnapshot,
  CloudDeletionRequest,
  CloudExportJob,
  CloudSession,
  CloudAuthState,
  CloudUser,
  CloudStoreInstallIntentInput,
  CloudStoreInstallStatusInput,
  CloudStoreReportReason,
} from "@prompthub/shared/types";

export const cloudApi = {
  auth: {
    getState: (): Promise<CloudAuthState> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_AUTH_GET_STATE),
    login: (input: { baseUrl: string; email: string; password: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_AUTH_LOGIN, input),
    loginWithBrowser: (baseUrl: string): Promise<{ user: CloudUser; baseUrl: string }> => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_AUTH_BROWSER_LOGIN, baseUrl),
    cancelBrowserLogin: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_AUTH_BROWSER_CANCEL),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_AUTH_LOGOUT),
  },
  account: {
    getOverview: (): Promise<CloudAccountOverview> => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_OVERVIEW),
    updateProfile: (input: { name?: string | null; avatarUrl?: string | null }) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_PROFILE, input),
    changePassword: (input: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_PASSWORD, input),
    requestEmailVerification: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_VERIFY_EMAIL),
    listSessions: (): Promise<CloudSession[]> => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_SESSIONS),
    revokeSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_REVOKE_SESSION, sessionId),
    revokeOtherSessions: () => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_REVOKE_OTHERS),
    requestExport: (): Promise<CloudExportJob> => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_EXPORT),
    openExportDownload: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_EXPORT_DOWNLOAD, jobId),
    requestDeletion: (reason?: string) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_DELETE, reason ? { reason } : undefined),
    cancelDeletion: (): Promise<CloudDeletionRequest> => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_CANCEL_DELETE),
    getEntitlements: (): Promise<CloudEntitlementSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_ACCOUNT_ENTITLEMENTS),
  },
  store: {
    listFeed: (input?: { q?: string; limit?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_STORE_FEED, input),
    getListing: (slug: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_STORE_LISTING, slug),
    getPackage: (listingId: string, currentFingerprint?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_STORE_PACKAGE, {
        listingId,
        currentFingerprint,
      }),
    createInstallIntent: (input: CloudStoreInstallIntentInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_STORE_INSTALL_INTENT, input),
    updateInstallStatus: (
      installId: string,
      input: CloudStoreInstallStatusInput,
    ) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CLOUD_STORE_INSTALL_STATUS,
        installId,
        input,
      ),
    listInstallations: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_STORE_INSTALLATIONS),
    like: (listingId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_STORE_LIKE, listingId),
    unlike: (listingId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_STORE_UNLIKE, listingId),
    favorite: (listingId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_STORE_FAVORITE, listingId),
    unfavorite: (listingId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_STORE_UNFAVORITE, listingId),
    report: (listingId: string, input: { reason: CloudStoreReportReason; details?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOUD_STORE_REPORT, listingId, input),
  },
};
