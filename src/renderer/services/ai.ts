/**
 * AI Service - Call various AI model APIs
 * Most domestic and international service providers are compatible with OpenAI format
 * AI 服务 - 调用各种 AI 模型 API
 * 大部分国内外服务商都兼容 OpenAI 格式
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;  // 新版 OpenAI 模型（o1, gpt-5 等）使用此参数
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  enable_thinking?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  choices: {
    index: number;
    message: ChatMessage & {
      reasoning_content?: string;  // 思考模型的思考内容 / Thinking content for reasoning models
    };
    finish_reason: string;
    delta?: {
      content?: string;
      reasoning_content?: string;
    };
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Chat model parameters
// 对话模型参数
export interface ChatParams {
  temperature?: number;       // 温度 (0-2) / Temperature
  maxTokens?: number;         // 最大 token 数 / Max tokens
  topP?: number;              // Top-P 采样 / Top-P sampling
  topK?: number;              // Top-K 采样 / Top-K sampling
  frequencyPenalty?: number;  // 频率惩罚 / Frequency penalty
  presencePenalty?: number;   // 存在惩罚 / Presence penalty
  stream?: boolean;           // 流式输出 / Streaming output
  enableThinking?: boolean;   // 思考模式 / Thinking mode
  customParams?: Record<string, string | number | boolean>;  // 自定义参数 / Custom parameters
}

// Image model parameters
// 图像模型参数
export interface ImageParams {
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
}

export interface AIConfig {
  // 可选：用于区分同名模型（多模型对比的流式回调映射）
  // Optional: Used to distinguish models with the same name (for multi-model comparison streaming callback mapping)
  id?: string;
  provider: string;
  apiKey: string;
  apiUrl: string;
  model: string;
  type?: 'chat' | 'image'; // 模型类型 / Model type
  chatParams?: ChatParams;
  imageParams?: ImageParams;
}

// ============ 图像生成相关接口 ============
// ============ Image Generation Related Interfaces ============

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  n?: number;
  size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  response_format?: 'url' | 'b64_json';
}

export interface ImageGenerationResponse {
  created: number;
  data: {
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }[];
}

export interface ImageTestResult {
  success: boolean;
  imageUrl?: string;
  imageBase64?: string;
  revisedPrompt?: string;
  error?: string;
  latency?: number;
  model: string;
  provider: string;
}

// Streaming output callback interface
// 流式输出回调接口
export interface StreamCallbacks {
  onContent?: (chunk: string) => void;           // 内容块回调 / Content chunk callback
  onThinking?: (chunk: string) => void;          // 思考内容回调 / Thinking content callback
  onComplete?: (fullContent: string, thinkingContent?: string) => void;  // 完成回调 / Completion callback
}

// Chat completion result
// 对话完成结果
export interface ChatCompletionResult {
  content: string;
  thinkingContent?: string;
}

/**
 * 调用 AI 模型进行对话（支持流式输出和思考模型）
 * Call AI model for chat (supports streaming and thinking models)
 */
