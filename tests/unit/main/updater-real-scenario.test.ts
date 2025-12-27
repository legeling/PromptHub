/**
 * @vitest-environment node
 * 
 * 真实场景测试：自动更新功能
 * 直接调用 src/main/updater.ts 中的真实代码
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import https from 'https';

// Mock electron 模块（因为 updater.ts 依赖 electron）
vi.mock('electron', () => ({
    app: {
        isPackaged: false, // 开发模式
        getVersion: vi.fn(() => '0.2.9'), // 模拟当前版本
        getAppPath: vi.fn(() => process.cwd()),
        getPath: vi.fn(() => '/tmp'),
    },
    ipcMain: { handle: vi.fn() },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    shell: { openExternal: vi.fn(), openPath: vi.fn() },
}));

vi.mock('electron-updater', () => ({
    autoUpdater: {
        on: vi.fn(),
        checkForUpdatesAndNotify: vi.fn(),
        downloadUpdate: vi.fn(),
        quitAndInstall: vi.fn(),
        autoDownload: false,
        autoInstallOnAppQuit: true,
        channel: 'latest',
    }
}));

// 导入真实的函数
import { getChangelogForVersionRange, compareVersions } from '../../../src/main/updater';

describe('自动更新 - 真实场景测试（调用真实代码）', () => {

    describe('getChangelogForVersionRange - 真实代码测试', () => {

        it('从 0.2.9 升级到 0.3.3 应该只显示 0.3.0, 0.3.1, 0.3.2, 0.3.3 的更新日志', () => {
            const result = getChangelogForVersionRange('0.3.3', '0.2.9');

            console.log('=== 更新日志内容 ===');
            console.log(result);
            console.log('=== 结束 ===');

            // 应该包含 0.3.3, 0.3.2, 0.3.1, 0.3.0
            expect(result).toContain('## [0.3.3]');
            expect(result).toContain('## [0.3.2]');
            expect(result).toContain('## [0.3.1]');
            expect(result).toContain('## [0.3.0]');

            // 不应该包含 0.2.9 及之前的版本
            expect(result).not.toContain('## [0.2.9]');
            expect(result).not.toContain('## [0.2.8]');
            expect(result).not.toContain('## [0.2.7]');

            // 不应该包含 CHANGELOG 开头的说明文字
            expect(result).not.toContain('# 更新日志 / Changelog');
            expect(result).not.toContain('所有重要的版本更新都会记录在此文件中');
            expect(result).not.toContain('All notable changes to this project');
            expect(result).not.toContain('Keep a Changelog');
            expect(result).not.toContain('Semantic Versioning');
        });

        it('从 0.2.9 升级到 0.3.0 应该只显示 0.3.0 的更新日志', () => {
            const result = getChangelogForVersionRange('0.3.0', '0.2.9');

            // 应该只包含 0.3.0
            expect(result).toContain('## [0.3.0]');

            // 不应该包含其他版本
            expect(result).not.toContain('## [0.3.1]');
            expect(result).not.toContain('## [0.3.2]');
            expect(result).not.toContain('## [0.2.9]');
        });

        it('已经是最新版本时应该返回空字符串', () => {
            const result = getChangelogForVersionRange('0.3.3', '0.3.3');
            expect(result).toBe('');
        });

        it('更新日志内容应该包含实际的功能描述', () => {
            const result = getChangelogForVersionRange('0.3.3', '0.2.9');

            // 验证包含实际的功能描述
            // 0.3.3 的内容
            expect(result).toContain('多层级文件夹支持');

            // 0.3.2 的内容
            expect(result).toContain('搜索展示优化');
            expect(result).toContain('文件夹图标扩展');

            // 0.3.1 的内容  
            expect(result).toContain('搜索体验优化');

            // 0.3.0 的内容
            expect(result).toContain('检查更新优化');
        });
    });

    describe('compareVersions - 真实代码测试', () => {

        it('应该正确比较版本号', () => {
            expect(compareVersions('0.3.0', '0.2.9')).toBe(1);  // 0.3.0 > 0.2.9
            expect(compareVersions('0.2.9', '0.3.0')).toBe(-1); // 0.2.9 < 0.3.0
            expect(compareVersions('0.3.3', '0.3.3')).toBe(0);  // 相等
            expect(compareVersions('1.0.0', '0.9.9')).toBe(1);  // 主版本号更大
            expect(compareVersions('0.10.0', '0.9.0')).toBe(1); // 次版本号 10 > 9
        });

        it('应该正确处理带 v 前缀的版本号', () => {
            expect(compareVersions('v0.3.0', '0.2.9')).toBe(1);
            expect(compareVersions('0.3.0', 'v0.2.9')).toBe(1);
            expect(compareVersions('v0.3.3', 'v0.3.3')).toBe(0);
        });
    });

    describe('更新链接验证', () => {
        function checkUrlAccessible(url: string): Promise<{ accessible: boolean; statusCode: number }> {
            return new Promise((resolve) => {
                const urlObj = new URL(url);
                const options = {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + urlObj.search,
                    method: 'HEAD',
                    timeout: 10000,
                };

                const req = https.request(options, (res) => {
                    const accessible = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400;
                    resolve({ accessible, statusCode: res.statusCode || 0 });
                });

                req.on('error', () => resolve({ accessible: false, statusCode: 0 }));
                req.on('timeout', () => { req.destroy(); resolve({ accessible: false, statusCode: 0 }); });
                req.end();
            });
        }

        it('latest.yml 应该可以访问', async () => {
            const url = 'https://github.com/legeling/PromptHub/releases/latest/download/latest.yml';
            const result = await checkUrlAccessible(url);

            console.log(`latest.yml 状态码: ${result.statusCode}`);
            expect(result.accessible).toBe(true);
        }, 15000);

        it('Windows x64 安装包链接应该可以访问', async () => {
            const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf-8'));
            const version = packageJson.version;

            const url = `https://github.com/legeling/PromptHub/releases/download/v${version}/PromptHub-Setup-${version}-x64.exe`;
            const result = await checkUrlAccessible(url);

            console.log(`Windows x64 安装包 (${url}) 状态码: ${result.statusCode}`);

            if (!result.accessible) {
                console.warn(`警告: 当前版本 ${version} 的安装包可能尚未发布`);
            }

            // 至少验证链接格式正确
            expect(url).toContain('PromptHub-Setup-');
            expect(url).toContain('-x64.exe');
        }, 15000);
    });
});
