/**
 * app.js — KICEKO ProjectHub v2
 * Correctifs : loading overlay, dashboard fallback,
 * membres robuste, calendrier intégré, RBAC complet
 */

const API = '/api';

// ══════════════════════════════════════════
// ÉTAT GLOBAL
// ══════════════════════════════════════════
const D = { projects:[], members:[], workItems:[], tenders:[], sprints:[] };
let currentPage = 'dashboard';
let boardFilter  = '';
let editProjId   = null;
let editAOId     = null;
let editWIId     = null;
let dashStats    = null;

// ══════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════
function getToken() { return localStorage.getItem('kh_access'); }
function getUser()  {
  try { return JSON.parse(localStorage.getItem('kh_user')); } catch { return null; }
}
function authHeaders() {
  return { 'Content-Type':'application/json', 'Authorization':`Bearer ${getToken()}` };
}

async function doLogin() {
  const u   = document.getElementById('login-user')?.value.trim();
  const p   = document.getElementById('login-pass')?.value;
  const err = document.getElementById('login-err');
  if (err) err.style.display = 'none';
  if (!u || !p) { showErr('Remplis tous les champs.'); return; }

  try {
    const res  = await fetch(`${API}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ username:u, password:p })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Identifiants incorrects');

    localStorage.setItem('kh_access',  data.access);
    localStorage.setItem('kh_refresh', data.refresh);
    localStorage.setItem('kh_user',    JSON.stringify(data.user));

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display          = 'flex';
    updateUserBar(data.user);
    await loadAll();
  } catch(e) { showErr(e.message); }
}

function showErr(msg) {
  const err = document.getElementById('login-err');
  if (err) { err.textContent = msg; err.style.display = 'block'; }
}

async function refreshToken() {
  const ref = localStorage.getItem('kh_refresh');
  if (!ref) return false;
  const res = await fetch(`${API}/auth/refresh/`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ refresh:ref })
  });
  if (res.ok) { const d = await res.json(); localStorage.setItem('kh_access', d.access); return true; }
  return false;
}

async function apiFetch(url, opts={}) {
  let res = await fetch(url, { ...opts, headers:{ ...authHeaders(), ...(opts.headers||{}) } });
  if (res.status === 401) {
    const ok = await refreshToken();
    if (ok) res = await fetch(url, { ...opts, headers:authHeaders() });
    else { doLogout(); return null; }
  }
  return res;
}

function doLogout() {
  ['kh_access','kh_refresh','kh_user'].forEach(k => localStorage.removeItem(k));
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display          = 'none';
}

function updateUserBar(user) {
  if (!user) return;
  const name = user.first_name || user.username;
  const el   = document.getElementById('user-name');
  if (el) el.textContent = name.split(' ')[0];
  const av = document.getElementById('user-av');
  if (av) {
    av.textContent      = (user.member_initials || name.substring(0,2)).toUpperCase();
    av.style.background = user.member_color || 'var(--accentbg)';
    av.style.color      = user.member_color ? '#000' : 'var(--accent)';
  }
  const rl = document.getElementById('user-role-lbl');
  const icons = { admin:'👑 Administrateur', manager:'🎯 Manager', member:'👤 Membre' };
  if (rl) rl.textContent = icons[user.role] || 'Se déconnecter';
  const roleLabel = document.getElementById('role-label');
  if (roleLabel) roleLabel.textContent = (user.role||'workspace').toUpperCase();
}

// ══════════════════════════════════════════
// CHARGEMENT DONNÉES
// ══════════════════════════════════════════
async function loadAll() {
  // ✅ FIX LOADING : utiliser classList.add, pas style.display
  const loading = document.getElementById('app-loading');
  if (loading) loading.classList.add('active');

  try {
    const safe = async (promise) => { try { return await promise; } catch { return null; } };

    const [pr, mb, wi, tn, sp, ds] = await Promise.all([
      safe(apiFetch(`${API}/projects/?page_size=200`).then(r  => r?.json())),
      safe(apiFetch(`${API}/members/?page_size=200`).then(r   => r?.json())),
      safe(apiFetch(`${API}/workitems/?page_size=500`).then(r => r?.json())),
      safe(apiFetch(`${API}/tenders/?page_size=200`).then(r   => r?.json())),
      safe(apiFetch(`${API}/sprints/?page_size=100`).then(r   => r?.json())),
      safe(apiFetch(`${API}/dashboard/`).then(r               => r?.json())),
    ]);

    D.projects  = pr?.results  || (Array.isArray(pr)  ? pr  : []);
    D.members   = mb?.results  || (Array.isArray(mb)  ? mb  : []);
    D.workItems = wi?.results  || (Array.isArray(wi)  ? wi  : []);
    D.tenders   = tn?.results  || (Array.isArray(tn)  ? tn  : []);
    D.sprints   = sp?.results  || (Array.isArray(sp)  ? sp  : []);
    dashStats   = ds || null;

    console.log('✅ Données:', {
      projets:D.projects.length, membres:D.members.length,
      workItems:D.workItems.length, tenders:D.tenders.length
    });

    renderSidebar();
    renderPage(currentPage);
    updateChips();

  } catch(e) {
    console.error('❌ loadAll error:', e);
    toast('Erreur de chargement des données', 'error', '⚠');
  } finally {
    // ✅ FIX LOADING : toujours masquer, même en cas d'erreur
    const loading = document.getElementById('app-loading');
    if (loading) loading.classList.remove('active');
  }
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
const PAGE_TITLES = {
  dashboard:'Dashboard', projects:'Projets', board:'Kanban Board',
  backlog:'Product Backlog', sprints:'Sprints', tenders:"Appels d'offres",
  team:'Équipe', analytics:'Analytics', calendar:'Calendrier & Alertes',
  'my-space':'Mon Espace', decision:'Aide à la décision', users:'Gestion Utilisateurs'
};
const PAGE_SUBS = {
  dashboard:"Vue d'ensemble · KICEKO", projects:'Tous les projets actifs',
  board:'Gestion visuelle des tickets', backlog:'Liste priorisée des items',
  sprints:'Itérations agiles', tenders:'Pipeline commercial',
  team:"Membres de l'équipe", analytics:'Métriques & KPIs',
  calendar:'Deadlines · Risques · Timeline',
  'my-space':'Mes projets et tâches assignées',
  decision:'Analyse SWOT · Recommandations · Risques',
  users:'Rôles & accès · Administration'
};

function nav(page, el) {
  document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
  if (el) el.classList.add('active');
  else {
    const match = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (match) match.classList.add('active');
  }
  currentPage = page;
  const tbTitle = document.getElementById('tb-title');
  const tbSub   = document.getElementById('tb-sub');
  if (tbTitle) tbTitle.textContent = PAGE_TITLES[page] || page;
  if (tbSub)   tbSub.textContent   = PAGE_SUBS[page]   || '';
  renderPage(page);
}

function renderPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(`page-${page}`);
  if (pg) pg.classList.add('active');

  const renderers = {
    dashboard:  renderDashboard,
    projects:   renderProjects,
    board:      renderBoard,
    backlog:    renderBacklog,
    sprints:    renderSprints,
    tenders:    renderTenders,
    team:       renderTeam,
    analytics:  renderAnalytics,
    calendar:   renderCalendarInline,
    'my-space': renderMySpaceInline,
    decision:   renderDecisionInline,
    users:      renderUsersInline,
  };
  if (renderers[page]) renderers[page]();
}

// ══════════════════════════════════════════
// SIDEBAR
// ══════════════════════════════════════════
const STATUS_COLORS = {
  'En cours':'#22c55e', 'Planifié':'#3b82f6',
  'En attente':'#f97316', 'Terminé':'#64748b', 'Bloqué':'#ef4444'
};

function renderSidebar() {
  const el = document.getElementById('sb-projects');
  if (!el) return;
  const active = D.projects.filter(p => p.status !== 'Terminé').slice(0, 6);
  el.innerHTML = active.length ? active.map(p =>
    `<div class="sb-proj" onclick="nav('projects',null)" style="cursor:pointer">
      <div class="sb-dot" style="background:${STATUS_COLORS[p.status]||'#64748b'}"></div>
      <div class="sb-label">${p.name}</div>
    </div>`
  ).join('') : '<div style="font-size:11px;color:var(--text3);padding:8px 10px">Aucun projet actif</div>';

  // Appliquer RBAC sur la sidebar
  applyRBAC();
}

function updateChips() {
  const active = D.workItems.filter(w => w.status === 'En cours').length;
  const aos    = D.tenders.filter(t => !['Gagné','Perdu'].includes(t.status)).length;
  const c1 = document.getElementById('chip-board');
  const c2 = document.getElementById('chip-ao');
  const c3 = document.getElementById('chip-alerts');
  if (c1) c1.textContent = active;
  if (c2) c2.textContent = aos;
  // Alertes critiques : deadlines < 7j
  const now = new Date();
  const critiques = D.projects.filter(p => {
    if (!p.deadline || p.status === 'Terminé') return false;
    return Math.floor((new Date(p.deadline) - now) / 86400000) <= 7;
  }).length;
  if (c3) {
    c3.textContent = critiques;
    c3.style.display = critiques > 0 ? 'inline-flex' : 'none';
  }
}

// ══════════════════════════════════════════
// RBAC
// ══════════════════════════════════════════
function getUserRole() {
  const u = getUser();
  return u?.role || 'member';
}

function applyRBAC() {
  const role = getUserRole();
  const HIDDEN = {
    member: ['board','backlog','sprints','tenders','analytics','users','decision']
  };
  const toHide = HIDDEN[role] || [];

  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.getAttribute('data-page');
    el.style.display = toHide.includes(page) ? 'none' : '';
  });

  // Masquer bouton Nouveau pour les membres
  const newBtn = document.querySelector('[onclick="openAdd()"]');
  if (newBtn) newBtn.style.display = (role === 'member') ? 'none' : '';
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function gM(id) { return D.members.find(m => m.id == id); }
function gP(id) { return D.projects.find(p => p.id == id); }
function fd(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }); }
  catch { return d; }
}
function fmt(n) { return Number(n||0).toLocaleString('fr-FR'); }

function avEl(m, size=32) {
  if (!m) return '';
  const bg  = m.color || 'var(--accentbg)';
  const col = m.color ? '#000' : 'var(--accent)';
  return `<div class="av" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.34)}px;background:${bg};color:${col}">${m.initials||'?'}</div>`;
}

