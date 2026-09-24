import {
  buildChatEndpointFromBase,
  buildHeadersForProtocol,
  resolveAIProtocol,
  resolveProtocolBase,
} from "@prompthub/shared/utils/ai-protocol";
import { AI_REQUEST_TIMEOUT_MS } from "@prompthub/shared/constants/ai";
import type {
  AIConfig,
  AITestResult,
  ChatCompletionRequest,
  ChatCompletionOptions,
  ChatCompletionResponse,
  ChatCompletionResult,
  ChatMessage,
  ChatMessageContent,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageParams,
  ImageReferenceAttachment,
  ImageTestResult,
  MultiModelCompareResult,
  PromptRewriteInput,
  PromptRewriteResult,
  StreamCallbacks,
} from "./ai-types";
import {
  generateSkillContentWithCompletion,
  multiModelCompareWithCompletion,
  polishSkillContentWithCompletion,
  rewritePromptDraftWithCompletion,
} from "./ai-content-workflows";
import {
  createResponseLike,
  getAITransport,
  getErrorMessageFromResponse,
  getFormattedErrorMessageFromResponse,
  requestAIEndpoint,
  type ResponseLike,
} from "./ai-request";
import { generateImageOpenAI } from "./ai-image-openai";
import {
  normalizeAssistantContent,
  toAnthropicMessageContent,
} from "./ai-anthropic";

export type * from "./ai-types";
export { buildMessagesFromPrompt } from "./ai-content-workflows";
export {
  fetchAvailableModels,
  getApiEndpointPreview,
  getImageApiEndpointPreview,
} from "./ai-model-discovery";

export {
  getBaseUrl,
  normalizeApiUrlInput,
} from "@prompthub/shared/utils/ai-protocol";

/**
 * AI Service - Call various AI model APIs
 * Most domestic and international service providers are compatible with OpenAI format
 * AI 服务 - 调用各种 AI 模型 API
 * 大部分国内外服务商都兼容 OpenAI 格式
 */

interface StreamState {
  fullContent: string;
  thinkingContent: string;
  buffer: string;
  chunkCount: number;
}

const AI_CONNECTION_TEST_MAX_TOKENS = 8;
const AI_CONNECTION_TEST_PROMPT = "Reply with exactly: OK";

function createStreamState(): StreamState {
  return {
    fullContent: "",
    thinkingContent: "",
    buffer: "",
    chunkCount: 0,
  };
}

function isGeminiApiHost(apiUrl: string): boolean {
  return apiUrl.includes("generativelanguage.googleapis.com");
}

function isGeminiOpenAICompatEndpoint(endpoint: string): boolean {
  return (
    endpoint.includes("generativelanguage.googleapis.com") &&
    endpoint.includes("/openai/")
  );
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

async function processStreamTextChunk(
  chunkText: string,
  state: StreamState,
  onStream?: (chunk: string) => void,
  streamCallbacks?: StreamCallbacks,
  options?: {
    flush?: boolean;
    yieldToUi?: boolean;
  },
): Promise<void> {
  state.buffer += chunkText;
  const lines = state.buffer.split("\n");
  state.buffer = options?.flush ? "" : lines.pop() || "";
  let deltasSinceYield = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "data: [DONE]") continue;
    if (!trimmed.startsWith("data: ")) continue;

    try {
      const json = JSON.parse(trimmed.slice(6));
      const delta = json.choices?.[0]?.delta;

      if (!delta) {
        continue;
      }

      state.chunkCount++;
      deltasSinceYield++;

      if (delta.reasoning_content) {
        state.thinkingContent += delta.reasoning_content;
        streamCallbacks?.onThinking?.(delta.reasoning_content);
      }

      if (delta.content) {
        state.fullContent += delta.content;
        onStream?.(delta.content);
        streamCallbacks?.onContent?.(delta.content);
      }

      if (options?.yieldToUi && deltasSinceYield >= 20) {
        deltasSinceYield = 0;
        await yieldToEventLoop();
      }
    } catch {
      // 忽略解析错误 / Ignore parse errors
    }
  }

  if (options?.yieldToUi) {
    await yieldToEventLoop();
  }
}

function finalizeStreamState(
  state: StreamState,
  streamCallbacks?: StreamCallbacks,
): ChatCompletionResult {
  streamCallbacks?.onComplete?.(
    state.fullContent,
    state.thinkingContent || undefined,
  );

  return {
    content: state.fullContent,
    thinkingContent: state.thinkingContent || undefined,
  };
}

