import { isVideoModelProtocol, type VideoModelProtocol } from "@prompthub/shared/types";
import { requestAIEndpoint } from "./ai-request";

export interface VideoEndpoint {
  apiUrl: string;
  apiKey: string;
  model: string;
  videoProtocol?: VideoModelProtocol;
}

export interface VideoReferences {
  images: string[];
  videos: string[];
}
export type VideoTaskResult =
  | { state: "pending" }
  | { state: "succeeded"; url: string };
const arkTasks = "/contents/generations/tasks";
const wanCreate = "/services/aigc/video-generation/video-synthesis";

export function videoBaseUrl(
  config: Pick<VideoEndpoint, "videoProtocol" | "apiUrl">,
): string {
  if (!isVideoModelProtocol(config.videoProtocol)) throw new Error("Select a supported video API protocol");
  const base = config.apiUrl.trim().replace(/\/+$/, "");
  if (config.videoProtocol === "dashscope")
    return base.replace(/\/compatible-mode\/v1$/, "/api/v1");
  return base.endsWith("/api") ? base + "/v3" : base;
}

export function videoCreateUrl(
  config: Pick<VideoEndpoint, "videoProtocol" | "apiUrl">,
): string {
  return (
    videoBaseUrl(config) +
    (config.videoProtocol === "dashscope" ? wanCreate : arkTasks)
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

export async function videoRequest(
  config: VideoEndpoint,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const response = await requestAIEndpoint({
    method: body === undefined ? "GET" : "POST",
    url,
    headers: {
      Authorization: "Bearer " + config.apiKey,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      "Video API: HTTP " +
        response.status +
        " " +
        (response.error || response.statusText),
    );
  return record(await response.json());
}

export async function createVideoTask(
  config: VideoEndpoint,
  text: string,
  refs: VideoReferences,
): Promise<string> {
  const wan = config.videoProtocol === "dashscope";
  const media = [
    ...refs.images.map((url) => ({ type: "reference_image", url })),
    ...refs.videos.map((url) => ({ type: "reference_video", url })),
  ];
  const body = wan
    ? { model: config.model, input: { prompt: text, media } }
    : {
        model: config.model,
        content: [
          { type: "text", text },
          ...refs.images.map((url) => ({
            type: "image_url",
            role: "reference_image",
            image_url: { url },
          })),
          ...refs.videos.map((url) => ({
            type: "video_url",
            role: "reference_video",
            video_url: { url },
          })),
        ],
      };
  const response = await videoRequest(
    config,
    videoCreateUrl(config),
    body,
    wan
      ? {
          "X-DashScope-Async": "enable",
          "X-DashScope-OssResourceResolve": "enable",
        }
      : undefined,
  );
  const id = wan ? record(response.output).task_id : response.id;
  if (typeof id !== "string" || !id.trim())
    throw new Error("Missing video task ID");
  return id;
}

export async function getVideoTask(
  config: VideoEndpoint,
  id: string,
): Promise<VideoTaskResult> {
  if (!/^[\w-]+$/.test(id)) throw new Error("Invalid video task ID");
  const wan = config.videoProtocol === "dashscope";
  const response = await videoRequest(
    config,
    videoBaseUrl(config) + (wan ? "/tasks/" : arkTasks + "/") + id,
  );
  const data = wan ? record(response.output) : response;
  const status = wan ? data.task_status : data.status;
  if (
    wan
      ? status === "PENDING" || status === "RUNNING"
      : status === "queued" || status === "running"
  )
    return { state: "pending" };
  if (status !== (wan ? "SUCCEEDED" : "succeeded")) {
    const message = wan ? data.message : record(data.error).message;
    throw new Error(
      typeof message === "string" ? message : "Video task: " + String(status),
    );
  }
  const url = wan ? data.video_url : record(data.content).video_url;
  if (typeof url !== "string" || !/^https?:\/\//i.test(url))
    throw new Error("Missing video result URL");
  return { state: "succeeded", url };
}

// A connection probe must not start a billable generation.
export async function testVideoEndpoint(config: VideoEndpoint): Promise<void> {
  const wan = config.videoProtocol === "dashscope";
  const url =
    videoBaseUrl(config) +
    (wan
      ? "/uploads?action=getPolicy&model=" + encodeURIComponent(config.model)
      : arkTasks + "?page_size=1");
  const reply = await videoRequest(config, url);
  if (wan ? !record(reply.data).policy : !Array.isArray(reply.items))
    throw new Error("Invalid video service response");
}
