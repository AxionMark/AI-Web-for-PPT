# AI-Web-for-PPT · 页间之间

Using AI for PPT generating. 把一段中文文案整理成网页演示文稿，支持逐步生成进度、主题切换、全屏和翻页演示，以及下载独立 HTML 文件。

## 本地运行

需要 Node.js 20 或更高版本，不需要额外安装 npm 依赖：

```powershell
npm start
```

打开 <http://localhost:3000>。没有配置模型密钥时，应用使用内置演示生成器，方便直接体验完整流程。

## Windows 桌面应用

首次在项目目录安装桌面构建依赖，然后启动桌面应用：

```powershell
npm install
npm run app
```

### 打包成 .exe

```powershell
npm run dist
```

命令会在 `dist/` 目录生成两份可直接分发的 Windows 程序：

| 文件 | 说明 |
| --- | --- |
| `ai-web-ppt-1.0.0-x64-setup.exe` | NSIS 安装程序，可自选安装目录，并创建桌面和开始菜单快捷方式 |
| `ai-web-ppt-1.0.0-x64-portable.exe` | 便携版，单文件免安装，双击即可运行 |

只想要便携版时可以运行 `npm run dist:portable`。

桌面应用会在本机启动仅监听回环地址（`127.0.0.1`）的服务，窗口关闭时自动停止；最终用户无需安装 Node.js 或单独打开浏览器。应用图标存放在 `build/icon.ico`，可用 `npm run icon` 重新生成。

## 配置真实大模型

后端兼容 OpenAI Chat Completions 流式接口。启动应用前设置下列环境变量：

```powershell
$env:OPENAI_API_KEY = "你的 API 密钥"
$env:OPENAI_MODEL = "gpt-4o-mini"
$env:OPENAI_BASE_URL = "https://api.openai.com/v1"
npm start
```

`OPENAI_MODEL` 与 `OPENAI_BASE_URL` 均可省略；应用会使用上述默认值。密钥只在服务端读取，不会发送到浏览器。

## 使用方式

1. 粘贴至少 40 字、最多 20,000 字的文案，也可以点击“使用示例文案”。
2. 点击“生成我的 PPT”，观察实时生成状态。
3. 点击主题色切换奶油纸张、午夜蓝和植物绿主题；使用方向键或页面下方按钮翻页。
4. 点击全屏按钮进入演示模式，按 `Esc` 退出。
5. 点击下载按钮导出包含内容、样式与翻页逻辑的独立 HTML，可离线打开。

## 技术说明

应用以 Node.js 原生 HTTP 服务、原生浏览器 JavaScript 和 Server-Sent Events 实现，不依赖第三方运行时包。Electron 只负责窗口与打包，渲染进程关闭 `nodeIntegration` 并启用 `sandbox`，页面数据全部来自本地回环服务。真实模型通过服务端 `fetch` 接口以流式方式调用；浏览器使用 `fetch` 流逐条读取进度事件。
