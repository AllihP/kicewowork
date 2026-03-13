/**
 * app.js — KICEKO ProjectHub
 * Frontend JavaScript connecté à l'API Django REST
 * Toutes les données viennent de /api/ via JWT
 */

const API = '/api';

// ══════════════════════════════════════════
// ÉTAT GLOBAL
// ══════════════════════════════════════════
const D = { 
  projects: [], 
  members: [], 
  workItems: [], 
  tenders: [], 
  sprints: [] 
};
let currentPage = 'dashboard';
let boardFilter = '';
let editProjId = null;
let editAOId = null;
let editWIId = null;
let dashStats = null;

// ══════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════
function getToken() { 
  return localStorage.getItem('kh_access'); 
}

function getUser() { 
  try { 
    return JSON.parse(localStorage.getItem('kh_user')); 
  } catch { 
    return null; 
  } 
}

function authHeaders() {
  return { 
    'Content-Type': 'application/json', 
    'Authorization': `Bearer ${getToken()}` 
  };
}

async function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const err = document.getElementById('login-err');
  err.style.display = 'none';
  
  if (!u || !p) { 
    err.textContent = 'Remplis tous les champs.'; 
    err.style.display = 'block'; 
    return; 
  }
  
  try {
    const res = await fetch(`${API}/auth/login/`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username: u, password: p }) 
    });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.detail || 'Identifiants incorrects');
    
    localStorage.setItem('kh_access', data.access);
    localStorage.setItem('kh_refresh', data.refresh);
    localStorage.setItem('kh_user', JSON.stringify(data.user));
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    
    updateUserBar(data.user);
    await loadAll();
  } catch(e) { 
    err.textContent = e.message; 
    err.style.display = 'block'; 
  }
}

async function refreshToken() {
  const ref = localStorage.getItem('kh_refresh');
  if (!ref) return false;
  
  const res = await fetch(`${API}/auth/refresh/`, { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ refresh: ref }) 
  });
  
  if (res.ok) { 
    const d = await res.json(); 
    localStorage.setItem('kh_access', d.access); 
    return true; 
  }
  return false;
}

async function apiFetch(url, opts = {}) {
  let res = await fetch(url, { ...opts, headers: authHeaders() });
  
  if (res.status === 401) {
    const ok = await refreshToken();
    if (ok) res = await fetch(url, { ...opts, headers: authHeaders() });
    else { doLogout(); return null; }
  }
  return res;
}

function doLogout() {
  localStorage.removeItem('kh_access');
  localStorage.removeItem('kh_refresh');
  localStorage.removeItem('kh_user');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function updateUserBar(user) {
  if (!user) return;
  const name = user.first_name || user.username;
  document.getElementById('user-name').textContent = name.split(' ')[0];
  const av = document.getElementById('user-av');
  av.textContent = (user.member_initials || name.substring(0, 2)).toUpperCase();
  if (user.member_color) av.style.background = user.member_color;
}

// ══════════════════════════════════════════
// ⚠️ CHARGEMENT DONNÉES - CORRIGÉ
// ══════════════════════════════════════════
async function loadAll() {
  const loading = document.getElementById('app-loading');
  if (loading) loading.classList.add('active');
  
  try {
    const [pr, mb, wi, tn, sp, ds] = await Promise.all([
      apiFetch(`${API}/projects/?page_size=200`).then(r => r?.json()).catch(() => null),
      apiFetch(`${API}/members/?page_size=200`).then(r => r?.json()).catch(() => null),
      apiFetch(`${API}/workitems/?page_size=500`).then(r => r?.json()).catch(() => null),
      apiFetch(`${API}/tenders/?page_size=200`).then(r => r?.json()).catch(() => null),
      apiFetch(`${API}/sprints/?page_size=100`).then(r => r?.json()).catch(() => null),
      apiFetch(`${API}/dashboard/`).then(r => r?.json()).catch(() => null),
    ]);
    
    D.projects  = pr?.results || pr || [];
    D.members   = mb?.results || mb || [];
    D.workItems = wi?.results || wi || [];
    D.tenders   = tn?.results || tn || [];
    D.sprints   = sp?.results || sp || [];
    dashStats   = ds || null;
    
    console.log('✅ Données chargées:', {
      projets: D.projects.length,
      membres: D.members.length,
      workItems: D.workItems.length
    });
    
    renderSidebar();
    renderPage(currentPage);
    updateChips();
    
  } catch(e) { 
    console.error('❌ Erreur:', e);
    toast('Erreur de chargement', 'error', '⚠'); 
  } finally {
    // ✅ MASQUER LE LOADING (TOUJOURS EXÉCUTÉ)
    const loading = document.getElementById('app-loading');
    if (loading) {
      loading.classList.remove('active');
      console.log('👁️ Loading masqué');
    }
  }
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
const PAGE_TITLES = {
  dashboard: 'Dashboard', 
  projects: 'Projets', 
  board: 'Kanban Board',
  backlog: 'Product Backlog', 
  sprints: 'Sprints', 
  tenders: 'Appels d\'offres',
  team: 'Équipe', 
  analytics: 'Analytics'
};

const PAGE_SUBS = {
  dashboard: 'Vue d\'ensemble · KICEKO', 
  projects: 'Tous les projets actifs',
  board: 'Gestion visuelle des tickets', 
  backlog: 'Liste priorisée des items',
  sprints: 'Itérations agiles', 
  tenders: 'Pipeline commercial',
  team: 'Membres de l\'équipe', 
  analytics: 'Métriques & KPIs'
};

function nav(page, el) {
  document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
  if (el) el.classList.add('active');
  currentPage = page;
  
  const tbTitle = document.getElementById('tb-title');
  const tbSub = document.getElementById('tb-sub');
  if (tbTitle) tbTitle.textContent = PAGE_TITLES[page] || page;
  if (tbSub) tbSub.textContent = PAGE_SUBS[page] || '';
  
  renderPage(page);
}

function renderPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(`page-${page}`);
  if (pg) pg.classList.add('active');
  
  const fn = { 
    dashboard: renderDashboard, 
    projects: renderProjects, 
    board: renderBoard,
    backlog: renderBacklog, 
    sprints: renderSprints, 
    tenders: renderTenders,
    team: renderTeam, 
    analytics: renderAnalytics 
  }[page];
  
  if (fn) fn();
}

function show(id) { 
  const e = document.getElementById(id); 
  if (e) e.style.display = ''; 
}

function hide(id) { 
  const e = document.getElementById(id); 
  if (e) e.style.display = 'none'; 
}

function updateChips() {
  const active = D.workItems.filter(w => w.status === 'En cours').length;
  const aos = D.tenders.filter(t => !['Gagné', 'Perdu'].includes(t.status)).length;
  
  const chip1 = document.getElementById('chip-board');
  const chip2 = document.getElementById('chip-ao');
  if (chip1) chip1.textContent = active;
  if (chip2) chip2.textContent = aos;
}

// ══════════════════════════════════════════
// SIDEBAR
// ══════════════════════════════════════════
const STATUS_COLORS = {
  'En cours': '#22c55e',
  'Planifié': '#3b82f6',
  'En attente': '#f97316',
  'Terminé': '#64748b',
  'Bloqué': '#ef4444'
};

function renderSidebar() {
  const el = document.getElementById('sb-projects');
  if (!el) return;
  
  const active = D.projects.filter(p => p.status !== 'Terminé').slice(0, 6);
  el.innerHTML = active.length ? active.map(p => 
    `<div class="sb-proj" onclick="nav('projects',document.querySelector('[data-page=projects]'))">` +
    `<div class="sb-dot" style="background:${STATUS_COLORS[p.status] || '#64748b'}"></div>` +
    `<div class="sb-label">${p.name}</div>` +
    `</div>`
  ).join('') : '<div style="font-size:11px;color:var(--text3);padding:8px 10px">Aucun projet actif</div>';
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function gM(id) { return D.members.find(m => m.id == id); }
function gP(id) { return D.projects.find(p => p.id == id); }

function fd(d) { 
  if (!d) return '—'; 
  const dt = new Date(d); 
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); 
}

function fmt(n) { 
  return Number(n || 0).toLocaleString('fr-FR'); 
}

function avEl(m, size = 32) {
  if (!m) return '';
  const s = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.34)}px;background:${m.color || '#e8a020'};color:#000`;
  return `<div class="av" style="${s}">${m.initials || '?'}</div>`;
}

