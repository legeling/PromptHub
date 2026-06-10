import { act, renderHook, waitFor } from '@testing-library/react';
import type { DragEvent as ReactDragEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePromptMediaManager } from '../../../src/renderer/components/prompt/usePromptMediaManager';

describe('usePromptMediaManager', () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.electron = {
      downloadImage: vi
        .fn()
        .mockRejectedValue(new Error('Access to internal network addresses is not allowed')),
      saveImageBase64: vi.fn().mockResolvedValue(true),
      saveVideoBase64: vi.fn().mockResolvedValue(true),
    } as never;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a dedicated message when self-hosted web blocks internal image URLs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
      'Self-hosted web does not fetch local or private-network image URLs by default. Upload the file manually or use a public URL.',
      'error',
    );
  });

  it('saves dropped image and video files through base64 media APIs', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      usePromptMediaManager({
        isOpen: true,
        translate: (_key: string, fallback?: string) => fallback || '',
        showToast,
      }),
    );
    const image = new File(['image-content'], 'cover.png', { type: 'image/png' });
    const video = new File(['video-content'], 'demo.mp4', { type: 'video/mp4' });
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [image, video],
      },
    } as unknown as ReactDragEvent<HTMLElement>;

    await act(async () => {
      await result.current.handleMediaDrop(event);
    });

    expect(window.electron.saveImageBase64).toHaveBeenCalledWith(
      expect.stringMatching(/^cover-[a-z0-9-]+\.png$/u),
      expect.any(String),
    );
    expect(window.electron.saveVideoBase64).toHaveBeenCalledWith(
      expect.stringMatching(/^demo-[a-z0-9-]+\.mp4$/u),
      expect.any(String),
    );
    expect(result.current.images).toHaveLength(1);
    expect(result.current.videos).toHaveLength(1);
    expect(showToast).toHaveBeenCalledWith('Media added', 'success');
  });

  it('uses the localized unsupported-media message for invalid dropped files', async () => {
    const showToast = vi.fn();
    const translate = vi.fn((key: string, fallback?: string) =>
      key === 'prompt.mediaDropUnsupported'
        ? 'Only image or video files can be dropped.'
        : fallback || '',
    );
    const { result } = renderHook(() =>
      usePromptMediaManager({
        isOpen: true,
        translate,
        showToast,
      }),
    );
    const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [textFile],
      },
    } as unknown as ReactDragEvent<HTMLElement>;

    await act(async () => {
      await result.current.handleMediaDrop(event);
    });

    expect(translate).toHaveBeenCalledWith(
      'prompt.mediaDropUnsupported',
      'Only image or video files can be dropped.',
    );
    expect(showToast).toHaveBeenCalledWith(
      'Only image or video files can be dropped.',
      'error',
    );
    expect(window.electron.saveImageBase64).not.toHaveBeenCalled();
    expect(window.electron.saveVideoBase64).not.toHaveBeenCalled();
  });

  it('clears the URL download timeout after a successful image download', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    window.electron.downloadImage = vi.fn().mockResolvedValue('remote-image.png');
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      usePromptMediaManager({
        isOpen: true,
        translate: (_key: string, fallback?: string) => fallback || '',
        showToast,
      }),
    );

    await act(async () => {
      await result.current.handleUrlUpload('https://example.com/remote-image.png');
    });

    expect(result.current.images).toEqual(['remote-image.png']);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });

  it('does not append URL downloads after the modal closes', async () => {
    let resolveDownload: (fileName: string) => void = () => undefined;
    window.electron.downloadImage = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    const showToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePromptMediaManager({
          isOpen,
          translate: (_key: string, fallback?: string) => fallback || '',
          showToast,
        }),
      { initialProps: { isOpen: true } },
    );

    let uploadPromise: Promise<void>;
    await act(async () => {
      uploadPromise = result.current.handleUrlUpload(
        'https://example.com/late-image.png',
      );
    });

    rerender({ isOpen: false });

    await act(async () => {
      resolveDownload('late-image.png');
      await uploadPromise;
    });

    expect(result.current.images).toEqual([]);
    expect(showToast).not.toHaveBeenCalledWith('Media added', 'success');
  });

  it('does not show URL download failures after the modal closes', async () => {
    let rejectDownload: (error: Error) => void = () => undefined;
    window.electron.downloadImage = vi.fn(
      () =>
        new Promise<string>((_resolve, reject) => {
          rejectDownload = reject;
        }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const showToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePromptMediaManager({
          isOpen,
          translate: (_key: string, fallback?: string) => fallback || '',
          showToast,
        }),
      { initialProps: { isOpen: true } },
    );

    let uploadPromise: Promise<void>;
    await act(async () => {
      uploadPromise = result.current.handleUrlUpload(
        'https://example.com/failing-image.png',
      );
    });

    rerender({ isOpen: false });

    await act(async () => {
      rejectDownload(new Error('network failed'));
      await uploadPromise;
    });

    expect(showToast).not.toHaveBeenCalledWith(
      'Could not add media. Check the link or file and try again.',
      'error',
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      'Failed to upload image from URL:',
      expect.any(Error),
    );
  });

  it('does not append selected image or video files after the modal closes', async () => {
    let resolveImageSelection: (filePaths: string[]) => void = () => undefined;
    let resolveVideoSelection: (filePaths: string[]) => void = () => undefined;
    window.electron.selectImage = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveImageSelection = resolve;
        }),
    );
    window.electron.saveImage = vi.fn().mockResolvedValue(['selected-image.png']);
    window.electron.selectVideo = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveVideoSelection = resolve;
        }),
    );
    window.electron.saveVideo = vi.fn().mockResolvedValue(['selected-video.mp4']);
    const showToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePromptMediaManager({
          isOpen,
          translate: (_key: string, fallback?: string) => fallback || '',
          showToast,
        }),
      { initialProps: { isOpen: true } },
    );

    let imagePromise: Promise<void>;
    let videoPromise: Promise<void>;
    await act(async () => {
      imagePromise = result.current.handleSelectImage();
      videoPromise = result.current.handleSelectVideo();
    });

    rerender({ isOpen: false });

    await act(async () => {
      resolveImageSelection(['/tmp/image.png']);
      resolveVideoSelection(['/tmp/video.mp4']);
      await Promise.all([imagePromise, videoPromise]);
    });

    expect(window.electron.saveImage).not.toHaveBeenCalled();
    expect(window.electron.saveVideo).not.toHaveBeenCalled();
    expect(result.current.images).toEqual([]);
    expect(result.current.videos).toEqual([]);
  });

  it('does not append dropped media or show success after the modal closes', async () => {
    let resolveImageSave: (saved: boolean) => void = () => undefined;
    let resolveVideoSave: (saved: boolean) => void = () => undefined;
    window.electron.saveImageBase64 = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveImageSave = resolve;
        }),
    );
    window.electron.saveVideoBase64 = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveVideoSave = resolve;
        }),
    );
    const showToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePromptMediaManager({
          isOpen,
          translate: (_key: string, fallback?: string) => fallback || '',
          showToast,
        }),
      { initialProps: { isOpen: true } },
    );
    const image = new File(['image-content'], 'cover.png', { type: 'image/png' });
    const video = new File(['video-content'], 'demo.mp4', { type: 'video/mp4' });
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        files: [image, video],
      },
    } as unknown as ReactDragEvent<HTMLElement>;

    let dropPromise: Promise<void>;
    await act(async () => {
      dropPromise = result.current.handleMediaDrop(event);
    });

    await waitFor(() => {
      expect(window.electron.saveImageBase64).toHaveBeenCalled();
    });

    await act(async () => {
      resolveImageSave(true);
    });

    await waitFor(() => {
      expect(window.electron.saveVideoBase64).toHaveBeenCalled();
    });

    rerender({ isOpen: false });

    await act(async () => {
      resolveVideoSave(true);
      await dropPromise;
    });

    expect(result.current.images).toEqual([]);
    expect(result.current.videos).toEqual([]);
    expect(showToast).not.toHaveBeenCalledWith('Media added', 'success');
  });

  it('does not append pasted images after the modal closes', async () => {
    let resolveImageBufferSave: (fileName: string) => void = () => undefined;
    window.electron.saveImageBuffer = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveImageBufferSave = resolve;
        }),
    );
    const showToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePromptMediaManager({
          isOpen,
          translate: (_key: string, fallback?: string) => fallback || '',
          showToast,
        }),
      { initialProps: { isOpen: true } },
    );
    const image = {
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    } as unknown as File;
    const event = new Event('paste') as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => image,
          },
        ],
      },
    });

    act(() => {
      window.dispatchEvent(event);
    });

    await waitFor(() => {
      expect(window.electron.saveImageBuffer).toHaveBeenCalled();
    });

    rerender({ isOpen: false });

    await act(async () => {
      resolveImageBufferSave('pasted-image.png');
      await Promise.resolve();
    });

    expect(result.current.images).toEqual([]);
  });
});
