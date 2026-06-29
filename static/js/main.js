/**
 * ═══════════════════════════════════════════════════════════════════
 * KICEKO ProjectHub — main.js
 * Implémentation complète de toutes les fonctionnalités
 * Render, CRUD, Modals, AlertEngine, Notifications
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

// ══════════════════════════════════════════════════════
// MODALS helpers
// ══════════════════════════════════════════════════════
window.om = function(id) { document.getElementById(id)?.classList.add('open'); };
window.cm = function(id) { document.getElementById(id)?.classList.remove('open'); };

// ══════════════════════════════════════════════════════
// NOTIFICATION BELL — injecte dans #notif-anchor
// ══════════════════════════════════════════════════════
(function initNotifBell() {
    const anchor = document.getElementById('notif-anchor');
    if (!anchor || document.getElementById('notif-wrapper')) return;
    anchor.innerHTML = `
    <div id="notif-wrapper" class="notif-wrapper">
        <button id="notif-btn-unique" class="notif-btn"
                onclick="toggleNotifPanel()" aria-label="Notifications" aria-expanded="false">
            🔔
            <span id="notif-dot" class="notif-dot" style="display:none"></span>
            <span id="notif-badge" class="notif-badge" style="display:none">0</span>
        </button>
        <div id="notif-panel" class="notif-panel" role="dialog" aria-label="Panneau de notifications">
            <div class="notif-panel-head">
                <span class="notif-panel-title">🔔 Notifications</span>
                <button class="notif-panel-clear" onclick="clearAllAlerts()">Effacer tout</button>
            </div>
            <div id="notif-list" class="notif-list">
                <div class="notif-empty">✅ Aucune alerte</div>
            </div>
        </div>
    </div>`;

    // Close on outside click
    document.addEventListener('click', function(e) {
        const w = document.getElementById('notif-wrapper');
        if (w && !w.contains(e.target)) {
            document.getElementById('notif-panel')?.classList.remove('open');
            document.getElementById('notif-btn-unique')?.setAttribute('aria-expanded','false');
        }
    });
})();

// ══════════════════════════════════════════════════════
// ALERT ENGINE
// ══════════════════════════════════════════════════════
window.AlertEngine = {
    compute() {
        const D_ref = window.D || {};
        const now = new Date();
        const alerts = [];

        (D_ref.projects || []).forEach(p => {
            if (!p.deadline || p.status === 'Terminé') return;
            const diff = Math.floor((new Date(p.deadline) - now) / 86400000);
            if (diff < 0) alerts.push({ level:'critical', icon:'🚨', title: p.name, desc:`Dépassée de ${Math.abs(diff)}j`, time: fd(p.deadline) });
            else if (diff <= 3) alerts.push({ level:'critical', icon:'⏰', title: p.name, desc:`${diff}j restants — URGENT`, time: fd(p.deadline) });
            else if (diff <= 7) alerts.push({ level:'warning', icon:'⚠️', title: p.name, desc:`${diff}j restants`, time: fd(p.deadline) });
        });

        const bugs = (D_ref.workItems || []).filter(w => w.type === 'bug' && w.status !== 'Terminé').length;
        if (bugs >= 2) alerts.push({ level:'warning', icon:'🐛', title:`${bugs} bugs ouverts`, desc:'Dette technique', time:'' });

        const noLead = (D_ref.tenders || []).filter(t => !t.lead && !['Gagné','Perdu'].includes(t.status));
        if (noLead.length) alerts.push({ level:'info', icon:'📋', title:`${noLead.length} AO sans responsable`, desc:'Assigner un référent', time:'' });

        return alerts;
    },

    riskScore(project) {
        let score = 0;
        const now = new Date();
        if (project.deadline) {
            const diff = Math.floor((new Date(project.deadline) - now) / 86400000);
            if (diff < 0) score += 40;
            else if (diff <= 7) score += 30;
            else if (diff <= 14) score += 15;
        }
        if ((project.progress || 0) < 30) score += 20;
        else if ((project.progress || 0) < 60) score += 10;
        if (project.status === 'Bloqué') score += 30;
        if (project.status === 'En attente') score += 15;
        const wi = (window.D?.workItems || []).filter(w => w.project === project.id);
        score += wi.filter(w => w.type === 'bug' && w.status !== 'Terminé').length * 5;
        score = Math.min(100, score);
        const color = score >= 70 ? 'var(--red)' : score >= 40 ? 'var(--orange)' : 'var(--green)';
        return { score, color, factors: [] };
    }
};

// ══════════════════════════════════════════════════════
// CONTEXT-AWARE "NOUVEAU" BUTTON
// ══════════════════════════════════════════════════════
window.openAdd = function() {
    const page = window.currentPage || 'dashboard';
    if (page === 'projects') openProjModal();
    else if (page === 'board' || page === 'backlog') openWIModal();
    else if (page === 'tenders') openAOModal();
    else if (page === 'team') om('modal-member');
    else openProjModal();
};

// ══════════════════════════════════════════════════════
// RENDER DASHBOARD
// ══════════════════════════════════════════════════════
window.renderDashboard = function() {
    const D_ref = window.D || {};
    const projects  = D_ref.projects  || [];
    const workItems = D_ref.workItems || [];
    const tenders   = D_ref.tenders   || [];
    const sprints   = D_ref.sprints   || [];

    const active  = workItems.filter(w => w.status === 'En cours').length;
    const activePr= projects.filter(p => p.status === 'En cours').length;
    const done    = workItems.filter(w => w.status === 'Terminé').length;
    const pipeline= tenders.filter(t => !['Gagné','Perdu'].includes(t.status)).length;

    animCount(document.getElementById('s1'), active);
    animCount(document.getElementById('s2'), activePr);
    animCount(document.getElementById('s3'), done);
    animCount(document.getElementById('s4'), pipeline);

    // Recent projects
    const dProj = document.getElementById('d-projects');
    if (dProj) {
        const recent = [...projects].sort((a,b) => new Date(b.updated_at||0) - new Date(a.updated_at||0)).slice(0,5);
        dProj.innerHTML = recent.length
            ? recent.map(p => `
                <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer"
                     onclick="openProjModal(${p.id})">
                    <div style="width:8px;height:8px;border-radius:50%;background:${window.STATUS_COLORS?.[p.status]||'#64748b'};flex-shrink:0"></div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
                        <div style="font-size:10px;color:var(--text3)">${p.category||''} · ${fd(p.deadline)}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                        <span style="font-size:11px;font-family:var(--mono);color:var(--accent)">${p.progress||0}%</span>
                    </div>
                </div>`).join('')
            : '<div class="empty" style="padding:20px 0"><div class="empty-icon">📁</div><div class="empty-text">Aucun projet</div></div>';
    }

    // Activity
    const dAct = document.getElementById('d-activity');
    if (dAct) {
        const recentWI = [...workItems].sort((a,b) => new Date(b.updated_at||0)-new Date(a.updated_at||0)).slice(0,6);
        const typeIcons = {epic:'🏔',feature:'⭐',story:'📖',task:'✅',bug:'🐛'};
        dAct.innerHTML = recentWI.length
            ? recentWI.map(w => `
                <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
                    <span style="font-size:14px;margin-top:1px">${typeIcons[w.type]||'📌'}</span>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.title)}</div>
                        <div style="font-size:10px;color:var(--text3);margin-top:2px">${fd(w.updated_at)} · <span style="color:var(--accent)">${w.status}</span></div>
                    </div>
                </div>`).join('')
            : '<div class="empty" style="padding:20px 0"><div class="empty-icon">📋</div><div class="empty-text">Aucune activité</div></div>';
    }

    // WI by status chart
    const dChart = document.getElementById('d-wi-chart');
    if (dChart) {
        const statuses = [
            {s:'Backlog', c:'var(--text3)'},
            {s:'A faire',  c:'var(--blue)'},
            {s:'En cours', c:'var(--green)'},
            {s:'Review',   c:'var(--orange)'},
            {s:'Terminé',  c:'var(--accent)'}
        ];
        const counts = statuses.map(x => ({ ...x, n: workItems.filter(w => w.status === x.s).length }));
        const mx = Math.max(...counts.map(c => c.n), 1);
        dChart.innerHTML = counts.map(({s,c,n}) => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <div style="font-size:11px;color:var(--text2);width:68px;flex-shrink:0">${s}</div>
                <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
                    <div style="width:${n/mx*100}%;height:100%;background:${c};border-radius:4px;transition:width .6s ease"></div>
                </div>
                <div style="font-size:11px;font-family:var(--mono);color:var(--text2);width:24px;text-align:right;font-weight:700">${n}</div>
            </div>`).join('');
    }

    // Active sprint
    const dSprint = document.getElementById('d-sprint');
    if (dSprint) {
        const sp = sprints.find(s => s.status === 'En cours');
        if (sp) {
            const pct = sp.pts_total ? Math.round((sp.pts_done||0)/sp.pts_total*100) : 0;
            dSprint.innerHTML = `
                <div style="font-size:14px;font-weight:700;margin-bottom:4px">${esc(sp.name)}</div>
                <div style="font-size:10px;color:var(--text3);margin-bottom:12px;font-family:var(--mono)">${fd(sp.start)} → ${fd(sp.end)}</div>
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                    <span style="font-size:11px;color:var(--text2)">${sp.pts_done||0} / ${sp.pts_total||0} pts</span>
                    <span style="font-size:11px;font-family:var(--mono);font-weight:700;color:var(--accent)">${pct}%</span>
                </div>
                <div class="progress-wrap" style="height:6px"><div class="progress-bar" style="width:${pct}%"></div></div>
                ${sp.goal ? `<div style="font-size:11px;color:var(--text2);margin-top:10px;padding:8px;background:var(--surface);border-radius:6px">🎯 ${esc(sp.goal)}</div>`:''}`;
        } else {
            dSprint.innerHTML = '<div class="empty" style="padding:20px 0"><div class="empty-icon">⚡</div><div class="empty-text">Aucun sprint actif</div></div>';
        }
    }

    // AO quick pipeline
    const dAO = document.getElementById('d-ao-quick');
    if (dAO) {
        const stages = [
            ['Détection','var(--text3)'],['Qualification','var(--blue)'],
            ['Préparation','var(--orange)'],['Soumis','var(--accent)'],
            ['Gagné','var(--green)'],['Perdu','var(--red)']
        ];
        dAO.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">` +
            stages.map(([s,c]) => {
                const n = tenders.filter(t => t.status === s).length;
                return `<div style="flex:1;min-width:80px;padding:10px;background:var(--surface);border-radius:8px;border-top:3px solid ${c};text-align:center;cursor:pointer"
                     onclick="nav('tenders',document.querySelector('[data-page=tenders]'))">
                    <div style="font-size:18px;font-weight:800;font-family:var(--mono);color:${c}">${n}</div>
                    <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-top:2px">${s}</div>
                </div>`;
            }).join('') + '</div>';
    }

    // Alerts
    setTimeout(() => {
        if (typeof renderDashboardAlerts === 'function') {
            renderDashboardAlerts();
        } else {
            _renderBasicAlerts();
        }
        _updateNotifBell();
    }, 80);
};

function _renderBasicAlerts() {
    const el = document.getElementById('d-alerts-summary');
    if (!el) return;
    const alerts = AlertEngine.compute().slice(0,4);
    const colorMap = {critical:'var(--red)', warning:'var(--orange)', info:'var(--accent)'};
    if (!alerts.length) {
        el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--green);font-size:12px">✅ Tout est sous contrôle</div>';
        return;
    }
    el.innerHTML = alerts.map(a => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:14px">${a.icon}</span>
            <div style="flex:1;font-size:12px"><strong>${esc(a.title)}</strong> — ${a.desc}</div>
            <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${a.time||''}</div>
        </div>`).join('') +
        `<div style="text-align:center;margin-top:10px">
            <button class="btn btn-outline btn-sm" onclick="nav('calendar',document.querySelector('[data-page=calendar]'))">Voir le calendrier →</button>
        </div>`;
}

// ══════════════════════════════════════════════════════
// RENDER PROJECTS
// ══════════════════════════════════════════════════════
window.renderProjects = function() {
    const D_ref = window.D || {};
    const projects  = D_ref.projects || [];
    const filter    = window.projFilter || '';
    const filtered  = filter ? projects.filter(p => p.status === filter) : projects;

    const lbl = document.getElementById('proj-count-lbl');
    if (lbl) lbl.textContent = `${filtered.length} projet${filtered.length!==1?'s':''}`;

    const grid = document.getElementById('proj-grid');
    if (!grid) return;

    if (!filtered.length) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
            <div class="empty-icon">📁</div>
            <div class="empty-text">Aucun projet trouvé</div>
            <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openProjModal()">＋ Créer un projet</button>
        </div>`;
        return;
    }

    grid.innerHTML = filtered.map(p => {
        const color   = window.STATUS_COLORS?.[p.status] || '#64748b';
        const members = p.members_detail || [];
        const daysLeft= p.deadline ? Math.ceil((new Date(p.deadline)-new Date())/86400000) : null;

        return `<div class="proj-card" onclick="openProjModal(${p.id})">
            <div class="left-bar" style="background:${color}"></div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div>
                    <div class="proj-name">${esc(p.name)}</div>
                    <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:2px">${p.category||'Interne'}</div>
                </div>
                <span style="padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;background:${color}22;color:${color};white-space:nowrap">${p.status}</span>
            </div>
            ${p.description ? `<div class="proj-desc">${esc(p.description.substring(0,90))}${p.description.length>90?'…':''}</div>`:''}
            <div class="progress-wrap"><div class="progress-bar" style="width:${p.progress||0}%"></div></div>
            <div class="proj-footer">
                <div class="av-stack">
                    ${members.slice(0,4).map(m => avEl(m,24)).join('')}
                    ${members.length>4 ? `<div class="av" style="width:24px;height:24px;font-size:9px;background:var(--border2);color:var(--text3)">+${members.length-4}</div>`:''}
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                    ${daysLeft!==null ? `<span style="font-size:10px;font-family:var(--mono);color:${daysLeft<0?'var(--red)':daysLeft<=7?'var(--orange)':'var(--text3)'}">${daysLeft<0?Math.abs(daysLeft)+'j dépassé':daysLeft+'j'}</span>`:''}
                    <span style="font-size:11px;font-weight:700;font-family:var(--mono);color:var(--accent)">${p.progress||0}%</span>
                    <button class="btn-del" onclick="event.stopPropagation();deleteProj(${p.id})">✕</button>
                </div>
            </div>
        </div>`;
    }).join('');
};

window.filterProj = function(filter, el) {
    window.projFilter = filter;
    document.querySelectorAll('#proj-filters .filter-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    renderProjects();
};

// ══════════════════════════════════════════════════════
// RENDER KANBAN BOARD
// ══════════════════════════════════════════════════════
window.renderBoard = function() {
    const D_ref   = window.D || {};
    const items   = D_ref.workItems || [];
    const projects= D_ref.projects  || [];

    // Populate project selector
    const sel = document.getElementById('board-proj-sel');
    if (sel) {
        const val = sel.value;
        sel.innerHTML = '<option value="">Tous les projets</option>' +
            projects.map(p => `<option value="${p.id}"${val==p.id?' selected':''}>${esc(p.name)}</option>`).join('');
    }

    const projId    = sel?.value || '';
    const typeFilter= window.boardFilter || '';

    let filtered = items;
    if (projId)     filtered = filtered.filter(w => String(w.project) === String(projId));
    if (typeFilter) filtered = filtered.filter(w => w.type === typeFilter);

    const cols = [
        {id:'Backlog',  label:'Backlog',  color:'var(--text3)',  bg:'rgba(74,122,144,.08)'},
        {id:'A faire',  label:'À faire',  color:'var(--blue)',   bg:'rgba(59,130,246,.08)'},
        {id:'En cours', label:'En cours', color:'var(--green)',  bg:'rgba(34,197,94,.08)'},
        {id:'Review',   label:'Review',   color:'var(--orange)', bg:'rgba(249,115,22,.08)'},
        {id:'Terminé',  label:'Terminé',  color:'var(--accent)', bg:'rgba(14,181,204,.08)'},
    ];

    const board = document.getElementById('kanban-board');
    if (!board) return;

    board.innerHTML = cols.map(col => {
        const colItems = filtered.filter(w => w.status === col.id);
        return `<div class="k-col">
            <div class="k-col-head" style="background:${col.bg}">
                <div style="width:8px;height:8px;border-radius:50%;background:${col.color};flex-shrink:0"></div>
                <div class="k-col-name" style="color:${col.color}">${col.label}</div>
                <span style="font-size:10px;font-family:var(--mono);color:${col.color};padding:1px 7px;background:${col.bg};border-radius:5px;font-weight:700">${colItems.length}</span>
            </div>
            <div ondragover="event.preventDefault()" ondrop="dropWI(event,'${col.id}')">
                ${colItems.map(w => renderKCard(w)).join('')}
                <div onclick="openWIModal()"
                     style="margin-top:4px;height:48px;border:2px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;opacity:.3;font-size:11px;color:var(--text3);cursor:pointer;transition:opacity .13s ease"
                     onmouseenter="this.style.opacity=.7" onmouseleave="this.style.opacity=.3">+ Ajouter</div>
            </div>
        </div>`;
    }).join('');
};

function renderKCard(w) {
    const typeIcons  = {epic:'🏔',feature:'⭐',story:'📖',task:'✅',bug:'🐛'};
    const prioColors = {'Haute':'var(--red)','Moyenne':'var(--orange)','Basse':'var(--green)'};
    const member     = w.assignee_detail;
    return `<div class="k-card" draggable="true"
                 ondragstart="window._dragWIId=${w.id};event.dataTransfer.effectAllowed='move'"
                 onclick="openWIModal(${w.id})">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
            <span style="font-size:12px">${typeIcons[w.type]||'📌'}</span>
            <div style="width:8px;height:8px;border-radius:50%;background:${prioColors[w.priority]||'var(--text3)'};flex-shrink:0;margin-top:2px" title="${w.priority||''}"></div>
        </div>
        <div style="font-size:12.5px;font-weight:600;margin-bottom:8px;line-height:1.4">${esc(w.title)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
            ${member ? avEl(member,22) : '<div style="width:22px"></div>'}
            <div style="display:flex;align-items:center;gap:5px">
                ${w.pts ? `<span style="font-size:9px;font-family:var(--mono);color:var(--text3);padding:1px 5px;background:var(--surface);border-radius:4px">${w.pts}pt</span>`:''}
                ${w.due ? `<span style="font-size:9px;font-family:var(--mono);color:var(--text3)">${fd(w.due)}</span>`:''}
            </div>
        </div>
    </div>`;
}

window._dragWIId = null;
window.dropWI = async function(e, status) {
    e.preventDefault();
    const id = window._dragWIId;
    if (!id) return;
    const wi = (window.D?.workItems||[]).find(w => w.id === id);
    if (!wi || wi.status === status) return;
    const res = await apiFetch(`/api/workitems/${id}/`, {method:'PATCH', body:JSON.stringify({status})});
    if (res?.ok) {
        wi.status = status;
        renderBoard();
        _updateChips();
        toast(`Déplacé vers "${status}"`, 'success', '✅');
    }
};

window.setBoardFilter = function(type, el) {
    window.boardFilter = type;
    document.querySelectorAll('#board-type-filters .filter-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    renderBoard();
};

// ══════════════════════════════════════════════════════
// RENDER BACKLOG
// ══════════════════════════════════════════════════════
window.renderBacklog = function() {
    const D_ref  = window.D || {};
    const items  = D_ref.workItems || [];
    const projs  = D_ref.projects  || [];

    const sel = document.getElementById('bl-proj-sel');
    if (sel) {
        const val = sel.value;
        sel.innerHTML = '<option value="">Tous les projets</option>' +
            projs.map(p => `<option value="${p.id}"${val==p.id?' selected':''}>${esc(p.name)}</option>`).join('');
    }

    const projId = sel?.value || '';
    const prioWeight = {'Haute':3,'Moyenne':2,'Basse':1};
    let filtered = items.filter(w => w.status === 'Backlog' || w.status === 'A faire');
    if (projId) filtered = filtered.filter(w => String(w.project) === String(projId));
    filtered.sort((a,b) => (prioWeight[b.priority]||0) - (prioWeight[a.priority]||0));

    const list = document.getElementById('backlog-list');
    if (!list) return;

    if (!filtered.length) {
        list.innerHTML = `<div class="empty"><div class="empty-icon">≡</div><div class="empty-text">Backlog vide</div>
            <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openWIModal()">＋ Ajouter</button></div>`;
        return;
    }

    const typeIcons = {epic:'🏔',feature:'⭐',story:'📖',task:'✅',bug:'🐛'};
    list.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr>${['Type','Titre','Priorité','Projet','Pts','Actions'].map(h =>
                `<th style="padding:10px 14px;text-align:left;background:var(--surface);color:var(--text3);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:var(--mono);border-bottom:1px solid var(--border);white-space:nowrap">${h}</th>`
            ).join('')}</tr></thead>
            <tbody>${filtered.map(w => {
                const proj = projs.find(p => p.id === w.project);
                return `<tr style="cursor:pointer" onclick="openWIModal(${w.id})"
                             onmouseenter="this.querySelectorAll('td').forEach(td=>td.style.background='rgba(14,181,204,.03)')"
                             onmouseleave="this.querySelectorAll('td').forEach(td=>td.style.background='')">
                    <td style="padding:10px 14px;border-bottom:1px solid var(--border)">${typeIcons[w.type]||'📌'}</td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600">${esc(w.title)}</td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--border)">
                        <span style="padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;background:${{Haute:'var(--redbg)',Moyenne:'var(--orangebg)',Basse:'var(--greenbg)'}[w.priority]||'var(--border)'};color:${{Haute:'var(--red)',Moyenne:'var(--orange)',Basse:'var(--green)'}[w.priority]||'var(--text3)'}">${w.priority||'—'}</span>
                    </td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--border);color:var(--text2)">${proj?esc(proj.name):'—'}</td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--border);font-family:var(--mono);color:var(--text3)">${w.pts||'—'}</td>
                    <td style="padding:10px 14px;border-bottom:1px solid var(--border)">
                        <button class="btn btn-xs" onclick="event.stopPropagation();openWIModal(${w.id})">Modifier</button>
                        <button class="btn-del" onclick="event.stopPropagation();deleteWI(${w.id})" style="margin-left:4px">Suppr.</button>
                    </td>
                </tr>`;
            }).join('')}</tbody>
        </table>
    </div>`;
};

// ══════════════════════════════════════════════════════
// RENDER SPRINTS
// ══════════════════════════════════════════════════════
window.renderSprints = function() {
    const D_ref  = window.D || {};
    const sprints= D_ref.sprints   || [];
    const projs  = D_ref.projects  || [];
    const items  = D_ref.workItems || [];

    const list = document.getElementById('sprints-list');
    if (!list) return;

    if (!sprints.length) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">⚡</div><div class="empty-text">Aucun sprint</div></div>';
        return;
    }

    const stColors = {'En cours':'var(--green)','Planifié':'var(--blue)','Terminé':'var(--text3)'};

    list.innerHTML = sprints.map(sp => {
        const proj     = projs.find(p => p.id === sp.project);
        const spItems  = items.filter(w => w.sprint === sp.id);
        const done     = spItems.filter(w => w.status === 'Terminé').length;
        const pct      = sp.pts_total ? Math.round((sp.pts_done||0)/sp.pts_total*100)
                        : spItems.length ? Math.round(done/spItems.length*100) : 0;

        return `<div class="card" style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                <div>
                    <div style="font-size:14px;font-weight:700">${esc(sp.name)}</div>
                    <div style="font-size:10px;color:var(--text3);margin-top:2px;font-family:var(--mono)">${proj?esc(proj.name):'—'} · ${fd(sp.start)} → ${fd(sp.end)}</div>
                </div>
                <span style="padding:4px 10px;border-radius:20px;font-size:10px;font-weight:700;background:${stColors[sp.status]||'var(--text3)'}22;color:${stColors[sp.status]||'var(--text3)'}">${sp.status}</span>
            </div>
            ${sp.goal?`<div style="font-size:11px;color:var(--text2);margin-bottom:12px;padding:8px 10px;background:var(--surface);border-radius:6px">🎯 ${esc(sp.goal)}</div>`:''}
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:11px;color:var(--text2)">${sp.pts_done||0} / ${sp.pts_total||0} story points</span>
                <span style="font-size:11px;font-family:var(--mono);font-weight:700;color:var(--accent)">${pct}%</span>
            </div>
            <div class="progress-wrap" style="height:6px"><div class="progress-bar" style="width:${pct}%"></div></div>
            ${spItems.length ? `<div style="margin-top:12px;display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
                ${['Backlog','A faire','En cours','Review','Terminé'].map(s => {
                    const n = spItems.filter(w=>w.status===s).length;
                    return `<div style="text-align:center;padding:6px;background:var(--surface);border-radius:6px">
                        <div style="font-size:14px;font-weight:700;font-family:var(--mono)">${n}</div>
                        <div style="font-size:9px;color:var(--text3)">${s}</div>
                    </div>`;
                }).join('')}
            </div>`:''}
        </div>`;
    }).join('');
};

// ══════════════════════════════════════════════════════
// RENDER TENDERS (AO)
// ══════════════════════════════════════════════════════
window.renderTenders = function() {
    const D_ref  = window.D || {};
    const tenders= D_ref.tenders || [];
    const filterV= document.getElementById('ao-filter-sel')?.value || '';
    const items  = filterV ? tenders.filter(t=>t.status===filterV) : tenders;

    // Pipeline stages
    const pipeline = document.getElementById('ao-pipeline');
    if (pipeline) {
        const stages = [
            ['Détection','var(--text3)'],['Qualification','var(--blue)'],
            ['Préparation','var(--orange)'],['Soumis','var(--accent)'],
            ['Gagné','var(--green)'],['Perdu','var(--red)']
        ];
        pipeline.innerHTML = stages.map(([s,c]) => {
            const n     = tenders.filter(t=>t.status===s).length;
            const total = tenders.filter(t=>t.status===s).reduce((a,t)=>a+parseFloat(t.amount||0),0);
            return `<div class="pipe-st${filterV===s?' active':''}"
                         onclick="document.getElementById('ao-filter-sel').value='${s}';renderTenders()">
                <div class="pipe-st-count" style="color:${c}">${n}</div>
                <div class="pipe-st-label">${s}</div>
                ${total>0?`<div style="font-size:9px;color:var(--text3)">${fmt(Math.round(total/1000))}K FCFA</div>`:''}
            </div>`;
        }).join('');
    }

    const tbody = document.getElementById('ao-tbody');
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--text3)">
            <div style="font-size:28px;margin-bottom:8px;opacity:.25">📄</div>Aucun appel d'offres
        </td></tr>`;
        return;
    }

    const aoColors = {Détection:'var(--text3)',Qualification:'var(--blue)',Préparation:'var(--orange)',Soumis:'var(--accent)',Gagné:'var(--green)',Perdu:'var(--red)'};
    const now = new Date();

    tbody.innerHTML = items.map(t => {
        const lead = t.lead_detail;
        const diff = t.deadline ? Math.ceil((new Date(t.deadline)-now)/86400000) : null;
        const col  = aoColors[t.status] || 'var(--text3)';
        return `<tr onmouseenter="this.querySelectorAll('td').forEach(td=>td.style.background='rgba(14,181,204,.03)')"
                    onmouseleave="this.querySelectorAll('td').forEach(td=>td.style.background='')">
            <td style="padding:11px 14px;border-bottom:1px solid var(--border);font-weight:600">${esc(t.org||'—')}</td>
            <td style="padding:11px 14px;border-bottom:1px solid var(--border)">${esc(t.title)}</td>
            <td style="padding:11px 14px;border-bottom:1px solid var(--border);font-family:var(--mono)">${fmt(t.amount||0)}</td>
            <td style="padding:11px 14px;border-bottom:1px solid var(--border)">
                <span style="font-family:var(--mono);font-size:11px;color:${diff!==null&&diff<0?'var(--red)':diff!==null&&diff<=7?'var(--orange)':'var(--text2)'}">${fd(t.deadline)}</span>
            </td>
            <td style="padding:11px 14px;border-bottom:1px solid var(--border)">
                <span style="padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;background:${col}22;color:${col}">${t.status}</span>
            </td>
            <td style="padding:11px 14px;border-bottom:1px solid var(--border)">
                ${lead?`<div style="display:flex;align-items:center;gap:6px">${avEl(lead,20)}<span style="font-size:11px">${esc(lead.name)}</span></div>`:'<span style="color:var(--text3)">—</span>'}
            </td>
            <td style="padding:11px 14px;border-bottom:1px solid var(--border)">
                <button class="btn btn-xs" onclick="openAOModal(${t.id})">Modifier</button>
                <button class="btn-del" onclick="deleteTender(${t.id})" style="margin-left:4px">✕</button>
            </td>
        </tr>`;
    }).join('');
};

// ══════════════════════════════════════════════════════
// RENDER TEAM
// ══════════════════════════════════════════════════════
window.renderTeam = function() {
    const D_ref  = window.D || {};
    const members= D_ref.members   || [];
    const items  = D_ref.workItems || [];
    const projs  = D_ref.projects  || [];

    const grid = document.getElementById('team-grid');
    if (!grid) return;

    if (!members.length) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
            <div class="empty-icon">👥</div><div class="empty-text">Aucun membre</div>
            <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="om('modal-member')">＋ Ajouter</button>
        </div>`;
        return;
    }

    grid.innerHTML = members.map(m => {
        const tasks  = items.filter(w => w.assignee === m.id);
        const active = tasks.filter(w => w.status === 'En cours').length;
        const done   = tasks.filter(w => w.status === 'Terminé').length;
        const mProjs = projs.filter(p => (p.members_detail||[]).some(md=>md.id===m.id) || (p.members||[]).includes(m.id));

        return `<div class="card" style="text-align:center;position:relative">
            <button onclick="deleteMember(${m.id})"
                    style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;opacity:.4;transition:opacity .13s ease"
                    onmouseenter="this.style.opacity=1;this.style.color='var(--red)'"
                    onmouseleave="this.style.opacity=.4;this.style.color='var(--text3)'">✕</button>
            <div style="margin:0 auto 14px;width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;font-family:var(--mono);background:${m.color||'#0eb5cc'};color:#fff;box-shadow:0 4px 16px ${m.color||'#0eb5cc'}44">${esc(m.initials||'?')}</div>
            <div style="font-size:14px;font-weight:700;margin-bottom:3px">${esc(m.name)}</div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:${m.email?'4px':'12px'}">${esc(m.role||'Membre')}</div>
            ${m.email?`<div style="font-size:10px;color:var(--text3);margin-bottom:12px;font-family:var(--mono)">${esc(m.email)}</div>`:''}
            <div class="sep"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px">
                <div><div style="font-size:16px;font-weight:800;font-family:var(--mono)">${tasks.length}</div><div style="font-size:9px;color:var(--text3)">Tickets</div></div>
                <div><div style="font-size:16px;font-weight:800;font-family:var(--mono);color:var(--green)">${active}</div><div style="font-size:9px;color:var(--text3)">Actifs</div></div>
                <div><div style="font-size:16px;font-weight:800;font-family:var(--mono);color:var(--accent)">${mProjs.length}</div><div style="font-size:9px;color:var(--text3)">Projets</div></div>
            </div>
        </div>`;
    }).join('');
};

// ══════════════════════════════════════════════════════
// RENDER ANALYTICS
// ══════════════════════════════════════════════════════
window.renderAnalytics = function() {
    const D_ref  = window.D || {};
    const projs  = D_ref.projects  || [];
    const items  = D_ref.workItems || [];
    const sprints= D_ref.sprints   || [];

    // Project progress
    const anProg = document.getElementById('an-progress');
    if (anProg) {
        anProg.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px">
            ${projs.length ? projs.map(p => `
                <div style="margin-bottom:14px;cursor:pointer" onclick="openProjModal(${p.id})">
                    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                        <span style="font-size:12.5px;font-weight:600">${esc(p.name)}</span>
                        <span style="font-size:11px;font-family:var(--mono);color:var(--accent);font-weight:700">${p.progress||0}%</span>
                    </div>
                    <div class="progress-wrap" style="height:6px"><div class="progress-bar" style="width:${p.progress||0}%"></div></div>
                </div>`).join('')
            : '<div class="empty" style="padding:16px 0">Aucun projet</div>'}
        </div>`;
    }

    // Priority distribution
    const anPrio = document.getElementById('an-prio');
    if (anPrio) {
        const total = items.length || 1;
        [['Haute','var(--red)'],['Moyenne','var(--orange)'],['Basse','var(--green)']].forEach(([p,c]) => {
            const n = items.filter(w => w.priority === p).length;
            anPrio.innerHTML = (anPrio.innerHTML || '') +
                `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                    <div style="font-size:11px;color:var(--text2);width:60px;flex-shrink:0">${p}</div>
                    <div style="flex:1;height:10px;background:var(--border);border-radius:5px;overflow:hidden">
                        <div style="width:${n/total*100}%;height:100%;background:${c};border-radius:5px;transition:width .6s ease"></div>
                    </div>
                    <div style="font-size:11px;font-family:var(--mono);color:var(--text2);width:30px;text-align:right;font-weight:700">${n}</div>
                </div>`;
        });
    }

    // Sprint velocity
    const anVel = document.getElementById('an-velocity');
    if (anVel) {
        anVel.innerHTML = sprints.length
            ? sprints.slice(0,6).map(s => {
                const pct = s.pts_total ? Math.round((s.pts_done||0)/s.pts_total*100) : 0;
                return `<div style="margin-bottom:10px">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                        <span style="font-size:11px;color:var(--text2)">${esc(s.name)}</span>
                        <span style="font-size:10px;font-family:var(--mono);color:var(--text3)">${s.pts_done||0}/${s.pts_total||0} pts</span>
                    </div>
                    <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
                        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--teal-deep),var(--accent));border-radius:4px;transition:width .6s ease"></div>
                    </div>
                </div>`;
            }).join('')
            : '<div class="empty" style="padding:16px 0">Aucun sprint</div>';
    }

    // KPIs
    const anStats = document.getElementById('an-stats');
    if (anStats) {
        const totalWI    = items.length;
        const doneWI     = items.filter(w => w.status === 'Terminé').length;
        const bugRatio   = totalWI ? Math.round(items.filter(w=>w.type==='bug').length/totalWI*100) : 0;
        const avgProgress= projs.length ? Math.round(projs.reduce((a,p)=>a+(p.progress||0),0)/projs.length) : 0;

        anStats.innerHTML = [
            {v:totalWI,    l:'Total tickets',    c:'c-accent', i:'📋'},
            {v:doneWI,     l:'Terminés',          c:'c-green',  i:'✅'},
            {v:`${bugRatio}%`, l:'Taux bugs',     c:'c-orange', i:'🐛'},
            {v:`${avgProgress}%`, l:'Avancement moy.', c:'c-blue', i:'📊'},
        ].map(k => `<div class="stat-card ${k.c}">
            <div class="stat-value">${k.v}</div>
            <div class="stat-label">${k.l}</div>
            <div class="stat-icon">${k.i}</div>
        </div>`).join('');
    }
};

// ══════════════════════════════════════════════════════
// RENDER CALENDAR
// ══════════════════════════════════════════════════════
window.renderCalendar = function() {
    const wrapper = document.getElementById('cal-main-wrapper');
    if (!wrapper) return;

    const D_ref  = window.D || {};
    const projs  = D_ref.projects  || [];
    const items  = D_ref.workItems || [];
    const tenders= D_ref.tenders   || [];
    const now    = new Date();

    const events = [];
    projs.forEach(p => { if (p.deadline) events.push({date:new Date(p.deadline),label:p.name,type:'project',color:window.STATUS_COLORS?.[p.status]||'#64748b',id:p.id}); });
    items.forEach(w => { if (w.due) events.push({date:new Date(w.due),label:w.title,type:'ticket',color:{Haute:'var(--red)',Moyenne:'var(--orange)',Basse:'var(--green)'}[w.priority]||'var(--accent)',id:w.id}); });
    tenders.forEach(t => { if (t.deadline && !['Gagné','Perdu'].includes(t.status)) events.push({date:new Date(t.deadline),label:t.title||t.org,type:'ao',color:'var(--accent)',id:t.id}); });
    events.sort((a,b) => a.date - b.date);

    const crit = events.filter(e => Math.ceil((e.date-now)/86400000) < 0);
    const warn = events.filter(e => { const d=Math.ceil((e.date-now)/86400000); return d>=0&&d<=7; });
    const upcoming = events.filter(e => Math.ceil((e.date-now)/86400000) > 7);

    wrapper.innerHTML = `
    <div style="display:grid;gap:16px">
        ${(crit.length||warn.length) ? `<div class="card" style="border-color:rgba(239,68,68,.2)">
            <div class="section-title" style="color:var(--red)">🚨 Alertes actives</div>
            ${crit.map(e => `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
                <span style="color:var(--red);font-size:14px">🚨</span>
                <div><div style="font-size:12.5px;font-weight:600">${esc(e.label)}</div>
                <div style="font-size:10px;color:var(--red)">Deadline dépassée — ${fd(e.date)}</div></div>
            </div>`).join('')}
            ${warn.map(e => { const d=Math.ceil((e.date-now)/86400000);
                return `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
                    <span style="color:var(--orange);font-size:14px">⚠️</span>
                    <div><div style="font-size:12.5px;font-weight:600">${esc(e.label)}</div>
                    <div style="font-size:10px;color:var(--orange)">${d}j restants — ${fd(e.date)}</div></div>
                </div>`;
            }).join('')}
        </div>` : ''}

        <div class="card">
            <div class="row-space mb-8">
                <div class="section-title" style="margin:0">📅 Timeline des échéances</div>
                <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">${events.length} événements</span>
            </div>
            ${events.length ? events.map(e => {
                const diff = Math.ceil((e.date-now)/86400000);
                const isOverdue = diff < 0;
                const isClose = !isOverdue && diff <= 7;
                const typeLabels = {project:'Projet',ticket:'Ticket',ao:'AO'};
                const labelColor = isOverdue?'var(--red)':isClose?'var(--orange)':'var(--green)';
                const labelBg = isOverdue?'var(--redbg)':isClose?'var(--orangebg)':'var(--greenbg)';
                return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
                    <div style="width:3px;height:40px;background:${e.color};border-radius:2px;flex-shrink:0"></div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.label)}</div>
                        <div style="font-size:10px;color:var(--text3);margin-top:2px">${typeLabels[e.type]||e.type} · ${fd(e.date)}</div>
                    </div>
                    <div style="font-size:10px;font-family:var(--mono);padding:2px 8px;border-radius:6px;background:${labelBg};color:${labelColor};flex-shrink:0">
                        ${isOverdue?`${Math.abs(diff)}j dépassé`:diff===0?"Aujourd'hui":`${diff}j`}
                    </div>
                </div>`;
            }).join('') : '<div class="empty" style="padding:20px 0"><div class="empty-icon">📅</div><div class="empty-text">Aucune échéance</div></div>'}
        </div>
    </div>`;
};

// ══════════════════════════════════════════════════════
// RENDER MY SPACE
// ══════════════════════════════════════════════════════
window.renderMySpace = function() {
    const el = document.getElementById('my-space-content');
    if (!el) return;

    const user   = typeof getUser === 'function' ? getUser() : null;
    const D_ref  = window.D || {};
    const items  = D_ref.workItems || [];
    const projs  = D_ref.projects  || [];
    const sprints= D_ref.sprints   || [];

    const myTasks  = items.filter(w => w.status !== 'Terminé').slice(0,10);
    const myProjs  = projs.slice(0,6);
    const doneCnt  = items.filter(w => w.status === 'Terminé').length;
    const activeCnt= items.filter(w => w.status === 'En cours').length;

    el.innerHTML = `
    <div style="margin-bottom:22px;padding:20px;background:linear-gradient(135deg,rgba(14,181,204,.07),var(--card));border:1px solid rgba(14,181,204,.15);border-radius:14px;display:flex;align-items:center;gap:16px">
        <div style="width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;font-family:var(--mono);background:rgba(14,181,204,.2);color:var(--accent);border:2px solid rgba(14,181,204,.3);flex-shrink:0">
            ${user?(user.member_initials||user.username?.substring(0,2)||'U').toUpperCase():'U'}
        </div>
        <div>
            <div style="font-size:17px;font-weight:800">${user?(user.first_name||user.username):'Utilisateur'}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${user?.role||'membre'} · KICEKO ProjectHub</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:14px">
            <div style="text-align:center"><div style="font-size:20px;font-weight:800;font-family:var(--mono);color:var(--green)">${activeCnt}</div><div style="font-size:9px;color:var(--text3)">Actives</div></div>
            <div style="text-align:center"><div style="font-size:20px;font-weight:800;font-family:var(--mono);color:var(--accent)">${doneCnt}</div><div style="font-size:9px;color:var(--text3)">Terminées</div></div>
        </div>
    </div>

    <div class="grid-2">
        <div class="card">
            <div class="section-title">Mes tâches actives</div>
            ${myTasks.length ? myTasks.map(w => `
                <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openWIModal(${w.id})">
                    <div style="width:8px;height:8px;border-radius:50%;background:${{Haute:'var(--red)',Moyenne:'var(--orange)',Basse:'var(--green)'}[w.priority]||'var(--text3)'};flex-shrink:0"></div>
                    <div style="flex:1;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.title)}</div>
                    <span style="font-size:10px;color:var(--accent);flex-shrink:0">${w.status}</span>
                </div>`).join('')
            : '<div class="empty" style="padding:16px 0"><div class="empty-icon">✅</div><div class="empty-text">Aucune tâche active</div></div>'}
        </div>
        <div class="card">
            <div class="section-title">Projets en cours</div>
            ${myProjs.length ? myProjs.map(p => `
                <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openProjModal(${p.id})">
                    <div style="width:8px;height:8px;border-radius:50%;background:${window.STATUS_COLORS?.[p.status]||'#64748b'};flex-shrink:0"></div>
                    <div style="flex:1;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
                    <span style="font-size:11px;font-family:var(--mono);font-weight:700;color:var(--accent);flex-shrink:0">${p.progress||0}%</span>
                </div>`).join('')
            : '<div class="empty" style="padding:16px 0"><div class="empty-icon">📁</div><div class="empty-text">Aucun projet</div></div>'}
        </div>
    </div>`;
};

// ══════════════════════════════════════════════════════
// RENDER DECISION
// ══════════════════════════════════════════════════════
window.renderDecision = function() {
    if (typeof renderDecisionPage === 'function') { renderDecisionPage(); return; }
    const el = document.getElementById('decision-content');
    if (!el) return;
    const D_ref = window.D || {};
    const alerts = AlertEngine.compute();
    const critical = alerts.filter(a => a.level === 'critical');
    const tenders  = D_ref.tenders || [];
    const won      = tenders.filter(t => t.status === 'Gagné').length;
    const totalT   = tenders.length;
    const winRate  = totalT ? Math.round(won/totalT*100) : 0;
    const pending  = tenders.filter(t => !['Gagné','Perdu'].includes(t.status)).length;

    const riskProjs = (D_ref.projects||[]).filter(p=>p.status!=='Terminé')
        .map(p => ({...p, _risk: AlertEngine.riskScore(p)}))
        .sort((a,b) => b._risk.score - a._risk.score).slice(0,6);

    el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card c-accent"><div class="stat-value">${critical.length}</div><div class="stat-label">Alertes critiques</div><div class="stat-change ${critical.length>0?'down':'up'}">${critical.length>0?'⚠ Action requise':'✅ Sous contrôle'}</div><div class="stat-icon">🚨</div></div>
        <div class="stat-card c-green"><div class="stat-value">${winRate}%</div><div class="stat-label">Taux succès AO</div><div class="stat-change neutral">${won}/${totalT} gagnés</div><div class="stat-icon">🏆</div></div>
        <div class="stat-card c-blue"><div class="stat-value">${pending}</div><div class="stat-label">AO en cours</div><div class="stat-change neutral">${fmt(tenders.reduce((a,t)=>a+(t.amount||0),0))} FCFA</div><div class="stat-icon">💼</div></div>
        <div class="stat-card c-purple"><div class="stat-value">${(D_ref.projects||[]).filter(p=>p.status==='En cours').length}</div><div class="stat-label">Projets actifs</div><div class="stat-change neutral">${(D_ref.members||[]).length} membres</div><div class="stat-icon">📊</div></div>
    </div>
    <div class="grid-2">
        <div class="card">
            <div class="section-title">🧠 Scores de risque projets</div>
            ${riskProjs.map(p => {
                const r=p._risk, r2=16, cx=20, cy=20, circ=2*Math.PI*r2;
                return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openSWOT(${p.id})">
                    <svg width="40" height="40" viewBox="0 0 40 40" style="transform:rotate(-90deg);flex-shrink:0">
                        <circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="var(--border)" stroke-width="3"/>
                        <circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="${r.color}" stroke-width="3"
                            stroke-dasharray="${circ*r.score/100} ${circ}" stroke-linecap="round"/>
                    </svg>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
                        <div style="font-size:10px;color:var(--text3)">${p.status} · ${p.progress||0}%</div>
                    </div>
                    <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${r.color}">${r.score}</div>
                </div>`;
            }).join('') || '<div class="empty" style="padding:20px 0">Aucun projet actif</div>'}
        </div>
        <div class="card">
            <div class="section-title">💡 Recommandations</div>
            ${_generateRecs(D_ref)}
        </div>
    </div>`;
};

function _generateRecs(D_ref) {
    const recs = [];
    const now = new Date();
    const bgs = {critical:'var(--redbg)',warning:'var(--orangebg)',info:'var(--bluebg)',success:'var(--greenbg)'};
    const cols = {critical:'var(--red)',warning:'var(--orange)',info:'var(--blue)',success:'var(--green)'};

    (D_ref.projects||[]).forEach(p => {
        if (!p.deadline||p.status==='Terminé') return;
        const d = Math.floor((new Date(p.deadline)-now)/86400000);
        if (d < 0) recs.push({icon:'🚨',level:'critical',text:`Relancer <strong>${esc(p.name)}</strong> — deadline dépassée de ${Math.abs(d)}j`});
        else if (d <= 7 && (p.progress||0) < 70) recs.push({icon:'⚠️',level:'warning',text:`Accélérer <strong>${esc(p.name)}</strong> — ${d}j, ${p.progress||0}% seulement`});
    });
    const bugs = (D_ref.workItems||[]).filter(w=>w.type==='bug'&&w.status!=='Terminé');
    if (bugs.length >= 3) recs.push({icon:'🐛',level:'warning',text:`<strong>${bugs.length} bugs ouverts</strong> — dette technique`});
    if ((D_ref.tenders||[]).filter(t=>t.status==='Gagné').length > 0)
        recs.push({icon:'🏆',level:'success',text:`<strong>${(D_ref.tenders||[]).filter(t=>t.status==='Gagné').length} AO gagnés</strong> — capitaliser`});
    if (!recs.length) recs.push({icon:'✅',level:'success',text:'Tous les indicateurs sont au vert !'});

    return recs.slice(0,6).map(r => `
        <div style="display:flex;gap:10px;padding:9px 10px;margin-bottom:7px;background:${bgs[r.level]};border-radius:8px;border-left:3px solid ${cols[r.level]}">
            <span style="font-size:15px;flex-shrink:0">${r.icon}</span>
            <div style="font-size:12px;line-height:1.5">${r.text}</div>
        </div>`).join('');
}

// ══════════════════════════════════════════════════════
// RENDER USERS ADMIN
// ══════════════════════════════════════════════════════
window.renderUsers = async function() {
    const el = document.getElementById('users-content');
    if (!el) return;
    el.innerHTML = '<div class="empty"><div class="app-loading-spinner" style="margin:0 auto 16px"></div>Chargement…</div>';

    const res = await apiFetch('/api/users/');
    if (!res?.ok) {
        el.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><div class="empty-text">Accès réservé aux administrateurs</div></div>';
        return;
    }
    const users = await res.json();
    const D_ref = window.D || {};

    el.innerHTML = `<div class="card">
        <div class="section-title">Gestion des utilisateurs (${users.length})</div>
        <div style="overflow-x:auto"><table class="ao-table">
            <thead><tr>${['Identifiant','Nom','Email','Rôle','Membre lié'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${users.map(u => `<tr>
                <td><span style="font-family:var(--mono);font-size:11px">${esc(u.username)}</span></td>
                <td>${esc((u.first_name+' '+u.last_name).trim()||'—')}</td>
                <td style="font-family:var(--mono);font-size:11px;color:var(--text3)">${esc(u.email||'—')}</td>
                <td>
                    <select onchange="updateUserRole(${u.id},this.value)"
                            style="background:var(--surface);border:1px solid var(--border2);color:var(--text);padding:4px 8px;border-radius:6px;font-size:11px;font-family:var(--font)">
                        <option value="member" ${u.role==='member'?'selected':''}>Membre</option>
                        <option value="manager" ${u.role==='manager'?'selected':''}>Manager</option>
                        <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
                    </select>
                </td>
                <td>
                    <select onchange="linkUserMember(${u.id},this.value)"
                            style="background:var(--surface);border:1px solid var(--border2);color:var(--text);padding:4px 8px;border-radius:6px;font-size:11px;font-family:var(--font)">
                        <option value="">— Lier un membre —</option>
                        ${(D_ref.members||[]).map(m=>`<option value="${m.id}"${u.member_id==m.id?' selected':''}>${esc(m.name)}</option>`).join('')}
                    </select>
                </td>
            </tr>`).join('')}</tbody>
        </table></div>
    </div>`;
};

window.renderUsersAdmin = window.renderUsers;

window.updateUserRole = async function(userId, role) {
    const res = await apiFetch(`/api/users/${userId}/role/`, {method:'PATCH', body:JSON.stringify({role})});
    if (res?.ok) toast('Rôle mis à jour', 'success', '✅');
    else toast('Erreur', 'error', '❌');
};

window.linkUserMember = async function(userId, memberId) {
    if (!memberId) return;
    const res = await apiFetch(`/api/users/${userId}/role/`, {method:'PATCH', body:JSON.stringify({member_id:memberId})});
    if (res?.ok) toast('Membre lié', 'success', '✅');
    else toast('Erreur', 'error', '❌');
};

// ══════════════════════════════════════════════════════
// OPEN MODALS
// ══════════════════════════════════════════════════════
window.openWIModal = function(id=null) {
    window.editWIId = id;
    const lbl = document.getElementById('mwi-label');
    if (lbl) lbl.textContent = id ? 'Modifier le ticket' : 'Nouveau ticket';

    const D_ref = window.D || {};
    const asel  = document.getElementById('wi-assignee');
    const psel  = document.getElementById('wi-project');

    if (asel) asel.innerHTML = '<option value="">— Aucun —</option>' +
        (D_ref.members||[]).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
    if (psel) psel.innerHTML = '<option value="">— Aucun —</option>' +
        (D_ref.projects||[]).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');

    if (id) {
        const wi = (D_ref.workItems||[]).find(w=>w.id===id);
        if (wi) {
            _setV('wi-title',    wi.title||'');
            _setV('wi-type',     wi.type||'task');
            _setV('wi-prio',     wi.priority||'Moyenne');
            _setV('wi-status',   wi.status||'Backlog');
            _setV('wi-pts',      String(wi.pts||5));
            if (asel) asel.value = wi.assignee || '';
            if (psel) psel.value = wi.project  || '';
            _setV('wi-due',      wi.due ? wi.due.split('T')[0] : '');
            _setV('wi-desc',     wi.description||'');
        }
    } else {
        ['wi-title','wi-due','wi-desc'].forEach(id => _setV(id,''));
        _setV('wi-type','task'); _setV('wi-prio','Moyenne');
        _setV('wi-status','Backlog'); _setV('wi-pts','5');
        if (asel) asel.value=''; if (psel) psel.value='';
    }
    om('modal-wi');
};

window.openProjModal = function(id=null) {
    window.editProjId = id;
    const lbl = document.getElementById('mproj-label');
    if (lbl) lbl.textContent = id ? 'Modifier le projet' : 'Nouveau projet';

    const D_ref = window.D || {};
    const msel  = document.getElementById('proj-members');
    if (msel) msel.innerHTML = (D_ref.members||[]).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');

    const swotBtn = document.getElementById('btn-swot-proj');
    if (swotBtn) swotBtn.style.display = id ? 'flex' : 'none';

    if (id) {
        const p = (D_ref.projects||[]).find(p=>p.id===id);
        if (p) {
            _setV('proj-name',     p.name||'');
            _setV('proj-desc',     p.description||'');
            _setV('proj-cat',      p.category||'IT');
            _setV('proj-status',   p.status||'Planifié');
            _setV('proj-progress', String(p.progress||0));
            _setV('proj-deadline', p.deadline?p.deadline.split('T')[0]:'');
            if (msel) {
                const mids = (p.members||p.members_detail?.map(m=>m.id)||[]).map(String);
                Array.from(msel.options).forEach(o => { o.selected = mids.includes(o.value); });
            }
        }
    } else {
        ['proj-name','proj-desc','proj-deadline'].forEach(id=>_setV(id,''));
        _setV('proj-cat','IT'); _setV('proj-status','Planifié'); _setV('proj-progress','0');
        if (msel) Array.from(msel.options).forEach(o=>{ o.selected=false; });
    }
    om('modal-proj');
};

window.openAOModal = function(id=null) {
    window.editAOId = id;
    const lbl = document.getElementById('mao-label');
    if (lbl) lbl.textContent = id ? "Modifier l'AO" : "Nouvel appel d'offres";

    const D_ref = window.D || {};
    const lsel  = document.getElementById('ao-lead');
    if (lsel) lsel.innerHTML = '<option value="">— Responsable —</option>' +
        (D_ref.members||[]).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');

    if (id) {
        const t = (D_ref.tenders||[]).find(t=>t.id===id);
        if (t) {
            _setV('ao-title',    t.title||'');
            _setV('ao-org',      t.org||'');
            _setV('ao-amount',   String(t.amount||0));
            _setV('ao-deadline', t.deadline?t.deadline.split('T')[0]:'');
            _setV('ao-status',   t.status||'Détection');
            if (lsel) lsel.value = t.lead || '';
        }
    } else {
        ['ao-title','ao-org'].forEach(id=>_setV(id,''));
        _setV('ao-amount','0'); _setV('ao-deadline',''); _setV('ao-status','Détection');
        if (lsel) lsel.value='';
    }
    om('modal-ao');
};

window.openSWOT = async function(projId) {
    om('modal-swot');
    const content = document.getElementById('swot-content');
    if (content) content.innerHTML = '<div class="empty"><div class="app-loading-spinner" style="margin:0 auto 16px"></div>Chargement SWOT…</div>';

    const res = await apiFetch(`/api/projects/${projId}/swot/`);
    if (!res?.ok) {
        if (content) content.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Erreur</div></div>';
        return;
    }
    const swot = await res.json();
    const proj = (window.D?.projects||[]).find(p=>p.id===projId);

    const quadrants = [
        {key:'strengths',     label:'Forces',       icon:'💪', color:'var(--green)', bg:'rgba(34,197,94,.06)'},
        {key:'weaknesses',    label:'Faiblesses',   icon:'⚠️', color:'var(--red)',   bg:'rgba(239,68,68,.06)'},
        {key:'opportunities', label:'Opportunités', icon:'🚀', color:'var(--blue)',  bg:'rgba(59,130,246,.06)'},
        {key:'threats',       label:'Menaces',      icon:'🎯', color:'var(--orange)',bg:'rgba(249,115,22,.06)'},
    ];

    if (content) content.innerHTML = `
        <div class="modal-title">
            <span>🧠 SWOT — ${esc(proj?.name||`Projet #${projId}`)}</span>
            <button class="modal-close" onclick="cm('modal-swot')">×</button>
        </div>
        ${swot.auto_generated?`<div style="font-size:11px;color:var(--text3);margin-bottom:12px;padding:8px;background:var(--surface);border-radius:6px">🤖 Auto-générée · <span onclick="regenSWOT(${projId})" style="cursor:pointer;color:var(--accent)">Regénérer</span></div>`:''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            ${quadrants.map(q=>`
                <div style="padding:14px;background:${q.bg};border:1px solid ${q.color}33;border-radius:10px">
                    <div style="font-size:12px;font-weight:700;color:${q.color};margin-bottom:10px">${q.icon} ${q.label}</div>
                    <ul style="margin:0;padding-left:16px;font-size:11px;color:var(--text2);line-height:1.8">
                        ${(swot[q.key]||[]).map(item=>`<li>${esc(item)}</li>`).join('')||'<li style="list-style:none;color:var(--text3)">—</li>'}
                    </ul>
                </div>`).join('')}
        </div>
        ${swot.notes?`<div style="margin-top:12px;padding:10px;background:var(--surface);border-radius:8px;font-size:11px;color:var(--text2)">📝 ${esc(swot.notes)}</div>`:''}
        <div class="form-actions" style="margin-top:16px">
            <button class="btn btn-ghost" onclick="cm('modal-swot')">Fermer</button>
            <button class="btn btn-outline" onclick="regenSWOT(${projId})">🔄 Regénérer</button>
        </div>`;
};

window.regenSWOT = async function(projId) {
    const content = document.getElementById('swot-content');
    if (content) content.innerHTML = '<div class="empty"><div class="app-loading-spinner" style="margin:0 auto 16px"></div>Génération…</div>';
    const res = await apiFetch(`/api/projects/${projId}/swot_regenerate/`, {method:'POST'});
    if (res?.ok) { toast('SWOT regénéré','success','🧠'); openSWOT(projId); }
    else toast('Erreur','error','❌');
};

// ══════════════════════════════════════════════════════
// SAVE FUNCTIONS
// ══════════════════════════════════════════════════════
window.saveWI = async function() {
    const id    = window.editWIId;
    const title = document.getElementById('wi-title')?.value.trim();
    if (!title) { toast('Le titre est obligatoire','error','❌'); return; }

    const data = {
        title,
        type:        _getV('wi-type'),
        priority:    _getV('wi-prio'),
        status:      _getV('wi-status'),
        pts:         parseInt(_getV('wi-pts'))||null,
        assignee:    _getV('wi-assignee')||null,
        project:     _getV('wi-project')||null,
        due:         _getV('wi-due')||null,
        description: _getV('wi-desc')||'',
    };

    const res = await apiFetch(id?`/api/workitems/${id}/`:'/api/workitems/', {
        method: id?'PUT':'POST', body: JSON.stringify(data)
    });
    if (res?.ok) {
        cm('modal-wi');
        toast(id?'Ticket mis à jour':'Ticket créé','success','✅');
        try {
            const fresh = await apiFetch('/api/workitems/');
            if (fresh?.ok) {
                const list = await fresh.json();
                if (Array.isArray(list)) window.D.workItems = list;
            }
        } catch(e) { /* keep local */ }
        if (typeof _updateChips==='function') _updateChips();
        renderPage(window.currentPage);
    } else {
        const err = res?await res.json().catch(()=>({})):{};
        toast(Object.values(err).flat().join(', ')||'Erreur','error','❌');
    }
};

