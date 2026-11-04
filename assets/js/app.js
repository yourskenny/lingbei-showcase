/* 零杯 2026 作品展 · 索引、筛选与详情
   纯静态 ES module。数据只读自 data/works.json。 */

const DATA_URL = 'data/works.json';

const ROOMS = {
  shijing: { label: '市井烟火', full: '市井烟火 · 百味人间', numeral: '壹', hall: '第一厅' },
  jiangxin: { label: '匠心传成', full: '匠心传成，非遗焕新', numeral: '贰', hall: '第二厅' },
  changzheng: { label: '长征万里', full: '长征万里，薪火千秋', numeral: '叁', hall: '第三厅' }
};

const state = {
  works: [],
  meta: null,
  filter: 'all',
  query: '',
  onlineOnly: false,
  sort: 'curated',
  lastFocus: null
};

const el = {
  grid: document.getElementById('work-grid'),
  tally: document.getElementById('tally'),
  resultInfo: document.getElementById('result-info'),
  search: document.getElementById('search'),
  searchWrap: document.getElementById('search-wrap'),
  searchClear: document.getElementById('search-clear'),
  onlineOnly: document.getElementById('online-only'),
  sort: document.getElementById('sort'),
  dialog: document.getElementById('work-dialog')
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- helpers ---------- */

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function roomOf(work) {
  const theme = work.theme || '';
  if (theme.includes('市井')) return 'shijing';
  if (theme.includes('长征')) return 'changzheng';
  return 'jiangxin';
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDate(iso) {
  if (!iso) return '未记录';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '未记录';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}.${parts.month}.${parts.day}`;
}

function formatSize(kb) {
  if (!Number.isFinite(kb) || kb <= 0) return '未记录';
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

function stackText(work) {
  const stack = Array.isArray(work.stack) ? work.stack.filter(Boolean) : [];
  return stack.length ? stack.join(' / ') : '未探测';
}

function cleanDescription(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function workHref(id) { return `#/work/${encodeURIComponent(id)}`; }

function idFromHash() {
  const match = location.hash.match(/^#\/work\/(.+)$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

/* ---------- render: stats / tally ---------- */

function renderStats() {
  const total = state.works.length;
  const online = state.works.filter(work => work.online).length;
  const recent = state.works.filter(work => Number(work.commits7d) > 0).length;
  const set = (key, value) => {
    const node = document.querySelector(`[data-stat="${key}"]`);
    if (node) node.textContent = value;
  };
  set('total', String(total));
  set('themes', pad(Object.keys(ROOMS).length));
  set('online', String(online));
  set('recent', String(recent));
}

function renderCounts() {
  const counts = { shijing: 0, jiangxin: 0, changzheng: 0 };
  state.works.forEach(work => { counts[roomOf(work)] += 1; });
  document.querySelectorAll('[data-count-room]').forEach(node => {
    const count = counts[node.dataset.countRoom];
    if (count == null) return;
    node.textContent = String(count) + (node.dataset.countSuffix || '');
  });
  document.querySelectorAll('[data-filter] .n').forEach(node => {
    const key = node.closest('[data-filter]').dataset.filter;
    if (key !== 'all' && counts[key] != null) node.textContent = pad(counts[key]);
  });

  const raw = state.meta && state.meta.generatedAt;
  if (!raw) return;
  const date = new Date(String(raw).replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (Number.isNaN(date.getTime())) return;
  const stamp = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date).replace(/\//g, '.').replace(',', '');
  document.querySelectorAll('[data-meta-date]').forEach(node => { node.textContent = stamp; });
}

function renderTally() {
  el.tally.innerHTML = state.works.map((work, index) => {
    const room = roomOf(work);
    const no = pad(index + 1);
    return `<a class="tick" data-theme="${room}" href="${workHref(work.id)}" title="${esc(no)} ${esc(work.title)}" aria-label="${esc(no)} ${esc(work.title)}"></a>`;
  }).join('');
}

/* ---------- filtering ---------- */

function getVisibleWorks() {
  const query = state.query.trim().toLowerCase();
  let list = state.works.filter(work => {
    if (state.filter !== 'all' && roomOf(work) !== state.filter) return false;
    if (state.onlineOnly && !work.online) return false;
    if (!query) return true;
    const haystack = [
      work.title, work.owner, work.theme, work.group,
      (work.stack || []).join(' '), work.description
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });

  if (state.sort === 'recent') {
    list = list.slice().sort((a, b) => {
      const dateA = a.lastCommit && a.lastCommit.date ? Date.parse(a.lastCommit.date) : 0;
      const dateB = b.lastCommit && b.lastCommit.date ? Date.parse(b.lastCommit.date) : 0;
      return dateB - dateA;
    });
  } else if (state.sort === 'title') {
    list = list.slice().sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
  }
  return list;
}

/* ---------- render: cards ---------- */

function cardMedia(work, no) {
  if (work.shot) {
    const badge = work.online
      ? '<span class="work-badge">可在线体验</span>'
      : (work.site ? '<span class="work-badge is-offline">探活未通过</span>' : '');
    return `<div class="work-media">
      <img src="${esc(work.shot)}" width="1280" height="800" alt="《${esc(work.title)}》首屏截图" loading="lazy" decoding="async">
      ${badge}
    </div>`;
  }

  const firstChar = Array.from(work.title || '零')[0] || '零';
  const foot = work.site
    ? (work.online ? '线上可体验' : '探活未通过')
    : '仅仓库';
  return `<div class="plate" data-mark="${esc(firstChar)}" aria-hidden="true">
    <span class="plate-kicker">NO SHOT · 以排印代预览</span>
    <span class="plate-title">${esc(work.title)}</span>
    <span class="plate-foot"><span>@${esc(work.owner)}</span><span>${foot}</span></span>
  </div>`;
}

function renderGrid() {
  const visible = getVisibleWorks();

  if (!visible.length) {
    el.grid.innerHTML = `<div class="empty">
      <strong>这一组暂时是空的</strong>
      <p>换一个展厅，或清空搜索词再试。也可以只看可在线体验的作品。</p>
    </div>`;
  } else {
    el.grid.innerHTML = visible.map(work => {
      const index = state.works.indexOf(work);
      const no = pad(index + 1);
      const room = roomOf(work);
      const stack = stackText(work);
      const recent = Number(work.commits7d) > 0;
      return `<article class="work" data-theme="${room}">
        <a class="work-card-link" href="${workHref(work.id)}">
          <div class="work-top">
            <span class="work-no">NO. ${no}</span>
            <span class="work-theme">${esc(ROOMS[room].label)}</span>
          </div>
          ${cardMedia(work, no)}
          <h3 class="work-title">${esc(work.title)}</h3>
          <p class="work-meta">
            <span class="work-owner">@${esc(work.owner)}</span>
            <span aria-hidden="true">·</span>
            <span class="work-stack">${esc(stack)}</span>
          </p>
          ${recent ? '<span class="work-recent">近 7 天有提交</span>' : ''}
        </a>
      </article>`;
    }).join('');
  }

  el.resultInfo.innerHTML = `显示 <b>${visible.length}</b> / ${state.works.length} 件`;
  el.grid.setAttribute('aria-busy', 'false');
  updateActiveChips();
}

function keepResultsInView() {
  requestAnimationFrame(() => {
    const controls = document.getElementById('controls');
    if (!controls) return;
    const top = el.grid.getBoundingClientRect().top + window.scrollY;
    const offset = 65 + controls.offsetHeight + 12;
    if (window.scrollY + offset > top + 2) {
      window.scrollTo({ top: Math.max(0, top - offset), behavior: 'auto' });
    }
  });
}

function updateActiveChips() {
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
  });
}

/* ---------- dialog ---------- */

function dialogTemplate(work) {
  const index = state.works.indexOf(work);
  const no = pad(index + 1);
  const room = roomOf(work);
  const roomMeta = ROOMS[room];
  const stack = stackText(work);
  const group = work.group && work.group !== '组别未注明' ? work.group : '未注明';
  const description = cleanDescription(work.description);
  const siteLink = work.site
    ? `<a class="btn" href="${esc(work.site)}" target="_blank" rel="noopener">${work.online ? '在线体验' : '打开站点（探活未通过）'}</a>`
    : '<a class="btn" aria-disabled="true" href="#" tabindex="-1">暂无线上站点</a>';
  const media = work.shot
    ? `<img src="${esc(work.shot)}" width="1280" height="800" alt="《${esc(work.title)}》首屏截图">`
    : `<div class="plate" data-mark="${esc(Array.from(work.title || '零')[0])}" aria-hidden="true">
        <span class="plate-kicker">NO SHOT · 以排印代预览</span>
        <span class="plate-title">${esc(work.title)}</span>
        <span class="plate-foot"><span>@${esc(work.owner)}</span><span>仅仓库</span></span>
      </div>`;

  const visible = getVisibleWorks();
  let pos = visible.findIndex(item => item.id === work.id);
  const navList = pos === -1 ? state.works : visible;
  if (pos === -1) pos = state.works.indexOf(work);
  const prev = pos > 0 ? navList[pos - 1] : null;
  const next = pos >= 0 && pos < navList.length - 1 ? navList[pos + 1] : null;

  return `<div class="dialog-bar">
      <span>${esc(roomMeta.hall)} / NO. ${no}</span>
      <div class="dialog-actions">
        <button class="dialog-btn" type="button" id="copy-link" aria-label="复制链接"><span class="btn-label">复制链接</span><span aria-hidden="true">⧉</span></button>
        <button class="dialog-btn dialog-close" type="button" id="dialog-close" aria-label="关闭作品详情">×</button>
      </div>
    </div>
    <div class="dialog-body">
      <div class="dialog-media">
        ${media}
        ${work.shot ? '<span class="media-note">首屏截图 · 线上站点 1440 × 900</span>' : ''}
      </div>
      <div class="dialog-info">
        <div class="dialog-kicker">
          <span class="dot" aria-hidden="true"></span>
          <span>${esc(work.theme)}</span>
        </div>
        <h2 id="dialog-title">${esc(work.title)}</h2>
        <p class="dialog-owner">@${esc(work.owner)}</p>
        ${description ? `<p class="dialog-desc">${esc(description)}</p>` : ''}
        <dl class="dialog-dl">
          <div><dt>参赛组别</dt><dd>${esc(group)}</dd></div>
          <div><dt>线上状态</dt><dd class="${work.online ? 'state-online' : 'state-offline'}">${work.online ? '可访问' : (work.site ? '探活未通过' : '未提供站点')}</dd></div>
          <div><dt>技术栈</dt><dd>${esc(stack)}</dd></div>
          <div><dt>最近提交</dt><dd class="mono">${formatDate(work.lastCommit && work.lastCommit.date)}</dd></div>
          <div><dt>近 7 天提交</dt><dd>${Number(work.commits7d) || 0} 次</dd></div>
          <div><dt>仓库规模</dt><dd>${formatSize(work.sizeKB)}</dd></div>
        </dl>
        <div class="dialog-links">
          ${siteLink}
          <a class="btn btn-ghost" href="https://github.com/${esc(work.repo)}" target="_blank" rel="noopener">查看仓库</a>
        </div>
      </div>
    </div>
    <nav class="dialog-nav" aria-label="相邻作品">
      ${prev ? `<a href="${workHref(prev.id)}"><small>← 上一件 · ${pad(state.works.indexOf(prev) + 1)}</small><b>${esc(prev.title)}</b></a>` : '<a aria-disabled="true" tabindex="-1"><small>← 上一件</small><b>已是第一件</b></a>'}
      ${next ? `<a href="${workHref(next.id)}"><small>下一件 · ${pad(state.works.indexOf(next) + 1)} →</small><b>${esc(next.title)}</b></a>` : '<a aria-disabled="true" tabindex="-1"><small>下一件 →</small><b>已是最后一件</b></a>'}
    </nav>`;
}

function openWork(id) {
  const work = state.works.find(item => item.id === id);
  if (!work) {
    if (el.dialog.open) el.dialog.close();
    if (location.hash.startsWith('#/work/')) {
      history.replaceState(null, '', `${location.pathname}${location.search}#index`);
    }
    return;
  }

  el.dialog.innerHTML = dialogTemplate(work);
  if (!el.dialog.open) {
    document.body.classList.add('is-locked');
    el.dialog.showModal();
  }
  el.dialog.scrollTop = 0;
  document.title = `${work.title} · 零杯 2026 作品展`;

  const closeBtn = document.getElementById('dialog-close');
  if (closeBtn) closeBtn.focus({ preventScroll: true });
  const copyBtn = document.getElementById('copy-link');
  if (copyBtn) copyBtn.addEventListener('click', () => copyLink(copyBtn));

  /* 详情内相邻作品使用普通 hash 链接，交给 hashchange 统一处理 */
}

function closeWork() {
  if (el.dialog.open) el.dialog.close();
}

async function copyLink(button) {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const area = document.createElement('textarea');
    area.value = url;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  const label = button.querySelector('.btn-label');
  if (label) {
    const original = label.textContent;
    label.textContent = '已复制';
    button.setAttribute('aria-label', '链接已复制');
    setTimeout(() => {
      label.textContent = original;
      button.setAttribute('aria-label', '复制链接');
    }, 1600);
  }
}

/* ---------- events ---------- */

function bindEvents() {
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      renderGrid();
      keepResultsInView();
    });
  });

  document.querySelectorAll('[data-hall-filter]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      state.filter = link.dataset.hallFilter;
      renderGrid();
      const target = document.getElementById('index');
      if (target) target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  });

  let searchTimer = 0;
  el.search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.query = el.search.value;
      el.searchWrap.classList.toggle('has-value', Boolean(el.search.value));
      renderGrid();
      keepResultsInView();
    }, 70);
  });

  el.searchClear.addEventListener('click', () => {
    el.search.value = '';
    state.query = '';
    el.searchWrap.classList.remove('has-value');
    el.search.focus();
    renderGrid();
    keepResultsInView();
  });

  el.onlineOnly.addEventListener('change', () => {
    state.onlineOnly = el.onlineOnly.checked;
    renderGrid();
    keepResultsInView();
  });

  el.sort.addEventListener('change', () => {
    state.sort = el.sort.value;
    renderGrid();
    keepResultsInView();
  });

  el.dialog.addEventListener('click', event => {
    if (event.target === el.dialog) el.dialog.close();
  });

  el.dialog.addEventListener('close', () => {
    document.body.classList.remove('is-locked');
    document.title = '零杯 2026 作品展 · 五十一件作品，三种留住时间的方式';
    if (location.hash.startsWith('#/work/')) {
      history.replaceState(null, '', `${location.pathname}${location.search}#index`);
    }
  });

  window.addEventListener('hashchange', () => {
    const id = idFromHash();
    if (id) openWork(id);
    else closeWork();
  });
}

/* ---------- boot ---------- */

async function boot() {
  try {
    const response = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.meta = data.meta || {};
    state.works = Array.isArray(data.works) ? data.works : [];

    renderStats();
    renderCounts();
    renderTally();
    renderGrid();
    bindEvents();

    const initial = idFromHash();
    if (initial) openWork(initial);
  } catch (error) {
    el.grid.innerHTML = `<div class="empty">
      <strong>作品数据未能载入</strong>
      <p>请刷新页面重试；如果问题持续，数据文件可能正在更新。</p>
    </div>`;
    el.grid.setAttribute('aria-busy', 'false');
    console.error('零杯作品数据载入失败：', error);
  }
}

boot();
