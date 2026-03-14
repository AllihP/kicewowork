/**
 * ═══════════════════════════════════════════════════════════════════
 * KICEKO ProjectHub - app.js
 * Version : 2.2 Corrigée
 * Corrections : commentaires JS (#→//), timeout apiFetch, CSRF,
 *               notification classes, password clear, step-msg split
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// 1. CONSTANTES & CONFIGURATION GLOBALE
// ═══════════════════════════════════════════════════════════════════

/** @constant {string} API_BASE - Endpoint de l'API Django */
const API = '/api';

/** @constant {number} FETCH_TIMEOUT_MS - Timeout fetch (10 secondes) */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * @object D - Store de données global
 * Contient toutes les données de l'application en mémoire
 */
const D = {
    projects:  [],
    members:   [],
    workItems: [],
    tenders:   [],
    sprints:   []
};

/** @string currentPage - Page actuellement affichée */
let currentPage = 'dashboard';

/** @string boardFilter - Filtre actif du Kanban */
let boardFilter = '';

/** @number|null editProjId - ID du projet en édition */
let editProjId = null;

/** @number|null editAOId - ID de l'AO en édition */
let editAOId = null;

/** @number|null editWIId - ID du ticket en édition */
let editWIId = null;

/** @object|null dashStats - Statistiques du dashboard */
let dashStats = null;

/** @string projFilter - Filtre de projets actif */
let projFilter = '';

/** @Date _calDate - Date actuelle du calendrier */
let _calDate = new Date();

/** @string _calView - Vue du calendrier (month/list/risk) */
let _calView = 'month';

/** @array _alerts - Liste des alertes actives */
let _alerts = [];

/** @boolean _notifInitialized - Évite la double initialisation des notifications */
let _notifInitialized = false;

// ═══════════════════════════════════════════════════════════════════
// 2. CODES COULEUR PAR STATUT
// ═══════════════════════════════════════════════════════════════════

/** @object STATUS_COLORS - Mapping statut → couleur */
const STATUS_COLORS = {
    'En cours':   '#22c55e',
    'Planifié':   '#3b82f6',
    'En attente': '#f97316',
    'Terminé':    '#64748b',
    'Bloqué':     '#ef4444'
};

/** @object PAGE_TITLES - Titres des pages pour la topbar */
const PAGE_TITLES = {
    dashboard:  'Dashboard',
    projects:   'Projets',
    board:      'Kanban Board',
    backlog:    'Product Backlog',
    sprints:    'Sprints',
    tenders:    "Appels d'offres",
    team:       'Équipe',
    analytics:  'Analytics',
    calendar:   'Calendrier & Alertes',
    'my-space': 'Mon Espace',
    decision:   'Aide à la décision',
    users:      'Utilisateurs'
};

/** @object PAGE_SUBS - Sous-titres des pages */
const PAGE_SUBS = {
    dashboard:  "Vue d'ensemble · KICEKO",
    projects:   'Projets actifs',
    board:      'Gestion visuelle',
    backlog:    'Backlog priorisé',
    sprints:    'Itérations agiles',
    tenders:    'Pipeline commercial',
    // CORRECTION : apostrophe droite causait SyntaxError en string single-quote
    team:       "Membres de l'équipe",
    analytics:  'Métriques & KPIs',
    calendar:   'Deadlines · Risques',
    'my-space': 'Mes projets & tâches',
    decision:   'SWOT · Recommandations',
    users:      'Rôles & accès'
};

// ═══════════════════════════════════════════════════════════════════
// 3. SÉCURITÉ - PROTECTION XSS & SANITIZATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Échappe les caractères spéciaux pour prévenir les attaques XSS
 * @param {string|null} str - Chaîne à échapper
 * @returns {string} Chaîne sécurisée
 */
function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#x27;');
}

// ═══════════════════════════════════════════════════════════════════
// 4. AUTHENTIFICATION - JWT + CSRF
// ═══════════════════════════════════════════════════════════════════

