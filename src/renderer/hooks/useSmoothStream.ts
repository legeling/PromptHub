import { useCallback, useEffect, useRef } from 'react';

interface UseSmoothStreamOptions {
    onUpdate: (text: string) => void;
    streamDone: boolean;
    minDelay?: number;
    initialText?: string;
}

/**
 * A hook for smooth streaming text display
 * Inspired by Cherry Studio's useSmoothStream
 * 用于平滑流式文本显示的 Hook
 * 参考自 Cherry Studio 的 useSmoothStream
 */
export const useSmoothStream = ({
    onUpdate,
    streamDone,
    minDelay = 10,
    initialText = ''
}: UseSmoothStreamOptions) => {
    const chunkQueueRef = useRef<string[]>([]);
    const animationFrameRef = useRef<number | null>(null);
    const displayedTextRef = useRef<string>(initialText);
    const lastUpdateTimeRef = useRef<number>(0);

    const addChunk = useCallback((chunk: string) => {
        // Add each character to the queue for smooth animation
        // 将每个字符添加到队列以实现平滑动画
        const chars = Array.from(chunk);
        chunkQueueRef.current = [...chunkQueueRef.current, ...chars];
    }, []);

    const reset = useCallback(
        (newText = '') => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            chunkQueueRef.current = [];
            displayedTextRef.current = newText;
            onUpdate(newText);
        },
        [onUpdate]
    );

    const renderLoop = useCallback(
        (currentTime: number) => {
            // 1. If queue is empty
            if (chunkQueueRef.current.length === 0) {
                // If stream is done, ensure final state and stop loop
                if (streamDone) {
                    const finalText = displayedTextRef.current;
                    onUpdate(finalText);
                    return;
                }
                // If stream not done but queue empty, wait for next frame
                animationFrameRef.current = requestAnimationFrame(renderLoop);
                return;
            }

            // 2. Time control, ensure minimum delay
            if (currentTime - lastUpdateTimeRef.current < minDelay) {
                animationFrameRef.current = requestAnimationFrame(renderLoop);
                return;
            }
            lastUpdateTimeRef.current = currentTime;

            // 3. Calculate how many chars to render this frame
            let charsToRenderCount = Math.max(1, Math.floor(chunkQueueRef.current.length / 5));

            // If stream is done, render all remaining chars at once
            if (streamDone) {
                charsToRenderCount = chunkQueueRef.current.length;
            }

            const charsToRender = chunkQueueRef.current.slice(0, charsToRenderCount);
            displayedTextRef.current += charsToRender.join('');

            // 4. Update UI immediately
            onUpdate(displayedTextRef.current);

            // 5. Update queue
            chunkQueueRef.current = chunkQueueRef.current.slice(charsToRenderCount);

            // 6. If there's more content, continue next frame
            if (chunkQueueRef.current.length > 0 || !streamDone) {
                animationFrameRef.current = requestAnimationFrame(renderLoop);
            }
        },
        [streamDone, onUpdate, minDelay]
    );

    useEffect(() => {
        // Start render loop
        animationFrameRef.current = requestAnimationFrame(renderLoop);

        // Cleanup on unmount
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [renderLoop]);

    return { addChunk, reset };
};
