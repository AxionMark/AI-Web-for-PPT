# AI-Web-for-PPT · 页间之间

Using AI for PPT generating. 把一段中文文案整理成网页演示文稿，也可以直接和 AI 对话，边聊边改出一套 PPT。支持逐步生成进度、主题切换、全屏和翻页演示，以及下载独立 HTML 文件。

## 本地运行

需要 Node.js 20 或更高版本，不需要额外安装 npm 依赖：

```powershell
npm start
```

打开 <http://localhost:3000>。没有配置模型密钥时，应用使用内置演示生成器，方便直接体验完整流程。

## 两种生成方式

| 方式 | 适合场景 | 说明 |
| --- | --- | --- |
| 文案生成 | 已经有一段成稿的文字 | 粘贴文案，一次生成 5-8 页演示 |
| 对话生成 | 只有一个模糊的想法 | 和 AI 多轮对话，它会先问清主题、受众和重点，再出稿，之后可以继续说“把第 2 页改得更短”来迭代 |

两种方式共用右侧的预览面板：主题配色、翻页、全屏和导出独立 HTML 都一致。

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
| `ai-web-ppt-1.1.0-x64-setup.exe` | NSIS 安装程序，可自选安装目录，并创建桌面和开始菜单快捷方式 |
| `ai-web-ppt-1.1.0-x64-portable.exe` | 便携版，单文件免安装，双击即可运行 |

只想要便携版时可以运行 `npm run dist:portable`。

桌面应用会在本机启动仅监听回环地址（`127.0.0.1`）的服务，窗口关闭时自动停止；最终用户无需安装 Node.js 或单独打开浏览器。应用图标存放在 `build/icon.ico`，可用 `npm run icon` 重新生成。

## 配置模型（API 密钥与接口地址）

模型服务兼容 OpenAI Chat Completions 流式接口，密钥和接口地址都由你自己提供。最省事的方式是点右上角的设置按钮，填好后点「保存」：

| 字段 | 示例 | 说明 |
| --- | --- | --- |
| API 密钥 | `sk-…` | 只保存在本机，不会写进代码或发到浏览器 |
| 接口地址 | `https://api.openai.com/v1` | 任何兼容 OpenAI 协议的服务都可以，结尾带 `/v1` |
| 模型名称 | `gpt-4o-mini` | 服务商提供的模型 ID |

填好后可以点「测试连接」确认能否调通。设置保存位置：

- 网页版（`npm start`）：项目根目录的 `config.json`，已加入 `.gitignore`，不会提交到仓库。
- 桌面版（`.exe`）：`%APPDATA%\页间之间\config.json`，不需要管理员权限。

除了界面设置，也支持环境变量和 `api.txt`，优先级为 **环境变量 > config.json > api.txt**：

```powershell
$env:OPENAI_API_KEY = "你的 API 密钥"
$env:OPENAI_BASE_URL = "https://api.openai.com/v1"   # 可省略
$env:OPENAI_MODEL = "gpt-4o-mini"                    # 可省略
npm start
```

密钥只在服务端读取和转发，网页端拿不到；本地服务只监听 `127.0.0.1`，并拒绝非本机页面发起的写请求。

## 使用方式

1. 粘贴至少 40 字、最多 20,000 字的文案，也可以点击“使用示例文案”。
2. 点击“生成我的 PPT”，观察实时生成状态。
3. 切换到“对话生成”后，直接说出你的想法；AI 会先追问关键信息，再给出成套幻灯片，后续每条消息都会重新排版整套演示。
4. 点击主题色切换奶油纸张、午夜蓝和植物绿主题；使用方向键或页面下方按钮翻页。
5. 点击全屏按钮进入演示模式，按 `Esc` 退出。
6. 点击下载按钮导出包含内容、样式与翻页逻辑的独立 HTML，可离线打开。

## 技术说明

应用以 Node.js 原生 HTTP 服务、原生浏览器 JavaScript 和 Server-Sent Events 实现，不依赖第三方运行时包。Electron 只负责窗口与打包，渲染进程关闭 `nodeIntegration` 并启用 `sandbox`，页面数据全部来自本地回环服务。

接口一览：

| 接口 | 用途 |
| --- | --- |
| `POST /api/generate` | 单次文案生成，返回 `progress` / `complete` / `error` 事件 |
| `POST /api/chat` | 对话生成，返回 `progress` / `reply` / `complete` / `error` 事件，`reply` 是逐字流式回复 |
| `GET` `POST /api/settings` | 读取与保存模型设置，密钥只写不读 |
| `POST /api/settings/test` | 用一次极短请求验证模型服务是否可达 |

对话模式下，模型被要求只输出 `{"reply":"…","slides":null}` 或 `{"reply":"…","slides":[…]}` 这样的 JSON：信息不足时 `slides` 为 `null`，出稿时返回完整幻灯片数组，因此每一轮都能覆盖式地改稿。真实模型通过服务端 `fetch` 以流式方式调用，浏览器用 `fetch` 流逐条读取事件。
