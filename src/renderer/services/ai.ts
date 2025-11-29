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

/**
 * 测试 AI 配置是否可用
 */
export async function testAIConnection(config: AIConfig): Promise<boolean> {
  try {
    const result = await chatCompletion(config, [
      { role: 'user', content: 'Hello, please respond with "OK" only.' }
    ], { maxTokens: 10 });
    return result.length > 0;
  } catch {
    return false;
  }
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
