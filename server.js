import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const maxRequestBytes = 64 * 1024;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendEvent(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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

async function streamModel(text, response, signal) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const slides = makeDemoSlides(text);
    for (let index = 1; index <= 4; index += 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 320));
      sendEvent(response, 'progress', { stage: 'outlining', progress: index * 15, message: ['正在阅读文案', '正在提炼核心观点', '正在组织故事结构', '正在润色每一页'][index - 1] });
    }
    return slides;
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: '你是一位优秀的中文演示文稿策划师。请根据用户文案改写为 5-8 页逻辑连贯、内容准确、文字精炼的网页演示幻灯片。仅返回合法 JSON，不要 Markdown 包裹，格式为 {"slides":[{"type":"cover|content|cards|quote|stats|closing","eyebrow":"短英文标签","title":"标题","subtitle":"副标题","body":"简短说明","bullets":["要点"],"cards":[{"title":"卡片标题","text":"解释"}],"quote":"引用","attribution":"来源","stats":[{"value":"数值","label":"说明"}]}]}。第一页 type 必须为 cover，最后一页必须为 closing。'
        },
        { role: 'user', content: text }
      ]
    })
  });

  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 400);
    throw new Error(`模型服务请求失败（${upstream.status}）：${detail || upstream.statusText}`);
  }
  if (!upstream.body) throw new Error('模型服务没有返回可读取的流。');

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
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
        if (typeof delta === 'string') {
          content += delta;
          sendEvent(response, 'progress', {
            stage: 'writing',
            progress: Math.min(90, 28 + Math.floor(content.length / 35)),
            message: '正在逐页撰写演示内容'
          });
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }

  const result = extractJson(content);
  return normalizeSlides(result.slides);
}

async function readRequest(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBytes) throw new Error('请求内容过大，请缩短文案后重试。');
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求格式无效，请重试。');
  }
  if (typeof body.text !== 'string' || body.text.trim().length < 40) {
    throw new Error('请粘贴至少 40 个字的文案，再开始生成。');
  }
  if (body.text.length > 20000) throw new Error('文案最多支持 20,000 个字符，请缩短后重试。');
  return body.text.trim();
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': mimeTypes['.json'], 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok', mode: process.env.OPENAI_API_KEY ? 'model' : 'demo' });
    return;
  }
  if (pathname === '/api/generate' && request.method === 'POST') {
    let text;
    try {
      text = await readRequest(request);
    } catch (error) {
      sendJson(response, error.message.startsWith('请求内容过大') ? 413 : 400, { error: error.message });
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    response.flushHeaders();
    const controller = new AbortController();
    response.on('close', () => {
      if (!response.writableEnded) controller.abort();
    });
    sendEvent(response, 'progress', { stage: 'reading', progress: 8, message: '已收到文案，开始分析' });
    try {
      const slides = await streamModel(text, response, controller.signal);
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
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: '不支持此请求方法。' });
    return;
  }

  let filePath = pathname === '/' ? resolve(root, 'index.html') : resolve(root, `.${decodeURIComponent(pathname)}`);
  if (!filePath.startsWith(`${root}${sep}`) && filePath !== resolve(root, 'index.html')) {
    sendJson(response, 403, { error: '禁止访问此路径。' });
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

server.listen(port, () => {
  console.log(`AI 网页 PPT 生成器已启动：http://localhost:${port}`);
});
