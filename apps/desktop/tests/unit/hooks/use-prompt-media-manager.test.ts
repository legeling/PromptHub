import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePromptMediaManager } from '../../../src/renderer/components/prompt/usePromptMediaManager';

describe('usePromptMediaManager', () => {
  beforeEach(() => {
    window.electron = {
      downloadImage: vi
        .fn()
        .mockRejectedValue(new Error('Access to internal network addresses is not allowed')),
    } as never;
  });

  it('shows a dedicated message when self-hosted web blocks internal image URLs', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      usePromptMediaManager({
        isOpen: true,
        translate: (_key: string, fallback?: string) => fallback || '',
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleUrlUpload('http://192.168.1.20/demo.png');
    });

    expect(showToast).toHaveBeenCalledWith(
      '自部署网页默认不支持通过链接抓取局域网或内网图片，请先手动上传，或改用公网可访问地址。',
      'error',
    );
  });
});
