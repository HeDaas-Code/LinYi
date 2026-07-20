const API = '/api';
const WS = `ws://${window.location.host}/ws`;

let ws = null;
let latestSnapshot = null;
let busEvents = [];
let charts = {};

const viewTitles = {
  overview: '系统总览',
  sandbox: '脑中世界',
  memory: '记忆图谱',
  trpg: 'TRPG 角色',
  novel: '小说手稿',
  bus: '总线事件',
  eos: 'EOS 指标',
  config: '配置',
};

function init() {
  setupNavigation();
  setupControls();
  connectWebSocket();
  loadAllData();
  setInterval(loadAllData, 3000);
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      document.getElementById(`view-${view}`).classList.add('active');
      document.getElementById('page-title').textContent = viewTitles[view] || view;
      if (view === 'memory') setTimeout(drawMemoryGraph, 50);
      if (view === 'trpg') setTimeout(drawAttributeRadar, 50);
      renderView(view);
    });
  });
}

function setupControls() {
  document.getElementById('btn-refresh').addEventListener('click', loadAllData);
  document.getElementById('btn-build').addEventListener('click', () => postControl('control.sandbox.build', {}));
  document.getElementById('btn-simulate').addEventListener('click', () => postControl('control.sandbox.simulate', {}));
  document.getElementById('btn-fork').addEventListener('click', () => postControl('control.sandbox.fork', { label: 'web-ui-fork' }));
  document.getElementById('btn-ab').addEventListener('click', () => postControl('control.sandbox.version.ab', {}));
  document.getElementById('btn-save-config').addEventListener('click', saveConfig);
  document.getElementById('btn-bus-clear').addEventListener('click', () => {
    document.getElementById('bus-filter').value = '';
    document.getElementById('bus-channel').value = '';
    renderBusEvents();
  });
  document.getElementById('bus-filter').addEventListener('input', renderBusEvents);
  document.getElementById('bus-channel').addEventListener('change', renderBusEvents);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
}

