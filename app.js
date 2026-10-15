const sampleText = `很多团队已经开始使用人工智能，但真正的挑战不是如何获得工具，而是如何让它们解决真实的问题。一次成功的转型，首先来自清晰的目标：找到重复耗时、影响体验、又适合自动化的环节。

从客户服务到内部知识管理，从数据分析到内容创作，AI 已经展示出把复杂工作变简单的潜力。但技术本身并不会自动带来改变。团队需要重新设计工作流程，让人和智能工具协同，而不是把旧流程原封不动地搬到新工具里。

推动转型需要三个步骤。第一，选择一个具体、重要且可以衡量的场景，用小规模试点验证效果。第二，让一线员工参与设计和改进，帮助他们掌握新工具，把经验沉淀成组织能力。第三，持续衡量质量、效率和客户反馈，根据真实数据扩大有效实践。

在试点过程中，要关注的不只是速度，还包括准确性、安全性、员工体验和客户满意度。清晰的治理规则与人工审核机制，可以帮助团队在创新与信任之间找到平衡。

AI 转型不是一场短暂的技术项目，而是不断学习、持续改善的过程。成功的团队会从业务目标出发，先解决一个真实问题，再把有效的方法推广到更多场景。`;

const chatSamples = [
  '帮我做一份 6 页的新产品发布会演示',
  '把「AI 客服到底值不值得投入」讲给管理层听',
  '用 5 页讲清楚我们为什么需要数据治理'
];

const sourceText = document.querySelector('#sourceText');
const charCount = document.querySelector('#charCount');
const generateButton = document.querySelector('#generateButton');
const generateLabel = document.querySelector('#generateLabel');
const generationStatus = document.querySelector('#generationStatus');
const progressMessage = document.querySelector('#progressMessage');
const progressValue = document.querySelector('#progressValue');
const progressFill = document.querySelector('#progressFill');
const stage = document.querySelector('#presentationStage');
const slideCanvas = document.querySelector('#slideCanvas');
const emptyState = document.querySelector('#emptyState');
const currentPage = document.querySelector('#currentPage');
const totalPages = document.querySelector('#totalPages');
const previousButton = document.querySelector('#previousButton');
const nextButton = document.querySelector('#nextButton');
const exportButton = document.querySelector('#exportButton');
const fullscreenButton = document.querySelector('#fullscreenButton');
const engineLabel = document.querySelector('#engineLabel');
const quickHint = document.querySelector('#quickHint');
const toast = document.querySelector('#toast');

const textModePanel = document.querySelector('#textModePanel');
const chatModePanel = document.querySelector('#chatModePanel');
const chatLog = document.querySelector('#chatLog');
const chatInput = document.querySelector('#chatInput');
const chatSendButton = document.querySelector('#chatSendButton');
const chatTurnCount = document.querySelector('#chatTurnCount');

const settingsModal = document.querySelector('#settingsModal');
const settingsKeyInput = document.querySelector('#settingsKeyInput');
const settingsUrlInput = document.querySelector('#settingsUrlInput');
const settingsModelInput = document.querySelector('#settingsModelInput');
const settingsKeyState = document.querySelector('#settingsKeyState');
const settingsStatus = document.querySelector('#settingsStatus');
const settingsSaveButton = document.querySelector('#settingsSaveButton');
const settingsTestButton = document.querySelector('#settingsTestButton');

