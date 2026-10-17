import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2Icon,
  KeyRoundIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AgentCodexAccountSummary } from "@prompthub/shared";
import { Button, ConfirmDialog, Input, Modal, Textarea, useToast } from "../ui";
import { AgentProviderDetailSection } from "./AgentProviderWorkbenchLayout";

function errorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/AGENT_CODEX_ACCOUNT_[A-Z0-9_]+/);
  return match?.[0] ?? "AGENT_CODEX_ACCOUNT_OPERATION_FAILED";
}

export function AgentCodexAccountManager() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AgentCodexAccountSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    "save" | "import" | "edit" | "capture" | null
  >(null);
  const [editTarget, setEditTarget] = useState<AgentCodexAccountSummary | null>(
    null,
  );
  const [label, setLabel] = useState("");
  const [authJson, setAuthJson] = useState("");
  const [deleteTarget, setDeleteTarget] =
    useState<AgentCodexAccountSummary | null>(null);
  const [loginTarget, setLoginTarget] =
    useState<AgentCodexAccountSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setAccounts(await window.api.agent.listCodexAccounts());
    } catch (error) {
      showToast(
        t(`agents.providerProfiles.codexAccounts.errors.${errorKey(error)}`),
        "error",
      );
    }
  }, [showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function closeDialog(): void {
    if (busy) return;
    setDialog(null);
    setEditTarget(null);
    setLabel("");
    setAuthJson("");
  }

  async function save(): Promise<void> {
    const name = label.trim();
    if (!name || busy) return;
    setBusy("save");
    try {
      if (dialog === "save" || dialog === "capture") {
        await window.api.agent.saveCurrentCodexAccount(name, editTarget?.id);
      } else {
        await window.api.agent.importCodexAccount({
          id: editTarget?.id,
          label: name,
          authJson,
        });
      }
      await load();
      setDialog(null);
      setEditTarget(null);
      setLabel("");
      setAuthJson("");
      showToast(t("agents.providerProfiles.codexAccounts.saved"), "success");
    } catch (error) {
      showToast(
        t(`agents.providerProfiles.codexAccounts.errors.${errorKey(error)}`),
        "error",
      );
    } finally {
      setBusy(null);
    }
  }

  async function activate(account: AgentCodexAccountSummary): Promise<void> {
    if (account.isActive || busy) return;
    setBusy(account.id);
    try {
      const result = await window.api.agent.activateCodexAccount(account.id);
      setLoginTarget(null);
      await load();
      if (result.requiresLogin) {
        setEditTarget(result.account);
        setLabel(result.account.label);
        setDialog("capture");
        showToast(
          t("agents.providerProfiles.codexAccounts.readyToLogin"),
          "success",
        );
        return;
      }
      showToast(
        t("agents.providerProfiles.codexAccounts.switched", {
          name: account.label,
        }),
        "success",
      );
    } catch (error) {
      showToast(
        t(`agents.providerProfiles.codexAccounts.errors.${errorKey(error)}`),
        "error",
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(): Promise<void> {
    if (!deleteTarget) return;
    setBusy(deleteTarget.id);
    try {
      await window.api.agent.deleteCodexAccount(deleteTarget.id);
      setDeleteTarget(null);
      await load();
      showToast(t("agents.providerProfiles.codexAccounts.deleted"), "success");
    } catch (error) {
      showToast(
        t(`agents.providerProfiles.codexAccounts.errors.${errorKey(error)}`),
        "error",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <AgentProviderDetailSection className="mt-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t("agents.providerProfiles.codexAccounts.title")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("agents.providerProfiles.codexAccounts.hint")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("agents.refresh")}
              onClick={() => void load()}
              disabled={busy !== null}
            >
              <RefreshCwIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDialog("save")}
              disabled={busy !== null}
            >
              <SaveIcon className="h-3.5 w-3.5" />
              {t("agents.providerProfiles.codexAccounts.saveCurrent")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDialog("import")}
              disabled={busy !== null}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t("agents.providerProfiles.codexAccounts.add")}
            </Button>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="mt-4 border-t border-border/70 py-6 text-center">
            <KeyRoundIcon className="mx-auto h-6 w-6 text-muted-foreground/60" />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("agents.providerProfiles.codexAccounts.empty")}
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border/70 border-y border-border/70">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex min-h-16 flex-wrap items-center gap-3 py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  {account.isActive ? (
                    <CheckCircle2Icon className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <KeyRoundIcon className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {account.label}
                    </span>
                    {account.isActive ? (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {t("agents.providerProfiles.codexAccounts.current")}
                      </span>
                    ) : null}
                    {account.hasAuth === false ? (
                      <span className="text-xs text-muted-foreground">
                        {t(
                          account.isLoginPending
                            ? "agents.providerProfiles.codexAccounts.loginSelected"
                            : "agents.providerProfiles.codexAccounts.pending",
                        )}
                      </span>
                    ) : null}
                  </div>
                  <span className="mt-0.5 block break-all text-xs text-muted-foreground">
                    {account.email ??
                      account.maskedAccountId ??
                      t(
                        account.hasAuth === false
                          ? "agents.providerProfiles.codexAccounts.pendingHint"
                          : "agents.providerProfiles.codexAccounts.unknownAccount",
                      )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t(
                      "agents.providerProfiles.codexAccounts.edit",
                      { name: account.label },
                    )}
                    disabled={busy !== null}
                    onClick={() => {
                      setEditTarget(account);
                      setLabel(account.label);
                      setAuthJson("");
                      setDialog("edit");
                    }}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  {account.hasAuth === false ? (
                    <>
                      {!account.isLoginPending ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy !== null}
                          onClick={() => setLoginTarget(account)}
                        >
                          {t(
                            "agents.providerProfiles.codexAccounts.switchAndLogin",
                          )}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy !== null}
                        onClick={() => {
                          setEditTarget(account);
                          setLabel(account.label);
                          setDialog("capture");
                        }}
                      >
                        {t("agents.providerProfiles.codexAccounts.capture")}
                      </Button>
                    </>
                  ) : !account.isActive ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void activate(account)}
                      disabled={busy !== null}
                    >
                      {busy === account.id ? (
                        <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {t("agents.providerProfiles.codexAccounts.switch")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t(
                      "agents.providerProfiles.codexAccounts.delete",
                      {
                        name: account.label,
                      },
                    )}
                    onClick={() => setDeleteTarget(account)}
                    disabled={busy !== null}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AgentProviderDetailSection>

      <Modal
        isOpen={dialog !== null}
        onClose={closeDialog}
        title={t(
          dialog === "edit"
            ? "agents.providerProfiles.codexAccounts.editTitle"
            : dialog === "capture"
              ? "agents.providerProfiles.codexAccounts.captureTitle"
              : dialog === "save"
                ? "agents.providerProfiles.codexAccounts.saveTitle"
                : "agents.providerProfiles.codexAccounts.importTitle",
        )}
        size="lg"
        closeOnBackdrop={!busy}
        closeOnEscape={!busy}
      >
        <form
          className="space-y-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            label={t("agents.providerProfiles.codexAccounts.label")}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t(
              "agents.providerProfiles.codexAccounts.labelExample",
            )}
            autoFocus
            maxLength={80}
            disabled={busy !== null}
          />
          {dialog === "capture" ? (
            <p className="rounded-lg bg-muted p-3 text-sm leading-6 text-muted-foreground">
              {t("agents.providerProfiles.codexAccounts.captureHint")}
            </p>
          ) : null}
          {dialog === "import" || dialog === "edit" ? (
            <>
              <Textarea
                label={t("agents.providerProfiles.codexAccounts.authJson")}
                value={authJson}
                onChange={(event) => setAuthJson(event.target.value)}
                rows={10}
                spellCheck={false}
                className="font-mono text-xs"
                disabled={busy !== null}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {t(
                  dialog === "edit"
                    ? "agents.providerProfiles.codexAccounts.editAuthHint"
                    : "agents.providerProfiles.codexAccounts.optionalAuthHint",
                )}
              </p>
            </>
          ) : null}
          <p className="text-xs leading-5 text-muted-foreground">
            {t("agents.providerProfiles.codexAccounts.securityHint")}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeDialog}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy !== null || !label.trim()}>
              {busy === "save" ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : null}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={loginTarget !== null}
        onClose={() => {
          if (!busy) setLoginTarget(null);
        }}
        onConfirm={() => {
          if (loginTarget) void activate(loginTarget);
        }}
        title={t("agents.providerProfiles.codexAccounts.switchAndLogin")}
        message={t("agents.providerProfiles.codexAccounts.switchLoginMessage", {
          name: loginTarget?.label ?? "",
        })}
        confirmText={t("agents.providerProfiles.codexAccounts.switchAndLogin")}
        cancelText={t("common.cancel")}
        isLoading={loginTarget !== null && busy === loginTarget.id}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
        title={t("agents.providerProfiles.codexAccounts.deleteTitle")}
        message={t("agents.providerProfiles.codexAccounts.deleteMessage", {
          name: deleteTarget?.label ?? "",
        })}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        variant="destructive"
        isLoading={deleteTarget !== null && busy === deleteTarget.id}
      />
    </>
  );
}