function badge(type, val) {
  const MAP = {
    status: { 'En cours': 'b-green', 'Planifié': 'b-blue', 'En attente': 'b-orange', 'Terminé': 'b-gray', 'Bloqué': 'b-red' },
    type: { 'epic': 'b-purple', 'feature': 'b-teal', 'story': 'b-blue', 'task': 'b-green', 'bug': 'b-red', 'ao': 'b-accent' },
    prio: { 'Haute': 'b-red', 'Moyenne': 'b-orange', 'Basse': 'b-green' },
    ao: { 'Détection': 'b-gray', 'Qualification': 'b-blue', 'Préparation': 'b-orange', 'Soumis': 'b-accent', 'Gagné': 'b-green', 'Perdu': 'b-red' }
  };
  const cls = (MAP[type] || {})[val] || 'b-gray';
  return `<span class="badge ${cls}">${val}</span>`;
}

function animCount(el, target, dur = 900) {
  const start = Date.now();
  const step = () => {
    const p = Math.min(1, (Date.now() - start) / dur);
    el.textContent = Math.round(p * target);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
function renderDashboard() {
  const s = dashStats;
  if (!s) { 
    document.getElementById('page-dashboard').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Chargement…</div>'; 
    return; 
  }
  
  ['s1', 's2', 's3', 's4'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) animCount(el, [s.active_items, s.active_projects, s.done_items, s.total_tenders][i]);
  });
  
  const changes = [
    { el: 's1c', txt: `${s.backlog_items || 0} en backlog`, cls: 'neutral' },
    { el: 's2c', txt: `${D.projects.filter(p => p.status === 'Planifié').length} planifiés`, cls: 'neutral' },
    { el: 's3c', txt: '↑ Ce mois', cls: 'up' },
    { el: 's4c', txt: `${(s.ao_by_status || {})['Gagné'] || 0} gagnés`, cls: 'up' }
  ];
  changes.forEach(({ el, txt, cls }) => { 
    const e = document.getElementById(el); 
    if (e) { e.textContent = txt; e.className = 'stat-change ' + cls; } 
  });
  
  const dp = document.getElementById('d-projects');
  if (dp) {
    dp.innerHTML = (s.recent_projects || []).slice(0, 4).map(p => 
      `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">` +
      `<div style="width:4px;height:36px;border-radius:4px;background:${STATUS_COLORS[p.status] || '#64748b'};flex-shrink:0"></div>` +
      `<div style="flex:1;min-width:0">` +
      `<div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>` +
      `<div style="margin-top:4px">` +
      `<div class="progress-wrap" style="margin-bottom:0">` +
      `<div class="progress-bar" style="width:${p.progress}%;background:${STATUS_COLORS[p.status] || 'var(--accent)'}"></div>` +
      `</div></div></div>` +
      `<div style="font-family:var(--mono);font-size:11px;color:var(--text3);flex-shrink:0">${p.progress}%</div>` +
      `${badge('status', p.status)}</div>`
    ).join('') || '<div style="text-align:center;padding:20px;color:var(--text3)">📁 Aucun projet</div>';
  }
  
  const acts = [
    ...D.workItems.slice(0, 3).map(w => ({ 
      icon: '✅', bg: 'var(--greenbg)', 
      text: `<strong>${(w.title || '').substring(0, 35)}</strong> mis à jour`, 
      time: 'Récent', color: 'var(--green)' 
    })),
    ...D.tenders.slice(0, 2).map(t => ({ 
      icon: '📄', bg: 'var(--accentbg)', 
      text: `AO <strong>${t.org}</strong> — ${t.status}`, 
      time: 'Récent', color: 'var(--accent)' 
    }))
  ].slice(0, 5);
  
  const da = document.getElementById('d-activity');
  if (da) {
    da.innerHTML = acts.map(a => 
      `<div class="act-item">` +
      `<div class="act-icon" style="background:${a.bg};color:${a.color}">${a.icon}</div>` +
      `<div><div class="act-text">${a.text}</div><div class="act-time">${a.time}</div></div>` +
      `</div>`
    ).join('');
  }
  
  const wbs = s.items_by_status || {};
  const cols = ['Backlog', 'A faire', 'En cours', 'Review', 'Terminé'];
  const wColors = ['var(--text3)', 'var(--blue)', 'var(--accent)', 'var(--purple)', 'var(--green)'];
  const maxW = Math.max(1, ...cols.map(c => wbs[c] || 0));
  
  const dc = document.getElementById('d-wi-chart');
  if (dc) {
    dc.innerHTML = cols.map((c, i) => 
      `<div class="chart-row">` +
      `<div class="chart-lbl">${c}</div>` +
      `<div class="chart-track">` +
      `<div class="chart-fill" style="width:${((wbs[c] || 0) / maxW * 100)}%;background:${wColors[i]}"></div>` +
      `</div>` +
      `<div class="chart-val">${wbs[c] || 0}</div>` +
      `</div>`
    ).join('');
  }
  
  const dsp = document.getElementById('d-sprint');
  if (dsp) {
    const sp = D.sprints.find(s => s.status === 'En cours');
    if (sp) { 
      const pct = sp.pts_total ? Math.round(sp.pts_done / sp.pts_total * 100) : 0; 
      dsp.innerHTML = 
        `<div style="font-size:13px;font-weight:700;margin-bottom:6px">${sp.name}</div>` +
        `<div style="font-size:11px;color:var(--text3);margin-bottom:12px;font-family:var(--mono)">${fd(sp.start)} → ${fd(sp.end)}</div>` +
        `<div class="sp-pbar"><div class="sp-fill" style="width:${pct}%"></div></div>` +
        `<div style="display:flex;gap:16px">` +
        `<div class="sprint-kpi" style="padding:0;border:none"><div class="kpi-val" style="color:var(--accent)">${sp.pts_done}</div><div class="kpi-lbl">pts livrés</div></div>` +
        `<div class="sprint-kpi"><div class="kpi-val">${sp.pts_total}</div><div class="kpi-lbl">pts total</div></div>` +
        `<div class="sprint-kpi"><div class="kpi-val" style="color:var(--green)">${pct}%</div><div class="kpi-lbl">vélocité</div></div>` +
        `</div>`;
    } else dsp.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">⚡ Aucun sprint actif</div>';
  }
  
  const dao = document.getElementById('d-ao-quick');
  if (dao) {
    const aoS = s.ao_by_status || {};
    const stages = [
      ['Détection', 'var(--text3)'],
      ['Qualification', 'var(--blue)'],
      ['Préparation', 'var(--orange)'],
      ['Soumis', 'var(--accent)'],
      ['Gagné', 'var(--green)'],
      ['Perdu', 'var(--red)']
    ];
    dao.innerHTML = stages.map(([st, cl]) => 
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">` +
      `<div style="font-size:11px;color:var(--text2)">${st}</div>` +
      `<div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${cl}">${aoS[st] || 0}</div>` +
      `</div>`
    ).join('');
  }
}

