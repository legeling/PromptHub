import type { ChatCompletionResult, StreamCallbacks } from "./ai-types";

interface StreamState {
  fullContent: string;
  thinkingContent: string;
  buffer: string;
  chunkCount: number;
  error?: string;
}

export function createStreamState(): StreamState {
  return { fullContent: "", thinkingContent: "", buffer: "", chunkCount: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function consumeData(
  data: string,
  state: StreamState,
  onStream?: (chunk: string) => void,
  callbacks?: StreamCallbacks,
): void {
  if (data === "[DONE]" || state.error) return;
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    state.error = "Invalid JSON in AI event stream";
    return;
  }
  if (!isRecord(json)) return;
  if (json.error) {
    state.error =
      isRecord(json.error) && typeof json.error.message === "string"
        ? json.error.message
        : "AI event stream reported an error";
    return;
  }
  const choice: unknown = Array.isArray(json.choices)
    ? json.choices[0]
    : undefined;
  if (!isRecord(choice) || !isRecord(choice.delta)) return;
  state.chunkCount++;
  const { content, reasoning_content: thinking } = choice.delta;
  if (typeof thinking === "string") {
    state.thinkingContent += thinking;
    callbacks?.onThinking?.(thinking);
  }
  if (typeof content === "string") {
    state.fullContent += content;
    onStream?.(content);
    callbacks?.onContent?.(content);
  }
}

export async function processStreamTextChunk(
  chunk: string,
  state: StreamState,
  onStream?: (chunk: string) => void,
  callbacks?: StreamCallbacks,
  options?: { flush?: boolean; yieldToUi?: boolean },
): Promise<void> {
  state.buffer += chunk;
  const lines = state.buffer.split("\n");
  state.buffer = options?.flush ? "" : lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      consumeData(trimmed.slice(5).trimStart(), state, onStream, callbacks);
    }
  }
  if (options?.yieldToUi)
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function finalizeStreamState(
  state: StreamState,
  callbacks?: StreamCallbacks,
): ChatCompletionResult {
  if (state.error) throw new Error(state.error);
  if (!state.chunkCount) throw new Error("AI stream ended without a response");
  callbacks?.onComplete?.(
    state.fullContent,
    state.thinkingContent || undefined,
  );
  return {
    content: state.fullContent,
    thinkingContent: state.thinkingContent || undefined,
  };
}

export function isUnsupportedStream(status: number, message: string): boolean {
  if (![400, 422, 501].includes(status)) return false;
  return (
    /\b(stream(?:ing)?|sse)\b.{0,80}\b(not supported|unsupported|not available|not implemented|disabled)\b/i.test(
      message,
    ) ||
    /\b(unsupported|does not support|doesn't support)\b.{0,80}\b(stream(?:ing)?|sse)\b/i.test(
      message,
    ) ||
    /\bstream\b.{0,30}\b(must be|should be|only supports?)\s+false\b/i.test(
      message,
    )
  );
}

export async function handleStreamResponse(
  response: Response,
  onStream?: (chunk: string) => void,
  callbacks?: StreamCallbacks,
): Promise<ChatCompletionResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Cannot read AI response stream");
  const decoder = new TextDecoder();
  const state = createStreamState();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await processStreamTextChunk(
        decoder.decode(value, { stream: true }),
        state,
        onStream,
        callbacks,
        { yieldToUi: true },
      );
      if (state.error) throw new Error(state.error);
    }
    await processStreamTextChunk(decoder.decode(), state, onStream, callbacks, {
      flush: true,
    });
  } finally {
    reader.releaseLock();
  }
  return finalizeStreamState(state, callbacks);
}
