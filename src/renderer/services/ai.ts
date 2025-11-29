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
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AIConfig {
  provider: string;
  apiKey: string;
  apiUrl: string;
  model: string;
  type?: 'chat' | 'image'; // 模型类型
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

/**
 * 调用 AI 模型进行对话
 */
export async function chatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    onStream?: (chunk: string) => void;
  }
): Promise<string> {
  const { provider, apiKey, apiUrl, model } = config;
  
  if (!apiKey) {
    throw new Error('请先配置 API Key');
  }
  
  if (!apiUrl) {
    throw new Error('请先配置 API 地址');
  }
  
  if (!model) {
    throw new Error('请先选择模型');
  }

  // 构建请求 URL
  let endpoint = apiUrl;
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
  }

  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 不同供应商的认证方式
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // 构建请求体
  const body: ChatCompletionRequest = {
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
    stream: false,
  };

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

    const data: ChatCompletionResponse = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('AI 返回结果为空');
    }

    return data.choices[0].message.content;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('网络请求失败，请检查网络连接');
  }
}

export interface AITestResult {
  success: boolean;
  response?: string;
  error?: string;
  latency?: number; // 响应时间 (ms)
  model: string;
  provider: string;
}

/**
 * 测试 AI 配置是否可用（带详细结果）
 */
export async function testAIConnection(
  config: AIConfig,
  testPrompt?: string
): Promise<AITestResult> {
  const startTime = Date.now();
  const prompt = testPrompt || 'Hello! Please respond with a brief greeting.';
  
  try {
    const result = await chatCompletion(config, [
      { role: 'user', content: prompt }
    ], { maxTokens: 100 });
    
    return {
      success: true,
      response: result,
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
    size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
    n?: number;
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
  let endpoint = apiUrl;
  if (!endpoint.endsWith('/images/generations')) {
    endpoint = endpoint.replace(/\/$/, '').replace(/\/chat\/completions$/, '') + '/images/generations';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  const body: ImageGenerationRequest = {
    prompt,
    model: model || 'dall-e-3',
    n: options?.n ?? 1,
    size: options?.size ?? '1024x1024',
    quality: options?.quality ?? 'standard',
    style: options?.style ?? 'vivid',
    response_format: 'url',
  };

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
 */
export async function testImageGeneration(
  config: AIConfig,
  testPrompt?: string
): Promise<ImageTestResult> {
  const startTime = Date.now();
  const prompt = testPrompt || 'A cute cat sitting on a windowsill';
  
  try {
    const result = await generateImage(config, prompt, { 
      size: '1024x1024',
      quality: 'standard' 
    });
    
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
  prompt: string;
  results: AITestResult[];
  totalTime: number;
}

/**
 * 多模型提示词对比分析（并行执行）
 */
export async function multiModelCompare(
  configs: AIConfig[],
  prompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<MultiModelCompareResult> {
  const startTime = Date.now();
  
  const promises = configs.map(async (config) => {
    const resultStartTime = Date.now();
    try {
      const response = await chatCompletion(config, [
        { role: 'user', content: prompt }
      ], options);
      
      return {
        success: true,
        response,
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
    prompt,
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