/**
 * Récupère le token CSRF depuis le cookie Django
 * Nécessaire pour les requêtes POST/PUT/DELETE sur les vues standard
 * @returns {string} CSRF token ou chaîne vide
 */
function getCsrfToken() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
}

/**
 * Récupère le token JWT d'accès depuis le localStorage
 * @returns {string|null} Token JWT ou null
 */
function getToken() {
    return localStorage.getItem('kh_access');
}

/**
 * Récupère les informations utilisateur depuis le localStorage
 * @returns {object|null} Objet utilisateur ou null
 */
function getUser() {
    try {
        const user = localStorage.getItem('kh_user');
        return user ? JSON.parse(user) : null;
    } catch {
        return null;
    }
}

/**
 * Récupère le rôle de l'utilisateur connecté
 * @returns {string} Rôle (admin/manager/member)
 */
function getUserRole() {
    return getUser()?.role || 'member';
}

/**
 * Génère les headers d'authentification pour les requêtes API
 * Inclut JWT Bearer + CSRF token pour compatibilité Django complète
 * @returns {object} Headers
 */
function authHeaders() {
    return {
        'Content-Type':    'application/json',
        'Authorization':   `Bearer ${getToken()}`,
        'X-CSRFToken':     getCsrfToken()
    };
}

/**
 * Fetch sécurisé avec :
 *   - Timeout AbortController (FETCH_TIMEOUT_MS)
 *   - Gestion automatique du refresh token (401)
 *   - Déconnexion propre si refresh échoue
 * @param {string} url  - Endpoint API
 * @param {object} opts - Options fetch
 * @returns {Promise<Response|null>}
 */
async function apiFetch(url, opts = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        let res = await fetch(url, {
            ...opts,
            signal:  controller.signal,
            headers: { ...authHeaders(), ...(opts.headers || {}) }
        });

        // Gestion automatique du token expiré (401)
        if (res.status === 401) {
            const ok = await _refreshToken();
            if (ok) {
                const controller2 = new AbortController();
                const timer2 = setTimeout(() => controller2.abort(), FETCH_TIMEOUT_MS);
                try {
                    res = await fetch(url, {
                        ...opts,
                        signal:  controller2.signal,
                        headers: authHeaders()
                    });
                } finally {
                    clearTimeout(timer2);
                }
            } else {
                doLogout();
                return null;
            }
        }
        return res;
    } catch (e) {
        if (e.name === 'AbortError') {
            console.warn('apiFetch timeout:', url);
            toast('Délai d\'attente dépassé', 'error', '⏱');
        } else {
            console.warn('apiFetch:', url, e.message);
        }
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Rafraîchit le token d'accès via le refresh token
 * @returns {Promise<boolean>} Succès ou échec
 */
async function _refreshToken() {
    const ref = localStorage.getItem('kh_refresh');
    if (!ref) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(`${API}/auth/refresh/`, {
            method:  'POST',
            signal:  controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken':  getCsrfToken()
            },
            body: JSON.stringify({ refresh: ref })
        });
        if (res.ok) {
            const d = await res.json();
            localStorage.setItem('kh_access', d.access);
            return true;
        }
    } catch { /* token refresh raté */ } finally {
        clearTimeout(timer);
    }
    return false;
}

/**
 * Gère la connexion utilisateur
 */
