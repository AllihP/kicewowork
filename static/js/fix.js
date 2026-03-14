/**
 * fix.js — KICEKO ProjectHub
 * Correctifs chirurgicaux appliqués APRÈS app.js
 *
 * Problèmes réglés :
 *  1. Calendrier absent en production (renderPage sans entrée 'calendar')
 *  2. Membres invisibles (comparaison stricte === vs PostgreSQL int/string)
 *  3. Dashboard membres non affichés (dashStats null)
 *  4. Loading overlay bloqué (style.display vs classList)
 */

// ═══════════════════════════════════════════════════
// PATCH 1 — renderPage avec calendrier et toutes pages
// ═══════════════════════════════════════════════════
function renderPage(page) {
  // Masquer toutes les pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Afficher la page cible
  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');

  // Mettre à jour le titre topbar
  if (typeof PAGE_TITLES !== 'undefined') {
    const tb1 = document.getElementById('tb-title');
    const tb2 = document.getElementById('tb-sub');
    if (tb1) tb1.textContent = PAGE_TITLES[page] || page;
    if (tb2) tb2.textContent = (typeof PAGE_SUBS !== 'undefined' ? PAGE_SUBS[page] : '') || '';
  }

  // Table de rendu complète — inclut calendar + nouvelles pages
  const renderers = {
    dashboard:  renderDashboard,
    projects:   renderProjects,
    board:      renderBoard,
    backlog:    renderBacklog,
    sprints:    renderSprints,
    tenders:    renderTenders,
    team:       renderTeamFixed,   // version corrigée
    analytics:  renderAnalytics,
    calendar:   renderCalendarFix, // ← NOUVEAU
    'my-space': renderMySpaceFix,  // ← NOUVEAU
    decision:   renderDecisionFix, // ← NOUVEAU
    users:      renderUsersFix,    // ← NOUVEAU
  };

  const fn = renderers[page];
  if (fn) fn();
}

// Patch nav() pour utiliser le nouveau renderPage
const _origNav = nav;
function nav(page, el) {
  document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
  if (el) el.classList.add('active');
  else {
    const match = document.querySelector('.nav-item[data-page="' + page + '"]');
    if (match) match.classList.add('active');
  }
  currentPage = page;
  renderPage(page); // utilise le nouveau renderPage
}


// ═══════════════════════════════════════════════════
// PATCH 2 — loadAll robuste (loading + membres)
// ═══════════════════════════════════════════════════
async function loadAll() {
  // ✅ FIX loading : classList.add au lieu de style.display
  const loading = document.getElementById('app-loading');
  if (loading) loading.classList.add('active');

  // Mise à jour étapes si le nouveau design est présent
  let step = 0;
  const steps = [
    { icon:'🔐', msg:'Vérification des accès...' },
    { icon:'📦', msg:'Chargement des projets...' },
    { icon:'👥', msg:'Chargement des membres...' },
    { icon:'📋', msg:'Chargement des tickets...' },
    { icon:'✅', msg:'Finalisation...' },
  ];
  function setStep(i) {
    const icon = document.getElementById('loading-step-icon');
    const msg  = document.getElementById('loading-step-msg');
    const bar  = document.getElementById('loading-bar-fill');
    if (icon) icon.textContent = steps[i].icon;
    if (msg)  msg.textContent  = steps[i].msg;
    if (bar)  bar.style.width  = ((i + 1) / steps.length * 100) + '%';
  }

  try {
    setStep(0);
    const pr = await _safeFetch(API + '/projects/?page_size=200');
    setStep(1);
    const mb = await _safeFetch(API + '/members/?page_size=200');
    setStep(2);
    const wi = await _safeFetch(API + '/workitems/?page_size=500');
    setStep(3);
    const tn = await _safeFetch(API + '/tenders/?page_size=200');
    const sp = await _safeFetch(API + '/sprints/?page_size=100');
    const ds = await _safeFetch(API + '/dashboard/');
    setStep(4);

    D.projects  = pr || [];
    D.members   = mb || [];
    D.workItems = wi || [];
    D.tenders   = tn || [];
    D.sprints   = sp || [];
    // dashStats uniquement si c'est un objet (pas un tableau)
    dashStats = ds && !Array.isArray(ds) ? ds : null;

    // ✅ FIX MEMBRES : retry si vide (cold start Render)
    if (D.members.length === 0) {
      console.warn('⚠️ Membres vides — retry dans 1s...');
      await new Promise(r => setTimeout(r, 1000));
      const mb2 = await _safeFetch(API + '/members/');
      if (mb2 && mb2.length) D.members = mb2;
    }

    console.log('✅ Données chargées:', {
      projets: D.projects.length,
      membres: D.members.length,
      tickets: D.workItems.length,
      tenders: D.tenders.length,
    });

    renderSidebar();
    renderPage(currentPage);
    updateChips();

  } catch(e) {
    console.error('❌ loadAll error:', e);
    toast('Erreur de chargement', 'error', '⚠');
  } finally {
    // ✅ FIX : classList.remove pour masquer
    const loading = document.getElementById('app-loading');
    if (loading) {
      const bar = document.getElementById('loading-bar-fill');
      if (bar) bar.style.width = '100%';
      setTimeout(() => loading.classList.remove('active'), 400);
    }
  }
}

