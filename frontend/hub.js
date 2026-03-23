/**
 * hub.js — Lagoinha HUB Shared Utilities
 * Include on every authenticated page AFTER supabase-js
 */

/* ─── Supabase Client (shared) ─────────────────────────────────────── */
const HUB_SUPABASE_URL  = 'https://uyseheucqikgcorrygzc.supabase.co';
const HUB_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';

if (!window.supabaseClient) {
    window.supabaseClient = supabase.createClient(HUB_SUPABASE_URL, HUB_SUPABASE_ANON);
}
const _sb = window.supabaseClient;

/* ─── Slug ──────────────────────────────────────────────────────────── */
const HUB_SLUG = window.location.pathname.split('/').filter(Boolean)[0] || 'orlando';

/* ─── Auth Guard ────────────────────────────────────────────────────── */
async function hubAuthGuard() {
    const { data } = await _sb.auth.getSession();
    if (!data.session) {
        window.location.replace('/' + HUB_SLUG + '/login.html');
        return null;
    }
    return data.session;
}

/* Token refresh — keep session alive */
_sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.replace('/' + HUB_SLUG + '/login.html');
    }
});

/* ─── Toast System ─────────────────────────────────────────────────── */
(function injectToastStyles() {
    if (document.getElementById('hub-toast-styles')) return;
    const s = document.createElement('style');
    s.id = 'hub-toast-styles';
    s.textContent = `
        #hub-toast-container {
            position: fixed;
            bottom: 28px; right: 28px;
            z-index: 9999;
            display: flex; flex-direction: column; gap: 10px;
            pointer-events: none;
        }
        .hub-toast {
            display: flex; align-items: center; gap: 12px;
            min-width: 280px; max-width: 380px;
            padding: 14px 18px;
            background: #111111;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 14px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            font-family: 'Inter', sans-serif;
            font-size: 0.84rem; font-weight: 500;
            color: #fff;
            pointer-events: all;
            animation: toastIn 0.35s cubic-bezier(0.16,1,0.3,1) both;
        }
        .hub-toast.hide { animation: toastOut 0.25s ease forwards; }
        .hub-toast-icon { width: 18px; height: 18px; flex-shrink: 0; }
        .hub-toast-icon svg { width: 18px; height: 18px; }
        .hub-toast-msg { flex: 1; line-height: 1.4; }
        .hub-toast-close {
            background: none; border: none; color: rgba(255,255,255,0.3);
            cursor: pointer; font-size: 1rem; padding: 0; line-height: 1;
            transition: color 0.15s;
        }
        .hub-toast-close:hover { color: rgba(255,255,255,0.7); }
        .hub-toast.success { border-color: rgba(74,222,128,0.2); }
        .hub-toast.success .hub-toast-icon { color: #4ade80; }
        .hub-toast.error { border-color: rgba(248,113,113,0.2); }
        .hub-toast.error .hub-toast-icon { color: #f87171; }
        .hub-toast.warning { border-color: rgba(251,191,36,0.2); }
        .hub-toast.warning .hub-toast-icon { color: #FBBF24; }
        .hub-toast.info { border-color: rgba(96,165,250,0.2); }
        .hub-toast.info .hub-toast-icon { color: #60a5fa; }
        @keyframes toastIn {
            from { opacity: 0; transform: translateY(12px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastOut {
            to   { opacity: 0; transform: translateY(8px) scale(0.95); }
        }
    `;
    document.head.appendChild(s);

    const container = document.createElement('div');
    container.id = 'hub-toast-container';
    document.body.appendChild(container);
})();

const _toastIcons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

function hubToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('hub-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `hub-toast ${type}`;
    toast.innerHTML = `
        <span class="hub-toast-icon">${_toastIcons[type] || _toastIcons.info}</span>
        <span class="hub-toast-msg">${message}</span>
        <button class="hub-toast-close" onclick="this.closest('.hub-toast').remove()">✕</button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

/* Alias shortcuts */
const toast = {
    success: (msg, d) => hubToast(msg, 'success', d),
    error:   (msg, d) => hubToast(msg, 'error', d),
    warning: (msg, d) => hubToast(msg, 'warning', d),
    info:    (msg, d) => hubToast(msg, 'info', d),
};

/* ─── Ripple Effect ──────────────────────────────────────────────────
   Add class "hub-ripple" to any button/element to enable ripple click
─────────────────────────────────────────────────────────────────────── */
(function initRipple() {
    const rippleCSS = document.createElement('style');
    rippleCSS.textContent = `
        .hub-ripple { position: relative; overflow: hidden; }
        .hub-ripple-wave {
            position: absolute;
            border-radius: 50%;
            background: rgba(255,255,255,0.18);
            transform: scale(0);
            animation: rippleAnim 0.55s linear;
            pointer-events: none;
        }
        @keyframes rippleAnim {
            to { transform: scale(4); opacity: 0; }
        }
    `;
    document.head.appendChild(rippleCSS);

    document.addEventListener('click', (e) => {
        const el = e.target.closest('.hub-ripple');
        if (!el) return;
        const wave = document.createElement('span');
        wave.className = 'hub-ripple-wave';
        const r = Math.max(el.clientWidth, el.clientHeight);
        const rect = el.getBoundingClientRect();
        wave.style.cssText = `width:${r}px;height:${r}px;left:${e.clientX-rect.left-r/2}px;top:${e.clientY-rect.top-r/2}px`;
        el.appendChild(wave);
        wave.addEventListener('animationend', () => wave.remove());
    });
})();

/* ─── KPI Counter Animation ──────────────────────────────────────────
   hubCountUp(el, target, duration?)
─────────────────────────────────────────────────────────────────────── */
function hubCountUp(el, target, duration = 800) {
    if (!el || isNaN(target)) return;
    const start = performance.now();
    const from = 0;
    function step(now) {
        const p = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
        el.textContent = Math.round(from + (target - from) * ease);
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = target;
    }
    requestAnimationFrame(step);
}

/* ─── Skeleton Loader ────────────────────────────────────────────────
   hubSkeleton(container, rows?) — inject placeholder rows
─────────────────────────────────────────────────────────────────────── */
(function injectSkeletonCSS() {
    const s = document.createElement('style');
    s.textContent = `
        .hub-skeleton {
            background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
            background-size: 200% 100%;
            animation: skeletonShimmer 1.4s infinite;
            border-radius: 8px;
        }
        @keyframes skeletonShimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
        .hub-skeleton-row {
            display: flex; align-items: center; gap: 14px;
            padding: 14px 16px;
            border-bottom: 1px solid rgba(39,39,42,0.4);
        }
        .hub-skeleton-avatar { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; }
        .hub-skeleton-lines  { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .hub-skeleton-line   { height: 10px; border-radius: 6px; }
        .hub-skeleton-line.short { width: 40%; }
    `;
    document.head.appendChild(s);
})();

function hubSkeleton(container, rows = 5) {
    if (!container) return;
    container.innerHTML = Array.from({ length: rows }, () => `
        <div class="hub-skeleton-row">
            <div class="hub-skeleton hub-skeleton-avatar"></div>
            <div class="hub-skeleton-lines">
                <div class="hub-skeleton hub-skeleton-line" style="width:${55+Math.random()*30}%"></div>
                <div class="hub-skeleton hub-skeleton-line short"></div>
            </div>
        </div>
    `).join('');
}

/* ─── Soft Copy (replaces alert) ────────────────────────────────────── */
function hubCopy(text, label = 'Link') {
    navigator.clipboard.writeText(text).then(() => {
        toast.success(`${label} copiado!`);
    }).catch(() => {
        toast.error('Não foi possível copiar.');
    });
}
