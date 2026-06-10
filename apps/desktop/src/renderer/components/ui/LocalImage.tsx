import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { resolveLocalImageSrc } from "../../utils/media-url";

const INTERACTIVE_IMAGE_CLASS_NAME =
  "inline-flex rounded-md border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

interface LocalImageProps {
  src: string;
  alt?: string;
  "aria-label"?: string;
  className?: string;
  fallbackClassName?: string;
  onClick?: () => void;
  "aria-hidden"?: boolean | "true" | "false";
}

/**
 * Local image component, automatically handles loading failure cases
 * 本地图片组件，自动处理加载失败的情况
 * Uses local-image:// protocol to load local images
 * 使用 local-image:// 协议加载本地图片
 */
export function LocalImage({
  src,
  alt = "image",
  "aria-label": ariaLabel,
  className = "",
  fallbackClassName = "",
  onClick,
  "aria-hidden": ariaHidden,
}: LocalImageProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  const interactiveLabel = ariaLabel ?? alt;
  const fallbackContent = (
    <span
      aria-hidden={ariaHidden}
      className={`flex items-center justify-center bg-muted/30 text-muted-foreground/30 ${fallbackClassName || className}`}
    >
      <ImageIcon aria-hidden="true" className="w-8 h-8 opacity-50" />
    </span>
  );

  if (error || !src) {
    if (onClick) {
      return (
        <button
          type="button"
          aria-label={interactiveLabel}
          className={INTERACTIVE_IMAGE_CLASS_NAME}
          onClick={onClick}
        >
          {fallbackContent}
        </button>
      );
    }

    return fallbackContent;
  }

  const imageSrc = resolveLocalImageSrc(src);
  const image = (
    <img
      src={imageSrc}
      alt={onClick ? "" : alt}
      aria-hidden={onClick ? "true" : ariaHidden}
      className={className}
      onError={() => setError(true)}
    />
  );

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={interactiveLabel}
        className={INTERACTIVE_IMAGE_CLASS_NAME}
        onClick={onClick}
      >
        {image}
      </button>
    );
  }

  return image;
}