function badge(type, val) {
  const MAP = {
    status:{ 'En cours':'b-green','Planifié':'b-blue','En attente':'b-orange','Terminé':'b-gray','Bloqué':'b-red' },
    type:  { epic:'b-purple',feature:'b-teal',story:'b-blue',task:'b-green',bug:'b-red',ao:'b-accent' },
    prio:  { Haute:'b-red',Moyenne:'b-orange',Basse:'b-green' },
    ao:    { Détection:'b-gray',Qualification:'b-blue',Préparation:'b-orange',Soumis:'b-accent',Gagné:'b-green',Perdu:'b-red' }
  };
  return `<span class="badge ${(MAP[type]||{})[val]||'b-gray'}">${val||''}</span>`;
}

function animCount(el, target, dur=900) {
  if (!el) return;
  const start = Date.now();
  const step  = () => {
    const p = Math.min(1,(Date.now()-start)/dur);
    el.textContent = Math.round(p * target);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ══════════════════════════════════════════
// DASHBOARD — avec fallback local
// ══════════════════════════════════════════
function buildLocalStats() {
  // Calcule les stats depuis D.* si l'API dashboard échoue
  const wbs = {};
  ['Backlog','A faire','En cours','Review','Terminé'].forEach(s => {
    wbs[s] = D.workItems.filter(w => w.status === s).length;
  });
  const aoS = {};
  ['Détection','Qualification','Préparation','Soumis','Gagné','Perdu'].forEach(s => {
    aoS[s] = D.tenders.filter(t => t.status === s).length;
  });
  const sp = D.sprints.find(s => s.status === 'En cours');
  return {
    active_items:    wbs['En cours'] || 0,
    active_projects: D.projects.filter(p => p.status === 'En cours').length,
    done_items:      wbs['Terminé'] || 0,
    total_tenders:   D.tenders.filter(t => !['Gagné','Perdu'].includes(t.status)).length,
    backlog_items:   wbs['Backlog'] || 0,
    items_by_status: wbs,
    ao_by_status:    aoS,
    active_sprint:   sp || null,
    recent_projects: D.projects.slice(0,5).map(p => ({
      id:p.id, name:p.name, status:p.status, progress:p.progress||0,
      deadline:p.deadline, category:p.category
    }))
  };
}

function renderDashboard() {
  // ✅ FIX : utilise les données locales si dashStats est null
  const s = dashStats || buildLocalStats();

  // Stat cards
  const vals = [s.active_items, s.active_projects, s.done_items, s.total_tenders];
  ['s1','s2','s3','s4'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) animCount(el, vals[i]);
  });

  const changes = [
    { el:'s1c', txt:`${s.backlog_items||0} en backlog`,                        cls:'neutral' },
    { el:'s2c', txt:`${D.projects.filter(p=>p.status==='Planifié').length} planifiés`, cls:'neutral' },
    { el:'s3c', txt:'↑ Progression',                                           cls:'up'      },
    { el:'s4c', txt:`${(s.ao_by_status||{})['Gagné']||0} gagnés`,             cls:'up'      }
  ];
  changes.forEach(({el,txt,cls}) => {
    const e = document.getElementById(el);
    if (e) { e.textContent = txt; e.className = 'stat-change '+cls; }
  });

  // Projets récents
  const dp = document.getElementById('d-projects');
  if (dp) {
    const projs = s.recent_projects || D.projects.slice(0,4);
    dp.innerHTML = projs.length ? projs.map(p =>
      `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
        <div style="width:4px;height:36px;border-radius:4px;background:${STATUS_COLORS[p.status]||'#64748b'};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
          <div style="margin-top:4px">
            <div class="progress-wrap" style="margin-bottom:0">
              <div class="progress-bar" style="width:${p.progress||0}%"></div>
            </div>
          </div>
        </div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text3);flex-shrink:0">${p.progress||0}%</div>
        ${badge('status', p.status)}
      </div>`
    ).join('') : '<div style="text-align:center;padding:20px;color:var(--text3)">📁 Aucun projet</div>';
  }

  // Activité récente
  const acts = [
    ...D.workItems.slice(0,3).map(w => ({ icon:'✅', bg:'var(--greenbg)', text:`<strong>${(w.title||'').substring(0,35)}</strong>`, color:'var(--green)' })),
    ...D.tenders.slice(0,2).map(t => ({ icon:'📄', bg:'var(--accentbg)', text:`AO <strong>${t.org}</strong> — ${t.status}`, color:'var(--accent)' }))
  ].slice(0,5);

  const da = document.getElementById('d-activity');
  if (da) {
    da.innerHTML = acts.length ? acts.map(a =>
      `<div class="act-item">
        <div class="act-icon" style="background:${a.bg};color:${a.color}">${a.icon}</div>
        <div><div class="act-text">${a.text}</div><div class="act-time">Récent</div></div>
      </div>`
    ).join('') : '<div style="text-align:center;padding:16px;color:var(--text3)">Aucune activité récente</div>';
  }

  // WI par statut
  const wbs  = s.items_by_status || {};
  const cols  = ['Backlog','A faire','En cours','Review','Terminé'];
  const wCols = ['var(--text3)','var(--blue)','var(--accent)','var(--purple)','var(--green)'];
  const maxW  = Math.max(1, ...cols.map(c => wbs[c]||0));
  const dc = document.getElementById('d-wi-chart');
  if (dc) {
    dc.innerHTML = cols.map((c,i) =>
      `<div class="chart-row">
        <div class="chart-lbl">${c}</div>
        <div class="chart-track"><div class="chart-fill" style="width:${((wbs[c]||0)/maxW*100)}%;background:${wCols[i]}"></div></div>
        <div class="chart-val">${wbs[c]||0}</div>
      </div>`
    ).join('');
  }

  // Sprint actif
  const dsp = document.getElementById('d-sprint');
  if (dsp) {
    const sp = D.sprints.find(s => s.status === 'En cours');
    dsp.innerHTML = sp
      ? `<div style="font-size:13px;font-weight:700;margin-bottom:6px">${sp.name}</div>
         <div style="font-size:11px;color:var(--text3);margin-bottom:10px;font-family:var(--mono)">${fd(sp.start)} → ${fd(sp.end)}</div>
         <div class="sp-pbar"><div class="sp-fill" style="width:${sp.pts_total?Math.round(sp.pts_done/sp.pts_total*100):0}%"></div></div>
         <div style="display:flex;gap:16px;margin-top:8px">
           <div class="sprint-kpi" style="padding:0;border:none"><div class="kpi-val" style="color:var(--accent)">${sp.pts_done}</div><div class="kpi-lbl">livrés</div></div>
           <div class="sprint-kpi"><div class="kpi-val">${sp.pts_total}</div><div class="kpi-lbl">total</div></div>
         </div>`
      : '<div style="text-align:center;padding:20px;color:var(--text3)">⚡ Aucun sprint actif</div>';
  }

  // Alertes dans le dashboard
  renderDashboardAlerts();

  // Pipeline AO
  const dao = document.getElementById('d-ao-quick');
  if (dao) {
    const aoS = s.ao_by_status || {};
    dao.innerHTML = [
      ['Détection','var(--text3)'],['Qualification','var(--blue)'],
      ['Préparation','var(--orange)'],['Soumis','var(--accent)'],
      ['Gagné','var(--green)'],['Perdu','var(--red)']
    ].map(([st,cl]) =>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;color:var(--text2)">${st}</div>
        <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${cl}">${aoS[st]||0}</div>
      </div>`
    ).join('');
  }
}

function renderDashboardAlerts() {
  const el  = document.getElementById('d-alerts-summary');
  if (!el) return;
  const now    = new Date();
  const alerts = [];

  D.projects.forEach(p => {
    if (!p.deadline || p.status === 'Terminé') return;
    const diff = Math.floor((new Date(p.deadline) - now) / 86400000);
    if (diff < 0)      alerts.push({ level:'critical', title:p.name, desc:`Deadline dépassée de ${Math.abs(diff)}j` });
    else if (diff <= 7) alerts.push({ level:'warning',  title:p.name, desc:`${diff}j restants · ${p.progress||0}%` });
  });

  const bugs = D.workItems.filter(w => w.type==='bug' && w.status!=='Terminé');
  if (bugs.length >= 2) alerts.push({ level:'warning', title:`${bugs.length} bugs ouverts`, desc:'Dette technique à résorber' });

  if (!alerts.length) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--green);font-size:12px">✅ Aucune alerte critique</div>';
    return;
  }
  const colorMap = { critical:'var(--red)', warning:'var(--orange)', info:'var(--blue)' };
  el.innerHTML = alerts.slice(0,4).map(a =>
    `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="width:8px;height:8px;border-radius:50%;background:${colorMap[a.level]||'var(--blue)'};flex-shrink:0"></div>
      <div style="flex:1;font-size:12px"><strong>${a.title}</strong> — ${a.desc}</div>
    </div>`
  ).join('');
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
  if (lbl) lbl.textContent = `${projects.length} projet${projects.length!==1?'s':''} trouvé${projects.length!==1?'s':''}`;

  const grid = document.getElementById('proj-grid');
  if (!grid) return;

  if (!projects.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">📁</div><div class="empty-text">Aucun projet trouvé</div></div>`;
    return;
  }

  grid.innerHTML = projects.map(p => {
    const color = STATUS_COLORS[p.status] || '#64748b';
    const mems  = (p.members_detail || []).slice(0,4);
    return `<div class="proj-card" onclick="openProjModal(${p.id})">
      <div class="left-bar" style="background:${color}"></div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--text3);font-family:var(--mono);margin-bottom:4px">${p.category||'—'}</div>
          <div class="proj-name">${p.name}</div>
        </div>
        ${badge('status', p.status)}
      </div>
      <div class="proj-desc">${(p.description||'').substring(0,90)}${(p.description||'').length>90?'…':''}</div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${p.progress||0}%;background:${color}"></div></div>
      <div class="proj-footer">
        <div style="display:flex">${mems.map(m=>avEl(m,26)).join('')}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:10px;color:var(--text3)">${p.work_items_count||0} items</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--text3)">${p.progress||0}%</span>
          ${p.deadline?`<span style="font-size:10px;color:var(--text3)">📅 ${fd(p.deadline)}</span>`:''}
        </div>
      </div>
      <button class="btn btn-outline btn-sm" style="width:100%;justify-content:center;margin-top:8px;font-size:10px"
        onclick="event.stopPropagation();openSWOTModal(${p.id})">🧠 Matrice SWOT</button>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// KANBAN BOARD
// ══════════════════════════════════════════
const COLS     = ['Backlog','A faire','En cours','Review','Terminé'];
const COL_HEADS = [
  ['Backlog',  'var(--text3)', 'rgba(100,116,139,.08)'],
  ['À faire',  'var(--blue)',  'rgba(59,130,246,.08)'],
  ['En cours', 'var(--accent)','rgba(14,181,204,.08)'],
  ['Review',   'var(--purple)','rgba(168,85,247,.08)'],
  ['Terminé',  'var(--green)', 'rgba(34,197,94,.08)'],
];

function setBoardFilter(type, btn) {
  boardFilter = type;
  document.querySelectorAll('#board-type-filters .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderBoard();
}

function renderBoard() {
  const sel = document.getElementById('board-proj-sel');
  if (sel && sel.options.length <= 1) D.projects.forEach(p => sel.add(new Option(p.name, p.id)));

  const projId = sel ? sel.value : '';
  let items = [...D.workItems];
  if (projId)      items = items.filter(w => String(w.project) === String(projId));
  if (boardFilter) items = items.filter(w => w.type === boardFilter);

  const board = document.getElementById('kanban-board');
  if (!board) return;

  board.innerHTML = COLS.map((col,i) => {
    const [label,color,bg] = COL_HEADS[i];
    const colItems = items.filter(w => w.status === col);
    return `<div class="k-col">
      <div class="k-col-head" style="background:${bg}">
        <div class="k-col-name" style="color:${color}">${label}</div>
        <div class="k-col-cnt">${colItems.length}</div>
        <button class="k-add-btn" onclick="openWIModal(null,'${col}')">＋</button>
      </div>
      <div class="k-cards">${colItems.map(renderTicket).join('')}</div>
      <div class="k-drop" onclick="openWIModal(null,'${col}')">＋ Ajouter un ticket</div>
    </div>`;
  }).join('');
}

function renderTicket(w) {
  const assignee = D.members.find(m => m.id === w.assignee || m.id == w.assignee);
  const today    = new Date().toISOString().split('T')[0];
  const overdue  = w.due && w.due < today && w.status !== 'Terminé';
  return `<div class="ticket tk-${w.type}" onclick="openWIModal(${w.id})">
    <div class="t-bar"></div>
    <div class="t-top">
      <span class="t-type tt-${w.type}">${(w.type||'').toUpperCase()}</span>
      <span class="t-id">#${w.id}</span>
      <span class="t-prio tp-${(w.priority||'').toLowerCase()}">${w.priority||'—'}</span>
    </div>
    <div class="t-title">${w.title||''}</div>
    <div class="t-foot">
      <span class="t-pts">${w.pts||5}pts</span>
      ${w.due?`<span class="t-due${overdue?' ov':''}">${overdue?'⚠ ':''}${fd(w.due)}</span>`:''}
      ${assignee?`<div class="t-av" style="background:${assignee.color||'var(--accent)'};color:#000">${assignee.initials||'?'}</div>`:''}
    </div>
  </div>`;
}

// ══════════════════════════════════════════
// BACKLOG
// ══════════════════════════════════════════
function renderBacklog() {
  const sel = document.getElementById('bl-proj-sel');
  if (sel && sel.options.length <= 1) D.projects.forEach(p => sel.add(new Option(p.name, p.id)));

  const projId = sel ? sel.value : '';
  let items = projId ? D.workItems.filter(w => String(w.project) === String(projId)) : D.workItems;
  items = [...items].sort((a,b) => {
    const o = { epic:0,feature:1,story:2,task:3,bug:4 };
    return (o[a.type]||5) - (o[b.type]||5);
  });

  const list = document.getElementById('backlog-list');
  if (!list) return;
  if (!items.length) { list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">≡ Backlog vide</div>'; return; }

  const typeIndent = { epic:'',feature:'bl-i1',story:'bl-i2',task:'bl-i3',bug:'bl-i2' };
  const typeColor  = { epic:'var(--purple)',feature:'var(--teal)',story:'var(--blue)',task:'var(--green)',bug:'var(--red)' };

  list.innerHTML = items.map(w => {
    const m = D.members.find(mb => mb.id == w.assignee);
    return `<div class="bl-row ${typeIndent[w.type]||''}" onclick="openWIModal(${w.id})">
      <div class="bl-bar" style="background:${typeColor[w.type]||'var(--text3)'}"></div>
      ${badge('type',w.type)}
      <div class="bl-title">${w.title}</div>
      ${badge('status',w.status)} ${badge('prio',w.priority)}
      ${m?avEl(m,22):''}
      <div class="bl-pts">${w.pts||5}pts</div>
    </div>`;
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
    const pct   = s.pts_total ? Math.round(s.pts_done/s.pts_total*100) : 0;
    const items = D.workItems.filter(w => w.sprint === s.id);
    return `<div class="sprint-card">
      <div class="sprint-head">
        <div style="flex:1">
          <div class="sprint-name">${s.name}</div>
          <div class="sprint-dates">${fd(s.start)} → ${fd(s.end)}</div>
        </div>
        ${badge('status',s.status)}
        <div class="sprint-kpi"><div class="kpi-val" style="color:var(--accent)">${s.pts_done}</div><div class="kpi-lbl">livrés</div></div>
        <div class="sprint-kpi"><div class="kpi-val">${s.pts_total}</div><div class="kpi-lbl">total</div></div>
        <div class="sprint-kpi"><div class="kpi-val" style="color:var(--green)">${pct}%</div><div class="kpi-lbl">vélocité</div></div>
      </div>
      <div class="sp-pbar"><div class="sp-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${items.slice(0,6).map(w=>`<span style="font-size:10px;padding:2px 6px;background:var(--surface);border-radius:4px">${w.title?.substring(0,20)||''}</span>`).join('')}
        ${items.length>6?`<span style="font-size:10px;color:var(--text3)">+${items.length-6}</span>`:''}
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// TENDERS (Appels d'offres)
// ══════════════════════════════════════════
const PIPE_COLORS = {
  Détection:'var(--text3)',Qualification:'var(--blue)',
  Préparation:'var(--orange)',Soumis:'var(--accent)',
  Gagné:'var(--green)',Perdu:'var(--red)'
};

function renderTenders() {
  const pipeline = document.getElementById('ao-pipeline');
  const stages   = ['Détection','Qualification','Préparation','Soumis','Gagné','Perdu'];
  if (pipeline) {
    pipeline.innerHTML = stages.map(st => {
      const cnt = D.tenders.filter(t => t.status===st).length;
      const amt = D.tenders.filter(t => t.status===st).reduce((a,t)=>a+(t.amount||0),0);
      return `<div class="pipe-st" onclick="filterAO('${st}')">
        <div class="pipe-name">${st}</div>
        <div class="pipe-count" style="color:${PIPE_COLORS[st]}">${cnt}</div>
        <div class="pipe-amt">${fmt(amt)} FCFA</div>
        <div class="pipe-line" style="background:${PIPE_COLORS[st]}"></div>
      </div>`;
    }).join('');
  }

  const sel    = document.getElementById('ao-filter-sel');
  const filter = sel ? sel.value : '';
  const tenders = filter ? D.tenders.filter(t=>t.status===filter) : D.tenders;
  const tbody   = document.getElementById('ao-tbody');
  if (!tbody) return;

  if (!tenders.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3)">Aucun AO trouvé</td></tr>`;
    return;
  }
  tbody.innerHTML = tenders.map(t => {
    const lead = D.members.find(m => m.id==t.lead || m.id===t.lead_detail?.id);
    return `<tr>
      <td><div class="org-wrap">
        <div class="org-logo" style="background:var(--accent);color:#000">${(t.org||'?').substring(0,3).toUpperCase()}</div>
        ${t.org||''}
      </div></td>
      <td style="font-weight:600">${t.title||''}</td>
      <td style="font-family:var(--mono);color:var(--accent)">${fmt(t.amount)}</td>
      <td>${fd(t.deadline)}</td>
      <td>${badge('ao',t.status)}</td>
      <td>${lead?`<div style="display:flex;align-items:center;gap:6px">${avEl(lead,24)}<span style="font-size:11px">${lead.name?.split(' ')[0]||''}</span></div>`:'—'}</td>
      <td>
        <button class="btn-xs" onclick="openAOModal(${t.id})">✏</button>
        <button class="btn-del" onclick="delAO(${t.id})">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function filterAO(status) {
  const sel = document.getElementById('ao-filter-sel');
  if (sel) { sel.value = status; renderTenders(); }
}

// ══════════════════════════════════════════
// ÉQUIPE — ✅ FIX membres robuste
// ══════════════════════════════════════════
function renderTeam() {
  const grid = document.getElementById('team-grid');
  if (!grid) return;

  if (!D.members.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px">
        <div style="font-size:36px;margin-bottom:12px;opacity:.3">👥</div>
        <div style="font-size:14px;color:var(--text3);margin-bottom:16px">Aucun membre d'équipe</div>
        <button class="btn btn-primary btn-sm" onclick="om('modal-member')">＋ Ajouter un membre</button>
      </div>`;
    return;
  }

  grid.innerHTML = D.members.map(m => {
    // ✅ FIX : comparaison == (loose) pour gérer string vs int
    const total  = D.workItems.filter(w => w.assignee == m.id).length;
    const active = D.workItems.filter(w => w.assignee == m.id && w.status === 'En cours').length;
    const done   = D.workItems.filter(w => w.assignee == m.id && w.status === 'Terminé').length;
    const projs  = new Set(D.workItems.filter(w => w.assignee == m.id && w.project).map(w=>w.project)).size;
    const bg     = m.color || 'var(--accent)';

    return `<div class="member-card">
      <div class="member-head">
        ${avEl(m, 46)}
        <div>
          <div class="member-name">${m.name}</div>
          <div class="member-role">${m.role||'Membre'}</div>
        </div>
      </div>
      <div class="m-stats">
        <div class="m-stat"><div class="m-stat-val" style="color:var(--accent)">${active}</div><div class="m-stat-lbl">En cours</div></div>
        <div class="m-stat"><div class="m-stat-val" style="color:var(--green)">${done}</div><div class="m-stat-lbl">Terminés</div></div>
        <div class="m-stat"><div class="m-stat-val" style="color:var(--blue)">${projs}</div><div class="m-stat-lbl">Projets</div></div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════
function renderAnalytics() {
  const done     = D.workItems.filter(w => w.status==='Terminé').length;
  const total    = D.workItems.length;
  const gainedAO = D.tenders.filter(t => t.status==='Gagné').length;
  const totalAO  = D.tenders.length;
  const rate     = totalAO ? Math.round(gainedAO/totalAO*100) : 0;

  const ast = document.getElementById('an-stats');
  if (ast) {
    ast.innerHTML = [
      ['Total Work Items', total,          'c-accent','📋'],
      [`${done}/${total} terminés`, `${total?Math.round(done/total*100):0}%`, 'c-green','✅'],
      ['Taux AO gagné',  `${rate}%`,       'c-blue','🏆'],
      ['Membres actifs', D.members.length, 'c-purple','👥']
    ].map(([lbl,val,cls,icon]) =>
      `<div class="stat-card ${cls}"><div class="stat-value">${val}</div><div class="stat-label">${lbl}</div><div class="stat-icon">${icon}</div></div>`
    ).join('');
  }

  const aprog = document.getElementById('an-progress');
  if (aprog) {
    aprog.innerHTML = D.projects.map(p =>
      `<div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <span style="font-size:12px;color:var(--text2)">${(p.name||'').substring(0,28)}</span>
          <span style="font-family:var(--mono);font-size:11px;color:${STATUS_COLORS[p.status]||'var(--text3)'}">${p.progress||0}%</span>
        </div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${p.progress||0}%"></div></div>
      </div>`
    ).join('') || '<div style="text-align:center;padding:20px;color:var(--text3)">Aucun projet</div>';
  }

  const prios = { Haute:0, Moyenne:0, Basse:0 };
  D.workItems.forEach(w => { if (prios[w.priority]!==undefined) prios[w.priority]++; });
  const maxP  = Math.max(1,...Object.values(prios));
  const pCols = { Haute:'var(--red)',Moyenne:'var(--orange)',Basse:'var(--green)' };
  const prioEl = document.getElementById('an-prio');
  if (prioEl) {
    prioEl.innerHTML = Object.entries(prios).map(([p,c]) =>
      `<div class="chart-row">
        <div class="chart-lbl">${p}</div>
        <div class="chart-track"><div class="chart-fill" style="width:${(c/maxP*100)}%;background:${pCols[p]}"></div></div>
        <div class="chart-val">${c}</div>
      </div>`
    ).join('');
  }

  const vel = document.getElementById('an-velocity');
  if (vel) {
    const maxPts = Math.max(1,...D.sprints.map(s=>s.pts_done||0));
    vel.innerHTML = D.sprints.slice(0,5).map(s =>
      `<div class="chart-row">
        <div class="chart-lbl" style="font-size:10px">${(s.name||'').substring(0,12)}</div>
        <div class="chart-track"><div class="chart-fill" style="width:${(s.pts_done/maxPts*100)}%;background:var(--accent)"></div></div>
        <div class="chart-val">${s.pts_done}</div>
      </div>`
    ).join('') || '<div style="text-align:center;padding:20px;color:var(--text3)">Aucun sprint</div>';
  }

  const kpis = document.getElementById('an-kpis');
  if (kpis) {
    kpis.innerHTML = [
      ['AO gagnés',   gainedAO,                                                             'var(--green)'],
      ['AO en cours', D.tenders.filter(t=>!['Gagné','Perdu'].includes(t.status)).length,    'var(--accent)'],
      ['Sprints actifs', D.sprints.filter(s=>s.status==='En cours').length,                 'var(--blue)'],
      ['Bugs ouverts', D.workItems.filter(w=>w.type==='bug'&&w.status!=='Terminé').length,  'var(--red)'],
    ].map(([n,v,c]) =>
      `<div class="kpi-box"><div class="kpi-name">${n}</div><div class="kpi-val-big" style="color:${c}">${v}</div></div>`
    ).join('');
  }
}

// ══════════════════════════════════════════
// CALENDRIER INTÉGRÉ (sans alerts_calendar.js)
// ══════════════════════════════════════════
let calDate = new Date();
let calView = 'month';

function renderCalendarInline() {
  const pg = document.getElementById('page-calendar');
  if (!pg) return;

  pg.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-outline btn-sm" onclick="calMove(-1)">‹</button>
        <div id="cal-lbl" style="font-size:15px;font-weight:700;min-width:160px;text-align:center"></div>
        <button class="btn btn-outline btn-sm" onclick="calMove(1)">›</button>
        <button class="btn btn-ghost btn-sm" onclick="calDate=new Date();renderCalendarInline()">Aujourd'hui</button>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn ${calView==='month'?'btn-primary':'btn-outline'} btn-sm" onclick="calView='month';renderCalendarInline()">📅 Mois</button>
        <button class="btn ${calView==='list'?'btn-primary':'btn-outline'} btn-sm" onclick="calView='list';renderCalendarInline()">📋 Liste</button>
        <button class="btn ${calView==='risk'?'btn-primary':'btn-outline'} btn-sm" onclick="calView='risk';renderCalendarInline()">🧠 Risques</button>
      </div>
    </div>
    <div id="cal-body"></div>
  `;

  const lbl = document.getElementById('cal-lbl');
  if (lbl) lbl.textContent = calDate.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });

  const body = document.getElementById('cal-body');
  if (!body) return;

  if (calView === 'month')     body.innerHTML = buildMonthView();
  else if (calView === 'list') body.innerHTML = buildListView();
  else                          body.innerHTML = buildRiskView();
}

function calMove(dir) {
  calDate = new Date(calDate.getFullYear(), calDate.getMonth() + dir, 1);
  renderCalendarInline();
}

function buildMonthView() {
  const year  = calDate.getFullYear();
  const month = calDate.getMonth();
  const first = new Date(year, month, 1).getDay(); // 0=dim
  const days  = new Date(year, month+1, 0).getDate();
  const today = new Date();

  // Collecter tous les événements
  const events = {};
  const addEv  = (day, label, color) => {
    if (!events[day]) events[day] = [];
    events[day].push({ label, color });
  };

  D.projects.forEach(p => {
    if (!p.deadline) return;
    const d = new Date(p.deadline);
    if (d.getFullYear()===year && d.getMonth()===month)
      addEv(d.getDate(), p.name, STATUS_COLORS[p.status]||'var(--blue)');
  });
  D.tenders.forEach(t => {
    if (!t.deadline) return;
    const d = new Date(t.deadline);
    if (d.getFullYear()===year && d.getMonth()===month)
      addEv(d.getDate(), t.org||t.title, 'var(--accent)');
  });
  D.workItems.forEach(w => {
    if (!w.due) return;
    const d = new Date(w.due);
    if (d.getFullYear()===year && d.getMonth()===month)
      addEv(d.getDate(), w.title, 'var(--purple)');
  });

  const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  let html = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:8px">
    ${jours.map(j=>`<div style="text-align:center;font-size:10px;font-weight:700;color:var(--text3);font-family:var(--mono);padding:6px 0">${j}</div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">`;

  // Vides au début
  for (let i=0; i<first; i++) html += `<div style="min-height:80px;background:var(--surface);border-radius:6px;opacity:.3"></div>`;

  for (let d=1; d<=days; d++) {
    const isToday = today.getDate()===d && today.getMonth()===month && today.getFullYear()===year;
    const evs     = events[d] || [];
    html += `<div style="min-height:80px;background:${isToday?'var(--accentbg)':'var(--card)'};
      border:1px solid ${isToday?'rgba(14,181,204,.3)':'var(--border)'};
      border-radius:6px;padding:6px;overflow:hidden">
      <div style="font-size:11px;font-weight:${isToday?'700':'500'};
        color:${isToday?'var(--accent)':'var(--text2)'};margin-bottom:4px">${d}</div>
      ${evs.slice(0,3).map(e=>`
        <div style="font-size:9px;padding:2px 4px;border-radius:3px;
          background:${e.color}22;color:${e.color};
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px">
          ${e.label.substring(0,15)}
        </div>`).join('')}
      ${evs.length>3?`<div style="font-size:9px;color:var(--text3)">+${evs.length-3}</div>`:''}
    </div>`;
  }

  return html + '</div>';
}

function buildListView() {
  const now   = new Date();
  const items = [];

  D.projects.forEach(p => {
    if (!p.deadline) return;
    const diff = Math.floor((new Date(p.deadline)-now)/86400000);
    items.push({ date:p.deadline, label:p.name, type:'Projet', color:STATUS_COLORS[p.status]||'var(--blue)', diff });
  });
  D.tenders.forEach(t => {
    if (!t.deadline) return;
    const diff = Math.floor((new Date(t.deadline)-now)/86400000);
    items.push({ date:t.deadline, label:`AO — ${t.org}`, type:'AO', color:'var(--accent)', diff });
  });
  D.workItems.filter(w=>w.due).forEach(w => {
    const diff = Math.floor((new Date(w.due)-now)/86400000);
    items.push({ date:w.due, label:w.title, type:'Tâche', color:'var(--purple)', diff });
  });

  items.sort((a,b) => a.diff - b.diff);

  if (!items.length) return '<div style="text-align:center;padding:40px;color:var(--text3)">Aucune échéance planifiée</div>';

  return `<div style="display:flex;flex-direction:column;gap:8px">
    ${items.map(ev => `
      <div style="display:flex;align-items:center;gap:14px;padding:12px 16px;
        background:var(--card);border:1px solid ${ev.diff<0?'rgba(239,68,68,.3)':ev.diff<=7?'rgba(249,115,22,.3)':'var(--border)'};
        border-left:4px solid ${ev.diff<0?'var(--red)':ev.diff<=7?'var(--orange)':ev.color};
        border-radius:8px">
        <div style="font-family:var(--mono);font-size:11px;min-width:80px;
          color:${ev.diff<0?'var(--red)':ev.diff<=7?'var(--orange)':'var(--text3)'}">
          ${ev.diff<0?`J+${Math.abs(ev.diff)}`:ev.diff===0?'Aujourd\'hui':`J-${ev.diff}`}
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${ev.label}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${ev.type} · ${fd(ev.date)}</div>
        </div>
        <div style="font-size:10px;padding:3px 8px;border-radius:6px;
          background:${ev.diff<0?'var(--redbg)':ev.diff<=7?'var(--orangebg)':'var(--greenbg)'};
          color:${ev.diff<0?'var(--red)':ev.diff<=7?'var(--orange)':'var(--green)'}">
          ${ev.diff<0?'⚠ Retard':ev.diff<=7?'⚡ Urgent':'✅ OK'}
        </div>
      </div>`).join('')}
  </div>`;
}

function buildRiskView() {
  const now = new Date();
  const riskProjects = D.projects.filter(p => p.status!=='Terminé').map(p => {
    let score = 0;
    if (p.deadline) {
      const diff = Math.floor((new Date(p.deadline)-now)/86400000);
      if (diff < 0)      score += 40;
      else if (diff <= 7)  score += 30;
      else if (diff <= 14) score += 15;
    }
    if (p.progress < 30) score += 20;
    else if (p.progress < 60) score += 10;
    if (p.status === 'Bloqué')     score += 25;
    if (p.status === 'En attente') score += 10;
    const bugs = D.workItems.filter(w => w.project==p.id && w.type==='bug' && w.status!=='Terminé').length;
    score += Math.min(bugs * 5, 20);
    score = Math.min(100, score);
    const color = score >= 70 ? 'var(--red)' : score >= 40 ? 'var(--orange)' : 'var(--green)';
    return { ...p, score, color };
  }).sort((a,b) => b.score - a.score);

  if (!riskProjects.length) return '<div style="text-align:center;padding:40px;color:var(--text3)">Aucun projet actif</div>';

  return `<div style="display:flex;flex-direction:column;gap:10px">
    ${riskProjects.map(p => {
      const r = 18, cx = 22, cy = 22;
      const circ = 2 * Math.PI * r;
      const dash  = circ * p.score / 100;
      return `<div style="display:flex;align-items:center;gap:16px;padding:16px;
        background:var(--card);border:1px solid var(--border);border-radius:10px;cursor:pointer"
        onclick="openSWOTModal(${p.id})">
        <svg width="44" height="44" viewBox="0 0 44 44" style="transform:rotate(-90deg);flex-shrink:0">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="4"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.color}" stroke-width="4"
            stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
        </svg>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700">${p.name}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${p.status} · ${p.progress||0}% · ${p.deadline?fd(p.deadline):'Pas de deadline'}</div>
        </div>
        <div style="text-align:center;flex-shrink:0">
          <div style="font-size:22px;font-weight:700;font-family:var(--mono);color:${p.color}">${p.score}</div>
          <div style="font-size:9px;color:var(--text3)">Score risque</div>
        </div>
        <button class="btn btn-outline btn-sm" style="flex-shrink:0">🧠 SWOT</button>
      </div>`;
    }).join('')}
  </div>`;
}

// ══════════════════════════════════════════
// MON ESPACE (vue membre)
// ══════════════════════════════════════════
function renderMySpaceInline() {
  const pg = document.getElementById('page-my-space');
  if (!pg) return;
  const user   = getUser();
  if (!user) return;

  const myMember = D.members.find(m =>
    m.initials === user.member_initials ||
    m.id == user.member_id
  );

  const myProjects = myMember
    ? D.projects.filter(p => (p.members_detail||[]).some(m => m.id==myMember.id))
    : [];
  const myTasks = myMember
    ? D.workItems.filter(w => w.assignee==myMember.id && ['En cours','A faire'].includes(w.status))
    : [];
  const doneTasks = myMember
    ? D.workItems.filter(w => w.assignee==myMember.id && w.status==='Terminé').length
    : 0;

  pg.innerHTML = `
    <div style="margin-bottom:24px;padding:20px;background:linear-gradient(135deg,var(--accentbg),var(--card));
      border:1px solid rgba(14,181,204,.2);border-radius:var(--radius)">
      <div style="font-size:22px;font-weight:700;margin-bottom:4px">
        Bonjour ${user.first_name || user.username} 👋
      </div>
      <div style="font-size:12px;color:var(--text2)">Voici un aperçu de tes projets et tâches</div>
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:24px">
      <div class="stat-card c-blue">
        <div class="stat-value">${myProjects.length}</div>
        <div class="stat-label">Mes projets</div>
        <div class="stat-icon">📁</div>
      </div>
      <div class="stat-card c-accent">
        <div class="stat-value">${myTasks.length}</div>
        <div class="stat-label">Tâches en cours</div>
        <div class="stat-icon">⚡</div>
      </div>
      <div class="stat-card c-green">
        <div class="stat-value">${doneTasks}</div>
        <div class="stat-label">Tâches terminées</div>
        <div class="stat-icon">✅</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="section-title">📁 Mes Projets</div>
        ${myProjects.length ? myProjects.map(p => `
          <div style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center">
            <div style="width:4px;height:40px;border-radius:4px;background:${STATUS_COLORS[p.status]||'var(--blue)'};flex-shrink:0"></div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${p.name}</div>
              <div class="progress-wrap" style="margin:6px 0 0"><div class="progress-bar" style="width:${p.progress||0}%"></div></div>
            </div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text3)">${p.progress||0}%</div>
            ${badge('status',p.status)}
          </div>`).join('') :
          '<div style="text-align:center;padding:24px;color:var(--text3)">Aucun projet assigné</div>'}
      </div>

      <div class="card">
        <div class="section-title">✅ Mes Tâches actives</div>
        ${myTasks.length ? myTasks.slice(0,8).map(t => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
            <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
              background:${t.status==='En cours'?'var(--accent)':'var(--blue)'}"></div>
            <div style="flex:1;font-size:12.5px;font-weight:500">${t.title}</div>
            ${badge('prio',t.priority)}
            ${t.due?`<div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${fd(t.due)}</div>`:''}
          </div>`).join('') :
          '<div style="text-align:center;padding:24px;color:var(--text3)">✅ Aucune tâche en cours</div>'}
      </div>
    </div>`;
}

// ══════════════════════════════════════════
// AIDE À LA DÉCISION
// ══════════════════════════════════════════
function renderDecisionInline() {
  const pg = document.getElementById('page-decision');
  if (!pg) return;
  const now     = new Date();
  const won     = D.tenders.filter(t=>t.status==='Gagné').length;
  const total   = D.tenders.length;
  const winRate = total ? Math.round(won/total*100) : 0;

  // Recommandations
  const recs = [];
  D.projects.forEach(p => {
    if (!p.deadline || p.status==='Terminé') return;
    const diff = Math.floor((new Date(p.deadline)-now)/86400000);
    if (diff < 0)           recs.push({ level:'critical', icon:'🚨', text:`<strong>${p.name}</strong> — Deadline dépassée de ${Math.abs(diff)}j`, action:`openSWOTModal(${p.id})`, lbl:'SWOT' });
    else if (diff<=7 && (p.progress||0)<70) recs.push({ level:'warning', icon:'⚠️', text:`<strong>${p.name}</strong> — ${diff}j restants, ${p.progress||0}% seulement`, action:`nav('board',null)`, lbl:'Kanban' });
  });
  const bugs = D.workItems.filter(w=>w.type==='bug'&&w.status!=='Terminé');
  if (bugs.length>=2) recs.push({ level:'warning', icon:'🐛', text:`<strong>${bugs.length} bugs ouverts</strong> — dette technique`, action:`nav('board',null)`, lbl:'Voir' });
  if (won>0) recs.push({ level:'success', icon:'🏆', text:`<strong>${won} AO gagné${won>1?'s':''}</strong> — excellents résultats`, action:null });
  if (!recs.length) recs.push({ level:'success', icon:'✅', text:'Tous les indicateurs sont au vert !', action:null });

  const colorsRec = { critical:'var(--red)',warning:'var(--orange)',info:'var(--blue)',success:'var(--green)' };
  const bgsRec    = { critical:'var(--redbg)',warning:'var(--orangebg)',info:'var(--bluebg)',success:'var(--greenbg)' };

  pg.innerHTML = `
    <div style="margin-bottom:24px;padding:18px 20px;background:linear-gradient(135deg,var(--accentbg),var(--card));
      border:1px solid rgba(14,181,204,.2);border-radius:var(--radius);display:flex;align-items:center;gap:16px">
      <div style="font-size:32px">🎯</div>
      <div>
        <div style="font-size:16px;font-weight:700">Aide à la décision intelligente</div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">Analyse des risques, recommandations et matrices SWOT</div>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card c-blue"><div class="stat-value">${D.projects.filter(p=>p.status==='En cours').length}</div><div class="stat-label">Projets actifs</div><div class="stat-icon">📊</div></div>
      <div class="stat-card c-red"><div class="stat-value">${recs.filter(r=>r.level==='critical').length}</div><div class="stat-label">Alertes critiques</div><div class="stat-icon">🚨</div></div>
      <div class="stat-card c-green"><div class="stat-value">${winRate}%</div><div class="stat-label">Taux succès AO</div><div class="stat-icon">🏆</div></div>
      <div class="stat-card c-purple"><div class="stat-value">${D.members.length}</div><div class="stat-label">Membres équipe</div><div class="stat-icon">👥</div></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="section-title">💡 Recommandations</div>
        ${recs.slice(0,8).map(r=>`
          <div style="display:flex;align-items:flex-start;gap:10px;padding:10px;margin-bottom:8px;
            background:${bgsRec[r.level]};border-radius:8px;border-left:3px solid ${colorsRec[r.level]}">
            <span style="font-size:16px;flex-shrink:0">${r.icon}</span>
            <div style="flex:1;font-size:12px;line-height:1.5">${r.text}</div>
            ${r.action?`<button class="btn btn-outline btn-sm" onclick="${r.action}" style="font-size:10px;flex-shrink:0">${r.lbl}</button>`:''}
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="section-title">🧠 SWOT par projet</div>
        ${D.projects.filter(p=>p.status!=='Terminé').slice(0,6).map(p=>`
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer"
            onclick="openSWOTModal(${p.id})">
            <div style="width:8px;height:8px;border-radius:50%;background:${STATUS_COLORS[p.status]||'var(--blue)'};flex-shrink:0"></div>
            <div style="flex:1;font-size:12.5px;font-weight:600">${p.name}</div>
            <div style="font-size:10px;color:var(--text3)">${p.progress||0}%</div>
            <button class="btn btn-outline btn-sm" style="font-size:10px">🧠 Voir</button>
          </div>`).join('') ||
          '<div style="text-align:center;padding:20px;color:var(--text3)">Aucun projet actif</div>'}
      </div>
    </div>`;
}

// ══════════════════════════════════════════
// GESTION UTILISATEURS (Admin)
// ══════════════════════════════════════════
async function renderUsersInline() {
  const pg = document.getElementById('page-users');
  if (!pg) return;
  if (getUserRole() !== 'admin') {
    pg.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red)">⛔ Accès réservé aux administrateurs</div>';
    return;
  }

  pg.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Chargement utilisateurs...</div>';

  let users = [];
  try {
    const res = await apiFetch(`${API}/users/`);
    if (res?.ok) users = await res.json();
  } catch(e) {}

  if (!users.length) {
    pg.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Aucun utilisateur trouvé — vérifiez que /api/users/ existe</div>';
    return;
  }

  const roleColors = { admin:'var(--accent)',manager:'var(--blue)',member:'var(--text3)' };
  const roleBg     = { admin:'var(--accentbg)',manager:'var(--bluebg)',member:'var(--card2)' };
  const roleIcons  = { admin:'👑',manager:'🎯',member:'👤' };

  pg.innerHTML = `
    <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:16px;font-weight:700">Gestion des accès</div>
        <div style="font-size:12px;color:var(--text3)">${users.length} utilisateur${users.length>1?'s':''}</div>
      </div>
    </div>

    <div class="card" style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            ${['UTILISATEUR','RÔLE','MEMBRE LIÉ','STATUT','ACTIONS'].map(h=>
              `<th style="text-align:left;padding:10px 14px;font-size:10px;color:var(--text3);font-family:var(--mono);font-weight:700;letter-spacing:1px">${h}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:12px 14px">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="av" style="width:32px;height:32px;font-size:11px;background:${roleBg[u.role]||'var(--card)'};color:${roleColors[u.role]||'var(--text)'}">
                    ${(u.first_name||u.username||'?').substring(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style="font-size:13px;font-weight:600">${u.first_name||''} ${u.last_name||''}</div>
                    <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">@${u.username}</div>
                  </div>
                </div>
              </td>
              <td style="padding:12px 14px">
                <select onchange="changeUserRole(${u.id},this.value)"
                  style="background:${roleBg[u.role]||'var(--card)'};color:${roleColors[u.role]||'var(--text)'};
                    border:1px solid var(--border);border-radius:6px;padding:4px 8px;
                    font-size:11px;font-weight:700;font-family:var(--mono)">
                  <option value="admin"   ${u.role==='admin'  ?'selected':''}>👑 Admin</option>
                  <option value="manager" ${u.role==='manager'?'selected':''}>🎯 Manager</option>
                  <option value="member"  ${u.role==='member' ?'selected':''}>👤 Membre</option>
                </select>
              </td>
              <td style="padding:12px 14px;font-size:12px;color:var(--text2)">${u.member_name||'<span style="color:var(--text3)">Non lié</span>'}</td>
              <td style="padding:12px 14px">
                <span style="font-size:11px;padding:3px 8px;border-radius:6px;font-weight:600;
                  background:${u.is_active?'var(--greenbg)':'var(--redbg)'};
                  color:${u.is_active?'var(--green)':'var(--red)'}">
                  ${u.is_active?'● Actif':'● Inactif'}
                </span>
              </td>
              <td style="padding:12px 14px">
                <select onchange="linkUserMember(${u.id},this.value)"
                  style="background:var(--surface);border:1px solid var(--border);border-radius:6px;
                    padding:4px 8px;font-size:11px;color:var(--text)">
                  <option value="">Lier un membre...</option>
                  ${D.members.map(m=>`<option value="${m.id}" ${u.member_id==m.id?'selected':''}>${m.name}</option>`).join('')}
                </select>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function changeUserRole(userId, role) {
  const res = await apiFetch(`${API}/users/${userId}/role/`, {
    method:'PATCH', body:JSON.stringify({ role })
  });
  if (res?.ok) toast(`Rôle mis à jour : ${role}`, 'success', '✅');
  else         toast('Erreur changement rôle', 'error', '⚠');
}

async function linkUserMember(userId, memberId) {
  if (!memberId) return;
  const res = await apiFetch(`${API}/users/${userId}/role/`, {
    method:'PATCH', body:JSON.stringify({ member_id:parseInt(memberId) })
  });
  if (res?.ok) toast('Membre lié', 'success', '✅');
}

// ══════════════════════════════════════════
// SWOT MODAL (intégrée)
// ══════════════════════════════════════════
let swotProjectId = null;

function openSWOTModal(projectId) {
  swotProjectId = projectId;
  const project = D.projects.find(p => p.id == projectId);
  if (!project) return;

  let modal = document.getElementById('modal-swot');
  if (!modal) {
    modal = document.createElement('div');
    modal.id        = 'modal-swot';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '600';
    modal.innerHTML = `<div class="modal" style="max-width:780px;width:100%"><div id="swot-inner">Chargement...</div></div>`;
    modal.addEventListener('click', e => { if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.classList.add('open');

  // Générer SWOT localement
  const swot = generateSWOT(project);
  renderSWOTContent(project, swot);
}

function generateSWOT(p) {
  const now   = new Date();
  const wi    = D.workItems.filter(w => w.project == p.id);
  const bugs  = wi.filter(w => w.type==='bug' && w.status!=='Terminé').length;
  const done  = wi.filter(w => w.status==='Terminé').length;
  const prog  = p.progress || 0;
  const members = (p.members_detail||[]).length;
  const daysLeft = p.deadline ? Math.floor((new Date(p.deadline)-now)/86400000) : null;

  const s=[], w=[], o=[], t=[];

  if (prog>=70)    s.push(`Avancement solide : ${prog}% complété`);
  if (members>=3)  s.push(`Équipe mobilisée : ${members} membres assignés`);
  if (done>0)      s.push(`${done} tâches livrées avec succès`);
  if (bugs===0 && wi.length>0) s.push('Aucun bug ouvert — qualité maîtrisée');
  if (!s.length)   s.push('Projet structuré avec équipe dédiée');

  if (prog<30)     w.push(`Avancement faible : ${prog}% seulement`);
  if (bugs>=2)     w.push(`${bugs} bugs non résolus`);
  if (members<2)   w.push('Équipe réduite — risque de surcharge');
  if (!p.deadline) w.push('Pas de deadline définie');
  if (!w.length)   w.push('Points à améliorer à identifier');

  if (p.category==='GIS') o.push('Forte demande SIG en Afrique centrale');
  if (p.category==='IT')  o.push('Digitalisation croissante des institutions');
  o.push('Visibilité KICEKO auprès des partenaires internationaux');
  if (daysLeft && daysLeft>30) o.push('Marge temporelle pour ajuster la stratégie');

  if (daysLeft!==null) {
    if (daysLeft<0)      t.push(`Deadline dépassée de ${Math.abs(daysLeft)} jours`);
    else if (daysLeft<=7) t.push(`Deadline dans ${daysLeft} jours — urgence`);
  }
  if (bugs>=3) t.push('Accumulation de bugs — dette technique');
  t.push('Contraintes budgétaires des partenaires');
  if (!t.length) t.push('Risques externes à surveiller');

  return { strengths:s.slice(0,5), weaknesses:w.slice(0,5), opportunities:o.slice(0,5), threats:t.slice(0,5) };
}

function renderSWOTContent(project, swot) {
  const inner = document.getElementById('swot-inner');
  if (!inner) return;

  const quadrants = [
    { key:'strengths',     label:'Forces',        icon:'💪', color:'var(--green)',  bg:'var(--greenbg)',  items:swot.strengths },
    { key:'weaknesses',    label:'Faiblesses',    icon:'⚠️', color:'var(--orange)', bg:'var(--orangebg)', items:swot.weaknesses },
    { key:'opportunities', label:'Opportunités',  icon:'🚀', color:'var(--blue)',   bg:'var(--bluebg)',   items:swot.opportunities },
    { key:'threats',       label:'Menaces',       icon:'🔴', color:'var(--red)',    bg:'var(--redbg)',    items:swot.threats },
  ];

  inner.innerHTML = `
    <div class="modal-title" style="margin-bottom:16px">
      <div>
        <div style="font-size:15px;font-weight:700">🧠 Matrice SWOT — ${project.name}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">Généré depuis les données du projet · ${project.status} · ${project.progress||0}%</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-outline btn-sm" onclick="exportSWOT(${project.id})">⬇️ Export</button>
        <button class="modal-close" onclick="document.getElementById('modal-swot').classList.remove('open')">×</button>
      </div>
    </div>

    <div style="margin-bottom:12px;padding:8px 12px;background:var(--surface);border-radius:8px;display:flex;align-items:center;gap:12px">
      <div style="width:8px;height:8px;border-radius:50%;background:${STATUS_COLORS[project.status]||'var(--blue)'}"></div>
      <span style="font-size:12px;font-weight:600">${project.status}</span>
      <div style="flex:1"><div class="progress-wrap" style="margin:0"><div class="progress-bar" style="width:${project.progress||0}%"></div></div></div>
      <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--accent)">${project.progress||0}%</span>
      ${project.deadline?`<span style="font-size:11px;color:var(--text3)">📅 ${fd(project.deadline)}</span>`:''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${quadrants.map(q=>`
        <div style="background:${q.bg};border:1px solid var(--border);border-radius:10px;padding:14px;min-height:140px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="font-size:16px">${q.icon}</span>
            <div style="font-size:13px;font-weight:700;color:${q.color}">${q.label}</div>
          </div>
          ${q.items.map(item=>`
            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
              <div style="width:5px;height:5px;border-radius:50%;background:${q.color};flex-shrink:0;margin-top:6px"></div>
              <div style="font-size:11.5px;line-height:1.5;color:var(--text2)">${item}</div>
            </div>`).join('')}
        </div>`).join('')}
    </div>

    <div class="form-actions" style="margin-top:14px">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-swot').classList.remove('open')">Fermer</button>
    </div>
  `;
}

function exportSWOT(projectId) {
  const project = D.projects.find(p => p.id==projectId);
  if (!project) return;
  const swot = generateSWOT(project);
  const now  = new Date().toLocaleDateString('fr-FR');
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>SWOT — ${project.name}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#1a1a2e}
    h1{color:#0a7a96;margin-bottom:4px}.meta{color:#666;font-size:13px;margin-bottom:24px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .quad{padding:16px;border-radius:8px}.quad h3{margin:0 0 12px;font-size:15px}
    .quad ul{margin:0;padding-left:18px}.quad li{margin-bottom:6px;font-size:13px}
    .s{background:#f0fdf4;border-left:4px solid #22c55e}
    .w{background:#fff7ed;border-left:4px solid #f97316}
    .o{background:#eff6ff;border-left:4px solid #3b82f6}
    .t{background:#fef2f2;border-left:4px solid #ef4444}
    .footer{margin-top:24px;font-size:11px;color:#999;text-align:center}</style>
    </head><body>
    <h1>Matrice SWOT — ${project.name}</h1>
    <div class="meta">KICEKO CONSULTANT · ${now} · ${project.status} · ${project.progress||0}%</div>
    <div class="grid">
    <div class="quad s"><h3>💪 Forces</h3><ul>${swot.strengths.map(i=>`<li>${i}</li>`).join('')}</ul></div>
    <div class="quad w"><h3>⚠️ Faiblesses</h3><ul>${swot.weaknesses.map(i=>`<li>${i}</li>`).join('')}</ul></div>
    <div class="quad o"><h3>🚀 Opportunités</h3><ul>${swot.opportunities.map(i=>`<li>${i}</li>`).join('')}</ul></div>
    <div class="quad t"><h3>🔴 Menaces</h3><ul>${swot.threats.map(i=>`<li>${i}</li>`).join('')}</ul></div>
    </div><div class="footer">KICEKO CONSULTANT · N'Djamena, Tchad</div>
    </body></html>`;
  const a   = document.createElement('a');
  a.href    = URL.createObjectURL(new Blob([html],{type:'text/html'}));
  a.download= `SWOT_${project.name.replace(/\s+/g,'_')}.html`;
  a.click();
  toast('SWOT exporté', 'success', '⬇️');
}

// ══════════════════════════════════════════
// MODALS — CRUD
// ══════════════════════════════════════════
function om(id) { document.getElementById(id)?.classList.add('open'); }
function cm(id) { document.getElementById(id)?.classList.remove('open'); }

function openWIModal(id=null, defaultStatus=null) {
  editWIId = id;
  const label = document.getElementById('mwi-label');
  if (label) label.textContent = id ? 'Modifier le ticket' : 'Nouveau ticket';

  const asel = document.getElementById('wi-assignee');
  if (asel) asel.innerHTML = '<option value="">— Non assigné —</option>' + D.members.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');

  const psel = document.getElementById('wi-project');
  if (psel) psel.innerHTML = '<option value="">— Aucun projet —</option>' + D.projects.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');

  if (id) {
    const w = D.workItems.find(x => x.id==id);
    if (w) {
      ['wi-title','wi-type','wi-prio','wi-status','wi-pts','wi-assignee','wi-project','wi-due','wi-desc'].forEach((fid,i) => {
        const el = document.getElementById(fid);
        if (el) el.value = [w.title,w.type,w.priority,w.status,w.pts,w.assignee,w.project,w.due,w.description][i]||'';
      });
    }
  } else {
    ['wi-title','wi-due','wi-desc'].forEach(fid => { const el=document.getElementById(fid); if(el) el.value=''; });
    const s = document.getElementById('wi-status'); if(s) s.value = defaultStatus||'Backlog';
    const t = document.getElementById('wi-type');   if(t) t.value = 'task';
    const p = document.getElementById('wi-prio');   if(p) p.value = 'Moyenne';
  }
  om('modal-wi');
}

async function saveWI() {
  const title = document.getElementById('wi-title')?.value.trim();
  if (!title) { toast('Le titre est obligatoire','error','⚠'); return; }

  const payload = {
    title,
    type:        document.getElementById('wi-type')?.value,
    priority:    document.getElementById('wi-prio')?.value,
    status:      document.getElementById('wi-status')?.value,
    pts:     parseInt(document.getElementById('wi-pts')?.value)||5,
    assignee:    document.getElementById('wi-assignee')?.value || null,
    project:     document.getElementById('wi-project')?.value  || null,
    due:         document.getElementById('wi-due')?.value       || null,
    description: document.getElementById('wi-desc')?.value,
  };

  const url    = editWIId ? `${API}/workitems/${editWIId}/` : `${API}/workitems/`;
  const method = editWIId ? 'PUT' : 'POST';
  const res    = await apiFetch(url, { method, body:JSON.stringify(payload) });
  if (res?.ok) { cm('modal-wi'); await loadAll(); toast(editWIId?'Ticket mis à jour':'Ticket créé','success','✅'); }
  else toast("Erreur lors de l'enregistrement",'error','⚠');
}

function openProjModal(id=null) {
  editProjId = id;
  const label = document.getElementById('mproj-label');
  if (label) label.textContent = id ? 'Modifier le projet' : 'Nouveau projet';

  const msel = document.getElementById('proj-members');
  if (msel) msel.innerHTML = D.members.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');

  const swotBtn = document.getElementById('btn-swot-proj');
  if (swotBtn) swotBtn.style.display = id ? 'flex' : 'none';

  if (id) {
    const p = D.projects.find(x => x.id==id);
    if (p) {
      ['proj-name','proj-desc','proj-cat','proj-status','proj-progress','proj-deadline'].forEach((fid,i) => {
        const el = document.getElementById(fid);
        if (el) el.value = [p.name,p.description,p.category,p.status,p.progress,p.deadline][i]||'';
      });
      if (msel) {
        const ids = (p.members_detail||[]).map(m=>String(m.id));
        Array.from(msel.options).forEach(o => { o.selected = ids.includes(o.value); });
      }
    }
  } else {
    ['proj-name','proj-desc','proj-deadline'].forEach(i => { const el=document.getElementById(i); if(el) el.value=''; });
    const s=document.getElementById('proj-status');   if(s) s.value='Planifié';
    const g=document.getElementById('proj-progress'); if(g) g.value='0';
  }
  om('modal-proj');
}

async function saveProj() {
  const name = document.getElementById('proj-name')?.value.trim();
  if (!name) { toast('Le nom est obligatoire','error','⚠'); return; }

  const msel   = document.getElementById('proj-members');
  const members = msel ? Array.from(msel.selectedOptions).map(o=>parseInt(o.value)) : [];

  const payload = {
    name,
    description: document.getElementById('proj-desc')?.value,
    category:    document.getElementById('proj-cat')?.value,
    status:      document.getElementById('proj-status')?.value,
    progress: parseInt(document.getElementById('proj-progress')?.value)||0,
    deadline:    document.getElementById('proj-deadline')?.value || null,
    members,
  };

  const url    = editProjId ? `${API}/projects/${editProjId}/` : `${API}/projects/`;
  const method = editProjId ? 'PUT' : 'POST';
  const res    = await apiFetch(url, { method, body:JSON.stringify(payload) });
  if (res?.ok) { cm('modal-proj'); await loadAll(); toast(editProjId?'Projet mis à jour':'Projet créé','success','✅'); }
  else toast("Erreur lors de l'enregistrement",'error','⚠');
}

function openAOModal(id=null) {
  editAOId = id;
  const lsel = document.getElementById('ao-lead');
  if (lsel) lsel.innerHTML = '<option value="">— Responsable —</option>' + D.members.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');

  if (id) {
    const t = D.tenders.find(x => x.id==id);
    if (t) {
      ['ao-title','ao-org','ao-amount','ao-deadline','ao-status','ao-lead'].forEach((fid,i) => {
        const el=document.getElementById(fid);
        if(el) el.value=[t.title,t.org,t.amount,t.deadline,t.status,t.lead][i]||'';
      });
    }
  } else {
    ['ao-title','ao-org','ao-deadline'].forEach(i => { const el=document.getElementById(i); if(el) el.value=''; });
  }
  om('modal-ao');
}

async function saveAO() {
  const title = document.getElementById('ao-title')?.value.trim();
  if (!title) { toast('Le titre est obligatoire','error','⚠'); return; }

  const payload = {
    title, org:document.getElementById('ao-org')?.value,
    amount:  parseInt(document.getElementById('ao-amount')?.value)||0,
    deadline:document.getElementById('ao-deadline')?.value || null,
    status:  document.getElementById('ao-status')?.value,
    lead:    document.getElementById('ao-lead')?.value || null,
  };

  const url    = editAOId ? `${API}/tenders/${editAOId}/` : `${API}/tenders/`;
  const method = editAOId ? 'PUT' : 'POST';
  const res    = await apiFetch(url, { method, body:JSON.stringify(payload) });
  if (res?.ok) { cm('modal-ao'); await loadAll(); toast(editAOId?'AO mis à jour':'AO ajouté','success','✅'); }
  else toast('Erreur','error','⚠');
}

async function delAO(id) {
  if (!confirm("Supprimer cet appel d'offres ?")) return;
  const res = await apiFetch(`${API}/tenders/${id}/`, { method:'DELETE' });
  if (res?.ok || res?.status===204) { await loadAll(); toast('AO supprimé','info','🗑'); }
}

async function saveMember() {
  const name = document.getElementById('mem-name')?.value.trim();
  if (!name) { toast('Le nom est obligatoire','error','⚠'); return; }

  const payload = {
    name, role:document.getElementById('mem-role')?.value,
    initials:(document.getElementById('mem-init')?.value||name.substring(0,2)).toUpperCase(),
    color:   document.getElementById('mem-color')?.value||'#0eb5cc',
  };

  const res = await apiFetch(`${API}/members/`, { method:'POST', body:JSON.stringify(payload) });
  if (res?.ok) { cm('modal-member'); await loadAll(); toast('Membre ajouté','success','✅'); }
  else toast('Erreur','error','⚠');
}

function openAdd() {
  const ctx = { board:'wi', projects:'proj', tenders:'ao', team:'member' };
  const modal = ctx[currentPage];
  if (modal==='wi')     openWIModal();
  else if (modal==='proj')   openProjModal();
  else if (modal==='ao')     openAOModal();
  else if (modal==='member') om('modal-member');
  else openWIModal();
}

function handleSearch(val) {
  if (!val || val.length < 2) return;
  const v = val.toLowerCase();
  const r = [
    ...D.projects.filter(p=>p.name.toLowerCase().includes(v)).map(p=>({type:'Projet',label:p.name})),
    ...D.workItems.filter(w=>w.title.toLowerCase().includes(v)).slice(0,3).map(w=>({type:'Ticket',label:w.title})),
  ].slice(0,5);
  if (r.length) toast(`${r.length} résultat(s) pour "${val}"`, 'info', '🔍');
}

// ══════════════════════════════════════════
// TOASTS
// ══════════════════════════════════════════
function toast(msg, type='info', icon='ℹ') {
  const c = document.getElementById('toasts');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icon}</span><span class="toast-msg">${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ══════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

document.addEventListener('keydown', e => {
  const ls = document.getElementById('login-screen');
  if (e.key==='Enter' && ls && ls.style.display !== 'none') doLogin();
});

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
(function init() {
  const token = getToken();
  const user  = getUser();
  if (token && user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display          = 'flex';
    updateUserBar(user);
    loadAll();
  }
})();