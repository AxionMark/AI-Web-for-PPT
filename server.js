import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const maxRequestBytes = 256 * 1024;
const maxChatTurns = 24;
const maxTurnChars = 12000;
const defaultBaseUrl = 'https://api.openai.com/v1';
const defaultModel = 'gpt-4o-mini';
// 路径在每次调用时解析：桌面应用会在启动本地服务前设置 APP_CONFIG_PATH。
function resolveConfigPath() {
  return process.env.APP_CONFIG_PATH ? resolve(process.env.APP_CONFIG_PATH) : resolve(root, 'config.json');
}

function resolveLegacyKeyPath() {
  return resolve(root, 'api.txt');
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const slideFields = '[{"type":"cover|content|cards|quote|stats|closing","eyebrow":"短英文标签","title":"标题","subtitle":"副标题","body":"简短说明","bullets":["要点"],"cards":[{"title":"卡片标题","text":"解释"}],"quote":"引用","attribution":"来源","stats":[{"value":"数值","label":"说明"}]}]';
const slideRules = '整套共 5-8 页：第一页 type 必须是 cover，最后一页必须是 closing；标题精炼，body 不超过 60 字，bullets 最多 4 条，cards 最多 3 张，stats 最多 3 项；只使用上面出现过的字段，不要新增字段。';

function sendEvent(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': mimeTypes['.json'], 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function normalizeSlides(value) {
  if (!Array.isArray(value)) throw new Error('模型没有返回有效的幻灯片列表。');
  const slides = value.map((slide) => ({
    type: ['cover', 'cards', 'quote', 'stats', 'closing'].includes(slide.type) ? slide.type : 'content',
    eyebrow: String(slide.eyebrow || '').slice(0, 80),
    title: String(slide.title || '').slice(0, 140),
    subtitle: String(slide.subtitle || '').slice(0, 240),
    body: String(slide.body || '').slice(0, 360),
    bullets: Array.isArray(slide.bullets) ? slide.bullets.slice(0, 5).map((item) => String(item).slice(0, 180)) : [],
    cards: Array.isArray(slide.cards) ? slide.cards.slice(0, 3).map((item) => ({
      title: String(item.title || '').slice(0, 80),
      text: String(item.text || '').slice(0, 180)
    })) : [],
    quote: String(slide.quote || '').slice(0, 240),
    attribution: String(slide.attribution || '').slice(0, 100),
    stats: Array.isArray(slide.stats) ? slide.stats.slice(0, 3).map((item) => ({
      value: String(item.value || '').slice(0, 30),
      label: String(item.label || '').slice(0, 80)
    })) : []
  }));

  if (slides.length < 3 || slides.length > 12 || slides.some((slide) => !slide.title)) {
    throw new Error('生成结果页数或标题不符合要求，请重试。');
  }
  return slides;
}

function extractJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('模型返回的内容不是有效 JSON。');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// 流式响应里逐字取出某个字符串字段，字段还没写完时返回已读到的部分。
function readPartialString(text, key) {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '');
  const match = new RegExp(`"${key}"\\s*:\\s*"`).exec(cleaned);
  if (!match) return null;
  const escapes = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };
  let out = '';
  for (let index = match.index + match[0].length; index < cleaned.length; index += 1) {
    const character = cleaned[index];
    if (character === '"') return out;
    if (character !== '\\') {
      out += character;
      continue;
    }
    const next = cleaned[index + 1];
    if (next === undefined) return out;
    if (next === 'u') {
      const hex = cleaned.slice(index + 2, index + 6);
      if (hex.length < 4) return out;
      out += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }
    out += escapes[next] ?? next;
    index += 1;
  }
  return out;
}

