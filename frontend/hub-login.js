/* hub-login.js — Lagoinha HUB Login Logic */
        const SUPABASE_URL  = 'https://uyseheucqikgcorrygzc.supabase.co';
        const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';
        const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

        const _parts = window.location.pathname.split('/').filter(Boolean);
        const _slug  = _parts[0] || 'orlando';

        // Load workspace name badge
        sb.from('workspaces').select('name').eq('slug', _slug).single()
            .then(({ data }) => {
                if (data?.name) {
                    document.getElementById('workspace-name').textContent = data.name;
                    document.getElementById('workspace-badge').style.display = 'flex';
                }
            });

        // Redirect if already logged in
        sb.auth.getSession().then(({ data }) => {
            if (data.session) window.location.replace('/' + _slug + '/dashboard.html');
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
            window.location.href = '/' + _slug + '/forgot-password.html';
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

            const { error } = await sb.auth.signInWithPassword({ email, password: pass });

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
                window.location.replace('/' + _slug + '/dashboard.html');
            }
        }

        function showError(msg) {
            const e = document.getElementById('error-msg');
            e.textContent = msg;
            e.classList.add('show');
        }

        document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
