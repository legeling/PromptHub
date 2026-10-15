import { defineConfig } from '@playwright/test';
import { isElectronHeaded, nativeWindowTestTag } from './tests/e2e/helpers/electron-launch-options';

export default defineConfig({
    testDir: './tests/e2e',
    grepInvert: isElectronHeaded() ? undefined : new RegExp(nativeWindowTestTag),
    timeout: 60000, // Electron 启动可能较慢，给足时间
    expect: {
        timeout: 10000,
    },
    fullyParallel: false, // Electron 测试必须串行
    workers: 1,
    reporter: 'list',
    use: {
        trace: 'on-first-retry', // 失败时保留痕迹，方便调试
        screenshot: 'only-on-failure',
    },
});
