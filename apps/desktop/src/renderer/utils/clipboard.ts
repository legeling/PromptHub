function copyTextWithTextarea(text: string): boolean {
  if (
    typeof document === "undefined" ||
    typeof document.execCommand !== "function" ||
    !document.body
  ) {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export async function copyTextToClipboard(text: string): Promise<void> {
  const clipboard = navigator.clipboard;
  const canUseClipboardApi =
    clipboard &&
    typeof clipboard.writeText === "function" &&
    globalThis.isSecureContext !== false;
  let clipboardError: unknown;

  if (canUseClipboardApi) {
    try {
      await clipboard.writeText(text);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }

  if (copyTextWithTextarea(text)) {
    return;
  }

  if (clipboardError instanceof Error) {
    throw new Error(`Clipboard copy failed: ${clipboardError.message}`);
  }
  throw new Error("Clipboard copy failed: clipboard API is unavailable");
}