function makeDemoSlides(text) {
  const sentences = text.split(/(?<=[。！？.!?])\s*/).map((line) => line.trim()).filter(Boolean);
  const fallback = text.slice(0, 80);
  const highlights = sentences.length ? sentences : [fallback];
  const pick = (index) => highlights[index % highlights.length].slice(0, 110);
  const title = highlights[0].replace(/[。！？.!?].*$/u, '').slice(0, 24) || '洞察与行动';

  return [
    { type: 'cover', eyebrow: 'IDEAS, INTO MOTION', title, subtitle: '把一段文字，讲成一个清晰的故事。', body: pick(0) },
    { type: 'content', eyebrow: 'THE CONTEXT', title: '从背景开始，理解真正的问题', body: pick(1), bullets: [pick(2), pick(3)] },
    { type: 'cards', eyebrow: 'KEY INSIGHTS', title: '值得关注的三个重要发现', cards: [
      { title: '看见现状', text: pick(1) },
      { title: '找到机会', text: pick(2) },
      { title: '明确方向', text: pick(3) }
    ] },
    { type: 'quote', eyebrow: 'THE BIG IDEA', title: '把复杂的信息，变成清晰的共识', quote: pick(0), attribution: '从输入文案中提炼的核心观点' },
    { type: 'stats', eyebrow: 'WHAT MATTERS', title: '用重点，而不是更多重点', stats: [
      { value: '01', label: '理解问题' },
      { value: '02', label: '发现机会' },
      { value: '03', label: '采取行动' }
    ], body: pick(2) },
    { type: 'closing', eyebrow: 'NEXT CHAPTER', title: '从今天开始，让想法向前一步', subtitle: '方向已经清晰，接下来就是行动。', body: pick(3) }
  ];
}

async function readJsonConfig() {
  try {
    const parsed = JSON.parse(await readFile(resolveConfigPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function readLegacyKey() {
  try {
    const value = (await readFile(resolveLegacyKeyPath(), 'utf8')).trim();
    return value && !value.startsWith('#') ? value : '';
  } catch {
    return '';
  }
}

// 环境变量 > 本地设置文件 > api.txt，都没有时使用内置演示生成器。
async function resolveSettings() {
  const config = await readJsonConfig();
  let apiKey = process.env.OPENAI_API_KEY || String(config.apiKey || '').trim();
  let source = process.env.OPENAI_API_KEY ? 'env' : apiKey ? 'config' : '';
  if (!apiKey) {
    const legacy = await readLegacyKey();
    if (legacy) {
      apiKey = legacy;
      source = 'legacy';
    }
  }
  return {
    apiKey,
    source,
    envLocked: Boolean(process.env.OPENAI_API_KEY),
    baseUrl: String(process.env.OPENAI_BASE_URL || config.baseUrl || defaultBaseUrl).replace(/\/+$/, ''),
    model: String(process.env.OPENAI_MODEL || config.model || defaultModel).trim() || defaultModel
  };
}

async function saveSettings(payload) {
  const config = await readJsonConfig();
  const { apiKey, baseUrl, model } = payload;

  if (apiKey === null) delete config.apiKey;
  else if (typeof apiKey === 'string' && apiKey.trim()) config.apiKey = apiKey.trim();

  if (typeof baseUrl === 'string' && baseUrl.trim()) {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/.+/i.test(normalized)) throw new Error('接口地址需要以 http:// 或 https:// 开头。');
    config.baseUrl = normalized;
  }
  if (typeof model === 'string' && model.trim()) config.model = model.trim().slice(0, 120);

  const target = resolveConfigPath();
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBytes) throw new Error('请求内容过大，请缩短文案后重试。');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求格式无效，请重试。');
  }
}

function normalizeChatMessages(value) {
  if (!Array.isArray(value) || !value.length) throw new Error('请先输入你的想法。');
  const messages = value
    .slice(-maxChatTurns)
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: (typeof message?.content === 'string' ? message.content : '').slice(0, maxTurnChars)
    }))
    .filter((message) => message.content.trim());
  if (!messages.length) throw new Error('请先输入你的想法。');
  if (messages[messages.length - 1].role !== 'user') throw new Error('请先输入你的想法。');
  return messages;
}

