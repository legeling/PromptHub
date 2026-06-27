import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { installWindowMocks } from './helpers/window';

// 扩展 Window 类型
// Extend Window type
declare global {
    interface Window {
        electron: any;
        api: any;
    }
}

function createMemoryStorage(): Storage {
    const values = new Map<string, string>();

    return {
        get length() {
            return values.size;
        },
        clear() {
            values.clear();
        },
        getItem(key: string) {
            return values.has(key) ? values.get(key)! : null;
        },
        key(index: number) {
            return Array.from(values.keys())[index] ?? null;
        },
        removeItem(key: string) {
            values.delete(key);
        },
        setItem(key: string, value: string) {
            values.set(key, String(value));
        },
    };
}

function installLocalStorageMock() {
    const storage = createMemoryStorage();

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: storage,
        writable: true,
    });

    if (typeof window !== 'undefined') {
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: storage,
        });
    }
}

installLocalStorageMock();

// 每次测试后清理 DOM
// Cleanup DOM after each test
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

// jsdom does not perform real layout, so @tanstack/react-virtual measures the
// scroll element as 0×0 and refuses to render any items. Replace the hook with
// a "render everything" pass-through so component tests can still find rows by
// text, while production code keeps the real virtualizer.
// jsdom 没有真实布局，@tanstack/react-virtual 测得 0×0 后会拒绝渲染。这里把 hook
// 替换成"全量渲染"的直通版本，让组件测试仍能按文本找到行；生产代码仍使用真正
// 的虚拟化。
vi.mock('@tanstack/react-virtual', async () => {
    const actual = await vi.importActual<typeof import('@tanstack/react-virtual')>(
        '@tanstack/react-virtual',
    );

    interface MinimalVirtualizerOptions<TItem> {
        count: number;
        estimateSize: (index: number) => number;
        getItemKey?: (index: number) => string | number;
        // The remaining options are accepted but ignored in tests.
        getScrollElement?: () => unknown;
        overscan?: number;
        horizontal?: boolean;
        scrollMargin?: number;
        [extra: string]: unknown;
    }

    interface VirtualItem {
        key: string | number;
        index: number;
        start: number;
        end: number;
        size: number;
        lane: number;
    }

    function buildVirtualItems<TItem>(
        options: MinimalVirtualizerOptions<TItem>,
    ): VirtualItem[] {
        const items: VirtualItem[] = [];
        let offset = 0;
        for (let index = 0; index < options.count; index++) {
            const size = options.estimateSize(index);
            const key = options.getItemKey ? options.getItemKey(index) : index;
            items.push({
                key,
                index,
                start: offset,
                end: offset + size,
                size,
                lane: 0,
            });
            offset += size;
        }
        return items;
    }

    return {
        ...actual,
        useVirtualizer: <TItem,>(options: MinimalVirtualizerOptions<TItem>) => {
            const items = buildVirtualItems(options);
            const totalSize = items.reduce((sum, item) => sum + item.size, 0);
            return {
                getVirtualItems: () => items,
                getTotalSize: () => totalSize,
                measureElement: () => undefined,
                scrollToIndex: () => undefined,
                scrollToOffset: () => undefined,
                scrollOffset: 0,
                options,
                range: { startIndex: 0, endIndex: Math.max(0, options.count - 1) },
            };
        },
    };
});

// 模拟 window.electron API
// Mock window.electron API
if (typeof window !== 'undefined') {
    installWindowMocks();

    // jsdom lacks ResizeObserver, used by canvas-sizing hooks.
    if (typeof globalThis.ResizeObserver === 'undefined') {
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        } as unknown as typeof ResizeObserver;
    }

    if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
        Object.defineProperty(Element.prototype, 'scrollTo', {
            configurable: true,
            value: vi.fn(),
        });
    }

    Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: {
            writeText: vi.fn(),
            readText: vi.fn(),
        },
    });

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
