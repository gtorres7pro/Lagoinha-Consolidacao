/* hub-login.js — Lagoinha HUB Login Logic */
const SUPABASE_URL  = 'https://uyseheucqikgcorrygzc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const _parts = window.location.pathname.split('/').filter(Boolean);
// Only treat first segment as slug if it doesn't end in .html
const _slug = (_parts[0] && !_parts[0].endsWith('.html')) ? _parts[0] : null;

// Load workspace name badge (only if URL has a slug)
if (_slug) {
    sb.from('workspaces').select('name').eq('slug', _slug).single()
        .then(({ data }) => {
            if (data?.name) {
                document.getElementById('workspace-name').textContent = data.name;
                document.getElementById('workspace-badge').style.display = 'flex';
            }
        });
}

/**
 * After login, resolve where to send the user:
 * - master_admin → their first active workspace (or 'orlando' fallback)
 * - regular user → their assigned workspace
 */
async function resolveRedirectSlug(userId) {
    try {
        // If URL already has a valid workspace slug, use it
        if (_slug) return _slug;

        // Fetch user row to get role and workspace_id
        const { data: userRow } = await sb.from('users')
            .select('workspace_id, level')
            .eq('id', userId)
            .single();

        if (userRow?.workspace_id) {
            const { data: ws } = await sb.from('workspaces')
                .select('slug')
                .eq('id', userRow.workspace_id)
                .single();
            if (ws?.slug) return ws.slug;
        }

        // master_admin fallback: grab first active workspace alphabetically
        const session = await sb.auth.getSession();
        const role = session.data.session?.user?.user_metadata?.role;
        if (role === 'master_admin') {
            const { data: workspaces } = await sb.from('workspaces')
                .select('slug')
                .eq('status', 'active')
                .order('name')
                .limit(1);
            if (workspaces?.[0]?.slug) return workspaces[0].slug;
        }
    } catch (e) {
        console.warn('[Login] resolveRedirectSlug error:', e);
    }
    return 'orlando'; // ultimate fallback
}

// Redirect if already logged in
sb.auth.getSession().then(async ({ data }) => {
    if (data.session) {
        const slug = await resolveRedirectSlug(data.session.user.id);
        window.location.replace('/' + slug + '/dashboard.html');
    }
});

// Password toggle
document.getElementById('pw-toggle-btn').addEventListener('click', () => {
    const inp = document.getElementById('password');
    const isHidden = inp.type === 'password';
    inp.type = isHidden ? 'text' : 'password';
    document.getElementById('eye-icon').innerHTML = isHidden
        ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
});

function goForgot() {
    const fallback = _slug || 'orlando';
    window.location.href = '/' + fallback + '/forgot-password.html';
}

async function doLogin() {
    const email = document.getElementById('email').value.trim();
    const pass  = document.getElementById('password').value;
    const btn   = document.getElementById('login-btn');
    const err   = document.getElementById('error-msg');

    if (!email || !pass) { showError('Por favor preencha email e senha.'); return; }

    // Loading state
    btn.disabled = true;
    document.getElementById('btn-text').textContent = 'Entrando';
    document.getElementById('btn-spinner').style.display = 'block';
    document.getElementById('btn-arrow').style.display = 'none';
    err.classList.remove('show');

    const { data: authData, error } = await sb.auth.signInWithPassword({ email, password: pass });

    if (error) {
        showError(error.message === 'Invalid login credentials'
            ? 'Email ou senha incorretos.'
            : error.message);
        btn.disabled = false;
        document.getElementById('btn-text').textContent = 'Entrar';
        document.getElementById('btn-spinner').style.display = 'none';
        document.getElementById('btn-arrow').style.display = 'block';
    } else {
        document.getElementById('btn-text').textContent = 'Redirecionando...';
        const slug = await resolveRedirectSlug(authData.user.id);
        window.location.replace('/' + slug + '/dashboard.html');
    }
}

window.doLogin = doLogin;
window.goForgot = goForgot;

function showError(msg) {
    const e = document.getElementById('error-msg');
    e.textContent = msg;
    e.classList.add('show');
}

document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
