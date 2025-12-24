/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// 注意：import 会在 vi.mock 之后真正生效，所以这里得到的是 mock 对象
import { autoUpdater } from 'electron-updater';

// Mock electron
vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn(),
    },
    BrowserWindow: {
        getAllWindows: vi.fn(() => []),
    },
    app: {
        getVersion: vi.fn(() => '1.0.0'),
        isPackaged: true,
        getAppPath: vi.fn(() => '/app'),
        getPath: vi.fn(() => '/tmp'),
    }
}));

// Mock electron-updater behavior
vi.mock('electron-updater', () => {
    const handlers: Record<string, Function> = {};
    return {
        autoUpdater: {
            on: vi.fn((event, handler) => { handlers[event] = handler; }),
            checkForUpdatesAndNotify: vi.fn(),
            downloadUpdate: vi.fn(),
            quitAndInstall: vi.fn(),
            autoDownload: true, // initial default
            autoInstallOnAppQuit: false, // initial default
            channel: 'latest',
            // Helper to trigger events for testing
            _trigger: (event: string, ...args: any[]) => {
                if (handlers[event]) handlers[event](...args);
            },
        }
    };
});

import { initUpdater } from '../../../src/main/updater';

describe('Updater Service (Main Process)', () => {
    let mockWindow: any;
    const originalPlatform = process.platform;
    const originalArch = process.arch;

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset properties on the mock object
        // @ts-ignore
        autoUpdater.autoDownload = true;
        // @ts-ignore
        autoUpdater.autoInstallOnAppQuit = false;
        // @ts-ignore
        autoUpdater.channel = 'latest';

        mockWindow = {
            webContents: {
                send: vi.fn(),
            },
            isDestroyed: () => false,
        };
    });

    afterEach(() => {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
        Object.defineProperty(process, 'arch', { value: originalArch });
    });

    it('should configure autoUpdater defaults', () => {
        initUpdater(mockWindow);

        expect(autoUpdater.autoDownload).toBe(false);
        expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
    });

    it('should set architecture specific channel on Windows x64', () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        Object.defineProperty(process, 'arch', { value: 'x64' });

        initUpdater(mockWindow);

        expect(autoUpdater.channel).toBe('latest-x64');
    });

    it('should set architecture specific channel on Windows arm64', () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        Object.defineProperty(process, 'arch', { value: 'arm64' });

        initUpdater(mockWindow);

        expect(autoUpdater.channel).toBe('latest-arm64');
    });

    it('should NOT change channel on macOS', () => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });

        // Reset channel first
        // @ts-ignore
        autoUpdater.channel = 'latest';

        initUpdater(mockWindow);

        // Should remain default or whatever it was (initUpdater logic only touches channel on win32)
        expect(autoUpdater.channel).toBe('latest');
    });

    it('should send "available" status to window when update found', () => {
        initUpdater(mockWindow);

        const info = { version: '1.0.1', releaseNotes: 'Fixes' };

        // Trigger event
        // @ts-ignore
        if (autoUpdater._trigger) {
            // @ts-ignore
            autoUpdater._trigger('update-available', info);
        }

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'updater:status',
            expect.objectContaining({
                status: 'available',
                info: info
            })
        );
    });

    it('should send "downloading" status with progress', () => {
        initUpdater(mockWindow);

        const progressObj = { percent: 50, bytesPerSecond: 1024, transferred: 500, total: 1000 };

        // @ts-ignore
        if (autoUpdater._trigger) {
            // @ts-ignore
            autoUpdater._trigger('download-progress', progressObj);
        }

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'updater:status',
            expect.objectContaining({
                status: 'downloading',
                progress: progressObj
            })
        );
    });
});
