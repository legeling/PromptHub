import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { resolveLocalImageSrc } from '../../utils/media-url';

interface LocalImageProps {
  src: string;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  onClick?: () => void;
}

/**
 * Local image component, automatically handles loading failure cases
 * 本地图片组件，自动处理加载失败的情况
 * Uses local-image:// protocol to load local images
 * 使用 local-image:// 协议加载本地图片
 */
export function LocalImage({ 
  src, 
  alt = 'image', 
  className = '', 
  fallbackClassName = '',
  onClick 
}: LocalImageProps) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div 
        className={`flex items-center justify-center bg-muted/30 text-muted-foreground/30 ${fallbackClassName || className}`}
        onClick={onClick}
      >
        <ImageIcon className="w-8 h-8 opacity-50" />
      </div>
    );
  }

  const imageSrc = resolveLocalImageSrc(src);

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => setError(true)}
    />
  );
}
