import { beforeEach, describe, expect, it } from 'vitest';
import { getRuntimeCapabilities } from '../../../desktop/src/renderer/runtime';

describe('web desktop runtime capability parity', () => {
  beforeEach(() => {
    Reflect.set(window, '__PROMPTHUB_WEB__', true);
  });

  it('keeps bridged skill surfaces available in web runtime', () => {
    expect(getRuntimeCapabilities()).toMatchObject({
      appUpdate: false,
      dataRecovery: false,
      desktopWindowControls: false,
      skillDistribution: true,
      skillFileEditing: true,
      skillLocalScan: true,
      skillPlatformIntegration: true,
      skillStore: true,
    });
  });
});
