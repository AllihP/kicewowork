/**
 * rbac_swot.js — Système RBAC + Matrice SWOT Intelligente
 * KICEKO ProjectHub
 *
 * Ce fichier doit être chargé APRÈS app.js
 *
 * Fonctions principales :
 *  - initRBAC()       : configure l'interface selon le rôle
 *  - renderSWOT(id)   : affiche la matrice SWOT d'un projet
 *  - renderUsersAdmin(): page admin de gestion des utilisateurs
 */

// ══════════════════════════════════════════
// 1. RBAC — CONTRÔLE D'ACCÈS PAR RÔLE
// ══════════════════════════════════════════

/**
 * Pages accessibles selon le rôle
 */
const ROLE_PERMISSIONS = {
  admin: {
    pages:    ['dashboard','projects','board','backlog','sprints','tenders','team','analytics','calendar','users'],
    canCreate: true,
    canDelete: true,
    canEdit:   true,
    seeFinancials: true,
  },
  manager: {
    pages:    ['dashboard','projects','board','backlog','sprints','tenders','team','analytics','calendar'],
    canCreate: true,
    canDelete: false,
    canEdit:   true,
    seeFinancials: true,
  },
  member: {
    pages:    ['my-space','projects'],   // Espace perso + liste projets (sans détails)
    canCreate: false,
    canDelete: false,
    canEdit:   false,
    seeFinancials: false,
  },
};

function getUserRole() {
  const user = getUser();
  return user?.role || 'member';
}

function canAccess(page) {
  const role = getUserRole();
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
  return perms.pages.includes(page);
}

function canDo(action) {
  const role  = getUserRole();
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
  return perms[action] === true;
}

/**
 * Initialise l'interface selon le rôle de l'utilisateur connecté
 * À appeler après loadAll()
 */
function initRBAC() {
  const role = getUserRole();
  const user = getUser();

  // ── Sidebar : masquer les liens non autorisés ──
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.getAttribute('data-page');
    if (!canAccess(page)) {
      el.style.display = 'none';
    }
  });

  // ── Bouton "Nouveau" : masquer pour les membres ──
  const newBtn = document.querySelector('.btn-primary[onclick="openAdd()"]');
  if (newBtn && !canDo('canCreate')) newBtn.style.display = 'none';

  // ── Nav labels : masquer les sections vides ──
  document.querySelectorAll('.nav-label').forEach(label => {
    const next = label.nextElementSibling;
    if (next) {
      const visibleItems = next.querySelectorAll('.nav-item:not([style*="display: none"])');
      if (visibleItems.length === 0) label.style.display = 'none';
    }
  });

  // ── Ajouter lien "Mon Espace" pour les membres ──
  if (role === 'member') {
    addMySpaceLink();
    // Rediriger vers Mon Espace si on essaie d'accéder à une page non autorisée
    if (!canAccess(currentPage)) {
      nav('my-space', null);
    }
  }

  // ── Ajouter lien "Utilisateurs" pour les admins ──
  if (role === 'admin') {
    addUsersAdminLink();
  }

  // ── Badge de rôle dans la sidebar footer ──
  const userAv = document.getElementById('user-av');
  if (userAv && user) {
    const roleBadge = { admin:'👑', manager:'🎯', member:'👤' };
    const roleLabel = document.getElementById('role-badge');
    if (!roleLabel) {
      const footer = document.querySelector('.sb-footer .user-row');
      if (footer) {
        const badge = document.createElement('div');
        badge.id = 'role-badge';
        badge.style.cssText = 'font-size:9px;padding:2px 6px;border-radius:4px;font-weight:700;font-family:var(--mono);text-transform:uppercase;letter-spacing:1px';
        badge.style.background = role==='admin' ? 'var(--accentbg)' : role==='manager' ? 'var(--bluebg)' : 'var(--card2)';
        badge.style.color = role==='admin' ? 'var(--accent)' : role==='manager' ? 'var(--blue)' : 'var(--text3)';
        badge.textContent = `${roleBadge[role]||''} ${role}`;
        footer.querySelector('div[style]')?.appendChild(badge);
      }
    }
  }
}