window.saveProj = async function() {
    const id   = window.editProjId;
    const name = document.getElementById('proj-name')?.value.trim();
    if (!name) { toast('Le nom est obligatoire','error','❌'); return; }

    const msel   = document.getElementById('proj-members');
    const members= msel ? Array.from(msel.selectedOptions).map(o=>parseInt(o.value)) : [];

    const data = {
        name,
        description: _getV('proj-desc')||'',
        category:    _getV('proj-cat')||'IT',
        status:      _getV('proj-status')||'Planifié',
        progress:    parseInt(_getV('proj-progress'))||0,
        deadline:    _getV('proj-deadline')||null,
        members,
    };

    const res = await apiFetch(id?`/api/projects/${id}/`:'/api/projects/', {
        method: id?'PUT':'POST', body: JSON.stringify(data)
    });
    if (res?.ok) {
        cm('modal-proj');
        toast(id?'Projet mis à jour':'Projet créé','success','✅');
        // Recharger tous les projets depuis l'API pour avoir les données complètes
        try {
            const fresh = await apiFetch('/api/projects/');
            if (fresh?.ok) {
                const list = await fresh.json();
                if (Array.isArray(list)) window.D.projects = list;
            }
        } catch(e) { /* keep local D.projects */ }
        if (typeof _renderSidebar==='function') _renderSidebar();
        if (typeof _updateChips==='function') _updateChips();
        renderPage(window.currentPage);
    } else {
        const err = res?await res.json().catch(()=>({})):{};
        toast(Object.values(err).flat().join(', ')||'Erreur','error','❌');
    }
};