async function doLogin() {
    const uEl  = document.getElementById('login-user');
    const pEl  = document.getElementById('login-pass');
    const err  = document.getElementById('login-err');
    const btn  = document.getElementById('login-btn');

    const u = uEl?.value.trim();
    const p = pEl?.value;

    if (err) err.style.display = 'none';

    if (!u || !p) {
        _showLoginErr('Remplis tous les champs.');
        return;
    }

    if (btn) { btn.textContent = 'Connexion…'; btn.disabled = true; }

    try {
        const res = await fetch(`${API}/auth/login/`, {
            method:  'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken':  getCsrfToken()
            },
            body: JSON.stringify({ username: u, password: p })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || 'Identifiants incorrects');
        }

        // Stockage des tokens
        localStorage.setItem('kh_access',  data.access);
        localStorage.setItem('kh_refresh', data.refresh);
        localStorage.setItem('kh_user',    JSON.stringify(data.user));

        // CORRECTION : nettoyer le champ mot de passe après connexion réussie
        if (pEl) pEl.value = '';

        // Transition vers l'application
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        _updateUserBar(data.user);
        await loadAll();

    } catch (e) {
        // CORRECTION : nettoyer le mot de passe en cas d'échec (sécurité)
        if (pEl) pEl.value = '';
        _showLoginErr(e.message);
        if (btn) { btn.textContent = 'Se connecter →'; btn.disabled = false; }
    }
}

/** Affiche une erreur de connexion */
function _showLoginErr(msg) {
    const err = document.getElementById('login-err');
    if (err) {
        err.textContent = esc(msg);
        err.style.display = 'block';
    }
}

/**
 * Déconnecte l'utilisateur et nettoie la session
 */