function addMySpaceLink() {
  // Vérifier si déjà ajouté
  if (document.querySelector('[data-page="my-space"]')) return;

  const navSection = document.querySelector('.nav-section');
  if (!navSection) return;

  const item = document.createElement('div');
  item.className = 'nav-item';
  item.setAttribute('data-page', 'my-space');
  item.setAttribute('onclick', "nav('my-space',this)");
  item.innerHTML = '<span class="nav-icon">🏠</span> Mon Espace';

  navSection.insertBefore(item, navSection.firstChild);

  // Ajouter la section page
  const content = document.getElementById('page-dashboard')?.parentElement;
  if (content && !document.getElementById('page-my-space')) {
    const section = document.createElement('section');
    section.id = 'page-my-space';
    section.className = 'page';
    content.insertBefore(section, content.firstChild);
  }

  // Enregistrer dans renderPage
  PAGE_TITLES['my-space'] = 'Mon Espace';
  PAGE_SUBS['my-space']   = 'Mes projets & tâches assignées';
}

function addUsersAdminLink() {
  if (document.querySelector('[data-page="users"]')) return;

  const teamSection = document.querySelector('.nav-item[data-page="team"]')?.parentElement;
  if (!teamSection) return;

  const item = document.createElement('div');
  item.className = 'nav-item';
  item.setAttribute('data-page', 'users');
  item.setAttribute('onclick', "nav('users',this)");
  item.innerHTML = '<span class="nav-icon">🔑</span> Utilisateurs';

  teamSection.appendChild(item);

  // Ajouter la section page
  const content = document.getElementById('page-team')?.parentElement;
  if (content && !document.getElementById('page-users')) {
    const section = document.createElement('section');
    section.id = 'page-users';
    section.className = 'page';
    content.appendChild(section);
  }

  PAGE_TITLES['users'] = 'Gestion Utilisateurs';
  PAGE_SUBS['users']   = 'Rôles & accès · Admin uniquement';
}

// ── Patch renderPage pour les nouvelles pages ──
const _origRenderPage = renderPage;
function renderPage(page) {
  if (page === 'my-space') { renderMySpace(); return; }
  if (page === 'users')    { renderUsersAdmin(); return; }
  _origRenderPage(page);
}


// ══════════════════════════════════════════
// 2. MON ESPACE (vue membre)
// ══════════════════════════════════════════