// ══════════════════════════════════════════
// PROJETS
// ══════════════════════════════════════════
let projFilter = '';

function filterProj(status, btn) {
  projFilter = status;
  document.querySelectorAll('#proj-filters .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderProjects();
}

function renderProjects() {
  const projects = projFilter ? D.projects.filter(p => p.status === projFilter) : D.projects;
  const lbl = document.getElementById('proj-count-lbl');
  if (lbl) lbl.textContent = `${projects.length} projet${projects.length !== 1 ? 's' : ''} trouvé${projects.length !== 1 ? 's' : ''}`;
  
  const grid = document.getElementById('proj-grid');
  if (!grid) return;
  
  if (!projects.length) { 
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">📁</div>Aucun projet trouvé</div>`; 
    return; 
  }
  
  grid.innerHTML = projects.map(p => {
    const color = STATUS_COLORS[p.status] || '#64748b';
    const mems = (p.members_detail || []).slice(0, 4);
    const wiCnt = p.work_items_count || 0;
    
    return `<div class="proj-card" onclick="openProjModal(${p.id})">` +
      `<div class="left-bar" style="background:${color}"></div>` +
      `<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">` +
      `<div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">` +
      `<span style="font-size:10px;font-weight:700;color:var(--text3);font-family:var(--mono)">${p.category || '—'}</span>` +
      `</div><div class="proj-name">${p.name}</div></div>` +
      `${badge('status', p.status)}</div>` +
      `<div class="proj-desc">${(p.description || '').substring(0, 90)}${(p.description || '').length > 90 ? '…' : ''}</div>` +
      `<div class="progress-wrap"><div class="progress-bar" style="width:${p.progress || 0}%;background:${color}"></div></div>` +
      `<div class="proj-footer">` +
      `<div style="display:flex">${mems.map(m => avEl(m, 26)).join('')}</div>` +
      `<div style="display:flex;align-items:center;gap:8px">` +
      `<span style="font-size:10px;color:var(--text3)">${wiCnt} items</span>` +
      `<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">${p.progress || 0}%</span>` +
      `${p.deadline ? `📅 ${fd(p.deadline)}` : ''}` +
      `</div></div></div>`;
  }).join('');
}

// ══════════════════════════════════════════
// KANBAN BOARD
// ══════════════════════════════════════════
const COLS = ['Backlog', 'A faire', 'En cours', 'Review', 'Terminé'];
const COL_HEADS = [
  ['Backlog', 'var(--text3)', 'rgba(100,116,139,.08)'],
  ['À faire', 'var(--blue)', 'rgba(59,130,246,.08)'],
  ['En cours', 'var(--accent)', 'rgba(232,160,32,.08)'],
  ['Review', 'var(--purple)', 'rgba(168,85,247,.08)'],
  ['Terminé', 'var(--green)', 'rgba(34,197,94,.08)']
];

function setBoardFilter(type, btn) {
  boardFilter = type;
  document.querySelectorAll('#board-type-filters .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderBoard();
}

function renderBoard() {
  const sel = document.getElementById('board-proj-sel');
  
  if (sel && sel.options.length <= 1) {
    D.projects.forEach(p => { const o = new Option(p.name, p.id); sel.add(o); });
  }
  
  const projId = sel ? sel.value : '';
  let items = [...D.workItems];
  if (projId) items = items.filter(w => String(w.project) === String(projId));
  if (boardFilter) items = items.filter(w => w.type === boardFilter);
  
  const board = document.getElementById('kanban-board');
  if (!board) return;
  
  board.innerHTML = COLS.map((col, i) => {
    const [label, color, bg] = COL_HEADS[i];
    const colItems = items.filter(w => w.status === col);
    
    return `<div class="k-col">` +
      `<div class="k-col-head" style="background:${bg}">` +
      `<div class="k-col-name" style="color:${color}">${label}</div>` +
      `<div class="k-col-cnt">${colItems.length}</div>` +
      `<button class="k-add-btn" onclick="openWIModal(null,'${col}')">＋</button>` +
      `</div>` +
      `<div class="k-cards">${colItems.map(renderTicket).join('')}</div>` +
      `<div class="k-drop" onclick="openWIModal(null,'${col}')">＋ Ajouter un ticket</div>` +
      `</div>`;
  }).join('');
}

function renderTicket(w) {
  const assignee = D.members.find(m => m.id === w.assignee);
  const project = D.projects.find(p => p.id === w.project);
  const today = new Date().toISOString().split('T')[0];
  const overdue = w.due && w.due < today && w.status !== 'Terminé';
  
  return `<div class="ticket tk-${w.type}" onclick="openWIModal(${w.id})">` +
    `<div class="t-bar"></div>` +
    `<div class="t-top">` +
    `<span class="t-type tt-${w.type}">${(w.type || '').toUpperCase()}</span>` +
    `<span class="t-id">#${w.id}</span>` +
    `<span class="t-prio tp-${(w.priority || '').toLowerCase()}">${w.priority || '—'}</span>` +
    `</div>` +
    `<div class="t-title">${w.title || ''}</div>` +
    `<div class="t-foot">` +
    `${project ? `📁 ${project.name}` : ''}` +
    `<span class="t-pts">${w.pts}pts</span>` +
    `${w.due ? `${overdue ? '⚠ ' : ''}${fd(w.due)}` : ''}` +
    `${assignee ? `<div class="t-av">${assignee.initials || '?'}</div>` : ''}` +
    `</div></div>`;
}

// ══════════════════════════════════════════
// BACKLOG
// ══════════════════════════════════════════
function renderBacklog() {
  const sel = document.getElementById('bl-proj-sel');
  if (sel && sel.options.length <= 1) D.projects.forEach(p => { sel.add(new Option(p.name, p.id)); });
  
  const projId = sel ? sel.value : '';
  let items = projId ? D.workItems.filter(w => String(w.project) === String(projId)) : D.workItems;
  
  items = [...items].sort((a, b) => {
    const order = { epic: 0, feature: 1, story: 2, task: 3, bug: 4, ao: 5 };
    return (order[a.type] || 5) - (order[b.type] || 5);
  });
  
  const list = document.getElementById('backlog-list');
  if (!list) return;
  
  if (!items.length) { 
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">≡ Backlog vide</div>'; 
    return; 
  }
  
  const typeIndent = { epic: '', feature: 'bl-i1', story: 'bl-i2', task: 'bl-i3', bug: 'bl-i2', ao: '' };
  const typeColor = { epic: 'var(--purple)', feature: 'var(--teal)', story: 'var(--blue)', task: 'var(--green)', bug: 'var(--red)', ao: 'var(--accent)' };
  
  list.innerHTML = items.map(w => {
    const m = D.members.find(mb => mb.id === w.assignee);
    return `<div class="bl-row ${typeIndent[w.type] || ''}" onclick="openWIModal(${w.id})">` +
      `<div class="bl-bar" style="background:${typeColor[w.type] || 'var(--text3)'}"></div>` +
      `${badge('type', w.type)}` +
      `<div class="bl-title">${w.title}</div>` +
      `${badge('status', w.status)} ${badge('prio', w.priority)}` +
      `${m ? `<div class="t-av" style="width:22px;height:22px;font-size:9px">${avEl(m, 22)}</div>` : ''}` +
      `<div class="bl-pts">${w.pts}pts</div>` +
      `</div>`;
  }).join('');
}

// ══════════════════════════════════════════
// SPRINTS
// ══════════════════════════════════════════
function renderSprints() {
  const el = document.getElementById('sprints-list');
  if (!el) return;
  
  if (!D.sprints.length) { 
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">⚡ Aucun sprint</div>'; 
    return; 
  }
  
  el.innerHTML = D.sprints.map(s => {
    const pct = s.pts_total ? Math.round(s.pts_done / s.pts_total * 100) : 0;
    const items = D.workItems.filter(w => w.sprint === s.id);
    
    return `<div class="sprint-card">` +
      `<div class="sprint-head">` +
      `<div style="flex:1"><div class="sprint-name">${s.name}</div><div class="sprint-dates">${fd(s.start)} → ${fd(s.end)} · ${s.project_name || 'Projet'}</div></div>` +
      `${badge('status', s.status)}` +
      `<div class="sprint-kpi"><div class="kpi-val" style="color:var(--accent)">${s.pts_done}</div><div class="kpi-lbl">livrés</div></div>` +
      `<div class="sprint-kpi"><div class="kpi-val">${s.pts_total}</div><div class="kpi-lbl">total</div></div>` +
      `<div class="sprint-kpi"><div class="kpi-val" style="color:var(--green)">${pct}%</div><div class="kpi-lbl">vélocité</div></div>` +
      `</div>` +
      `<div class="sp-pbar"><div class="sp-fill" style="width:${pct}%"></div></div>` +
      `<div style="display:flex;gap:8px;flex-wrap:wrap">` +
      `${items.slice(0, 8).map(w => `<span style="font-size:10px">${badge('type', w.type)} ${(w.title || '').substring(0, 30)}</span>`).join('<span style="color:var(--border2);margin:0 2px">·</span>')} ` +
      `${items.length > 8 ? `<span style="font-size:10px;color:var(--text3)">+${items.length - 8} autres</span>` : ''}` +
      `</div></div>`;
  }).join('');
}

// ══════════════════════════════════════════
// TENDERS
// ══════════════════════════════════════════
const PIPE_COLORS = { 
  'Détection': 'var(--text3)',
  'Qualification': 'var(--blue)',
  'Préparation': 'var(--orange)',
  'Soumis': 'var(--accent)',
  'Gagné': 'var(--green)',
  'Perdu': 'var(--red)'
};

function renderTenders() {
  const stages = ['Détection', 'Qualification', 'Préparation', 'Soumis', 'Gagné', 'Perdu'];
  const pipeline = document.getElementById('ao-pipeline');
  
  if (pipeline) {
    pipeline.innerHTML = stages.map(st => {
      const cnt = D.tenders.filter(t => t.status === st).length;
      const amt = D.tenders.filter(t => t.status === st).reduce((a, t) => a + (t.amount || 0), 0);
      
      return `<div class="pipe-st" onclick="filterAO('${st}')">` +
        `<div class="pipe-name">${st}</div>` +
        `<div class="pipe-count" style="color:${PIPE_COLORS[st]}">${cnt}</div>` +
        `<div class="pipe-amt">${fmt(amt)} FCFA</div>` +
        `<div class="pipe-line" style="background:${PIPE_COLORS[st]}"></div>` +
        `</div>`;
    }).join('');
  }
  
  const sel = document.getElementById('ao-filter-sel');
  const filter = sel ? sel.value : '';
  let tenders = filter ? D.tenders.filter(t => t.status === filter) : D.tenders;
  
  const tbody = document.getElementById('ao-tbody');
  if (!tbody) return;
  
  if (!tenders.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3)">Aucun AO trouvé</td></tr>`;
    return;
  }
  
  tbody.innerHTML = tenders.map(t => {
    const lead = D.members.find(m => m.id === t.lead);
    const initials = (t.org || '').substring(0, 3).toUpperCase();
    
    return `<tr>` +
      `<td><div class="org-wrap"><div class="org-logo" style="background:var(--accent)">${initials}</div>${t.org || ''}</div></td>` +
      `<td style="font-weight:600">${t.title || ''}</td>` +
      `<td style="font-family:var(--mono);color:var(--accent)">${fmt(t.amount)}</td>` +
      `<td>${fd(t.deadline)}</td>` +
      `<td>${badge('ao', t.status)}</td>` +
      `<td>${lead ? `<div style="display:flex;align-items:center;gap:6px">${avEl(lead, 24)}<span style="font-size:11px">${lead.name?.split(' ')[0] || ''}</span></div>` : '—'}</td>` +
      `<td><button class="btn-xs" onclick="openAOModal(${t.id})">✏</button><button class="btn-del" onclick="delAO(${t.id})">✕</button></td>` +
      `</tr>`;
  }).join('');
}

function filterAO(status) {
  const sel = document.getElementById('ao-filter-sel');
  if (sel) { sel.value = status; renderTenders(); }
}

// ══════════════════════════════════════════
// ÉQUIPE
// ══════════════════════════════════════════
function renderTeam() {
  const grid = document.getElementById('team-grid');
  if (!grid) return;
  
  if (!D.members.length) { 
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);grid-column:1/-1">👥 Aucun membre</div>'; 
    return; 
  }
  
  grid.innerHTML = D.members.map(m => {
    const total = D.workItems.filter(w => w.assignee === m.id).length;
    const active = D.workItems.filter(w => w.assignee === m.id && w.status === 'En cours').length;
    const done = D.workItems.filter(w => w.assignee === m.id && w.status === 'Terminé').length;
    const projs = new Set(D.workItems.filter(w => w.assignee === m.id && w.project).map(w => w.project)).size;
    
    return `<div class="member-card">` +
      `<div class="member-head">` + avEl(m, 44) +
      `<div><div class="member-name">${m.name}</div><div class="member-role">${m.role || '—'}</div></div>` +
      `</div>` +
      `<div class="m-stats">` +
      `<div class="m-stat"><div class="m-stat-val" style="color:var(--accent)">${active}</div><div class="m-stat-lbl">Actifs</div></div>` +
      `<div class="m-stat"><div class="m-stat-val" style="color:var(--green)">${done}</div><div class="m-stat-lbl">Terminés</div></div>` +
      `<div class="m-stat"><div class="m-stat-val" style="color:var(--blue)">${projs}</div><div class="m-stat-lbl">Projets</div></div>` +
      `</div></div>`;
  }).join('');
}

