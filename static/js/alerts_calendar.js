/**
 * alerts_calendar.js — Système Intelligent KICEKO ProjectHub
 * Modules :
 * - Moteur d'alertes intelligentes (analyse risques)
 * - Calendrier interactif mensuel
 * - Centre de notifications (bell dropdown)
 * - Score de risque par projet (algorithme)
 * - Vue Gantt timeline
 */

// ══════════════════════════════════════════
// 1. MOTEUR D'ALERTES INTELLIGENTES
// ══════════════════════════════════════════
const AlertEngine = {
  SEUILS: { critique: 3, warning: 7, notice: 14 },
  
  compute() {
    const alerts = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    // ── Alertes sur les Work Items ──
    D.workItems.forEach(wi => {
      if (!wi.due || wi.status === 'Terminé') return;
      const due = new Date(wi.due);
      const diff = Math.floor((due - now) / 86400000);
      const assign = D.members.find(m => m.id === wi.assignee);
      const proj = D.projects.find(p => p.id === wi.project);
      
      if (diff < 0) {
        alerts.push({
          id: `wi-${wi.id}`,
          level: 'critical',
          icon: '🔴',
          title: `Retard : ${wi.title.substring(0, 40)}`,
          desc: `En retard de ${Math.abs(diff)} jour${Math.abs(diff) > 1 ? 's' : ''} · ${assign?.name || 'Non assigné'} · ${proj?.name || ''}`,
          time: `Échéance dépassée le ${fd(wi.due)}`,
          daysLate: Math.abs(diff),
          ref: wi,
          type: 'workitem',
        });
      } else if (diff <= this.SEUILS.critique) {
        alerts.push({
          id: `wi-${wi.id}`,
          level: 'critical',
          icon: '⚠️',
          title: `Urgent : ${wi.title.substring(0, 40)}`,
          desc: `Échéance dans ${diff} jour${diff > 1 ? 's' : ''} · ${assign?.name || 'Non assigné'}`,
          time: `Deadline : ${fd(wi.due)}`,
          daysLeft: diff,
          ref: wi,
          type: 'workitem',
        });
      } else if (diff <= this.SEUILS.warning) {
        alerts.push({
          id: `wi-${wi.id}`,
          level: 'warning',
          icon: '🟠',
          title: `À surveiller : ${wi.title.substring(0, 40)}`,
          desc: `Échéance dans ${diff} jours · Priorité ${wi.priority}`,
          time: `Deadline : ${fd(wi.due)}`,
          daysLeft: diff,
          ref: wi,
          type: 'workitem',
        });
      }
    });
    
    // ── Alertes sur les Projets ──
    D.projects.forEach(p => {
      if (!p.deadline || p.status === 'Terminé') return;
      const due = new Date(p.deadline);
      const diff = Math.floor((due - now) / 86400000);
      
      if (diff < 0) {
        alerts.push({
          id: `proj-${p.id}`,
          level: 'critical',
          icon: '🚨',
          title: `Projet en retard : ${p.name}`,
          desc: `Deadline dépassée de ${Math.abs(diff)} jours · Avancement : ${p.progress || 0}%`,
          time: `Était prévu le ${fd(p.deadline)}`,
          ref: p,
          type: 'project',
        });
      } else if (diff <= 14) {
        const risk = this.riskScore(p);
        if (risk.score >= 60) {
          alerts.push({
            id: `proj-${p.id}`,
            level: risk.score >= 80 ? 'critical' : 'warning',
            icon: risk.score >= 80 ? '🚨' : '⚠️',
            title: `Risque élevé : ${p.name}`,
            desc: `Score de risque ${risk.score}/100 · ${diff} jours restants · ${p.progress || 0}% complété`,
            time: `Deadline : ${fd(p.deadline)}`,
            ref: p,
            type: 'project',
            risk,
          });
        }
      }
      
      if (p.status === 'Bloqué') {
        alerts.push({
          id: `proj-block-${p.id}`,
          level: 'warning',
          icon: '🔒',
          title: `Projet bloqué : ${p.name}`,
          desc: `Ce projet est en statut "Bloqué" et nécessite une action`,
          time: 'Action requise',
          ref: p,
          type: 'project',
        });
      }
    });
    
    // ── Alertes sur les Appels d'offres ──
    D.tenders.forEach(t => {
      if (!t.deadline || ['Gagné', 'Perdu'].includes(t.status)) return;
      const due = new Date(t.deadline);
      const diff = Math.floor((due - now) / 86400000);
      
      if (diff < 0) {
        alerts.push({
          id: `ao-${t.id}`,
          level: 'critical',
          icon: '📋',
          title: `AO expiré : ${t.org}`,
          desc: `"${t.title.substring(0, 35)}" — deadline dépassée`,
          time: fd(t.deadline),
          ref: t,
          type: 'tender',
        });
      } else if (diff <= this.SEUILS.critique) {
        alerts.push({
          id: `ao-${t.id}`,
          level: 'critical',
          icon: '📋',
          title: `AO urgent : ${t.org}`,
          desc: `Soumission dans ${diff} jour${diff > 1 ? 's' : ''} · Statut : ${t.status}`,
          time: `Deadline : ${fd(t.deadline)}`,
          ref: t,
          type: 'tender',
        });
      } else if (diff <= this.SEUILS.warning) {
        alerts.push({
          id: `ao-${t.id}`,
          level: 'warning',
          icon: '📄',
          title: `AO à préparer : ${t.org}`,
          desc: `"${t.title.substring(0, 35)}" — ${diff} jours restants`,
          time: `Deadline : ${fd(t.deadline)}`,
          ref: t,
          type: 'tender',
        });
      }
    });
    
    // ── Alertes sur les Sprints ──
    D.sprints.forEach(s => {
      if (s.status !== 'En cours') return;
      const end = new Date(s.end);
      const diff = Math.floor((end - now) / 86400000);
      const pct = s.pts_total ? Math.round(s.pts_done / s.pts_total * 100) : 0;
      
      if (diff <= 2 && pct < 70) {
        alerts.push({
          id: `sprint-${s.id}`,
          level: 'critical',
          icon: '⚡',
          title: `Sprint en danger : ${s.name}`,
          desc: `Fin dans ${diff} jour${diff > 1 ? 's' : ''} · Seulement ${pct}% complété`,
          time: `Fin : ${fd(s.end)}`,
          ref: s,
          type: 'sprint',
        });
      } else if (diff <= 5 && pct < 50) {
        alerts.push({
          id: `sprint-${s.id}`,
          level: 'warning',
          icon: '⚡',
          title: `Sprint lent : ${s.name}`,
          desc: `${diff} jours restants · ${pct}% complété sur ${s.pts_total} pts`,
          time: `Fin : ${fd(s.end)}`,
          ref: s,
          type: 'sprint',
        });
      }
    });
    
    const order = { critical: 0, warning: 1, info: 2, success: 3 };
    return alerts.sort((a, b) => (order[a.level] || 2) - (order[b.level] || 2));
  },
  
  riskScore(project) {
    let score = 0;
    const factors = [];
    const now = new Date();
    
    if (project.deadline && project.created_at) {
      const start = new Date(project.created_at);
      const end = new Date(project.deadline);
      const total = end - start;
      const elapsed = now - start;
      const timePct = Math.min(100, Math.round(elapsed / total * 100));
      const progPct = project.progress || 0;
      const delta = timePct - progPct;
      
      if (delta > 40) { 
        score += 40; 
        factors.push({ label: 'Retard critique', cls: 'rf-red' }); 
      } else if (delta > 20) { 
        score += 25; 
        factors.push({ label: 'Retard modéré', cls: 'rf-orange' }); 
      } else if (delta > 0) { 
        score += 10; 
        factors.push({ label: 'Légèrement en retard', cls: 'rf-orange' }); 
      } else { 
        factors.push({ label: 'Dans les temps', cls: 'rf-green' }); 
      }
    }
    
    if (project.deadline) {
      const daysLeft = Math.floor((new Date(project.deadline) - now) / 86400000);
      if (daysLeft < 0) { 
        score += 30; 
        factors.push({ label: `J+${Math.abs(daysLeft)}`, cls: 'rf-red' }); 
      } else if (daysLeft <= 3) { 
        score += 28; 
        factors.push({ label: `${daysLeft}j restants`, cls: 'rf-red' }); 
      } else if (daysLeft <= 7) { 
        score += 20; 
        factors.push({ label: `${daysLeft}j restants`, cls: 'rf-orange' }); 
      } else if (daysLeft <= 14) { 
        score += 10; 
        factors.push({ label: `${daysLeft}j restants`, cls: 'rf-orange' }); 
      }
    }
    
    const openBugs = D.workItems.filter(w => 
      w.project === project.id && w.type === 'bug' && w.status !== 'Terminé'
    ).length;
    
    if (openBugs >= 3) { 
      score += 15; 
      factors.push({ label: `${openBugs} bugs`, cls: 'rf-red' }); 
    } else if (openBugs > 0) { 
      score += 7; 
      factors.push({ label: `${openBugs} bug${openBugs > 1 ? 's' : ''}`, cls: 'rf-orange' }); 
    }
    
    if (project.status === 'Bloqué') { 
      score += 10; 
      factors.push({ label: 'Bloqué', cls: 'rf-red' }); 
    }
    if (project.status === 'En attente') { 
      score += 5; 
      factors.push({ label: 'En attente', cls: 'rf-orange' }); 
    }
    
    const highPrio = D.workItems.filter(w => 
      w.project === project.id && w.priority === 'Haute' && w.status === 'Backlog'
    ).length;
    
    if (highPrio > 0) { 
      score += 5; 
      factors.push({ label: `${highPrio} items haute prio`, cls: 'rf-orange' }); 
    }
    
    score = Math.min(100, score);
    
    let level, color;
    if (score >= 70) { 
      level = 'critical'; 
      color = 'var(--red)'; 
    } else if (score >= 40) { 
      level = 'warning'; 
      color = 'var(--orange)'; 
    } else { 
      level = 'good'; 
      color = 'var(--green)'; 
    }
    
    return { score, level, color, factors };
  },
};