async function renderMySpace() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-my-space');
  if (!pg) return;
  pg.classList.add('active');

  const user = getUser();
  if (!user) return;

  // Charger le dashboard personnel
  let myData = null;
  try {
    const res = await apiFetch(`${API}/dashboard/`);
    if (res?.ok) myData = await res.json();
  } catch(e) {}

  const myProjects = myData?.my_projects || D.projects.filter(p =>
    p.members_detail?.some(m => m.id === user.member_id)
  );
  const myTasks = myData?.my_tasks || D.workItems.filter(w =>
    w.assignee === user.member_id && ['En cours','A faire'].includes(w.status)
  );

  pg.innerHTML = `
    <!-- Bienvenue -->
    <div style="margin-bottom:24px;padding:20px;background:linear-gradient(135deg,var(--accentbg),var(--card));border:1px solid rgba(232,160,32,.2);border-radius:var(--radius)">
      <div style="font-size:22px;font-weight:700;margin-bottom:4px">
        Bonjour ${user.first_name || user.username} 👋
      </div>
      <div style="font-size:13px;color:var(--text2)">
        Voici un aperçu de tes projets et tâches assignées
      </div>
    </div>

    <!-- Stats personnelles -->
    <div class="stats-grid" style="margin-bottom:24px">
      <div class="stat-card c-blue">
        <div class="stat-value">${myProjects.length}</div>
        <div class="stat-label">Mes projets</div>
        <div class="stat-icon">📁</div>
      </div>
      <div class="stat-card c-accent">
        <div class="stat-value">${myTasks.filter(t=>t.status==='En cours').length}</div>
        <div class="stat-label">Tâches en cours</div>
        <div class="stat-icon">⚡</div>
      </div>
      <div class="stat-card c-green">
        <div class="stat-value">${myData?.done_tasks || 0}</div>
        <div class="stat-label">Tâches terminées</div>
        <div class="stat-icon">✅</div>
      </div>
    </div>

    <div class="grid-2">
      <!-- Mes projets -->
      <div class="card">
        <div class="section-title">📁 Mes Projets</div>
        ${myProjects.length ? myProjects.map(p => `
          <div style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center">
            <div style="width:4px;height:40px;border-radius:4px;background:${STATUS_COLORS[p.status]||'var(--blue)'};flex-shrink:0"></div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${p.name}</div>
              <div style="margin-top:6px">
                <div class="progress-wrap" style="margin:0"><div class="progress-bar" style="width:${p.progress||0}%"></div></div>
              </div>
            </div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--text3)">${p.progress||0}%</div>
            ${badge('status', p.status)}
          </div>`).join('') :
          '<div style="text-align:center;padding:24px;color:var(--text3)">Aucun projet assigné</div>'}
      </div>

      <!-- Mes tâches -->
      <div class="card">
        <div class="section-title">✅ Mes Tâches</div>
        ${myTasks.length ? myTasks.slice(0,8).map(t => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
            <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${t.status==='En cours'?'var(--accent)':t.status==='A faire'?'var(--blue)':'var(--text3)'}"></div>
            <div style="flex:1;font-size:12.5px;font-weight:500">${t.title}</div>
            ${badge('prio', t.priority)}
            ${t.due ? `<div style="font-size:10px;font-family:var(--mono);color:var(--text3)">${fd(t.due)}</div>` : ''}
          </div>`).join('') :
          '<div style="text-align:center;padding:24px;color:var(--text3)">✅ Aucune tâche en cours</div>'}
      </div>
    </div>
  `;
}


// ══════════════════════════════════════════
// 3. GESTION UTILISATEURS (admin)
// ══════════════════════════════════════════

let usersData = [];

async function renderUsersAdmin() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-users');
  if (!pg) return;
  pg.classList.add('active');

  pg.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">Chargement...</div>`;

  try {
    const res = await apiFetch(`${API}/users/`);
    usersData = res?.ok ? await res.json() : [];
  } catch(e) { usersData = []; }

  const roleColors = { admin:'var(--accent)', manager:'var(--blue)', member:'var(--text3)' };
  const roleBg     = { admin:'var(--accentbg)', manager:'var(--bluebg)', member:'var(--card2)' };

  pg.innerHTML = `
    <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:16px;font-weight:700">Gestion des accès</div>
        <div style="font-size:12px;color:var(--text3)">${usersData.length} utilisateur${usersData.length>1?'s':''} enregistré${usersData.length>1?'s':''}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openCreateUserModal()">＋ Nouvel utilisateur</button>
    </div>

    <!-- Stats rôles -->
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      ${['admin','manager','member'].map(r => {
        const cnt = usersData.filter(u=>u.role===r).length;
        return `<div style="padding:10px 18px;background:${roleBg[r]};border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:8px">
          <div style="font-size:16px;font-weight:700;color:${roleColors[r]}">${cnt}</div>
          <div style="font-size:11px;color:var(--text2);text-transform:capitalize">${r}${cnt>1?'s':''}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Tableau utilisateurs -->
    <div class="card" style="overflow:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:10px 14px;font-size:10px;color:var(--text3);font-family:var(--mono);font-weight:700;letter-spacing:1px">UTILISATEUR</th>
            <th style="text-align:left;padding:10px 14px;font-size:10px;color:var(--text3);font-family:var(--mono);font-weight:700;letter-spacing:1px">RÔLE</th>
            <th style="text-align:left;padding:10px 14px;font-size:10px;color:var(--text3);font-family:var(--mono);font-weight:700;letter-spacing:1px">MEMBRE LIÉ</th>
            <th style="text-align:left;padding:10px 14px;font-size:10px;color:var(--text3);font-family:var(--mono);font-weight:700;letter-spacing:1px">STATUT</th>
            <th style="text-align:right;padding:10px 14px;font-size:10px;color:var(--text3);font-family:var(--mono);font-weight:700;letter-spacing:1px">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${usersData.map(u => `
            <tr style="border-bottom:1px solid var(--border)" id="user-row-${u.id}">
              <td style="padding:12px 14px">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="av" style="width:32px;height:32px;font-size:11px;background:${roleBg[u.role]};color:${roleColors[u.role]}">
                    ${(u.first_name||u.username).substring(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style="font-size:13px;font-weight:600">${u.first_name} ${u.last_name}</div>
                    <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">@${u.username}</div>
                  </div>
                </div>
              </td>
              <td style="padding:12px 14px">
                <select onchange="changeUserRole(${u.id}, this.value)"
                  style="background:${roleBg[u.role]};color:${roleColors[u.role]};border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;font-family:var(--mono);cursor:pointer">
                  <option value="admin"   ${u.role==='admin'?'selected':''}>👑 Admin</option>
                  <option value="manager" ${u.role==='manager'?'selected':''}>🎯 Manager</option>
                  <option value="member"  ${u.role==='member'?'selected':''}>👤 Membre</option>
                </select>
              </td>
              <td style="padding:12px 14px;font-size:12px;color:var(--text2)">
                ${u.member_name || '<span style="color:var(--text3)">Non lié</span>'}
              </td>
              <td style="padding:12px 14px">
                <span style="font-size:11px;padding:3px 8px;border-radius:6px;font-weight:600;background:${u.is_active?'var(--greenbg)':'var(--redbg)'};color:${u.is_active?'var(--green)':'var(--red)'}">
                  ${u.is_active ? '● Actif' : '● Inactif'}
                </span>
              </td>
              <td style="padding:12px 14px;text-align:right">
                <button class="btn btn-outline btn-sm" onclick="openLinkMemberModal(${u.id},'${u.username}')">
                  🔗 Lier
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- Légende rôles -->
    <div class="card" style="margin-top:16px">
      <div class="section-title">Permissions par rôle</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:12px">
        ${[
          { role:'admin', icon:'👑', label:'Administrateur', desc:'Accès complet · Dashboard · Tous les projets · AO · Sprints · Gestion utilisateurs' },
          { role:'manager', icon:'🎯', label:'Chef de projet', desc:'Dashboard · Projets · Kanban · Backlog · Sprints · Appels d\'offres · Analytiques' },
          { role:'member', icon:'👤', label:'Membre', desc:'Mon espace personnel · Liste des projets assignés uniquement · Ses tâches' },
        ].map(r => `
          <div style="padding:14px;background:${roleBg[r.role]};border:1px solid var(--border);border-radius:10px">
            <div style="font-size:15px;font-weight:700;margin-bottom:6px;color:${roleColors[r.role]}">${r.icon} ${r.label}</div>
            <div style="font-size:11px;color:var(--text2);line-height:1.5">${r.desc}</div>
          </div>`).join('')}
      </div>
    </div>
  `;
}

async function changeUserRole(userId, newRole) {
  const res = await apiFetch(`${API}/users/${userId}/role/`, {
    method: 'PATCH',
    body:   JSON.stringify({ role: newRole })
  });
  if (res?.ok) {
    toast(`Rôle mis à jour : ${newRole}`, 'success', '✅');
    renderUsersAdmin(); // Rafraîchir
  } else {
    toast('Erreur lors du changement de rôle', 'error', '⚠');
  }
}

function openCreateUserModal() {
  const html = `
    <div class="modal-title">
      <span>Nouvel utilisateur</span>
      <button class="modal-close" onclick="document.getElementById('modal-create-user').classList.remove('open')">×</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Prénom</label>
        <input id="cu-fname" class="form-input" placeholder="Prénom">
      </div>
      <div class="form-group">
        <label class="form-label">Nom</label>
        <input id="cu-lname" class="form-input" placeholder="Nom">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Nom d'utilisateur *</label>
      <input id="cu-user" class="form-input" placeholder="login">
    </div>
    <div class="form-group">
      <label class="form-label">Mot de passe *</label>
      <input id="cu-pass" type="password" class="form-input" placeholder="••••••••">
    </div>
    <div class="form-group">
      <label class="form-label">Rôle</label>
      <select id="cu-role" class="sel">
        <option value="member">👤 Membre</option>
        <option value="manager">🎯 Manager</option>
        <option value="admin">👑 Admin</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-create-user').classList.remove('open')">Annuler</button>
      <button class="btn btn-primary" onclick="createUser()">Créer</button>
    </div>
  `;

  let modal = document.getElementById('modal-create-user');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-create-user';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal">${html}</div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  } else {
    modal.querySelector('.modal').innerHTML = html;
  }
  modal.classList.add('open');
}

