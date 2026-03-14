/**
 * members_final.js — KICEKO ProjectHub
 * Solution DÉFINITIVE membres visibles en frontend
 *
 * Utilise /api/team/ qui retourne toujours une liste directe []
 * Sans aucune pagination, sans aucune enveloppe.
 *
 * Charger APRÈS app.js dans index.html :
 * <script src="{% static 'js/members_final.js' %}"></script>
 */

// ══════════════════════════════════════════
// SURCHARGE COMPLÈTE DE loadAll
// ══════════════════════════════════════════
async function loadAll() {
  const loading = document.getElementById('app-loading');
  if (loading) loading.classList.add('active');

  _setLoadingStep(0, '🔐', 'Connexion...');

  try {
    // Chargements parallèles sauf membres (séquentiel pour fiabilité)
    _setLoadingStep(1, '📦', 'Projets...');
    const [projRes, wiRes, tnRes, spRes] = await Promise.allSettled([
      _apiFetch(`${API}/projects/?page_size=200`),
      _apiFetch(`${API}/workitems/?page_size=500`),
      _apiFetch(`${API}/tenders/?page_size=200`),
      _apiFetch(`${API}/sprints/?page_size=100`),
    ]);

    D.projects  = _parseList(projRes.value) || [];
    D.workItems = _parseList(wiRes.value)   || [];
    D.tenders   = _parseList(tnRes.value)   || [];
    D.sprints   = _parseList(spRes.value)   || [];

    // ✅ Membres — endpoint dédié /api/team/
    _setLoadingStep(2, '👥', 'Membres...');
    D.members = await _loadMembersDefinitive();

    // Dashboard stats
    _setLoadingStep(3, '📊', 'Dashboard...');
    try {
      const ds = await _apiFetch(`${API}/dashboard/`);
      dashStats = ds && !Array.isArray(ds) ? ds : null;
    } catch { dashStats = null; }

    _setLoadingStep(4, '✅', 'Prêt !');

    console.log('✅ Données chargées:', {
      projets: D.projects.length,
      membres: D.members.length,
      tickets: D.workItems.length,
    });

    renderSidebar();
    renderPage(currentPage);
    updateChips();

  } catch(e) {
    console.error('❌ loadAll:', e);
    toast('Erreur de chargement', 'error', '⚠');
  } finally {
    const loading = document.getElementById('app-loading');
    if (loading) {
      const bar = document.getElementById('loading-bar-fill');
      if (bar) bar.style.width = '100%';
      setTimeout(() => loading.classList.remove('active'), 400);
    }
  }
}

