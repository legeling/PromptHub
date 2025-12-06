import { ipcMain, dialog, app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export function registerImageIPC() {
    // 选择图片
    ipcMain.handle('dialog:selectImage', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg', 'webp'] }
            ]
        });

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths;
        }
        return [];
    });

    // 保存图片到应用数据目录
    ipcMain.handle('image:save', async (_event, filePaths: string[]) => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        const savedImages: string[] = [];

        for (const filePath of filePaths) {
            try {
                const ext = path.extname(filePath);
                const fileName = `${uuidv4()}${ext}`;
                const destPath = path.join(imagesDir, fileName);

                fs.copyFileSync(filePath, destPath);
                savedImages.push(fileName);
            } catch (error) {
                console.error(`Failed to save image ${filePath}:`, error);
            }
        }

        return savedImages;
    });
    // 使用默认应用打开图片
    ipcMain.handle('image:open', async (_event, fileName: string) => {
        const userDataPath = app.getPath('userData');
        const imagePath = path.join(userDataPath, 'images', fileName);

        try {
            await shell.openPath(imagePath);
            return true;
        } catch (error) {
            console.error(`Failed to open image ${imagePath}:`, error);
            return false;
        }
    });
    // 保存图片 buffer
    ipcMain.handle('image:save-buffer', async (_event, buffer: Buffer) => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        try {
            const fileName = `${uuidv4()}.png`;
            const destPath = path.join(imagesDir, fileName);
            fs.writeFileSync(destPath, buffer);
            return fileName;
        } catch (error) {
            console.error('Failed to save image buffer:', error);
            return null;
        }
    });

    // 下载图片
    ipcMain.handle('image:download', async (_event, url: string) => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // 尝试从 URL 获取扩展名，默认为 png
            let ext = path.extname(url).split('?')[0];
            if (!ext || ext.length > 5) ext = '.png';

            const fileName = `${uuidv4()}${ext}`;
            const destPath = path.join(imagesDir, fileName);

            fs.writeFileSync(destPath, buffer);
            return fileName;
        } catch (error) {
            console.error(`Failed to download image ${url}:`, error);
            return null;
        }
    });
}
