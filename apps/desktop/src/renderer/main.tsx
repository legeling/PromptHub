import React from "react";
import ReactDOM from "react-dom/client";
import { RendererErrorBoundary } from "./components/app/RendererErrorBoundary";
import { ToastProvider } from "./components/ui/Toast";
import "./styles/globals.css";
import { i18nReady } from "./i18n";

const App = React.lazy(() => import("./App"));
const PromptWorkspaceRecovery = React.lazy(
  () => import("./components/app/PromptWorkspaceRecovery"),
);
const isWorkspaceRecovery =
  new URLSearchParams(window.location.search).get("startupRecovery") ===
  "prompt-workspace";
if (isWorkspaceRecovery)
  document.documentElement.classList.toggle(
    "dark",
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
const root = ReactDOM.createRoot(document.getElementById("root")!);

const e2eBackupReady =
  !isWorkspaceRecovery && window.electron?.e2e
    ? import("./services/database-backup").then(
        ({ exportDatabase, restoreFromBackup }) => {
          window.__PROMPTHUB_E2E_BACKUP__ = {
            exportDatabase,
            restoreFromBackup,
          };
        },
      )
    : Promise.resolve();

function renderRenderer(children: React.ReactNode) {
  root.render(
    <React.StrictMode>
      <RendererErrorBoundary>{children}</RendererErrorBoundary>
    </React.StrictMode>,
  );
}

function RendererBootstrapFailure({ error }: { error: unknown }): never {
  throw error instanceof Error ? error : new Error(String(error));
}

void Promise.all([i18nReady, e2eBackupReady])
  .then(() => {
    renderRenderer(
      <ToastProvider>
        <React.Suspense
          fallback={<div className="h-screen bg-background" aria-busy="true" />}
        >
          {isWorkspaceRecovery ? <PromptWorkspaceRecovery /> : <App />}
        </React.Suspense>
      </ToastProvider>,
    );
  })
  .catch((error: unknown) => {
    renderRenderer(<RendererBootstrapFailure error={error} />);
  });