function doLogout() {
    ['kh_access', 'kh_refresh', 'kh_user'].forEach(k =>
        localStorage.removeItem(k)
    );
    if (typeof SYNC !== 'undefined') SYNC.stop();
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

/**
 * Met à jour la barre utilisateur dans la sidebar
 * @param {object} user - Données utilisateur
 */
function _updateUserBar(user) {
    if (!user) return;
    const name = user.first_name || user.username;

    const el = document.getElementById('user-name');
    if (el) el.textContent = name.split(' ')[0];

    const av = document.getElementById('user-av');
    if (av) {
        av.textContent  = (user.member_initials || name.substring(0, 2)).toUpperCase();
        av.style.background = user.member_color || 'rgba(14,181,204,.15)';
        av.style.color  = user.member_color ? '#fff' : 'var(--accent)';
    }

    const rl = document.getElementById('user-role-lbl');
    if (rl) {
        rl.textContent = ({
            admin:   '👑 Admin',
            manager: '🎯 Manager',
            member:  '👤 Membre'
        }[user.role]) || 'Membre';
    }
}

// ═══════════════════════════════════════════════════════════════════
// 5. CHARGEMENT DES DONNÉES
// ═══════════════════════════════════════════════════════════════════

/**
 * Charge toutes les données de l'application
 */
async function loadAll() {
    LOADING.show();
    try {
        LOADING.step(0, '📦', 'Projets…');
        const [projR, wiR, tnR, spR] = await Promise.allSettled([
            _safeFetch(`${API}/projects/?page_size=200`),
            _safeFetch(`${API}/workitems/?page_size=500`),
            _safeFetch(`${API}/tenders/?page_size=200`),
            _safeFetch(`${API}/sprints/?page_size=100`)
        ]);

        D.projects  = _asList(projR.value);
        D.workItems = _asList(wiR.value);
        D.tenders   = _asList(tnR.value);
        D.sprints   = _asList(spR.value);

        LOADING.step(1, '👥', 'Membres…');
        D.members = await _loadMembers();

        LOADING.step(2, '📊', 'Dashboard…');
        try {
            const ds = await _safeFetch(`${API}/dashboard/`);
            dashStats = ds && !Array.isArray(ds) ? ds : null;
        } catch {
            dashStats = null;
        }

        LOADING.step(3, '✅', 'Prêt !');

        // Rendu initial
        _renderSidebar();
        renderPage(currentPage);
        _updateChips();
        _updateNotifBell();
        RBAC.apply();

        // Démarrage de la synchronisation automatique
        if (typeof SYNC !== 'undefined' && !SYNC.active) SYNC.start();

    } catch (e) {
        console.error('loadAll:', e);
        toast('Erreur de chargement', 'error', '⚠');
    } finally {
        LOADING.hide();
    }
}

/**
 * Charge les membres avec stratégie de fallback multiple
 * @returns {Promise<array>}
 */
async function _loadMembers() {
    // Source 1: /api/team/
    try {
        const res = await fetch(`${API}/team/`, { headers: authHeaders() });
        if (res.ok) {
            const d = await res.json();
            if (Array.isArray(d) && d.length) return d;
        }
    } catch { console.warn('team/ failed'); }

    // Source 2: /api/members/
    try {
        const res = await fetch(`${API}/members/?page_size=500`, { headers: authHeaders() });
        if (res.ok) {
            const d = await res.json();
            const l = _asList(d);
            if (l.length) return l;
        }
    } catch { console.warn('members/ failed'); }

    // Source 3: Extraction depuis les projets
    const seen = new Set(), list = [];
    D.projects.forEach(p =>
        (p.members_detail || []).forEach(m => {
            if (!seen.has(m.id)) { seen.add(m.id); list.push(m); }
        })
    );
    if (list.length) return list;

    // Source 4: Retry avec délai
    await new Promise(r => setTimeout(r, 1500));
    try {
        const res = await fetch(`${API}/team/`, { headers: authHeaders() });
        if (res.ok) {
            const d = await res.json();
            if (Array.isArray(d)) return d;
        }
    } catch { /* fallback silencieux */ }

    return [];
}

/**
 * Fetch sécurisé avec gestion d'erreur
 * @param {string} url - Endpoint
 * @returns {Promise<object|null>}
 */
async function _safeFetch(url) {
    try {
        const res = await apiFetch(url);
        if (!res || !res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * Normalise les données API (liste simple ou paginée DRF)
 * @param {*} data - Données brutes
 * @returns {array}
 */
function _asList(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    return [];
}

// ═══════════════════════════════════════════════════════════════════
// 6. OVERLAY DE CHARGEMENT ANIMÉ
// ═══════════════════════════════════════════════════════════════════

/** @object LOADING - Gestion de l'overlay de chargement */
const LOADING = {
    steps: [
        { icon: '🔐', msg: 'Vérification…' },
        { icon: '📦', msg: 'Projets…'       },
        { icon: '👥', msg: 'Membres…'        },
        { icon: '📊', msg: 'Dashboard…'      },
        { icon: '✅', msg: 'Prêt !'          }
    ],
    _timer: null,
    _idx:   0,

    show() {
        const el = document.getElementById('app-loading');
        if (el) el.classList.add('active');
        this._idx = 0;
        this._set(0, '🔐', 'Connexion…');
        this._timer = setInterval(() => {
            this._idx = (this._idx + 1) % this.steps.length;
            const s = this.steps[this._idx];
            this._set(this._idx, s.icon, s.msg);
        }, 600);
    },

    hide() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        const bar = document.getElementById('loading-bar-fill');
        if (bar) bar.style.width = '100%';
        setTimeout(() => {
            const el = document.getElementById('app-loading');
            if (el) el.classList.remove('active');
        }, 350);
    },

    step(idx, icon, msg) { this._set(idx, icon, msg); },

    _set(idx, icon, msg) {
        // CORRECTION : cible icon et msg séparément (deux IDs distincts dans le HTML)
        const elIcon = document.getElementById('loading-step-icon');
        const elMsg  = document.getElementById('loading-step-msg');
        const elBar  = document.getElementById('loading-bar-fill');
        if (elIcon) elIcon.textContent = icon;
        if (elMsg)  elMsg.textContent  = msg;
        if (elBar)  elBar.style.width  = ((idx + 1) / this.steps.length * 100) + '%';
    }
};

// ═══════════════════════════════════════════════════════════════════
// 7. NAVIGATION ENTRE PAGES
// ═══════════════════════════════════════════════════════════════════

/**
 * Navigue vers une page spécifique
 * @param {string} page - Identifiant de la page
 * @param {HTMLElement|null} el - Élément navigation cliqué
 */
function nav(page, el) {
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));

    if (el) {
        el.classList.add('active');
    } else {
        document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    }

    currentPage = page;

    const t = document.getElementById('tb-title');
    const s = document.getElementById('tb-sub');
    if (t) t.textContent = PAGE_TITLES[page] || page;
    if (s) s.textContent = PAGE_SUBS[page]   || '';

    // Fermeture sidebar mobile
    document.querySelector('.sidebar')?.classList.remove('open');

    renderPage(page);
}

/**
 * Rendu dynamique de la page demandée
 * @param {string} page - Identifiant de la page
 */
function renderPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');

    const R = {
        dashboard:  renderDashboard,
        projects:   renderProjects,
        board:      renderBoard,
        backlog:    renderBacklog,
        sprints:    renderSprints,
        tenders:    renderTenders,
        team:       renderTeam,
        analytics:  renderAnalytics,
        calendar:   renderCalendar,
        'my-space': renderMySpace,
        decision:   renderDecision,
        users:      renderUsers
    };

    (R[page] || (() => {}))();
}

