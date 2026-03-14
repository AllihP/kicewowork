/**
 * calendar_fix.js — KICEKO ProjectHub
 * Calendrier réécrit avec classes CSS (pas de styles inline)
 * Fix : grille cassée en production (CSP bloque display:grid inline)
 *
 * CHARGER APRÈS app.js ET fix.js dans index.html :
 * <script src="{% static 'js/calendar_fix.js' %}"></script>
 */

let _calDate = new Date();
let _calView = 'month';

// ── Remplace renderCalendarFix de fix.js ──────────────────
function renderCalendarFix() {
  const pg = document.getElementById('page-calendar');
  if (!pg) return;

  pg.innerHTML = `
    <div class="cal-toolbar">
      <div class="cal-nav">
        <button class="btn btn-outline btn-sm" onclick="_calMove(-1)">‹</button>
        <div id="cal-label" class="cal-month-label"></div>
        <button class="btn btn-outline btn-sm" onclick="_calMove(1)">›</button>
        <button class="btn btn-ghost btn-sm"
          onclick="_calDate=new Date();renderCalendarFix()">Aujourd'hui</button>
      </div>
      <div class="cal-view-btns">
        <button id="vbtn-month" class="btn btn-sm"
          onclick="_calView='month';renderCalendarFix()">📅 Mois</button>
        <button id="vbtn-list"  class="btn btn-sm"
          onclick="_calView='list';renderCalendarFix()">📋 Échéances</button>
        <button id="vbtn-risk"  class="btn btn-sm"
          onclick="_calView='risk';renderCalendarFix()">🧠 Risques</button>
      </div>
    </div>
    <div id="cal-content"></div>`;

  // Boutons actifs
  ['month','list','risk'].forEach(v => {
    const btn = document.getElementById('vbtn-' + v);
    if (btn) btn.className = 'btn btn-sm ' + (_calView === v ? 'btn-primary' : 'btn-outline');
  });

  // Libellé
  const lbl = document.getElementById('cal-label');
  if (lbl) lbl.textContent = _calDate.toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric'
  });

  // Rendu
  const content = document.getElementById('cal-content');
  if (!content) return;

  if (_calView === 'month')     content.innerHTML = _buildMonth();
  else if (_calView === 'list') content.innerHTML = _buildList();
  else                           content.innerHTML = _buildRisk();
}

function _calMove(dir) {
  _calDate = new Date(_calDate.getFullYear(), _calDate.getMonth() + dir, 1);
  renderCalendarFix();
}

// ═══════════════════════════════════════════════════
// VUE MOIS — utilise des classes CSS
// ═══════════════════════════════════════════════════
function _buildMonth() {
  const year  = _calDate.getFullYear();
  const month = _calDate.getMonth();
  const first = new Date(year, month, 1).getDay(); // 0=dim
  const days  = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Collecter les événements par jour
  const evMap = {};
  function addEv(day, label, cssClass, typeLabel) {
    if (!evMap[day]) evMap[day] = [];
    evMap[day].push({ label, cssClass, typeLabel });
  }

  D.projects.forEach(p => {
    if (!p.deadline) return;
    const d = new Date(p.deadline);
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const st  = p.status;
    const cls = st === 'Bloqué' ? 'cal-event-bloque'
              : st === 'En attente' ? 'cal-event-attente'
              : st === 'Terminé' ? 'cal-event-tache'
              : 'cal-event-projet';
    addEv(d.getDate(), p.name, cls, 'Projet');
  });

  D.tenders.forEach(t => {
    if (!t.deadline) return;
    const d = new Date(t.deadline);
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    addEv(d.getDate(), t.org || t.title, 'cal-event-ao', 'AO');
  });

  D.workItems.filter(w => w.due).forEach(w => {
    const d = new Date(w.due);
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    addEv(d.getDate(), (w.title||'').substring(0, 18), 'cal-event-tache', 'Tâche');
  });

  // En-tête jours
  const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  let html = '<div class="cal-days-header">';
  JOURS.forEach(j => {
    html += `<div class="cal-day-label">${j}</div>`;
  });
  html += '</div>';

  // Grille
  html += '<div class="cal-grid">';

  // Cellules vides au début
  for (let i = 0; i < first; i++) {
    html += '<div class="cal-cell empty"></div>';
  }

  // Jours du mois
  for (let d = 1; d <= days; d++) {
    const isToday = (
      today.getDate() === d &&
      today.getMonth() === month &&
      today.getFullYear() === year
    );
    const evs    = evMap[d] || [];
    const hasEv  = evs.length > 0;

    let cellClass = 'cal-cell';
    if (isToday) cellClass += ' is-today';
    else if (hasEv) cellClass += ' has-events';

    html += `<div class="${cellClass}">`;
    html += `<span class="cal-day-num">${d}</span>`;

    evs.slice(0, 2).forEach(ev => {
      html += `<span class="cal-event ${ev.cssClass}" title="${ev.typeLabel}: ${ev.label}">`;
      html += ev.label.substring(0, 14);
      html += '</span>';
    });

    if (evs.length > 2) {
      html += `<span class="cal-more">+${evs.length - 2} autres</span>`;
    }

    html += '</div>';
  }

  html += '</div>';

  // Légende
  html += `
    <div class="cal-legend" style="margin-top:12px">
      <div class="cal-legend-item">
        <div class="cal-legend-dot" style="background:#22c55e"></div> Projets
      </div>
      <div class="cal-legend-item">
        <div class="cal-legend-dot" style="background:var(--accent)"></div> AO
      </div>
      <div class="cal-legend-item">
        <div class="cal-legend-dot" style="background:#a855f7"></div> Tâches
      </div>
      <div class="cal-legend-item">
        <div class="cal-legend-dot" style="background:#ef4444"></div> Bloqué
      </div>
    </div>`;

  return html;
}

