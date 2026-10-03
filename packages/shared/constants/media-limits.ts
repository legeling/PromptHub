/**
 * Shared media upload/download limits (single source of truth).
 * 媒体上传/下载限制的唯一事实源：主进程强制值与渲染层提示文案共用，
 * 避免提示与真实限制漂移。
 */

/** Timeout for remote image downloads. */
export const IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;

/** Max bytes accepted when downloading a remote image (10 MB). */
export const IMAGE_DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Max redirect hops for remote image downloads. */
export const IMAGE_DOWNLOAD_MAX_REDIRECTS = 5;

/** Max bytes accepted when saving local media (20 MB). */
export const MEDIA_SAVE_MAX_BYTES = 20 * 1024 * 1024;

/** Image extensions accepted by the prompt media pipeline. */
export const ACCEPTED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
] as const;

/** Video extensions accepted by the prompt media pipeline. */
export const ACCEPTED_VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
] as const;

/** MB view of the byte limits, for user-facing copy. */
export const MEDIA_SAVE_MAX_MB = MEDIA_SAVE_MAX_BYTES / (1024 * 1024);
export const IMAGE_DOWNLOAD_MAX_MB = IMAGE_DOWNLOAD_MAX_BYTES / (1024 * 1024);
