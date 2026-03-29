/* hub-login.js — Lago Hub Login Logic */
const SUPABASE_URL  = 'https://uyseheucqikgcorrygzc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/**
 * Extract workspace slug from URL path.
 * Returns null if the first segment is an .html file (e.g. /login.html → null).
 * Valid: /orlando/login.html → 'orlando'
 * Invalid: /login.html → null
 */
function getSlugFromPath() {
    if (window.location.protocol === 'file:') return null;
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && !parts[0].endsWith('.html')) return parts[0];
    return null;
}

const _urlSlug = getSlugFromPath();


// Show workspace badge if URL already has a slug
if (_urlSlug) {
    sb.from('workspaces').select('name').eq('slug', _urlSlug).maybeSingle()
        .then(({ data }) => {
            if (data?.name) {
                document.getElementById('workspace-name').textContent = data.name;
                document.getElementById('workspace-badge').style.display = 'flex';
            }
        });
}


/**
 * After login, find the correct slug for this user.
 * Priority:
 * 1. Slug already in the URL (e.g. /orlando/login.html)
 * 2. User's workspace_id → look up that workspace's slug
 * 3. Fallback: 'orlando'
 */
async function resolveRedirectSlug(userId) {
    // 1. URL already has a valid slug → use it
    if (_urlSlug) return _urlSlug;

    try {
        // 2. Query user row for workspace_id
        const { data: userRow, error: ue } = await sb
            .from('users')
            .select('workspace_id')
            .eq('id', userId)
            .maybeSingle();

        if (!ue && userRow?.workspace_id) {
            const { data: ws } = await sb
                .from('workspaces')
                .select('slug')
                .eq('id', userRow.workspace_id)
                .maybeSingle();
            if (ws?.slug) return ws.slug;
        }
    } catch (e) {
        console.warn('[Login] resolveRedirectSlug error:', e);
    }

    // 3. Ultimate fallback
    return 'orlando';
}

// If already logged in → redirect immediately
sb.auth.getSession().then(async ({ data }) => {
    if (data?.session) {
        const slug = await resolveRedirectSlug(data.session.user.id);
        if (window.location.protocol === 'file:') window.location.href = 'dashboard.html';
        else window.location.replace('/' + slug + '/dashboard.html');
    }
});

// Password visibility toggle
document.getElementById('pw-toggle-btn').addEventListener('click', () => {
    const inp = document.getElementById('password');
    const isHidden = inp.type === 'password';
    inp.type = isHidden ? 'text' : 'password';
    document.getElementById('eye-icon').innerHTML = isHidden
        ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
});

function goForgot() {
    const slug = _urlSlug || 'orlando';
    if (window.location.protocol === 'file:') {
        window.location.href = 'forgot-password.html';
    } else {
        window.location.href = '/' + slug + '/forgot-password.html';
    }
}
window.goForgot = goForgot;

async function doLogin() {
    const email = document.getElementById('email').value.trim();
    const pass  = document.getElementById('password').value;
    const btn   = document.getElementById('login-btn');

    if (!email || !pass) { showError('Por favor preencha email e senha.'); return; }

    // Loading state
    btn.disabled = true;
    document.getElementById('btn-text').textContent = 'Entrando...';
    document.getElementById('btn-spinner').style.display = 'block';
    document.getElementById('btn-arrow').style.display = 'none';
    document.getElementById('error-msg').classList.remove('show');

    const { data: authData, error } = await sb.auth.signInWithPassword({ email, password: pass });

    if (error) {
        showError(error.message === 'Invalid login credentials'
            ? 'Email ou senha incorretos.'
            : error.message);
        btn.disabled = false;
        document.getElementById('btn-text').textContent = 'Entrar';
        document.getElementById('btn-spinner').style.display = 'none';
        document.getElementById('btn-arrow').style.display = 'block';
        return;
    }

    // Success — resolve destination slug
    document.getElementById('btn-text').textContent = 'Redirecionando...';
    const slug = await resolveRedirectSlug(authData.user.id);
    if (window.location.protocol === 'file:') {
        window.location.href = 'dashboard.html';
    } else {
        window.location.replace('/' + slug + '/dashboard.html');
    }
}
window.doLogin = doLogin;

function showError(msg) {
    const e = document.getElementById('error-msg');
    e.textContent = msg;
    e.classList.add('show');
}

document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
