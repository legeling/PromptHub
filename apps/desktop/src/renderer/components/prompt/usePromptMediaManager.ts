import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);

function getFileExtension(file: File): string {
  const dotIndex = file.name.lastIndexOf(".");
  if (dotIndex !== -1) {
    return file.name.slice(dotIndex).toLowerCase();
  }

  switch (file.type) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    default:
      return "";
  }
}

function isImageFile(file: File): boolean {
  const extension = getFileExtension(file);
  return file.type.startsWith("image/") && IMAGE_EXTENSIONS.has(extension);
}

function isVideoFile(file: File): boolean {
  const extension = getFileExtension(file);
  return file.type.startsWith("video/") && VIDEO_EXTENSIONS.has(extension);
}

function buildDroppedMediaFileName(file: File, extension: string): string {
  const stem = file.name
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const safeStem = stem || "media";
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${safeStem}-${suffix}${extension}`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read dropped file"));
        return;
      }

      const commaIndex = reader.result.indexOf(",");
      if (commaIndex === -1) {
        reject(new Error("Failed to parse dropped file"));
        return;
      }

      resolve(reader.result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(new Error("Failed to read dropped file"));
    reader.readAsDataURL(file);
  });
}

interface PromptMediaManagerOptions {
  isOpen: boolean;
  initialImages?: string[];
  initialVideos?: string[];
  translate: (key: string, fallback?: string) => string;
  showToast: (message: string, type?: "info" | "success" | "error") => void;
}

/**
 * Shallow-compare two string arrays by value (not reference)
 * 浅比较两个字符串数组的值（非引用）
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function usePromptMediaManager({
  isOpen,
  initialImages = [],
  initialVideos = [],
  translate,
  showToast,
}: PromptMediaManagerOptions) {
  const [images, setImages] = useState<string[]>(initialImages);
  const [videos, setVideos] = useState<string[]>(initialVideos);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      isOpenRef.current = false;
    };
  }, []);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      setIsDownloadingImage(false);
      setIsDraggingMedia(false);
    }
  }, [isOpen]);

  const canApplyAsyncResult = useCallback(
    () => isMountedRef.current && isOpenRef.current,
    [],
  );

  const showImageUrlError = useCallback(
    (message?: string) => {
      const normalized = message?.toLowerCase() ?? "";
      if (normalized.includes("internal network addresses")) {
        showToast(
          translate(
            "prompt.internalImageUrlBlocked",
            "Self-hosted web does not fetch local or private-network image URLs by default. Upload the file manually or use a public URL.",
          ),
          "error",
        );
        return;
      }

      showToast(
        translate(
          "prompt.uploadFailed",
          "Could not add media. Check the link or file and try again.",
        ),
        "error",
      );
    },
    [showToast, translate],
  );

  // Track previous initial values to avoid infinite re-render loops
  // caused by callers passing new array references with same content
  // 跟踪上一次的初始值，避免调用方传入相同内容但不同引用的数组导致无限重渲染
  const prevInitialImagesRef = useRef<string[]>(initialImages);
  const prevInitialVideosRef = useRef<string[]>(initialVideos);

  useEffect(() => {
    if (!isOpen) return;

    const imagesChanged = !arraysEqual(
      prevInitialImagesRef.current,
      initialImages,
    );
    const videosChanged = !arraysEqual(
      prevInitialVideosRef.current,
      initialVideos,
    );

    if (imagesChanged) {
      setImages(initialImages);
      prevInitialImagesRef.current = initialImages;
    }
    if (videosChanged) {
      setVideos(initialVideos);
      prevInitialVideosRef.current = initialVideos;
    }
  }, [initialImages, initialVideos, isOpen]);

  const handleSelectImage = useCallback(async () => {
    try {
      const filePaths = await window.electron?.selectImage?.();
      if (!canApplyAsyncResult()) {
        return;
      }
      if (filePaths && filePaths.length > 0) {
        const savedImages = await window.electron?.saveImage?.(filePaths);
        if (savedImages && canApplyAsyncResult()) {
          setImages((prev) => [...prev, ...savedImages]);
        }
      }
    } catch (error) {
      if (!canApplyAsyncResult()) {
        return;
      }
      console.error("Failed to select images:", error);
    }
  }, [canApplyAsyncResult]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const handleSelectVideo = useCallback(async () => {
    try {
      const filePaths = await window.electron?.selectVideo?.();
      if (!canApplyAsyncResult()) {
        return;
      }
      if (filePaths && filePaths.length > 0) {
        const savedVideos = await window.electron?.saveVideo?.(filePaths);
        if (savedVideos && canApplyAsyncResult()) {
          setVideos((prev) => [...prev, ...savedVideos]);
        }
      }
    } catch (error) {
      if (!canApplyAsyncResult()) {
        return;
      }
      console.error("Failed to select videos:", error);
    }
  }, [canApplyAsyncResult]);

  const handleRemoveVideo = useCallback((index: number) => {
    setVideos((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const saveDroppedImage = useCallback(async (file: File): Promise<string | null> => {
    const extension = getFileExtension(file);
    const fileName = buildDroppedMediaFileName(file, extension);
    const base64 = await readFileAsBase64(file);
    if (!canApplyAsyncResult()) {
      return null;
    }
    const saved = await window.electron?.saveImageBase64?.(fileName, base64);
    return saved && canApplyAsyncResult() ? fileName : null;
  }, [canApplyAsyncResult]);

  const saveDroppedVideo = useCallback(async (file: File): Promise<string | null> => {
    const extension = getFileExtension(file);
    const fileName = buildDroppedMediaFileName(file, extension);
    const base64 = await readFileAsBase64(file);
    if (!canApplyAsyncResult()) {
      return null;
    }
    const saved = await window.electron?.saveVideoBase64?.(fileName, base64);
    return saved && canApplyAsyncResult() ? fileName : null;
  }, [canApplyAsyncResult]);

  const handleMediaDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingMedia(true);
  }, []);

  const handleMediaDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDraggingMedia(false);
  }, []);

  const handleMediaDrop = useCallback(
    async (event: ReactDragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingMedia(false);

      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;

      const imageFiles = files.filter(isImageFile);
      const videoFiles = files.filter(isVideoFile);

      if (imageFiles.length === 0 && videoFiles.length === 0) {
        showToast(
          translate(
            "prompt.mediaDropUnsupported",
            "Only image or video files can be dropped.",
          ),
          "error",
        );
        return;
      }

      try {
        const savedImages = (
          await Promise.all(imageFiles.map(saveDroppedImage))
        ).filter((fileName): fileName is string => Boolean(fileName));
        const savedVideos = (
          await Promise.all(videoFiles.map(saveDroppedVideo))
        ).filter((fileName): fileName is string => Boolean(fileName));

        if (!canApplyAsyncResult()) {
          return;
        }

        if (savedImages.length > 0) {
          setImages((prev) => [...prev, ...savedImages]);
        }
        if (savedVideos.length > 0) {
          setVideos((prev) => [...prev, ...savedVideos]);
        }

        if (savedImages.length + savedVideos.length > 0) {
          showToast(
            translate("prompt.uploadSuccess", "Media added"),
            "success",
          );
        } else {
          showToast(
            translate(
              "prompt.uploadFailed",
              "Could not add media. Check the link or file and try again.",
            ),
            "error",
          );
        }
      } catch (error) {
        if (!canApplyAsyncResult()) {
          return;
        }
        console.error("Failed to save dropped media:", error);
        showToast(
          translate(
            "prompt.uploadFailed",
            "Could not add media. Check the link or file and try again.",
          ),
          "error",
        );
      }
    },
    [canApplyAsyncResult, saveDroppedImage, saveDroppedVideo, showToast, translate],
  );

  const handleUrlUpload = useCallback(
    async (url: string) => {
      if (!url.trim()) return;

      setIsDownloadingImage(true);
      showToast(
        translate("prompt.downloadingImage", "Downloading image..."),
        "info",
      );

      let timeoutId: number | null = null;
      try {
        const timeoutPromise = new Promise<null>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            timeoutId = null;
            reject(new Error("timeout"));
          }, 30000);
        });
        const downloadPromise = window.electron?.downloadImage?.(url);
        const fileName = await Promise.race([downloadPromise, timeoutPromise]);

        if (!canApplyAsyncResult()) {
          return;
        }

        if (fileName) {
          setImages((prev) => [...prev, fileName]);
          showToast(
            translate("prompt.uploadSuccess", "Media added"),
            "success",
          );
        } else {
          showImageUrlError();
        }
      } catch (error) {
        if (!canApplyAsyncResult()) {
          return;
        }

        console.error("Failed to upload image from URL:", error);
        if (error instanceof Error && error.message === "timeout") {
          showToast(
            translate(
              "prompt.downloadTimeout",
              "Image download timed out. Check the network or URL.",
            ),
            "error",
          );
        } else {
          showImageUrlError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        if (canApplyAsyncResult()) {
          setIsDownloadingImage(false);
        }
      }
    },
    [canApplyAsyncResult, showImageUrlError, showToast, translate],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf("image") !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            try {
              const buffer = await blob.arrayBuffer();
              if (!canApplyAsyncResult()) {
                return;
              }
              const fileName = await window.electron?.saveImageBuffer?.(buffer);
              if (fileName && canApplyAsyncResult()) {
                setImages((prev) => [...prev, fileName]);
              }
            } catch (error) {
              if (!canApplyAsyncResult()) {
                return;
              }
              console.error("Failed to save pasted image:", error);
            }
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [canApplyAsyncResult, isOpen]);

  return {
    imageUrl,
    images,
    isDownloadingImage,
    isDraggingMedia,
    setImageUrl,
    setImages,
    setShowUrlInput,
    setVideos,
    showUrlInput,
    videos,
    handleRemoveImage,
    handleRemoveVideo,
    handleSelectImage,
    handleSelectVideo,
    handleMediaDragLeave,
    handleMediaDragOver,
    handleMediaDrop,
    handleUrlUpload,
  };
}
