const sampleText = `很多团队已经开始使用人工智能，但真正的挑战不是如何获得工具，而是如何让它们解决真实的问题。一次成功的转型，首先来自清晰的目标：找到重复耗时、影响体验、又适合自动化的环节。

从客户服务到内部知识管理，从数据分析到内容创作，AI 已经展示出把复杂工作变简单的潜力。但技术本身并不会自动带来改变。团队需要重新设计工作流程，让人和智能工具协同，而不是把旧流程原封不动地搬到新工具里。

推动转型需要三个步骤。第一，选择一个具体、重要且可以衡量的场景，用小规模试点验证效果。第二，让一线员工参与设计和改进，帮助他们掌握新工具，把经验沉淀成组织能力。第三，持续衡量质量、效率和客户反馈，根据真实数据扩大有效实践。

在试点过程中，要关注的不只是速度，还包括准确性、安全性、员工体验和客户满意度。清晰的治理规则与人工审核机制，可以帮助团队在创新与信任之间找到平衡。

AI 转型不是一场短暂的技术项目，而是不断学习、持续改善的过程。成功的团队会从业务目标出发，先解决一个真实问题，再把有效的方法推广到更多场景。`;

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
const toast = document.querySelector('#toast');

let slides = [];
let slideIndex = 0;
let toastTimer;
let controller;

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

function updateProgress(progress, message) {
  const value = Math.max(0, Math.min(100, progress));
  progressFill.style.width = `${value}%`;
  progressValue.textContent = `${value}%`;
  progressMessage.textContent = message;
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
    if (!response.body) throw new Error('浏览器无法读取流式响应，请更新浏览器后重试。');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const eventText of events) {
        const eventName = eventText.match(/^event:\s*(.+)$/m)?.[1]?.trim();
        const dataText = eventText.match(/^data:\s*(.+)$/m)?.[1];
        if (!eventName || !dataText) continue;
        const data = JSON.parse(dataText);
        if (eventName === 'progress') updateProgress(data.progress, data.message);
        if (eventName === 'error') throw new Error(data.message || '生成失败，请重试。');
        if (eventName === 'complete') {
          slides = data.slides;
          slideIndex = 0;
          renderSlide();
          document.querySelector('#deckName').textContent = slides[0].title;
          document.querySelector('#deckMeta').textContent = `AI 为你整理 · 共 ${slides.length} 页`;
          updateProgress(100, '演示文稿已准备就绪');
          exportButton.disabled = false;
          fullscreenButton.disabled = false;
          document.querySelector('#engineLabel').textContent = '演示引擎就绪';
          showToast('演示文稿生成完成，故事准备好开始了。');
          finished = true;
        }
      }
      if (done) break;
    }
    if (!slides.length) throw new Error('连接已结束，但没有收到演示内容，请再试一次。');
  } catch (error) {
    if (error.name !== 'AbortError') {
      showToast(error.message || '生成失败，请检查网络后重试。', true);
      updateProgress(0, error.message || '生成失败，请重试');
    }
  } finally {
    generateButton.disabled = false;
    generateLabel.textContent = '重新生成 PPT';
    controller = null;
  }
}

function changeSlide(direction) {
  if (!slides.length) return;
  slideIndex = Math.max(0, Math.min(slides.length - 1, slideIndex + direction));
  renderSlide();
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
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    generateDeck();
    return;
  }
  if (event.target === sourceText || event.target instanceof HTMLTextAreaElement || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); changeSlide(1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); changeSlide(-1); }
  if (event.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
});

fetch('/api/health').then((response) => response.json()).then((health) => {
  if (health.mode === 'demo') document.querySelector('#engineLabel').textContent = '演示模式 · 无需 API Key';
}).catch(() => {
  document.querySelector('#engineLabel').textContent = '等待本地服务连接';
});