// ══════════════════════════════════════════
// 2. NOTIFICATION BELL
// ══════════════════════════════════════════
let _alerts = [];

function initNotifBell() {
  _alerts = AlertEngine.compute();
  
  const critical = _alerts.filter(a => a.level === 'critical').length;
  const total = _alerts.length;
  
  const badge = document.getElementById('notif-badge');
  const dot = document.getElementById('notif-dot');
  
  if (badge) {
    badge.textContent = total > 99 ? '99+' : total;
    badge.style.display = total > 0 ? 'block' : 'none';
  }
  if (dot) {
    dot.style.display = critical > 0 ? 'block' : 'none';
  }
  
  renderNotifPanel();
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (panel) panel.classList.toggle('open');
}

document.addEventListener('click', e => {
  const wrapper = document.getElementById('notif-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    document.getElementById('notif-panel')?.classList.remove('open');
  }
});

function renderNotifPanel() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  
  if (!_alerts.length) {
    list.innerHTML = '<div class="notif-empty">✅ Aucune alerte · Tout est à jour !</div>';
    return;
  }
  
  list.innerHTML = _alerts.slice(0, 12).map(a => 
    `<div class="notif-item unread" onclick="handleAlertClick('${a.id}')">` +
    `<div class="notif-icon ${a.level}">${a.icon}</div>` +
    `<div class="notif-body">` +
    `<div class="notif-body-title">${a.title}</div>` +
    `<div class="notif-body-desc">${a.desc}</div>` +
    `<div class="notif-body-time">${a.time}</div>` +
    `</div></div>`
  ).join('');
}

