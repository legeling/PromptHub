import type { Context } from "hono";
import { base64ToBytes, bytesToBase64, safeFileName } from "./encoding";
import { ErrorCode, failure, readJson, success } from "./response";
import type { AuthUser, Env } from "./types";

type MediaKind = "images" | "videos";
type R2BodyObject = R2Object & {
  arrayBuffer: () => Promise<ArrayBuffer>;
  size?: number;
  writeHttpMetadata?: (headers: Headers) => void;
};

interface Base64UploadBody {
  fileName?: string;
  base64Data?: string;
}

function mediaPrefix(userId: string, kind: MediaKind): string {
  return `assets/${userId}/${kind}/`;
}

function mediaKey(userId: string, kind: MediaKind, fileName: string): string {
  return `${mediaPrefix(userId, kind)}${safeFileName(fileName)}`;
}

function mediaContentType(kind: MediaKind, fileName: string): string {
  const normalized = fileName.toLowerCase();
  if (kind === "videos") {
    if (normalized.endsWith(".webm")) return "video/webm";
    if (normalized.endsWith(".mov")) return "video/quicktime";
    return "video/mp4";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

async function listAll(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await bucket.list({ prefix, cursor });
    names.push(...result.objects.map((object) => object.key.slice(prefix.length)));
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);
  return names.sort((left, right) => left.localeCompare(right));
}

export async function listMedia(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>, kind: MediaKind): Promise<Response> {
  const user = c.get("authUser");
  return success(c, await listAll(c.env.MEDIA, mediaPrefix(user.userId, kind)));
}

export async function getMediaBase64(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>, kind: MediaKind): Promise<Response> {
  const user = c.get("authUser");
  const fileNameParam = c.req.param("filename");
  if (!fileNameParam) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "filename is required");
  }
  const fileName = safeFileName(fileNameParam);
  const object = await c.env.MEDIA.get(mediaKey(user.userId, kind, fileName)) as R2BodyObject | null;
  if (!object) {
    return failure(c, 404, ErrorCode.NOT_FOUND, "Media file not found");
  }

  return success(c, bytesToBase64(new Uint8Array(await object.arrayBuffer())));
}

export async function getMediaFile(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>, kind: MediaKind): Promise<Response> {
  const user = c.get("authUser");
  const fileNameParam = c.req.param("filename");
  if (!fileNameParam) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "filename is required");
  }
  const fileName = safeFileName(fileNameParam);
  const object = await c.env.MEDIA.get(mediaKey(user.userId, kind, fileName)) as R2BodyObject | null;
  if (!object) {
    return failure(c, 404, ErrorCode.NOT_FOUND, "Media file not found");
  }

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", mediaContentType(kind, fileName));
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(await object.arrayBuffer(), { headers });
}

export async function mediaExists(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>, kind: MediaKind): Promise<Response> {
  const user = c.get("authUser");
  const fileNameParam = c.req.param("filename");
  if (!fileNameParam) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "filename is required");
  }
  const object = await c.env.MEDIA.get(mediaKey(user.userId, kind, safeFileName(fileNameParam)));
  return success(c, !!object);
}

export async function getMediaSize(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>, kind: MediaKind): Promise<Response> {
  const user = c.get("authUser");
  const fileNameParam = c.req.param("filename");
  if (!fileNameParam) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "filename is required");
  }
  const object = await c.env.MEDIA.get(mediaKey(user.userId, kind, safeFileName(fileNameParam))) as R2BodyObject | null;
  if (!object) {
    return failure(c, 404, ErrorCode.NOT_FOUND, "Media file not found");
  }
  return success(c, object.size ?? (await object.arrayBuffer()).byteLength);
}

export async function uploadMediaBase64(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>, kind: MediaKind): Promise<Response> {
  const user = c.get("authUser");
  const body = await readJson<Base64UploadBody>(c);
  if (typeof body.fileName !== "string" || typeof body.base64Data !== "string" || !body.base64Data.trim()) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "fileName and base64Data are required");
  }
  const fileName = safeFileName(body.fileName);
  const bytes = base64ToBytes(body.base64Data);
  await c.env.MEDIA.put(mediaKey(user.userId, kind, fileName), bytes, {
    httpMetadata: {
      contentType: kind === "images" ? "application/octet-stream" : "application/octet-stream",
    },
  });
  return success(c, fileName, 201);
}