// ══════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════
function renderAnalytics() {
  const active = D.workItems.filter(w => w.status === 'En cours').length;
  const done = D.workItems.filter(w => w.status === 'Terminé').length;
  const total = D.workItems.length;
  const gainedAO = D.tenders.filter(t => t.status === 'Gagné').length;
  const totalAO = D.tenders.length;
  const rate = totalAO ? Math.round(gainedAO / totalAO * 100) : 0;
  
  const ast = document.getElementById('an-stats');
  if (ast) {
    ast.innerHTML = [
      ['Total Work Items', total, 'c-accent', '📋'],
      ['Taux de complétion', `${done}/${total}`, 'c-green', '✅'],
      ['Taux de réussite AO', `${rate}%`, 'c-blue', '🏆'],
      ['Membres actifs', D.members.length, 'c-purple', '👥']
    ].map(([lbl, val, cls, icon]) => 
      `<div class="stat-card ${cls}">` +
      `<div class="stat-value">${val}</div>` +
      `<div class="stat-label">${lbl}</div>` +
      `<div class="stat-icon">${icon}</div>` +
      `</div>`
    ).join('');
  }
  
  const vel = document.getElementById('an-velocity');
  if (vel) {
    const maxPts = Math.max(1, ...D.sprints.map(s => s.pts_done || 0));
    vel.innerHTML = D.sprints.slice(0, 5).map(s => 
      `<div class="chart-row">` +
      `<div class="chart-lbl" style="font-size:10px">${(s.name || '').substring(0, 12)}</div>` +
      `<div class="chart-track"><div class="chart-fill" style="width:${(s.pts_done / maxPts * 100)}%;background:var(--accent)"></div></div>` +
      `<div class="chart-val">${s.pts_done}</div>` +
      `</div>`
    ).join('') || '<div style="text-align:center;padding:20px;color:var(--text3)">Aucun sprint</div>';
  }
  
  const prioEl = document.getElementById('an-prio');
  if (prioEl) {
    const prios = { 'Haute': 0, 'Moyenne': 0, 'Basse': 0 };
    D.workItems.forEach(w => { if (prios[w.priority] !== undefined) prios[w.priority]++; });
    const maxP = Math.max(1, ...Object.values(prios));
    const pCols = { 'Haute': 'var(--red)', 'Moyenne': 'var(--orange)', 'Basse': 'var(--green)' };
    
    prioEl.innerHTML = Object.entries(prios).map(([p, c]) => 
      `<div class="chart-row">` +
      `<div class="chart-lbl">${p}</div>` +
      `<div class="chart-track"><div class="chart-fill" style="width:${(c / maxP * 100)}%;background:${pCols[p]}"></div></div>` +
      `<div class="chart-val">${c}</div>` +
      `</div>`
    ).join('');
  }
  
  const aprog = document.getElementById('an-progress');
  if (aprog) {
    aprog.innerHTML = D.projects.map(p => 
      `<div style="margin-bottom:12px">` +
      `<div style="display:flex;justify-content:space-between;margin-bottom:5px">` +
      `<span style="font-size:12px;color:var(--text2)">${(p.name || '').substring(0, 28)}</span>` +
      `<span style="font-family:var(--mono);font-size:11px;color:${STATUS_COLORS[p.status] || 'var(--text3)'}">${p.progress || 0}%</span>` +
      `</div>` +
      `<div class="progress-wrap"><div class="progress-bar" style="width:${p.progress || 0}%;background:${STATUS_COLORS[p.status] || 'var(--accent)'}"></div></div>` +
      `</div>`
    ).join('');
  }
  
  const kpis = document.getElementById('an-kpis');
  if (kpis) {
    kpis.innerHTML = [
      ['AO gagnés', gainedAO, 'var(--green)'],
      ['AO en cours', D.tenders.filter(t => !['Gagné', 'Perdu'].includes(t.status)).length, 'var(--accent)'],
      ['Sprints actifs', D.sprints.filter(s => s.status === 'En cours').length, 'var(--blue)'],
      ['Bugs ouverts', D.workItems.filter(w => w.type === 'bug' && w.status !== 'Terminé').length, 'var(--red)'],
    ].map(([n, v, c]) => 
      `<div class="kpi-box">` +
      `<div class="kpi-name">${n}</div>` +
      `<div class="kpi-val-big" style="color:${c}">${v}</div>` +
      `</div>`
    ).join('');
  }
}