// 写操作只接受本机回环页面发起的 JSON 请求，避免被外部网页操控。
function isTrustedWrite(request) {
  const host = String(request.headers.host || '');
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) return false;
  if (!String(request.headers['content-type'] || '').includes('application/json')) return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function callModel(messages, { temperature }, settings, signal) {
  const upstream = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.model, stream: true, temperature, messages })
  });
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 400);
    throw new Error(`模型服务请求失败（${upstream.status}）：${detail || upstream.statusText}`);
  }
  if (!upstream.body) throw new Error('模型服务没有返回可读取的流。');
  return upstream.body.getReader();
}

// 逐条读取上游 SSE，把增量文本交给 onDelta 处理。
async function pumpStream(reader, decoder, onDelta) {
  const textDecoder = decoder || new TextDecoder();
  const streamReader = reader;
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await streamReader.read();
      buffer += textDecoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) onDelta(delta);
      }
      if (done) break;
    }
  } finally {
    streamReader.releaseLock();
  }
}

async function streamSlides(text, settings, response, signal) {
  const reader = await callModel([
    {
      role: 'system',
      content: `你是一位优秀的中文演示文稿策划师。请根据用户文案改写为 5-8 页逻辑连贯、内容准确、文字精炼的网页演示幻灯片。仅返回合法 JSON，不要 Markdown 包裹，格式为 {"slides":${slideFields}}。第一页 type 必须为 cover，最后一页必须为 closing。`
    },
    { role: 'user', content: text }
  ], { temperature: 0.7 }, settings, signal);

  let content = '';
  await pumpStream(reader, null, (delta) => {
    content += delta;
    sendEvent(response, 'progress', {
      stage: 'writing',
      progress: Math.min(90, 28 + Math.floor(content.length / 35)),
      message: '正在逐页撰写演示内容'
    });
  });
  return normalizeSlides(extractJson(content).slides);
}

async function streamChat(messages, settings, response, signal) {
  const reader = await callModel([
    {
      role: 'system',
      content: `你是一位优秀的中文演示文稿策划师，正在和用户对话，帮他把想法打磨成一套网页演示幻灯片。
每次回复只输出一个 JSON 对象，不要用 Markdown 代码块包裹，格式为 {"reply":"给用户看的中文回复","slides":null}；当你准备出稿时，把 slides 换成幻灯片数组：${slideFields}
规则：
1. reply 是你对用户说的话，简洁、自然、有主见，不超过 120 字，不要提到 JSON 或字段名。
2. 如果主题、受众、页数或重点还不清楚，把 slides 设为 null，并在 reply 里问 1-2 个关键问题。
3. 信息足够时直接输出成套幻灯片，${slideRules}
4. 用户提出修改意见时，返回修改后的完整幻灯片数组，不要只返回改动部分，并在 reply 里说明改了什么。
5. 用户只是提问或闲聊时，把 slides 设为 null 并正常回答。`
    },
    ...messages
  ], { temperature: 0.6 }, settings, signal);

  let content = '';
  let lastSent = '';
  await pumpStream(reader, null, (delta) => {
    content += delta;
    const partial = readPartialString(content, 'reply');
    if (partial !== null && partial !== lastSent) {
      lastSent = partial;
      sendEvent(response, 'reply', { text: partial });
    }
  });

  let parsed = null;
  try {
    parsed = extractJson(content);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return { reply: content.trim().slice(0, 1500) || '我没有收到有效回复，请再试一次。', slides: null };
  }

  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim().slice(0, 1500) : '';
  let slides = null;
  let slideError = '';
  if (Array.isArray(parsed.slides) && parsed.slides.length) {
    try {
      slides = normalizeSlides(parsed.slides);
    } catch (error) {
      slideError = error.message;
    }
  }

  if (reply) return { reply, slides };
  if (slides) return { reply: '这一版演示已经整理好了，看看右侧的预览。', slides };
  if (slideError) return { reply: `这一版幻灯片没排好（${slideError}），请让我重新生成一次。`, slides: null };
  return { reply: '我这边没有生成内容，请再说得具体一些。', slides: null };
}

