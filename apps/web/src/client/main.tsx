import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '@desktop-renderer-globals-css';
import { i18nReady } from '@desktop-renderer-i18n';
import './index.css';

document.documentElement.classList.add('prompthub-web-runtime');
document.body.classList.add('prompthub-web-runtime');

void i18nReady.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