// ══════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════
function om(id) { document.getElementById(id)?.classList.add('open'); }
function cm(id) { document.getElementById(id)?.classList.remove('open'); }

function openWIModal(id = null, defaultStatus = null) {
  editWIId = id;
  const label = document.getElementById('mwi-label');
  if (label) label.textContent = id ? 'Modifier le ticket' : 'Nouveau ticket';
  
  const asel = document.getElementById('wi-assignee');
  if (asel) {
    asel.innerHTML = '<option value="">— Non assigné —</option>' + 
      D.members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  }
  
  const psel = document.getElementById('wi-project');
  if (psel) {
    psel.innerHTML = '<option value="">— Aucun projet —</option>' + 
      D.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }
  
  if (id) {
    const w = D.workItems.find(x => x.id == id);
    if (w) {
      const fields = ['wi-title', 'wi-type', 'wi-prio', 'wi-status', 'wi-pts', 'wi-assignee', 'wi-project', 'wi-due', 'wi-desc'];
      const values = [w.title, w.type, w.priority, w.status, w.pts, w.assignee, w.project, w.due, w.description];
      fields.forEach((fid, i) => {
        const el = document.getElementById(fid);
        if (el) el.value = values[i] || '';
      });
    }
  } else {
    ['wi-title', 'wi-due', 'wi-desc'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) el.value = '';
    });
    const typeEl = document.getElementById('wi-type');
    const prioEl = document.getElementById('wi-prio');
    const statusEl = document.getElementById('wi-status');
    const ptsEl = document.getElementById('wi-pts');
    if (typeEl) typeEl.value = 'task';
    if (prioEl) prioEl.value = 'Moyenne';
    if (statusEl) statusEl.value = defaultStatus || 'Backlog';
    if (ptsEl) ptsEl.value = '5';
  }
  om('modal-wi');
}

