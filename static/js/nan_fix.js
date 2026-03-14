/**
 * ═══════════════════════════════════════════════════════════════
 * KICEKO ProjectHub — nan_fix.js
 * Correction ciblée des NaN sur le Dashboard
 *
 * CAUSE 1 — animCount(el, undefined)
 *   Math.round(p * undefined) = NaN affiché dans le DOM
 *
 * CAUSE 2 — fmt("null") ou fmt("abc")
 *   Number("null") = NaN → toLocaleString() = "NaN"
 *   Django DRF sérialise parfois les Decimal/Float en string.
 *
 * CAUSE 3 — reduce avec amount en string (DRF)
 *   0 + "500000" = "0500000" (concaténation, pas addition)
 *   puis "0500000" + "300000" = chaîne → fmt() peut produire NaN
 * ═══════════════════════════════════════════════════════════════
 */

(function patchNaN() {
    'use strict';

    /* ─────────────────────────────────────────────────────────
       HELPER : conversion numérique sécurisée
       Gère null, undefined, "", "null", "undefined", NaN, strings
       ───────────────────────────────────────────────────────── */
    function safeNum(v, fallback = 0) {
        if (v === null || v === undefined || v === '' || v === 'null' || v === 'undefined') {
            return fallback;
        }
        const n = Number(v);
        return isNaN(n) ? fallback : n;
    }

    // Expose globalement pour app.js et les autres fichiers
    window.safeNum = safeNum;

    /* ─────────────────────────────────────────────────────────
       PATCH 1 — animCount
       Protège contre target = undefined / null / NaN / string
       ───────────────────────────────────────────────────────── */
    const _origAnimCount = window.animCount;
    window.animCount = function(el, target, dur) {
        return (_origAnimCount || _fallbackAnimCount)(el, safeNum(target), dur);
    };

    // Fallback si animCount pas encore défini (ordre de chargement)
    function _fallbackAnimCount(el, target, dur = 900) {
        if (!el) return;
        const safeTarget = safeNum(target);
        const start = Date.now();
        const step = () => {
            const p = Math.min(1, (Date.now() - start) / dur);
            el.textContent = Math.round(p * safeTarget);
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /* ─────────────────────────────────────────────────────────
       PATCH 2 — fmt
       Protège contre Number("null")=NaN, Number("")=NaN, etc.
       ───────────────────────────────────────────────────────── */
    window.fmt = function(n) {
        return safeNum(n).toLocaleString('fr-FR');
    };

    /* ─────────────────────────────────────────────────────────
       PATCH 3 — Normaliser D après chargement API
       Convertit tous les champs numériques string→number
       pour éviter la concaténation dans les reduce/sum
       ───────────────────────────────────────────────────────── */
    function normalizeData() {
        const D_ref = window.D;
        if (!D_ref) return;

        // Projets : progress, id
        (D_ref.projects || []).forEach(p => {
            p.progress = safeNum(p.progress, 0);
            p.id       = safeNum(p.id, p.id);
        });

        // Work Items : story_points, id
        (D_ref.workItems || []).forEach(w => {
            w.story_points = safeNum(w.story_points, 0);
            w.pts          = safeNum(w.pts, w.story_points);
            w.id           = safeNum(w.id, w.id);
        });

        // Tenders : amount — DRF Decimal → string → number
        (D_ref.tenders || []).forEach(t => {
            t.amount = safeNum(t.amount, 0);
            t.id     = safeNum(t.id, t.id);
        });

        // Membres : id
        (D_ref.members || []).forEach(m => {
            m.id = safeNum(m.id, m.id);
        });

        // Sprints : velocity, capacity
        (D_ref.sprints || []).forEach(s => {
            s.velocity = safeNum(s.velocity, 0);
            s.capacity = safeNum(s.capacity, 0);
        });
    }

    /* ─────────────────────────────────────────────────────────
       PATCH 4 — Intercepter loadAll pour normaliser après fetch
       ───────────────────────────────────────────────────────── */
    const _origLoadAll = window.loadAll;
    if (typeof _origLoadAll === 'function') {
        window.loadAll = async function(...args) {
            const result = await _origLoadAll.apply(this, args);
            normalizeData();   // ← normalise APRÈS le fetch API
            renderSafeDashboard();
            return result;
        };
    }

    /* ─────────────────────────────────────────────────────────
       PATCH 5 — renderDashboard sécurisé
       Recalcule les stats depuis D directement si dashStats = null
       ───────────────────────────────────────────────────────── */
    function renderSafeDashboard() {
        const D_ref = window.D || { projects:[], workItems:[], tenders:[], members:[], sprints:[] };

        // Calcul sécurisé des 4 valeurs du stats-grid
        const activeWI   = D_ref.workItems.filter(w => w.status !== 'Terminé').length;
        const activeProj = D_ref.projects.filter(p => p.status === 'En cours').length;
        const doneWI     = D_ref.workItems.filter(w => w.status === 'Terminé').length;
        const activeAO   = D_ref.tenders.filter(t => !['Gagné','Perdu'].includes(t.status)).length;

        // Mise à jour DOM — remplace NaN par la bonne valeur
        _setStatSafe('s1', activeWI);
        _setStatSafe('s2', activeProj);
        _setStatSafe('s3', doneWI);
        _setStatSafe('s4', activeAO);
    }

    function _setStatSafe(id, value) {
        const el = document.getElementById(id);
        if (!el) return;

        const safeVal = safeNum(value, 0);

        // Si la valeur actuelle est NaN ou vide, corriger immédiatement
        const current = el.textContent;
        if (current === 'NaN' || current === '' || current === 'undefined') {
            el.textContent = '0';
        }

        // Lancer animCount sécurisé
        if (typeof window.animCount === 'function') {
            window.animCount(el, safeVal);
        } else {
            el.textContent = safeVal;
        }
    }

    /* ─────────────────────────────────────────────────────────
       PATCH 6 — Correction immédiate des NaN déjà dans le DOM
       S'exécute dès le chargement du script
       ───────────────────────────────────────────────────────── */
    function fixExistingNaN() {
        // Tous les éléments texte contenant "NaN"
        document.querySelectorAll('.stat-value, .stat-change, .nav-chip').forEach(el => {
            if (el.textContent.trim() === 'NaN' || el.textContent.trim() === 'undefined') {
                el.textContent = '0';
                el.classList.add('neutral');
            }
        });

        // Recalcul immédiat si D est disponible
        if (window.D) {
            normalizeData();
            renderSafeDashboard();
        }
    }

    // Lancer la correction immédiate + après chargement complet
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fixExistingNaN);
    } else {
        fixExistingNaN();
    }

    // Sécurité : relancer 1s après (data peut arriver en async)
    setTimeout(() => {
        fixExistingNaN();
        if (window.D) {
            normalizeData();
            renderSafeDashboard();
        }
    }, 1000);

    // Observer le DOM pour corriger les NaN introduits dynamiquement
    if (window.MutationObserver) {
        const observer = new MutationObserver(mutations => {
            let hasNaN = false;
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('NaN')) {
                        hasNaN = true;
                    }
                });
            });
            if (hasNaN) fixExistingNaN();
        });

        // Observer uniquement les stats-grid (performances)
        const statsContainers = document.querySelectorAll('.stats-grid, #page-dashboard');
        statsContainers.forEach(c => {
            observer.observe(c, { childList: true, subtree: true, characterData: true });
        });
    }

    console.log('✅ nan_fix.js chargé — animCount, fmt, D normalisé');
})();