let slides = [];
let slideIndex = 0;
let toastTimer;
let controller;
let chatController;
let chatMessages = [];
let chatBusy = false;
let currentMode = 'text';
let settingsBusy = false;

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3400);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function renderSlide() {
  if (!slides.length) return;
  const slide = slides[slideIndex];
  const bullets = slide.bullets?.length ? `<ul class="slide-bullets">${slide.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  const cards = slide.cards?.length ? `<div class="slide-cards">${slide.cards.map((card) => `<section class="slide-card"><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.text)}</p></section>`).join('')}</div>` : '';
  const quote = slide.quote ? `<blockquote class="slide-quote">${escapeHtml(slide.quote)}</blockquote><p class="slide-attribution">${escapeHtml(slide.attribution)}</p>` : '';
  const stats = slide.stats?.length ? `<div class="slide-stats">${slide.stats.map((stat) => `<div class="slide-stat"><strong>${escapeHtml(stat.value)}</strong><span>${escapeHtml(stat.label)}</span></div>`).join('')}</div>` : '';
  slideCanvas.innerHTML = `
    <p class="slide-eyebrow">${escapeHtml(slide.eyebrow || 'A STORY IN MOTION')}</p>
    <h2 class="slide-title">${escapeHtml(slide.title)}</h2>
    ${slide.subtitle ? `<p class="slide-subtitle">${escapeHtml(slide.subtitle)}</p>` : ''}
    ${slide.body ? '<div class="slide-rule"></div>' : ''}
    ${slide.body ? `<p class="slide-body">${escapeHtml(slide.body)}</p>` : ''}
    ${bullets}${cards}${quote}${stats}`;
  slideCanvas.className = `slide-canvas type-${slide.type || 'content'}`;
  emptyState.hidden = true;
  slideCanvas.hidden = false;
  currentPage.textContent = String(slideIndex + 1).padStart(2, '0');
  totalPages.textContent = String(slides.length).padStart(2, '0');
  previousButton.disabled = slideIndex === 0;
  nextButton.disabled = slideIndex === slides.length - 1;
  document.querySelector('#slideHint').textContent = `${slide.eyebrow || '正在演示'} · ${slide.title}`;
}

function applyDeck(nextSlides, meta) {
  slides = nextSlides;
  slideIndex = 0;
  renderSlide();
  document.querySelector('#deckName').textContent = slides[0].title;
  document.querySelector('#deckMeta').textContent = meta;
  exportButton.disabled = false;
  fullscreenButton.disabled = false;
}

function updateProgress(progress, message) {
  const value = Math.max(0, Math.min(100, progress));
  progressFill.style.width = `${value}%`;
  progressValue.textContent = `${value}%`;
  progressMessage.textContent = message;
}

function changeSlide(direction) {
  if (!slides.length) return;
  slideIndex = Math.max(0, Math.min(slides.length - 1, slideIndex + direction));
  renderSlide();
}

// 逐个解析服务端发送的 SSE 事件。
async function readEventStream(response, onEvent) {
  if (!response.body) throw new Error('浏览器无法读取流式响应，请更新浏览器后重试。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const eventText of events) {
      const eventName = eventText.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const dataText = eventText.match(/^data:\s*(.+)$/m)?.[1];
      if (!eventName || !dataText) continue;
      onEvent(eventName, JSON.parse(dataText));
    }
    if (done) break;
  }
}

async function generateDeck() {
  const text = sourceText.value.trim();
  if (text.length < 40) {
    showToast('请先粘贴至少 40 个字的文案。', true);
    sourceText.focus();
    return;
  }
  controller?.abort();
  controller = new AbortController();
  generateButton.disabled = true;
  generateLabel.textContent = '正在生成…';
  generationStatus.hidden = false;
  updateProgress(5, '正在连接 AI 生成引擎');
  let received = false;
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `生成请求失败（${response.status}）`);
    }
    await readEventStream(response, (eventName, data) => {
      if (eventName === 'progress') updateProgress(data.progress, data.message);
      if (eventName === 'error') throw new Error(data.message || '生成失败，请重试。');
      if (eventName === 'complete') {
        received = true;
        applyDeck(data.slides, `AI 为你整理 · 共 ${data.slides.length} 页`);
        updateProgress(100, '演示文稿已准备就绪');
        showToast('演示文稿生成完成，故事准备好开始了。');
      }
    });
    if (!received) throw new Error('连接已结束，但没有收到演示内容，请再试一次。');
  } catch (error) {
    if (error.name !== 'AbortError') {
      showToast(error.message || '生成失败，请检查网络后重试。', true);
      updateProgress(0, error.message || '生成失败，请重试');
    }
  } finally {
    generateButton.disabled = false;
    generateLabel.textContent = slides.length ? '重新生成 PPT' : '生成我的 PPT';
    controller = null;
  }
}

function chatHistory() {
  return chatMessages
    .filter((message) => !message.pending)
    .map((message) => ({
      role: message.role,
      content: message.role === 'assistant'
        ? JSON.stringify({ reply: message.text, slides: message.slides || null })
        : message.text
    }));
}

function renderChat() {
  if (!chatMessages.length) {
    chatLog.innerHTML = `<div class="chat-empty">
      <p class="chat-empty-title">先说说你想要什么演示</p>
      <div class="chat-samples">${chatSamples.map((sample) => `<button class="chat-sample" type="button" data-sample="${escapeHtml(sample)}">${escapeHtml(sample)}</button>`).join('')}</div>
    </div>`;
    chatTurnCount.textContent = '0';
    return;
  }
  chatLog.innerHTML = chatMessages.map((message) => {
    const classes = ['chat-row', message.role === 'user' ? 'from-user' : 'from-ai'];
    if (message.pending) classes.push('is-pending');
    if (message.error) classes.push('is-error');
    const text = message.text || (message.pending ? message.stage || '正在思考' : '');
    const deckNote = message.slides?.length ? `<span class="chat-deck">已更新演示 · ${message.slides.length} 页</span>` : '';
    return `<div class="${classes.join(' ')}">
      <div class="chat-bubble">${escapeHtml(text)}${message.pending ? '<span class="chat-caret"></span>' : ''}</div>
      ${deckNote}
    </div>`;
  }).join('');
  chatLog.scrollTop = chatLog.scrollHeight;
  chatTurnCount.textContent = String(chatMessages.filter((message) => !message.pending).length);
}

function updateChatControls() {
  chatSendButton.disabled = chatBusy;
  chatInput.disabled = chatBusy;
  chatSendButton.classList.toggle('is-busy', chatBusy);
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) {
    showToast('先写下你的想法。', true);
    chatInput.focus();
    return;
  }
  if (chatBusy) return;

  chatMessages.push({ role: 'user', text });
  const payload = chatHistory();
  const assistantMessage = { role: 'assistant', text: '', stage: '', pending: true, slides: null };
  chatMessages.push(assistantMessage);
  chatInput.value = '';
  autoGrowChatInput();
  chatBusy = true;
  renderChat();
  updateChatControls();

  chatController?.abort();
  chatController = new AbortController();
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages: payload }),
      signal: chatController.signal
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `对话请求失败（${response.status}）`);
    }
    let answered = false;
    await readEventStream(response, (eventName, data) => {
      if (eventName === 'progress') {
        assistantMessage.stage = data.message || '';
        renderChat();
      }
      if (eventName === 'reply') {
        assistantMessage.text = data.text || '';
        renderChat();
      }
      if (eventName === 'error') throw new Error(data.message || '对话失败，请重试。');
      if (eventName === 'complete') {
        answered = true;
        assistantMessage.pending = false;
        assistantMessage.text = data.reply || assistantMessage.text || '我没有收到有效回复。';
        if (Array.isArray(data.slides) && data.slides.length) {
          assistantMessage.slides = data.slides;
          applyDeck(data.slides, `对话生成 · 共 ${data.slides.length} 页`);
          showToast('演示已根据对话更新。');
        }
      }
    });
    if (!answered) {
      assistantMessage.pending = false;
      assistantMessage.text = assistantMessage.text || '连接中断了，请再试一次。';
      assistantMessage.error = true;
    }
    renderChat();
  } catch (error) {
    if (error.name !== 'AbortError') {
      assistantMessage.pending = false;
      assistantMessage.text = error.message || '对话失败，请检查模型设置后重试。';
      assistantMessage.error = true;
      renderChat();
      showToast(error.message || '对话失败，请重试。', true);
    } else {
      chatMessages = chatMessages.filter((message) => message !== assistantMessage);
      renderChat();
    }
  } finally {
    chatBusy = false;
    updateChatControls();
    chatController = null;
    chatInput.focus();
  }
}

function autoGrowChatInput() {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 112)}px`;
}