async function saveWI() {
  const title = document.getElementById('wi-title')?.value.trim();
  if (!title) { toast('Le titre est obligatoire', 'error', '⚠'); return; }
  
  const payload = {
    title, 
    type: document.getElementById('wi-type')?.value,
    priority: document.getElementById('wi-prio')?.value,
    status: document.getElementById('wi-status')?.value,
    pts: parseInt(document.getElementById('wi-pts')?.value) || 5,
    assignee: document.getElementById('wi-assignee')?.value || null,
    project: document.getElementById('wi-project')?.value || null,
    due: document.getElementById('wi-due')?.value || null,
    description: document.getElementById('wi-desc')?.value
  };
  
  const url = editWIId ? `${API}/workitems/${editWIId}/` : `${API}/workitems/`;
  const method = editWIId ? 'PUT' : 'POST';
  
  const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
  if (res?.ok) {
    cm('modal-wi');
    await loadAll();
    toast(editWIId ? 'Ticket mis à jour' : 'Ticket créé', 'success', '✅');
  } else toast('Erreur lors de l\'enregistrement', 'error', '⚠');
}

function openProjModal(id = null) {
  editProjId = id;
  const label = document.getElementById('mproj-label');
  if (label) label.textContent = id ? 'Modifier le projet' : 'Nouveau projet';
  
  const msel = document.getElementById('proj-members');
  if (msel) {
    msel.innerHTML = D.members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  }
  
  if (id) {
    const p = D.projects.find(x => x.id == id);
    if (p) {
      const fields = ['proj-name', 'proj-desc', 'proj-cat', 'proj-status', 'proj-progress', 'proj-deadline'];
      const values = [p.name, p.description, p.category, p.status, p.progress, p.deadline];
      fields.forEach((fid, i) => {
        const el = document.getElementById(fid);
        if (el) el.value = values[i] || '';
      });
      
      if (msel) {
        const ids = (p.members_detail || []).map(m => String(m.id));
        Array.from(msel.options).forEach(o => { o.selected = ids.includes(o.value); });
      }
    }
  } else {
    ['proj-name', 'proj-desc', 'proj-deadline'].forEach(i => {
      const el = document.getElementById(i);
      if (el) el.value = '';
    });
    const progEl = document.getElementById('proj-progress');
    const statEl = document.getElementById('proj-status');
    if (progEl) progEl.value = '0';
    if (statEl) statEl.value = 'Planifié';
  }
  om('modal-proj');
}

