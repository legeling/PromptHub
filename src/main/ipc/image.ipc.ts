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

    // 获取所有本地图片文件名列表
    ipcMain.handle('image:list', async () => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        if (!fs.existsSync(imagesDir)) {
            return [];
        }

        try {
            const files = fs.readdirSync(imagesDir);
            return files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
        } catch (error) {
            console.error('Failed to list images:', error);
            return [];
        }
    });

    // 读取图片为 Base64
    ipcMain.handle('image:readBase64', async (_event, fileName: string) => {
        const userDataPath = app.getPath('userData');
        const imagePath = path.join(userDataPath, 'images', fileName);

        try {
            if (!fs.existsSync(imagePath)) {
                return null;
            }
            const buffer = fs.readFileSync(imagePath);
            return buffer.toString('base64');
        } catch (error) {
            console.error(`Failed to read image ${fileName}:`, error);
            return null;
        }
    });

    // 从 Base64 保存图片（用于同步下载）
    ipcMain.handle('image:saveBase64', async (_event, fileName: string, base64Data: string) => {
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'images');

        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        try {
            const destPath = path.join(imagesDir, fileName);
            // 如果文件已存在，跳过
            if (fs.existsSync(destPath)) {
                return true;
            }
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(destPath, buffer);
            return true;
        } catch (error) {
            console.error(`Failed to save image ${fileName}:`, error);
            return false;
        }
    });

    // 检查图片是否存在
    ipcMain.handle('image:exists', async (_event, fileName: string) => {
        const userDataPath = app.getPath('userData');
        const imagePath = path.join(userDataPath, 'images', fileName);
        return fs.existsSync(imagePath);
    });
    
    // 清除所有图片
    ipcMain.handle('image:clear', async () => {
        try {
            const userDataPath = app.getPath('userData');
            const imagesDir = path.join(userDataPath, 'images');
            if (fs.existsSync(imagesDir)) {
                const files = fs.readdirSync(imagesDir);
                for (const file of files) {
                    fs.unlinkSync(path.join(imagesDir, file));
                }
                console.log(`Cleared ${files.length} images`);
            }
            return true;
        } catch (error) {
            console.error('Failed to clear images:', error);
            return false;
        }
    });
}
