import { XIcon, ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ImagePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageSrc: string | null;
}

export function ImagePreviewModal({ isOpen, onClose, imageSrc }: ImagePreviewModalProps) {
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        // Reset error state when image source changes
        // 重置错误状态当图片源改变时
        setImageError(false);
    }, [imageSrc]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEsc);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen || !imageSrc) return null;

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
                <XIcon className="w-6 h-6" />
            </button>

            {/* Image container */}
            <div
                className="relative max-w-[90vw] max-h-[90vh] outline-none"
                onClick={(e) => e.stopPropagation()}
            >
                {imageError ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-muted/20 rounded-lg text-muted-foreground">
                        <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-sm">Image load failed / 图片加载失败</p>
                    </div>
                ) : (
                    <img
                        src={imageSrc.startsWith('http') || imageSrc.startsWith('data:') || imageSrc.startsWith('local-image://') ? imageSrc : `local-image://${imageSrc}`}
                        alt="Preview"
                        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                        onError={() => setImageError(true)}
                    />
                )}
            </div>

            {/* Click outside to close */}
            <div
                className="absolute inset-0 -z-10"
                onClick={onClose}
            />
        </div>,
        document.body
    );
}