async function saveProj() {
  const name = document.getElementById('proj-name')?.value.trim();
  if (!name) { toast('Le nom est obligatoire', 'error', '⚠'); return; }
  
  const msel = document.getElementById('proj-members');
  const members = msel ? Array.from(msel.selectedOptions).map(o => parseInt(o.value)) : [];
  
  const payload = {
    name, 
    description: document.getElementById('proj-desc')?.value,
    category: document.getElementById('proj-cat')?.value,
    status: document.getElementById('proj-status')?.value,
    progress: parseInt(document.getElementById('proj-progress')?.value) || 0,
    deadline: document.getElementById('proj-deadline')?.value || null,
    members
  };
  
  const url = editProjId ? `${API}/projects/${editProjId}/` : `${API}/projects/`;
  const method = editProjId ? 'PUT' : 'POST';
  
  const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
  if (res?.ok) {
    cm('modal-proj');
    await loadAll();
    toast(editProjId ? 'Projet mis à jour' : 'Projet créé', 'success', '✅');
  } else toast('Erreur lors de l\'enregistrement', 'error', '⚠');
}

function openAOModal(id = null) {
  editAOId = id;
  const lsel = document.getElementById('ao-lead');
  if (lsel) {
    lsel.innerHTML = '<option value="">— Responsable —</option>' + 
      D.members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  }
  
  if (id) {
    const t = D.tenders.find(x => x.id == id);
    if (t) {
      const fields = ['ao-title', 'ao-org', 'ao-amount', 'ao-deadline', 'ao-status', 'ao-lead'];
      const values = [t.title, t.org, t.amount, t.deadline, t.status, t.lead];
      fields.forEach((fid, i) => {
        const el = document.getElementById(fid);
        if (el) el.value = values[i] || '';
      });
    }
  } else {
    ['ao-title', 'ao-org', 'ao-deadline'].forEach(i => {
      const el = document.getElementById(i);
      if (el) el.value = '';
    });
  }
  om('modal-ao');
}

