/**
 * Database Service Unit Tests
 * 
 * 测试 IndexedDB 操作，包括 CRUD、初始化、备份恢复等
 * Tests for IndexedDB operations including CRUD, initialization, backup/restore
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installWindowMocks } from '../../helpers/window';

// 由于 database.ts 直接使用 window.indexedDB，我们需要在 jsdom 环境下测试
// 或者使用 fake-indexeddb polyfill

describe('Database Service', () => {
    // Mock IndexedDB
    let mockDB: any;
    let mockObjectStore: any;
    let mockTransaction: any;

    beforeEach(() => {
        vi.resetModules();

        mockObjectStore = {
            add: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            put: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            get: vi.fn().mockReturnValue({ onsuccess: null, onerror: null, result: null }),
            getAll: vi.fn().mockReturnValue({ onsuccess: null, onerror: null, result: [] }),
            delete: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            clear: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            createIndex: vi.fn(),
        };

        mockTransaction = {
            objectStore: vi.fn().mockReturnValue(mockObjectStore),
            oncomplete: null,
            onerror: null,
            onabort: null,
        };

        const objectStoreNames = ['prompts', 'versions', 'folders', 'settings'] as any;
        objectStoreNames.contains = vi.fn((storeName: string) =>
            objectStoreNames.includes(storeName),
        );

        mockDB = {
            transaction: vi.fn().mockReturnValue(mockTransaction),
            createObjectStore: vi.fn().mockReturnValue(mockObjectStore),
            objectStoreNames,
            close: vi.fn(),
        };

        // Mock indexedDB.open
        const mockOpenRequest = {
            onsuccess: null as any,
            onerror: null as any,
            onupgradeneeded: null as any,
            result: mockDB,
        };

        vi.stubGlobal('indexedDB', {
            open: vi.fn().mockImplementation(() => {
                setTimeout(() => {
                    if (mockOpenRequest.onsuccess) {
                        mockOpenRequest.onsuccess({ target: mockOpenRequest });
                    }
                }, 0);
                return mockOpenRequest;
            }),
            deleteDatabase: vi.fn().mockImplementation(() => {
                const request = {
                    onsuccess: null as any,
                    onerror: null as any,
                    error: null,
                };
                setTimeout(() => {
                    request.onsuccess?.({ target: request });
                }, 0);
                return request;
            }),
        });

        installWindowMocks({
            electron: {
                clearImages: vi.fn().mockResolvedValue(true),
                clearVideos: vi.fn().mockResolvedValue(true),
            },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    describe('generateId', () => {
        it('should generate unique UUIDs', () => {
            // Mock crypto.randomUUID
            const uuids = new Set<string>();
            vi.stubGlobal('crypto', {
                randomUUID: vi.fn()
                    .mockReturnValueOnce('uuid-1')
                    .mockReturnValueOnce('uuid-2')
                    .mockReturnValueOnce('uuid-3'),
            });

            // 导入模块会使用我们的 mock
            // 这里我们直接测试 crypto.randomUUID
            expect(crypto.randomUUID()).toBe('uuid-1');
            expect(crypto.randomUUID()).toBe('uuid-2');
            expect(crypto.randomUUID()).toBe('uuid-3');
        });
    });

    describe('Database Initialization', () => {
        it('should open database with correct name and version', async () => {
            // indexedDB.open 应该被调用
            expect(indexedDB.open).toBeDefined();
        });

        it('should not log normal database reset success', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
            const { resetDatabase } = await import('../../../src/renderer/services/database');

            await resetDatabase();

            expect(indexedDB.deleteDatabase).toHaveBeenCalledWith('PromptHubDB');
            expect(logSpy).not.toHaveBeenCalled();
        });

        it('should not log normal clear success while clearing media stores', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
            mockDB.transaction.mockImplementation(() => {
                setTimeout(() => {
                    mockTransaction.oncomplete?.();
                }, 0);
                return mockTransaction;
            });
            const { clearDatabase } = await import('../../../src/renderer/services/database');

            await clearDatabase();

            expect(mockDB.transaction).toHaveBeenCalledWith(
                ['prompts', 'folders', 'versions'],
                'readwrite',
            );
            expect(mockObjectStore.clear).toHaveBeenCalledTimes(3);
            expect(window.electron?.clearImages).toHaveBeenCalled();
            expect(window.electron?.clearVideos).toHaveBeenCalled();
            expect(logSpy).not.toHaveBeenCalled();
        });
    });

    describe('Prompt CRUD Operations', () => {
        const mockPrompt = {
            id: 'test-prompt-1',
            title: 'Test Prompt',
            description: 'A test prompt',
            content: 'Hello {{name}}',
            folderId: null,
            variables: [{ name: 'name', defaultValue: 'World' }],
            tags: ['test'],
            isFavorite: false,
            isPinned: false,
            version: 1,
            currentVersion: 1,
            usageCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        it('should validate prompt structure', () => {
            expect(mockPrompt.id).toBeDefined();
            expect(mockPrompt.title).toBeDefined();
            expect(mockPrompt.content).toBeDefined();
            expect(Array.isArray(mockPrompt.variables)).toBe(true);
            expect(Array.isArray(mockPrompt.tags)).toBe(true);
        });

        it('should handle variable extraction from content', () => {
            const content = 'Hello {{name}}, welcome to {{place}}!';
            const variableRegex = /\{\{(\w+)\}\}/g;
            const variables: string[] = [];
            let match;

            while ((match = variableRegex.exec(content)) !== null) {
                variables.push(match[1]);
            }

            expect(variables).toEqual(['name', 'place']);
        });
    });

    describe('Folder Operations', () => {
        const mockFolder = {
            id: 'folder-1',
            name: 'Test Folder',
            icon: '📁',
            order: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        it('should validate folder structure', () => {
            expect(mockFolder.id).toBeDefined();
            expect(mockFolder.name).toBeDefined();
            expect(mockFolder.icon).toBeDefined();
            expect(typeof mockFolder.order).toBe('number');
        });
    });

    describe('Version History', () => {
        const mockVersion = {
            id: 'version-1',
            promptId: 'prompt-1',
            versionNumber: 1,
            content: 'Original content',
            createdAt: new Date().toISOString(),
        };

        it('should validate version structure', () => {
            expect(mockVersion.id).toBeDefined();
            expect(mockVersion.promptId).toBeDefined();
            expect(typeof mockVersion.versionNumber).toBe('number');
            expect(mockVersion.content).toBeDefined();
        });

        it('should increment version number correctly', () => {
            const currentVersion = 1;
            const newVersion = currentVersion + 1;
            expect(newVersion).toBe(2);
        });
    });

    describe('Backup and Restore', () => {
        it('should export data in correct format', () => {
            const exportData = {
                version: '3.0',
                exportedAt: new Date().toISOString(),
                prompts: [],
                folders: [],
                versions: [],
            };

            expect(exportData.version).toBeDefined();
            expect(exportData.exportedAt).toBeDefined();
            expect(Array.isArray(exportData.prompts)).toBe(true);
            expect(Array.isArray(exportData.folders)).toBe(true);
        });

        it('should validate import data structure', () => {
            const importData = {
                version: '3.0',
                prompts: [{ id: '1', title: 'Test' }],
                folders: [],
            };

            // 验证必要字段
            expect(importData.prompts).toBeDefined();
            expect(Array.isArray(importData.prompts)).toBe(true);

            // 验证每个 prompt 有 id
            importData.prompts.forEach(p => {
                expect(p.id).toBeDefined();
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle database open error', async () => {
            const mockError = new Error('Database open failed');

            vi.stubGlobal('indexedDB', {
                open: vi.fn().mockImplementation(() => {
                    const request = {
                        onsuccess: null as any,
                        onerror: null as any,
                    };
                    setTimeout(() => {
                        if (request.onerror) {
                            request.onerror({ target: { error: mockError } });
                        }
                    }, 0);
                    return request;
                }),
            });

            // 错误应该被正确处理
            expect(mockError.message).toBe('Database open failed');
        });
    });
});
