export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export interface DecodeMediaBase64Options {
  label?: string;
  maxBytes?: number;
}

function mediaPayloadError(message: string, label: string | undefined): Error {
  return new Error(label ? `${message}: ${label}` : message);
}

function decodedBase64Length(payload: string): number {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return (payload.length / 4) * 3 - padding;
}

export function decodeMediaBase64(
  base64Data: string,
  options: DecodeMediaBase64Options = {},
): Buffer {
  const payload = base64Data.trim();
  const label = options.label;
  const maxBytes = options.maxBytes ?? MAX_MEDIA_BYTES;

  if (payload.length === 0 || payload.length % 4 !== 0 || !BASE64_PATTERN.test(payload)) {
    throw mediaPayloadError('Invalid base64 media payload', label);
  }
  if (decodedBase64Length(payload) > maxBytes) {
    throw mediaPayloadError('Decoded file exceeds size limit', label);
  }

  const contentBuffer = Buffer.from(payload, 'base64');
  if (contentBuffer.length === 0) {
    throw mediaPayloadError('Decoded file is empty', label);
  }
  if (contentBuffer.length > maxBytes) {
    throw mediaPayloadError('Decoded file exceeds size limit', label);
  }

  return contentBuffer;
}