function clearAllAlerts() {
  _alerts = [];
  renderNotifPanel();
  const badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = 'none';
  toast('Alertes effacées', 'info', '✅');
  document.getElementById('notif-panel')?.classList.remove('open');
}

function handleAlertClick(id) {
  document.getElementById('notif-panel')?.classList.remove('open');
  nav('calendar', document.querySelector('[data-page=calendar]'));
  setTimeout(() => {
    const el = document.querySelector(`.alert-item[data-id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 200);
}

// ══════════════════════════════════════════
// 3. PAGE CALENDRIER & ALERTES
// ══════════════════════════════════════════
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calView = 'month';

function renderCalendar() {
  _alerts = AlertEngine.compute();
  initNotifBell();
  
  const container = document.getElementById('page-calendar');
  if (!container) return;
  
  container.innerHTML = `
    <div class="cal-header">
      <div class="cal-nav">
        <button class="cal-nav-btn" onclick="calPrev()">‹</button>
        <div id="cal-month-lbl" class="cal-month">${getMonthLabel()}</div>
        <button class="cal-nav-btn" onclick="calNext()">›</button>
        <button class="cal-today-btn" onclick="calGoToday()">Aujourd'hui</button>
      </div>
      <div class="cal-view-tabs">
        <button class="cal-view-tab active" onclick="setCalView('month')">📅 Mois</button>
        <button class="cal-view-tab" onclick="setCalView('gantt')">📊 Gantt</button>
        <button class="cal-view-tab" onclick="setCalView('risk')">🧠 Risques</button>
      </div>
    </div>
    
    <div class="cal-layout">
      <div id="cal-main">${renderCalView()}</div>
      <div id="cal-alerts">${renderAlertsPanel()}</div>
    </div>
    
    <div id="evt-modal" class="evt-modal-overlay" onclick="closeEvtModal(event)">
      <div class="evt-modal">
        <div id="evt-modal-content"></div>
      </div>
    </div>
  `;
}

function setCalView(view) {
  calView = view;
  document.getElementById('cal-main').innerHTML = renderCalView();
  
  document.querySelectorAll('.cal-view-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.includes(
      view === 'month' ? 'Mois' : view === 'gantt' ? 'Gantt' : 'Risques'
    ));
  });
}

function renderCalView() {
  if (calView === 'gantt') return renderGantt();
  if (calView === 'risk') return renderRiskMatrix();
  return renderMonthGrid();
}

function renderMonthGrid() {
  const events = buildCalendarEvents();
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const today = new Date(); 
  today.setHours(0, 0, 0, 0);
  
  let html = '<div class="cal-grid">';
  
  ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach(d => {
    html += `<div class="cal-day-name">${d}</div>`;
  });
  
  for (let i = 0; i < startDow; i++) {
    const d = new Date(calYear, calMonth, -startDow + i + 1);
    html += renderDay(d, events, false);
  }
  
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(calYear, calMonth, d);
    const isToday = date.getTime() === today.getTime();
    html += renderDay(date, events, true, isToday);
  }
  
  const totalCells = startDow + lastDay.getDate();
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(calYear, calMonth + 1, i);
    html += renderDay(d, events, false);
  }
  
  html += '</div>';
  return html;
}

function renderDay(date, events, inMonth, isToday = false) {
  const key = date.toISOString().split('T')[0];
  const dayEvt = events[key] || [];
  const max = 3;
  const shown = dayEvt.slice(0, max);
  const more = dayEvt.length - max;
  
  return `<div class="cal-day${!inMonth ? ' other-month' : ''}${isToday ? ' today' : ''}" onclick="showDayEvents('${key}')">` +
    `<div class="cal-day-num">${date.getDate()}</div>` +
    `<div class="cal-events">${shown.map(e => `<div class="cal-evt ${e.cls}">${e.label}</div>`).join('')}` +
    `${more > 0 ? `<div class="cal-more">+${more} autres</div>` : ''}</div>` +
    `</div>`;
}

function buildCalendarEvents() {
  const events = {};
  const addEvt = (dateStr, evt) => {
    if (!dateStr) return;
    const key = dateStr.split('T')[0];
    if (!events[key]) events[key] = [];
    events[key].push(evt);
  };
  
  D.projects.forEach(p => {
    if (p.deadline && p.status !== 'Terminé') {
      const now = new Date(); 
      now.setHours(0, 0, 0, 0);
      const due = new Date(p.deadline);
      const diff = Math.floor((due - now) / 86400000);
      addEvt(p.deadline, {
        id: `proj-${p.id}`,
        label: `📁 ${p.name.substring(0, 18)}`,
        cls: diff < 0 ? 'critical' : diff <= 7 ? 'warning' : 'project',
        ref: p,
        type: 'project',
      });
    }
  });
  
  D.workItems.forEach(w => {
    if (w.due && w.status !== 'Terminé') {
      const now = new Date(); 
      now.setHours(0, 0, 0, 0);
      const due = new Date(w.due);
      const diff = Math.floor((due - now) / 86400000);
      addEvt(w.due, {
        id: `wi-${w.id}`,
        label: `${w.type === 'bug' ? '🐛' : '✅'} ${w.title.substring(0, 16)}`,
        cls: diff < 0 ? 'critical' : diff <= 3 ? 'critical' : diff <= 7 ? 'warning' : 'task',
        ref: w,
        type: 'workitem',
      });
    }
  });
  
  D.tenders.forEach(t => {
    if (t.deadline && !['Gagné', 'Perdu'].includes(t.status)) {
      const now = new Date(); 
      now.setHours(0, 0, 0, 0);
      const due = new Date(t.deadline);
      const diff = Math.floor((due - now) / 86400000);
      addEvt(t.deadline, {
        id: `ao-${t.id}`,
        label: `📄 ${t.org.substring(0, 16)}`,
        cls: diff < 0 ? 'critical' : diff <= 7 ? 'warning' : 'ao',
        ref: t,
        type: 'tender',
      });
    }
  });
  
  D.sprints.forEach(s => {
    if (s.end && s.status !== 'Terminé') {
      addEvt(s.end, {
        id: `sprint-${s.id}`,
        label: `⚡ ${s.name.substring(0, 16)}`,
        cls: 'sprint',
        ref: s,
        type: 'sprint',
      });
    }
    if (s.start && s.status === 'Planifié') {
      addEvt(s.start, {
        id: `sprint-start-${s.id}`,
        label: `🚀 ${s.name.substring(0, 16)}`,
        cls: 'sprint',
        ref: s,
        type: 'sprint',
      });
    }
  });
  
  return events;
}

function renderGantt() {
  const now = new Date(); 
  now.setHours(0, 0, 0, 0);
  const items = D.projects.filter(p => p.deadline);
  
  if (!items.length) return '<div class="empty">📊 Aucun projet avec deadline</div>';
  
  const rangeStart = new Date(now); 
  rangeStart.setDate(1); 
  rangeStart.setMonth(rangeStart.getMonth() - 1);
  const rangeEnd = new Date(rangeStart); 
  rangeEnd.setMonth(rangeEnd.getMonth() + 4);
  const totalDays = Math.floor((rangeEnd - rangeStart) / 86400000);
  
  const pct = (date) => {
    const d = new Date(date); 
    d.setHours(0, 0, 0, 0);
    return Math.max(0, Math.min(100, (d - rangeStart) / (rangeEnd - rangeStart) * 100));
  };
  
  const todayPct = pct(now);
  
  const months = [];
  let cur = new Date(rangeStart);
  while (cur < rangeEnd) {
    months.push({ 
      label: cur.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), 
      pct: pct(cur) 
    });
    cur = new Date(cur); 
    cur.setMonth(cur.getMonth() + 1);
  }
  
  const ganttColors = {
    'En cours': 'var(--primary)',
    'Planifié': 'var(--blue)',
    'En attente': 'var(--orange)',
    'Bloqué': 'var(--red)',
    'Terminé': 'var(--text3)'
  };
  
  let html = `<div class="gantt-wrap"><div class="gantt-table">` +
    `<div class="gantt-header"><div></div><div style="position:relative;height:20px">${months.map(m => 
      `<div style="position:absolute;left:${m.pct}%;font-size:9px;font-weight:700;color:var(--text3);font-family:var(--mono)">${m.label}</div>`
    ).join('')}</div></div>`;
  
  items.forEach(p => {
    const startPct = p.created_at ? pct(p.created_at) : 0;
    const endPct = pct(p.deadline);
    const widthPct = Math.max(1, endPct - startPct);
    const color = ganttColors[p.status] || 'var(--blue)';
    const risk = AlertEngine.riskScore(p);
    
    html += `<div class="gantt-row" title="${p.name}">` +
      `<div class="gantt-label">` +
      `<div style="font-size:12px;font-weight:600">${p.name.substring(0, 22)}</div>` +
      `<div style="font-size:10px;color:var(--text3)">${p.progress || 0}% · ${p.status}</div>` +
      `</div>` +
      `<div class="gantt-track">` +
      `<div class="gantt-today-line" style="left:${todayPct}%"></div>` +
      `<div class="gantt-bar" style="left:${startPct}%;width:${widthPct}%;background:rgba(255,255,255,.06);color:transparent">.</div>` +
      `<div class="gantt-bar" style="left:${startPct}%;width:${Math.max(0.5, widthPct * (p.progress || 0) / 100)}%;background:${color};color:#000;font-size:9px">${(p.progress || 0) > 15 ? p.name.substring(0, 14) : ''}</div>` +
      `<div style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:9px;font-family:var(--mono);color:${risk.color}">${risk.score}%</div>` +
      `</div></div>`;
  });
  
  html += '</div></div>';
  return html;
}

function renderRiskMatrix() {
  const projects = D.projects.filter(p => p.status !== 'Terminé');
  if (!projects.length) return '<div class="empty">🧠 Aucun projet actif</div>';
  
  const scored = projects
    .map(p => ({ ...p, _risk: AlertEngine.riskScore(p) }))
    .sort((a, b) => b._risk.score - a._risk.score);
  
  const high = scored.filter(p => p._risk.score >= 70);
  const medium = scored.filter(p => p._risk.score >= 40 && p._risk.score < 70);
  const low = scored.filter(p => p._risk.score < 40);
  
  const renderGroup = (items, label, color) => {
    if (!items.length) return '';
    return `<div style="margin-bottom:20px">` +
      `<div style="font-size:10px;font-weight:700;color:${color};letter-spacing:2px;text-transform:uppercase;font-family:var(--mono);margin-bottom:10px">${label}</div>` +
      `${items.map(renderRiskCard).join('')}</div>`;
  };
  
  const avgScore = scored.length ? Math.round(scored.reduce((a, p) => a + p._risk.score, 0) / scored.length) : 0;
  
  return `<div style="margin-bottom:16px;padding:14px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius)">` +
    `<div style="font-size:11px;color:var(--text3);margin-bottom:10px;font-family:var(--mono);letter-spacing:1px;text-transform:uppercase">Score de risque moyen</div>` +
    `<div style="display:flex;gap:24px">` +
    `<div><div style="font-size:28px;font-weight:700;font-family:var(--mono);color:var(--primary-light)">${avgScore}</div><div style="font-size:10px;color:var(--text3)">Score /100</div></div>` +
    `<div><div style="font-size:28px;font-weight:700;font-family:var(--mono);color:var(--red)">${high.length}</div><div style="font-size:10px;color:var(--text3)">Risque élevé</div></div>` +
    `<div><div style="font-size:28px;font-weight:700;font-family:var(--mono);color:var(--orange)">${medium.length}</div><div style="font-size:10px;color:var(--text3)">Risque moyen</div></div>` +
    `<div><div style="font-size:28px;font-weight:700;font-family:var(--mono);color:var(--green)">${low.length}</div><div style="font-size:10px;color:var(--text3)">Risque faible</div></div>` +
    `</div></div>` +
    `${renderGroup(high, '🔴 Risque élevé', 'var(--red)')}` +
    `${renderGroup(medium, '🟠 Risque moyen', 'var(--orange)')}` +
    `${renderGroup(low, '🟢 Risque faible', 'var(--green)')}`;
}

function renderRiskCard(p) {
  const r = p._risk;
  const r2 = 22, cx = 27, cy = 27;
  const circ = 2 * Math.PI * r2;
  const dash = circ * r.score / 100;
  
  return `<div class="risk-card" onclick="openProjModal(${p.id})">` +
    `<div class="risk-score-ring">` +
    `<svg width="54" height="54" viewBox="0 0 54 54">` +
    `<circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="var(--border)" stroke-width="4"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="${r.color}" stroke-width="4" stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>` +
    `</svg>` +
    `<div class="risk-score-val" style="color:${r.color}">${r.score}</div>` +
    `</div>` +
    `<div class="risk-info">` +
    `<div class="risk-name">${p.name}</div>` +
    `<div class="risk-detail">${p.status} · ${p.progress || 0}% · ${p.deadline ? fd(p.deadline) : 'Pas de deadline'}</div>` +
    `<div class="risk-factors">${r.factors.map(f => `<span class="risk-factor ${f.cls}">${f.label}</span>`).join('')}</div>` +
    `</div></div>`;
}

function renderAlertsPanel() {
  const critical = _alerts.filter(a => a.level === 'critical');
  const warning = _alerts.filter(a => a.level === 'warning');
  const all = [...critical, ...warning].slice(0, 15);
  
  return `<div class="alerts-panel">` +
    `<div class="alerts-panel-head">` +
    `<div class="alerts-panel-title">🔔 Alertes actives</div>` +
    `<span style="font-family:var(--mono);font-size:11px;color:var(--text3)">${all.length} alertes</span>` +
    `</div>` +
    `${all.length ? all.map(a => 
      `<div class="alert-item" data-id="${a.id}" onclick="handleAlertClick('${a.id}')">` +
      `<div class="alert-dot ${a.level}"></div>` +
      `<div class="alert-content">` +
      `<div class="alert-title">${a.title}</div>` +
      `<div class="alert-desc">${a.desc}</div>` +
      `<div class="alert-time">${a.time}</div>` +
      `</div></div>`
    ).join('') : '<div class="notif-empty">✅ Aucune alerte active</div>'}` +
    `</div>`;
}

function calPrev() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  document.getElementById('cal-month-lbl').textContent = getMonthLabel();
  document.getElementById('cal-main').innerHTML = renderCalView();
}

