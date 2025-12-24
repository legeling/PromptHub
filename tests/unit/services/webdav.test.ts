import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testConnection, incrementalUpload } from '../../../src/renderer/services/webdav';
import * as db from '../../../src/renderer/services/database';

// Mock database service
vi.mock('../../../src/renderer/services/database', () => ({
    exportDatabase: vi.fn(),
}));

describe('WebDAV Service', () => {
    const mockConfig = {
        url: 'https://example.com/dav/',
        username: 'user',
        password: 'pass',
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock global fetch
        global.fetch = vi.fn();

        // Mock crypto using a simple shim for testing
        // 注意：JSdom 环境可能缺失完整的 crypto API，这里做个简单的 mock
        Object.defineProperty(global, 'crypto', {
            value: {
                subtle: {
                    digest: vi.fn().mockResolvedValue(new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer), // simple buffer
                    importKey: vi.fn(),
                    deriveKey: vi.fn(),
                    encrypt: vi.fn(),
                    decrypt: vi.fn(),
                },
                getRandomValues: vi.fn((arr) => {
                    for (let i = 0; i < arr.length; i++) arr[i] = 0;
                    return arr;
                }),
            },
            writable: true,
        });
    });

    describe('testConnection', () => {
        it('should prefer window.electron.webdav if available', async () => {
            // Mock IPC
            const mockTestConnection = vi.fn().mockResolvedValue({ success: true, message: 'OK' });
            window.electron = {
                ...window.electron,
                webdav: {
                    testConnection: mockTestConnection,
                    // Add other methods to satify type checks if needed
                    upload: vi.fn(),
                    download: vi.fn(),
                    ensureDirectory: vi.fn(),
                }
            } as any;

            const result = await testConnection(mockConfig);

            expect(mockTestConnection).toHaveBeenCalledWith(mockConfig);
            expect(result.success).toBe(true);
        });

        it('should fallback to fetch if electron API is missing', async () => {
            // Remove electron webdav capability
            window.electron = { ipcRenderer: window.electron.ipcRenderer } as any;

            (global.fetch as any).mockResolvedValue({
                ok: true,
                status: 200,
                statusText: 'OK'
            });

            const result = await testConnection(mockConfig);

            expect(global.fetch).toHaveBeenCalledWith(
                mockConfig.url,
                expect.objectContaining({
                    method: 'PROPFIND',
                    headers: expect.objectContaining({
                        'Authorization': expect.stringContaining('Basic'),
                    })
                })
            );
            expect(result.success).toBe(true);
        });

        it('should handle 401 Unauthorized', async () => {
            window.electron = { ipcRenderer: window.electron.ipcRenderer } as any;

            (global.fetch as any).mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            });

            const result = await testConnection(mockConfig);
            expect(result.success).toBe(false);
            expect(result.message).toContain('Authentication failed');
        });
    });

    describe('incrementalUpload', () => {
        it('should perform incremental upload logic', async () => {
            // Mock database return
            /* @ts-ignore */
            db.exportDatabase.mockResolvedValue({
                prompts: [{ id: 1, content: 'test' }],
                folders: [],
                version: '4.0',
                images: {},
                settings: {},
                aiConfig: {},
            });

            // Mock electron IPC for file operations to simplify testing
            const mockEnsureDir = vi.fn().mockResolvedValue(undefined);
            const mockDownload = vi.fn().mockResolvedValue({ success: false, notFound: true }); // Simulate first run (no manifest)
            const mockUpload = vi.fn().mockResolvedValue({ success: true });

            window.electron = {
                ...window.electron,
                webdav: {
                    ensureDirectory: mockEnsureDir,
                    download: mockDownload,
                    upload: mockUpload,
                }
            } as any;

            const result = await incrementalUpload(mockConfig);

            // Should check connection/directories
            expect(mockEnsureDir).toHaveBeenCalled();

            // Should try to download manifest
            expect(mockDownload).toHaveBeenCalledWith(expect.stringContaining('manifest.json'), mockConfig);

            // Should upload data since manifest failed (first sync)
            expect(mockUpload).toHaveBeenCalledWith(expect.stringContaining('data.json'), mockConfig, expect.any(String));

            // Should upload new manifest
            expect(mockUpload).toHaveBeenCalledWith(expect.stringContaining('manifest.json'), mockConfig, expect.any(String));

            expect(result.success).toBe(true);
        });
    });
});