/**
 * 调用 AI 模型进行对话（支持流式输出和思考模型）
 * Call AI model for chat (supports streaming and thinking models)
 */
export async function chatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const { provider, apiKey, apiUrl, model, chatParams } = config;
  const providerId = provider?.toLowerCase() || "";
  const protocol = resolveAIProtocol(config);
  const isGemini = protocol === "gemini";
  const isAnthropic = protocol === "anthropic";
  const normalizedModel = isGemini ? model.replace(/^models\//, "") : model;
  const requestTimeoutMs = options?.timeoutMs ?? AI_REQUEST_TIMEOUT_MS;

  if (!apiKey) {
    throw new Error("API Key is not configured");
  }

  if (!apiUrl) {
    throw new Error("API URL is not configured");
  }

  if (!model) {
    throw new Error("No model selected");
  }

  const endpoint = buildChatEndpointFromBase(
    resolveProtocolBase(apiUrl, protocol),
  );

  // 合并参数：config.chatParams < options（options 优先级更高）
  // Merge parameters: config.chatParams < options (options takes precedence)
  const mergedParams = {
    temperature: options?.temperature ?? chatParams?.temperature ?? 0.7,
    maxTokens: options?.maxTokens ?? chatParams?.maxTokens ?? 2048,
    topP: options?.topP ?? chatParams?.topP,
    topK: options?.topK ?? chatParams?.topK,
    frequencyPenalty: options?.frequencyPenalty ?? chatParams?.frequencyPenalty,
    presencePenalty: options?.presencePenalty ?? chatParams?.presencePenalty,
    stream: options?.stream ?? chatParams?.stream ?? false,
    enableThinking:
      options?.enableThinking ?? chatParams?.enableThinking ?? false,
  };

  if (isAnthropic) {
    mergedParams.stream = false;
  }

  // 构建请求头 / Build request headers
  const headers = buildHeadersForProtocol(protocol, apiKey, {
    accept: mergedParams.stream ? "text/event-stream" : "application/json",
  });

  // 检测是否为需要 max_completion_tokens 的新模型
  // Detect if it's a new model that requires max_completion_tokens
  // Updated for Issue #21: Support automatic fallback/retry for token parameters
  const modelLower = model.toLowerCase();
  let useMaxCompletionTokens =
    modelLower.includes("o1") ||
    modelLower.includes("o3") ||
    modelLower.includes("gpt-4o") ||
    modelLower.includes("gpt-4.5") ||
    /gpt-[5-9]/.test(modelLower) || // Matches gpt-5, gpt-5.2, gpt-6, etc.
    providerId.includes("openai");

  // 构建请求体 / Build request body
  const body: ChatCompletionRequest = {
    model: normalizedModel,
    messages,
    temperature: mergedParams.temperature,
    stream: mergedParams.stream,
  };

  if (isAnthropic) {
    const anthropicMessages = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: toAnthropicMessageContent(message.content),
      }));

    const anthropicBody: Record<string, unknown> = {
      model,
      max_tokens: mergedParams.maxTokens,
      messages: anthropicMessages,
      stream: false,
    };

    const systemMessage = messages.find((message) => message.role === "system");
    if (systemMessage) {
      anthropicBody.system = normalizeAssistantContent(systemMessage.content);
    }

    const requestBody = JSON.stringify(anthropicBody);
    const response = await requestAIEndpoint({
      method: "POST",
      url: endpoint,
      headers,
      body: requestBody,
      timeoutMs: requestTimeoutMs,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessageFromResponse(response));
    }

    const data = await response.json<{
      content?: Array<{ type?: string; text?: string }>;
    }>();
    const content = (data.content || [])
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("");

    if (!content) {
      throw new Error("AI returned an unexpected response format");
    }

    return {
      content,
    };
  }

  // 根据模型类型选择正确的 token 限制参数
  // Choose the correct token limit parameter based on model type
  if (useMaxCompletionTokens) {
    body.max_completion_tokens = mergedParams.maxTokens;
  } else {
    body.max_tokens = mergedParams.maxTokens;
  }

  // 添加可选参数 / Add optional parameters
  if (mergedParams.topP !== undefined) {
    body.top_p = mergedParams.topP;
  }
  if (mergedParams.topK !== undefined) {
    body.top_k = mergedParams.topK;
  }
  if (!isGemini && mergedParams.frequencyPenalty !== undefined) {
    body.frequency_penalty = mergedParams.frequencyPenalty;
  }
  if (!isGemini && mergedParams.presencePenalty !== undefined) {
    body.presence_penalty = mergedParams.presencePenalty;
  }

  // 检测是否为 Qwen 模型 / Detect if Qwen model
  const isQwen =
    providerId.includes("qwen") ||
    providerId.includes("dashscope") ||
    model.toLowerCase().includes("qwen");

  // 处理思考模式 / Handle thinking mode
  // 只有在流式模式下才能启用思考，非流式必须禁用
  if (isQwen) {
    if (mergedParams.stream && mergedParams.enableThinking) {
      body.enable_thinking = true;
    } else {
      body.enable_thinking = false;
    }
  } else if (mergedParams.enableThinking) {
    // 其他支持思考的模型（如 DeepSeek）
    body.enable_thinking = true;
  }

  // 处理自定义参数 / Handle custom parameters
  const customParams = chatParams?.customParams;
  if (customParams && typeof customParams === "object") {
    const bodyAny = body as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(customParams)) {
      if (key && value !== undefined && value !== "") {
        bodyAny[key] = value;
      }
    }
  }

  // 处理输出格式 / Handle response format (Issue #38)
  if (options?.responseFormat && options.responseFormat.type !== "text") {
    if (options.responseFormat.type === "json_object") {
      body.response_format = { type: "json_object" };
    } else if (
      options.responseFormat.type === "json_schema" &&
      options.responseFormat.jsonSchema
    ) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: options.responseFormat.jsonSchema.name,
          strict: options.responseFormat.jsonSchema.strict ?? true,
          schema: options.responseFormat.jsonSchema.schema,
        },
      };
    }
  }

  const transport = getAITransport();

  const sendRequest = async (): Promise<{
    streamResult?: ChatCompletionResult;
    response?: ResponseLike;
  }> => {
    const requestBody = JSON.stringify(body);

    if (mergedParams.stream && transport) {
      const streamState = createStreamState();
      let streamError: string | null = null;

      const response = await transport.requestStream(
        {
          method: "POST",
          url: endpoint,
          headers,
          body: requestBody,
          timeoutMs: requestTimeoutMs,
        },
        {
          onChunk: (chunk) => {
            void processStreamTextChunk(
              chunk,
              streamState,
              options?.onStream,
              options?.streamCallbacks,
            );
          },
          onError: (error) => {
            streamError = error;
          },
        },
      );

      if (!response.ok) {
        return { response: createResponseLike(response) };
      }

      if (streamError) {
        throw new Error(streamError);
      }

      await processStreamTextChunk(
        "",
        streamState,
        options?.onStream,
        options?.streamCallbacks,
        { flush: true },
      );

      return {
        streamResult: finalizeStreamState(
          streamState,
          options?.streamCallbacks,
        ),
      };
    }

    if (transport) {
      const response = await transport.request({
        method: "POST",
        url: endpoint,
        headers,
        body: requestBody,
        timeoutMs: requestTimeoutMs,
      });
      return { response: createResponseLike(response) };
    }

    if (mergedParams.stream) {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () =>
          controller.abort(
            new Error(`Request timeout after ${requestTimeoutMs}ms`),
          ),
        requestTimeoutMs,
      );
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: requestBody,
          signal: controller.signal,
        });
        return {
          streamResult: await handleStreamResponse(
            response,
            options?.onStream,
            options?.streamCallbacks,
          ),
        };
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return {
      response: await requestAIEndpoint({
        method: "POST",
        url: endpoint,
        headers,
        body: requestBody,
        timeoutMs: requestTimeoutMs,
      }),
    };
  };

  try {
    let requestResult = await sendRequest();
    let response = requestResult.response;

    if (response && !response.ok) {
      const errorMessage = await getErrorMessageFromResponse(response);

      // Check for token parameter compatibility issues (Issue #21)
      // 检查 Token 参数兼容性问题
      const isTokenParamError =
        errorMessage.includes("'max_tokens' is not supported") ||
        errorMessage.includes("'max_completion_tokens' is not supported") ||
        errorMessage.includes("Use 'max_completion_tokens' instead") ||
        errorMessage.includes("Use 'max_tokens' instead");

      // Check for enable_thinking compatibility issues (Issue #9)
      // 检查 enable_thinking 参数兼容性问题 (Issue #9)
      const isThinkingParamError =
        errorMessage.includes("enable_thinking must be set to false") ||
        errorMessage.includes("enable_thinking only support stream") ||
        errorMessage.includes("parameter.enable_thinking");

      if (isTokenParamError) {
        console.warn(
          `[AI Service] Token parameter mismatch detected: "${errorMessage}". Retrying with alternative parameter...`,
        );

        if (useMaxCompletionTokens) {
          delete body.max_completion_tokens;
          body.max_tokens = mergedParams.maxTokens;
        } else {
          delete body.max_tokens;
          body.max_completion_tokens = mergedParams.maxTokens;
        }

        requestResult = await sendRequest();
        response = requestResult.response;

        if (response && !response.ok) {
          throw new Error(await getErrorMessageFromResponse(response));
        }
      } else if (isThinkingParamError) {
        console.warn(
          `[AI Service] enable_thinking parameter error detected: "${errorMessage}". Retrying with enable_thinking=false...`,
        );

        body.enable_thinking = false;
        requestResult = await sendRequest();
        response = requestResult.response;

        if (response && !response.ok) {
          throw new Error(await getErrorMessageFromResponse(response));
        }
      } else {
        throw new Error(errorMessage);
      }
    }

    if (requestResult.streamResult) {
      return requestResult.streamResult;
    }

    if (!response) {
      throw new Error("AI 返回结果为空");
    }

    // 非流式响应 / Non-streaming response
    const data: ChatCompletionResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error("AI 返回结果为空");
      // AI returned empty result
    }

    const message = data.choices[0].message;
    return {
      content: normalizeAssistantContent(message.content),
      thinkingContent: message.reasoning_content,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("网络请求失败，请检查网络连接");
    // Network request failed, please check network connection
  }
}