// Helper fetch robuste
async function _safeFetch(url) {
  try {
    const res = await apiFetch(url);
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data))          return data;
    if (Array.isArray(data?.results)) return data.results;
    if (data && typeof data === 'object') return data;
    return null;
  } catch(e) {
    console.warn('_safeFetch failed:', url, e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════
// PATCH 3 — renderTeam corrigé (== loose equality)
// ═══════════════════════════════════════════════════
function renderTeamFixed() {
  const grid = document.getElementById('team-grid');
  if (!grid) return;

  if (!D.members.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 20px">
        <div style="font-size:40px;margin-bottom:14px;opacity:.3">👥</div>
        <div style="font-size:14px;color:var(--text3);margin-bottom:8px">Aucun membre d'équipe</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:20px">
          Ajoutez des membres via le bouton ci-dessous ou via /admin/
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="om('modal-member')">＋ Ajouter</button>
          <button class="btn btn-outline btn-sm" onclick="_reloadMembers()">🔄 Recharger</button>
        </div>
      </div>`;
    return;
  }

  grid.innerHTML = D.members.map(m => {
    // ✅ FIX CRITIQUE : == (loose) au lieu de === (strict)
    // PostgreSQL retourne des entiers, JS peut avoir des strings
    const active = D.workItems.filter(w => w.assignee == m.id && w.status === 'En cours').length;
    const done   = D.workItems.filter(w => w.assignee == m.id && w.status === 'Terminé').length;
    const projs  = new Set(
      D.workItems.filter(w => w.assignee == m.id && w.project).map(w => w.project)
    ).size;

    const bg  = m.color || '#0eb5cc';
    const sz  = 46;
    const av  = `<div class="av" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*.34)}px;
                   background:${bg};color:#fff;flex-shrink:0">${m.initials || m.name?.substring(0,2).toUpperCase() || '?'}</div>`;

    return `<div class="member-card">
      <div class="member-head">
        ${av}
        <div>
          <div class="member-name">${m.name}</div>
          <div class="member-role">${m.role || 'Membre'}</div>
        </div>
      </div>
      <div class="m-stats">
        <div class="m-stat">
          <div class="m-stat-val" style="color:var(--accent)">${active}</div>
          <div class="m-stat-lbl">En cours</div>
        </div>
        <div class="m-stat">
          <div class="m-stat-val" style="color:var(--green)">${done}</div>
          <div class="m-stat-lbl">Terminés</div>
        </div>
        <div class="m-stat">
          <div class="m-stat-val" style="color:var(--blue)">${projs}</div>
          <div class="m-stat-lbl">Projets</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function _reloadMembers() {
  toast('Rechargement...', 'info', '🔄');
  const mb = await _safeFetch(API + '/members/');
  if (mb && mb.length) {
    D.members = mb;
    renderTeamFixed();
    toast(mb.length + ' membre(s) chargé(s)', 'success', '✅');
  } else {
    toast('Membres non retournés — vérifiez l\'API', 'error', '⚠');
  }
}


// ═══════════════════════════════════════════════════
// PATCH 4 — CALENDRIER intégré (sans dépendance externe)
// ═══════════════════════════════════════════════════
let _calDate = new Date();
let _calView = 'month';

function renderCalendarFix() {
  const pg = document.getElementById('page-calendar');
  if (!pg) return;

  pg.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
                margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="_calMove(-1)">‹</button>
        <div id="cal-label" style="font-size:15px;font-weight:700;min-width:180px;
             text-align:center;text-transform:uppercase;font-family:var(--mono)"></div>
        <button class="btn btn-outline btn-sm" onclick="_calMove(1)">›</button>
        <button class="btn btn-ghost btn-sm" onclick="_calDate=new Date();renderCalendarFix()">Aujourd'hui</button>
      </div>
      <div style="display:flex;gap:6px">
        <button id="btn-cal-month" class="btn btn-sm" onclick="_calView='month';renderCalendarFix()">📅 Mois</button>
        <button id="btn-cal-list"  class="btn btn-sm" onclick="_calView='list';renderCalendarFix()">📋 Échéances</button>
        <button id="btn-cal-risk"  class="btn btn-sm" onclick="_calView='risk';renderCalendarFix()">🧠 Risques</button>
      </div>
    </div>
    <div id="cal-content"></div>`;

  // Styles des boutons actifs
  ['month','list','risk'].forEach(v => {
    const btn = document.getElementById('btn-cal-' + v);
    if (btn) btn.className = 'btn btn-sm ' + (_calView === v ? 'btn-primary' : 'btn-outline');
  });

  // Libellé du mois
  const lbl = document.getElementById('cal-label');
  if (lbl) lbl.textContent = _calDate.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });

  // Rendu selon la vue
  const content = document.getElementById('cal-content');
  if (!content) return;
  if (_calView === 'month')     content.innerHTML = _buildMonthView();
  else if (_calView === 'list') content.innerHTML = _buildListView();
  else                           content.innerHTML = _buildRiskView();
}

