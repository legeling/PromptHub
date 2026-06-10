import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'dotenv';

describe('web environment examples', () => {
  it('documents the supported DATA_ROOT key instead of the ignored DATA_DIR key', () => {
    const examplePath = path.resolve(__dirname, '../.env.example');
    const parsed = parse(fs.readFileSync(examplePath, 'utf8'));

    expect(parsed.DATA_ROOT).toBe('./');
    expect(parsed.DATA_DIR).toBeUndefined();
  });
});
