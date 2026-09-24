import type {
  ImageGenerationResponse,
  ImageReferenceAttachment,
} from "./ai-types";
import { AI_REQUEST_TIMEOUT_MS } from "@prompthub/shared/constants/ai";
import {
  getFormattedErrorMessageFromResponse,
  isGptImageModel,
  requestAIEndpoint,
} from "./ai-request";

interface OpenAIImageOptions {
  size?: string;
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
  n?: number;
  response_format?: "url" | "b64_json";
  referenceImages?: ImageReferenceAttachment[];
}

function resolveOpenAIImageEndpoint(
  apiUrl: string,
  operation: "generations" | "edits",
): string {
  const endpoint = apiUrl.replace(/\/$/, "");
  if (/\/images\/(?:generations|edits)$/u.test(endpoint)) {
    return endpoint.replace(
      /\/images\/(?:generations|edits)$/u,
      `/images/${operation}`,
    );
  }
  if (endpoint.endsWith("/chat/completions")) {
    return endpoint.replace(/\/chat\/completions$/u, `/images/${operation}`);
  }
  if (/\/v\d+$/u.test(endpoint)) return `${endpoint}/images/${operation}`;
  return `${endpoint}/v1/images/${operation}`;
}

function getReferenceFileExtension(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  throw new Error("Reference images must be PNG, JPEG, or WebP files");
}

async function editImage(
  apiKey: string,
  apiUrl: string,
  model: string,
  prompt: string,
  options: OpenAIImageOptions,
): Promise<ImageGenerationResponse> {
  if (!isGptImageModel(model)) {
    throw new Error(
      "The selected image generation endpoint does not support reference images. Use a GPT Image model or Gemini-compatible endpoint.",
    );
  }
  const fields: Record<string, string> = { model, prompt };
  if (options.quality) {
    fields.quality = options.quality === "hd" ? "high" : "medium";
  }
  if (options.size) fields.size = options.size;
  const response = await requestAIEndpoint({
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    multipart: {
      fields,
      files: (options.referenceImages ?? []).map((reference, index) => {
        const extension = getReferenceFileExtension(reference.mimeType);
        return {
          fieldName: "image[]",
          fileName: reference.name || `reference-${index + 1}.${extension}`,
          mimeType: reference.mimeType,
          base64: reference.base64,
        };
      }),
    },
    url: resolveOpenAIImageEndpoint(apiUrl, "edits"),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new Error(
      await getFormattedErrorMessageFromResponse(response, {
        operation: "Image editing",
        fallback: `Image editing failed (${response.status})`,
        maxTextLength: 500,
      }),
    );
  }
  return await response.json();
}

export async function generateImageOpenAI(
  apiKey: string,
  apiUrl: string,
  model: string,
  prompt: string,
  options: OpenAIImageOptions = {},
): Promise<ImageGenerationResponse> {
  if ((options.referenceImages?.length ?? 0) > 0) {
    return editImage(apiKey, apiUrl, model, prompt, options);
  }

  const body: Record<string, unknown> = {
    prompt,
    model: model || "dall-e-3",
  };
  const imageCount = options.n ?? 1;
  if (imageCount > 1 || !isGptImageModel(model)) body.n = imageCount;
  if (options.size) body.size = options.size;
  if (options.quality) body.quality = options.quality;
  if (options.style) body.style = options.style;
  if (options.response_format !== undefined) {
    body.response_format = options.response_format;
  }

  const response = await requestAIEndpoint({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    url: resolveOpenAIImageEndpoint(apiUrl, "generations"),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });
  if (!response.ok) {
    throw new Error(
      await getFormattedErrorMessageFromResponse(response, {
        operation: "Image generation",
        fallback: `Image generation failed (${response.status})`,
        maxTextLength: 500,
      }),
    );
  }
  return await response.json();
}