export async function chatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stream?: boolean;
    enableThinking?: boolean;
    onStream?: (chunk: string) => void;  // 兼容旧版 / Legacy compatibility
    streamCallbacks?: StreamCallbacks;
  }
): Promise<ChatCompletionResult> {
  const { provider, apiKey, apiUrl, model, chatParams } = config;
  const providerId = provider?.toLowerCase() || '';
  const isGemini = apiUrl.includes('generativelanguage.googleapis.com');
  const normalizedModel = isGemini ? model.replace(/^models\//, '') : model;

  if (!apiKey) {
    throw new Error('请先配置 API Key');
  }

  if (!apiUrl) {
    throw new Error('请先配置 API 地址');
  }

  if (!model) {
    throw new Error('请先选择模型');
    // Please select a model first
  }

  // 构建请求 URL / Build request URL
  // 使用与 getApiEndpointPreview 一致的补全逻辑
  // Use the same completion logic as getApiEndpointPreview
  let endpoint = apiUrl.trim();

  // 如果以 # 结尾，移除 # 并不做任何自动补全
  // If ends with #, remove # and don't auto-complete
  if (endpoint.endsWith('#')) {
    endpoint = endpoint.slice(0, -1);
    if (!endpoint.endsWith('/chat/completions')) {
      endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
    }
  } else {
    // 移除尾部斜杠
    endpoint = endpoint.replace(/\/$/, '');
    if (isGemini && endpoint.endsWith('/models')) {
      endpoint = endpoint.replace(/\/models$/, '');
    }

    // 如果已经包含 /chat/completions，保持原样
    if (endpoint.endsWith('/chat/completions')) {
      // 保持原样
    } else if (isGemini) {
      if (endpoint.endsWith('/openai')) {
        endpoint = endpoint + '/chat/completions';
      } else if (endpoint.match(/\/v\d+(?:beta)?$/)) {
        endpoint = endpoint + '/openai/chat/completions';
      } else {
        endpoint = endpoint + '/v1beta/openai/chat/completions';
      }
    } else if (endpoint.match(/\/v\d+$/)) {
      // 如果已经有版本路径如 /v1，直接追加 /chat/completions
      endpoint = endpoint + '/chat/completions';
    } else {
      // 否则自动补全 /v1/chat/completions
      endpoint = endpoint + '/v1/chat/completions';
    }
  }

  // 构建请求头 / Build request headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 不同供应商的认证方式 / Different provider authentication
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (isGemini) {
    headers['x-goog-api-key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

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
    enableThinking: options?.enableThinking ?? chatParams?.enableThinking ?? false,
  };

  // 检测是否为需要 max_completion_tokens 的新模型
  // Detect if it's a new model that requires max_completion_tokens
  // Updated for Issue #21: Support automatic fallback/retry for token parameters
  const modelLower = model.toLowerCase();
  let useMaxCompletionTokens =
    modelLower.includes('o1') ||
    modelLower.includes('o3') ||
    modelLower.includes('gpt-4o') ||
    modelLower.includes('gpt-4.5') || 
    /gpt-[5-9]/.test(modelLower) ||  // Matches gpt-5, gpt-5.2, gpt-6, etc.
    providerId.includes('openai');

  // 构建请求体 / Build request body
  const body: ChatCompletionRequest = {
    model: normalizedModel,
    messages,
    temperature: mergedParams.temperature,
    stream: mergedParams.stream,
  };

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
    providerId.includes('qwen') ||
    providerId.includes('dashscope') ||
    model.toLowerCase().includes('qwen');

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
  if (customParams && typeof customParams === 'object') {
    const bodyAny = body as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(customParams)) {
      if (key && value !== undefined && value !== '') {
        bodyAny[key] = value;
      }
    }
  }



  try {
    let response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API 请求失败 (${response.status})`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        if (errorText) {
          errorMessage = errorText.slice(0, 200);
        }
      }

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
        console.warn(`[AI Service] Token parameter mismatch detected: "${errorMessage}". Retrying with alternative parameter...`);
        
        // Toggle parameter
        if (useMaxCompletionTokens) {
          // Switch to max_tokens (old style)
          delete body.max_completion_tokens;
          body.max_tokens = mergedParams.maxTokens;
        } else {
          // Switch to max_completion_tokens (new style)
          delete body.max_tokens;
          body.max_completion_tokens = mergedParams.maxTokens;
        }

        // Retry request
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        // If explicitly failed again, process error normally
        if (!response.ok) {
           const retryErrorText = await response.text();
           let retryErrorMessage = `API 请求失败 (重试后): ${response.status}`;
           try {
             const retryJson = JSON.parse(retryErrorText);
             retryErrorMessage = retryJson.error?.message || retryJson.message || retryErrorMessage;
           } catch { 
             if (retryErrorText) retryErrorMessage = retryErrorText.slice(0, 200);
           }
           throw new Error(retryErrorMessage);
        }
      } else if (isThinkingParamError) {
        console.warn(`[AI Service] enable_thinking parameter error detected: "${errorMessage}". Retrying with enable_thinking=false...`);
        
        // Disable thinking and retry
        body.enable_thinking = false;

        // Retry request
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        // If explicitly failed again, process error normally
        if (!response.ok) {
           const retryErrorText = await response.text();
           let retryErrorMessage = `API 请求失败 (重试后): ${response.status}`;
           try {
             const retryJson = JSON.parse(retryErrorText);
             retryErrorMessage = retryJson.error?.message || retryJson.message || retryErrorMessage;
           } catch { 
             if (retryErrorText) retryErrorMessage = retryErrorText.slice(0, 200);
           }
           throw new Error(retryErrorMessage);
        }
      } else {
        throw new Error(errorMessage);
      }
    }

    // 流式输出处理 / Streaming output handling
    // Debug: Log streaming status / 调试：记录流式状态
    console.log('[AI Service] Stream mode:', mergedParams.stream, 'Callbacks provided:', !!options?.streamCallbacks);

    if (mergedParams.stream) {
      console.log('[AI Service] Starting stream response handling...');
      return await handleStreamResponse(response, options?.onStream, options?.streamCallbacks);
    }

    // 非流式响应 / Non-streaming response
    const data: ChatCompletionResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('AI 返回结果为空');
      // AI returned empty result
    }

    const message = data.choices[0].message;
    return {
      content: message.content,
      thinkingContent: message.reasoning_content,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('网络请求失败，请检查网络连接');
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
  streamCallbacks?: StreamCallbacks
): Promise<ChatCompletionResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
    // Cannot read response stream
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let thinkingContent = '';
  let buffer = '';

  // Helper to yield control to the event loop, allowing RAF to run
  // 让出事件循环控制权的辅助函数，允许 RAF 运行
  const yieldToEventLoop = () =>
    new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });

  try {
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('[AI Stream] Stream completed, total chunks:', chunkCount);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      let deltasSinceYield = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;

          if (delta) {
            chunkCount++;
            deltasSinceYield++;
            // 处理思考内容 / Handle thinking content
            if (delta.reasoning_content) {
              thinkingContent += delta.reasoning_content;
              streamCallbacks?.onThinking?.(delta.reasoning_content);
            }

            // 处理正常内容 / Handle normal content
            if (delta.content) {
              fullContent += delta.content;
              onStream?.(delta.content);
              streamCallbacks?.onContent?.(delta.content);
              // Log first chunk to verify streaming / 记录第一个块以验证流式输出
              if (chunkCount === 1) {
                console.log('[AI Stream] First content chunk received:', delta.content.slice(0, 50));
              }
            }
            if (deltasSinceYield >= 20) {
              deltasSinceYield = 0;
              await yieldToEventLoop();
            }
          }
        } catch {
          // 忽略解析错误 / Ignore parse errors
        }
      }

      // Yield to event loop after every read to allow UI updates
      // 每次读取后都让出事件循环以允许 UI 更新
      // This is CRITICAL for streaming to appear smooth instead of all-at-once
      if (chunkCount % 50 === 0) {
        console.log(`[AI Stream] Yielding at chunk ${chunkCount}, content length: ${fullContent.length}`);
      }
      await yieldToEventLoop();
    }
  } finally {
    reader.releaseLock();
  }

  streamCallbacks?.onComplete?.(fullContent, thinkingContent || undefined);

  return {
    content: fullContent,
    thinkingContent: thinkingContent || undefined,
  };
}

export interface AITestResult {
  // Optional: link the result back to the configured model instance
  // 可选：用于将结果关联回具体的模型配置实例（避免同 provider/model 串台）
  id?: string;
  success: boolean;
  response?: string;
  thinkingContent?: string;  // 思考内容 / Thinking content
  error?: string;
  latency?: number; // 响应时间 (ms)
  model: string;
  provider: string;
}

/**
 * 测试 AI 配置是否可用（带详细结果，支持流式输出）
 * Test AI configuration (with detailed results, supports streaming)
 */
export async function testAIConnection(
  config: AIConfig,
  testPrompt?: string,
  streamCallbacks?: StreamCallbacks
): Promise<AITestResult> {
  const startTime = Date.now();
  const prompt = testPrompt || 'Hello! Please respond with a brief greeting.';

  // 使用配置中的参数，但限制 maxTokens 用于测试
  // Use config parameters, but limit maxTokens for testing
  const useStream = config.chatParams?.stream ?? false;
  const useThinking = config.chatParams?.enableThinking ?? false;

  try {
    const result = await chatCompletion(config, [
      { role: 'user', content: prompt }
    ], {
      maxTokens: 2048,
      stream: useStream,
      enableThinking: useThinking,
      streamCallbacks,
    });

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
      error: error instanceof Error ? error.message : '未知错误',
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
  testPrompt: string
): Promise<AITestResult[]> {
  const promises = configs.map(config => testAIConnection(config, testPrompt));
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
    size?: string;  // 不同 API 支持不同的尺寸格式 / Different APIs support different size formats
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
    n?: number;
    response_format?: 'url' | 'b64_json';
    aspect_ratio?: string; // FLUX/Ideogram 使用
  }
): Promise<ImageGenerationResponse> {
  const { apiKey, apiUrl, model, provider } = config;

  if (!apiKey) {
    throw new Error('请先配置 API Key');
  }

  if (!apiUrl) {
    throw new Error('请先配置 API 地址');
  }

  // 根据供应商选择不同的 API 调用方式
  // Choose different API calling methods based on provider
  const providerLower = (provider || '').toLowerCase();
  const modelLower = (model || '').toLowerCase();

  // FLUX (Black Forest Labs)
  if (providerLower === 'flux' || apiUrl.includes('bfl.ai')) {
    return await generateImageFlux(apiKey, apiUrl, model, prompt, options);
  }

  // Ideogram
  if (providerLower === 'ideogram' || apiUrl.includes('ideogram.ai')) {
    return await generateImageIdeogram(apiKey, apiUrl, model, prompt, options);
  }

  // Recraft
  if (providerLower === 'recraft' || apiUrl.includes('recraft.ai')) {
    return await generateImageRecraft(apiKey, apiUrl, model, prompt, options);
  }

  // Replicate
  if (providerLower === 'replicate' || apiUrl.includes('replicate.com')) {
    return await generateImageReplicate(apiKey, model, prompt, options);
  }

  // Stability AI
  if (providerLower === 'stability' || apiUrl.includes('stability.ai')) {
    return await generateImageStability(apiKey, apiUrl, model, prompt, options);
  }

  // Google/Gemini Image Generation (uses generateContent API, not OpenAI format)
  // 如果模型名包含 gemini 且是图片生成类型，使用 Gemini 的 generateContent API
  if (modelLower.includes('gemini') && (modelLower.includes('image') || modelLower.includes('imagen'))) {
    return await generateImageGemini(apiKey, apiUrl, model, prompt, options);
  }

  // OpenAI 兼容格式（包括 OpenAI, Azure 等）
  return await generateImageOpenAI(apiKey, apiUrl, model, prompt, options);
}

// Google Gemini Image Generation via generateContent API
// Google Gemini 通过 generateContent API 生成图片
async function generateImageGemini(
  apiKey: string,
  apiUrl: string,
  model: string,
  prompt: string,
  options?: { n?: number }
): Promise<ImageGenerationResponse> {
  // Build endpoint - Gemini uses generateContent
  // 构建端点 - Gemini 使用 generateContent
  let endpoint = apiUrl.replace(/\/$/, '');
  
  // Handle different URL formats
  if (endpoint.includes('/chat/completions')) {
    endpoint = endpoint.replace('/chat/completions', '');
  }
  if (endpoint.includes('/v1beta')) {
    endpoint = `${endpoint}/models/${model}:generateContent`;
  } else if (endpoint.includes('/v1')) {
    endpoint = endpoint.replace('/v1', '/v1beta');
    endpoint = `${endpoint}/models/${model}:generateContent`;
  } else {
    // Assume it's a proxy, try OpenAI-compatible chat endpoint
    endpoint = `${endpoint}/v1/chat/completions`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  let body: Record<string, any>;

  // Check if using native Gemini API or OpenAI-compatible proxy
  if (endpoint.includes(':generateContent')) {
    // Native Gemini API format
    headers['x-goog-api-key'] = apiKey;
    body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE']
      }
    };
  } else {
    // OpenAI-compatible proxy format (use chat completions)
    headers['Authorization'] = `Bearer ${apiKey}`;
    body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Gemini 图像生成失败 (${response.status})`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message 
        || errorJson.error?.status
        || errorJson.message
        || (typeof errorJson.error === 'string' ? errorJson.error : null)
        || errorMessage;
      
      // Append error code if available
      if (errorJson.error?.code) {
        errorMessage = `${errorMessage} (code: ${errorJson.error.code})`;
      }
    } catch {
      if (errorText) errorMessage = `${errorMessage}: ${errorText.slice(0, 500)}`;
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();
  
  // Handle different response formats
  // 处理不同的响应格式
  console.log('[generateImageGemini] Response received:', JSON.stringify(result, null, 2).slice(0, 2000));
  
  if (result.candidates) {
    // Native Gemini format
    const candidate = result.candidates[0];
    const parts = candidate?.content?.parts || [];
    console.log('[generateImageGemini] Gemini native format, parts count:', parts.length);
    
    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
    
    if (imagePart?.inlineData) {
      console.log('[generateImageGemini] Found image data, mimeType:', imagePart.inlineData.mimeType);
      return {
        created: Date.now(),
        data: [{
          b64_json: imagePart.inlineData.data,
        }],
      };
    }
    
    // Check if there's text response (might indicate an error or refusal)
    const textPart = parts.find((p: any) => p.text);
    if (textPart?.text) {
      console.warn('[generateImageGemini] Got text instead of image:', textPart.text);
      throw new Error(`模型返回了文本而非图像: ${textPart.text.slice(0, 200)}`);
    }
    
    // No image in response
    console.error('[generateImageGemini] No image data in candidates. Parts:', parts);
    throw new Error('Gemini 响应中未包含图像数据。请确保使用支持图像生成的模型。');
  }
  
  if (result.choices) {
    // OpenAI-compatible format from proxy
    const content = result.choices[0]?.message?.content;
    console.log('[generateImageGemini] OpenAI format, content type:', typeof content, 
      typeof content === 'string' ? content.slice(0, 200) : '(array or object)');
    
    // Check if content contains image URL or base64
    if (typeof content === 'string') {
      // Try to extract URL if present
      const urlMatch = content.match(/https?:\/\/[^\s"'<>]+/i);
      if (urlMatch) {
        console.log('[generateImageGemini] Found URL in content:', urlMatch[0]);
        return {
          created: Date.now(),
          data: [{ url: urlMatch[0] }],
        };
      }
      // Check if it's base64
      if (content.startsWith('data:image/') || content.match(/^[A-Za-z0-9+/=]{100,}/)) {
        console.log('[generateImageGemini] Found base64 in content');
        return {
          created: Date.now(),
          data: [{ b64_json: content.replace(/^data:image\/[^;]+;base64,/, '') }],
        };
      }
      
      // Content is text, not image - might be refusal or error
      console.warn('[generateImageGemini] Content is text, not image:', content.slice(0, 500));
      throw new Error(`模型返回了文本而非图像: ${content.slice(0, 300)}`);
    }
    
    // Content might be array with image_url
    if (Array.isArray(result.choices[0]?.message?.content)) {
      console.log('[generateImageGemini] Content is array, looking for image_url...');
      const imgContent = result.choices[0].message.content.find((c: any) => c.type === 'image_url');
      if (imgContent?.image_url?.url) {
        console.log('[generateImageGemini] Found image_url:', imgContent.image_url.url.slice(0, 100));
        const url = imgContent.image_url.url;
        if (url.startsWith('data:image/')) {
          return {
            created: Date.now(),
            data: [{ b64_json: url.replace(/^data:image\/[^;]+;base64,/, '') }],
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
      console.log('[generateImageGemini] Found message.images array:', images.length, 'images');
      const firstImage = images[0];
      const imageUrl = firstImage?.image_url?.url || firstImage?.url;
      
      if (imageUrl) {
        console.log('[generateImageGemini] Extracted image URL:', imageUrl.slice(0, 100));
        if (imageUrl.startsWith('data:image/')) {
          return {
            created: Date.now(),
            data: [{ b64_json: imageUrl.replace(/^data:image\/[^;]+;base64,/, '') }],
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
      console.error('[generateImageGemini] content is null and no images found in message');
    }
  }

  // If we got here, response format is unexpected
  console.error('[generateImageGemini] Unexpected response format. Full response:', JSON.stringify(result, null, 2));
  throw new Error(`无法从响应中提取图像。响应格式: ${JSON.stringify(result).slice(0, 500)}`);
}

// OpenAI 兼容格式
async function generateImageOpenAI(
  apiKey: string,
  apiUrl: string,
  model: string,
  prompt: string,
  options?: {
    size?: string;
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
    n?: number;
    response_format?: 'url' | 'b64_json';
  }
): Promise<ImageGenerationResponse> {
  let endpoint = apiUrl.replace(/\/$/, '');

  if (endpoint.includes('/images/generations')) {
    // 保持原样 / Keep as is
  } else if (endpoint.endsWith('/chat/completions')) {
    endpoint = endpoint.replace(/\/chat\/completions$/, '/images/generations');
  } else if (endpoint.match(/\/v\d+$/)) {
    endpoint = endpoint + '/images/generations';
  } else {
    endpoint = endpoint + '/v1/images/generations';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  const body: Record<string, any> = {
    prompt,
    model: model || 'dall-e-3',
    n: options?.n ?? 1,
  };

  if (options?.size) body.size = options.size;
  if (options?.quality) body.quality = options.quality;
  if (options?.style) body.style = options.style;
  if (options?.response_format !== undefined) body.response_format = options.response_format;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `图像生成失败 (${response.status})`;
    // Image generation failed
    try {
      const errorJson = JSON.parse(errorText);
      // Try different error message formats
      // 尝试不同的错误消息格式
      errorMessage = errorJson.error?.message 
        || errorJson.error?.type 
        || errorJson.message 
        || errorJson.detail
        || (typeof errorJson.error === 'string' ? errorJson.error : null)
        || errorMessage;
      
      // If we have additional error info, append it
      // 如果有更多错误信息，附加上去
      if (errorJson.error?.code) {
        errorMessage = `${errorMessage} (code: ${errorJson.error.code})`;
      }
      if (errorJson.error?.type && errorJson.error?.type !== errorMessage) {
        errorMessage = `[${errorJson.error.type}] ${errorMessage}`;
      }
    } catch {
      if (errorText) errorMessage = errorText.slice(0, 500);
    }
    throw new Error(errorMessage);
  }

  return await response.json();
}

// FLUX (Black Forest Labs) API
async function generateImageFlux(
  apiKey: string,
  apiUrl: string,
  model: string,
  prompt: string,
  options?: { aspect_ratio?: string; n?: number }
): Promise<ImageGenerationResponse> {
  const endpoint = apiUrl.replace(/\/$/, '') + '/images/generations';

  const body: Record<string, any> = {
    prompt,
    model: model || 'flux-pro-1.1',
    width: 1024,
    height: 1024,
  };

  // FLUX 使用 aspect_ratio
  // FLUX uses aspect_ratio
  if (options?.aspect_ratio) {
    const [w, h] = options.aspect_ratio.split(':').map(Number);
    if (w && h) {
      body.width = w > h ? 1024 : Math.round(1024 * w / h);
      body.height = h > w ? 1024 : Math.round(1024 * h / w);
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FLUX 图像生成失败: ${errorText.slice(0, 200)}`);
    // FLUX image generation failed
  }

  const result = await response.json();
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
  options?: { aspect_ratio?: string; n?: number }
): Promise<ImageGenerationResponse> {
  const endpoint = apiUrl.replace(/\/$/, '') + '/generate';

  const body: Record<string, any> = {
    image_request: {
      prompt,
      model: model || 'V_3',
      aspect_ratio: options?.aspect_ratio || 'ASPECT_1_1',
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ideogram 图像生成失败: ${errorText.slice(0, 200)}`);
    // Ideogram image generation failed
  }

  const result = await response.json();
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
  options?: { size?: string; n?: number }
): Promise<ImageGenerationResponse> {
  const endpoint = apiUrl.replace(/\/$/, '') + '/images/generations';

  const body: Record<string, any> = {
    prompt,
    model: model || 'recraftv3',
    n: options?.n ?? 1,
  };

  if (options?.size) body.size = options.size;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Recraft 图像生成失败: ${errorText.slice(0, 200)}`);
    // Recraft image generation failed
  }

  const result = await response.json();
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
  options?: { aspect_ratio?: string; n?: number }
): Promise<ImageGenerationResponse> {
  // Replicate 使用 predictions API
  // Replicate uses predictions API
  const endpoint = 'https://api.replicate.com/v1/predictions';

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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Replicate 图像生成失败: ${errorText.slice(0, 200)}`);
    // Replicate image generation failed
  }

  const prediction = await response.json();

  // Replicate 是异步的，需要轮询结果
  // Replicate is asynchronous, need to poll for results
  let result = prediction;
  while (result.status === 'starting' || result.status === 'processing') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const pollResponse = await fetch(result.urls.get, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    result = await pollResponse.json();
  }

  if (result.status === 'failed') {
    throw new Error(`Replicate 图像生成失败: ${result.error}`);
    // Replicate image generation failed
  }

  const outputs = Array.isArray(result.output) ? result.output : [result.output];
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
  options?: { size?: string; n?: number }
): Promise<ImageGenerationResponse> {
  const endpoint = apiUrl.replace(/\/$/, '') + '/generation/' + (model || 'stable-diffusion-xl-1024-v1-0') + '/text-to-image';

  const body: Record<string, any> = {
    text_prompts: [{ text: prompt, weight: 1 }],
    samples: options?.n ?? 1,
    steps: 30,
  };

  if (options?.size) {
    const [width, height] = options.size.split('x').map(Number);
    if (width && height) {
      body.width = width;
      body.height = height;
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stability AI 图像生成失败: ${errorText.slice(0, 200)}`);
    // Stability AI image generation failed
  }

  const result = await response.json();
  return {
    created: Date.now(),
    data: result.artifacts?.map((art: any) => ({
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
  testPrompt?: string
): Promise<ImageTestResult> {
  const startTime = Date.now();
  const prompt = testPrompt || 'A cute cat sitting on a windowsill';

  try {
    // 测试时不传递 size 等参数，让 API 使用默认值
    // Don't pass size and other parameters during testing, let API use default values
    const result = await generateImage(config, prompt, { n: 1 });

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
      error: error instanceof Error ? error.message : '未知错误',
      latency: Date.now() - startTime,
      model: config.model,
      provider: config.provider,
    };
  }
}

// ============ 多模型对比分析 ============
// ============ Multi-Model Comparison Analysis ============

export interface MultiModelCompareResult {
  messages: ChatMessage[];
  results: AITestResult[];
  totalTime: number;
}

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
    streamCallbacksMap?: Map<string, StreamCallbacks>;  // Streaming callback for each model
    // 每个模型的流式回调
  }
): Promise<MultiModelCompareResult> {
  const startTime = Date.now();

  const promises = configs.map(async (config) => {
    const resultStartTime = Date.now();
    const streamCallbacks = options?.streamCallbacksMap?.get(config.id || config.model);

    try {
      // 显式传递 stream 和 enableThinking 参数
      // Explicitly pass stream and enableThinking parameters
      const useStream = config.chatParams?.stream ?? false;
      const useThinking = config.chatParams?.enableThinking ?? false;

      const result = await chatCompletion(config, messages, {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        stream: useStream,
        enableThinking: useThinking,
        streamCallbacks,
      });

      return {
        id: config.id,
        success: true,
        response: result.content,
        thinkingContent: result.thinkingContent,
        latency: Date.now() - resultStartTime,
        model: config.model,
        provider: config.provider,
      } as AITestResult;
    } catch (error) {
      return {
        id: config.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latency: Date.now() - resultStartTime,
        model: config.model,
        provider: config.provider,
      } as AITestResult;
    }
  });

  const results = await Promise.all(promises);

  return {
    messages,
    results,
    totalTime: Date.now() - startTime,
  };
}

/**
 * Generate messages using prompt template
 * 使用 Prompt 模板生成消息
 */
export function buildMessagesFromPrompt(
  systemPrompt: string | undefined,
  userPrompt: string,
  variables?: Record<string, string>
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // Replace variables
  // 替换变量
  let processedUserPrompt = userPrompt;
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      processedUserPrompt = processedUserPrompt.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        value
      );
    }
  }

  if (systemPrompt) {
    let processedSystemPrompt = systemPrompt;
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        processedSystemPrompt = processedSystemPrompt.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
          value
        );
      }
    }
    messages.push({ role: 'system', content: processedSystemPrompt });
  }

  messages.push({ role: 'user', content: processedUserPrompt });

  return messages;
}

// ============ 获取模型列表 ============
// ============ Get Model List ============

export interface ModelInfo {
  id: string;
  name?: string;
  owned_by?: string;
  created?: number;
}

export interface FetchModelsResult {
  success: boolean;
  models: ModelInfo[];
  error?: string;
}

/**
 * Calculate Base URL (for display preview)
 * 处理各种用户输入情况，返回标准化的 base URL
 * 如果用户在 URL 末尾输入 #，则视为显式指定，不进行后续补全，预览显示 # 之前的部分
 * Calculate base URL (for display preview)
 * Handle various user input scenarios, return standardized base URL
 * If the user enters # at the end of the URL, it is treated as explicitly specified, 
 * no subsequent completion is performed, and the preview displays the part before #
 */
export function getBaseUrl(apiUrl: string): string {
  if (!apiUrl) return '';

  let url = apiUrl.trim();

  // Handle # suffix: if ends with #, treat as explicit and remove # for display
  // 处理 # 后缀：如果以 # 结尾，视为显式指定，显示时移除 #
  if (url.endsWith('#')) {
    return url.slice(0, -1);
  }

  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  // Remove common endpoint suffixes
  // 移除常见的端点后缀
  const suffixes = ['/chat/completions', '/completions', '/models', '/embeddings', '/images/generations'];
  for (const suffix of suffixes) {
    if (url.endsWith(suffix)) {
      url = url.slice(0, -suffix.length);
      break;
    }
  }

  return url;
}

/**
 * Get complete API endpoint preview (for display)
 * 如果用户输入以 # 结尾，则不自动填充后续路径
 * 如果用户没有输入 /v1，会自动补全
 * 对于 Gemini API，使用 OpenAI 兼容端点
 * Get complete API endpoint preview (for display)
 * If the input ends with #, do not auto-fill the subsequent path
 * Auto-complete /v1 if user didn't input it
 * Use OpenAI-compatible endpoint for Gemini API
 */
export function getApiEndpointPreview(apiUrl: string): string {
  if (!apiUrl) return '';

  // If ends with #, just return the part before # without any auto-fill
  // 如果以 # 结尾，直接返回 # 之前的部分，不进行任何自动填充
  if (apiUrl.trim().endsWith('#')) {
    return apiUrl.trim().slice(0, -1);
  }

  const baseUrl = getBaseUrl(apiUrl);

  // Gemini API uses OpenAI-compatible endpoint format
  // Gemini（Google Generative Language API）使用 OpenAI 兼容端点
  if (baseUrl.includes('generativelanguage.googleapis.com')) {
    if (baseUrl.endsWith('/openai')) {
      return baseUrl + '/chat/completions';
    }
    if (baseUrl.match(/\/v\d+(?:beta)?$/)) {
      return baseUrl + '/openai/chat/completions';
    }
    return baseUrl + '/v1beta/openai/chat/completions';
  }

  // Check if version path is already included
  // 检查是否已经包含版本路径
  if (baseUrl.endsWith('/v1') || baseUrl.match(/\/v\d+$/)) {
    return baseUrl + '/chat/completions';
  }

  // Auto-complete /v1
  // 自动补全 /v1
  return baseUrl + '/v1/chat/completions';
}

/**
 * Get image generation API endpoint preview (for display)
 * 如果用户输入以 # 结尾，则不自动填充后续路径
 * 获取生图 API 端点预览（用于显示）
 */
export function getImageApiEndpointPreview(apiUrl: string): string {
  if (!apiUrl) return '';

  // If ends with #, just return the part before # without any auto-fill
  // 如果以 # 结尾，直接返回 # 之前的部分，不进行任何自动填充
  if (apiUrl.trim().endsWith('#')) {
    return apiUrl.trim().slice(0, -1);
  }

  const baseUrl = getBaseUrl(apiUrl);

  // Gemini is not OpenAI's images/generations specification
  // Gemini（Google Generative Language API）并非 OpenAI 的 images/generations 规范
  if (baseUrl.includes('generativelanguage.googleapis.com')) {
    const geminiBaseUrl = baseUrl.replace(/\/openai$/, '');
    if (geminiBaseUrl.match(/\/v\d+(?:beta)?$/)) {
      return geminiBaseUrl + '/models';
    }
    return geminiBaseUrl + '/v1beta/models';
  }

  let endpoint = apiUrl.replace(/\/$/, '');

  // If already contains images/generations, use directly
  // 如果已经包含 images/generations，直接使用
  if (endpoint.includes('/images/generations')) {
    return endpoint;
  } else if (endpoint.endsWith('/chat/completions')) {
    // Replace chat/completions with images/generations
    // 替换 chat/completions 为 images/generations
    return endpoint.replace(/\/chat\/completions$/, '/images/generations');
  } else if (endpoint.match(/\/v\d+$/)) {
    // If ends with /v1, /v2, /v3, etc., append /images/generations
    // 如果以 /v1, /v2, /v3 等结尾，追加 /images/generations
    return endpoint + '/images/generations';
  } else {
    // Default append /v1/images/generations
    // 默认追加 /v1/images/generations
    return endpoint + '/v1/images/generations';
  }
}

/**
 * Fetch available model list from API
 * 从 API 获取可用模型列表
 */
export async function fetchAvailableModels(
  apiUrl: string,
  apiKey: string
): Promise<FetchModelsResult> {
  if (!apiKey || !apiUrl) {
    return { success: false, models: [], error: 'Please fill in API Key and API URL first' };
    // 请先填写 API Key 和 API 地址
  }

  try {
    // Calculate base URL and add /models
    // 计算 base URL 并添加 /models
    let baseUrl = getBaseUrl(apiUrl);
    let endpoint = baseUrl + '/models';

    // Gemini: https://generativelanguage.googleapis.com/v1beta/models
    // Users might only fill host (without /v1beta), need to complete according to Gemini specification
    // 用户可能只填 host（不含 /v1beta），这里需要按 Gemini 规范补齐
    if (baseUrl.includes('generativelanguage.googleapis.com')) {
      baseUrl = baseUrl.replace(/\/openai$/, '');
      if (baseUrl.match(/\/v\d+(?:beta)?$/)) {
        endpoint = baseUrl + '/models';
      } else {
        endpoint = baseUrl + '/v1beta/models';
      }
    }

    const isGemini = baseUrl.includes('generativelanguage.googleapis.com');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (isGemini) {
      headers['x-goog-api-key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        models: [],
        error: `获取模型列表失败: ${response.status} - ${errorText.substring(0, 100)}`
        // Failed to get model list 
      };
    }

    const data = await response.json();

    // OpenAI 格式的响应
    // OpenAI format response
    if (data.data && Array.isArray(data.data)) {
      const models = data.data
        .filter((m: { id?: string }) => m.id) // 过滤掉没有 id 的 / Filter out those without id
        .map((m: { id: string; owned_by?: string; created?: number }) => ({
          id: m.id,
          name: m.id,
          owned_by: m.owned_by,
          created: m.created,
        }))
        .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id));

      return { success: true, models };
    }

    // Gemini 格式的响应 / Gemini format response
    if (data.models && Array.isArray(data.models)) {
      const models = data.models
        .filter((m: { name?: string }) => m.name)
        .map((m: { name: string; displayName?: string; description?: string }) => {
          // Gemini returns "models/gemini-pro", we need "gemini-pro" for OpenAI compatible endpoint
          const id = m.name.replace(/^models\//, '');
          return {
            id: id,
            name: m.displayName ? `${m.displayName} (${id})` : id,
            owned_by: 'Google',
            description: m.description,
          };
        })
        .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id));

      return { success: true, models };
    }

    // 某些 API 直接返回数组
    // Some APIs return array directly
    if (Array.isArray(data)) {
      const models = data
        .filter((m: { id?: string; model?: string }) => m.id || m.model)
        .map((m: { id?: string; model?: string; name?: string }) => ({
          id: m.id || m.model || '',
          name: m.name || m.id || m.model,
        }));
      return { success: true, models };
    }

    return { success: false, models: [], error: '无法解析模型列表响应' };
    // Cannot parse model list response
  } catch (error) {
    return {
      success: false,
      models: [],
      error: error instanceof Error ? error.message : '获取模型列表失败'
      // Failed to get model list 
    };
  }
}
