import { app, BrowserWindow, dialog, shell, session } from 'electron';
import { join } from 'node:path';
import { createAppServer } from './server.js';

let localServer;

function startLocalServer() {
  // 安装目录通常不可写，桌面应用的模型设置固定存到 %APPDATA%\页间之间\config.json。
  process.env.APP_CONFIG_PATH = join(app.getPath('appData'), '页间之间', 'config.json');
  return new Promise((resolve, reject) => {
    localServer = createAppServer();
    localServer.once('error', reject);
    localServer.listen(0, '127.0.0.1', () => {
      localServer.removeListener('error', reject);
      resolve(localServer.address().port);
    });
  });
}

async function createWindow(port) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 680,
    show: false,
    backgroundColor: '#f6f5f1',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  await window.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(async () => {
  try {
    const port = await startLocalServer();
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({
        title: '导出演示文稿',
        buttonLabel: '保存',
        defaultPath: item.getFilename()
      });
    });
    await createWindow(port);
  } catch (error) {
    dialog.showErrorBox('应用启动失败', error.message);
    app.quit();
  }
});

app.on('before-quit', () => {
  localServer?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0 && localServer?.listening) {
    await createWindow(localServer.address().port);
  }
});