async function createUser() {
  const username  = document.getElementById('cu-user')?.value.trim();
  const password  = document.getElementById('cu-pass')?.value;
  const firstName = document.getElementById('cu-fname')?.value;
  const lastName  = document.getElementById('cu-lname')?.value;
  const role      = document.getElementById('cu-role')?.value;

  if (!username || !password) { toast('Username et mot de passe requis', 'error', '⚠'); return; }

  const res = await apiFetch(`${API}/auth/register/`, {
    method: 'POST',
    body: JSON.stringify({ username, password, first_name:firstName, last_name:lastName, role })
  });

  if (res?.ok) {
    document.getElementById('modal-create-user')?.classList.remove('open');
    toast('Utilisateur créé', 'success', '✅');
    renderUsersAdmin();
  } else {
    const err = await res?.json();
    toast(err?.detail || 'Erreur création', 'error', '⚠');
  }
}

function openLinkMemberModal(userId, username) {
  const memberOptions = D.members.map(m =>
    `<option value="${m.id}">${m.name} (${m.initials})</option>`
  ).join('');

  const content = `
    <div class="modal-title">
      <span>Lier @${username} à un membre</span>
      <button class="modal-close" onclick="document.getElementById('modal-link-member').classList.remove('open')">×</button>
    </div>
    <div class="form-group">
      <label class="form-label">Membre d'équipe</label>
      <select id="link-member-sel" class="sel">
        <option value="">— Sélectionner —</option>
        ${memberOptions}
      </select>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-link-member').classList.remove('open')">Annuler</button>
      <button class="btn btn-primary" onclick="linkMember(${userId})">Lier</button>
    </div>
  `;

  let modal = document.getElementById('modal-link-member');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-link-member';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal">${content}</div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  } else {
    modal.querySelector('.modal').innerHTML = content;
  }
  modal.classList.add('open');
}