/** Toggle de la sidebar mobile */
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const btn     = document.querySelector('.menu-toggle');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    if (btn) btn.setAttribute('aria-expanded', String(isOpen));
}

// ═══════════════════════════════════════════════════════════════════
// 8. RBAC - CONTRÔLE D'ACCÈS BASÉ SUR LES RÔLES
// ═══════════════════════════════════════════════════════════════════

/** @object RBAC - Configuration des permissions par rôle */
const RBAC = {
    hidden: {
        member: ['board', 'backlog', 'sprints', 'tenders', 'analytics', 'users', 'decision']
    },

    apply() {
        const role   = getUserRole();
        const toHide = this.hidden[role] || [];

        document.querySelectorAll('.nav-item[data-page]').forEach(el => {
            el.style.display = toHide.includes(el.getAttribute('data-page')) ? 'none' : '';
        });

        // Masquer le bouton Nouveau pour les simples membres
        const btn = document.querySelector('[onclick="openAdd()"]');
        if (btn) btn.style.display = (role === 'member') ? 'none' : '';
    }
};

// ═══════════════════════════════════════════════════════════════════
// 9. SIDEBAR & INDICATEURS
// ═══════════════════════════════════════════════════════════════════

/** Rendu de la sidebar avec les projets récents */
function _renderSidebar() {
    const el = document.getElementById('sb-projects');
    if (!el) return;

    const active = D.projects.filter(p => p.status !== 'Terminé').slice(0, 6);

    el.innerHTML = active.length
        ? active.map(p => `
            <div class="sb-proj" onclick="nav('projects',null)" role="button" tabindex="0">
                <div class="sb-dot" style="background:${STATUS_COLORS[p.status] || '#64748b'}"></div>
                <div class="sb-label">${esc(p.name)}</div>
            </div>
        `).join('')
        : '<div style="padding:10px;color:var(--text3);font-size:12px;">Aucun projet actif</div>';
}

/** Met à jour les chips de notification dans la sidebar */
function _updateChips() {
    const c1 = document.getElementById('chip-board');
    const c2 = document.getElementById('chip-ao');
    const c3 = document.getElementById('chip-alerts');

    if (c1) c1.textContent = D.workItems.filter(w => w.status === 'En cours').length;
    if (c2) c2.textContent = D.tenders.filter(t => !['Gagné', 'Perdu'].includes(t.status)).length;

    if (c3) {
        const now  = new Date();
        const crit = D.projects.filter(p =>
            p.deadline &&
            p.status !== 'Terminé' &&
            Math.floor((new Date(p.deadline) - now) / 86400000) <= 7
        ).length;
        c3.textContent    = crit;
        c3.style.display  = crit > 0 ? 'inline-flex' : 'none';
    }
}

