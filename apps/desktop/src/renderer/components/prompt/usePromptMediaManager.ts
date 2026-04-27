import { useCallback, useEffect, useRef, useState } from "react";

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

  const showImageUrlError = useCallback(
    (message?: string) => {
      const normalized = message?.toLowerCase() ?? "";
      if (normalized.includes("internal network addresses")) {
        showToast(
          translate(
            "prompt.internalImageUrlBlocked",
            "自部署网页默认不支持通过链接抓取局域网或内网图片，请先手动上传，或改用公网可访问地址。",
          ),
          "error",
        );
        return;
      }

      showToast(
        translate(
          "prompt.uploadFailed",
          "图片下载失败，请检查链接是否有效",
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
      if (filePaths && filePaths.length > 0) {
        const savedImages = await window.electron?.saveImage?.(filePaths);
        if (savedImages) {
          setImages((prev) => [...prev, ...savedImages]);
        }
      }
    } catch (error) {
      console.error("Failed to select images:", error);
    }
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const handleSelectVideo = useCallback(async () => {
    try {
      const filePaths = await window.electron?.selectVideo?.();
      if (filePaths && filePaths.length > 0) {
        const savedVideos = await window.electron?.saveVideo?.(filePaths);
        if (savedVideos) {
          setVideos((prev) => [...prev, ...savedVideos]);
        }
      }
    } catch (error) {
      console.error("Failed to select videos:", error);
    }
  }, []);

  const handleRemoveVideo = useCallback((index: number) => {
    setVideos((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const handleUrlUpload = useCallback(
    async (url: string) => {
      if (!url.trim()) return;

      setIsDownloadingImage(true);
      showToast(
        translate("prompt.downloadingImage", "正在下载图片..."),
        "info",
      );

      try {
        const timeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error("timeout")), 30000);
        });
        const downloadPromise = window.electron?.downloadImage?.(url);
        const fileName = await Promise.race([downloadPromise, timeoutPromise]);

        if (fileName) {
          setImages((prev) => [...prev, fileName]);
          showToast(
            translate("prompt.uploadSuccess", "图片添加成功"),
            "success",
          );
        } else {
          showImageUrlError();
        }
      } catch (error) {
        console.error("Failed to upload image from URL:", error);
        if (error instanceof Error && error.message === "timeout") {
          showToast(
            translate(
              "prompt.downloadTimeout",
              "图片下载超时，请检查网络或链接",
            ),
            "error",
          );
        } else {
          showImageUrlError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        setIsDownloadingImage(false);
      }
    },
    [showImageUrlError, showToast, translate],
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
            const buffer = await blob.arrayBuffer();
            const fileName = await window.electron?.saveImageBuffer?.(buffer);
            if (fileName) {
              setImages((prev) => [...prev, fileName]);
            }
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [isOpen]);

  return {
    imageUrl,
    images,
    isDownloadingImage,
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
    handleUrlUpload,
  };
}
