import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/ui/Toast';
import {
  exportDatabase,
  restoreFromBackup,
} from "./services/database-backup";
import './styles/globals.css';
import { i18nReady } from './i18n';  // Initialize i18n / 初始化 i18n

if (window.electron?.e2e) {
  window.__PROMPTHUB_E2E_BACKUP__ = {
    exportDatabase,
    restoreFromBackup,
  };
}

void i18nReady.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </React.StrictMode>
  );
});