function resetChat() {
  chatController?.abort();
  chatMessages = [];
  chatBusy = false;
  updateChatControls();
  renderChat();
  chatInput.focus();
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  textModePanel.hidden = mode !== 'text';
  chatModePanel.hidden = mode !== 'chat';
  quickHint.innerHTML = mode === 'chat' ? '<kbd>Enter</kbd> 发送' : '<kbd>⌘</kbd> <kbd>↵</kbd> 快速生成';
  (mode === 'chat' ? chatInput : sourceText).focus();
}

function openSettings() {
  settingsModal.hidden = false;
  settingsModal.classList.add('visible');
  loadSettings();
  settingsKeyInput.focus();
}

function closeSettings() {
  settingsModal.classList.remove('visible');
  settingsModal.hidden = true;
}

function describeSettings(data) {
  const source = {
    env: '密钥来自环境变量 OPENAI_API_KEY',
    config: '设置已保存在本机',
    legacy: '密钥来自项目里的 api.txt',
    demo: '还没配置密钥，当前使用内置演示生成器'
  }[data.source] || '';
  return `${source} · 配置文件 ${data.configPath}`;
}

async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    const data = await response.json();
    settingsUrlInput.value = data.baseUrl || '';
    settingsModelInput.value = data.model || '';
    settingsKeyInput.value = '';
    settingsKeyInput.placeholder = data.hasApiKey ? '已保存，留空表示不修改' : 'sk-…';
    settingsKeyState.textContent = data.hasApiKey ? '已配置' : '未配置';
    settingsStatus.textContent = describeSettings(data);
  } catch {
    settingsStatus.textContent = '读取设置失败，请确认本地服务正在运行。';
  }
}