/**
 * 处理流式响应
 * Handle streaming response
 */
async function handleStreamResponse(
  response: Response,
  onStream?: (chunk: string) => void,
  streamCallbacks?: StreamCallbacks,
): Promise<ChatCompletionResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("无法读取响应流");
    // Cannot read response stream
  }

  const decoder = new TextDecoder();
  const state = createStreamState();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      await processStreamTextChunk(
        decoder.decode(value, { stream: true }),
        state,
        onStream,
        streamCallbacks,
        { yieldToUi: true },
      );
    }

    await processStreamTextChunk(
      decoder.decode(),
      state,
      onStream,
      streamCallbacks,
      { flush: true, yieldToUi: true },
    );
  } finally {
    reader.releaseLock();
  }

  return finalizeStreamState(state, streamCallbacks);
}

/**
 * 测试 AI 配置是否可用（带详细结果，支持流式输出）
 * Test AI configuration (with detailed results, supports streaming)
 */
export async function testAIConnection(
  config: AIConfig,
  testPrompt?: string,
  streamCallbacks?: StreamCallbacks,
): Promise<AITestResult> {
  const startTime = Date.now();
  const prompt = testPrompt || AI_CONNECTION_TEST_PROMPT;

  // 连接测试只验证端点和模型能否响应，不能继承长文本生成参数。
  // A connection test is a lightweight probe, not a full generation benchmark.

  try {
    const result = await chatCompletion(
      config,
      [{ role: "user", content: prompt }],
      {
        temperature: 0,
        maxTokens: AI_CONNECTION_TEST_MAX_TOKENS,
        stream: false,
        enableThinking: false,
        streamCallbacks,
        timeoutMs: AI_REQUEST_TIMEOUT_MS,
      },
    );

    return {
      id: config.id,
      success: true,
      response: result.content,
      thinkingContent: result.thinkingContent,
      latency: Date.now() - startTime,
      model: config.model,
      provider: config.provider,
    };
  } catch (error) {
    return {
      id: config.id,
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
      latency: Date.now() - startTime,
      model: config.model,
      provider: config.provider,
    };
  }
}