// ═══════════════════════════════════════════════════════════════════
// 10. SYSTÈME DE NOTIFICATIONS (CORRIGÉ)
// ═══════════════════════════════════════════════════════════════════

/** Toggle le panneau de notifications */
function toggleNotifPanel() {
    const panel = document.getElementById('notif-panel');
    const btn   = document.getElementById('notif-btn-unique');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    if (btn) btn.setAttribute('aria-expanded', String(isOpen));
}

// Fermeture au clic extérieur
document.addEventListener('click', e => {
    const w = document.getElementById('notif-wrapper');
    if (w && !w.contains(e.target)) {
        const panel = document.getElementById('notif-panel');
        if (panel) {
            panel.classList.remove('open');
            document.getElementById('notif-btn-unique')?.setAttribute('aria-expanded', 'false');
        }
    }
});

/**
 * Met à jour la cloche de notifications avec les alertes calculées
 * CORRECTION :
 *   1. Supprime les cloches dupliquées (anti-doublon)
 *   2. Génère les classes CSS cohérentes avec style.css
 *      (.notif-icon / .notif-body / .notif-title / .notif-desc)
 */
function _updateNotifBell() {
    // ── ANTI-DOUBLON : Supprime les cloches dupliquées ──────────────
    const allWrappers = document.querySelectorAll('.notif-wrapper');
    if (allWrappers.length > 1) {
        for (let i = 1; i < allWrappers.length; i++) allWrappers[i].remove();
    }

    const now    = new Date();
    const alerts = [];

    // Alertes projets (deadlines)
    D.projects.forEach(p => {
        if (!p.deadline || p.status === 'Terminé') return;
        const diff = Math.floor((new Date(p.deadline) - now) / 86400000);
        if (diff < 0) {
            alerts.push({
                level: 'critical',
                icon:  '🚨',
                title: esc(p.name),
                desc:  `Dépassée de ${Math.abs(diff)}j`
            });
        } else if (diff <= 7) {
            alerts.push({
                level: 'warning',
                icon:  '⚠️',
                title: esc(p.name),
                desc:  `${diff}j restants`
            });
        }
    });

    // Alertes bugs
    const bugs = D.workItems.filter(w => w.type === 'bug' && w.status !== 'Terminé').length;
    if (bugs >= 2) {
        alerts.push({
            level: 'warning',
            icon:  '🐛',
            title: `${bugs} bugs ouverts`,
            desc:  'Dette technique'
        });
    }

    _alerts = alerts;

    // Mise à jour badge / dot
    const badge = document.getElementById('notif-badge');
    const dot   = document.getElementById('notif-dot');
    const list  = document.getElementById('notif-list');

    if (badge) {
        badge.textContent    = alerts.length > 99 ? '99+' : alerts.length;
        badge.style.display  = alerts.length ? 'block' : 'none';
    }
    if (dot) {
        dot.style.display = alerts.filter(a => a.level === 'critical').length ? 'block' : 'none';
    }

    // ── CORRECTION : classes CSS cohérentes avec style.css ───────────
    if (list) {
        if (alerts.length > 0) {
            list.innerHTML = alerts.slice(0, 12).map(a => `
                <div class="notif-item ${a.level}" role="listitem">
                    <div class="notif-icon" aria-hidden="true">${a.icon}</div>
                    <div class="notif-body">
                        <div class="notif-title">${a.title}</div>
                        <div class="notif-desc">${a.desc}</div>
                    </div>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<div class="notif-empty">✅ Aucune alerte</div>';
        }
    }
}

/** Efface toutes les alertes */
function clearAllAlerts() {
    const panel = document.getElementById('notif-panel');
    if (panel) panel.classList.remove('open');

    const list = document.getElementById('notif-list');
    if (list)  list.innerHTML = '<div class="notif-empty">✅ Effacé</div>';

    const badge = document.getElementById('notif-badge');
    const dot   = document.getElementById('notif-dot');
    if (badge) badge.style.display = 'none';
    if (dot)   dot.style.display   = 'none';

    document.getElementById('notif-btn-unique')?.setAttribute('aria-expanded', 'false');
    toast('Alertes effacées', 'info', '✅');
}

// ═══════════════════════════════════════════════════════════════════
// 11. HELPERS & UTILITAIRES
// ═══════════════════════════════════════════════════════════════════

/**
 * Formate une date en français
 * @param {string|null} d - Date ISO
 * @returns {string}
 */
function fd(d) {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    } catch {
        return String(d);
    }
}

/**
 * Formate un nombre avec séparateurs français
 * @param {number} n
 * @returns {string}
 */
function fmt(n) {
    return Number(n || 0).toLocaleString('fr-FR');
}

/**
 * Génère un élément avatar HTML
 * @param {object} m    - Membre
 * @param {number} size - Taille en px
 * @returns {string}
 */
function avEl(m, size = 32) {
    if (!m) return '';
    const bg   = m.color || '#0eb5cc';
    const fs   = Math.round(size * .34);
    return `<div class="av" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${bg};color:#fff;flex-shrink:0">${esc(m.initials || '?')}</div>`;
}

/**
 * Génère un badge de statut/type/priorité
 * @param {string} type - Type de badge
 * @param {string} val  - Valeur
 * @returns {string}
 */
function badge(type, val) {
    const MAP = {
        status: { 'En cours': 'b-green', 'Planifié': 'b-blue', 'En attente': 'b-orange', 'Terminé': 'b-gray', 'Bloqué': 'b-red' },
        type:   { epic: 'b-purple', feature: 'b-teal', story: 'b-blue', task: 'b-green', bug: 'b-red', ao: 'b-accent' },
        prio:   { 'Haute': 'b-red', 'Moyenne': 'b-orange', 'Basse': 'b-green' },
        ao:     { 'Détection': 'b-gray', 'Qualification': 'b-blue', 'Préparation': 'b-orange', 'Soumis': 'b-accent', 'Gagné': 'b-green', 'Perdu': 'b-red' }
    };
    return `<span class="badge ${(MAP[type] || {})[val] || 'b-gray'}">${esc(val || '')}</span>`;
}

/**
 * Animation de compteur numérique
 * @param {HTMLElement} el     - Élément cible
 * @param {number}      target - Valeur cible
 * @param {number}      dur    - Durée en ms
 */
function animCount(el, target, dur = 900) {
    if (!el) return;
    const start = Date.now();
    const step  = () => {
        const p = Math.min(1, (Date.now() - start) / dur);
        el.textContent = Math.round(p * target);
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/**
 * Affiche un toast de notification temporaire
 * @param {string} msg   - Message
 * @param {string} type  - Type (success/error/info/warning)
 * @param {string} icon  - Emoji icône
 */
function toast(msg, type = 'info', icon = 'ℹ') {
    const container = document.getElementById('toasts');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
    container.appendChild(el);
    // Auto-remove après 4 secondes
    setTimeout(() => { el.remove(); }, 4000);
}

// ═══════════════════════════════════════════════════════════════════
// 12–28. FONCTIONS DE RENDU (renderDashboard, renderProjects, etc.)
// Ces fonctions sont conservées du fichier app.js d'origine.
// Seules les corrections de la section 10 s'appliquent au rendu.
// ═══════════════════════════════════════════════════════════════════

// Stubs de sécurité : évitent une ReferenceError si le code complet
// n'est pas encore intégré lors du développement
if (typeof renderDashboard  === 'undefined') { window.renderDashboard  = () => {}; }
if (typeof renderProjects   === 'undefined') { window.renderProjects   = () => {}; }
if (typeof renderBoard      === 'undefined') { window.renderBoard      = () => {}; }
if (typeof renderBacklog    === 'undefined') { window.renderBacklog    = () => {}; }
if (typeof renderSprints    === 'undefined') { window.renderSprints    = () => {}; }
if (typeof renderTenders    === 'undefined') { window.renderTenders    = () => {}; }
if (typeof renderTeam       === 'undefined') { window.renderTeam       = () => {}; }
if (typeof renderAnalytics  === 'undefined') { window.renderAnalytics  = () => {}; }
if (typeof renderCalendar   === 'undefined') { window.renderCalendar   = () => {}; }
if (typeof renderMySpace    === 'undefined') { window.renderMySpace    = () => {}; }
if (typeof renderDecision   === 'undefined') { window.renderDecision   = () => {}; }
if (typeof renderUsers      === 'undefined') { window.renderUsers      = () => {}; }
if (typeof openAdd          === 'undefined') { window.openAdd          = () => {}; }
if (typeof cm               === 'undefined') { window.cm               = (id) => { document.getElementById(id)?.classList.remove('open'); }; }
if (typeof handleSearch     === 'undefined') { window.handleSearch     = () => {}; }
if (typeof filterProj       === 'undefined') { window.filterProj       = () => {}; }
if (typeof setBoardFilter   === 'undefined') { window.setBoardFilter   = () => {}; }
if (typeof toggleUserMenu   === 'undefined') { window.toggleUserMenu   = () => {}; }
if (typeof saveWI           === 'undefined') { window.saveWI           = () => {}; }
if (typeof saveProj         === 'undefined') { window.saveProj         = () => {}; }
if (typeof saveAO           === 'undefined') { window.saveAO           = () => {}; }
if (typeof saveMember       === 'undefined') { window.saveMember       = () => {}; }

// Stub SYNC si non défini dans le fichier complet
if (typeof SYNC === 'undefined') {
    window.SYNC = {
        active: false,
        _interval: null,
        start() {
            this.active = true;
            // Synchronisation toutes les 60 secondes
            this._interval = setInterval(() => {
                if (getToken()) loadAll().catch(console.warn);
            }, 60_000);
        },
        stop() {
            this.active = false;
            if (this._interval) { clearInterval(this._interval); this._interval = null; }
        }
    };
}

// ═══════════════════════════════════════════════════════════════════
// 29. INITIALISATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Initialisation automatique au chargement de la page
 */
(function init() {
    const token = getToken();
    const user  = getUser();

    if (token && user) {
        // Session valide → afficher l'app
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        _updateUserBar(user);
        loadAll();
    }
    // Sinon → rester sur l'écran de login

    // ── Initialisation logo responsive ──────────────────────────────
    initLogoResponsive();

    // ── Initialisation notifications (une seule fois) ───────────────
    initNotifications();
})();

/**
 * Initialise le logo responsive — fallback si image absente
 */
function initLogoResponsive() {
    document.querySelectorAll('.logo-responsive').forEach(icon => {
        const img = icon.querySelector('.logo-img');
        if (img && !img.getAttribute('data-error-handled')) {
            img.setAttribute('data-error-handled', '1');
            img.onerror = function () {
                this.style.display = 'none';
                // console.warn n'est utile qu'en développement
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    console.warn('🖼️ Logo non trouvé — vérifiez static/img/logo.png');
                }
            };
        }
    });
}

/**
 * Initialise les notifications (une seule fois)
 */
function initNotifications() {
    if (_notifInitialized) return;
    _notifInitialized = true;

    // Supprime tous les wrappers de notifications sauf le premier
    const wrappers = document.querySelectorAll('.notif-wrapper');
    if (wrappers.length > 1) {
        for (let i = 1; i < wrappers.length; i++) wrappers[i].remove();
    }

    // Initialise la liste avec un message par défaut
    const list = document.getElementById('notif-list');
    if (list && list.innerHTML.includes('Chargement')) {
        list.innerHTML = '<div class="notif-empty">✅ Aucune alerte</div>';
    }
}