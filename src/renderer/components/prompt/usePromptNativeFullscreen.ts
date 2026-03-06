import { useCallback, useState } from "react";

export type PromptFullscreenField = "system" | "systemEn" | "user" | "userEn";

interface PromptNativeFullscreenOptions {
  getFieldValue: (field: PromptFullscreenField) => string;
  setFieldValue: (field: PromptFullscreenField, value: string) => void;
  getFieldTitle: (field: PromptFullscreenField) => string;
}

export function usePromptNativeFullscreen({
  getFieldValue,
  setFieldValue,
  getFieldTitle,
}: PromptNativeFullscreenOptions) {
  const [activeFullscreenField, setActiveFullscreenField] =
    useState<PromptFullscreenField | null>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);

  const enterNativeFullscreen = useCallback((field: PromptFullscreenField) => {
    setActiveFullscreenField(field);
    setIsNativeFullscreen(true);
    window.electron?.enterFullscreen?.();
  }, []);

  const exitNativeFullscreen = useCallback(() => {
    setActiveFullscreenField(null);
    setIsNativeFullscreen(false);
    window.electron?.exitFullscreen?.();
  }, []);

  const fullscreenValue = activeFullscreenField
    ? getFieldValue(activeFullscreenField)
    : "";
  const fullscreenTitle = activeFullscreenField
    ? getFieldTitle(activeFullscreenField)
    : "";

  const updateFullscreenValue = useCallback(
    (value: string) => {
      if (!activeFullscreenField) return;
      setFieldValue(activeFullscreenField, value);
    },
    [activeFullscreenField, setFieldValue],
  );

  return {
    activeFullscreenField,
    fullscreenTitle,
    fullscreenValue,
    isNativeFullscreen,
    enterNativeFullscreen,
    exitNativeFullscreen,
    updateFullscreenValue,
  };
}