/**
 * 并行测试多个 AI 配置（用于对比）
 * Test multiple AI configurations in parallel (for comparison)
 */
export async function compareAIModels(
  configs: AIConfig[],
  testPrompt: string,
): Promise<AITestResult[]> {
  const promises = configs.map((config) =>
    testAIConnection(config, testPrompt),
  );
  return Promise.all(promises);
}

// ============ 图像生成功能 ============
// ============ Image Generation Functionality ============

/**
 * 调用图像生成模型
 * 支持多种供应商：OpenAI, FLUX, Ideogram, Recraft, Stability AI, Replicate 等
 * Call image generation model
 * Supports multiple providers: OpenAI, FLUX, Ideogram, Recraft, Stability AI, Replicate, etc.
 */
export async function generateImage(
  config: AIConfig,
  prompt: string,
  options?: {
    size?: string; // 不同 API 支持不同的尺寸格式 / Different APIs support different size formats
    quality?: "standard" | "hd";
    style?: "vivid" | "natural";
    n?: number;
    response_format?: "url" | "b64_json";
    aspect_ratio?: string; // FLUX/Ideogram 使用
    referenceImages?: ImageReferenceAttachment[];
  },
): Promise<ImageGenerationResponse> {
  const { apiKey, apiUrl, model, provider } = config;
  const mergedOptions = {
    ...config.imageParams,
    ...options,
  };

  if (!apiKey) {
    throw new Error("API Key is not configured");
  }

  if (!apiUrl) {
    throw new Error("API URL is not configured");
  }

  // 根据供应商选择不同的 API 调用方式
  // Choose different API calling methods based on provider
  const providerLower = (provider || "").toLowerCase();
  const modelLower = (model || "").toLowerCase();

  // FLUX (Black Forest Labs)
  if (providerLower === "flux" || apiUrl.includes("bfl.ai")) {
    return await generateImageFlux(
      apiKey,
      apiUrl,
      model,
      prompt,
      mergedOptions,
    );
  }

  // Ideogram
  if (providerLower === "ideogram" || apiUrl.includes("ideogram.ai")) {
    return await generateImageIdeogram(
      apiKey,
      apiUrl,
      model,
      prompt,
      mergedOptions,
    );
  }

  // Recraft
  if (providerLower === "recraft" || apiUrl.includes("recraft.ai")) {
    return await generateImageRecraft(
      apiKey,
      apiUrl,
      model,
      prompt,
      mergedOptions,
    );
  }

  // Replicate
  if (providerLower === "replicate" || apiUrl.includes("replicate.com")) {
    return await generateImageReplicate(apiKey, model, prompt, mergedOptions);
  }

  // Stability AI
  if (providerLower === "stability" || apiUrl.includes("stability.ai")) {
    return await generateImageStability(
      apiKey,
      apiUrl,
      model,
      prompt,
      mergedOptions,
    );
  }

  // Google/Gemini Image Generation (uses generateContent API, not OpenAI format)
  // Match on provider='google'/'gemini', URL containing googleapis, or model name heuristics
  if (
    providerLower === "google" ||
    providerLower === "gemini" ||
    apiUrl.includes("generativelanguage.googleapis.com") ||
    (modelLower.includes("gemini") &&
      (modelLower.includes("image") || modelLower.includes("imagen")))
  ) {
    return await generateImageGemini(
      apiKey,
      apiUrl,
      model,
      prompt,
      mergedOptions,
    );
  }

  // OpenAI-compatible format (includes OpenAI, Azure, etc.)
  return await generateImageOpenAI(
    apiKey,
    apiUrl,
    model,
    prompt,
    mergedOptions,
  );
}

