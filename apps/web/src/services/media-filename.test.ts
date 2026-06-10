import { describe, expect, it } from 'vitest';
import { normalizeMediaFileName } from './media-filename.js';

describe('media filename normalization', () => {
  it('accepts filenames at the filesystem segment byte limit', () => {
    const maxLengthName = `${'a'.repeat(236)}.png`;

    expect(normalizeMediaFileName(maxLengthName)).toBe(maxLengthName);
  });

  it('rejects filenames that exceed common filesystem segment limits', () => {
    const longName = `${'a'.repeat(241)}.png`;

    expect(() => normalizeMediaFileName(longName)).toThrow(
      'Invalid filename: file name is too long',
    );
  });

  it('rejects filenames with stream separators', () => {
    expect(() => normalizeMediaFileName('avatar:stream.png')).toThrow(
      'Invalid filename: stream separator detected',
    );
  });
});
