# AI-Web-for-PPT · 页间之间

Using AI for PPT generating. 把一段中文文案整理成网页演示文稿，支持逐步生成进度、主题切换、全屏和翻页演示，以及下载独立 HTML 文件。

## 本地运行

需要 Node.js 20 或更高版本，不需要额外安装 npm 依赖：

```powershell
npm start
```

打开 <http://localhost:3000>。没有配置模型密钥时，应用使用内置演示生成器，方便直接体验完整流程。

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

应用以 Node.js 原生 HTTP 服务、原生浏览器 JavaScript 和 Server-Sent Events 实现，不依赖第三方运行时包。真实模型通过服务端 `fetch` 接口以流式方式调用；浏览器使用 `fetch` 流逐条读取进度事件。