function calNext() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  document.getElementById('cal-month-lbl').textContent = getMonthLabel();
  document.getElementById('cal-main').innerHTML = renderCalView();
}

function calGoToday() {
  calYear = new Date().getFullYear();
  calMonth = new Date().getMonth();
  document.getElementById('cal-month-lbl').textContent = getMonthLabel();
  document.getElementById('cal-main').innerHTML = renderCalView();
}

function getMonthLabel() {
  return new Date(calYear, calMonth, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function showDayEvents(dateStr) {
  const events = buildCalendarEvents()[dateStr] || [];
  if (!events.length) return;
  
  const date = new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  
  showEvtModal(
    `<div style="font-size:16px;font-weight:700;margin-bottom:16px">📅 ${date}</div>` +
    `${events.map(e => 
      `<div style="padding:10px;margin-bottom:8px;background:var(--card);border-radius:8px;border-left:3px solid var(--${e.cls === 'critical' ? 'red' : e.cls === 'warning' ? 'orange' : 'primary'})">` +
      `<div style="font-size:12px;font-weight:600">${e.label}</div>` +
      `<div style="font-size:10px;color:var(--text3)">${e.type}</div>` +
      `</div>`
    ).join('')}` +
    `<button class="btn btn-outline btn-sm" style="width:100%;justify-content:center;margin-top:8px" onclick="closeEvtModal()">Fermer</button>`
  );
}

function showEvtModal(html) {
  document.getElementById('evt-modal-content').innerHTML = html;
  document.getElementById('evt-modal')?.classList.add('open');
}

function closeEvtModal(e) {
  if (!e || e.target === document.getElementById('evt-modal')) {
    document.getElementById('evt-modal')?.classList.remove('open');
  }
}

// ══════════════════════════════════════════
// 4. INTÉGRATION DANS loadAll()
// ══════════════════════════════════════════
const _origLoadAll = typeof loadAll !== 'undefined' ? loadAll : null;

async function loadAllWithAlerts() {
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
    
    D.projects = pr?.results || pr || [];
    D.members = mb?.results || mb || [];
    D.workItems = wi?.results || wi || [];
    D.tenders = tn?.results || tn || [];
    D.sprints = sp?.results || sp || [];
    dashStats = ds || null;
    
    console.log('✅ Données chargées:', {
      projets: D.projects.length,
      membres: D.members.length,
      workItems: D.workItems.length
    });
    
    renderSidebar();
    renderPage(currentPage);
    updateChips();
    initNotifBell();
    
  } catch(e) { 
    console.error('❌ Erreur:', e);
    toast('Erreur de chargement', 'error', '⚠'); 
  } finally {
    const loading = document.getElementById('app-loading');
    if (loading) {
      loading.classList.remove('active');
      console.log('👁️ Loading masqué');
    }
  }
}

if (_origLoadAll) {
  loadAll = loadAllWithAlerts;
}

setInterval(() => {
  initNotifBell();
  if (currentPage === 'calendar') renderCalendar();
}, 5 * 60 * 1000);