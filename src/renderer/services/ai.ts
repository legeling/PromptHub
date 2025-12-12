/**
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

// 对话模型参数
// Chat model parameters
export interface ChatParams {
  temperature?: number;       // 温度 (0-2) / Temperature
  maxTokens?: number;         // 最大 token 数 / Max tokens
  topP?: number;              // Top-P 采样 / Top-P sampling
  topK?: number;              // Top-K 采样 / Top-K sampling
  frequencyPenalty?: number;  // 频率惩罚 / Frequency penalty
  presencePenalty?: number;   // 存在惩罚 / Presence penalty
  stream?: boolean;           // 流式输出 / Streaming output
  enableThinking?: boolean;   // 思考模式 / Thinking mode
}

// 图像模型参数
// Image model parameters
export interface ImageParams {
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
}

export interface AIConfig {
  // 可选：用于区分同名模型（多模型对比的流式回调映射）
  id?: string;
  provider: string;
  apiKey: string;
  apiUrl: string;
  model: string;
  type?: 'chat' | 'image'; // 模型类型
  chatParams?: ChatParams;
  imageParams?: ImageParams;
}

// ============ 图像生成相关接口 ============

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

// 流式输出回调接口
// Streaming output callback interface
export interface StreamCallbacks {
  onContent?: (chunk: string) => void;           // 内容块回调 / Content chunk callback
  onThinking?: (chunk: string) => void;          // 思考内容回调 / Thinking content callback
  onComplete?: (fullContent: string, thinkingContent?: string) => void;  // 完成回调 / Completion callback
}

// 对话完成结果
// Chat completion result
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
  
  if (!apiKey) {
    throw new Error('请先配置 API Key');
  }
  
  if (!apiUrl) {
    throw new Error('请先配置 API 地址');
  }
  
  if (!model) {
    throw new Error('请先选择模型');
  }

  // 构建请求 URL / Build request URL
  let endpoint = apiUrl;
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
  }

  // 构建请求头 / Build request headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 不同供应商的认证方式 / Different provider authentication
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
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

  // 构建请求体 / Build request body
  const body: ChatCompletionRequest = {
    model,
    messages,
    temperature: mergedParams.temperature,
    max_tokens: mergedParams.maxTokens,
    stream: mergedParams.stream,
  };

  // 添加可选参数 / Add optional parameters
  if (mergedParams.topP !== undefined) {
    body.top_p = mergedParams.topP;
  }
  if (mergedParams.topK !== undefined) {
    body.top_k = mergedParams.topK;
  }
  if (mergedParams.frequencyPenalty !== undefined) {
    body.frequency_penalty = mergedParams.frequencyPenalty;
  }
  if (mergedParams.presencePenalty !== undefined) {
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

  try {
    const response = await fetch(endpoint, {
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
      throw new Error(errorMessage);
    }

    // 流式输出处理 / Streaming output handling
    if (mergedParams.stream) {
      return await handleStreamResponse(response, options?.onStream, options?.streamCallbacks);
    }

    // 非流式响应 / Non-streaming response
    const data: ChatCompletionResponse = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('AI 返回结果为空');
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
  }

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
          
          if (delta) {
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
            }
          }
        } catch {
          // 忽略解析错误 / Ignore parse errors
        }
      }
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
  const useStream = config.chatParams?.stream ?? false;
  
  try {
    const result = await chatCompletion(config, [
      { role: 'user', content: prompt }
    ], { 
      maxTokens: 2048,
      stream: useStream,
      streamCallbacks,
    });
    
    return {
      success: true,
      response: result.content,
      thinkingContent: result.thinkingContent,
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

/**
 * 并行测试多个 AI 配置（用于对比）
 */
export async function compareAIModels(
  configs: AIConfig[],
  testPrompt: string
): Promise<AITestResult[]> {
  const promises = configs.map(config => testAIConnection(config, testPrompt));
  return Promise.all(promises);
}

// ============ 图像生成功能 ============

/**
 * 调用图像生成模型
 */
