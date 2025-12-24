import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSmoothStream } from '../../../src/renderer/hooks/useSmoothStream';

describe('useSmoothStream Hook', () => {
    let rafCallbacks: FrameRequestCallback[] = [];
    let rafId = 0;

    beforeEach(() => {
        vi.useFakeTimers();
        rafCallbacks = [];
        rafId = 0;

        // Mock requestAnimationFrame
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb);
            return ++rafId;
        });

        vi.stubGlobal('cancelAnimationFrame', (id: number) => {
            // 简单实现：不做实际取消
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    // 模拟 RAF 执行
    function flushRAF(time = 16) {
        const callbacks = [...rafCallbacks];
        rafCallbacks = [];
        callbacks.forEach(cb => cb(performance.now() + time));
    }

    it('should return addChunk and reset functions', () => {
        const onUpdate = vi.fn();
        const { result } = renderHook(() =>
            useSmoothStream({ onUpdate, streamDone: false })
        );

        expect(result.current.addChunk).toBeDefined();
        expect(result.current.reset).toBeDefined();
    });

    it('should call onUpdate when chunks are added and RAF fires', async () => {
        const onUpdate = vi.fn();
        const { result } = renderHook(() =>
            useSmoothStream({ onUpdate, streamDone: false, minDelay: 0 })
        );

        // 添加一些字符
        act(() => {
            result.current.addChunk('Hello');
        });

        // 模拟多次 RAF 执行
        for (let i = 0; i < 10; i++) {
            act(() => {
                flushRAF(i * 20);
            });
        }

        // onUpdate 应该被调用，并且内容应该逐渐增加
        expect(onUpdate).toHaveBeenCalled();

        // 最终结果应该包含完整内容
        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        expect(lastCall[0]).toContain('Hello');
    });

    it('should render all remaining content when streamDone is true', async () => {
        const onUpdate = vi.fn();
        let streamDone = false;

        const { result, rerender } = renderHook(
            ({ done }) => useSmoothStream({ onUpdate, streamDone: done, minDelay: 0 }),
            { initialProps: { done: false } }
        );

        // 添加大量字符
        act(() => {
            result.current.addChunk('This is a long text that should be rendered smoothly');
        });

        // 模拟几次 RAF（不足以渲染完所有内容）
        for (let i = 0; i < 3; i++) {
            act(() => {
                flushRAF(i * 20);
            });
        }

        const callsBeforeDone = onUpdate.mock.calls.length;

        // 设置 streamDone = true
        rerender({ done: true });

        // 再执行一次 RAF
        act(() => {
            flushRAF(100);
        });

        // 应该一次性渲染完剩余内容
        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        expect(lastCall[0]).toBe('This is a long text that should be rendered smoothly');
    });

    it('should reset state when reset is called', () => {
        const onUpdate = vi.fn();
        const { result } = renderHook(() =>
            useSmoothStream({ onUpdate, streamDone: false, minDelay: 0 })
        );

        // 添加内容
        act(() => {
            result.current.addChunk('Hello');
        });

        // 执行 RAF
        act(() => {
            flushRAF(20);
        });

        // 重置
        act(() => {
            result.current.reset('New start');
        });

        // onUpdate 应该被调用，内容为 'New start'
        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        expect(lastCall[0]).toBe('New start');
    });

    it('should handle empty initial text', () => {
        const onUpdate = vi.fn();
        const { result } = renderHook(() =>
            useSmoothStream({ onUpdate, streamDone: false, initialText: '' })
        );

        expect(result.current.addChunk).toBeDefined();
        // 初始不应该触发 onUpdate（除非 RAF 运行）
    });

    it('should handle rapid consecutive addChunk calls', () => {
        const onUpdate = vi.fn();
        const { result } = renderHook(() =>
            useSmoothStream({ onUpdate, streamDone: false, minDelay: 0 })
        );

        // 快速连续添加
        act(() => {
            result.current.addChunk('A');
            result.current.addChunk('B');
            result.current.addChunk('C');
            result.current.addChunk('D');
            result.current.addChunk('E');
        });

        // 执行多次 RAF
        for (let i = 0; i < 10; i++) {
            act(() => {
                flushRAF(i * 20);
            });
        }

        // 最终应该包含所有内容
        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        expect(lastCall[0]).toBe('ABCDE');
    });

    it('should handle Chinese characters correctly', () => {
        const onUpdate = vi.fn();
        const { result } = renderHook(() =>
            useSmoothStream({ onUpdate, streamDone: false, minDelay: 0 })
        );

        act(() => {
            result.current.addChunk('你好世界');
        });

        for (let i = 0; i < 10; i++) {
            act(() => {
                flushRAF(i * 20);
            });
        }

        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        expect(lastCall[0]).toBe('你好世界');
    });

    it('should handle emoji correctly', () => {
        const onUpdate = vi.fn();
        const { result } = renderHook(() =>
            useSmoothStream({ onUpdate, streamDone: false, minDelay: 0 })
        );

        act(() => {
            result.current.addChunk('Hello 👋🌍');
        });

        for (let i = 0; i < 10; i++) {
            act(() => {
                flushRAF(i * 20);
            });
        }

        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        expect(lastCall[0]).toBe('Hello 👋🌍');
    });
});