async function saveSettings() {
  if (settingsBusy) return;
  const payload = {
    baseUrl: settingsUrlInput.value.trim(),
    model: settingsModelInput.value.trim()
  };
  if (settingsKeyInput.value.trim()) payload.apiKey = settingsKeyInput.value.trim();
  settingsBusy = true;
  settingsSaveButton.disabled = true;
  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '保存失败，请检查填写内容。');
    settingsUrlInput.value = data.baseUrl || '';
    settingsModelInput.value = data.model || '';
    settingsKeyInput.value = '';
    settingsKeyInput.placeholder = data.hasApiKey ? '已保存，留空表示不修改' : 'sk-…';
    settingsKeyState.textContent = data.hasApiKey ? '已配置' : '未配置';
    settingsStatus.textContent = describeSettings(data);
    await refreshHealth();
    showToast('模型设置已保存。');
    closeSettings();
  } catch (error) {
    showToast(error.message || '保存失败。', true);
    settingsStatus.textContent = error.message || '保存失败。';
  } finally {
    settingsBusy = false;
    settingsSaveButton.disabled = false;
  }
}

async function testSettings() {
  if (settingsBusy) return;
  settingsBusy = true;
  settingsTestButton.disabled = true;
  settingsTestButton.textContent = '正在测试…';
  try {
    const response = await fetch('/api/settings/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: settingsKeyInput.value.trim(),
        baseUrl: settingsUrlInput.value.trim(),
        model: settingsModelInput.value.trim()
      })
    });
    const data = await response.json();
    if (data.ok) {
      settingsStatus.textContent = data.message || '连接成功。';
      showToast(data.message || '连接成功。');
    } else {
      settingsStatus.textContent = data.error || '连接失败。';
      showToast(data.error || '连接失败。', true);
    }
  } catch (error) {
    settingsStatus.textContent = error.message || '连接失败。';
    showToast(error.message || '连接失败。', true);
  } finally {
    settingsBusy = false;
    settingsTestButton.disabled = false;
    settingsTestButton.textContent = '测试连接';
  }
}

async function refreshHealth() {
  try {
    const health = await (await fetch('/api/health')).json();
    if (health.mode === 'model') {
      engineLabel.textContent = `${health.model} · ${health.source === 'env' ? '环境变量' : '已连接'}`;
    } else {
      engineLabel.textContent = '演示模式 · 无需 API Key';
    }
  } catch {
    engineLabel.textContent = '等待本地服务连接';
  }
}

function buildExportHtml() {
  const slidesJson = JSON.stringify(slides).replace(/</g, '\\u003c');
  const theme = stage.dataset.theme;
  const exportedStyles = [...document.styleSheets]
    .flatMap((sheet) => {
      try { return [...sheet.cssRules].map((rule) => rule.cssText); }
      catch { return []; }
    })
    .join('\n');
  const safeStyles = exportedStyles.replace(/<\/style/gi, '<\\/style');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(slides[0].title)} — 演示文稿</title><style>