export async function generateImage(
  config: AIConfig,
  prompt: string,
  options?: {
    size?: string;  // 不同 API 支持不同的尺寸格式
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
    n?: number;
    response_format?: 'url' | 'b64_json';
  }
): Promise<ImageGenerationResponse> {
  const { apiKey, apiUrl, model } = config;
  
  if (!apiKey) {
    throw new Error('请先配置 API Key');
  }
  
  if (!apiUrl) {
    throw new Error('请先配置 API 地址');
  }

  // 构建请求 URL
  let endpoint = apiUrl.replace(/\/$/, '');
  
  // 如果已经包含 images/generations，直接使用
  if (endpoint.includes('/images/generations')) {
    // 保持原样
  } else if (endpoint.endsWith('/chat/completions')) {
    // 替换 chat/completions 为 images/generations
    endpoint = endpoint.replace(/\/chat\/completions$/, '/images/generations');
  } else if (endpoint.match(/\/v\d+$/)) {
    // 如果以 /v1, /v2, /v3 等结尾，追加 /images/generations
    endpoint = endpoint + '/images/generations';
  } else {
    // 默认追加 /v1/images/generations
    endpoint = endpoint + '/v1/images/generations';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  // 构建请求体 - 只包含必要参数，避免不兼容的参数导致错误
  const body: Record<string, any> = {
    prompt,
    model: model || 'dall-e-3',
    n: options?.n ?? 1,
  };
  
  // 只有明确指定了 size 才添加（不同 API 对 size 的要求不同）
  if (options?.size) {
    body.size = options.size;
  }
  
  // OpenAI 特有参数，只在需要时添加
  if (options?.quality) {
    body.quality = options.quality;
  }
  if (options?.style) {
    body.style = options.style;
  }
  if (options?.response_format !== undefined) {
    body.response_format = options.response_format;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `图像生成失败 (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        if (errorText) {
          errorMessage = errorText.slice(0, 200);
        }
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('网络请求失败，请检查网络连接');
  }
}

/**
 * 测试图像生成模型
 * 注意：不同 API 对参数的支持不同，测试时只传递最基本的参数
 */
export async function testImageGeneration(
  config: AIConfig,
  testPrompt?: string
): Promise<ImageTestResult> {
  const startTime = Date.now();
  const prompt = testPrompt || 'A cute cat sitting on a windowsill';
  
  try {
    // 测试时不传递 size 等参数，让 API 使用默认值
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

export interface MultiModelCompareResult {
  messages: ChatMessage[];
  results: AITestResult[];
  totalTime: number;
}

/**
 * 多模型提示词对比分析（并行执行，支持流式输出）
 * Multi-model prompt comparison (parallel execution, supports streaming)
 */
export async function multiModelCompare(
  configs: AIConfig[],
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    streamCallbacksMap?: Map<string, StreamCallbacks>;  // 每个模型的流式回调
  }
): Promise<MultiModelCompareResult> {
  const startTime = Date.now();
  
  const promises = configs.map(async (config) => {
    const resultStartTime = Date.now();
    const streamCallbacks = options?.streamCallbacksMap?.get(config.id || config.model);
    
    try {
      const result = await chatCompletion(config, messages, {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        streamCallbacks,
      });
      
      return {
        success: true,
        response: result.content,
        thinkingContent: result.thinkingContent,
        latency: Date.now() - resultStartTime,
        model: config.model,
        provider: config.provider,
      } as AITestResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
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
 * 使用 Prompt 模板生成消息
 */
export function buildMessagesFromPrompt(
  systemPrompt: string | undefined,
  userPrompt: string,
  variables?: Record<string, string>
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  
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
 * 计算 Base URL（用于显示预览）
 * 处理各种用户输入情况，返回标准化的 base URL
 */
export function getBaseUrl(apiUrl: string): string {
  if (!apiUrl) return '';
  
  let url = apiUrl.trim();
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  
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
 * 获取完整的 API 端点预览（用于显示）
 * 如果用户没有输入 /v1，会自动补全
 */
export function getApiEndpointPreview(apiUrl: string): string {
  if (!apiUrl) return '';
  
  const baseUrl = getBaseUrl(apiUrl);
  
  // 检查是否已经包含版本路径
  if (baseUrl.endsWith('/v1') || baseUrl.match(/\/v\d+$/)) {
    return baseUrl + '/chat/completions';
  }
  
  // 自动补全 /v1
  return baseUrl + '/v1/chat/completions';
}

/**
 * 获取生图 API 端点预览（用于显示）
 */
export function getImageApiEndpointPreview(apiUrl: string): string {
  if (!apiUrl) return '';
  
  let endpoint = apiUrl.replace(/\/$/, '');
  
  // 如果已经包含 images/generations，直接使用
  if (endpoint.includes('/images/generations')) {
    return endpoint;
  } else if (endpoint.endsWith('/chat/completions')) {
    // 替换 chat/completions 为 images/generations
    return endpoint.replace(/\/chat\/completions$/, '/images/generations');
  } else if (endpoint.match(/\/v\d+$/)) {
    // 如果以 /v1, /v2, /v3 等结尾，追加 /images/generations
    return endpoint + '/images/generations';
  } else {
    // 默认追加 /v1/images/generations
    return endpoint + '/v1/images/generations';
  }
}

/**
 * 从 API 获取可用模型列表
 * 大部分 OpenAI 兼容的 API 都支持 /models 端点
 */
export async function fetchAvailableModels(
  apiUrl: string,
  apiKey: string
): Promise<FetchModelsResult> {
  if (!apiKey || !apiUrl) {
    return { success: false, models: [], error: '请先填写 API Key 和 API 地址' };
  }

  try {
    // 计算 base URL 并添加 /models
    const baseUrl = getBaseUrl(apiUrl);
    const endpoint = baseUrl + '/models';

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { 
        success: false, 
        models: [], 
        error: `获取模型列表失败: ${response.status} - ${errorText.substring(0, 100)}` 
      };
    }

    const data = await response.json();
    
    // OpenAI 格式的响应
    if (data.data && Array.isArray(data.data)) {
      const models = data.data
        .filter((m: { id?: string }) => m.id) // 过滤掉没有 id 的
        .map((m: { id: string; owned_by?: string; created?: number }) => ({
          id: m.id,
          name: m.id,
          owned_by: m.owned_by,
          created: m.created,
        }))
        .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id));
      
      return { success: true, models };
    }

    // 某些 API 直接返回数组
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
  } catch (error) {
    return { 
      success: false, 
      models: [], 
      error: error instanceof Error ? error.message : '获取模型列表失败' 
    };
  }
}
