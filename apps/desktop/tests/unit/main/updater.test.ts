/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// 注意：import 会在 vi.mock 之后真正生效，所以这里得到的是 mock 对象
import { autoUpdater } from 'electron-updater';

const { httpsGetMock } = vi.hoisted(() => ({
    httpsGetMock: vi.fn(),
}));

function mockGithubReleases(
    releases: Array<{ tag_name: string; prerelease: boolean; draft?: boolean }>,
) {
    httpsGetMock.mockImplementation((_options, callback) => {
        const response = {
            statusCode: 200,
            setEncoding: vi.fn(),
            on: vi.fn((event, handler) => {
                if (event === 'data') {
                    handler(JSON.stringify(releases));
                }
                if (event === 'end') {
                    handler();
                }
            }),
        };
        callback(response);
        return {
            on: vi.fn(),
            setTimeout: vi.fn(),
            destroy: vi.fn(),
        };
    });
}

// Mock electron
vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn(),
        removeHandler: vi.fn(),
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

vi.mock('https', () => ({
    default: {
        get: httpsGetMock,
    },
}));

// Mock electron-updater behavior
vi.mock('electron-updater', () => {
    const handlers: Record<string, Function> = {};
    return {
        autoUpdater: {
            on: vi.fn((event, handler) => { handlers[event] = handler; }),
            checkForUpdatesAndNotify: vi.fn(),
            checkForUpdates: vi.fn(),
            downloadUpdate: vi.fn(),
            quitAndInstall: vi.fn(),
            setFeedURL: vi.fn(),
            autoDownload: true, // initial default
            autoInstallOnAppQuit: false, // initial default
            allowPrerelease: false,
            allowDowngrade: false,
            channel: 'latest',
            currentVersion: { version: '1.0.0' },
            // Helper to trigger events for testing
            _trigger: (event: string, ...args: any[]) => {
                if (handlers[event]) handlers[event](...args);
            },
        }
    };
});

