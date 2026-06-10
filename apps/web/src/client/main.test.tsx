import React, { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { AppMock, createRootMock, renderMock } = vi.hoisted(() => {
  const renderMock = vi.fn();
  const AppMock = vi.fn(() => null);
  const createRootMock = vi.fn(() => ({ render: renderMock }));

  return {
    AppMock,
    createRootMock,
    renderMock,
  };
});

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: createRootMock,
  },
}));

vi.mock('./App', () => ({
  App: AppMock,
}));

vi.mock('./index.css', () => ({}));
vi.mock('@desktop-renderer-globals-css', () => ({}));
vi.mock('@desktop-renderer-i18n', () => ({
  i18nReady: Promise.resolve(),
}));

describe('client main bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    AppMock.mockClear();
    createRootMock.mockClear();
    renderMock.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('mounts the App inside React.StrictMode on the root element', async () => {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error('Expected test root element to exist');
    }

    await import('./main');
    await Promise.resolve();

    expect(createRootMock).toHaveBeenCalledWith(rootElement);
    expect(renderMock).toHaveBeenCalledTimes(1);

    const renderedTree = renderMock.mock.calls[0]?.[0];
    expect(React.isValidElement(renderedTree)).toBe(true);
    if (!React.isValidElement(renderedTree)) {
      throw new Error('Expected bootstrap to render a React element');
    }
    expect(renderedTree.type).toBe(React.StrictMode);

    const strictModeTree = renderedTree as ReactElement<{ children?: ReactNode }>;
    const strictModeChild = strictModeTree.props.children;
    expect(React.isValidElement(strictModeChild)).toBe(true);
    if (!React.isValidElement(strictModeChild)) {
      throw new Error('Expected React.StrictMode to wrap the App element');
    }
    expect(strictModeChild.type).toBe(AppMock);
  });
});
