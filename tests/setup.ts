import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// 扩展 Window 类型
// Extend Window type
declare global {
    interface Window {
        electron: any;
    }
}

// 每次测试后清理 DOM
// Cleanup DOM after each test
afterEach(() => {
    cleanup();
});

// 模拟 window.electron API
// Mock window.electron API
if (typeof window !== 'undefined') {
    window.electron = {
        ipcRenderer: {
            invoke: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
            send: vi.fn(),
        },
    };

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
}