// ═══════════════════════════════════════════════════
// VUE LISTE — échéances triées
// ═══════════════════════════════════════════════════
function _buildList() {
  const now   = new Date();
  const items = [];

  D.projects.forEach(p => {
    if (!p.deadline) return;
    const diff = Math.floor((new Date(p.deadline) - now) / 86400000);
    items.push({
      date: p.deadline, label: p.name,
      type: 'Projet', diff,
      meta: p.status + ' · ' + (p.progress||0) + '%'
    });
  });

  D.tenders.forEach(t => {
    if (!t.deadline) return;
    const diff = Math.floor((new Date(t.deadline) - now) / 86400000);
    items.push({
      date: t.deadline, label: 'AO — ' + (t.org || t.title),
      type: 'AO', diff, meta: t.status
    });
  });

  D.workItems.filter(w => w.due).forEach(w => {
    const diff = Math.floor((new Date(w.due) - now) / 86400000);
    items.push({
      date: w.due, label: w.title,
      type: 'Tâche', diff, meta: w.status + ' · ' + (w.priority||'')
    });
  });

  items.sort((a, b) => a.diff - b.diff);

  if (!items.length) {
    return '<div style="text-align:center;padding:48px;color:var(--text3)">📅 Aucune échéance planifiée</div>';
  }

  let html = '<div class="cal-list">';

  items.forEach(ev => {
    const retard = ev.diff < 0;
    const urgent = ev.diff >= 0 && ev.diff <= 7;
    const stateClass = retard ? 'is-retard' : urgent ? 'is-urgent' : 'is-ok';
    const dayTxt = retard ? 'J+' + Math.abs(ev.diff)
                 : ev.diff === 0 ? "Auj."
                 : 'J-' + ev.diff;
    const badgeTxt = retard ? '⚠ Retard' : urgent ? '⚡ Urgent' : '✅ OK';

    html += `<div class="cal-list-item ${stateClass}">`;
    html += `<div class="cal-list-day ${stateClass}">${dayTxt}</div>`;
    html += `<div class="cal-list-info">`;
    html += `<div class="cal-list-label">${ev.label}</div>`;
    html += `<div class="cal-list-meta">${ev.type} · ${_calFd(ev.date)} · ${ev.meta}</div>`;
    html += `</div>`;
    html += `<span class="cal-list-badge ${stateClass}">${badgeTxt}</span>`;
    html += `</div>`;
  });

  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════
// VUE RISQUES — score par projet
// ═══════════════════════════════════════════════════
function _buildRisk() {
  const now = new Date();

  const projects = D.projects
    .filter(p => p.status !== 'Terminé')
    .map(p => {
      let score = 0;
      if (p.deadline) {
        const diff = Math.floor((new Date(p.deadline) - now) / 86400000);
        if (diff < 0)        score += 40;
        else if (diff <= 7)  score += 30;
        else if (diff <= 14) score += 15;
      }
      const prog = p.progress || 0;
      if (prog < 30)  score += 20;
      else if (prog < 60) score += 10;
      if (p.status === 'Bloqué')     score += 25;
      if (p.status === 'En attente') score += 10;
      const bugs = D.workItems.filter(w =>
        w.project == p.id && w.type === 'bug' && w.status !== 'Terminé'
      ).length;
      score = Math.min(100, score + Math.min(bugs * 5, 20));

      const color = score >= 70 ? 'var(--red)'
                  : score >= 40 ? 'var(--orange)'
                  : 'var(--green)';
      return { ...p, score, riskColor: color };
    })
    .sort((a, b) => b.score - a.score);

  if (!projects.length) {
    return '<div style="text-align:center;padding:48px;color:var(--text3)">Aucun projet actif</div>';
  }

  let html = '<div class="cal-risk-list">';

  projects.forEach(p => {
    // SVG anneau de risque
    const r     = 18, cx = 22, cy = 22;
    const circ  = +(2 * Math.PI * r).toFixed(1);
    const dash  = +(circ * p.score / 100).toFixed(1);

    html += `<div class="cal-risk-item" onclick="_openSWOT(${p.id})">`;

    // Anneau SVG
    html += `<svg width="44" height="44" viewBox="0 0 44 44"
               style="transform:rotate(-90deg);flex-shrink:0">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
              stroke="var(--border)" stroke-width="4"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
              stroke="${p.riskColor}" stroke-width="4"
              stroke-dasharray="${dash} ${circ}"
              stroke-linecap="round"/>
    </svg>`;

    html += `<div class="cal-risk-info">`;
    html += `<div class="cal-risk-name">${p.name}</div>`;
    html += `<div class="cal-risk-meta">`;
    html += `${p.status} · ${p.progress||0}%`;
    if (p.deadline) html += ` · ${_calFd(p.deadline)}`;
    html += `</div></div>`;

    html += `<div class="cal-risk-score-box">`;
    html += `<div class="cal-risk-score" style="color:${p.riskColor}">${p.score}</div>`;
    html += `<div class="cal-risk-score-label">RISQUE</div>`;
    html += `</div>`;

    html += `<button class="btn btn-outline btn-sm">🧠 SWOT</button>`;
    html += `</div>`;
  });

  html += '</div>';
  return html;
}

// ── Helper date ───────────────────────────────────
function _calFd(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
  } catch { return String(d); }
}

// ── Rendre renderCalendarFix disponible globalement
window.renderCalendarFix = renderCalendarFix;
window._calMove = _calMove;

console.log('✅ calendar_fix.js chargé');
