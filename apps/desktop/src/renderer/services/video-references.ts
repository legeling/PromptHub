import { requestAIEndpoint } from "./ai-request";
import {
  videoBaseUrl,
  videoRequest,
  type VideoEndpoint,
} from "./video-generation";

const imageMime: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
export async function videoReferenceImage(name: string): Promise<string> {
  const mime = imageMime[name.split(".").pop()?.toLowerCase() ?? ""];
  if (!mime) throw new Error("Unsupported image: " + name);
  const bytes = await window.electron?.readImageBase64?.(name);
  if (!bytes) throw new Error("Cannot read reference image: " + name);
  return "data:" + mime + ";base64," + bytes;
}

export function arkVideoSource(input: string): string {
  const value = input.trim();
  if (/^asset:\/\/[\w-]+$/.test(value)) return value;
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  )
    throw new Error("Expected a video URL or asset ID");
  return url.href;
}

export async function uploadWanVideo(
  config: VideoEndpoint,
  name: string,
): Promise<string> {
  if (!/\.(mp4|mov)$/i.test(name))
    throw new Error("Wan: expected MP4 or MOV: " + name);
  const base64 = await window.electron?.readVideoBase64?.(name);
  if (!base64) throw new Error("Cannot read reference video: " + name);
  const policy = await videoRequest(
    config,
    videoBaseUrl(config) +
      "/uploads?action=getPolicy&model=" +
      encodeURIComponent(config.model),
  );
  const data = policy.data;
  if (!data || typeof data !== "object")
    throw new Error("Missing DashScope upload policy");
  const values = new Map(Object.entries(data));
  function field(key: string): string {
    const value: unknown = values.get(key);
    if (typeof value !== "string" || !value)
      throw new Error("Invalid DashScope upload policy: " + key);
    return value;
  }
  const host = new URL(field("upload_host"));
  if (
    host.protocol !== "https:" ||
    host.username ||
    host.password ||
    !host.hostname.endsWith(".aliyuncs.com")
  )
    throw new Error("Invalid OSS upload host");
  const key =
    field("upload_dir") +
    "/" +
    crypto.randomUUID() +
    (name.toLowerCase().endsWith(".mov") ? ".mov" : ".mp4");
  const response = await requestAIEndpoint({
    method: "POST",
    url: host.href,
    headers: {},
    multipart: {
      fields: {
        key,
        OSSAccessKeyId: field("oss_access_key_id"),
        Signature: field("signature"),
        policy: field("policy"),
        "x-oss-object-acl": field("x_oss_object_acl"),
        "x-oss-forbid-overwrite": field("x_oss_forbid_overwrite"),
        success_action_status: "200",
      },
      files: [
        {
          fieldName: "file",
          fileName: name,
          mimeType: name.toLowerCase().endsWith(".mov")
            ? "video/quicktime"
            : "video/mp4",
          base64,
        },
      ],
    },
  });
  if (!response.ok)
    throw new Error("DashScope video upload: HTTP " + response.status);
  return "oss://" + key;
}