*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:#171917;color:#f7f4ec;font-family:Arial,"Noto Sans SC",sans-serif}.deck{width:min(1200px,100%)}.presentation-stage{width:100%;min-height:62vw;max-height:78vh;aspect-ratio:1.39;border-radius:10px}.slide-canvas{inset-bottom:0!important}.stage-footer{height:48px}.deck-nav{display:flex;align-items:center;justify-content:space-between;padding:14px 3px;color:#ccc;font-size:13px}.deck-nav button{padding:9px 15px;border:1px solid #555;border-radius:7px;background:#292c29;color:#fff;cursor:pointer}@media(max-width:600px){body{padding:12px}.presentation-stage{min-height:66vw;aspect-ratio:1.08}.deck-nav button{padding:8px 10px}}${safeStyles}</style></head>
<body><main class="deck"><section class="presentation-stage" data-theme="${theme}"><div class="stage-grain"></div><article class="slide-canvas"></article><footer class="stage-footer"><span class="slide-counter"><span id="currentPage"></span><span class="counter-divider">/</span><span id="totalPages"></span></span><span>← → 切换页面 · F 全屏</span></footer></section><nav class="deck-nav"><button id="prev">← 上一页</button><span id="title"></span><button id="next">下一页 →</button></nav></main>
<script>const slides=${slidesJson};let i=0;const stage=document.querySelector('.presentation-stage'),canvas=document.querySelector('.slide-canvas');function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function draw(){const s=slides[i];canvas.className='slide-canvas type-'+(s.type||'content');canvas.innerHTML='<p class="slide-eyebrow">'+esc(s.eyebrow)+'</p><h2 class="slide-title">'+esc(s.title)+'</h2>'+(s.subtitle?'<p class="slide-subtitle">'+esc(s.subtitle)+'</p>':'')+(s.body?'<div class="slide-rule"></div><p class="slide-body">'+esc(s.body)+'</p>':'')+(s.bullets?.length?'<ul class="slide-bullets">'+s.bullets.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+(s.cards?.length?'<div class="slide-cards">'+s.cards.map(x=>'<section class="slide-card"><h3>'+esc(x.title)+'</h3><p>'+esc(x.text)+'</p></section>').join('')+'</div>':'')+(s.quote?'<blockquote class="slide-quote">'+esc(s.quote)+'</blockquote><p class="slide-attribution">'+esc(s.attribution)+'</p>':'')+(s.stats?.length?'<div class="slide-stats">'+s.stats.map(x=>'<div class="slide-stat"><strong>'+esc(x.value)+'</strong><span>'+esc(x.label)+'</span></div>').join('')+'</div>':'');document.querySelector('#currentPage').textContent=String(i+1).padStart(2,'0');document.querySelector('#totalPages').textContent=String(slides.length).padStart(2,'0');document.querySelector('#title').textContent=s.title;document.querySelector('#prev').disabled=i===0;document.querySelector('#next').disabled=i===slides.length-1}function move(d){i=Math.max(0,Math.min(slides.length-1,i+d));draw()}document.querySelector('#prev').onclick=()=>move(-1);document.querySelector('#next').onclick=()=>move(1);document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();move(1)}if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}if(e.key.toLowerCase()==='f')document.documentElement.requestFullscreen?.()});draw();</script></body></html>`;
}

document.querySelector('#sampleButton').addEventListener('click', () => {
  sourceText.value = sampleText;
  charCount.textContent = `${sourceText.value.length.toLocaleString()} / 20,000`;
  sourceText.focus();
});
sourceText.addEventListener('input', () => { charCount.textContent = `${sourceText.value.length.toLocaleString()} / 20,000`; });
generateButton.addEventListener('click', generateDeck);
previousButton.addEventListener('click', () => changeSlide(-1));
nextButton.addEventListener('click', () => changeSlide(1));
document.querySelectorAll('[data-theme-choice]').forEach((button) => button.addEventListener('click', () => {
  stage.dataset.theme = button.dataset.themeChoice;
  document.querySelectorAll('[data-theme-choice]').forEach((choice) => {
    const selected = choice === button;
    choice.classList.toggle('active', selected);
    choice.setAttribute('aria-pressed', String(selected));
  });
}));
fullscreenButton.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await stage.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    showToast('无法启动全屏，请检查浏览器权限。', true);
  }
});
exportButton.addEventListener('click', () => {
  if (!slides.length) return;
  const blob = new Blob([buildExportHtml()], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slides[0].title.replace(/[\\/:*?"<>|]/g, '').slice(0, 50) || 'ai-presentation'}.html`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('已导出独立 HTML，可以离线打开与演示。');
});

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
chatLog.addEventListener('click', (event) => {
  const sample = event.target.closest('[data-sample]');
  if (!sample) return;
  chatInput.value = sample.dataset.sample;
  autoGrowChatInput();
  chatInput.focus();
});
chatSendButton.addEventListener('click', sendChat);
document.querySelector('#chatResetButton').addEventListener('click', resetChat);
chatInput.addEventListener('input', autoGrowChatInput);
chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendChat();
  }
});

document.querySelector('#settingsButton').addEventListener('click', openSettings);
document.querySelector('#settingsCloseButton').addEventListener('click', closeSettings);
settingsSaveButton.addEventListener('click', saveSettings);
settingsTestButton.addEventListener('click', testSettings);
settingsModal.addEventListener('click', (event) => {
  if (event.target === settingsModal) closeSettings();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !settingsModal.hidden) {
    closeSettings();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    if (currentMode === 'chat') sendChat();
    else generateDeck();
    return;
  }
  if (event.target === sourceText || event.target instanceof HTMLTextAreaElement || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); changeSlide(1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); changeSlide(-1); }
  if (event.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
});

setMode('text');
chatInput.style.height = '40px';
renderChat();
refreshHealth();
loadSettings();