async function getJSON(path) {
  try {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}

async function postControl(topic, payload) {
  await fetch(`${API}/control/${topic}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function loadAllData() {
  const [snapshot, world, versions, sheets, novel, eos, events, graph, cfg] = await Promise.all([
    getJSON('/snapshot'),
    getJSON('/sandbox/world'),
    getJSON('/sandbox/versions'),
    getJSON('/sandbox/characters'),
    getJSON('/novel/manuscript'),
    getJSON('/eos/metrics'),
    getJSON('/bus/events?limit=200'),
    getJSON('/memory/graph'),
    getJSON('/config'),
  ]);

  latestSnapshot = snapshot;
  if (events) busEvents = events;
  if (graph) window.memoryGraph = graph;
  if (sheets) window.latestSheets = sheets;

  renderSnapshot(snapshot);
  renderWorld(world);
  renderVersions(versions);
  renderCharacters(sheets);
  renderNovel(novel);
  renderEOS(eos);
  renderConfig(cfg);
  renderBusEvents();

  const activeView = document.querySelector('.view.active')?.id.replace('view-', '');
  if (activeView) renderView(activeView);
}

function renderView(view) {
  if (view === 'overview') renderOverviewCharts();
  if (view === 'sandbox') renderSandboxCharts();
  if (view === 'memory') { setTimeout(drawMemoryGraph, 50); renderMemoryCharts(); }
  if (view === 'trpg') setTimeout(drawAttributeRadar, 50);
  if (view === 'eos') renderEOSCharts();
}

function renderSnapshot(snapshot) {
  if (!snapshot) return;
  const modules = snapshot.modules || {};
  const uptime = Math.floor(snapshot.uptime_seconds || 0);
  document.getElementById('uptime').textContent = `运行 ${formatDuration(uptime)}`;

  const sb = modules.mental_sandbox || {};
  const cen = modules.central_executive_network || {};
  const cenCustom = cen.custom || {};
  const mem = modules.memory_system || {};
  const novel = modules.novel_output || {};
  const eos = modules.eos || {};

  const currentPhase = cenCustom.current_phase || cenCustom.last_phase || cen.current_phase || '-';
  const currentTask = cenCustom.current_task || cen.current_task || '-';

  const kpis = [
    { label: '模块数', value: Object.keys(modules).length, delta: '已注册', tone: 'success' },
    { label: '当前阶段', value: currentPhase, delta: currentTask, tone: 'success' },
    { label: '脑中世界轮次', value: sb.simulation_round || 0, delta: 'sandbox rounds', tone: 'warning' },
    { label: '记忆片段', value: mem.fragment_count || 0, delta: 'fragments / traces', tone: 'success' },
    { label: '小说段落', value: novel.paragraph_count || 0, delta: 'published paragraphs', tone: 'success' },
    { label: 'EOS 告警', value: eos.alerts_generated || 0, delta: 'alerts', tone: eos.alerts_generated ? 'danger' : 'success' },
  ];

  const grid = document.getElementById('overview-kpi');
  grid.innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.tone}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-delta">${k.delta}</div>
    </div>
  `).join('');

  renderModuleTable(modules);
}

function renderModuleTable(modules) {
  const thead = document.querySelector('#module-table thead');
  const tbody = document.querySelector('#module-table tbody');
  thead.innerHTML = '<tr><th data-sort="name">模块</th><th data-sort="active">状态</th><th data-sort="last_tick">最近 tick</th><th>摘要</th></tr>';
  tbody.innerHTML = Object.entries(modules).map(([name, state]) => {
    const active = state.active !== undefined ? state.active : (state.state?.active ?? '-');
    const last = state.last_tick !== undefined ? state.last_tick : (state.state?.last_tick ?? '-');
    const summary = JSON.stringify(state).slice(0, 90) + '...';
    return `<tr><td><strong>${name}</strong></td><td>${active ? '● 活跃' : '○ 休眠'}</td><td>${last}</td><td title="${summary}">${summary}</td></tr>`;
  }).join('');

  setupSortableTable('#module-table');
}

function renderOverviewCharts() {
  const modules = latestSnapshot?.modules || {};
  const meta = modules.metabolism?.resources || modules.metabolism || {};

  const moduleNames = Object.keys(modules).slice(0, 10);
  const energyCosts = moduleNames.map(n => modules[n].energy_cost || 0);
  renderBarChart('chart-network', '模块能耗', moduleNames, energyCosts);

  renderBarChart('chart-metabolism', '代谢资源', ['energy', 'compute', 'time', 'social'], [
    meta.energy || 0, meta.compute_budget || 0, meta.time_currency || 0, meta.social_capital || 0,
  ]);
}

function renderWorld(world) {
  const container = document.getElementById('world-cards');
  if (!world) { container.innerHTML = '<div class="info-card"><p>暂无世界模型</p></div>'; return; }
  const ontology = world.ontology || {};
  container.innerHTML = `
    <div class="info-card"><h4>世界名称</h4><p>${world.name || '-'}</p></div>
    <div class="info-card"><h4>类型</h4><p>${ontology.genre || '-'}</p></div>
    <div class="info-card"><h4>基调</h4><p>${ontology.tone || '-'}</p></div>
    <div class="info-card"><h4>场景</h4><p>${ontology.setting || '-'}</p></div>
    <div class="info-card"><h4>当前时间</h4><p>${world.current_state?.time || '-'}</p></div>
    <div class="info-card"><h4>当前情绪</h4><p>${world.current_state?.mood || '-'}</p></div>
  `;
}

function renderVersions(versions) {
  const container = document.getElementById('version-tree-viz');
  if (!versions || !versions.versions || versions.versions.length === 0) {
    container.innerHTML = '<div class="info-card"><p>暂无版本分支</p></div>';
    return;
  }
  container.innerHTML = versions.versions.map(v => `
    <div class="tree-node">
      <div class="tree-badge ${v.status}">${v.id} · ${v.label}<br><small>${v.status} · round ${v.simulation_round || 0}</small></div>
    </div>
  `).join('');
}

function renderSandboxCharts() {
  const modules = latestSnapshot?.modules || {};
  const sb = modules.mental_sandbox || {};
  const metrics = sb.depth_metrics || {};
  renderRadarChart('chart-depth', '深度指标',
    Object.keys(metrics),
    Object.values(metrics)
  );
}

function renderCharacters(sheets) {
  const container = document.getElementById('character-sheets');
  const sandboxContainer = document.getElementById('sandbox-characters');
  if (!sheets || Object.keys(sheets).length === 0) {
    container.innerHTML = '<div class="info-card"><p>暂无角色卡</p></div>';
    return;
  }

  let html = '';
  Object.entries(sheets).forEach(([cid, sheet]) => {
    const skills = sheet.skills || {};
    const topSkills = Object.entries(skills).sort((a, b) => b[1] - a[1]).slice(0, 6);
    html += `<div class="sheet-card">
      <h4>${sheet.name || cid}</h4>
      ${topSkills.map(([k, v]) => `
        <div class="stat-row">
          <div class="stat-label">${k}</div>
          <div class="stat-bar"><div class="stat-fill" style="width:${Math.min(100, v)}%"></div></div>
          <div class="stat-value">${Math.round(v)}</div>
        </div>
      `).join('')}
    </div>`;
  });
  container.innerHTML = html;
  if (sandboxContainer) sandboxContainer.innerHTML = html;
}

function drawAttributeRadar() {
  const sheets = window.latestSheets;
  if (!sheets || Object.keys(sheets).length === 0) return;
  const sheet = Object.values(sheets)[0];
  const attrs = sheet.attributes || {};
  const labels = Object.keys(attrs).slice(0, 8);
  const data = labels.map(k => attrs[k] || 0);
  renderRadarChart('chart-attributes', '角色属性', labels, data);
}

function renderNovel(novel) {
  if (!novel) return;
  document.getElementById('novel-title').textContent = novel.title || '脑中世界纪事';
  document.getElementById('novel-stats').textContent = `${novel.paragraph_count || 0} 段落`;
  const container = document.getElementById('novel-paragraphs');
  container.innerHTML = (novel.paragraphs || []).map((p, i) => {
    const text = typeof p === 'string' ? p : (p.content || JSON.stringify(p));
    return `<p><span class="para-num">#${i + 1}</span>${text}</p>`;
  }).join('') || '<p class="empty">尚无段落</p>';
}

function renderBusEvents() {
  const filter = document.getElementById('bus-filter')?.value.toLowerCase() || '';
  const channel = document.getElementById('bus-channel')?.value || '';
  const tbody = document.querySelector('#bus-table tbody');

  let filtered = busEvents.filter(e => {
    const text = `${e.topic} ${e.channel} ${JSON.stringify(e.payload)}`.toLowerCase();
    return text.includes(filter) && (!channel || e.channel === channel);
  });

  document.getElementById('bus-count').textContent = `共 ${filtered.length} 条`;

  tbody.innerHTML = filtered.slice().reverse().slice(0, 200).map(ev => {
    const ts = ev.timestamp ? new Date(ev.timestamp * 1000).toLocaleTimeString() : '-';
    const summary = JSON.stringify(ev.payload || {}).slice(0, 80);
    return `<tr><td>${ts}</td><td><span class="tag">${ev.channel}</span></td><td>${ev.topic}</td><td title="${summary}">${summary}</td></tr>`;
  }).join('');
}

function renderEOS(eos) {
  if (!eos) return;
  document.getElementById('eos-latest').textContent = JSON.stringify(eos.latest_report || eos, null, 2);
}

function renderEOSCharts() {
  const eos = latestSnapshot?.modules?.eos || {};
  const reports = eos.reports_generated || 0;
  const alerts = eos.alerts_generated || 0;
  renderLineChart('chart-eos', 'EOS 报告数', ['reports'], [reports]);
  renderPieChart('chart-alerts', '告警分布', ['alerts', 'normal'], [alerts, Math.max(0, 100 - alerts)]);
}

function renderConfig(cfg) {
  const el = document.getElementById('config-editor');
  if (cfg && el) el.textContent = JSON.stringify(cfg, null, 2);
}

function renderMemoryCharts() {
  const modules = latestSnapshot?.modules || {};
  const mem = modules.memory_system || {};
  renderPieChart('chart-tags', '记忆类型', ['fragments', 'traces'], [mem.fragment_count || 0, mem.trace_count || 0]);

  const kpi = document.getElementById('memory-kpi');
  if (kpi) {
    kpi.innerHTML = [
      { label: 'Fragments', value: mem.fragment_count || 0 },
      { label: 'Traces', value: mem.trace_count || 0 },
      { label: 'Working Memory', value: mem.working_memory_count || 0 },
      { label: 'Consolidations', value: mem.consolidation_runs || 0 },
    ].map(k => `<div class="kpi-card"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div>`).join('');
  }
}

function drawMemoryGraph() {
  const canvas = document.getElementById('memory-canvas');
  if (!canvas || !window.memoryGraph) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const { nodes = [], edges = [] } = window.memoryGraph;
  if (nodes.length === 0) {
    ctx.fillStyle = '#9aa3b2';
    ctx.font = '14px sans-serif';
    ctx.fillText('暂无记忆数据', 20, 30);
    return;
  }

  const positions = {};
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const radius = Math.min(cx, cy) - 60;

  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    positions[node.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  ctx.strokeStyle = 'rgba(91, 141, 239, 0.35)';
  ctx.lineWidth = 1;
  edges.forEach(edge => {
    const a = positions[edge.source];
    const b = positions[edge.target];
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  });

  nodes.forEach(node => {
    const p = positions[node.id];
    if (!p) return;
    const color = node.type === 'trace' ? '#f5a623' : '#5b8def';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#e8eaf0';
    ctx.font = '12px sans-serif';
    ctx.fillText(node.label || node.id, p.x + 12, p.y + 4);
  });
}

async function saveConfig() {
  const text = document.getElementById('config-editor').textContent;
  try {
    const payload = JSON.parse(text);
    await fetch(`${API}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showToast('配置已保存');
  } catch (e) {
    showToast('JSON 格式错误: ' + e.message, 'danger');
  }
}

function connectWebSocket() {
  ws = new WebSocket(WS);
  const status = document.getElementById('conn-status');
  const dot = document.getElementById('conn-dot');

  ws.onopen = () => {
    status.textContent = '已连接';
    dot.classList.add('connected');
    dot.classList.remove('disconnected');
  };

  ws.onclose = () => {
    status.textContent = '未连接';
    dot.classList.remove('connected');
    dot.classList.add('disconnected');
    setTimeout(connectWebSocket, 2000);
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'snapshot') {
      latestSnapshot = data;
      renderSnapshot(data);
      const activeView = document.querySelector('.view.active')?.id.replace('view-', '');
      if (activeView) renderView(activeView);
    }
  };
}

/* Chart helpers */
function getCtx(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  return el.getContext('2d');
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function renderBarChart(id, label, labels, data) {
  const ctx = getCtx(id);
  if (!ctx) return;
  destroyChart(id);
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label, data, backgroundColor: '#5b8def', borderRadius: 4 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#272c38' } }, x: { grid: { display: false } } },
    },
  });
}

function renderPieChart(id, label, labels, data) {
  const ctx = getCtx(id);
  if (!ctx) return;
  destroyChart(id);
  charts[id] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ['#5b8def', '#3ccf4a', '#f5a623', '#ff5a5a', '#9aa3b2'],
        borderWidth: 0,
      }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
  });
}

function renderRadarChart(id, label, labels, data) {
  const ctx = getCtx(id);
  if (!ctx || labels.length === 0) return;
  destroyChart(id);
  const accent = '#5b8def';
  charts[id] = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: 'rgba(91, 141, 239, 0.25)',
        borderColor: accent,
        pointBackgroundColor: accent,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { r: { beginAtZero: true, max: 1, grid: { color: '#272c38' } } },
    },
  });
}

function renderLineChart(id, label, labels, data) {
  const ctx = getCtx(id);
  if (!ctx) return;
  destroyChart(id);
  charts[id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: '#5b8def',
        backgroundColor: 'rgba(91, 141, 239, 0.15)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
  });
}

/* Utilities */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function setupSortableTable(selector) {
  const table = document.querySelector(selector);
  if (!table) return;
  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const va = a.cells[th.cellIndex].textContent.trim();
        const vb = b.cells[th.cellIndex].textContent.trim();
        const na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return va.localeCompare(vb);
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });
}

function showToast(message, tone = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${tone}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function toggleTheme() {
  document.body.classList.toggle('light');
}

window.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', () => {
  if (document.getElementById('view-memory')?.classList.contains('active')) drawMemoryGraph();
});