// ══════════════════════════════════════════
// Chargement membres — DÉFINITIF
// Essaie 4 sources dans l'ordre
// ══════════════════════════════════════════
async function _loadMembersDefinitive() {

  // SOURCE 1 : /api/team/ — endpoint pur, liste directe garantie
  try {
    const res = await fetch(`${API}/team/`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('kh_access')}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`✅ Membres /api/team/ : ${data.length}`);
        return data;
      }
    }
  } catch(e) { console.warn('Source 1 failed:', e.message); }

  // SOURCE 2 : /api/members/ — peut retourner [] ou {results:[]}
  try {
    const res = await fetch(`${API}/members/?page_size=500&format=json`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('kh_access')}` }
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data
                 : Array.isArray(data?.results) ? data.results
                 : null;
      if (list && list.length > 0) {
        console.log(`✅ Membres /api/members/ : ${list.length}`);
        return list;
      }
    }
  } catch(e) { console.warn('Source 2 failed:', e.message); }

  // SOURCE 3 : extraction depuis membres_detail des projets
  const fromProjects = [];
  const seen = new Set();
  D.projects.forEach(p => {
    (p.members_detail || []).forEach(m => {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        fromProjects.push(m);
      }
    });
  });
  if (fromProjects.length > 0) {
    console.log(`✅ Membres extraits des projets : ${fromProjects.length}`);
    return fromProjects;
  }

  // SOURCE 4 : retry après 2 secondes (cold start Render)
  console.warn('⚠️ Membres vides — retry dans 2s...');
  await new Promise(r => setTimeout(r, 2000));
  try {
    const res = await fetch(`${API}/team/`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('kh_access')}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`✅ Membres retry : ${data.length}`);
        return data;
      }
    }
  } catch(e) { console.warn('Source 4 failed:', e.message); }

  console.error('❌ Aucun membre chargé après 4 tentatives');
  return [];
}

// ══════════════════════════════════════════
// Helpers internes
// ══════════════════════════════════════════
async function _apiFetch(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('kh_access')}`
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function _parseList(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return null;
}

function _setLoadingStep(idx, icon, msg) {
  const steps = 5;
  const elIcon = document.getElementById('loading-step-icon');
  const elMsg  = document.getElementById('loading-step-msg');
  const elBar  = document.getElementById('loading-bar-fill');
  if (elIcon) elIcon.textContent = icon;
  if (elMsg)  elMsg.textContent  = msg;
  if (elBar)  elBar.style.width  = ((idx + 1) / steps * 100) + '%';
}

// ══════════════════════════════════════════
// Remplace saveMember pour utiliser /api/team/create/
// ══════════════════════════════════════════
async function saveMember() {
  const name     = document.getElementById('mem-name')?.value.trim();
  const role     = document.getElementById('mem-role')?.value || '';
  const initials = document.getElementById('mem-init')?.value || name?.substring(0,2) || 'XX';
  const color    = document.getElementById('mem-color')?.value || '#0eb5cc';

  if (!name) { toast('Le nom est obligatoire', 'error', '⚠'); return; }

  try {
    const res = await fetch(`${API}/team/create/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('kh_access')}`
      },
      body: JSON.stringify({ name, role, initials: initials.toUpperCase(), color })
    });

    if (res.ok) {
      const membre = await res.json();
      // Ajouter directement dans D.members sans recharger toute la page
      D.members.push(membre);
      document.getElementById('modal-member')?.classList.remove('open');
      // Réinitialiser le formulaire
      ['mem-name','mem-role','mem-init'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      renderTeamFixed();  // Re-render immédiat
      toast(`${membre.name} ajouté`, 'success', '✅');
    } else {
      const err = await res.json();
      toast(err.detail || 'Erreur création membre', 'error', '⚠');
    }
  } catch(e) {
    toast('Erreur réseau', 'error', '⚠');
  }
}

// ══════════════════════════════════════════
// renderTeam corrigé avec == loose
// ══════════════════════════════════════════
function renderTeamFixed() {
  const grid = document.getElementById('team-grid');
  if (!grid) return;

  if (!D.members.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px">
        <div style="font-size:40px;margin-bottom:12px;opacity:.3">👥</div>
        <div style="font-size:14px;color:var(--text3);margin-bottom:16px">
          Aucun membre d'équipe
        </div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="btn btn-primary btn-sm" onclick="om('modal-member')">
            ＋ Ajouter un membre
          </button>
          <button class="btn btn-outline btn-sm"
            onclick="_loadMembersDefinitive().then(m=>{D.members=m;renderTeamFixed();})">
            🔄 Recharger
          </button>
        </div>
      </div>`;
    return;
  }

  grid.innerHTML = D.members.map(m => {
    const color  = m.color || '#0eb5cc';
    const inits  = m.initials || (m.name||'??').substring(0,2).toUpperCase();
    // == loose : PostgreSQL retourne int, JS peut avoir string
    const active = D.workItems.filter(w => w.assignee == m.id && w.status === 'En cours').length;
    const done   = D.workItems.filter(w => w.assignee == m.id && w.status === 'Terminé').length;
    const projs  = new Set(D.workItems.filter(w => w.assignee == m.id && w.project).map(w=>w.project)).size;

    return `
      <div class="member-card">
        <div class="member-head">
          <div class="av" style="width:46px;height:46px;font-size:15px;
               background:${color};color:#fff;flex-shrink:0">${inits}</div>
          <div>
            <div class="member-name">${m.name}</div>
            <div class="member-role">${m.role || 'Membre KICEKO'}</div>
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

// Enregistrer renderTeam → pointe vers la version corrigée
// (override la fonction originale de app.js)
const renderTeam = renderTeamFixed;

// ══════════════════════════════════════════
// Bouton recharger membres (utilisé dans la page)
// ══════════════════════════════════════════
async function _reloadMembers() {
  toast('Rechargement...', 'info', '🔄');
  const members = await _loadMembersDefinitive();
  if (members.length > 0) {
    D.members = members;
    renderTeamFixed();
    toast(`${members.length} membre(s) chargé(s)`, 'success', '✅');
  } else {
    toast('Toujours vide — vérifiez /admin/ → Members', 'error', '⚠');
  }
}

console.log('✅ members_final.js — endpoint /api/team/ actif');