window.saveAO = async function() {
    const id    = window.editAOId;
    const title = document.getElementById('ao-title')?.value.trim();
    if (!title) { toast('Le titre est obligatoire','error','❌'); return; }

    const data = {
        title,
        org:      _getV('ao-org')||'',
        amount:   parseFloat(_getV('ao-amount'))||0,
        deadline: _getV('ao-deadline')||null,
        status:   _getV('ao-status')||'Détection',
        lead:     _getV('ao-lead')||null,
    };

    const res = await apiFetch(id?`/api/tenders/${id}/`:'/api/tenders/', {
        method: id?'PUT':'POST', body: JSON.stringify(data)
    });
    if (res?.ok) {
        cm('modal-ao');
        toast(id?"AO mis à jour":"AO créé",'success','✅');
        try {
            const fresh = await apiFetch('/api/tenders/');
            if (fresh?.ok) {
                const list = await fresh.json();
                if (Array.isArray(list)) window.D.tenders = list;
            }
        } catch(e) { /* keep local */ }
        if (typeof _updateChips==='function') _updateChips();
        renderPage(window.currentPage);
    } else {
        const err = res?await res.json().catch(()=>({})):{};
        toast(err.detail||'Erreur','error','❌');
    }
};

window.saveMember = async function() {
    const name = document.getElementById('mem-name')?.value.trim();
    if (!name) { toast('Le nom est obligatoire','error','❌'); return; }

    const data = {
        name,
        role:     _getV('mem-role')||'',
        initials: (_getV('mem-init')||name.substring(0,2)).toUpperCase(),
        color:    _getV('mem-color')||'#0eb5cc',
    };

    const res = await apiFetch('/api/team/create/', {method:'POST', body:JSON.stringify(data)});
    if (res?.ok) {
        cm('modal-member');
        toast('Membre ajouté','success','✅');
        try {
            const fresh = await apiFetch('/api/members/');
            if (fresh?.ok) {
                const list = await fresh.json();
                if (Array.isArray(list)) window.D.members = list;
            }
        } catch(e) { /* keep local */ }
        renderPage(window.currentPage);
    } else {
        const err = res?await res.json().catch(()=>({})):{};
        toast(err.detail||'Erreur','error','❌');
    }
};