// Google Gemini Image Generation via generateContent API
// Google Gemini 通过 generateContent API 生成图片
async function generateImageGemini(
  apiKey: string,
  apiUrl: string,
  model: string,
  prompt: string,
  options?: { n?: number; referenceImages?: ImageReferenceAttachment[] },
): Promise<ImageGenerationResponse> {
  // Build endpoint - Gemini uses generateContent
  // 构建端点 - Gemini 使用 generateContent
  let endpoint = apiUrl.replace(/\/$/, "");

  // Handle different URL formats
  if (endpoint.includes("/chat/completions")) {
    endpoint = endpoint.replace("/chat/completions", "");
  }
  if (endpoint.includes("/v1beta")) {
    endpoint = `${endpoint}/models/${model}:generateContent`;
  } else if (endpoint.includes("/v1")) {
    endpoint = endpoint.replace("/v1", "/v1beta");
    endpoint = `${endpoint}/models/${model}:generateContent`;
  } else {
    // Assume it's a proxy, try OpenAI-compatible chat endpoint
    endpoint = `${endpoint}/v1/chat/completions`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let body: Record<string, any>;

  // Check if using native Gemini API or OpenAI-compatible proxy
  if (endpoint.includes(":generateContent")) {
    // Native Gemini API format
    headers["x-goog-api-key"] = apiKey;
    body = {
      contents: [
        {
          parts: [
            { text: prompt },
            ...(options?.referenceImages ?? []).map((image) => ({
              inlineData: {
                mimeType: image.mimeType,
                data: image.base64,
              },
            })),
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };
  } else {
    // OpenAI-compatible proxy format (use chat completions)
    headers["Authorization"] = `Bearer ${apiKey}`;
    body = {
      model,
      messages: [
        {
          role: "user",
          content:
            options?.referenceImages && options.referenceImages.length > 0
              ? [
                  { type: "text", text: prompt },
                  ...options.referenceImages.map((image) => ({
                    type: "image_url",
                    image_url: {
                      url: `data:${image.mimeType};base64,${image.base64}`,
                    },
                  })),
                ]
              : prompt,
        },
      ],
      stream: false,
    };
  }

  const response = await requestAIEndpoint({
    method: "POST",
    headers,
    body: JSON.stringify(body),
    url: endpoint,
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new Error(
      await getFormattedErrorMessageFromResponse(response, {
        operation: "Image generation",
        fallback: `Gemini image generation failed (${response.status})`,
        maxTextLength: 500,
      }),
    );
  }

  const result = await response.json<any>();

  // Handle different response formats
  // 处理不同的响应格式
  if (result.candidates) {
    // Native Gemini format
    const candidate = result.candidates[0];
    const parts = candidate?.content?.parts || [];

    const imagePart = parts.find((p: any) =>
      p.inlineData?.mimeType?.startsWith("image/"),
    );

    if (imagePart?.inlineData) {
      return {
        created: Date.now(),
        data: [
          {
            b64_json: imagePart.inlineData.data,
          },
        ],
      };
    }

    // Check if there's text response (might indicate an error or refusal)
    const textPart = parts.find((p: any) => p.text);
    if (textPart?.text) {
      console.warn("[generateImageGemini] Got text instead of image");
      throw new Error(
        `Model returned text instead of an image: ${textPart.text.slice(0, 200)}`,
      );
    }

    // No image in response
    console.error("[generateImageGemini] No image data in candidates");
    throw new Error(
      "Gemini response did not contain image data. Please ensure you are using a model that supports image generation.",
    );
  }

  if (result.choices) {
    // OpenAI-compatible format from proxy
    const content = result.choices[0]?.message?.content;

    // Check if content contains image URL or base64
    if (typeof content === "string") {
      // Try to extract URL if present
      const urlMatch = content.match(/https?:\/\/[^\s"'<>]+/i);
      if (urlMatch) {
        return {
          created: Date.now(),
          data: [{ url: urlMatch[0] }],
        };
      }
      // Check if it's base64
      if (
        content.startsWith("data:image/") ||
        content.match(/^[A-Za-z0-9+/=]{100,}/)
      ) {
        return {
          created: Date.now(),
          data: [
            { b64_json: content.replace(/^data:image\/[^;]+;base64,/, "") },
          ],
        };
      }

      // Content is text, not image - might be refusal or error
      console.warn("[generateImageGemini] Content is text, not image");
      throw new Error(
        `Model returned text instead of an image: ${content.slice(0, 300)}`,
      );
    }

    // Content might be array with image_url
    if (Array.isArray(result.choices[0]?.message?.content)) {
      const imgContent = result.choices[0].message.content.find(
        (c: any) => c.type === "image_url",
      );
      if (imgContent?.image_url?.url) {
        const url = imgContent.image_url.url;
        if (url.startsWith("data:image/")) {
          return {
            created: Date.now(),
            data: [{ b64_json: url.replace(/^data:image\/[^;]+;base64,/, "") }],
          };
        }
        return {
          created: Date.now(),
          data: [{ url }],
        };
      }
    }

    // Check for images array in message (some proxies use this format)
    // 检查 message.images 数组（某些代理使用此格式）
    const images = result.choices[0]?.message?.images;
    if (Array.isArray(images) && images.length > 0) {
      const firstImage = images[0];
      const imageUrl = firstImage?.image_url?.url || firstImage?.url;

      if (imageUrl) {
        if (imageUrl.startsWith("data:image/")) {
          return {
            created: Date.now(),
            data: [
              { b64_json: imageUrl.replace(/^data:image\/[^;]+;base64,/, "") },
            ],
          };
        }
        return {
          created: Date.now(),
          data: [{ url: imageUrl }],
        };
      }
    }

    // Content is null but no images found
    if (result.choices[0]?.message?.content === null) {
      console.error(
        "[generateImageGemini] content is null and no images found in message",
      );
    }
  }

  // If we got here, response format is unexpected
  console.error("[generateImageGemini] Unexpected response format");
  throw new Error(
    `Failed to extract image from response. Response format: ${JSON.stringify(result).slice(0, 500)}`,
  );
}

// FLUX (Black Forest Labs) API
async function generateImageFlux(
  apiKey: string,
  apiUrl: string,
  model: string,
  prompt: string,
  options?: { aspect_ratio?: string; n?: number },
): Promise<ImageGenerationResponse> {
  const endpoint = apiUrl.replace(/\/$/, "") + "/images/generations";

  const body: Record<string, any> = {
    prompt,
    model: model || "flux-pro-1.1",
    width: 1024,
    height: 1024,
  };

  // FLUX 使用 aspect_ratio
  // FLUX uses aspect_ratio
  if (options?.aspect_ratio) {
    const [w, h] = options.aspect_ratio.split(":").map(Number);
    if (w && h) {
      body.width = w > h ? 1024 : Math.round((1024 * w) / h);
      body.height = h > w ? 1024 : Math.round((1024 * h) / w);
    }
  }

  const response = await requestAIEndpoint({
    method: "POST",
    url: endpoint,
    headers: {
      "Content-Type": "application/json",
      "X-Key": apiKey,
    },
    body: JSON.stringify(body),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new Error(
      await getFormattedErrorMessageFromResponse(response, {
        operation: "Image generation",
        fallback: `FLUX image generation failed (${response.status})`,
      }),
    );
  }

  const result = await response.json<any>();
  return {
    created: Date.now(),
    data: [{ url: result.sample || result.url || result.image }],
  };
}

// Ideogram API
async function generateImageIdeogram(
  apiKey: string,
  apiUrl: string,
  model: string,
  prompt: string,
  options?: { aspect_ratio?: string; n?: number },
): Promise<ImageGenerationResponse> {
  const endpoint = apiUrl.replace(/\/$/, "") + "/generate";

  const body: Record<string, any> = {
    image_request: {
      prompt,
      model: model || "V_3",
      aspect_ratio: options?.aspect_ratio || "ASPECT_1_1",
    },
  };

  const response = await requestAIEndpoint({
    method: "POST",
    url: endpoint,
    headers: {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
    },
    body: JSON.stringify(body),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new Error(
      await getFormattedErrorMessageFromResponse(response, {
        operation: "Image generation",
        fallback: `Ideogram image generation failed (${response.status})`,
      }),
    );
  }

  const result = await response.json<any>();
  const images = result.data || [];
  return {
    created: Date.now(),
    data: images.map((img: any) => ({ url: img.url })),
  };
}

// Recraft API
async function generateImageRecraft(
  apiKey: string,
  apiUrl: string,
  model: string,
  prompt: string,
  options?: { size?: string; n?: number },
): Promise<ImageGenerationResponse> {
  const endpoint = apiUrl.replace(/\/$/, "") + "/images/generations";

  const body: Record<string, any> = {
    prompt,
    model: model || "recraftv3",
    n: options?.n ?? 1,
  };

  if (options?.size) body.size = options.size;

  const response = await requestAIEndpoint({
    method: "POST",
    url: endpoint,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new Error(
      await getFormattedErrorMessageFromResponse(response, {
        operation: "Image generation",
        fallback: `Recraft image generation failed (${response.status})`,
      }),
    );
  }

  const result = await response.json<any>();
  return {
    created: Date.now(),
    data: result.data || [{ url: result.image?.url }],
  };
}

// Replicate API
async function generateImageReplicate(
  apiKey: string,
  model: string,
  prompt: string,
  options?: { aspect_ratio?: string; n?: number },
): Promise<ImageGenerationResponse> {
  // Replicate 使用 predictions API
  // Replicate uses predictions API
  const endpoint = "https://api.replicate.com/v1/predictions";

  const body: Record<string, any> = {
    version: model, // Replicate 使用 model version / Replicate uses model version
    input: {
      prompt,
      num_outputs: options?.n ?? 1,
    },
  };

  if (options?.aspect_ratio) {
    body.input.aspect_ratio = options.aspect_ratio;
  }

  const response = await requestAIEndpoint({
    method: "POST",
    url: endpoint,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new Error(
      await getFormattedErrorMessageFromResponse(response, {
        operation: "Image generation",
        fallback: `Replicate image generation failed (${response.status})`,
      }),
    );
  }

  const prediction = await response.json<any>();

  // Replicate 是异步的，需要轮询结果
  // Replicate is asynchronous, need to poll for results
  let result = prediction;
  while (result.status === "starting" || result.status === "processing") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const pollResponse = await requestAIEndpoint({
      method: "GET",
      url: result.urls.get,
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });
    if (!pollResponse.ok) {
      throw new Error(
        await getFormattedErrorMessageFromResponse(pollResponse, {
          operation: "Image generation",
          fallback: `Replicate image generation failed (${pollResponse.status})`,
        }),
      );
    }
    result = await pollResponse.json<any>();
  }

  if (result.status === "failed") {
    throw new Error(`Replicate image generation failed: ${result.error}`);
    // Replicate image generation failed
  }

  const outputs = Array.isArray(result.output)
    ? result.output
    : [result.output];
  return {
    created: Date.now(),
    data: outputs.map((url: string) => ({ url })),
  };
}

// Stability AI API
async function generateImageStability(
  apiKey: string,
  apiUrl: string,
  model: string,
  prompt: string,
  options?: { size?: string; n?: number },
): Promise<ImageGenerationResponse> {
  const endpoint =
    apiUrl.replace(/\/$/, "") +
    "/generation/" +
    (model || "stable-diffusion-xl-1024-v1-0") +
    "/text-to-image";

  const body: Record<string, any> = {
    text_prompts: [{ text: prompt, weight: 1 }],
    samples: options?.n ?? 1,
    steps: 30,
  };

  if (options?.size) {
    const [width, height] = options.size.split("x").map(Number);
    if (width && height) {
      body.width = width;
      body.height = height;
    }
  }

  const response = await requestAIEndpoint({
    method: "POST",
    url: endpoint,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new Error(
      await getFormattedErrorMessageFromResponse(response, {
        operation: "Image generation",
        fallback: `Stability AI image generation failed (${response.status})`,
      }),
    );
  }

  const result = await response.json<any>();
  return {
    created: Date.now(),
    data:
      result.artifacts?.map((art: any) => ({
        b64_json: art.base64,
      })) || [],
  };
}

/**
 * 测试图像生成模型
 * 注意：不同 API 对参数的支持不同，测试时只传递最基本的参数
 * Test image generation model
 * Note: Different APIs support different parameters, only pass basic parameters during testing
 */
export async function testImageGeneration(
  config: AIConfig,
  testPrompt?: string,
): Promise<ImageTestResult> {
  const startTime = Date.now();
  const prompt = testPrompt || "A cute cat sitting on a windowsill";

  try {
    // 测试时不传递 size 等参数，让 API 使用默认值
    // Don't pass size and other parameters during testing, let API use default values
    const result = await generateImage(
      { ...config, imageParams: undefined },
      prompt,
      { n: 1 },
    );

    const imageData = result.data[0];

    return {
      success: true,
      imageUrl: imageData.url,
      imageBase64: imageData.b64_json,
      revisedPrompt: imageData.revised_prompt,
      latency: Date.now() - startTime,
      model: config.model,
      provider: config.provider,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
      latency: Date.now() - startTime,
      model: config.model,
      provider: config.provider,
    };
  }
}

export async function generateSkillContent(
  config: AIConfig,
  skillName: string,
  skillPurpose: string,
  streamCallbacks?: StreamCallbacks,
  customSystemPrompt?: string,
): Promise<string> {
  return generateSkillContentWithCompletion(
    chatCompletion,
    config,
    skillName,
    skillPurpose,
    streamCallbacks,
    customSystemPrompt,
  );
}

export async function polishSkillContent(
  config: AIConfig,
  existingContent: string,
  skillName?: string,
  streamCallbacks?: StreamCallbacks,
): Promise<string> {
  return polishSkillContentWithCompletion(
    chatCompletion,
    config,
    existingContent,
    skillName,
    streamCallbacks,
  );
}

export async function rewritePromptDraft(
  config: AIConfig,
  input: PromptRewriteInput,
): Promise<PromptRewriteResult> {
  return rewritePromptDraftWithCompletion(chatCompletion, config, input);
}

// ============ 多模型对比分析 ============
// ============ Multi-Model Comparison Analysis ============

/**
 * Multi-model prompt comparison (parallel execution, supports streaming)
 * 多模型提示词对比分析（并行执行，支持流式输出）
 */
export async function multiModelCompare(
  configs: AIConfig[],
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    streamCallbacksMap?: Map<string, StreamCallbacks>; // Streaming callback for each model
    // 每个模型的流式回调
  },
): Promise<MultiModelCompareResult> {
  return multiModelCompareWithCompletion(
    chatCompletion,
    configs,
    messages,
    options,
  );
}