async function streamDemoChat(messages, response) {
  const steps = ['正在理解你的需求', '正在提炼核心观点', '正在组织故事结构', '正在润色每一页'];
  for (let index = 0; index < steps.length; index += 1) {
    await delay(260);
    sendEvent(response, 'progress', { message: steps[index], progress: 10 + index * 18 });
  }
  const reply = '我已经根据你的描述排好一版草稿，可以继续说「把第 2 页改得更简短」这样的要求来调整。';
  for (let index = 3; index <= reply.length + 3; index += 3) {
    sendEvent(response, 'reply', { text: reply.slice(0, index) });
    await delay(26);
  }
  const text = messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n');
  return { reply, slides: makeDemoSlides(text) };
}

function openEventStream(response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  response.flushHeaders();
}

export function createAppServer() {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;

    if (pathname === '/api/health' && request.method === 'GET') {
      const settings = await resolveSettings();
      sendJson(response, 200, {
        status: 'ok',
        mode: settings.apiKey ? 'model' : 'demo',
        model: settings.model,
        source: settings.source || 'demo'
      });
      return;
    }

    if (pathname === '/api/settings' && request.method === 'GET') {
      const settings = await resolveSettings();
      sendJson(response, 200, {
        hasApiKey: Boolean(settings.apiKey),
        baseUrl: settings.baseUrl,
        model: settings.model,
        source: settings.source || 'demo',
        envLocked: settings.envLocked,
        configPath: resolveConfigPath()
      });
      return;
    }

    if (pathname === '/api/settings' && request.method === 'POST') {
      if (!isTrustedWrite(request)) {
        sendJson(response, 403, { error: '请求来源不可信。' });
        return;
      }
      try {
        const body = await readJsonBody(request);
        await saveSettings(body);
        const settings = await resolveSettings();
        sendJson(response, 200, {
          hasApiKey: Boolean(settings.apiKey),
          baseUrl: settings.baseUrl,
          model: settings.model,
          source: settings.source || 'demo',
          envLocked: settings.envLocked,
          configPath: resolveConfigPath()
        });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }

    if (pathname === '/api/settings/test' && request.method === 'POST') {
      if (!isTrustedWrite(request)) {
        sendJson(response, 403, { error: '请求来源不可信。' });
        return;
      }
      try {
        const body = await readJsonBody(request);
        const current = await resolveSettings();
        const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) || current.apiKey;
        const baseUrl = String(body.baseUrl || current.baseUrl).replace(/\/+$/, '');
        const model = String(body.model || current.model).trim();
        if (!apiKey) throw new Error('请先填写 API 密钥。');
        if (!/^https?:\/\/.+/i.test(baseUrl)) throw new Error('接口地址需要以 http:// 或 https:// 开头。');
        const upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: AbortSignal.timeout(25000),
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
        });
        if (!upstream.ok) {
          const detail = (await upstream.text()).slice(0, 300);
          sendJson(response, 200, { ok: false, error: `模型服务返回 ${upstream.status}：${detail || upstream.statusText}` });
          return;
        }
        sendJson(response, 200, { ok: true, message: `${model} 连接成功。` });
      } catch (error) {
        sendJson(response, 200, { ok: false, error: error.message });
      }
      return;
    }

    if (pathname === '/api/generate' && request.method === 'POST') {
      if (!isTrustedWrite(request)) {
        sendJson(response, 403, { error: '请求来源不可信。' });
        return;
      }
      let text;
      try {
        const body = await readJsonBody(request);
        if (typeof body.text !== 'string' || body.text.trim().length < 40) {
          throw new Error('请粘贴至少 40 个字的文案，再开始生成。');
        }
        if (body.text.length > 20000) throw new Error('文案最多支持 20,000 个字符，请缩短后重试。');
        text = body.text.trim();
      } catch (error) {
        sendJson(response, error.message.startsWith('请求内容过大') ? 413 : 400, { error: error.message });
        return;
      }
      openEventStream(response);
      const controller = new AbortController();
      response.on('close', () => {
        if (!response.writableEnded) controller.abort();
      });
      sendEvent(response, 'progress', { stage: 'reading', progress: 8, message: '已收到文案，开始分析' });
      try {
        const settings = await resolveSettings();
        let slides;
        if (settings.apiKey) {
          slides = await streamSlides(text, settings, response, controller.signal);
        } else {
          slides = makeDemoSlides(text);
          for (let index = 1; index <= 4; index += 1) {
            await delay(320);
            sendEvent(response, 'progress', { stage: 'outlining', progress: index * 15, message: ['正在阅读文案', '正在提炼核心观点', '正在组织故事结构', '正在润色每一页'][index - 1] });
          }
        }
        if (!response.destroyed) {
          sendEvent(response, 'complete', { slides });
          response.end();
        }
      } catch (error) {
        if (!response.destroyed) {
          sendEvent(response, 'error', { message: error.name === 'AbortError' ? '生成请求已取消。' : error.message });
          response.end();
        }
      }
      return;
    }

    if (pathname === '/api/chat' && request.method === 'POST') {
      if (!isTrustedWrite(request)) {
        sendJson(response, 403, { error: '请求来源不可信。' });
        return;
      }
      let messages;
      try {
        const body = await readJsonBody(request);
        messages = normalizeChatMessages(body.messages);
      } catch (error) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      openEventStream(response);
      const controller = new AbortController();
      response.on('close', () => {
        if (!response.writableEnded) controller.abort();
      });
      sendEvent(response, 'progress', { stage: 'reading', progress: 6, message: '正在理解你的需求' });
      try {
        const settings = await resolveSettings();
        const result = settings.apiKey
          ? await streamChat(messages, settings, response, controller.signal)
          : await streamDemoChat(messages, response);
        if (!response.destroyed) {
          sendEvent(response, 'complete', result);
          response.end();
        }
      } catch (error) {
        if (!response.destroyed) {
          sendEvent(response, 'error', { message: error.name === 'AbortError' ? '对话已取消。' : error.message });
          response.end();
        }
      }
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: '不支持此请求方法。' });
      return;
    }

    const filePath = pathname === '/' ? resolve(root, 'index.html') : resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!filePath.startsWith(`${root}${sep}`) && filePath !== resolve(root, 'index.html')) {
      sendJson(response, 403, { error: '禁止访问此路径。' });
      return;
    }
    const secretPaths = [resolveConfigPath(), resolveLegacyKeyPath()].map((secret) => secret.toLowerCase());
    const isSecret = secretPaths.includes(filePath.toLowerCase())
      || ['config.json', 'api.txt'].includes(basename(filePath).toLowerCase());
    if (isSecret) {
      sendJson(response, 404, { error: '页面不存在。' });
      return;
    }
    try {
      const file = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      response.end(request.method === 'HEAD' ? undefined : file);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') {
        sendJson(response, 404, { error: '页面不存在。' });
        return;
      }
      sendJson(response, 500, { error: '读取页面失败。' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createAppServer();
  server.listen(port, '127.0.0.1', async () => {
    const settings = await resolveSettings();
    console.log(`AI 网页 PPT 生成器已启动：http://127.0.0.1:${port}`);
    console.log(`生成模式：${settings.apiKey ? `真实模型（${settings.model}，来源：${settings.source}）` : '内置演示生成器'}`);
    console.log(`本地设置文件：${resolveConfigPath()}`);
  });
}