async function linkMember(userId) {
  const memberId = document.getElementById('link-member-sel')?.value;
  if (!memberId) { toast('Sélectionne un membre', 'error', '⚠'); return; }

  const res = await apiFetch(`${API}/users/${userId}/role/`, {
    method: 'PATCH',
    body:   JSON.stringify({ member_id: parseInt(memberId) })
  });

  if (res?.ok) {
    document.getElementById('modal-link-member')?.classList.remove('open');
    toast('Membre lié avec succès', 'success', '✅');
    renderUsersAdmin();
  } else {
    toast('Erreur lors de la liaison', 'error', '⚠');
  }
}


// ══════════════════════════════════════════
// 4. MATRICE SWOT INTELLIGENTE
// ══════════════════════════════════════════

let currentSwotProjectId = null;
let currentSwotData      = null;

/**
 * Ouvre la modal SWOT pour un projet donné
 */
async function openSWOT(projectId) {
  currentSwotProjectId = projectId;
  const project = D.projects.find(p => p.id == projectId);
  if (!project) return;

  // Créer la modal SWOT si elle n'existe pas
  if (!document.getElementById('modal-swot')) {
    const modal = document.createElement('div');
    modal.id = 'modal-swot';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'z-index:600';
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    modal.innerHTML = `<div class="modal" style="max-width:780px;width:100%"><div id="swot-content">Chargement...</div></div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('modal-swot').classList.add('open');
  document.getElementById('swot-content').innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--text3)">
      <div class="app-loading-spinner" style="margin:0 auto 12px"></div>
      Génération de la matrice SWOT…
    </div>`;

  try {
    const res = await apiFetch(`${API}/projects/${projectId}/swot/`);
    if (res?.ok) {
      currentSwotData = await res.json();
      renderSWOTModal(project, currentSwotData);
    }
  } catch(e) {
    // Fallback : SWOT local si pas d'API
    currentSwotData = generateLocalSWOT(project);
    renderSWOTModal(project, currentSwotData);
  }
}

/**
 * Génère un SWOT localement (fallback sans API)
 */
function generateLocalSWOT(project) {
  const wi       = D.workItems.filter(w => w.project == project.id);
  const bugs     = wi.filter(w => w.type === 'bug' && w.status !== 'Terminé').length;
  const done     = wi.filter(w => w.status === 'Terminé').length;
  const highPrio = wi.filter(w => w.priority === 'Haute' && w.status === 'Backlog').length;
  const progress = project.progress || 0;
  const members  = (project.members_detail || []).length;
  const now      = new Date();
  const daysLeft = project.deadline ? Math.floor((new Date(project.deadline) - now) / 86400000) : null;

  const s = [];
  if (progress >= 70) s.push(`Avancement solide : ${progress}% complété`);
  if (members >= 3)   s.push(`Équipe mobilisée : ${members} membres`);
  if (done > 0)       s.push(`${done} tâches livrées avec succès`);
  if (bugs === 0)     s.push('Aucun bug ouvert — qualité maîtrisée');
  if (s.length === 0) s.push('Projet structuré avec équipe dédiée');

  const w = [];
  if (progress < 30)  w.push(`Avancement faible : ${progress}%`);
  if (bugs >= 2)      w.push(`${bugs} bugs non résolus`);
  if (highPrio >= 3)  w.push(`${highPrio} items haute priorité en attente`);
  if (members < 2)    w.push('Équipe réduite — risque de surcharge');
  if (!project.deadline) w.push('Pas de deadline définie');
  if (w.length === 0) w.push('Points d\'amélioration à identifier');

  const o = [];
  if (project.category === 'GIS') o.push('Forte demande en SIG en Afrique centrale');
  if (project.category === 'IT')  o.push('Digitalisation croissante des institutions');
  o.push('Visibilité KICEKO auprès des partenaires');
  if (daysLeft && daysLeft > 30)  o.push('Marge temporelle pour ajuster la stratégie');

  const t = [];
  if (daysLeft !== null) {
    if (daysLeft < 0)   t.push(`Deadline dépassée de ${Math.abs(daysLeft)} jours`);
    else if (daysLeft <= 7) t.push(`Deadline dans ${daysLeft} jours`);
  }
  if (bugs >= 3) t.push('Accumulation de bugs — dette technique');
  t.push('Contraintes budgétaires des partenaires');

  return {
    project: project.id,
    project_name: project.name,
    project_status: project.status,
    project_progress: project.progress,
    strengths: s.slice(0,5),
    weaknesses: w.slice(0,5),
    opportunities: o.slice(0,5),
    threats: t.slice(0,5),
    auto_generated: true,
  };
}

/**
 * Rendu de la modal SWOT
 */
function renderSWOTModal(project, swot) {
  const canEdit = canDo('canEdit');
  const isAdmin = getUserRole() !== 'member';

  const quadrants = [
    {
      key:   'strengths',
      label: 'Forces',
      icon:  '💪',
      color: 'var(--green)',
      bg:    'var(--greenbg)',
      items: swot.strengths || [],
      desc:  'Avantages internes'
    },
    {
      key:   'weaknesses',
      label: 'Faiblesses',
      icon:  '⚠️',
      color: 'var(--orange)',
      bg:    'var(--orangebg)',
      items: swot.weaknesses || [],
      desc:  'Points à améliorer'
    },
    {
      key:   'opportunities',
      label: 'Opportunités',
      icon:  '🚀',
      color: 'var(--blue)',
      bg:    'var(--bluebg)',
      items: swot.opportunities || [],
      desc:  'Facteurs externes favorables'
    },
    {
      key:   'threats',
      label: 'Menaces',
      icon:  '🔴',
      color: 'var(--red)',
      bg:    'var(--redbg)',
      items: swot.threats || [],
      desc:  'Risques externes'
    },
  ];

  document.getElementById('swot-content').innerHTML = `
    <!-- Header -->
    <div class="modal-title" style="margin-bottom:0">
      <div>
        <div style="font-size:15px;font-weight:700">🧠 Matrice SWOT — ${project.name}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          ${swot.auto_generated ? '⚡ Générée automatiquement depuis les données du projet' : '✏️ Modifiée manuellement'}
          · Sync ${swot.last_sync ? fd(swot.last_sync) : 'Maintenant'}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${isAdmin ? `
          <button class="btn btn-outline btn-sm" onclick="regenerateSWOT()" title="Régénérer depuis les données">
            🔄 Sync
          </button>
          <button class="btn btn-outline btn-sm" onclick="editSWOTMode()" title="Modifier manuellement">
            ✏️ Éditer
          </button>` : ''}
        <button class="modal-close" onclick="document.getElementById('modal-swot').classList.remove('open')">×</button>
      </div>
    </div>

    <!-- Indicateur de santé du projet -->
    <div style="margin:14px 0;padding:10px 14px;background:var(--surface);border-radius:8px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:${STATUS_COLORS[project.status]||'var(--text3)'}"></div>
        <span style="font-size:12px;font-weight:600">${project.status}</span>
      </div>
      <div style="flex:1;min-width:150px">
        <div class="progress-wrap" style="margin:0"><div class="progress-bar" style="width:${project.progress||0}%"></div></div>
      </div>
      <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--accent)">${project.progress||0}%</div>
      ${project.deadline ? `<div style="font-size:11px;color:var(--text3);font-family:var(--mono)">📅 ${fd(project.deadline)}</div>` : ''}
    </div>

    <!-- Grille SWOT 2x2 -->
    <div id="swot-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${quadrants.map(q => `
        <div style="background:${q.bg};border:1px solid var(--border);border-radius:10px;padding:14px;min-height:160px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="font-size:16px">${q.icon}</span>
            <div>
              <div style="font-size:13px;font-weight:700;color:${q.color}">${q.label}</div>
              <div style="font-size:10px;color:var(--text3)">${q.desc}</div>
            </div>
          </div>
          <div id="swot-${q.key}-list">
            ${q.items.length ? q.items.map((item, i) => `
              <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
                <div style="width:5px;height:5px;border-radius:50%;background:${q.color};flex-shrink:0;margin-top:6px"></div>
                <div style="font-size:11.5px;line-height:1.5;color:var(--text2)">${item}</div>
              </div>`).join('') :
              `<div style="font-size:11px;color:var(--text3);font-style:italic">Aucun élément</div>`}
          </div>
        </div>`).join('')}
    </div>

    <!-- Notes -->
    ${swot.notes ? `
      <div style="margin-top:10px;padding:10px 14px;background:var(--surface);border-radius:8px;border-left:3px solid var(--accent)">
        <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:4px;letter-spacing:1px">NOTES</div>
        <div style="font-size:12px;color:var(--text2)">${swot.notes}</div>
      </div>` : ''}

    <!-- Footer actions -->
    <div class="form-actions" style="margin-top:14px">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-swot').classList.remove('open')">Fermer</button>
      <button class="btn btn-outline btn-sm" onclick="exportSWOT()">⬇️ Exporter</button>
    </div>
  `;
}

async function regenerateSWOT() {
  if (!currentSwotProjectId) return;
  const btn = document.querySelector('[onclick="regenerateSWOT()"]');
  if (btn) btn.textContent = '⏳ Syncing...';

  try {
    const res = await apiFetch(`${API}/projects/${currentSwotProjectId}/swot_regenerate/`, { method:'POST' });
    if (res?.ok) {
      currentSwotData = await res.json();
      const project = D.projects.find(p => p.id == currentSwotProjectId);
      renderSWOTModal(project, currentSwotData);
      toast('SWOT régénéré depuis les données du projet', 'success', '🧠');
    }
  } catch(e) {
    const project = D.projects.find(p => p.id == currentSwotProjectId);
    currentSwotData = generateLocalSWOT(project);
    renderSWOTModal(project, currentSwotData);
    toast('SWOT calculé localement', 'info', '✅');
  }
}

function editSWOTMode() {
  const swot = currentSwotData;
  if (!swot) return;
  const project = D.projects.find(p => p.id == currentSwotProjectId);

  const quadrants = [
    { key:'strengths',     label:'💪 Forces',       items: swot.strengths },
    { key:'weaknesses',    label:'⚠️ Faiblesses',   items: swot.weaknesses },
    { key:'opportunities', label:'🚀 Opportunités', items: swot.opportunities },
    { key:'threats',       label:'🔴 Menaces',      items: swot.threats },
  ];

  document.getElementById('swot-content').innerHTML = `
    <div class="modal-title">
      <span>✏️ Modifier SWOT — ${project.name}</span>
      <button class="modal-close" onclick="document.getElementById('modal-swot').classList.remove('open')">×</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      ${quadrants.map(q => `
        <div class="form-group" style="margin:0">
          <label class="form-label">${q.label}</label>
          <textarea id="swot-edit-${q.key}" class="form-input" rows="5" style="resize:vertical">${(q.items||[]).join('\n')}</textarea>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">Un élément par ligne</div>
        </div>`).join('')}
    </div>
    <div class="form-group" style="margin-top:12px">
      <label class="form-label">Notes</label>
      <textarea id="swot-edit-notes" class="form-input" rows="2">${swot.notes||''}</textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="openSWOT(${currentSwotProjectId})">Annuler</button>
      <button class="btn btn-primary" onclick="saveSWOTEdits()">💾 Sauvegarder</button>
    </div>
  `;
}

async function saveSWOTEdits() {
  const toList = id => (document.getElementById(id)?.value||'').split('\n').filter(l=>l.trim());
  const payload = {
    strengths:     toList('swot-edit-strengths'),
    weaknesses:    toList('swot-edit-weaknesses'),
    opportunities: toList('swot-edit-opportunities'),
    threats:       toList('swot-edit-threats'),
    notes:         document.getElementById('swot-edit-notes')?.value || '',
  };

  try {
    const res = await apiFetch(`${API}/projects/${currentSwotProjectId}/swot_update/`, {
      method: 'PATCH',
      body:   JSON.stringify(payload)
    });
    if (res?.ok) {
      currentSwotData = await res.json();
      const project = D.projects.find(p => p.id == currentSwotProjectId);
      renderSWOTModal(project, currentSwotData);
      toast('SWOT sauvegardé', 'success', '✅');
    }
  } catch(e) {
    // Fallback local
    currentSwotData = { ...currentSwotData, ...payload };
    const project = D.projects.find(p => p.id == currentSwotProjectId);
    renderSWOTModal(project, currentSwotData);
    toast('Sauvegardé localement', 'info', '✅');
  }
}

function exportSWOT() {
  if (!currentSwotData || !currentSwotProjectId) return;
  const project = D.projects.find(p => p.id == currentSwotProjectId);
  const swot    = currentSwotData;
  const now     = new Date().toLocaleDateString('fr-FR');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>SWOT — ${project.name}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 32px; color: #1a1a2e; }
  h1 { color: #1B3A6B; margin-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .quad { padding: 16px; border-radius: 8px; }
  .quad h3 { margin: 0 0 12px; font-size: 15px; }
  .quad ul { margin: 0; padding-left: 18px; }
  .quad li { margin-bottom: 6px; font-size: 13px; }
  .s { background: #f0fdf4; border-left: 4px solid #22c55e; }
  .w { background: #fff7ed; border-left: 4px solid #f97316; }
  .o { background: #eff6ff; border-left: 4px solid #3b82f6; }
  .t { background: #fef2f2; border-left: 4px solid #ef4444; }
  .footer { margin-top: 24px; font-size: 11px; color: #999; text-align: center; }
</style>
</head>
<body>
  <h1>Matrice SWOT — ${project.name}</h1>
  <div class="meta">KICEKO CONSULTANT · Généré le ${now} · Statut : ${project.status} · Avancement : ${project.progress||0}%</div>
  <div class="grid">
    <div class="quad s"><h3>💪 Forces</h3><ul>${(swot.strengths||[]).map(i=>`<li>${i}</li>`).join('')}</ul></div>
    <div class="quad w"><h3>⚠️ Faiblesses</h3><ul>${(swot.weaknesses||[]).map(i=>`<li>${i}</li>`).join('')}</ul></div>
    <div class="quad o"><h3>🚀 Opportunités</h3><ul>${(swot.opportunities||[]).map(i=>`<li>${i}</li>`).join('')}</ul></div>
    <div class="quad t"><h3>🔴 Menaces</h3><ul>${(swot.threats||[]).map(i=>`<li>${i}</li>`).join('')}</ul></div>
  </div>
  <div class="footer">KICEKO CONSULTANT · N'Djamena, Tchad · kiceko-consultant.com</div>
</body></html>`;

  const blob = new Blob([html], { type:'text/html' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `SWOT_${project.name.replace(/\s+/g,'_')}_${now.replace(/\//g,'-')}.html`;
  a.click();
  toast('SWOT exporté', 'success', '⬇️');
}


// ══════════════════════════════════════════
// 5. BOUTON SWOT SUR LES CARTES PROJET
//    Patch de renderProjects() pour ajouter le bouton SWOT
// ══════════════════════════════════════════

const _origRenderProjects = typeof renderProjects === 'function' ? renderProjects : null;
function renderProjects() {
  if (_origRenderProjects) _origRenderProjects();

  // Ajouter bouton SWOT sur chaque carte projet après le rendu
  setTimeout(() => {
    document.querySelectorAll('.proj-card').forEach(card => {
      if (card.querySelector('.swot-btn')) return;
      const onclickAttr = card.getAttribute('onclick') || '';
      const match = onclickAttr.match(/openProjModal\((\d+)\)/);
      if (!match) return;
      const projId = match[1];

      const btn = document.createElement('button');
      btn.className = 'btn btn-outline btn-sm swot-btn';
      btn.style.cssText = 'margin-top:8px;width:100%;justify-content:center;font-size:10px';
      btn.innerHTML = '🧠 Matrice SWOT';
      btn.onclick = (e) => { e.stopPropagation(); openSWOT(projId); };

      const footer = card.querySelector('.proj-footer');
      if (footer) footer.parentElement.appendChild(btn);
    });
  }, 100);
}


// ══════════════════════════════════════════
// 6. INIT — Appeler après loadAll
// ══════════════════════════════════════════

const _origLoadAllRBAC = loadAll;
async function loadAll() {
  await _origLoadAllRBAC();
  initRBAC();
}