import {
    detectMacInstallSource,
    initUpdater,
    registerUpdaterIPC,
    resolveUpdaterDownloadUrl,
} from '../../../src/main/updater';

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
        // @ts-ignore
        autoUpdater.allowPrerelease = false;
        // @ts-ignore
        autoUpdater.allowDowngrade = false;

        httpsGetMock.mockReset();
        mockGithubReleases([
            { tag_name: 'v1.1.0-beta.2', prerelease: true, draft: false },
        ]);

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
        expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
    });

    it('should not mutate autoUpdater.channel on Windows x64', () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        Object.defineProperty(process, 'arch', { value: 'x64' });

        initUpdater(mockWindow);

        expect(autoUpdater.channel).toBe('latest');
    });

    it('should not mutate autoUpdater.channel on Windows arm64', () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        Object.defineProperty(process, 'arch', { value: 'arm64' });

        initUpdater(mockWindow);

        expect(autoUpdater.channel).toBe('latest');
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

    it('uses the stable release feed by default when checking for updates', async () => {
        registerUpdaterIPC();
        const checkHandler = (vi.mocked((await import('electron')).ipcMain.handle).mock.calls.find(
            ([channel]) => channel === 'updater:check',
        )?.[1]) as (_event: unknown, options?: unknown) => Promise<unknown>;

        await checkHandler({}, { useMirror: false, channel: 'stable' });

        expect(httpsGetMock).not.toHaveBeenCalled();
        expect(autoUpdater.allowPrerelease).toBe(false);
        expect(autoUpdater.allowDowngrade).toBe(false);
        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'github', releaseType: 'release' }),
        );
    });

    it('registers installSource handler and replaces old updater handlers on re-register', async () => {
        const electron = await import('electron');
        const removeHandlerMock = vi.fn();
        vi.mocked(electron.ipcMain).removeHandler = removeHandlerMock;

        registerUpdaterIPC();
        registerUpdaterIPC();

        const handleCalls = vi.mocked(electron.ipcMain.handle).mock.calls;
        const installSourceHandler = handleCalls.find(
            ([channel]) => channel === 'updater:installSource',
        )?.[1] as (() => 'direct' | 'homebrew' | 'unknown') | undefined;

        expect(removeHandlerMock).toHaveBeenCalledWith('updater:installSource');
        expect(installSourceHandler).toBeTypeOf('function');
        expect(installSourceHandler?.()).toBe('direct');
    });

    it('uses the preview prerelease feed only after joining preview channel', async () => {
        registerUpdaterIPC();
        const checkHandler = (vi.mocked((await import('electron')).ipcMain.handle).mock.calls.find(
            ([channel]) => channel === 'updater:check',
        )?.[1]) as (_event: unknown, options?: unknown) => Promise<unknown>;

        await checkHandler({}, { useMirror: false, channel: 'preview' });

        expect(autoUpdater.allowPrerelease).toBe(true);
        expect(autoUpdater.allowDowngrade).toBe(false);
        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
            provider: 'generic',
            channel: undefined,
            url: 'https://github.com/legeling/PromptHub/releases/download/v1.1.0-beta.2',
        });
    });

    it('keeps preview checks on prerelease feeds even when a newer stable release exists', async () => {
        mockGithubReleases([
            { tag_name: 'v1.1.0', prerelease: false, draft: false },
            { tag_name: 'v1.1.0-beta.2', prerelease: true, draft: false },
        ]);
        registerUpdaterIPC();
        const checkHandler = (vi.mocked((await import('electron')).ipcMain.handle).mock.calls.find(
            ([channel]) => channel === 'updater:check',
        )?.[1]) as (_event: unknown, options?: unknown) => Promise<unknown>;

        await checkHandler({}, { useMirror: false, channel: 'preview' });

        expect(autoUpdater.allowPrerelease).toBe(true);
        expect(autoUpdater.allowDowngrade).toBe(false);
        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
            provider: 'generic',
            channel: undefined,
            url: 'https://github.com/legeling/PromptHub/releases/download/v1.1.0-beta.2',
        });
    });

    it('downgrades are surfaced as not-available instead of available', () => {
        initUpdater(mockWindow);

        const info = { version: '0.9.9', releaseNotes: 'Older build' };

        // @ts-ignore
        autoUpdater._trigger('update-available', info);

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'updater:status',
            expect.objectContaining({
                status: 'not-available',
                info: expect.objectContaining({ version: '0.9.9' }),
            })
        );
    });

    it('detects Homebrew-installed macOS app from Caskroom path', () => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });

        expect(
            detectMacInstallSource(
                '/opt/homebrew/Caskroom/prompthub/0.5.5/PromptHub.app/Contents/MacOS/PromptHub',
            ),
        ).toBe('homebrew');
        expect(
            detectMacInstallSource(
                '/usr/local/Caskroom/prompthub/0.5.5/PromptHub.app/Contents/MacOS/PromptHub',
            ),
        ).toBe('homebrew');
    });

    it('treats regular macOS app bundle path as direct install', () => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });

        expect(
            detectMacInstallSource('/Applications/PromptHub.app/Contents/MacOS/PromptHub'),
        ).toBe('direct');
    });

    it('resolves updater download redirects only to HTTP(S) URLs', () => {
        expect(
            resolveUpdaterDownloadUrl(
                '../PromptHub-1.1.0-arm64.dmg',
                'https://github.com/legeling/PromptHub/releases/latest/download/latest-mac.yml',
            ),
        ).toBe(
            'https://github.com/legeling/PromptHub/releases/latest/PromptHub-1.1.0-arm64.dmg',
        );

        expect(
            resolveUpdaterDownloadUrl(
                'https://github.com/legeling/PromptHub/releases/download/v1.1.0/PromptHub.dmg',
            ),
        ).toBe(
            'https://github.com/legeling/PromptHub/releases/download/v1.1.0/PromptHub.dmg',
        );

        expect(() =>
            resolveUpdaterDownloadUrl(
                'file:///tmp/PromptHub.dmg',
                'https://github.com/legeling/PromptHub/releases/latest/download/latest-mac.yml',
            ),
        ).toThrow('Unsupported updater download protocol');
        expect(() =>
            resolveUpdaterDownloadUrl(
                'httpx://github.com/legeling/PromptHub/PromptHub.dmg',
            ),
        ).toThrow('Unsupported updater download protocol');
    });
});
