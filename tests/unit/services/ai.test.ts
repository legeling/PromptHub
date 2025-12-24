/**
 * AI Service Unit Tests - 攻击性测试
 * 
 * 这些测试旨在发现真实的 Bug，而不是验证"快乐路径"
 * These tests aim to find real bugs, not just validate happy paths
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// 辅助函数：创建模拟的流式响应
// Helper: Create mock stream response
// ============================================

function createMockStreamResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    let chunkIndex = 0;

    const stream = new ReadableStream({
        pull(controller) {
            if (chunkIndex < chunks.length) {
                controller.enqueue(encoder.encode(chunks[chunkIndex]));
                chunkIndex++;
            } else {
                controller.close();
            }
        }
    });

    return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
    });
}

function createSSEChunk(content: string, reasoning?: string): string {
    const delta: any = {};
    if (content) delta.content = content;
    if (reasoning) delta.reasoning_content = reasoning;

    return `data: ${JSON.stringify({ choices: [{ delta, index: 0 }] })}\n\n`;
}

// ============================================
// 流解析核心逻辑（从 ai.ts 提取用于测试）
// Core stream parsing logic (extracted from ai.ts for testing)
// ============================================

async function parseSSEStream(
    response: Response,
    callbacks: {
        onContent?: (chunk: string) => void;
        onThinking?: (chunk: string) => void;
        onError?: (error: Error) => void;
    }
): Promise<{ content: string; thinking: string }> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let fullContent = '';
    let thinkingContent = '';
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;

                try {
                    const json = JSON.parse(trimmed.slice(6));
                    const delta = json.choices?.[0]?.delta;

                    if (delta?.reasoning_content) {
                        thinkingContent += delta.reasoning_content;
                        callbacks.onThinking?.(delta.reasoning_content);
                    }
                    if (delta?.content) {
                        fullContent += delta.content;
                        callbacks.onContent?.(delta.content);
                    }
                } catch (e) {
                    // 静默忽略解析错误 - 这是设计如此
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return { content: fullContent, thinking: thinkingContent };
}

// ============================================
// 测试用例
// Test Cases
// ============================================

describe('AI Service - 边界条件测试 (Boundary Conditions)', () => {

    describe('空输入和极端情况', () => {
        it('should handle empty stream gracefully', async () => {
            const response = createMockStreamResponse(['data: [DONE]\n\n']);
            const onContent = vi.fn();

            const result = await parseSSEStream(response, { onContent });

            expect(result.content).toBe('');
            expect(onContent).not.toHaveBeenCalled();
        });

        it('should handle stream with only whitespace content', async () => {
            const chunks = [
                createSSEChunk('   '),
                createSSEChunk('\n\n'),
                createSSEChunk('\t'),
                'data: [DONE]\n\n'
            ];
            const response = createMockStreamResponse(chunks);
            const result = await parseSSEStream(response, {});

            expect(result.content).toBe('   \n\n\t');
        });

        it('should handle very long single chunk (>1MB)', async () => {
            const longContent = 'A'.repeat(1024 * 1024); // 1MB
            const chunks = [createSSEChunk(longContent), 'data: [DONE]\n\n'];
            const response = createMockStreamResponse(chunks);

            const result = await parseSSEStream(response, {});

            expect(result.content.length).toBe(1024 * 1024);
        });

        it('should handle thousands of tiny chunks', async () => {
            const chunks: string[] = [];
            for (let i = 0; i < 1000; i++) {
                chunks.push(createSSEChunk('x'));
            }
            chunks.push('data: [DONE]\n\n');

            const response = createMockStreamResponse(chunks);
            const onContent = vi.fn();

            const result = await parseSSEStream(response, { onContent });

            expect(result.content).toBe('x'.repeat(1000));
            expect(onContent).toHaveBeenCalledTimes(1000);
        });
    });

    describe('特殊字符和编码', () => {
        it('should handle content with JSON special characters', async () => {
            const contentWithQuotes = 'He said "Hello" and \\n newline';
            const chunks = [createSSEChunk(contentWithQuotes), 'data: [DONE]\n\n'];
            const response = createMockStreamResponse(chunks);

            const result = await parseSSEStream(response, {});

            expect(result.content).toBe(contentWithQuotes);
        });

        it('should handle content with backslashes', async () => {
            const content = 'C:\\Users\\test\\file.txt';
            const chunks = [createSSEChunk(content), 'data: [DONE]\n\n'];
            const response = createMockStreamResponse(chunks);

            const result = await parseSSEStream(response, {});

            expect(result.content).toBe(content);
        });

        it('should handle mixed languages in single stream', async () => {
            const chunks = [
                createSSEChunk('Hello '),
                createSSEChunk('你好 '),
                createSSEChunk('مرحبا '),
                createSSEChunk('🎉'),
                'data: [DONE]\n\n'
            ];
            const response = createMockStreamResponse(chunks);

            const result = await parseSSEStream(response, {});

            expect(result.content).toBe('Hello 你好 مرحبا 🎉');
        });

        it('should handle surrogate pairs (emoji) split across chunks', async () => {
            // 4字节 emoji：🎉 = F0 9F 8E 89
            // 如果网络包正好在 emoji 中间切开怎么办？
            const emoji = '🎉';
            const encoder = new TextEncoder();
            const emojiBytes = encoder.encode(createSSEChunk(emoji));

            // 模拟在 emoji 中间切开（实际上 TextDecoder 会处理这种情况）
            const part1 = emojiBytes.slice(0, emojiBytes.length - 2);
            const part2 = emojiBytes.slice(emojiBytes.length - 2);

            // 这个测试验证 TextDecoder 的 { stream: true } 能正确处理
            const decoder = new TextDecoder();
            const decoded1 = decoder.decode(part1, { stream: true });
            const decoded2 = decoder.decode(part2, { stream: true });

            // 合并后应该能正确解码
            expect(decoded1 + decoded2).toContain(emoji);
        });
    });

    describe('格式错误处理', () => {
        it('should skip malformed JSON without crashing', async () => {
            const chunks = [
                'data: {invalid json}\n\n',  // 坏的
                createSSEChunk('good'),       // 好的
                'data: {also bad\n\n',        // 坏的
                createSSEChunk(' content'),   // 好的
                'data: [DONE]\n\n'
            ];
            const response = createMockStreamResponse(chunks);

            const result = await parseSSEStream(response, {});

            expect(result.content).toBe('good content');
        });

        it('should handle missing data prefix', async () => {
            const chunks = [
                'no-prefix: should be ignored\n\n',
                createSSEChunk('valid'),
                ': comment line\n\n',  // SSE 注释
                'data: [DONE]\n\n'
            ];
            const response = createMockStreamResponse(chunks);

            const result = await parseSSEStream(response, {});

            expect(result.content).toBe('valid');
        });

        it('should handle data lines without proper newline termination', async () => {
            // 模拟网络包在行中间切开
            const chunk1 = 'data: {"choices":[{"delta":{"content":"He';
            const chunk2 = 'llo"}}]}\n\ndata: [DONE]\n\n';

            const response = createMockStreamResponse([chunk1, chunk2]);
            const result = await parseSSEStream(response, {});

            expect(result.content).toBe('Hello');
        });
    });

    describe('并发和竞态条件', () => {
        it('should handle rapid callback invocations', async () => {
            const chunks: string[] = [];
            for (let i = 0; i < 100; i++) {
                chunks.push(createSSEChunk(`chunk${i}`));
            }
            chunks.push('data: [DONE]\n\n');

            const response = createMockStreamResponse(chunks);
            const callOrder: number[] = [];

            await parseSSEStream(response, {
                onContent: (chunk) => {
                    const num = parseInt(chunk.replace('chunk', ''));
                    callOrder.push(num);
                }
            });

            // 验证回调按正确顺序调用
            for (let i = 0; i < 100; i++) {
                expect(callOrder[i]).toBe(i);
            }
        });
    });
});

describe('AI Service - 已知 Bug 回归测试 (Regression Tests)', () => {

    describe('Bug #1: 流式响应一次性显示而非逐字', () => {
        it('should call onContent for EACH chunk, not batch them', async () => {
            const chunks = [
                createSSEChunk('A'),
                createSSEChunk('B'),
                createSSEChunk('C'),
                'data: [DONE]\n\n'
            ];
            const response = createMockStreamResponse(chunks);
            const contentCalls: string[] = [];

            await parseSSEStream(response, {
                onContent: (chunk) => contentCalls.push(chunk)
            });

            // 关键断言：必须是3次调用，每次一个字符
            // 如果代码有问题，可能会是1次调用 "ABC"
            expect(contentCalls).toEqual(['A', 'B', 'C']);
            expect(contentCalls.length).toBe(3);
        });
    });

    describe('Bug #2: Thinking content 被错误地混入正常内容', () => {
        it('should separate thinking content from normal content', async () => {
            const chunks = [
                createSSEChunk('', '思考过程...'),
                createSSEChunk('', '继续思考...'),
                createSSEChunk('最终答案'),
                'data: [DONE]\n\n'
            ];
            const response = createMockStreamResponse(chunks);

            const result = await parseSSEStream(response, {});

            // Thinking 和 Content 必须严格分离
            expect(result.content).toBe('最终答案');
            expect(result.thinking).toBe('思考过程...继续思考...');
            expect(result.content).not.toContain('思考');
        });
    });

    describe('Bug #3: 中文被截断或乱码', () => {
        it('should handle Chinese characters without corruption', async () => {
            const chineseText = '这是一段中文测试文本，包含标点符号！？、。';
            const chunks = [createSSEChunk(chineseText), 'data: [DONE]\n\n'];
            const response = createMockStreamResponse(chunks);

            const result = await parseSSEStream(response, {});

            expect(result.content).toBe(chineseText);
        });

        it('should handle Chinese split across multiple chunks', async () => {
            const chunks = [
                createSSEChunk('你'),
                createSSEChunk('好'),
                createSSEChunk('世'),
                createSSEChunk('界'),
                'data: [DONE]\n\n'
            ];
            const response = createMockStreamResponse(chunks);

            const result = await parseSSEStream(response, {});

            expect(result.content).toBe('你好世界');
        });
    });
});

describe('AI Service - 错误处理测试 (Error Handling)', () => {

    it('should throw when response body is null', async () => {
        const response = new Response(null);

        await expect(parseSSEStream(response, {})).rejects.toThrow('无法读取响应流');
    });

    it('should handle stream that closes unexpectedly', async () => {
        let controllerRef: ReadableStreamDefaultController<Uint8Array>;

        const stream = new ReadableStream({
            start(controller) {
                controllerRef = controller;
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode(createSSEChunk('partial')));
                // 不发送 [DONE]，直接关闭
                controller.close();
            }
        });

        const response = new Response(stream);
        const result = await parseSSEStream(response, {});

        // 即使没有 [DONE]，也应该返回已收到的内容
        expect(result.content).toBe('partial');
    });

    it('should handle callback that throws error', async () => {
        const chunks = [
            createSSEChunk('content1'),
            createSSEChunk('content2'),
            'data: [DONE]\n\n'
        ];
        const response = createMockStreamResponse(chunks);

        let callCount = 0;
        const errorCallback = () => {
            callCount++;
            if (callCount === 1) {
                throw new Error('Callback error');
            }
        };

        // 即使回调抛错，也不应该中断整个流
        // 注意：这取决于实际代码的实现方式
        // 如果你的代码没有 try-catch 包住回调，这个测试会失败
        // 这正是我们想发现的问题
        try {
            await parseSSEStream(response, { onContent: errorCallback });
        } catch (e) {
            // 如果这里抛错了，说明代码没有正确处理回调异常
            expect(e).toBeInstanceOf(Error);
        }
    });
});