// ══════════════════════════════════════════════════════
// DELETE FUNCTIONS
// ══════════════════════════════════════════════════════
window.deleteWI = async function(id) {
    if (!confirm('Supprimer ce ticket ?')) return;
    const res = await apiFetch(`/api/workitems/${id}/`, {method:'DELETE'});
    if (res?.status===204||res?.ok) {
        window.D.workItems=(window.D?.workItems||[]).filter(w=>w.id!==id);
        renderPage(window.currentPage); _updateChips();
        toast('Ticket supprimé','info','🗑');
    }
};

window.deleteProj = async function(id) {
    if (!confirm('Supprimer ce projet et toutes ses données ?')) return;
    const res = await apiFetch(`/api/projects/${id}/`, {method:'DELETE'});
    if (res?.status===204||res?.ok) {
        window.D.projects=(window.D?.projects||[]).filter(p=>p.id!==id);
        if (typeof _renderSidebar==='function') _renderSidebar();
        renderPage(window.currentPage);
        toast('Projet supprimé','info','🗑');
    }
};

window.deleteTender = async function(id) {
    if (!confirm("Supprimer cet appel d'offres ?")) return;
    const res = await apiFetch(`/api/tenders/${id}/`, {method:'DELETE'});
    if (res?.status===204||res?.ok) {
        window.D.tenders=(window.D?.tenders||[]).filter(t=>t.id!==id);
        renderPage(window.currentPage); _updateChips();
        toast('AO supprimé','info','🗑');
    }
};

window.deleteMember = async function(id) {
    if (!confirm('Supprimer ce membre ?')) return;
    const res = await apiFetch(`/api/team/${id}/delete/`, {method:'DELETE'});
    if (res?.status===204||res?.ok) {
        window.D.members=(window.D?.members||[]).filter(m=>m.id!==id);
        renderPage(window.currentPage);
        toast('Membre supprimé','info','🗑');
    }
};

// ══════════════════════════════════════════════════════
// HELPERS INTERNES
// ══════════════════════════════════════════════════════
function _getV(id) { return document.getElementById(id)?.value||''; }
function _setV(id, val) { const el=document.getElementById(id); if(el) el.value=val; }

// Dashboard alerts override
window.renderDashboardAlerts = _renderBasicAlerts;

// renderCalendarPage alias
window.renderCalendarPage = window.renderCalendar;
window.renderMySpacePage  = window.renderMySpace;
window.renderDecisionPage = window.renderDecision;
