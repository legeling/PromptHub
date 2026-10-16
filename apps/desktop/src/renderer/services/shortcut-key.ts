export function getShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code" | "altKey">,
): string {
  // macOS Option changes event.key into a symbol or a dead key. Accelerators
  // still identify the letter/digit key, both when recording and executing.
  if (event.altKey && /^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (event.altKey && /^Digit[0-9]$/.test(event.code))
    return event.code.slice(5);
  return event.key === " " ? "Space" : event.key.toUpperCase();
}
