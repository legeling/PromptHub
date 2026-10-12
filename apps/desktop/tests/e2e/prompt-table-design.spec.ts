import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { launchPromptHub, closePromptHub, setAppSettings } from './helpers/electron';

const evidenceDir = path.resolve('../../output/playwright/prompt-table-design');

async function seedImagePrompts(page: Page): Promise<void> {
  const imageBase64 = fs.readFileSync(path.resolve('../../docs/imgs/icon.png')).toString('base64');
  await page.evaluate(async (base64) => {
    const imageName = 'table-preview-fixture.png';
    await window.electron.saveImageBase64?.(imageName, base64);
    const prompts = [
      ['黑色袋子糖果摄影', '黑色哑光包装袋中装着彩色糖果，微距产品摄影，柔和棚拍光线，纯净背景，强调包装与糖果的质感。'],
      ['霓虹机器人科幻海报', 'Futuristic dark tech poster, a large robot in a neon city, cinematic lighting, cyberpunk atmosphere, fine metallic details.'],
      ['创意海报封面', 'A professional poster cover design, minimal typography, geometric composition, warm cream background, refined editorial style.'],
      ['涂鸦墙前的金属机器人', 'masterpiece, best quality, highly detailed, a golden robot standing in front of a graffiti wall, street photography.'],
      ['山间木屋场景', '清晨薄雾中的山间木屋，松树林与远山，温暖窗光，自然摄影，柔和光影，安静氛围。'],
      ['香水产品摄影', 'A translucent blue perfume bottle on a stone pedestal, studio product photography, soft shadows, clean composition.'],
      ['Image Prompt', 'describe image, include subject, composition, light and visual style.'],
    ];
    for (const [index, [title, userPrompt]] of prompts.entries()) {
      await window.api.prompt.create({ title, userPrompt, promptType: 'image', systemPrompt: '', tags: [], variables: [], images: index < 6 ? [imageName] : [] });
    }
  }, imageBase64);
}

async function verifyIndependentFilters(page: Page): Promise<void> {
  for (const name of ['Text', 'Image', 'All', 'Image']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name: 'List View', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('table')).toBeVisible();
  }
}

async function verifyPreviewAndColumns(page: Page): Promise<void> {
  const preview = page.getByRole('button', { name: 'Preview', exact: true }).first();
  await preview.click();
  const dialog = page.getByRole('dialog', { name: 'Preview', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img')).toHaveJSProperty('naturalWidth', 256);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(preview).toBeFocused();
  await page.getByRole('button', { name: 'Column Settings', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'AI Response', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'AI Response', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('columnheader', { name: 'AI Response', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Column Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'AI Response', exact: true })).toHaveCount(0);
}

test('prompt table design and independent navigation in an isolated Electron profile', async () => {
  const { app, page, userDataDir } = await launchPromptHub('screenshots.seed.json');
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1650, 954));
    await page.setViewportSize({ width: 1650, height: 954 });
    await seedImagePrompts(page);
    await setAppSettings(page, { language: 'en', themeMode: 'light', autoCheckUpdate: false });
    await page.getByRole('button', { name: 'List View', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Prompt Library' })).toHaveCount(0);
    await expect(page.locator('.prompt-list-header')).toHaveClass(/app-wallpaper-toolbar/);
    await expect(page.getByRole('button', { name: 'Image', exact: true }).locator('svg')).toBeVisible();
    await expect(page.locator('.bg-sidebar-rail')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'AI Response', exact: true })).toHaveCount(0);
    await verifyIndependentFilters(page);
    await verifyPreviewAndColumns(page);
    await setAppSettings(page, { language: 'zh' });
    await page.getByRole('button', { name: '绘图', exact: true }).click();
    await expect(page.locator('table tbody tr')).toHaveCount(7);
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.mouse.move(900, 30);
    await page.screenshot({ path: path.join(evidenceDir, 'light.png'), scale: 'css' });
    await page.locator('table').screenshot({ path: path.join(evidenceDir, 'table-detail.png'), scale: 'css' });
    await page.getByRole('button', { name: '切换主题', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({ path: path.join(evidenceDir, 'dark.png'), scale: 'css' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1100, 760));
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.screenshot({ path: path.join(evidenceDir, 'compact.png'), scale: 'css' });
    await expect(page.getByRole('button', { name: '列设置', exact: true })).toBeInViewport();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
