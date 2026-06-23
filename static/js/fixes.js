/**
 * ═══════════════════════════════════════════════════════════════════
 * KICEKO ProjectHub — fixes.js
 * Patch ciblé : Notifications (double cloche) + Logo fallback
 * À inclure APRÈS app.js dans index.html
 * ═══════════════════════════════════════════════════════════════════
 */

(function applyFixes() {
    'use strict';

    // ────────────────────────────────────────────────────────────────
    // FIX LOGO : Remplace le src manquant par un fallback teal/initiales
    // ────────────────────────────────────────────────────────────────
    function fixLogoDisplay() {
        document.querySelectorAll('.logo-icon, .logo-responsive').forEach(container => {
            const img = container.querySelector('img, .logo-img');
            if (!img) return;

            // Assure que le container est transparent
            container.style.background = 'transparent';

            img.addEventListener('error', function handleLogoError() {
                this.style.display = 'none';
                // Fallback : carré teal avec initiales "K"
                if (!container.querySelector('.logo-icon-fallback')) {
                    const fb = document.createElement('div');
                    fb.className = 'logo-icon-fallback';
                    fb.textContent = 'K';
                    fb.style.cssText = [
                        'width:100%', 'height:100%',
                        'display:flex', 'align-items:center', 'justify-content:center',
                        'font-size:inherit', 'font-weight:900', 'font-family:var(--mono)',
                        'color:var(--accent)', 'background:var(--accentbg)',
                        'border:1.5px solid rgba(14,181,204,.25)', 'border-radius:8px'
                    ].join(';');
                    container.appendChild(fb);
                }
            }, { once: true });

            // Force reload si l'image est déjà en erreur (cache)
            if (img.complete && img.naturalWidth === 0) {
                img.dispatchEvent(new Event('error'));
            }
        });
    }

    // ────────────────────────────────────────────────────────────────
    // FIX NOTIFICATIONS : Garantit une seule cloche, dropdown correct
    // ────────────────────────────────────────────────────────────────
    function fixNotifications() {
        // 1. Supprimer les wrappers dupliqués — ne garder que #notif-wrapper
        const allWrappers = document.querySelectorAll('.notif-wrapper');
        allWrappers.forEach((w, i) => {
            if (i > 0) w.remove();
        });

        // 2. S'assurer que le panel est fermé au démarrage
        const panel = document.getElementById('notif-panel');
        if (panel) {
            panel.classList.remove('open');
            panel.style.removeProperty('display'); // supprime tout inline display
        }

        // 3. Supprimer les listeners dupliqués sur le bouton
        const btn = document.getElementById('notif-btn-unique');
        if (btn) {
            // Clone pour vider tous les listeners
            const fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);

            // Re-attacher le bon listener
            fresh.addEventListener('click', function (e) {
                e.stopPropagation();
                const p = document.getElementById('notif-panel');
                if (!p) return;
                const isOpen = p.classList.toggle('open');
                fresh.setAttribute('aria-expanded', String(isOpen));
            });
        }

        // 4. Fermeture au clic extérieur (listener unique)
        document.removeEventListener('click', _outsideClickHandler);
        document.addEventListener('click', _outsideClickHandler);
    }

    function _outsideClickHandler(e) {
        const wrapper = document.getElementById('notif-wrapper');
        if (!wrapper) return;
        if (!wrapper.contains(e.target)) {
            const p = document.getElementById('notif-panel');
            if (p) p.classList.remove('open');
            const b = document.getElementById('notif-btn-unique');
            if (b) b.setAttribute('aria-expanded', 'false');
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Surcharge _updateNotifBell pour garantir les bonnes classes CSS
    // ────────────────────────────────────────────────────────────────
    window._updateNotifBell = function () {
        // Anti-doublon cloche
        const allWrappers = document.querySelectorAll('.notif-wrapper');
        if (allWrappers.length > 1) {
            for (let i = 1; i < allWrappers.length; i++) allWrappers[i].remove();
        }

        const D_ref = window.D || { projects: [], workItems: [] };
        const now   = new Date();
        const alerts = [];

        // Alertes deadlines projets
        (D_ref.projects || []).forEach(p => {
            if (!p.deadline || p.status === 'Terminé') return;
            const diff = Math.floor((new Date(p.deadline) - now) / 86400000);
            if (diff < 0) {
                alerts.push({ level: 'critical', icon: '🚨', title: String(p.name || ''), desc: `Dépassée de ${Math.abs(diff)}j` });
            } else if (diff <= 7) {
                alerts.push({ level: 'warning', icon: '⚠️', title: String(p.name || ''), desc: `${diff}j restants` });
            }
        });

        // Alertes bugs
        const bugCount = (D_ref.workItems || []).filter(w => w.type === 'bug' && w.status !== 'Terminé').length;
        if (bugCount >= 2) {
            alerts.push({ level: 'warning', icon: '🐛', title: `${bugCount} bugs ouverts`, desc: 'Dette technique' });
        }

        // Mise à jour UI
        const badge = document.getElementById('notif-badge');
        const dot   = document.getElementById('notif-dot');
        const list  = document.getElementById('notif-list');

        if (badge) {
            badge.textContent   = alerts.length > 99 ? '99+' : String(alerts.length);
            badge.style.display = alerts.length ? 'block' : 'none';
        }
        if (dot) {
            dot.style.display = alerts.some(a => a.level === 'critical') ? 'block' : 'none';
        }
        if (list) {
            if (alerts.length > 0) {
                list.innerHTML = alerts.slice(0, 12).map(a => `
                    <div class="notif-item ${a.level}" role="listitem">
                        <div class="notif-icon" aria-hidden="true">${a.icon}</div>
                        <div class="notif-body">
                            <div class="notif-title">${a.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                            <div class="notif-desc">${a.desc}</div>
                        </div>
                    </div>`
                ).join('');
            } else {
                list.innerHTML = `
                    <div class="notif-empty">
                        <span style="font-size:24px;opacity:.4">🔕</span>
                        <span>Aucune alerte active</span>
                    </div>`;
            }
        }
    };

    // ────────────────────────────────────────────────────────────────
    // Application des fixes au chargement DOM
    // ────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            fixLogoDisplay();
            fixNotifications();
        });
    } else {
        // DOM déjà prêt
        fixLogoDisplay();
        fixNotifications();
    }

    // Re-appliquer après loadAll() (les données sont chargées)
    const _originalLoadAll = window.loadAll;
    if (typeof _originalLoadAll === 'function') {
        window.loadAll = async function (...args) {
            const result = await _originalLoadAll.apply(this, args);
            fixNotifications();
            fixLogoDisplay();
            return result;
        };
    }

})();
