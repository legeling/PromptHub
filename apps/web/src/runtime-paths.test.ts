import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  getRootDir,
  getWebStorageTopology,
} from './runtime-paths.js';

describe('self-hosted Web storage topology', () => {
  it('uses one server database, shared owner-tagged projections, and isolated user roots', () => {
    const first = getWebStorageTopology('user-a');
    const second = getWebStorageTopology('user-b');

    expect(first.kind).toBe('self-hosted-multi-user');
    expect(first.databasePath).toBe(second.databasePath);
    expect(first.shared).toEqual(second.shared);
    expect(first.user.rulesPath).not.toBe(second.user.rulesPath);
    expect(first.user.imagesPath).not.toBe(second.user.imagesPath);
    expect(first.user).not.toHaveProperty('settingsPath');
    for (const userPath of Object.values(first.user)) {
      expect(path.relative(getRootDir(), userPath)).not.toMatch(/^\.\./u);
    }
  });

  it.each(['', '.', '..', '../escape', 'user/escape', 'user\\escape', ' user']) (
    'rejects unsafe user storage identity %j',
    (userId) => {
      expect(() => getWebStorageTopology(userId)).toThrow(
        'Invalid storage user id',
      );
    },
  );
});
