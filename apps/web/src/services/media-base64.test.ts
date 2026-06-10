import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeMediaBase64 } from './media-base64.js';

describe('media base64 decoding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes valid base64 media payloads', () => {
    const content = decodeMediaBase64(Buffer.from('media').toString('base64'));

    expect(content.toString('utf8')).toBe('media');
  });

  it('rejects oversized payloads before allocating a decoded buffer', () => {
    const oversizedPayload = Buffer.from('abc').toString('base64');
    const fromSpy = vi.spyOn(Buffer, 'from');

    expect(() => decodeMediaBase64(oversizedPayload, { maxBytes: 2 })).toThrow(
      'Decoded file exceeds size limit',
    );
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