function _calMove(dir) {
  _calDate = new Date(_calDate.getFullYear(), _calDate.getMonth() + dir, 1);
  renderCalendarFix();
}

function _buildMonthView() {
  const year  = _calDate.getFullYear();
  const month = _calDate.getMonth();
  const first = new Date(year, month, 1).getDay(); // 0=dim
  const days  = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Collecter les événements
  const evMap = {};
  function addEv(day, label, color, type) {
    if (!evMap[day]) evMap[day] = [];
    evMap[day].push({ label, color, type });
  }

  D.projects.forEach(p => {
    if (!p.deadline) return;
    const d = new Date(p.deadline);
    if (d.getFullYear() === year && d.getMonth() === month)
      addEv(d.getDate(), p.name, _statusColor(p.status), 'Projet');
  });
  D.tenders.forEach(t => {
    if (!t.deadline) return;
    const d = new Date(t.deadline);
    if (d.getFullYear() === year && d.getMonth() === month)
      addEv(d.getDate(), t.org || t.title, 'var(--accent)', 'AO');
  });
  D.workItems.filter(w => w.due).forEach(w => {
    const d = new Date(w.due);
    if (d.getFullYear() === year && d.getMonth() === month)
      addEv(d.getDate(), (w.title || '').substring(0, 18), 'var(--purple)', 'Tâche');
  });

  const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  let html = `
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:6px">
      ${jours.map(j => `<div style="text-align:center;font-size:10px;font-weight:700;
        color:var(--text3);font-family:var(--mono);padding:6px 0">${j}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">`;

  for (let i = 0; i < first; i++)
    html += `<div style="min-height:76px;background:var(--surface);border-radius:6px;opacity:.2"></div>`;

  for (let d = 1; d <= days; d++) {
    const isToday = (today.getDate()===d && today.getMonth()===month && today.getFullYear()===year);
    const evs     = evMap[d] || [];
    const hasEv   = evs.length > 0;

    html += `<div style="min-height:76px;padding:5px;border-radius:6px;
      background:${isToday ? 'var(--accentbg)' : hasEv ? 'var(--card2)' : 'var(--card)'};
      border:1px solid ${isToday ? 'rgba(14,181,204,.4)' : hasEv ? 'rgba(14,181,204,.15)' : 'var(--border)'}">
      <div style="font-size:11px;font-weight:${isToday?'700':'500'};margin-bottom:3px;
        ${isToday ? 'display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:var(--accent);color:#000;border-radius:50%;' : 'color:var(--text2)'}">
        ${d}
      </div>
      ${evs.slice(0,2).map(e => `
        <div title="${e.type}: ${e.label}"
          style="font-size:9px;padding:2px 4px;border-radius:3px;margin-bottom:2px;
            background:${e.color}22;color:${e.color};
            border-left:2px solid ${e.color};
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${e.label.substring(0, 13)}
        </div>`).join('')}
      ${evs.length > 2 ? `<div style="font-size:9px;color:var(--text3)">+${evs.length-2}</div>` : ''}
    </div>`;
  }

  return html + '</div>';
}

function _buildListView() {
  const now   = new Date();
  const items = [];

  D.projects.forEach(p => {
    if (!p.deadline) return;
    const diff = Math.floor((new Date(p.deadline) - now) / 86400000);
    items.push({ date:p.deadline, label:p.name, type:'Projet', color:_statusColor(p.status), diff });
  });
  D.tenders.forEach(t => {
    if (!t.deadline) return;
    const diff = Math.floor((new Date(t.deadline) - now) / 86400000);
    items.push({ date:t.deadline, label:'AO — ' + (t.org||t.title), type:'AO', color:'var(--accent)', diff });
  });
  D.workItems.filter(w => w.due).forEach(w => {
    const diff = Math.floor((new Date(w.due) - now) / 86400000);
    items.push({ date:w.due, label:w.title, type:'Tâche', color:'var(--purple)', diff });
  });

  items.sort((a, b) => a.diff - b.diff);

  if (!items.length)
    return '<div style="text-align:center;padding:48px;color:var(--text3)">📅 Aucune échéance planifiée</div>';

  return `<div style="display:flex;flex-direction:column;gap:8px">
    ${items.map(ev => {
      const urgent   = ev.diff < 0;
      const warning  = ev.diff >= 0 && ev.diff <= 7;
      const borderC  = urgent ? 'var(--red)' : warning ? 'var(--orange)' : ev.color;
      const labelTxt = urgent ? '⚠ Retard' : warning ? '⚡ Urgent' : '✅ OK';
      const labelBg  = urgent ? 'var(--redbg)' : warning ? 'var(--orangebg)' : 'var(--greenbg)';
      const labelCol = urgent ? 'var(--red)'   : warning ? 'var(--orange)'   : 'var(--green)';
      const dayTxt   = urgent ? 'J+'+Math.abs(ev.diff) : ev.diff===0 ? "Auj." : 'J-'+ev.diff;
      return `<div style="display:flex;align-items:center;gap:14px;padding:12px 16px;
        background:var(--card);border-radius:8px;
        border:1px solid ${urgent?'rgba(239,68,68,.3)':warning?'rgba(249,115,22,.3)':'var(--border)'};
        border-left:4px solid ${borderC}">
        <div style="font-family:var(--mono);font-size:11px;font-weight:700;min-width:50px;
          color:${urgent?'var(--red)':warning?'var(--orange)':'var(--text3)'}">${dayTxt}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ev.label}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${ev.type} · ${_fd(ev.date)}</div>
        </div>
        <span style="font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600;
          background:${labelBg};color:${labelCol};white-space:nowrap">${labelTxt}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function _buildRiskView() {
  const now = new Date();
  const projects = D.projects.filter(p => p.status !== 'Terminé').map(p => {
    let score = 0;
    if (p.deadline) {
      const diff = Math.floor((new Date(p.deadline) - now) / 86400000);
      if (diff < 0)        score += 40;
      else if (diff <= 7)  score += 30;
      else if (diff <= 14) score += 15;
    }
    if ((p.progress||0) < 30)  score += 20;
    else if ((p.progress||0) < 60) score += 10;
    if (p.status === 'Bloqué')     score += 25;
    if (p.status === 'En attente') score += 10;
    const bugs = D.workItems.filter(w => w.project == p.id && w.type==='bug' && w.status!=='Terminé').length;
    score = Math.min(100, score + Math.min(bugs * 5, 20));
    const color = score >= 70 ? 'var(--red)' : score >= 40 ? 'var(--orange)' : 'var(--green)';
    return { ...p, score, color };
  }).sort((a, b) => b.score - a.score);

  if (!projects.length)
    return '<div style="text-align:center;padding:48px;color:var(--text3)">Aucun projet actif</div>';

  return `<div style="display:flex;flex-direction:column;gap:10px">
    ${projects.map(p => {
      const r = 18, cx = 22, cy = 22;
      const circ = 2 * Math.PI * r;
      const dash  = circ * p.score / 100;
      return `<div style="display:flex;align-items:center;gap:16px;padding:16px;
        background:var(--card);border:1px solid var(--border);border-radius:10px">
        <svg width="44" height="44" viewBox="0 0 44 44" style="transform:rotate(-90deg);flex-shrink:0">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="4"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.color}" stroke-width="4"
            stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
        </svg>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">
            ${p.status} · ${p.progress||0}% · ${p.deadline ? _fd(p.deadline) : 'Pas de deadline'}
          </div>
        </div>
        <div style="text-align:center;flex-shrink:0">
          <div style="font-size:22px;font-weight:700;font-family:var(--mono);color:${p.color}">${p.score}</div>
          <div style="font-size:9px;color:var(--text3);font-family:var(--mono)">RISQUE</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="_openSWOT(${p.id})">🧠 SWOT</button>
      </div>`;
    }).join('')}
  </div>`;
}

// Helpers calendrier
function _statusColor(status) {
  const map = { 'En cours':'#22c55e','Planifié':'#3b82f6','En attente':'#f97316','Terminé':'#64748b','Bloqué':'#ef4444' };
  return map[status] || '#3b82f6';
}
function _fd(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }); }
  catch { return String(d); }
}


// ═══════════════════════════════════════════════════
// PATCH 5 — MON ESPACE
// ═══════════════════════════════════════════════════
function renderMySpaceFix() {
  const pg = document.getElementById('page-my-space');
  if (!pg) return;
  const user = getUser();
  if (!user) { pg.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Non connecté</div>'; return; }

  // Trouver le membre lié à cet utilisateur
  const myMember = D.members.find(m =>
    m.id == user.member_id ||
    m.initials === user.member_initials
  );

  const myProjects = myMember
    ? D.projects.filter(p => (p.members_detail||[]).some(m => m.id == myMember.id))
    : [];
  const myTasks = myMember
    ? D.workItems.filter(w => w.assignee == myMember.id && ['En cours','A faire'].includes(w.status))
    : [];
  const doneTasks = myMember
    ? D.workItems.filter(w => w.assignee == myMember.id && w.status === 'Terminé').length
    : 0;

  pg.innerHTML = `
    <div style="margin-bottom:24px;padding:20px;
      background:linear-gradient(135deg,var(--accentbg),var(--card));
      border:1px solid rgba(14,181,204,.2);border-radius:var(--radius)">
      <div style="font-size:22px;font-weight:700;margin-bottom:4px">
        Bonjour ${user.first_name || user.username} 👋
      </div>
      <div style="font-size:12px;color:var(--text2)">Aperçu de tes projets et tâches assignées</div>
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      <div class="stat-card c-blue">
        <div class="stat-value">${myProjects.length}</div>
        <div class="stat-label">Mes projets</div>
        <div class="stat-icon">📁</div>
      </div>
      <div class="stat-card c-accent">
        <div class="stat-value">${myTasks.length}</div>
        <div class="stat-label">En cours</div>
        <div class="stat-icon">⚡</div>
      </div>
      <div class="stat-card c-green">
        <div class="stat-value">${doneTasks}</div>
        <div class="stat-label">Terminées</div>
        <div class="stat-icon">✅</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="section-title">📁 Mes Projets</div>
        ${myProjects.length ? myProjects.map(p => `
          <div style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center">
            <div style="width:4px;height:40px;border-radius:4px;background:${_statusColor(p.status)};flex-shrink:0"></div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${p.name}</div>
              <div class="progress-wrap" style="margin:5px 0 0">
                <div class="progress-bar" style="width:${p.progress||0}%"></div>
              </div>
            </div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text3)">${p.progress||0}%</div>
          </div>`).join('')
        : '<div style="text-align:center;padding:24px;color:var(--text3)">Aucun projet assigné</div>'}
      </div>
      <div class="card">
        <div class="section-title">✅ Mes Tâches</div>
        ${myTasks.length ? myTasks.slice(0,8).map(t => `
          <div style="padding:9px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
            <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
              background:${t.status==='En cours'?'var(--accent)':'var(--blue)'}"></div>
            <div style="flex:1;font-size:12.5px;font-weight:500">${t.title}</div>
            ${t.due ? `<div style="font-size:10px;color:var(--text3)">${_fd(t.due)}</div>` : ''}
          </div>`).join('')
        : '<div style="text-align:center;padding:24px;color:var(--text3)">Aucune tâche en cours</div>'}
      </div>
    </div>`;
}


// ═══════════════════════════════════════════════════
// PATCH 6 — AIDE À LA DÉCISION
// ═══════════════════════════════════════════════════
function renderDecisionFix() {
  const pg = document.getElementById('page-decision');
  if (!pg) return;
  const now    = new Date();
  const won    = D.tenders.filter(t => t.status === 'Gagné').length;
  const total  = D.tenders.length;
  const rate   = total ? Math.round(won / total * 100) : 0;

  const recs = [];
  D.projects.forEach(p => {
    if (!p.deadline || p.status === 'Terminé') return;
    const diff = Math.floor((new Date(p.deadline) - now) / 86400000);
    if (diff < 0)
      recs.push({ level:'critical', icon:'🚨', text:`<strong>${p.name}</strong> — Deadline dépassée de ${Math.abs(diff)}j`, action:`_openSWOT(${p.id})`, lbl:'SWOT' });
    else if (diff <= 7 && (p.progress||0) < 70)
      recs.push({ level:'warning', icon:'⚠️', text:`<strong>${p.name}</strong> — ${diff}j restants, ${p.progress||0}%`, action:`nav('board',null)`, lbl:'Kanban' });
  });
  const bugs = D.workItems.filter(w => w.type==='bug' && w.status!=='Terminé');
  if (bugs.length >= 2)
    recs.push({ level:'warning', icon:'🐛', text:`<strong>${bugs.length} bugs ouverts</strong>`, action:`nav('board',null)`, lbl:'Voir' });
  if (won > 0)
    recs.push({ level:'success', icon:'🏆', text:`<strong>${won} AO gagné${won>1?'s':''}</strong> — Bravo !`, action:null });
  if (!recs.length)
    recs.push({ level:'success', icon:'✅', text:'Tous les indicateurs sont au vert !', action:null });

  const cMap = { critical:'var(--red)', warning:'var(--orange)', success:'var(--green)', info:'var(--blue)' };
  const bMap = { critical:'var(--redbg)', warning:'var(--orangebg)', success:'var(--greenbg)', info:'var(--bluebg)' };

  pg.innerHTML = `
    <div style="margin-bottom:20px;padding:18px;
      background:linear-gradient(135deg,var(--accentbg),var(--card));
      border:1px solid rgba(14,181,204,.2);border-radius:var(--radius);
      display:flex;align-items:center;gap:16px">
      <div style="font-size:32px">🎯</div>
      <div>
        <div style="font-size:16px;font-weight:700">Aide à la décision</div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">Analyse automatique · SWOT · Risques · Recommandations</div>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card c-blue">
        <div class="stat-value">${D.projects.filter(p=>p.status==='En cours').length}</div>
        <div class="stat-label">Projets actifs</div><div class="stat-icon">📊</div>
      </div>
      <div class="stat-card c-accent">
        <div class="stat-value">${recs.filter(r=>r.level==='critical').length}</div>
        <div class="stat-label">Alertes critiques</div><div class="stat-icon">🚨</div>
      </div>
      <div class="stat-card c-green">
        <div class="stat-value">${rate}%</div>
        <div class="stat-label">Succès AO</div><div class="stat-icon">🏆</div>
      </div>
      <div class="stat-card c-purple">
        <div class="stat-value">${D.members.length}</div>
        <div class="stat-label">Membres</div><div class="stat-icon">👥</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="section-title">💡 Recommandations</div>
        ${recs.slice(0,8).map(r => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:10px;margin-bottom:8px;
            background:${bMap[r.level]};border-radius:8px;border-left:3px solid ${cMap[r.level]}">
            <span style="font-size:16px;flex-shrink:0">${r.icon}</span>
            <div style="flex:1;font-size:12px;line-height:1.5">${r.text}</div>
            ${r.action ? `<button class="btn btn-outline btn-sm" onclick="${r.action}" style="font-size:10px;flex-shrink:0">${r.lbl}</button>` : ''}
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="section-title">🧠 SWOT projets actifs</div>
        ${D.projects.filter(p=>p.status!=='Terminé').slice(0,6).map(p => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;
            border-bottom:1px solid var(--border);cursor:pointer" onclick="_openSWOT(${p.id})">
            <div style="width:8px;height:8px;border-radius:50%;background:${_statusColor(p.status)};flex-shrink:0"></div>
            <div style="flex:1;font-size:12.5px;font-weight:600">${p.name}</div>
            <div style="font-size:10px;color:var(--text3)">${p.progress||0}%</div>
            <button class="btn btn-outline btn-sm" style="font-size:10px">🧠 Voir</button>
          </div>`).join('') ||
          '<div style="text-align:center;padding:20px;color:var(--text3)">Aucun projet actif</div>'}
      </div>
    </div>`;
}


// ═══════════════════════════════════════════════════
// PATCH 7 — UTILISATEURS
// ═══════════════════════════════════════════════════
async function renderUsersFix() {
  const pg = document.getElementById('page-users');
  if (!pg) return;
  const role = getUser()?.role;
  if (role !== 'admin') {
    pg.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red)">⛔ Accès administrateur uniquement</div>';
    return;
  }
  pg.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Chargement...</div>';

  let users = [];
  try {
    const r = await apiFetch(API + '/users/');
    if (r?.ok) users = await r.json();
  } catch(e) {}

  if (!users.length) {
    pg.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Aucun utilisateur — vérifiez /api/users/</div>';
    return;
  }

  const roleBg  = { admin:'var(--accentbg)',manager:'var(--bluebg)',member:'var(--card2)' };
  const roleCol = { admin:'var(--accent)',   manager:'var(--blue)',  member:'var(--text3)' };

  pg.innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:16px;font-weight:700">Gestion des accès</div>
        <div style="font-size:12px;color:var(--text3)">${users.length} utilisateur${users.length>1?'s':''}</div>
      </div>
    </div>
    <div class="card" style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--border)">
          ${['UTILISATEUR','RÔLE','MEMBRE LIÉ','STATUT','LIER'].map(h =>
            `<th style="text-align:left;padding:10px 14px;font-size:10px;color:var(--text3);font-family:var(--mono);font-weight:700;letter-spacing:1px">${h}</th>`
          ).join('')}
        </tr></thead>
        <tbody>
          ${users.map(u => `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:12px 14px">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="av" style="width:32px;height:32px;font-size:11px;
                    background:${roleBg[u.role]||'var(--card)'};color:${roleCol[u.role]||'var(--text)'}">
                    ${(u.first_name||u.username||'?').substring(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style="font-size:13px;font-weight:600">${u.first_name||''} ${u.last_name||''}</div>
                    <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">@${u.username}</div>
                  </div>
                </div>
              </td>
              <td style="padding:12px 14px">
                <select onchange="_changeRole(${u.id},this.value)"
                  style="background:${roleBg[u.role]||'var(--card)'};color:${roleCol[u.role]||'var(--text)'};
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
                  ${u.is_active ? '● Actif' : '● Inactif'}
                </span>
              </td>
              <td style="padding:12px 14px">
                <select onchange="_linkMember(${u.id},this.value)"
                  style="background:var(--surface);border:1px solid var(--border);border-radius:6px;
                    padding:4px 8px;font-size:11px;color:var(--text)">
                  <option value="">Choisir...</option>
                  ${D.members.map(m => `<option value="${m.id}" ${u.member_id==m.id?'selected':''}>${m.name}</option>`).join('')}
                </select>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function _changeRole(userId, role) {
  const r = await apiFetch(API + '/users/' + userId + '/role/', { method:'PATCH', body:JSON.stringify({ role }) });
  if (r?.ok) toast('Rôle mis à jour : ' + role, 'success', '✅');
  else       toast('Erreur changement rôle', 'error', '⚠');
}
async function _linkMember(userId, memberId) {
  if (!memberId) return;
  const r = await apiFetch(API + '/users/' + userId + '/role/', { method:'PATCH', body:JSON.stringify({ member_id:parseInt(memberId) }) });
  if (r?.ok) toast('Membre lié', 'success', '✅');
}


// ═══════════════════════════════════════════════════
// PATCH 8 — SWOT modal (version standalone)
// ═══════════════════════════════════════════════════
function _openSWOT(projectId) {
  const p = D.projects.find(x => x.id == projectId);
  if (!p) return;

  let modal = document.getElementById('modal-swot');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-swot';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '600';
    modal.innerHTML = `<div class="modal" style="max-width:780px;width:100%"><div id="swot-inner"></div></div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.classList.add('open');

  // Calculer SWOT
  const now    = new Date();
  const wi     = D.workItems.filter(w => w.project == p.id);
  const bugs   = wi.filter(w => w.type==='bug' && w.status!=='Terminé').length;
  const done   = wi.filter(w => w.status==='Terminé').length;
  const prog   = p.progress || 0;
  const mems   = (p.members_detail||[]).length;
  const dLeft  = p.deadline ? Math.floor((new Date(p.deadline)-now)/86400000) : null;

  const s=[],w=[],o=[],t=[];
  if (prog>=70) s.push('Avancement solide : '+prog+'% complété');
  if (mems>=3)  s.push('Équipe mobilisée : '+mems+' membres');
  if (done>0)   s.push(done+' tâches livrées');
  if (bugs===0 && wi.length>0) s.push('Aucun bug ouvert');
  if (!s.length) s.push('Projet structuré avec équipe dédiée');

  if (prog<30)   w.push('Avancement faible : '+prog+'%');
  if (bugs>=2)   w.push(bugs+' bugs non résolus');
  if (mems<2)    w.push('Équipe réduite');
  if (!p.deadline) w.push('Pas de deadline définie');
  if (!w.length) w.push('Points à améliorer');

  if (p.category==='GIS') o.push('Forte demande SIG en Afrique centrale');
  if (p.category==='IT')  o.push('Digitalisation croissante des institutions');
  o.push('Visibilité KICEKO auprès des partenaires');

  if (dLeft!==null) {
    if (dLeft<0)       t.push('Deadline dépassée de '+Math.abs(dLeft)+'j');
    else if (dLeft<=7) t.push('Deadline dans '+dLeft+'j — urgence');
  }
  if (bugs>=3) t.push('Dette technique élevée');
  t.push('Contraintes budgétaires partenaires');

  const quads = [
    { label:'💪 Forces',       color:'var(--green)',  bg:'var(--greenbg)',  items:s.slice(0,5) },
    { label:'⚠️ Faiblesses',   color:'var(--orange)', bg:'var(--orangebg)', items:w.slice(0,5) },
    { label:'🚀 Opportunités', color:'var(--blue)',   bg:'var(--bluebg)',   items:o.slice(0,5) },
    { label:'🔴 Menaces',      color:'var(--red)',    bg:'var(--redbg)',    items:t.slice(0,5) },
  ];

  document.getElementById('swot-inner').innerHTML = `
    <div class="modal-title" style="margin-bottom:14px">
      <div>
        <div style="font-size:15px;font-weight:700">🧠 Matrice SWOT — ${p.name}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${p.status} · ${prog}% · Généré automatiquement</div>
      </div>
      <button class="modal-close" onclick="document.getElementById('modal-swot').classList.remove('open')">×</button>
    </div>
    <div style="margin-bottom:12px;padding:8px 12px;background:var(--surface);border-radius:8px;
      display:flex;align-items:center;gap:12px">
      <div style="width:8px;height:8px;border-radius:50%;background:${_statusColor(p.status)}"></div>
      <div style="flex:1"><div class="progress-wrap" style="margin:0">
        <div class="progress-bar" style="width:${prog}%"></div>
      </div></div>
      <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--accent)">${prog}%</span>
      ${p.deadline ? `<span style="font-size:11px;color:var(--text3)">📅 ${_fd(p.deadline)}</span>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${quads.map(q => `
        <div style="background:${q.bg};border:1px solid var(--border);border-radius:10px;padding:14px;min-height:130px">
          <div style="font-size:13px;font-weight:700;color:${q.color};margin-bottom:10px">${q.label}</div>
          ${q.items.map(i => `
            <div style="display:flex;gap:8px;margin-bottom:7px">
              <div style="width:5px;height:5px;border-radius:50%;background:${q.color};flex-shrink:0;margin-top:6px"></div>
              <div style="font-size:11.5px;color:var(--text2);line-height:1.5">${i}</div>
            </div>`).join('')}
        </div>`).join('')}
    </div>
    <div class="form-actions" style="margin-top:14px">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-swot').classList.remove('open')">Fermer</button>
    </div>`;
}

// Compatibilité avec les appels openSWOT() de l'ancien code
function openSWOT(id)      { _openSWOT(id); }
function openSWOTModal(id) { _openSWOT(id); }


// ═══════════════════════════════════════════════════
// PATCH 9 — Notification bell déduplication
// ═══════════════════════════════════════════════════
(function fixDoubleBell() {
  function dedup() {
    const bells = document.querySelectorAll('.notif-wrapper');
    if (bells.length > 1) {
      for (let i = 1; i < bells.length; i++) bells[i].remove();
    }
  }
  if (document.readyState === 'complete') dedup();
  else window.addEventListener('load', dedup);
  setTimeout(dedup, 800);
})();


// ═══════════════════════════════════════════════════
// PATCH 10 — updateChips étendu
// ═══════════════════════════════════════════════════
const _origUpdateChips = typeof updateChips === 'function' ? updateChips : null;
function updateChips() {
  if (_origUpdateChips) _origUpdateChips();
  // Chip alertes sidebar
  const c3  = document.getElementById('chip-alerts');
  if (c3) {
    const now  = new Date();
    const n    = D.projects.filter(p =>
      p.deadline && p.status !== 'Terminé' &&
      Math.floor((new Date(p.deadline) - now) / 86400000) <= 7
    ).length;
    c3.textContent   = n;
    c3.style.display = n > 0 ? 'inline-flex' : 'none';
  }
}


// ═══════════════════════════════════════════════════
// INIT FIX — appliquer RBAC après chargement
// ═══════════════════════════════════════════════════
const _origLoadAll = loadAll;
async function loadAll() {
  await _origLoadAll();
  // Appliquer RBAC sur la sidebar après chargement
  const role   = getUser()?.role || 'member';
  const hidden = role === 'member'
    ? ['board','backlog','sprints','tenders','analytics','users','decision']
    : [];
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.getAttribute('data-page');
    el.style.display = hidden.includes(page) ? 'none' : '';
  });
}

console.log('✅ fix.js chargé — calendrier, membres et loading corrigés');