async function saveAO() {
  const title = document.getElementById('ao-title')?.value.trim();
  if (!title) { toast('Le titre est obligatoire', 'error', '⚠'); return; }
  
  const payload = {
    title, 
    org: document.getElementById('ao-org')?.value,
    amount: parseInt(document.getElementById('ao-amount')?.value) || 0,
    deadline: document.getElementById('ao-deadline')?.value || null,
    status: document.getElementById('ao-status')?.value,
    lead: document.getElementById('ao-lead')?.value || null
  };
  
  const url = editAOId ? `${API}/tenders/${editAOId}/` : `${API}/tenders/`;
  const method = editAOId ? 'PUT' : 'POST';
  
  const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
  if (res?.ok) {
    cm('modal-ao');
    await loadAll();
    toast(editAOId ? 'AO mis à jour' : 'AO ajouté', 'success', '✅');
  } else toast('Erreur', 'error', '⚠');
}

async function delAO(id) {
  if (!confirm('Supprimer cet appel d\'offres ?')) return;
  const res = await apiFetch(`${API}/tenders/${id}/`, { method: 'DELETE' });
  if (res?.ok || res?.status === 204) { 
    await loadAll(); 
    toast('AO supprimé', 'info', '🗑'); 
  }
}

async function saveMember() {
  const name = document.getElementById('mem-name')?.value.trim();
  if (!name) { toast('Le nom est obligatoire', 'error', '⚠'); return; }
  
  const payload = {
    name, 
    role: document.getElementById('mem-role')?.value,
    initials: (document.getElementById('mem-init')?.value || name.substring(0, 2)).toUpperCase(),
    color: document.getElementById('mem-color')?.value || '#e8a020'
  };
  
  const res = await apiFetch(`${API}/members/`, { method: 'POST', body: JSON.stringify(payload) });
  if (res?.ok) {
    cm('modal-member');
    await loadAll();
    toast('Membre ajouté', 'success', '✅');
  } else toast('Erreur', 'error', '⚠');
}

function openAdd() {
  const ctx = { board: 'wi', projects: 'proj', tenders: 'ao', team: 'member' };
  const modal = ctx[currentPage];
  
  if (modal === 'wi') openWIModal();
  else if (modal === 'proj') openProjModal();
  else if (modal === 'ao') openAOModal();
  else if (modal === 'member') om('modal-member');
  else openWIModal();
}

// ══════════════════════════════════════════
// TOASTS
// ══════════════════════════════════════════
function toast(msg, type = 'info', icon = 'ℹ') {
  const container = document.getElementById('toasts');
  if (!container) return;
  
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icon}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ══════════════════════════════════════════
// FERMER MODALS
// ══════════════════════════════════════════
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { 
    if (e.target === overlay) overlay.classList.remove('open'); 
  });
});

// ENTER dans login
document.addEventListener('keydown', e => {
  const loginScreen = document.getElementById('login-screen');
  if (e.key === 'Enter' && loginScreen && loginScreen.style.display !== 'none') doLogin();
});

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
(function init() {
  const token = getToken();
  const user = getUser();
  
  if (token && user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    updateUserBar(user);
    loadAll();
  }
})();

// ══════════════════════════════════════════
// INTÉGRATION ALERTES & CALENDRIER
// ══════════════════════════════════════════

// Mettre à jour PAGE_TITLES et PAGE_SUBS
PAGE_TITLES.calendar = 'Calendrier & Alertes';
PAGE_SUBS.calendar = 'Deadlines · Risques · Timeline Gantt';

// Ajouter calendar dans renderPage
const fn = {
  dashboard: renderDashboard,
  projects: renderProjects,
  board: renderBoard,
  backlog: renderBacklog,
  sprints: renderSprints,
  tenders: renderTenders,
  team: renderTeam,
  analytics: renderAnalytics,
  calendar: renderCalendar
}[page];

// Rafraîchir les chips
function updateChips() {
  const active = D.workItems.filter(w => w.status === 'En cours').length;
  const aos = D.tenders.filter(t => !['Gagné', 'Perdu'].includes(t.status)).length;
  const alerts = _alerts?.filter(a => a.level === 'critical').length || 0;
  
  const chip1 = document.getElementById('chip-board');
  const chip2 = document.getElementById('chip-ao');
  const chip3 = document.getElementById('chip-calendar');
  
  if (chip1) chip1.textContent = active;
  if (chip2) chip2.textContent = aos;
  if (chip3) chip3.textContent = alerts;
}