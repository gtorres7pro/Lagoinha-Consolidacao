/* hub-dashboard.js — Lagoinha HUB Dashboard Logic */
/* Auto-extracted from dashboard.html — Fase J Security Hardening */

/* === A: FB SDK Init === */
        window.fbAsyncInit = function() {
            FB.init({
                appId: '934037612918640',
                cookie: true,
                xfbml: true,
                version: 'v22.0'
            });
        };

/* === B: Core Dashboard Logic (Module 1) === */
        // ===== AUTH GUARD =====
        (async () => {
            if (!window.supabaseClient) {
                const SUPABASE_URL = 'https://uyseheucqikgcorrygzc.supabase.co';
                const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';
                window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
            }
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (!session) {
                window.location.href = 'login.html';
                return;
            }
            // Populate user info in sidebar — load name from public.users table
            const user = session.user;
            const userId = user.id;
            // Fetch name from public.users
            (async () => {
                const { data: uRow } = await window.supabaseClient
                    .from('users')
                    .select('name, phone, role')
                    .eq('id', userId)
                    .maybeSingle();

                const name = uRow?.name || user.user_metadata?.full_name || user.email || 'Usuário';
                const initial = name.substring(0, 1).toUpperCase();

                const avatarEl = document.getElementById('user-avatar-initials');
                if (avatarEl) avatarEl.textContent = initial;

                const nameEl = document.getElementById('user-display-name');
                if (nameEl) nameEl.textContent = name;

                const roleEl = document.getElementById('user-role-label');
                if (roleEl) {
                    const roleMap = { master_admin: 'Master Admin', church_admin: 'Admin', user: 'Líder' };
                    roleEl.textContent = roleMap[uRow?.role] || uRow?.role || 'Admin';
                }

                // Store for profile modal pre-fill
                window._profileCache = { name, phone: uRow?.phone || '', email: user.email, initial };

                // ── Personalized Home Greeting ──────────────────────────
                const firstName = name.split(' ')[0];
                const greetingTitle = document.getElementById('home-greeting-title');
                if (greetingTitle) greetingTitle.textContent = `Bem-vindo, ${firstName}!`;

                // ── Daily Bible Verse (rotates at 7am each day) ──────────
                loadDailyVerse();
            })();
        })();

        // ─── DAILY VERSE SYSTEM ──────────────────────────────────────────
        function loadDailyVerse() {
            const VERSES = [
                { text: "Tudo posso naquele que me fortalece.", ref: "Filipenses 4:13" },
                { text: "O SENHOR é o meu pastor e nada me faltará.", ref: "Salmos 23:1" },
                { text: "Não temas, porque eu sou contigo; não te assombres, porque eu sou teu Deus; eu te fortaleço, e te ajudo, e te sustento com a minha diestra fiel.", ref: "Isaías 41:10" },
                { text: "Porque eu bem sei os planos que tenho a vosso respeito, diz o SENHOR; planos de paz e não de mal, para vos dar um futuro e uma esperança.", ref: "Jeremias 29:11" },
                { text: "Buscai, pois, em primeiro lugar, o seu reino e a sua justiça, e todas estas coisas vos serão acrescentadas.", ref: "Mateus 6:33" },
                { text: "Vinde a mim, todos os que estais cansados e sobrecarregados, e eu vos aliviarei.", ref: "Mateus 11:28" },
                { text: "Mas os que esperam no SENHOR renovam as suas forças, sobem com asas como águias, correm e não se cansam, caminham e não se fatigam.", ref: "Isaías 40:31" },
                { text: "Porque o SENHOR, vosso Deus, é o que vai convosco, para pelegar por vós contra os vossos inimigos, para salvar-vos.", ref: "Deuteronômio 20:4" },
                { text: "Entreguem ao SENHOR tudo o que fazem, e os seus planos serão bem-sucedidos.", ref: "Provérbios 16:3" },
                { text: "Porque Deus tanto amou o mundo que deu o seu Filho Unigênito, para que todo o que nele crer não pereça, mas tenha a vida eterna.", ref: "João 3:16" },
                { text: "O ladrão não vem senão para roubar, matar e destruir; eu vim para que tenham vida e a tenham em abundância.", ref: "João 10:10" },
                { text: "Mas graças a Deus que, em Cristo, sempre nos leva em triunfo e, por nosso intermédio, manifesta em todo lugar o perfume do seu conhecimento.", ref: "2 Coríntios 2:14" },
                { text: "Confie no SENHOR de todo o seu coração e não se apoie no seu próprio entendimento.", ref: "Provérbios 3:5" },
                { text: "Não vos conformeis com este século, mas transformai-vos pela renovação da vossa mente.", ref: "Romanos 12:2" },
                { text: "Porque não nos deu Deus espírito de covardia, mas de poder, de amor e de moderação.", ref: "2 Timóteo 1:7" },
                { text: "Fui crucificado com Cristo; e vivo, não mais eu, mas Cristo vive em mim.", ref: "Gálatas 2:20" },
                { text: "O SENHOR é a minha luz e a minha salvação; a quem temerei?", ref: "Salmos 27:1" },
                { text: "Alegrai-vos sempre no Senhor; outra vez digo: alegrai-vos.", ref: "Filipenses 4:4" },
                { text: "Maior é o que está em vós do que o que está no mundo.", ref: "1 João 4:4" },
                { text: "Este é o dia que o Senhor fez; regozijemo-nos e alegremo-nos nele.", ref: "Salmos 118:24" },
                { text: "E tudo o que pedirdes em meu nome, eu o farei, para que o Pai seja glorificado no Filho.", ref: "João 14:13" },
                { text: "Sede fortes e corajosos. Não temais, nem vos assusteis por causa deles, porque o SENHOR, teu Deus, é quem marcha contigo; não te deixará, nem te abandonará.", ref: "Deuteronômio 31:6" },
                { text: "Ora, àquele que é poderoso para fazer tudo muito mais abundantemente além do que pedimos ou pensamos, segundo o poder que opera em nós, a ele seja a glória.", ref: "Efésios 3:20-21" },
                { text: "Produzi, pois, frutos dignos de arrependimento.", ref: "Mateus 3:8" },
                { text: "Mas recebereis poder, ao descer sobre vós o Espírito Santo, e sereis minhas testemunhas.", ref: "Atos 1:8" },
                { text: "Não se turbe o vosso coração; credes em Deus, crede também em mim.", ref: "João 14:1" },
                { text: "A graça do Senhor Jesus Cristo, o amor de Deus e a comunhão do Espírito Santo sejam com todos vós.", ref: "2 Coríntios 13:14" },
                { text: "Sejam gratos em qualquer situação, pois esta é a vontade de Deus em Cristo Jesus para vocês.", ref: "1 Tessalonicenses 5:18" },
                { text: "Nenhuma arma forjada contra ti prosperará.", ref: "Isaías 54:17" },
                { text: "Porque onde dois ou três estão reunidos em meu nome, aí estou eu no meio deles.", ref: "Mateus 18:20" }
            ];

            // Use day-of-year as index (stable across page reloads, changes daily)
            const now = new Date();
            // Anchor at 7am: if before 7am use yesterday's verse
            const anchorHour = 7;
            if (now.getHours() < anchorHour) {
                now.setDate(now.getDate() - 1);
            }
            const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
            const idx = dayOfYear % VERSES.length;

            // Check localStorage cache to avoid flicker
            const cacheKey = 'lago_verse_day';
            const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
            const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

            let verse;
            if (cached.key === todayKey) {
                verse = cached.verse;
            } else {
                verse = VERSES[idx];
                localStorage.setItem(cacheKey, JSON.stringify({ key: todayKey, verse }));
            }

            const textEl = document.getElementById('verse-text');
            const refEl  = document.getElementById('verse-ref');
            if (textEl) textEl.textContent = `"${verse.text}"`;
            if (refEl)  refEl.textContent  = `— ${verse.ref}`;
        }


        // ===== LOGOUT =====
        window.handleLogout = async function() {
            await window.supabaseClient.auth.signOut();
            const slug = window.location.pathname.split('/').filter(Boolean)[0];
            window.location.href = (slug && !slug.endsWith('.html'))
                ? `/${slug}/login.html`
                : '/login.html';
        };

        // ===== PROFILE MODAL =====
        window.openProfileModal = function() {
            const overlay = document.getElementById('profile-modal-overlay');
            if (!overlay) return;
            const p = window._profileCache || {};
            const nameInput = document.getElementById('profile-input-name');
            const phoneInput = document.getElementById('profile-input-phone');
            if (nameInput) nameInput.value = p.name || '';
            if (phoneInput) phoneInput.value = p.phone || '';
            const headerName = document.getElementById('profile-modal-name-display');
            const headerEmail = document.getElementById('profile-modal-email-display');
            const headerAvatar = document.getElementById('profile-modal-avatar');
            if (headerName) headerName.textContent = p.name || 'Meu Perfil';
            if (headerEmail) headerEmail.textContent = p.email || '';
            if (headerAvatar) headerAvatar.textContent = p.initial || 'G';
            ['profile-input-password','profile-input-password2'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = '';
            });
            const msg = document.getElementById('profile-modal-msg');
            if (msg) { msg.textContent = ''; msg.style.color = ''; }
            overlay.style.display = 'flex';
        };

        window.closeProfileModal = function() {
            const overlay = document.getElementById('profile-modal-overlay');
            if (overlay) overlay.style.display = 'none';
        };

        document.addEventListener('click', function(e) {
            const overlay = document.getElementById('profile-modal-overlay');
            if (overlay && e.target === overlay) window.closeProfileModal();
        });

        window.saveProfile = async function() {
            const sb = window.supabaseClient;
            const msg = document.getElementById('profile-modal-msg');
            const name = document.getElementById('profile-input-name')?.value.trim();
            const phone = document.getElementById('profile-input-phone')?.value.trim();
            const pw1 = document.getElementById('profile-input-password')?.value;
            const pw2 = document.getElementById('profile-input-password2')?.value;

            if (!name) { msg.style.color='#ff6b6b'; msg.textContent='O nome não pode ficar vazio.'; return; }
            if (pw1 && pw1 !== pw2) { msg.style.color='#ff6b6b'; msg.textContent='As senhas não coincidem.'; return; }
            if (pw1 && pw1.length < 6) { msg.style.color='#ff6b6b'; msg.textContent='A senha deve ter pelo menos 6 caracteres.'; return; }

            msg.style.color='var(--text-dim)'; msg.textContent='Salvando...';

            try {
                const { data: { user } } = await sb.auth.getUser();
                const { error: dbErr } = await sb.from('users').update({ name, phone }).eq('id', user.id);
                if (dbErr) throw dbErr;

                if (pw1) {
                    const { error: pwErr } = await sb.auth.updateUser({ password: pw1 });
                    if (pwErr) throw pwErr;
                }

                // Update sidebar
                const nameEl = document.getElementById('user-display-name');
                if (nameEl) nameEl.textContent = name;
                const avatarEl = document.getElementById('user-avatar-initials');
                if (avatarEl) avatarEl.textContent = name.substring(0,1).toUpperCase();
                const headerName = document.getElementById('profile-modal-name-display');
                if (headerName) headerName.textContent = name;
                const headerAvatar = document.getElementById('profile-modal-avatar');
                if (headerAvatar) headerAvatar.textContent = name.substring(0,1).toUpperCase();

                window._profileCache = { ...window._profileCache, name, phone, initial: name.substring(0,1).toUpperCase() };

                msg.style.color='#4ade80'; msg.textContent='✓ Alterações salvas com sucesso!';
                setTimeout(() => window.closeProfileModal(), 1500);
            } catch(e) {
                msg.style.color='#ff6b6b'; msg.textContent='Erro: ' + e.message;
            }
        };

        // ===== BOTTOM NAV SYNC =====
        window.setBottomNav = function(tab) {
            document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
            const el = document.getElementById('bnav-' + tab);
            if (el) el.classList.add('active');
        };

        // ===== WORKSPACE SWITCHER ENGINE =====
        window.currentWorkspaceId = null;
        window._allWorkspaces = [];
        // Keep local alias for backward compat
        let _allWorkspaces = window._allWorkspaces;

        // Helper: strip 'Lagoinha ' prefix for sidebar display only
        // e.g. 'Lagoinha Orlando' → 'Orlando' | 'Igreja Alpha' → 'Igreja Alpha'
        function displayWsName(name) {
            return (name || '').replace(/^Lagoinha\s+/i, '');
        }

        // Load all accessible workspaces for this user
        window.loadWorkspaces = async function() {
            try {
                const sb = window.supabaseClient;
                const { data: { session } } = await sb.auth.getSession();
                if (!session) return;

                const userId = session.user.id;

                // ALWAYS read role from the public.users table, NOT from JWT metadata
                // (JWT metadata is not reliably updated and was causing master_admin to be treated as regular user)
                const { data: userRow, error: userErr } = await sb
                    .from('users')
                    .select('role, workspace_id, level, regional_id, global_id')
                    .eq('id', userId)
                    .maybeSingle();

                if (userErr) console.warn('loadWorkspaces: users query error', userErr);

                const role = userRow?.role || 'user';
                // Store user info globally for other parts of the app
                window._currentUser = { id: userId, role, ...userRow };

                let workspaces = [];

                if (role === 'master_admin') {
                    // Master admin can see ALL workspaces
                    const { data, error } = await sb.from('workspaces').select('id, name, slug, status').order('name');
                    if (error) console.warn('loadWorkspaces: workspaces query error', error);
                    workspaces = data || [];
                    if (window.applyHierarchyNav) window.applyHierarchyNav('master');
                } else {
                    // Regular user: only their own workspace
                    if (userRow?.workspace_id) {
                        const { data } = await sb.from('workspaces').select('id, name, slug, status').eq('id', userRow.workspace_id);
                        workspaces = data || [];
                    }
                    if (window.applyHierarchyNav) window.applyHierarchyNav(userRow?.level || 'workspace');
                }


                window._allWorkspaces = workspaces;
                _allWorkspaces = workspaces;

                // Set initial workspace — URL slug takes ABSOLUTE priority over sessionStorage
                let _urlSlug = null;
                if (window.location.protocol !== 'file:') {
                    const parts = window.location.pathname.split('/').filter(Boolean);
                    if (parts.length >= 2 && !parts[0].endsWith('.html')) {
                        _urlSlug = parts[0];
                    }
                }
                const slugMatch = _urlSlug
                    ? workspaces.find(w => w.slug === _urlSlug)
                    : null;

                // If URL has slug, always use slug-matched workspace (clear any stale cache)
                if (slugMatch) {
                    sessionStorage.setItem('ws_id', slugMatch.id);
                }

                const stored = sessionStorage.getItem('ws_id');
                const match = slugMatch || workspaces.find(w => w.id === stored);
                const initial = match || workspaces[0];


                if (initial) {
                    window.currentWorkspaceId = initial.id;
                    sessionStorage.setItem('ws_id', initial.id);
                    // Update ws-pill-name in bottom bar
                    const pillName = document.getElementById('ws-pill-name');
                    if (pillName) pillName.textContent = initial.name;
                    // Update sidebar brand sub-label to show city/workspace name
                    const sidebarLabel = document.getElementById('sidebar-workspace-name');
                    if (sidebarLabel) sidebarLabel.textContent = displayWsName(initial.name);
                } else {
                    const pillName = document.getElementById('ws-pill-name');
                    if (pillName) pillName.textContent = 'N/D';
                }

                renderWsDropdown();
                // CRITICAL: Trigger data load for the initial workspace.
                // initEngine() is defined inside DOMContentLoaded (different scope),
                // so we can't call it directly here. Instead, call window.fetchLiveLeads
                // directly. It's assigned as a window global in that DOMContentLoaded
                // block — use a retry loop to wait for it to be registered.
                if (initial) {
                    (function waitAndFetch(attempts) {
                        if (window.fetchLiveLeads) {
                            window.fetchLiveLeads();
                            setTimeout(() => { if (window.loadRealKPIs) window.loadRealKPIs(); }, 1500);
                        } else if (attempts < 40) {
                            setTimeout(() => waitAndFetch(attempts + 1), 100);
                        } else {
                            console.error('[loadWorkspaces] fetchLiveLeads never became available after 4s');
                        }
                    })(0);
                }
            } catch (e) {
                console.warn('loadWorkspaces error:', e);
            }
        };

        function renderWsDropdown() {
            const list = document.getElementById('ws-list');
            if (!list) return;
            list.innerHTML = '';
            // Always read from global (not stale closure copy)
            const allWs = window._allWorkspaces || [];
            if (allWs.length === 0) {
                list.innerHTML = '<div style="padding:12px 14px;color:#555;font-size:0.8rem;">Nenhum workspace disponível</div>';
                return;
            }
            allWs.forEach(ws => {
                const isActive = ws.id === window.currentWorkspaceId;
                const div = document.createElement('div');
                div.className = 'ws-option' + (isActive ? ' active' : '');
                div.innerHTML = `
                    <div class="ws-option-dot"></div>
                    <div>
                        <div class="ws-option-name">${ws.name}</div>
                        <div class="ws-option-badge">${ws.slug || ws.status || 'active'}</div>
                    </div>`;
                div.onclick = (e) => { e.stopPropagation(); switchWorkspace(ws); };
                list.appendChild(div);
            });
        }

        window.toggleWsDropdown = function() {
            const dd = document.getElementById('ws-dropdown');
            if (dd) dd.classList.toggle('open');
        };

        window.switchWorkspace = function(ws) {
            // If the workspace has a slug, navigate to its URL for a clean full reload
            if (ws.slug) {
                const currentSlug = window.location.pathname.split('/').filter(Boolean)[0];
                if (ws.slug !== currentSlug) {
                    if (window.showToast) showToast('🏛 ' + ws.name, 800);
                    setTimeout(() => { window.location.href = `/${ws.slug}/dashboard.html`; }, 300);
                    return;
                }
            }
            // Same workspace or no slug — update in place
            window.currentWorkspaceId = ws.id;
            sessionStorage.setItem('ws_id', ws.id);
            const pillNameEl = document.getElementById('ws-pill-name');
            if (pillNameEl) pillNameEl.textContent = ws.name;
            const sidebarLabel = document.getElementById('sidebar-workspace-name');
            if (sidebarLabel) sidebarLabel.textContent = displayWsName(ws.name);
            if (window.applyPlanGating) window.applyPlanGating(ws.plan || 'free', ws.modules || []);
            const dd = document.getElementById('ws-dropdown');
            if (dd) dd.classList.remove('open');
            renderWsDropdown();
            showToast('🏛 ' + ws.name, 2000);
            // Call fetchLiveLeads directly (initEngine is in a different scope)
            if (window.fetchLiveLeads) {
                window.fetchLiveLeads();
                setTimeout(() => { if (window.loadRealKPIs) window.loadRealKPIs(); }, 1500);
            }
        };

        // Helper: switch workspace by ID only (for onclick buttons in templates)
        window._switchWsById = function(wsId) {
            // Always use global array (not stale closure)
            const allWs = window._allWorkspaces || [];
            const ws = allWs.find(w => w.id === wsId);
            if (ws) {
                window.switchWorkspace(ws);
            } else {
                // Fallback: fetch from DB if not in local list
                const sb = window.supabaseClient;
                if (!sb) return;
                sb.from('workspaces').select('id,name,slug,status,plan,modules').eq('id', wsId).single()
                    .then(({ data }) => { if (data) window.switchWorkspace(data); });
            }
        };

        // Close workspace dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const switcher = document.getElementById('ws-switcher');
            if (switcher && !switcher.contains(e.target)) {
                const dd = document.getElementById('ws-dropdown');
                if (dd) dd.classList.remove('open');
            }
        });

        // Simple toast helper
        window.showToast = function(msg, duration = 2500) {
            let toast = document.getElementById('_toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = '_toast';
                Object.assign(toast.style, {
                    position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%) translateY(20px)',
                    background:'#1c1c1c', border:'1px solid rgba(255,215,0,0.3)', color:'#fff',
                    padding:'10px 20px', borderRadius:'50px', fontSize:'0.85rem', fontWeight:'500',
                    zIndex:'9999', opacity:'0', transition:'opacity 0.25s, transform 0.25s',
                    whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(0,0,0,0.5)'
                });
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
            clearTimeout(toast._t);
            toast._t = setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(20px)';
            }, duration);
        };

        // ── Bootstrap loadWorkspaces ──────────────────────────────────────
        // This script is loaded at the END of <body>, so DOMContentLoaded has
        // already fired by the time this code runs. We call loadWorkspaces()
        // directly, with a tiny delay to guarantee supabaseClient is initialized.
        (function bootstrapWorkspaces() {
            function tryLoad() {
                if (window.supabaseClient) {
                    loadWorkspaces();
                } else {
                    // supabaseClient not ready yet — retry every 100ms (max 5s)
                    let attempts = 0;
                    const iv = setInterval(() => {
                        attempts++;
                        if (window.supabaseClient) {
                            clearInterval(iv);
                            loadWorkspaces();
                        } else if (attempts > 50) {
                            clearInterval(iv);
                            console.error('supabaseClient never became available');
                        }
                    }, 100);
                }
            }
            // DOM is already ready (script is at bottom of body)
            // but auth guard IIFE is async — wait one tick for it to initialize supabase
            setTimeout(tryLoad, 50);
        })();

        window.copyLink = function(url) {
            navigator.clipboard.writeText(url).then(() => {
                const btn = event.target;
                const prev = btn.innerText;
                btn.innerText = "✓ Copiado!";
                btn.style.color = "var(--accent)";
                btn.style.borderColor = "var(--accent)";
                setTimeout(() => {
                    btn.innerText = prev;
                    btn.style.color = "#fff";
                    btn.style.borderColor = "var(--card-border)";
                }, 2000);
            });
        };

        // Router logic
        window.switchTab = function(tabName) {
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            const viewEl = document.getElementById('view-' + tabName);
            if (viewEl) viewEl.classList.add('active');
            
            document.querySelectorAll('.nav li').forEach(el => el.classList.remove('active'));
            const navEl = document.getElementById('nav-' + tabName);
            if (navEl) navEl.classList.add('active');

            // Phase 3: Lazy-load data for specific views
            if (tabName === 'logs' && window.loadAuditLogs) window.loadAuditLogs();
            if (tabName === 'team' && window.loadTeamList) window.loadTeamList();
            if (tabName === 'home' && typeof generateQRCodes === 'function') setTimeout(generateQRCodes, 50);
            if (tabName === 'regional' && window.loadRegionalView) window.loadRegionalView();
            if (tabName === 'global'   && window.loadGlobalView)   window.loadGlobalView();
        }

        // ─── Sidebar visibility based on user level ──────────────────────
        window.applyHierarchyNav = function(level) {
            const levels = { workspace: 0, regional: 1, global: 2, master: 3 };
            const rank = levels[level] || 0;
            if (rank >= 1) document.getElementById('nav-regional').style.display = '';
            if (rank >= 2) document.getElementById('nav-global').style.display = '';
        };

        // ─── REGIONAL VIEW ───────────────────────────────────────────────
        window.loadRegionalView = async function() {
            if (!window.supabaseClient) return;
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (!user) return;

            const { data: profile } = await window.supabaseClient
                .from('users').select('regional_id, level').eq('id', user.id).single();
            if (!profile?.regional_id) return;

            const { data: regional } = await window.supabaseClient
                .from('regionals').select('name').eq('id', profile.regional_id).single();
            if (regional) {
                document.getElementById('regional-title').textContent = regional.name + ' — Regional';
            }

            const { data: workspaces } = await window.supabaseClient
                .from('workspaces')
                .select('id, name, slug, country, status, plan, modules')
                .eq('regional_id', profile.regional_id);

            if (!workspaces) return;
            const activeWs = workspaces.filter(w => w.status === 'active');

            // KPIs
            document.getElementById('rkpi-churches').textContent = activeWs.length;

            // Aggregate leads + messages (parallel)
            const counts = await Promise.all(activeWs.map(async w => {
                const [{ count: saved }, { count: visitors }, { count: msgs }] = await Promise.all([
                    window.supabaseClient.from('leads').select('id', {count:'exact',head:true}).eq('workspace_id', w.id).neq('type','visitor'),
                    window.supabaseClient.from('leads').select('id', {count:'exact',head:true}).eq('workspace_id', w.id).eq('type','visitor'),
                    window.supabaseClient.from('messages').select('id', {count:'exact',head:true}).eq('workspace_id', w.id).eq('automated', true)
                ]);
                return { id: w.id, saved: saved||0, visitors: visitors||0, msgs: msgs||0 };
            }));

            const totSaved = counts.reduce((a,c)=>a+c.saved, 0);
            const totVis   = counts.reduce((a,c)=>a+c.visitors, 0);
            const totMsgs  = counts.reduce((a,c)=>a+c.msgs, 0);
            if (typeof hubCountUp === 'function') {
                hubCountUp(document.getElementById('rkpi-saved'), totSaved);
                hubCountUp(document.getElementById('rkpi-visitors'), totVis);
                hubCountUp(document.getElementById('rkpi-messages'), totMsgs);
            } else {
                document.getElementById('rkpi-saved').textContent = totSaved;
                document.getElementById('rkpi-visitors').textContent = totVis;
                document.getElementById('rkpi-messages').textContent = totMsgs;
            }

            // Render church cards
            const grid = document.getElementById('regional-churches-grid');
            grid.innerHTML = '';
            workspaces.forEach(w => {
                const cnt = counts.find(c => c.id === w.id) || { saved:0, visitors:0 };
                const card = document.createElement('div');
                card.className = 'hub-hierarchy-card';
                card.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                        <div style="display:flex; align-items:center; gap:8px; font-weight:700; font-size:1rem;">
                            <span class="hub-status-dot ${w.status || 'draft'}"></span>
                            ${w.name}
                        </div>
                        <span class="hub-plan-badge ${w.plan || 'free'}">${w.plan || 'free'}</span>
                    </div>
                    <div style="font-size:.8rem; color:var(--text-dim); margin-bottom:14px;">🌍 ${w.country || '—'}</div>
                    <div style="display:flex; gap:14px; font-size:.85rem;">
                        <span>👥 <b>${cnt.saved}</b> Consol.</span>
                        <span>🧑 <b>${cnt.visitors}</b> Visit.</span>
                    </div>
                    <button onclick="window._switchWsById('${w.id}')" style="margin-top:14px; width:100%; background:rgba(255,215,0,.1); border:1px solid rgba(255,215,0,.2); color:var(--accent); border-radius:8px; padding:6px; font-size:.8rem; cursor:pointer; font-weight:600;">Acessar Workspace →</button>
                `;
                grid.appendChild(card);
            });
        };

        // ─── GLOBAL VIEW ─────────────────────────────────────────────────
        window.loadGlobalView = async function() {
            if (!window.supabaseClient) return;

            const [{ data: regionals }, { data: workspaces }] = await Promise.all([
                window.supabaseClient.from('regionals').select('id, name, slug, global_id'),
                window.supabaseClient.from('workspaces').select('id, name, slug, country, status, plan, regional_id')
            ]);

            if (!regionals || !workspaces) return;

            const activeWs = workspaces.filter(w => w.status === 'active');
            const planCounts = workspaces.reduce((a,w) => { if (w.status==='active') a[w.plan||'free']=(a[w.plan||'free']||0)+1; return a; }, {});
            const planSummary = Object.entries(planCounts).map(([p,c])=>`${c} ${p}`).join(', ');

            // KPIs
            document.getElementById('gkpi-regionals').textContent = regionals.length;
            if (typeof hubCountUp === 'function') {
                hubCountUp(document.getElementById('gkpi-churches'), activeWs.length);
            } else {
                document.getElementById('gkpi-churches').textContent = activeWs.length;
            }
            document.getElementById('gkpi-plans').textContent = planSummary;

            // Aggregate global leads count
            const { count: totalLeads } = await window.supabaseClient
                .from('leads').select('id', {count:'exact', head:true});
            if (typeof hubCountUp === 'function') {
                hubCountUp(document.getElementById('gkpi-leads'), totalLeads || 0);
            } else {
                document.getElementById('gkpi-leads').textContent = totalLeads || 0;
            }

            // Render regionals accordion
            const container = document.getElementById('global-regionals-container');
            container.innerHTML = '';
            regionals.forEach(reg => {
                const regWs = workspaces.filter(w => w.regional_id === reg.id);
                const section = document.createElement('div');
                section.className = 'hub-regional-section';
                section.innerHTML = `
                    <div class="hub-regional-header" onclick="this.parentElement.classList.toggle('open')">
                        <svg viewBox="0 0 24 24" width="18" style="flex-shrink:0; stroke:var(--accent); fill:none; stroke-width:2;"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        ${reg.name}
                        <span style="margin-left:8px; font-size:.75rem; background:rgba(255,255,255,.07); padding:2px 10px; border-radius:6px; color:var(--text-dim); font-weight:400;">${regWs.length} igrejas</span>
                        <span class="expand-icon">▼</span>
                    </div>
                    <div class="hub-regional-body">
                        <div class="hub-hierarchy-grid">
                            ${regWs.map(w => `
                            <div class="hub-hierarchy-card" onclick="switchWorkspace('${w.id}')">
                                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                                    <div style="display:flex; align-items:center; gap:8px; font-weight:600;">
                                        <span class="hub-status-dot ${w.status||'draft'}"></span>
                                        ${w.name}
                                    </div>
                                    <span class="hub-plan-badge ${w.plan||'free'}">${w.plan||'free'}</span>
                                </div>
                                <div style="font-size:.78rem; color:var(--text-dim);">🌍 ${w.country||'—'}</div>
                            </div>`).join('')}
                            ${regWs.length === 0 ? '<p style="color:var(--text-dim); font-size:.85rem; padding:8px 4px;">Nenhuma igreja nesta regional ainda.</p>' : ''}
                        </div>
                    </div>
                `;
                container.appendChild(section);
            });

            // Populate city modal regional select
            const sel = document.getElementById('new-city-regional');
            if (sel) {
                sel.innerHTML = regionals.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
            }
        };

        // ─── SHOW ADD CITY MODAL ─────────────────────────────────────────
        window.showAddCityModal = function() {
            const overlay = document.getElementById('add-city-modal-overlay');
            if (overlay) { overlay.style.display = 'flex'; }
        };

        // ─── CREATE CITY ─────────────────────────────────────────────────
        window.createCity = async function() {
            if (!window.supabaseClient) return;
            const name    = document.getElementById('new-city-name').value.trim();
            const country = document.getElementById('new-city-country').value.trim();
            const regId   = document.getElementById('new-city-regional').value;
            const email   = document.getElementById('new-city-email').value.trim();

            if (!name || !country || !regId) {
                hubToast('Preencha nome, país e regional.', 'warn'); return;
            }

            const { error } = await window.supabaseClient.from('cities').insert({
                name, country, regional_id: regId,
                status: email ? 'pending' : 'active',
                invited_email: email || null,
                invited_at: email ? new Date().toISOString() : null,
                activated_at: email ? null : new Date().toISOString()
            });

            if (error) { hubToast('Erro ao criar cidade: ' + error.message, 'error'); return; }

            hubToast(`Cidade "${name}" criada com sucesso!`, 'success');
            document.getElementById('add-city-modal-overlay').style.display = 'none';
            // Clear fields
            ['new-city-name','new-city-country','new-city-email'].forEach(id => document.getElementById(id).value = '');
            window.loadGlobalView(); // Refresh
        };




        // ═══════════════════════════════════════════════════════════
        // ═══════════════════════════════════════════════════════════
        //  FASE F — PLANOS E MONETIZAÇÃO
        // ═══════════════════════════════════════════════════════════

        const PLAN_CONFIG = {
            free:    { label:'Free',    modules:['consolidation','visitors'], color:'rgba(255,255,255,.1)', text:'#aaa' },
            basic:   { label:'Basic',   modules:['consolidation','visitors','start','aniversariantes'], color:'rgba(100,180,255,.2)', text:'#64b4ff' },
            medium:  { label:'Medium',  modules:['consolidation','visitors','start','aniversariantes','crie'], color:'rgba(100,220,150,.2)', text:'#64dc96' },
            premium: { label:'Premium', modules:['consolidation','visitors','ia_whatsapp','financeiro','start','aniversariantes','crie','voluntarios'], color:'rgba(255,215,0,.2)', text:'var(--accent)' },
        };

        const ALL_MODULES_LIST = ['consolidation','visitors','ia_whatsapp','financeiro','start','aniversariantes','crie','voluntarios'];

        // Map: module slug → { nav id, view id }
        const PLAN_NAV_MAP = {
            consolidation:   { nav:'nav-dashboard',  view:'view-dashboard'  },
            visitors:        { nav:'nav-visitors',   view:'view-visitors'   },
            ia_whatsapp:     { nav:'nav-messages',   view:'view-messages'   },
        };

        // ─── APPLY PLAN GATING ────────────────────────────────────────────
        window.applyPlanGating = function(plan, wsModules) {
            const cfg = PLAN_CONFIG[plan] || PLAN_CONFIG.free;
            const allowed = wsModules && wsModules.length ? wsModules : cfg.modules;

            // Update workspace pill plan badge
            const badge = document.getElementById('ws-plan-badge');
            if (badge) {
                badge.textContent = cfg.label.toUpperCase();
                badge.className = `ws-plan-badge ws-plan-${plan}`;
                badge.style.display = 'inline-flex';
            }

            // Apply nav locking
            Object.entries(PLAN_NAV_MAP).forEach(([slug, {nav, view}]) => {
                const navEl = document.getElementById(nav);
                if (!navEl) return;
                const isAllowed = allowed.includes(slug);
                if (isAllowed) {
                    navEl.removeAttribute('data-locked');
                    navEl.style.opacity = '';
                    navEl.style.cursor  = '';
                    navEl.title = '';
                    // Remove any lock icon
                    const icon = navEl.querySelector('.plan-lock-icon');
                    if (icon) icon.remove();
                } else {
                    navEl.setAttribute('data-locked', '1');
                    navEl.style.opacity = '0.4';
                    navEl.style.cursor  = 'not-allowed';
                    navEl.title = `Disponível a partir do plano ${slug==='ia_whatsapp'?'Premium':'Basic'}. Clique em "Ver Planos".`;
                    // Add lock icon if not there
                    if (!navEl.querySelector('.plan-lock-icon')) {
                        const lock = document.createElement('span');
                        lock.className = 'plan-lock-icon';
                        lock.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" style="stroke:currentColor;fill:none;stroke-width:2;margin-left:auto;opacity:.6;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
                        navEl.appendChild(lock);
                    }
                    // Override click to show upgrade modal instead
                    navEl.onclick = (e) => { e.stopPropagation(); showUpgradeModal(); };
                }
            });

            // Inject upgrade banners into locked views
            Object.entries(PLAN_NAV_MAP).forEach(([slug, {nav, view}]) => {
                const viewEl = document.getElementById(view);
                if (!viewEl) return;
                const isAllowed = allowed.includes(slug);
                const existingBanner = viewEl.querySelector('.plan-upgrade-banner');
                if (!isAllowed && !existingBanner) {
                    const banner = document.createElement('div');
                    banner.className = 'plan-upgrade-banner';
                    banner.innerHTML = `
                        <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                            <svg viewBox="0 0 24 24" width="28" height="28" style="stroke:var(--accent);fill:none;stroke-width:1.5;flex-shrink:0;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <div>
                                <div style="font-weight:700; font-size:.95rem;">Módulo não disponível no seu plano</div>
                                <div style="font-size:.8rem; color:var(--text-dim); margin-top:2px;">Faça upgrade para acessar este módulo e muito mais.</div>
                            </div>
                            <button onclick="showUpgradeModal()" class="hub-btn-primary" style="margin-left:auto; padding:8px 18px; font-size:.8rem;">⚡ Ver Planos</button>
                        </div>`;
                    viewEl.insertBefore(banner, viewEl.firstChild);
                } else if (isAllowed && existingBanner) {
                    existingBanner.remove();
                }
            });

            // Refresh settings plan section
            window.loadSettingsPlanSection && window.loadSettingsPlanSection(plan, allowed);
        };

        // ─── LOAD SETTINGS PLAN SECTION ──────────────────────────────────
        window.loadSettingsPlanSection = function(plan, wsModules) {
            const badge = document.getElementById('settings-plan-badge');
            if (badge) {
                const cfg = PLAN_CONFIG[plan] || PLAN_CONFIG.free;
                badge.textContent = cfg.label.toUpperCase();
                badge.className = `ws-plan-badge ws-plan-${plan}`;
            }
            const grid = document.getElementById('settings-modules-grid');
            if (!grid) return;
            grid.innerHTML = '';
            ALL_MODULES_LIST.forEach(slug => {
                const label = (typeof MODULE_LABELS !== 'undefined' && MODULE_LABELS[slug]) || slug;
                const included = wsModules.includes(slug);
                const chip = document.createElement('div');
                chip.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:10px;font-size:.8rem;font-weight:600;border:1px solid ${included?'rgba(255,215,0,.25)':'rgba(255,255,255,.06)'};background:${included?'rgba(255,215,0,.08)':'rgba(255,255,255,.02)'};color:${included?'var(--accent)':'#666'};`;
                chip.innerHTML = `<span>${included?'✓':'🔒'}</span> ${label}`;
                grid.appendChild(chip);
            });
        };

        // ─── UPGRADE MODAL ────────────────────────────────────────────────
        window.showUpgradeModal = function() {
            const o = document.getElementById('upgrade-modal-overlay');
            if (o) { o.style.display='flex'; }
        };
        window.closeUpgradeModal = function() {
            const o = document.getElementById('upgrade-modal-overlay');
            if (o) { o.style.display='none'; }
        };
        // Close on overlay click
        document.getElementById('upgrade-modal-overlay')?.addEventListener('click', function(e) {
            if (e.target === this) closeUpgradeModal();
        });

        // ─── WIRE applyPlanGating into loadWorkspaces flow ───────────────
        // (called from loadWorkspaces when workspace is resolved)
        // We patch renderWsDropdown to also apply gating when workspace switches
        (function(){
            const _origSwitchWs = window.switchWorkspace;
            if (_origSwitchWs) {
                window.switchWorkspace = async function(wsId) {
                    await _origSwitchWs(wsId);
                    // After switch, reload workspace modules + plan
                    if (window.supabaseClient && wsId) {
                        const {data:ws} = await window.supabaseClient.from('workspaces')
                            .select('plan,modules').eq('id',wsId).single();
                        if (ws) window.applyPlanGating(ws.plan||'free', ws.modules||[]);
                    }
                };
            }
        })();

        //  FASE E — TEAM MANAGEMENT

        // ═══════════════════════════════════════════════════════════

        const MODULE_LABELS = {
            consolidation:'Consolidação', visitors:'Visitantes',
            ia_whatsapp:'IA WhatsApp', financeiro:'Financeiro',
            start:'START', aniversariantes:'Aniversariantes',
            crie:'CRIE', voluntarios:'Voluntários',
        };
        const ROLE_LABELS = {
            master_admin:{ label:'Master Admin', color:'rgba(255,215,0,.14)', text:'var(--accent)' },
            church_admin:{ label:'Admin da Igreja', color:'rgba(100,180,255,.14)', text:'#64b4ff' },
            user:        { label:'Lider / Voluntário', color:'rgba(100,220,150,.14)', text:'#64dc96' },
        };
        function hubAvatarColor(str) {
            const p=['#e6a817','#2d9cdb','#27ae60','#9b59b6','#e74c3c','#e67e22','#16a085','#8e44ad'];
            let s=0; for(let i=0;i<str.length;i++) s+=str.charCodeAt(i);
            return p[s%p.length];
        }
        function hubInitials(name,email) {
            if(name&&name.trim()){const p=name.trim().split(' ').filter(Boolean);return(p[0][0]+(p[1]?p[1][0]:'')).toUpperCase();}
            return (email||'?')[0].toUpperCase();
        }

        // ─── LOAD TEAM LIST ───────────────────────────────────────────────
        window.loadTeamList = async function() {
            if(!window.supabaseClient||!window.currentWorkspaceId) return;
            const tbody = document.getElementById('team-tbody');
            if(!tbody) return;
            tbody.innerHTML = `<tr><td colspan="5" style="padding:0;">
                <div class="hub-skeleton" style="height:56px;border-radius:0;margin:1px 0;"></div>
                <div class="hub-skeleton" style="height:56px;border-radius:0;margin:1px 0;"></div>
                <div class="hub-skeleton" style="height:56px;border-radius:0;margin:1px 0;"></div>
            </td></tr>`;
            const sb = window.supabaseClient;
            const { data: members } = await sb.from('users')
                .select('id,name,email,role,status,level')
                .eq('workspace_id', window.currentWorkspaceId)
                .order('name');
            const moduleMap = {};
            if(members?.length) {
                await Promise.all(members.map(async m => {
                    const {data:ma} = await sb.from('module_access')
                        .select('module_slug').eq('user_id',m.id).eq('workspace_id',window.currentWorkspaceId);
                    moduleMap[m.id] = (ma||[]).map(r=>r.module_slug);
                }));
            }
            if(!members||members.length===0){
                tbody.innerHTML=`<tr><td colspan="5" style="padding:30px;text-align:center;color:var(--text-dim);">Nenhum membro ainda. Convide sua equipe!</td></tr>`;
                return;
            }
            tbody.innerHTML='';
            members.forEach(m=>{
                const role=ROLE_LABELS[m.role]||ROLE_LABELS.user;
                const active=m.status==='ativo'||m.status==='active';
                const modules=moduleMap[m.id]||[];
                const color=hubAvatarColor(m.id);
                const initials=hubInitials(m.name,m.email);
                const modBadges=modules.length
                    ?modules.map(slug=>`<span class="hub-module-badge">${MODULE_LABELS[slug]||slug}</span>`).join('')
                    :`<span style="color:var(--text-dim);font-size:.78rem;">Acesso geral</span>`;
                const tr=document.createElement('tr');
                tr.style.cssText='border-bottom:1px solid rgba(255,255,255,.05);transition:background .15s;';
                tr.onmouseenter=()=>tr.style.background='rgba(255,255,255,.025)';
                tr.onmouseleave=()=>tr.style.background='';
                tr.innerHTML=`
                    <td style="padding:14px 18px;">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div style="background:${color};color:#fff;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95rem;flex-shrink:0;">${initials}</div>
                            <div>
                                <div style="font-weight:600;font-size:.9rem;">${m.name||'—'}</div>
                                <div style="color:var(--text-dim);font-size:.78rem;">${m.email}</div>
                            </div>
                        </div>
                    </td>
                    <td style="padding:14px 18px;">
                        <span style="background:${role.color};color:${role.text};padding:3px 10px;border-radius:6px;font-size:.75rem;font-weight:600;">${role.label}</span>
                    </td>
                    <td style="padding:14px 18px;max-width:240px;">
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">${modBadges}</div>
                    </td>
                    <td style="padding:14px 18px;">
                        <span class="hub-status-dot ${active?'active':'inactive'}" style="display:inline-block;margin-right:5px;"></span>
                        <span style="font-size:.82rem;color:${active?'#25D366':'#888'};">${active?'Ativo':'Inativo'}</span>
                    </td>
                    <td style="padding:14px 18px;">
                        <button onclick="toggleUserStatus('${m.id}','${m.status}')"
                            style="background:${active?'rgba(231,76,60,.12)':'rgba(37,211,102,.1)'};color:${active?'#e74c3c':'#25D366'};border:1px solid ${active?'rgba(231,76,60,.3)':'rgba(37,211,102,.3)'};border-radius:8px;padding:5px 12px;font-size:.75rem;cursor:pointer;font-weight:600;white-space:nowrap;">
                            ${active?'Desativar':'Reativar'}
                        </button>
                    </td>`;
                tbody.appendChild(tr);
            });
        };

        // ─── OPEN ADD USER MODAL ──────────────────────────────────────────
        window.openAddUserModal = async function() {
            const overlay = document.getElementById('invite-modal-overlay');
            if(!overlay) return;
            const grid = document.getElementById('invite-modules-grid');
            grid.innerHTML='';
            let wsModules=Object.keys(MODULE_LABELS);
            if(window.currentWorkspaceId&&window.supabaseClient){
                const {data:ws}=await window.supabaseClient.from('workspaces').select('modules').eq('id',window.currentWorkspaceId).single();
                if(ws?.modules?.length) wsModules=ws.modules;
            }
            wsModules.forEach(slug=>{
                const label=MODULE_LABELS[slug]||slug;
                const chip=document.createElement('label');
                chip.className='hub-module-chip selected';
                chip.innerHTML=`<input type="checkbox" value="${slug}" style="display:none;" checked> ${label}`;
                chip.onclick=()=>chip.classList.toggle('selected');
                grid.appendChild(chip);
            });
            overlay.style.display='flex';
        };

        // ─── CLOSE INVITE MODAL ───────────────────────────────────────────
        window.closeInviteModal = function() {
            const o=document.getElementById('invite-modal-overlay');
            if(o) o.style.display='none';
            ['invite-name','invite-email'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
        };

        // ─── INVITE TEAM MEMBER ───────────────────────────────────────────
        window.inviteTeamMember = async function() {
            if(!window.supabaseClient||!window.currentWorkspaceId) return;
            const name  = document.getElementById('invite-name').value.trim();
            const email = document.getElementById('invite-email').value.trim();
            const role  = document.getElementById('invite-role').value;
            if(!name||!email){ hubToast('Nome e e-mail são obrigatórios.','warn'); return; }
            const chips = document.querySelectorAll('#invite-modules-grid .hub-module-chip.selected input');
            const modules = Array.from(chips).map(cb=>cb.value);
            const sb=window.supabaseClient;
            const {data:newUser,error:uErr}=await sb.from('users').insert({
                email,name,role,
                workspace_id:window.currentWorkspaceId,
                level:'workspace',status:'ativo'
            }).select('id').single();
            if(uErr){ hubToast('Erro: '+uErr.message,'error'); return; }
            if(modules.length&&newUser?.id){
                await sb.from('module_access').insert(
                    modules.map(slug=>({user_id:newUser.id,workspace_id:window.currentWorkspaceId,module_slug:slug}))
                );
            }
            hubToast(`Convite enviado para ${email}!`,'success');
            closeInviteModal();
            window.loadTeamList();
        };

        // ─── TOGGLE USER STATUS ───────────────────────────────────────────
        window.toggleUserStatus = async function(userId, currentStatus) {
            if(!window.supabaseClient) return;
            const isActive=currentStatus==='ativo'||currentStatus==='active';
            if(!confirm(`${isActive?'Desativar':'Reativar'} este membro?`)) return;
            const {error}=await window.supabaseClient.from('users').update({status:isActive?'inativo':'ativo'}).eq('id',userId);
            if(error){ hubToast('Erro: '+error.message,'error'); return; }
            hubToast(isActive?'Membro desativado.':'Membro reativado!','success');
            window.loadTeamList();
        };

        // ─── APPLY MODULES NAV ────────────────────────────────────────────
        window.applyModulesNav = function(modules) {
            if(!modules||!Array.isArray(modules)||modules.length===0) return;
            const navMap={visitors:'nav-visitors',consolidation:'nav-dashboard'};
            Object.entries(navMap).forEach(([slug,navId])=>{
                const el=document.getElementById(navId); if(!el) return;
                if(!modules.includes(slug)){el.style.opacity='0.4';el.style.pointerEvents='none';el.title='Módulo não disponível';}
                else{el.style.opacity='';el.style.pointerEvents='';el.title='';}
            });
        };

        // ─── PATCH switchTab to load users ─────────────────────────────
        (function(){
            const _orig=window.switchTab;
            window.switchTab=function(tabName){
                _orig(tabName);
                if(tabName==='users'&&window.loadTeamList) window.loadTeamList();
            };
        })();

        // Custom Modal UI

        window.showModal = function(title, contentHTML) {
            document.getElementById('custom-modal-title').innerText = title;
            document.getElementById('custom-modal-content').innerHTML = contentHTML;
            document.getElementById('custom-modal-overlay').style.display = 'flex';
        }
        window.closeModal = function() {
            document.getElementById('custom-modal-overlay').style.display = 'none';
        }

        window.maskDate = function(ref) {
            let v = ref.value.replace(/\D/g, '');
            if (v.length > 8) v = v.substring(0, 8);
            if (v.length >= 5) {
                ref.value = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, "$1/$2/$3");
            } else if (v.length >= 3) {
                ref.value = v.replace(/^(\d{2})(\d{1,2}).*/, "$1/$2");
            } else {
                ref.value = v;
            }
        };

        // ============================================================
        // PHASE 3: LIVE AUDIT LOGS FROM SUPABASE
        // ============================================================
        let allAuditLogs = [];
        let activeLogFilter = 'all';

        window.loadAuditLogs = async function() {
            const container = document.getElementById('logs-container');
            if (!container) return;
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">⏳ Carregando...</div>';
            try {
                const { data, error } = await window.supabaseClient
                    .from('app_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(100);
                if (error) throw error;
                allAuditLogs = data || [];
                renderAuditLogs();
            } catch(e) {
                container.innerHTML = `<div style="padding:20px;color:#ff6b6b;">❌ Erro ao carregar logs: ${e.message}</div>`;
            }
        };

        window.filterLogs = function(type) {
            activeLogFilter = type;
            // Update button styles
            ['all','update','bug','feature_request'].forEach(t => {
                const btn = document.getElementById(`log-filter-${t}`);
                if (btn) {
                    btn.style.background = t === type ? 'rgba(255,215,0,0.15)' : '';
                    btn.style.borderColor = t === type ? 'var(--accent)' : '';
                    btn.style.color = t === type ? 'var(--accent)' : '';
                }
            });
            renderAuditLogs();
        };

        function renderAuditLogs() {
            const container = document.getElementById('logs-container');
            if (!container) return;
            const filtered = activeLogFilter === 'all'
                ? allAuditLogs
                : allAuditLogs.filter(l => l.type === activeLogFilter);

            if (filtered.length === 0) {
                container.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-dim);">Nenhum log encontrado.</div>';
                return;
            }

            const typeConfig = {
                update: { icon: '🆕', color: '#4CAF50', label: 'Atualização' },
                bug: { icon: '🐛', color: '#FF6B6B', label: 'Bug' },
                feature_request: { icon: '💡', color: '#FFD700', label: 'Sugestão' }
            };

            container.innerHTML = filtered.map(log => {
                const cfg = typeConfig[log.type] || { icon: '📋', color: '#8696a0', label: log.type };
                const date = new Date(log.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
                const time = new Date(log.created_at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
                const statusColors = { published: '#4CAF50', in_progress: '#FFD700', pending: '#8696a0' };
                const statusLabels = { published: 'Publicado', in_progress: 'Em Progresso', pending: 'Pendente' };
                return `
                    <div class="log-item" style="border-left: 3px solid ${cfg.color}; padding: 14px 18px; margin-bottom: 8px; border-radius: 0 10px 10px 0; background: rgba(255,255,255,0.03);">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
                            <span style="font-size:1.1rem;">${cfg.icon}</span>
                            <span style="color:${cfg.color};font-size:0.75rem;font-weight:600;border:1px solid ${cfg.color}40;padding:2px 8px;border-radius:6px;">${cfg.label}</span>
                            <span style="color:var(--text-main);font-weight:600;">${log.title || '(sem título)'}</span>
                            <span style="margin-left:auto;color:var(--text-dim);font-size:0.75rem;">${date} ${time}</span>
                            <span style="color:${statusColors[log.status]||'#8696a0'};font-size:0.75rem;border:1px solid ${statusColors[log.status]||'#8696a0'}40;padding:2px 8px;border-radius:6px;">${statusLabels[log.status]||log.status}</span>
                        </div>
                        ${log.description ? `<div style="color:var(--text-dim);font-size:0.85rem;line-height:1.5;">${log.description}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        // Legacy session logger (kept for internal use)
        let mockLogs = [];
        window.addLog = function(msg) {
            mockLogs.unshift({time: new Date(), msg: msg});
        };

        // ============================================================
        // PHASE 3: LIVE TEAM LIST FROM SUPABASE
        // ============================================================
        window.loadTeamList = async function() {
            const container = document.getElementById('team-list-container');
            if (!container || !window.supabaseClient) return;
            try {
                const { data, error } = await window.supabaseClient
                    .from('users')
                    .select('id, email, role, workspace_id')
                    .order('role', { ascending: true });
                if (error || !data || data.length === 0) {
                    container.innerHTML = '<div style="color:var(--text-dim);font-size:0.85rem;padding:10px 0;">Nenhum usuário cadastrado ainda.</div>';
                    return;
                }
                const roleColors = { master_admin: '#FFD700', church_admin: '#4CAF50', user: '#8696a0' };
                const roleLabels = { master_admin: 'Master Admin', church_admin: 'Admin', user: 'Usuário' };
                container.innerHTML = `
                    <table style="width:100%;border-collapse:collapse;margin-top:10px;border-radius:10px;overflow:hidden;">
                        <thead>
                            <tr style="background:rgba(255,255,255,0.05);">
                                <th style="padding:12px 15px;text-align:left;font-size:0.8rem;color:var(--text-dim);">USUÁRIO</th>
                                <th style="padding:12px 15px;text-align:left;font-size:0.8rem;color:var(--text-dim);">NÍVEL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(u => {
                                const initials = (u.email || '?').substring(0,2).toUpperCase();
                                const color = roleColors[u.role] || '#8696a0';
                                const label = roleLabels[u.role] || u.role;
                                return `
                                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                                    <td style="padding:14px 15px;display:flex;align-items:center;gap:12px;">
                                        <div style="background:${color}22;color:${color};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;border:1px solid ${color}44;">${initials}</div>
                                        <span style="color:var(--text-main);font-size:0.88rem;">${u.email}</span>
                                    </td>
                                    <td style="padding:14px 15px;"><span style="color:${color};border:1px solid ${color}44;padding:3px 10px;border-radius:6px;font-size:0.75rem;font-weight:600;">${label}</span></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            } catch(e) {
                container.innerHTML = `<div style="color:#ff6b6b;font-size:0.85rem;">Erro ao carregar equipe: ${e.message}</div>`;
            }
        };

        // ============================================================
        // PHASE 3: REAL KPIs FROM SUPABASE
        // ============================================================
        window.loadRealKPIs = async function() {
            if (!window.supabaseClient) return;
            try {
                const [leadsRes, msgsRes] = await Promise.all([
                    window.supabaseClient.from('leads').select('id, type', { count: 'exact', head: false }),
                    window.supabaseClient.from('messages').select('id, automated, direction', { count: 'exact', head: false })
                ]);
                const leads = leadsRes.data || [];
                const msgs = msgsRes.data || [];
                const totalLeads = leads.length;
                const consolidados = leads.filter(l => l.type !== 'visitor').length;
                const visitors = leads.filter(l => l.type === 'visitor').length;
                const aiMsgs = msgs.filter(m => m.automated && m.direction === 'outbound').length;
                const humanMsgs = msgs.filter(m => !m.automated && m.direction === 'outbound').length;

                // Update home KPIs if they exist
                const kpiEl = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
                kpiEl('kpi-total-leads', totalLeads);
                kpiEl('kpi-consolidados-count', consolidados);
                kpiEl('kpi-visitors-count', visitors);
                kpiEl('kpi-ai-messages', aiMsgs);
                kpiEl('kpi-human-messages', humanMsgs);
            } catch(e) {
                console.warn('KPI load error:', e.message);
            }
        };

        window.clearFilters = function() {
            document.getElementById('searchInput').value = '';
            document.getElementById('filterStatus').value = 'all';
            document.getElementById('filterCulto').value = 'all';
            document.getElementById('filterTimeRange').value = '7';
            document.getElementById('filterDate').value = 'recent';
            if(window.toggleCustomDates) window.toggleCustomDates();
            if(window.applyFilters) window.applyFilters();
        }


        document.addEventListener('DOMContentLoaded', () => {
            // H1 (Fase H): supabaseClient is already created by hub.js — no duplicate init needed
            const supabase = window.supabaseClient;

            const leadsContainer = document.getElementById('leads-container');
            window.globalLeads = [];
            window.globalConsolidados = [];
            window.globalVisitors = [];
            let globalLeads = window.globalLeads; // local alias
            let globalConsolidados = window.globalConsolidados;
            let globalVisitors = window.globalVisitors;
            let chartInstances = {};

            function reportError(msg) {
                const lc = document.getElementById('leads-container');
                if (lc) lc.innerHTML = `<div style="grid-column:1/-1; color:#FF6B6B; padding:30px; text-align:center; background:rgba(255,107,107,0.1); border-radius:12px;">Erro Técnico Detectado:<br><b>${msg}</b></div>`;
                const vc = document.getElementById('visitors-container');
                if (vc) vc.innerHTML = `<div style="grid-column:1/-1; color:#FF6B6B; padding:30px; text-align:center; background:rgba(255,107,107,0.1); border-radius:12px;">Erro Técnico Detectado:<br><b>${msg}</b></div>`;
            }

            // Bind filters
            window.toggleCustomDates = function() {
                const val = document.getElementById('filterTimeRange').value;
                const container = document.getElementById('custom-date-container');
                if(container) container.style.display = (val === 'custom') ? 'flex' : 'none';
            };
            document.getElementById('searchInput').addEventListener('input', () => { if(window.applyFilters) applyFilters(); });
            document.getElementById('filterStatus').addEventListener('change', () => { if(window.applyFilters) applyFilters(); });
            document.getElementById('filterCulto').addEventListener('change', () => { if(window.applyFilters) applyFilters(); });
            document.getElementById('filterDate').addEventListener('change', () => { if(window.applyFilters) applyFilters(); });
            document.getElementById('filterTimeRange').addEventListener('change', () => { if(window.applyFilters) applyFilters(); });
            document.getElementById('customDateStart').addEventListener('change', () => { if(window.applyFilters) applyFilters(); });
            document.getElementById('customDateEnd').addEventListener('change', () => { if(window.applyFilters) applyFilters(); });
            
            function initEngine() {
                if(window.fetchLiveLeads) window.fetchLiveLeads();
                setTimeout(() => { if(window.loadRealKPIs) window.loadRealKPIs(); }, 1500);
            }

            function initCharts() {
                const commonOpts = { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    cutout: '70%', 
                    plugins: { 
                        legend: { position: 'right', labels: { color: '#CCC', font: {family: 'Outfit', size: 10}, usePointStyle: true, boxWidth: 6, padding: 10 } },
                        tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', titleFont: {family: 'Outfit'}, bodyFont: {family: 'Outfit'} }
                    },
                    borderWidth: 0,
                    hoverOffset: 4,
                    onClick: (evt, activeEls, chart) => {
                        if (activeEls.length > 0) {
                            const index = activeEls[0].index;
                            const labelClicked = chart.data.labels[index];
                            
                            // Auto trigger filters based on chart type!
                            const chartId = chart.canvas.id;
                            if (chartId === 'chartCulto') {
                                document.getElementById('filterCulto').value = String(labelClicked).toLowerCase();
                                if(window.applyFilters) applyFilters();
                            } else if (chartId === 'chartDecisao') {
                                document.getElementById('filterStatus').value = String(labelClicked).toLowerCase();
                                if(window.applyFilters) applyFilters();
                            }
                        }
                    }
                };

                ['Idade', 'Pais', 'Batizado', 'GC'].forEach(type => {
                    const canvasEl = document.getElementById('vChart'+type);
                    if(canvasEl) {
                        chartInstances['v'+type] = new Chart(canvasEl.getContext('2d'), {
                            type: 'doughnut',
                            data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: 'transparent' }] },
                            options: commonOpts
                        });
                    }
                });

                ['Culto', 'Pais', 'Decisao', 'GC'].forEach(type => {
                    const canvasEl = document.getElementById('chart'+type);
                    if(canvasEl) {
                        const ctx = canvasEl.getContext('2d');
                        chartInstances[type] = new Chart(ctx, {
                            type: 'doughnut',
                            data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
                            options: commonOpts
                        });
                    }
                });
            }

            function getFrequencies(arr) {
                return arr.reduce((acc, curr) => {
                    if(!curr) return acc;
                    acc[curr] = (acc[curr] || 0) + 1;
                    return acc;
                }, {});
            }

            function populateSelect(id, itemsSet, defaultStr) {
                const select = document.getElementById(id);
                if(!select) return;
                const currentVal = select.value;
                select.innerHTML = `<option value="all">${defaultStr}</option>` + 
                                   Array.from(itemsSet).map(s => `<option value="${String(s).toLowerCase()}">${s}</option>`).join('');
                if(Array.from(itemsSet).some(s => String(s).toLowerCase() === currentVal)) { select.value = currentVal; }
            }

            window.updateVisitorCharts = function(visitorsArray) {
                if(Object.keys(chartInstances).length === 0) return;
                
                const getFrequencies = arr => {
                    const counts = {};
                    arr.forEach(val => { const str = (val || 'Não Informado'); counts[str] = (counts[str] || 0) + 1; });
                    return Object.entries(counts).sort((a,b) => b[1] - a[1]); // Descending
                };
                
                const paisFreq = getFrequencies(visitorsArray.map(l => String(l.pais)));
                const batizadoFreq = getFrequencies(visitorsArray.map(l => String(l.batizado)));
                const gcFreq = getFrequencies(visitorsArray.map(l => String(l.gc_status)));
                
                // Group Idade
                const idades = {'18 a 25': 0, '26 a 35': 0, '36 a 45': 0, 'Acima de 45': 0, 'Não Informado': 0};
                visitorsArray.forEach(l => {
                    let v = parseInt(String(l.idade).replace(/\D/g, ''));
                    if (isNaN(v)) { idades['Não Informado']++; return; }
                    if (v < 26) idades['18 a 25']++;
                    else if (v <= 35) idades['26 a 35']++;
                    else if (v <= 45) idades['36 a 45']++;
                    else idades['Acima de 45']++;
                });
                const idadeFreq = Object.entries(idades).filter(x => x[1] > 0).sort((a,b) => b[1] - a[1]);

                const colorPalette = ['#FFD700', '#FF6B6B', '#32CD32', '#00BFFF', '#BA55D3', '#FFA500', '#FF8C00', '#FFFFFF'];

                function setChartData(instance, dataObj) {
                    if(!instance) return;
                    instance.data.labels = dataObj.map(d => d[0]);
                    instance.data.datasets[0].data = dataObj.map(d => d[1]);
                    instance.data.datasets[0].backgroundColor = dataObj.map((_, i) => colorPalette[i % colorPalette.length]);
                    instance.update();
                }

                setChartData(chartInstances['vIdade'], idadeFreq);
                setChartData(chartInstances['vPais'], paisFreq);
                setChartData(chartInstances['vBatizado'], batizadoFreq);
                setChartData(chartInstances['vGC'], gcFreq);
            };

            function updateCharts(leadsArray) {
                if(Object.keys(chartInstances).length === 0) return;
                
                const cultos = getFrequencies(leadsArray.map(l => String(l.culto)));
                const paises = getFrequencies(leadsArray.map(l => String(l.pais)));
                const decisoes = getFrequencies(leadsArray.map(l => String(l.decisao)));
                const gcs = getFrequencies(leadsArray.map(l => String(l.gc_status)));

                const colorPalette = ['#FFD700', '#FF6B6B', '#32CD32', '#00BFFF', '#BA55D3', '#FFA500', '#FF8C00', '#FFFFFF'];

                function setChartData(instance, dataObj) {
                    if(!instance) return;
                    const labels = Object.keys(dataObj);
                    const data = Object.values(dataObj);
                    const bgColors = labels.map((_, i) => colorPalette[i % colorPalette.length]);
                    
                    instance.data.labels = labels;
                    instance.data.datasets[0].data = data;
                    instance.data.datasets[0].backgroundColor = bgColors;
                    instance.update();
                }

                setChartData(chartInstances.Culto, cultos);
                setChartData(chartInstances.Pais, paises);
                setChartData(chartInstances.Decisao, decisoes);
                setChartData(chartInstances.GC, gcs);
            }
            
            function updateTopKPIs(leadsArray) {
                const total = leadsArray.length;
                let c1 = total;
                let c2 = leadsArray.filter(l => Boolean(l.task_start)).length;
                let c_gc = leadsArray.filter(l => Boolean(l.task_gc)).length;
                let c3 = leadsArray.filter(l => Boolean(l.task_batismo)).length;
                let c4 = leadsArray.filter(l => Boolean(l.task_cafe)).length;

                function animateKpi(id, val) {
                    const el = document.getElementById(id);
                    if (!el) return;
                    const prev = parseInt(el.innerText) || 0;
                    if (typeof hubCountUp === 'function') {
                        hubCountUp(el, val, 900);
                    } else {
                        el.innerText = val;
                    }
                }

                animateKpi('kpi-t1', c1);
                animateKpi('kpi-total-1', total);
                animateKpi('kpi-t2', c2);
                animateKpi('kpi-total-2', total);
                animateKpi('kpi-tgc', c_gc);
                animateKpi('kpi-total-gc', total);
                animateKpi('kpi-t3', c3);
                animateKpi('kpi-total-3', total);
                animateKpi('kpi-t4', c4);
                animateKpi('kpi-total-4', total);
            }

            window.fetchLiveLeads = async function() {
                try {
                    const sb = window.supabaseClient;
                    if (!sb) { console.error('fetchLiveLeads: supabaseClient not ready'); return; }

                    const wsId = window.currentWorkspaceId;
                    if (!wsId) { console.warn('fetchLiveLeads: no currentWorkspaceId — waiting and retrying'); 
                        setTimeout(() => { if (window.currentWorkspaceId) window.fetchLiveLeads(); }, 500);
                        return; 
                    }

                    const leadsContainer = document.getElementById('leads-container');
                    const visitorContainer = document.getElementById('visitors-container');
                    const skeletonRows = Array.from({length:6}, () =>
                        `<div class="hub-skeleton hub-skeleton-row"></div>`
                    ).join('');
                    if (leadsContainer) leadsContainer.innerHTML = `<div style="grid-column:1/-1;padding:8px 0;">${skeletonRows}</div>`;
                    if (visitorContainer) visitorContainer.innerHTML = `<div style="grid-column:1/-1;padding:8px 0;">${skeletonRows}</div>`;

                    let allLeads = [];
                    let start = 0;
                    const step = 1000;
                    let hasMore = true;

                    while(hasMore) {
                        // CRITICAL: Always filter by workspace_id to avoid cross-contamination
                        const { data, error } = await sb.from('leads')
                                .select('*')
                                .eq('workspace_id', wsId)
                                .order('created_at', { ascending: false })
                                .range(start, start + step - 1);
                        
                        if (error) { 
                            console.error('fetchLiveLeads error:', error.message);
                            return; 
                        }

                        if (data && data.length > 0) {
                            allLeads.push(...data);
                            start += step;
                            if (data.length < step) hasMore = false;
                        } else {
                            hasMore = false;
                        }
                    }

                    if(allLeads.length === 0) {
                        console.log("A base de leads retornou 0 registros — base vazia ou nova.");
                        // DO NOT RETURN! Allow the UI to render with 0 items normally.
                    }

                    window._allSaved = allLeads.filter(l => (l.type || 'saved').toLowerCase() === 'saved');
                    window._allVisit = allLeads.filter(l => (l.type || '').toLowerCase() === 'visitor');
                    const leads = allLeads;

                    const mock_decisions = ["Aceitei Jesus", "Reconciliação", "Quero ser membro", "Mudei de Igreja"];
                    const mock_cultos = ["Hope", "Fé", "Legacy", "Rocket", "Domingo Manhã", "Domingo Noite"];
                    const mock_paises = ["Brasil", "EUA", "EUA", "EUA", "Portugal", "Reino Unido", "Japão"];
                    const mock_gcs = ["Sim", "Quero Participar", "Não"];

                    // Tag Mapping
                    const mappedByPhone = {};
                    leads.forEach(l => {
                        const p = String(l.phone||'').replace(/\D/g, '');
                        if(!mappedByPhone[p]) mappedByPhone[p] = [];
                        mappedByPhone[p].push(l);
                    });

                    let setDecisao = new Set();
                    let setCultos = new Set();
                    let setPaises = new Set();

                    globalLeads = window.globalLeads = leads.map(lead => {
                        if (!lead.decisao) lead.decisao = "Não Informado";
                        if (!lead.culto) lead.culto = "Não Informado";
                        if (!lead.pais) lead.pais = "Não Informado";
                        if (!lead.gc_status) lead.gc_status = "Não Informado";
                        if (!lead.created_at) lead.created_at = new Date().toISOString();

                        lead.task_start = Boolean(lead.task_start);
                        lead.task_gc = Boolean(lead.task_gc);
                        lead.task_batismo = Boolean(lead.task_batismo);
                        lead.task_cafe = Boolean(lead.task_cafe);
                        lead.task_followup = Boolean(lead.task_followup);
                        
                        const myDate = new Date(lead.created_at);
                        const myType = lead.type || 'saved';
                        const p = String(lead.phone||'').replace(/\D/g, '');
                        const em = String(lead.email||'').trim().toLowerCase();
                        
                        let related = null;
                        if (p !== '' || em !== '') {
                            // Find any lead in the whole array that has different type and same phone OR email
                            related = leads.find(other => {
                                if(other.id === lead.id) return false;
                                const otherType = other.type || 'saved';
                                if(otherType === myType) return false; // Must be cross-form
                                
                                const op = String(other.phone||'').replace(/\D/g, '');
                                const oem = String(other.email||'').trim().toLowerCase();
                                
                                const match = (p !== '' && p === op) || (em !== '' && em === oem);
                                if (!match) return false;
                                
                                const otherDate = new Date(other.created_at);
                                return Math.abs(myDate - otherDate) / (1000 * 3600) <= 24;
                            });
                        }

                        lead.hasCrossTag = !!related;
                        lead.crossTagType = related ? (related.type || 'saved') : null;

                        if (myType !== 'visitor') {
                            setDecisao.add(String(lead.decisao));
                            setCultos.add(String(lead.culto));
                        } else {
                            setPaises.add(String(lead.pais));
                        }
                        return lead;
                    });
                    
                    globalConsolidados = window.globalConsolidados = globalLeads.filter(l => l.type !== 'visitor');
                    globalVisitors = window.globalVisitors = globalLeads.filter(l => l.type === 'visitor');

                    populateSelect('filterStatus', setDecisao, 'Todas as Decisões');
                    populateSelect('filterCulto', setCultos, 'Qualquer Culto');
                    populateSelect('vFilterCountry', setPaises, 'Todos os Países...');

                    if(Object.keys(chartInstances).length === 0) {
                        initCharts();
                    }
                    if(window.applyFilters) applyFilters();
                    // Refresh the WA chat sidebar now that leads are loaded
                    if(window.renderWAChatList) renderWAChatList();

                } catch (err) {
                    reportError("Erro JavaScript em fetchLiveLeads: " + err.message);
                }
            }

            window.toggleTask = async function(leadId, taskName, checkboxElem) {
                try {
                    const isChecked = checkboxElem.checked;
                    const taskMeta = checkboxElem.closest('.task-item').querySelector('.task-meta');
                    
                    if(isChecked) {
                        const dStr = new Date().toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
                        taskMeta.innerHTML = `<span style="color: rgba(255,215,0,0.8);">Realizado por <b>Gabriel T.</b> em ${dStr}</span>`;
                        addLog(`<strong style="color:var(--accent);">Gabriel T.</strong> concluiu "${taskName}"`);
                    } else {
                        taskMeta.innerHTML = '';
                        addLog(`<span style="color:#FF6B6B;">Gabriel T.</span> desmarcou "${taskName}"`);
                    }
                    
                    const ld = globalLeads.find(l => String(l.id) === String(leadId));
                    if(ld) {
                        if(taskName === 'Convidar p/ Start') ld.task_start = isChecked;
                        if(taskName === 'Convidar p/ GC' || taskName === 'Convite para GC') ld.task_gc = isChecked;
                        if(taskName === 'Convite de Batismo') ld.task_batismo = isChecked;
                        if(taskName === 'Café Novos Membros') ld.task_cafe = isChecked;
                        if(taskName === 'Follow-up Humano') ld.task_followup = isChecked;
                    }
                    
                    // Light rebuild
                    const timeRangeDays = parseInt(document.getElementById('filterTimeRange').value);
                    const subset = globalLeads.filter(l => {
                        const leadDate = new Date(l.created_at);
                        const diffDays = (new Date() - leadDate) / (1000 * 3600 * 24);
                        return isNaN(timeRangeDays) || diffDays <= timeRangeDays;
                    });
                    updateTopKPIs(subset);
                } catch (err) {
                    console.error("Erro toggleTask:", err);
                }
            };

            window.applyFilters = function() {
                try {
                    const searchTxt = String(document.getElementById('searchInput').value || '').toLowerCase();
                    const stat = document.getElementById('filterStatus').value.toLowerCase();
                    const culto = document.getElementById('filterCulto').value.toLowerCase();
                    const sortOrder = document.getElementById('filterDate').value;
                    const timeRangeDays = document.getElementById('filterTimeRange').value;

                    let filtered = globalConsolidados.filter(lead => {
                        const decisao = String(lead.decisao || '').toLowerCase();
                        const cultoVal = String(lead.culto || '').toLowerCase();
                        const nameStr = String(lead.name || '').toLowerCase();
                        const phoneStr = String(lead.phone || '').toLowerCase();

                        const matchName = nameStr.includes(searchTxt) || phoneStr.includes(searchTxt);
                        const matchStat = (stat === 'all') || (decisao === stat);
                        const matchCulto = (culto === 'all') || (cultoVal === culto);
                        
                        let matchTime = true;
                        if (timeRangeDays !== 'all') {
                            const leadDate = new Date(lead.created_at);
                            if (isNaN(leadDate.valueOf())) {
                                matchTime = false;
                            } else {
                                const now = new Date();
                                const diffTime = now - leadDate;
                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                
                                if (timeRangeDays === '7') matchTime = diffDays <= 7;
                                else if (timeRangeDays === '30') matchTime = diffDays <= 30;
                                else if (timeRangeDays === 'this_month') {
                                    matchTime = leadDate.getMonth() === now.getMonth() && leadDate.getFullYear() === now.getFullYear();
                                }
                                else if (timeRangeDays === 'last_month') {
                                    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                                    matchTime = leadDate.getMonth() === lm.getMonth() && leadDate.getFullYear() === lm.getFullYear();
                                }
                                else if (timeRangeDays === 'this_year') {
                                    matchTime = leadDate.getFullYear() === now.getFullYear();
                                }
                                else if (timeRangeDays === 'last_year') {
                                    matchTime = leadDate.getFullYear() === now.getFullYear() - 1;
                                }
                                else if (timeRangeDays === 'custom') {
                                    const dStart = document.getElementById('customDateStart').value; // expected DD/MM/AAAA
                                    const dEnd = document.getElementById('customDateEnd').value;
                                    
                                    function parseBrDate(dStr, isEnd=false) {
                                        if(!dStr || dStr.length !== 10) return null;
                                        const parts = dStr.split('/');
                                        if (parts.length !== 3) return null;
                                        const strParse = `${parts[2]}-${parts[1]}-${parts[0]}T${isEnd?'23:59:59':'00:00:00'}`;
                                        return new Date(strParse);
                                    }
                                    
                                    const pStart = parseBrDate(dStart, false);
                                    const pEnd = parseBrDate(dEnd, true);
                                    
                                    if(pStart && leadDate < pStart) matchTime = false;
                                    if(pEnd && leadDate > pEnd) matchTime = false;
                                } else if (timeRangeDays === '__top_custom__') {
                                    const s = window._topCustomStart;
                                    const e = window._topCustomEnd;
                                    if (s) {
                                        const pS = new Date(s + 'T00:00:00');
                                        const pE = e ? new Date(e + 'T23:59:59') : new Date();
                                        if (leadDate < pS || leadDate > pE) matchTime = false;
                                    }
                                }
                            }
                        }

                        return matchName && matchStat && matchCulto && matchTime;
                    });

                    if(sortOrder === 'oldest') {
                        filtered.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
                    } else {
                        filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
                    }

                    updateTopKPIs(filtered);
                    updateCharts(filtered);
                    renderCards(filtered, 'leads-container');

                    // Visitors Filter
                    const vSearch = String(document.getElementById('vSearchInput').value || '').toLowerCase();
                    const vCountry = document.getElementById('vFilterCountry').value;
                    const vSortOrder = document.getElementById('vFilterDate') ? document.getElementById('vFilterDate').value : 'newest';
                    const vTimeRangeDays = document.getElementById('vFilterTimeRange').value;
                    
                    let vFiltered = globalVisitors.filter(lead => {
                        const nameStr = String(lead.name || '').toLowerCase();
                        const phoneStr = String(lead.phone || '').toLowerCase();
                        const matchName = nameStr.includes(vSearch) || phoneStr.includes(vSearch);
                        const matchC = (vCountry === 'all') || (String(lead.pais||'').toLowerCase() === vCountry);
                        
                        let matchTime = true;
                        if (vTimeRangeDays !== 'all') {
                            const leadDate = new Date(lead.created_at);
                            if (isNaN(leadDate.valueOf())) { matchTime = false; }
                            else {
                                const now = new Date();
                                const diffTime = now - leadDate;
                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                
                                if (vTimeRangeDays === '7') matchTime = diffDays <= 7;
                                else if (vTimeRangeDays === '30') matchTime = diffDays <= 30;
                                else if (vTimeRangeDays === 'today') matchTime = diffDays <= 1;
                            }
                        }
                        return matchName && matchC && matchTime;
                    });
                    
                    if(vSortOrder === 'oldest') {
                        vFiltered.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
                    } else {
                        vFiltered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
                    }
                    
                    renderCards(vFiltered, 'visitors-container');
                    
                    // Update Visitor KPIs
                    const vTotal = vFiltered.length;
                    document.querySelectorAll('.vkpi-total-all').forEach(el => el.innerText = vTotal);
                    if(document.getElementById('vkpi-t1')) document.getElementById('vkpi-t1').innerText = vTotal; // Welcome message (IA)
                    if(document.getElementById('vkpi-t2')) document.getElementById('vkpi-t2').innerText = vFiltered.filter(l => l.task_gc).length;
                    if(document.getElementById('vkpi-t3')) document.getElementById('vkpi-t3').innerText = vFiltered.filter(l => l.task_followup).length;
                    
                    if(window.updateVisitorCharts) window.updateVisitorCharts(vFiltered);

                } catch(err) {
                    reportError("Erro na Aplicação de Filtros: " + err.message);
                }
            }

            function renderCards(leadsToRender, targetContainerId = 'leads-container') {
                const tContainer = document.getElementById(targetContainerId);
                if (!tContainer) return;
                tContainer.innerHTML = '';
                
                if (!Array.isArray(leadsToRender) || leadsToRender.length === 0) {
                    tContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 50px; border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px;">Busca sem resultados nesse período ou combo de filtros.</div>';
                    return;
                }

                leadsToRender.forEach(lead => {
                    const dateObj = new Date(lead.created_at);
                    
                    let dateStr = 'Recente';
                    if (!isNaN(dateObj.valueOf())) {
                        const dd = String(dateObj.getDate()).padStart(2, '0');
                        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const yyyy = dateObj.getFullYear();
                        dateStr = `${dd}/${mm}/${yyyy}`;
                    }

                    const cap = str => String(str).charAt(0).toUpperCase() + String(str).slice(1);
                    
                    const telStr = lead.phone ? String(lead.phone).replace(/\D/g, '') : '';
                    const cleanPhone = telStr.length >= 10 ? telStr : '';

                    const mkMeta = (val) => val ? `<span style="color: rgba(255,215,0,0.8);">Realizado por <b>Admin</b> no passado</span>` : '';

                    
                    const card = document.createElement('div');
                    let crossTagHtml = '';
                    if (lead.hasCrossTag) {
                        crossTagHtml = `<div style="font-size:0.7rem; color:#2E8B57; border:1px solid #2E8B57; padding:2px 6px; border-radius:4px; display:inline-block; margin-bottom:10px;">Visitou & Consolidou Hojé</div>`;
                    }

                    card.className = 'person-card';
                                        
                    let visitorTasksHtml = `
                        <div class="tasks-list">
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" checked disabled style="cursor: default; opacity: 1;">
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Welcome Message (IA)</span>
                                    <span class="task-meta"><span style="color:rgba(255,215,0,0.8);">WhatsApp Enviado</span></span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Convite para GC', this)" ${lead.task_gc?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Convite para GC</span>
                                    <span class="task-meta">${mkMeta(lead.task_gc)}</span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Follow-up Humano', this)" ${lead.task_followup?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Follow-up Humano</span>
                                    <span class="task-meta">${mkMeta(lead.task_followup)}</span>
                                </div>
                            </label>
                        </div>
                    `;

                    let consoliTasksHtml = `
                        <div class="tasks-list">
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" checked disabled style="cursor: default; opacity: 1;">
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Celebração Aut. (IA)</span>
                                    <span class="task-meta"><span style="color:rgba(255,215,0,0.8);">Completado automático</span></span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Convidar p/ Start', this)" ${lead.task_start?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Convidar p/ Start</span>
                                    <span class="task-meta">${mkMeta(lead.task_start)}</span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Convidar p/ GC', this)" ${lead.task_gc?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Convidar p/ GC</span>
                                    <span class="task-meta">${mkMeta(lead.task_gc)}</span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Convite de Batismo', this)" ${lead.task_batismo?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Convite de Batismo</span>
                                    <span class="task-meta">${mkMeta(lead.task_batismo)}</span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Café Novos Membros', this)" ${lead.task_cafe?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Café Novos Membros</span>
                                    <span class="task-meta">${mkMeta(lead.task_cafe)}</span>
                                </div>
                            </label>
                        </div>
                    `;

                    card.innerHTML = `
                        <input type="checkbox" class="bulk-select-checkbox" onchange="onBulkCardSelect(this, '${lead.id}')">
                        <div class="card-header">
                            <div class="person-info">
                                <h3>${lead.name || 'Sem Nome'}</h3>
                                <p style="margin-top:2px;">📱 ${lead.phone || 'Sem número'}</p>
                            </div>
                            <div style="display:flex; gap: 6px;">
                                ${cleanPhone ? `
                                <a href="tel:+${cleanPhone}" class="icon-btn tooltip-container" aria-label="Ligar Normal">📞</a>
                                <a href="https://wa.me/${cleanPhone}" target="_blank" class="icon-btn tooltip-container" aria-label="Abrir WhatsApp">
                                    <svg style="width: 16px; fill: white;" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.12.552 4.197 1.6 6.012L.15 24l6.103-1.424A11.966 11.966 0 0 0 12.031 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0zm0 22.02c-1.815 0-3.593-.463-5.187-1.336l-.372-.211-3.66.853.864-3.551-.23-.38A10.024 10.024 0 0 1 1.954 12.03c0-5.556 4.516-10.071 10.077-10.071 5.56 0 10.076 4.515 10.076 10.076 0 5.557-4.516 10.072-10.076 10.072zm5.541-7.551c-.305-.152-1.8-.888-2.079-.99-.279-.101-.482-.152-.686.152-.204.305-.788.99-.965 1.194-.178.203-.356.228-.66.076-1.745-.88-2.909-1.543-4.045-3.32-.152-.254.041-.36.17-.5.127-.139.305-.355.457-.533.152-.177.203-.304.305-.507.102-.202.05-.38-.026-.532-.076-.152-.685-1.648-.94-2.257-.246-.593-.497-.513-.685-.522h-.585c-.203 0-.533.076-.813.381-.28.305-1.066 1.041-1.066 2.54s1.092 2.946 1.244 3.15c.152.203 2.15 3.282 5.205 4.6l.721.282c.762.247 1.455.212 2.004.129.615-.094 1.8-.736 2.054-1.447.254-.711.254-1.32.178-1.448-.076-.127-.28-.203-.585-.356z"/></svg>
                                </a>` : ''}
                                <div class="icon-btn tooltip-container" aria-label="Histórico de IA" style="background: rgba(255,215,0,0.1); color: var(--accent);">💬</div>
                            </div>
                        </div>
                        
                        ${crossTagHtml}

                        <div class="tags-area">
                            ${lead.type !== 'visitor' ? `<span class="tag decision">🔥 Decisão: ${cap(lead.decisao)}</span>` : ''}
                            ${lead.type !== 'visitor' ? `<span class="tag service">🏛 Culto: ${cap(lead.culto)}</span>` : ''}
                            <span class="tag baptism" style="background: rgba(255, 255, 255, 0.05); color: #FFF; border-color: rgba(255, 255, 255, 0.1);">🌍 País: ${cap(lead.pais)}</span>
                            ${lead.type !== 'visitor' ? `<span class="tag gc">👥 GC: ${cap(lead.gc_status)}</span>` : ''}
                        </div>

                        ${targetContainerId === 'visitors-container' ? visitorTasksHtml : consoliTasksHtml}

                        <div class="card-footer">
                            <span class="date">Registrado em ${dateStr}</span>
                            <a href="#" class="card-action" onclick="showWAChatModal('${lead.id}'); return false;" style="${window.hasWhatsappConfig ? '' : 'opacity:0.4; pointer-events:none; cursor:not-allowed;'}">${window.hasWhatsappConfig ? 'Acessar Histórico ➔' : 'IA Não Configurada'}</a>
                        </div>
                    `;
                    // Open lead drawer on card click (skip checkbox / link clicks)
                    card.addEventListener('click', function(e) {
                        if (e.target.closest('input, a, .icon-btn')) return;
                        if (typeof openLeadDrawer === 'function') openLeadDrawer(lead);
                    });
                    card.style.cursor = 'pointer';
                    tContainer.appendChild(card);
                });
            }

            initEngine();
        });

        // ===================================================================
        // PHASE 4 — BULK ACTIONS
        // ===================================================================
        let _bulkMode = false;
        let _bulkSelected = new Set(); // set of lead IDs

        window.toggleBulkMode = function() {
            _bulkMode = !_bulkMode;
            const btn = document.getElementById('bulk-toggle-btn');
            const bar = document.getElementById('bulk-action-bar');
            const containers = [
                document.getElementById('leads-container'),
                document.getElementById('visitors-container')
            ];
            containers.forEach(c => { if(c) c.classList.toggle('bulk-mode', _bulkMode); });
            if (_bulkMode) {
                _bulkSelected.clear();
                btn.textContent = '✕ Cancelar Seleção';
                btn.style.borderColor = 'rgba(255,107,107,0.5)';
                btn.style.color = '#FF6B6B';
                bar.classList.add('active');
                updateBulkBar();
            } else {
                exitBulkMode();
            }
        };

        window.exitBulkMode = function() {
            _bulkMode = false;
            _bulkSelected.clear();
            const btn = document.getElementById('bulk-toggle-btn');
            if (btn) { btn.textContent = '☑️ Selecionar'; btn.style.borderColor = ''; btn.style.color = ''; }
            const bar = document.getElementById('bulk-action-bar');
            if (bar) bar.classList.remove('active');
            document.querySelectorAll('.bulk-select-checkbox').forEach(cb => cb.checked = false);
            document.querySelectorAll('.person-card').forEach(c => c.classList.remove('bulk-selected'));
        };

        window.onBulkCardSelect = function(checkbox, leadId) {
            const card = checkbox.closest('.person-card');
            if (checkbox.checked) {
                _bulkSelected.add(leadId);
                card?.classList.add('bulk-selected');
            } else {
                _bulkSelected.delete(leadId);
                card?.classList.remove('bulk-selected');
            }
            updateBulkBar();
        };

        function updateBulkBar() {
            const label = document.getElementById('bulk-count-label');
            if (label) label.textContent = `${_bulkSelected.size} selecionado${_bulkSelected.size !== 1 ? 's' : ''}`;
        }

        window.bulkSelectAll = function() {
            document.querySelectorAll('.bulk-select-checkbox').forEach(cb => {
                cb.checked = true;
                const leadId = cb.getAttribute('onchange').match(/'([^']+)'/)?.[1];
                if (leadId) { _bulkSelected.add(leadId); cb.closest('.person-card')?.classList.add('bulk-selected'); }
            });
            updateBulkBar();
        };

        window.bulkDeselectAll = function() {
            _bulkSelected.clear();
            document.querySelectorAll('.bulk-select-checkbox').forEach(cb => { cb.checked = false; cb.closest('.person-card')?.classList.remove('bulk-selected'); });
            updateBulkBar();
        };

        window.bulkMarkAllTasks = async function() {
            if (_bulkSelected.size === 0) return alert('Selecione ao menos um card.');
            if (!confirm(`Marcar todas as tarefas como completas para ${_bulkSelected.size} pessoa(s)?`)) return;
            const ids = [..._bulkSelected];
            const taskUpdate = { task_gc: true, task_followup: true, task_start: true, task_batismo: true, task_cafe: true };
            try {
                const { error } = await window.supabaseClient.from('leads').update(taskUpdate).in('id', ids);
                if (error) throw error;
                alert(`✅ Tarefas marcadas como completas para ${ids.length} pessoa(s)!`);
                exitBulkMode();
                if (window.fetchLiveLeads) fetchLiveLeads();
            } catch(e) { alert('Erro: ' + e.message); }
        };

        window.bulkMarkBatismo = async function() {
            if (_bulkSelected.size === 0) return alert('Selecione ao menos um card.');
            if (!confirm(`Marcar Convite de Batismo para ${_bulkSelected.size} pessoa(s)?`)) return;
            const ids = [..._bulkSelected];
            try {
                const { error } = await window.supabaseClient.from('leads').update({ task_batismo: true }).in('id', ids);
                if (error) throw error;
                alert(`✝️ Batismo marcado para ${ids.length} pessoa(s)!`);
                exitBulkMode();
                if (window.fetchLiveLeads) fetchLiveLeads();
            } catch(e) { alert('Erro: ' + e.message); }
        };

        window.bulkDelete = async function() {
            if (_bulkSelected.size === 0) return alert('Selecione ao menos um card.');
            if (!confirm(`⚠️ ATENÇÃO: Excluir permanentemente ${_bulkSelected.size} pessoa(s) do banco de dados? Esta ação não pode ser desfeita.`)) return;
            const ids = [..._bulkSelected];
            try {
                const { error } = await window.supabaseClient.from('leads').delete().in('id', ids);
                if (error) throw error;
                alert(`🗑️ ${ids.length} pessoa(s) excluída(s) com sucesso.`);
                exitBulkMode();
                if (window.fetchLiveLeads) fetchLiveLeads();
            } catch(e) { alert('Erro: ' + e.message); }
        };


/* === C: Core Dashboard Logic (Module 2) === */
    const API_BASE = "https://api.consolidacao.7pro.tech"; // Production VPS

    async function sendUserCredentials(email, name, password) {
        try {
            const res = await fetch(`${API_BASE}/api/email/send-credentials`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_email: email, user_name: name, temp_password: password })
            });
            if (res.ok) {
                const data = await res.json();
                if(data.error) alert('❌ Erro da API ao enviar credenciais:\n' + data.error);
                else alert('✅ E-mail com credenciais enviado com sucesso!');
            } else alert('Erro fatal na requisição.');
        } catch (e) {
            alert('⚠️ Backend não acessível para enviar e-mail. Inicie o servidor Python.');
        }
    }

    async function sendReportEmail(type, count) {
        const email = prompt(`Para qual e-mail enviar o relatório de ${type}?`);
        if (!email) return;

        // Recuperar listagem salva (Top 100 para email não quebrar)
        const raw_lista = type === 'consolidados' ? (window._allSaved || []) : (window._allVisit || []);
        const formatados = raw_lista.slice(0, 100).map(l => ({
            "Nome": l.name,
            "Telefone": l.phone,
            "Criado_Em": new Date(l.created_at).toLocaleDateString('pt-BR'),
            "Pais": l.pais || 'BR'
        }));

        try {
            const res = await fetch(`${API_BASE}/api/email/send-report`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    user_email: email, 
                    report_type: type, 
                    total_count: count, 
                    csv_link: "https://hub.lagoinha.com/download/relatorio.csv",
                    leads: formatados
                })
            });
            if (res.ok) {
                const data = await res.json();
                if(data.error) alert('❌ Falha ao tentar disparar email do Relatório:\n' + data.error + '\n\nCertifique-se de usar um email autorizado (ex na Resend) ou revise a chave da API.');
                else alert('✅ Relatório detalhado HTML enviado por e-mail com sucesso!');
            } else alert('Erro na API ao solicitar o relatório.');
        } catch (e) {
            alert('⚠️ Backend Python não acessível para enviar e-mail.');
        }
    }

    async function forgotPassword() {
        const email = prompt("E-mail para recuperar a senha:");
        if (!email) return;
        try {
            const res = await fetch(`${API_BASE}/api/email/forgot-password`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_email: email, reset_link: "https://hub.lagoinha.com/reset-password" })
            });
            if (res.ok) {
                const data = await res.json();
                if(data.error) alert('❌ Falha na API de E-mail:\n' + data.error);
                else alert('✅ Link de recuperação enviado para ' + email);
            } else alert('Erro bloqueante na API.');
        } catch (e) {
            alert('⚠️ Backend não acessível.');
        }
    }

    function openAddUserModal() {
        const name = prompt("Nome completo do novo Membro:");
        if (!name) return;
        const email = prompt(`Email de acesso para ${name}:`);
        if (!email) return;
        const tempPass = Math.random().toString(36).slice(-8); // Gerar senha aleatoria 8 chars
        
        // Simular fluxo: Cria User no Supabase -> Envia Email via Resend
        if (confirm(`Confirmar criação de usuário?\n\nNome: ${name}\nEmail: ${email}\nNível: User\n\nIsso disparará um e-mail com a senha provisória: ${tempPass}`)) {
            sendUserCredentials(email, name, tempPass);
            // Aqui pode injetar o HTML do User na tabela.
        }
    }

    // Native App Modals Container
    document.body.insertAdjacentHTML('beforeend', `
        <div id="custom-modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; justify-content:center; align-items:center;">
            <div style="background:var(--bg-color); border:1px solid var(--card-border); padding:30px; border-radius:12px; max-width:500px; width:90%; color:#fff; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                <h3 id="custom-modal-title" style="margin-top:0; color:var(--accent);">Aviso</h3>
                <div id="custom-modal-content" style="margin:20px 0; font-size:0.9rem; line-height:1.5;">Conteúdo...</div>
                <div style="text-align:right;">
                    <button type="button" class="btn" style="background:var(--accent); color:#000;" onclick="closeModal()">Fechar</button>
                </div>
            </div>
        </div>
    `);

    // Modal QR Code API removido.
    
    // ====================================================================
    // WHATSAPP EMBEDDED SIGNUP — Full OAuth Flow
    // ====================================================================

    async function launchWhatsAppSignup() {
        const btn = document.getElementById('wa-signup-btn');
        btn.disabled = true;
        btn.innerHTML = '⏳ Conectando...';
        setWASignupStatus('info', 'Abrindo janela de autorização do Facebook...');

        if (typeof FB === 'undefined') {
            setWASignupStatus('error', '❌ SDK do Facebook não carregou. Recarregue a página.');
            btn.disabled = false;
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> Conectar WhatsApp Business';
            return;
        }

        FB.login(function(response) {
            btn.disabled = false;
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> Conectar WhatsApp Business';

            if (response.status === 'connected') {
                const shortToken = response.authResponse.accessToken;
                setWASignupStatus('info', '✅ Autorizado! Buscando suas contas WhatsApp Business...');
                fetchAndSaveWAAccounts(shortToken);
            } else if (response.status === 'not_authorized') {
                setWASignupStatus('error', '⚠️ Você cancelou a autorização. Tente novamente.');
            } else {
                setWASignupStatus('error', '❌ Erro: Não foi possível conectar ao Facebook.');
            }
        }, {
            scope: 'whatsapp_business_management,whatsapp_business_messaging',
            return_scopes: true
        });
    }

    async function fetchAndSaveWAAccounts(shortToken) {
        setWASignupStatus('info', '🔍 Buscando contas WhatsApp Business...');
        try {
            // 1. Exchange for long-lived token
            const exchangeRes = await fetch(`${API_BASE}/whatsapp/auth/exchange`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ short_lived_token: shortToken })
            });
            const exchangeData = await exchangeRes.json();
            const longToken = exchangeData.long_lived_token || shortToken; // fallback to short if exchange fails

            // 2. Fetch WABA accounts
            const accountsRes = await fetch(`${API_BASE}/whatsapp/auth/fetch-accounts`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ short_lived_token: longToken })
            });
            const accountsData = await accountsRes.json();

            if (accountsData.error) {
                setWASignupStatus('error', `❌ Erro: ${accountsData.error}`);
                return;
            }

            const accounts = accountsData.accounts || [];
            if (accounts.length === 0) {
                setWASignupStatus('error', '⚠️ Nenhuma conta WhatsApp Business encontrada neste Facebook.');
                return;
            }

            if (accounts.length === 1) {
                // Auto-save single account
                await saveSelectedWAAccount(accounts[0], longToken);
            } else {
                // Show picker for multiple accounts
                showWAAccountPicker(accounts, longToken);
            }
        } catch(e) {
            setWASignupStatus('error', `❌ Erro de conexão: ${e.message}`);
        }
    }

    function showWAAccountPicker(accounts, token) {
        setWASignupStatus('info', `Encontramos ${accounts.length} números. Escolha qual conectar:`);
        const picker = document.getElementById('wa-account-picker');
        picker.style.display = 'block';
        picker.innerHTML = accounts.map((a, i) => `
            <div onclick="saveSelectedWAAccount(${JSON.stringify(a).replace(/"/g,'&quot;')}, '${token}')" style="
                padding:14px; border-radius:10px; border:1px solid var(--card-border);
                margin-bottom:8px; cursor:pointer; transition:all 0.2s;
                background:rgba(255,255,255,0.04);
            " onmouseover="this.style.background='rgba(37,211,102,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                <div style="font-weight:600;color:#fff;">📱 ${a.phone_display}</div>
                <div style="font-size:0.78rem;color:var(--text-dim);">WABA: ${a.waba_name} · ${a.phone_id}</div>
            </div>
        `).join('');
    }

    async function saveSelectedWAAccount(account, token) {
        setWASignupStatus('info', `💾 Salvando ${account.phone_display}...`);
        document.getElementById('wa-account-picker').style.display = 'none';
        try {
            const saveRes = await fetch(`${API_BASE}/whatsapp/auth/save`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    workspace_id: '9c4e23cf-26e3-4632-addb-f28325aedac3',
                    phone_id: account.phone_id,
                    waba_id: account.waba_id,
                    access_token: token,
                    phone_display: account.phone_display
                })
            });
            const saveData = await saveRes.json();
            if (saveData.status === 'saved') {
                setWASignupStatus('success', `🎉 Conectado com sucesso!`);
                showWAConnectedCard(account);
            } else {
                setWASignupStatus('error', `❌ Erro ao salvar: ${saveData.error}`);
            }
        } catch(e) {
            setWASignupStatus('error', `❌ Erro: ${e.message}`);
        }
    }

    function showWAConnectedCard(account) {
        document.getElementById('wa-connect-section').style.display = 'none';
        const card = document.getElementById('wa-connected-card');
        card.style.display = 'block';
        document.getElementById('wa-connected-details').innerHTML = `
            <div>📱 <strong>${account.phone_display || account.phone_id}</strong></div>
            <div>🏢 ${account.waba_name || 'WhatsApp Business Account'} (${account.waba_id})</div>
            <div>🔑 Phone ID: ${account.phone_id}</div>
            <div style="margin-top:6px;color:#25D366;">✅ Ju irá responder automaticamente por este número</div>
        `;
        document.getElementById('wa-status-text').innerText = `Conectado — ${account.phone_display}`;
        document.getElementById('wa-status-text').style.color = '#25D366';
        document.getElementById('wa-status-dot').style.background = '#25D366';
        document.getElementById('wa-status-dot').style.boxShadow = '0 0 8px rgba(37,211,102,0.6)';
        window.hasWhatsappConfig = true;
    }

    function disconnectWhatsApp() {
        if (!confirm('Desconectar o WhatsApp? A Ju vai parar de responder.')) return;
        window.supabaseClient.from('workspaces').update({ credentials: {} }).eq('id', '9c4e23cf-26e3-4632-addb-f28325aedac3').then(() => {
            document.getElementById('wa-connected-card').style.display = 'none';
            document.getElementById('wa-connect-section').style.display = 'block';
            setWASignupStatus('info', '🔌 Desconectado. Clique em Conectar para reconectar.');
            window.hasWhatsappConfig = false;
        });
    }

    function setWASignupStatus(type, msg) {
        const el = document.getElementById('wa-signup-status');
        el.style.display = 'block';
        const colors = { info: 'rgba(255,215,0,0.15)', success: 'rgba(37,211,102,0.15)', error: 'rgba(255,59,48,0.15)' };
        const textColors = { info: '#ffd700', success: '#25D366', error: '#ff6b6b' };
        el.style.background = colors[type] || colors.info;
        el.style.color = textColors[type] || textColors.info;
        el.style.border = `1px solid ${textColors[type] || textColors.info}40`;
        el.innerText = msg;
    }

    // ====================================================================
    // LEGACY: Manual save (still used in Advanced collapsible)
    // ====================================================================

    async function saveCloudCredentials() {
        const id = document.getElementById('cloud-phone-id').value;
        const token = document.getElementById('cloud-token').value;
        const b_id = document.getElementById('cloud-business-id').value;
        const secret = document.getElementById('cloud-app-secret').value;
        
        if(!id || !token) { 
            alert('Preencha Phone ID e Access Token'); 
            return; 
        }
        
        try {
            const { error } = await window.supabaseClient.from('workspaces').update({
                credentials: {whatsapp_token: token, phone_id: id, business_id: b_id, app_secret: secret}
            }).eq('id', '9c4e23cf-26e3-4632-addb-f28325aedac3');
            
            if (error) throw error;
            alert('✅ Credenciais Salvas!');
            checkWAStatus();
        } catch(e) {
            alert('❌ Erro: ' + e.message);
        }
    }

    async function checkWAStatus() {
        if (!window.supabaseClient) return;
        window.hasWhatsappConfig = false;
        
        const { data, error } = await window.supabaseClient.from('workspaces').select('credentials').eq('id', '9c4e23cf-26e3-4632-addb-f28325aedac3').single();
        if (data && data.credentials && data.credentials.whatsapp_token) {
            window.hasWhatsappConfig = true;
            const phoneDisplay = data.credentials.phone_display || data.credentials.phone_id || 'Número conectado';
            document.getElementById('wa-status-text').innerText = `Conectado — ${phoneDisplay}`;
            document.getElementById('wa-status-text').style.color = '#25D366';
            document.getElementById('wa-status-dot').style.background = '#25D366';
            document.getElementById('wa-status-dot').style.boxShadow = '0 0 8px rgba(37,211,102,0.6)';

            // Show the connected card if on settings page
            const connCard = document.getElementById('wa-connected-card');
            const connectSection = document.getElementById('wa-connect-section');
            if (connCard && connectSection) {
                showWAConnectedCard({
                    phone_display: data.credentials.phone_display || data.credentials.phone_id,
                    phone_id: data.credentials.phone_id,
                    waba_id: data.credentials.waba_id || data.credentials.business_id || '',
                    waba_name: 'Lagoinha Orlando'
                });
            }
            // Pre-fill manual fields too
            if(document.getElementById('cloud-phone-id')) {
                document.getElementById('cloud-phone-id').value = data.credentials.phone_id || '';
                document.getElementById('cloud-token').value = data.credentials.whatsapp_token || '';
                document.getElementById('cloud-business-id').value = data.credentials.business_id || data.credentials.waba_id || '';
                document.getElementById('cloud-app-secret').value = data.credentials.app_secret || '';
            }
        } else {
            document.getElementById('wa-status-text').innerText = "Inativo / Faltam Dados";
            document.getElementById('wa-status-text').style.color = "gray";
            document.getElementById('wa-status-dot').style.background = "gray";
        }
        
        if (window.applyFilters) window.applyFilters();
    }

    // --- WHATSAPP CLONE JS ---
    let waActiveLeadId = null;
    let waMessagesInterval = null;

    // Render left sidebar
    window.renderWAChatList = function() {
        const listDiv = document.getElementById('waChatList');
        if(!listDiv) return;
        
        let html = '';
        const searchQ = (document.getElementById('waSearch')?.value || '').toLowerCase();
        
        // Filter leads with phone numbers, sort by last_interaction (most recent first)
        const chats = globalLeads
            .filter(l => l.phone && (l.name || '').toLowerCase().includes(searchQ))
            .sort((a, b) => {
                const tA = a.last_interaction || a.created_at || '';
                const tB = b.last_interaction || b.created_at || '';
                return tB.localeCompare(tA);
            });
        
        function relativeTime(ts) {
            if (!ts) return '';
            const diff = Date.now() - new Date(ts).getTime();
            const mins = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            if (mins < 1) return 'agora';
            if (mins < 60) return `${mins}m`;
            if (hours < 24) return `${hours}h`;
            if (days < 7) return `${days}d`;
            return new Date(ts).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
        }
        
        if (chats.length === 0) {
            html = `<div style="padding: 20px; text-align: center; color: #8696a0;">Nenhuma conversa encontrada.</div>`;
        } else {
            chats.forEach(lead => {
                let nameSafe = lead.name || 'Desconhecido';
                let initials = 'DC';
                try {
                    initials = nameSafe.split(' ').map(n=>n?n[0]:'').join('').substring(0,2).toUpperCase() || 'WA';
                } catch(e) {}
                const timeLabel = relativeTime(lead.last_interaction || lead.created_at);
                html += `
                    <div class="wa-chat-item ${lead.id === waActiveLeadId ? 'active' : ''}" onclick="showWAChat('${lead.id}')">
                        <div class="wa-avatar">${initials}</div>
                        <div class="wa-chat-info">
                            <div class="wa-chat-top">
                                <span class="wa-chat-name">${lead.name}</span>
                                <span class="wa-chat-time">${timeLabel}</span>
                            </div>
                            <div class="wa-chat-msg">${lead.phone}</div>
                        </div>
                    </div>
                `;
            });
        }
        listDiv.innerHTML = html;
    };

    window.filterWAChats = renderWAChatList;

    window.showWAChat = async function(leadId) {
        waActiveLeadId = leadId;
        renderWAChatList(); // update active class
        
        const lead = globalLeads.find(l => String(l.id) === String(leadId));
        if(!lead) return;
        
        const initials = lead.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
        const mainArea = document.getElementById('waMainArea');
        
        let ui = `
            <div class="wa-main-header">
                <div class="wa-avatar">${initials}</div>
                <div class="wa-main-header-info">
                    <div class="wa-main-name">${lead.name}</div>
                    <div class="wa-main-status">${lead.phone}</div>
                </div>
            </div>
            <div class="wa-messages-area" id="waMsgContainer">
                <div style="align-self:center; background: rgba(32,44,51,0.9); padding:5px 12px; border-radius:10px; font-size:0.75rem; color:#8696a0; margin:10px 0;">Hoje</div>
                <div style="align-self:center; font-size: 0.8rem; color: #8696a0; margin-bottom: 20px;">Carregando mensagens...</div>
            </div>
            <div class="wa-input-area">
                <button class="wa-icon-btn">📎</button>
                <div class="wa-input-wrapper">
                    <input type="text" id="waInputField" class="wa-input-field" placeholder="Digite uma mensagem" onkeypress="if(event.key === 'Enter') sendWAMessage()">
                </div>
                <button class="wa-icon-btn" onclick="sendWAMessage()">➤</button>
            </div>
        `;
        mainArea.innerHTML = ui;
        
        loadMessagesFromSupabase(leadId);
        if(waMessagesInterval) clearInterval(waMessagesInterval);
        waMessagesInterval = setInterval(() => loadMessagesFromSupabase(leadId), 5000); // sync every 5s
    };
    
    window.loadMessagesFromSupabase = async function(leadId) {
        if(waActiveLeadId !== leadId) return;
        
        const container = document.getElementById('waMsgContainer');
        if(!container) return;

        // Find the lead to get its phone number
        const activeLead = window.globalLeads ? window.globalLeads.find(l => String(l.id) === String(leadId)) : null;
        
        let msgs = [];
        let fetchError = null;

        if (activeLead && activeLead.phone) {
            // Normalize phone: get last 10 digits for matching
            const phoneDigits = String(activeLead.phone).replace(/\D/g, '');
            const searchPhone = phoneDigits.slice(-10);
            
            // Step 1: Find ALL lead IDs with this phone number (handles + prefix mismatch)
            const { data: relatedLeads } = await window.supabaseClient
                .from('leads').select('id').ilike('phone', `%${searchPhone}%`);
            
            if (relatedLeads && relatedLeads.length > 0) {
                const leadIds = relatedLeads.map(l => l.id);
                // Step 2: Fetch messages for all those lead IDs
                const { data, error } = await window.supabaseClient
                    .from('messages').select('*')
                    .in('lead_id', leadIds)
                    .order('created_at', {ascending: true});
                msgs = data || [];
                fetchError = error;
            }
        } else {
            // Fallback: direct lead_id lookup
            const { data, error } = await window.supabaseClient
                .from('messages').select('*').eq('lead_id', leadId).order('created_at', {ascending: true});
            msgs = data || [];
            fetchError = error;
        }
        
        if (fetchError || msgs.length === 0) {
            container.innerHTML = `
                <div style="align-self:center; background: rgba(32,44,51,0.9); padding:5px 12px; border-radius:10px; font-size:0.75rem; color:#8696a0; margin:10px 0;">Hoje</div>
                <div style="align-self:center; font-size: 0.8rem; color: #6b7c85; text-align:center; margin-top: 20px;">Nenhuma mensagem enviada ou recebida por IA ainda.<br>Tente enviar o primeiro "Template".</div>
            `;
            return;
        }
        
        let html = '<div style="align-self:center; background: rgba(32,44,51,0.9); padding:5px 12px; border-radius:10px; font-size:0.75rem; color:#8696a0; margin:10px 0;">Hoje</div>';
        msgs.forEach(m => {
            const isSent = m.direction === 'outbound';
            const cls = isSent ? 'sent' : 'received';
            const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
            const botTag = m.automated ? `<span style="font-size:0.6rem; color:#ffd700; margin-right:5px;">🤖 IA</span>` : '';
            html += `
                <div class="wa-bubble ${cls}">
                    ${m.content}
                    <div class="wa-bubble-time">${botTag} ${timeStr}</div>
                </div>
            `;
        });
        
        const isScrollAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
        container.innerHTML = html;
        if (isScrollAtBottom) container.scrollTop = container.scrollHeight;
    };
    
    window.sendWAMessage = async function() {
        const inp = document.getElementById('waInputField');
        if(!inp || !inp.value.trim() || !waActiveLeadId) return;
        
        const lead = globalLeads.find(l => String(l.id) === String(waActiveLeadId));
        const txt = inp.value.trim();
        inp.value = '';
        
        // Optimistic UI
        const container = document.getElementById('waMsgContainer');
        const timeStr = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        if(container.querySelector('.wa-bubble') === null) container.innerHTML = '<div style="align-self:center; background: rgba(32,44,51,0.9); padding:5px 12px; border-radius:10px; font-size:0.75rem; color:#8696a0; margin:10px 0;">Hoje</div>';
        
        container.innerHTML += `
            <div class="wa-bubble sent" style="opacity:0.7;">
                ${txt}
                <div class="wa-bubble-time">${timeStr}</div>
            </div>
        `;
        container.scrollTop = container.scrollHeight;
        
        // Save to DB
        await window.supabaseClient.from('messages').insert([{
            lead_id: waActiveLeadId,
            workspace_id: lead.workspace_id || '9c4e23cf-26e3-4632-addb-f28325aedac3',
            direction: 'outbound',
            content: txt,
            type: 'text',
            automated: false
        }]);
        
        // 🔒 Human Lock: Pause Ju AI for 30 minutes after human message
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        await window.supabaseClient.from('leads')
            .update({ llm_lock_until: lockUntil })
            .eq('id', waActiveLeadId);
        
        // Calling Python Backend to dispatch to Meta Cloud API
        fetch(`${API_BASE}/whatsapp/send`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                phone: String(lead.phone),
                text: txt,
                workspace_id: lead.workspace_id || '9c4e23cf-26e3-4632-addb-f28325aedac3'
            })
        }).catch(e=>console.log(e));
        
        loadMessagesFromSupabase(waActiveLeadId);
    };

    // Mudar provider radio button behaviour ja declarado, movido pro init.
    document.querySelectorAll('input[name="wa_provider"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isEvol = e.target.value === 'evolution';
            document.getElementById('wa-buttons-evolution').style.display = isEvol ? 'flex' : 'none';
            document.getElementById('wa-buttons-cloud').style.display = isEvol ? 'none' : 'flex';
            document.querySelectorAll('input[name="wa_provider"]').forEach(r => {
                const lbl = r.parentElement;
                if (r.checked) {
                    lbl.style.border = "1px solid var(--accent)"; lbl.style.background = "rgba(255,255,255,0.05)"; lbl.style.color = "var(--accent)";
                } else {
                    lbl.style.border = "1px solid transparent"; lbl.style.background = "transparent"; lbl.style.color = "var(--text-dim)";
                }
            });
        });
    });

    setTimeout(checkWAStatus, 500); // Trigger check on load
    
    window.showWAChatModal = function(leadId) {
        // Change view to Mensagens IA tab programatically
        document.querySelectorAll('.nav-items li').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
        
        // Find the 'Mensagens IA' nav item (the 4th index usually) and activate it
        const navItems = document.querySelectorAll('.nav-items li');
        if(navItems[4]) navItems[4].classList.add('active');
        
        const iaView = document.getElementById('view-ia');
        if(iaView) iaView.classList.add('active-view');
        
        // Render and select
        setTimeout(() => {
            renderWAChatList();
            showWAChat(leadId);
        }, 100);
    };

    // ─── SAVE AI INSTRUCTIONS TO SUPABASE ───────────────────────────────────
    window.saveAIInstructions = async function() {
        if (!window.supabaseClient) { alert('Aguarde a inicialização do sistema...'); return; }

        // Collect all textarea values from the Settings page
        const allTextareas = document.querySelectorAll('#view-settings textarea');
        const proxBatismo   = allTextareas[0]?.value || '';
        const cafe          = allTextareas[1]?.value || '';
        const eventos       = allTextareas[2]?.value || '';
        const endereco      = allTextareas[3]?.value || '';
        const juPrompt      = allTextareas[4]?.value || '';

        const knowledgeBase = {
            batismo: proxBatismo,
            cafe_novos_membros: cafe,
            eventos: eventos,
            address: endereco,
            ju_prompt: juPrompt
        };

        try {
            const btn = document.querySelector('[onclick="saveAIInstructions()"]');
            if (btn) { btn.innerText = 'Salvando...'; btn.disabled = true; }

            const { error } = await window.supabaseClient
                .from('workspaces')
                .update({ knowledge_base: knowledgeBase })
                .eq('id', '9c4e23cf-26e3-4632-addb-f28325aedac3');

            if (error) throw error;
            
            if (btn) { btn.innerText = '✅ Salvo!'; setTimeout(() => { btn.innerText = 'Salvar Instruções (Nuvem)'; btn.disabled = false; }, 2000); }
            // [H5] console.log removed — no sensitive data in prod console
        } catch(e) {
            alert('❌ Erro ao salvar: ' + e.message);
            const btn = document.querySelector('[onclick="saveAIInstructions()"]');
            if (btn) { btn.innerText = 'Salvar Instruções (Nuvem)'; btn.disabled = false; }
        }
    };

    // ─── SUPABASE REALTIME — Live Chat Updates ────────────────────────────────
    // This subscribes to new rows in the `messages` table. When a new WhatsApp
    // message arrives and gets saved by the backend, the dashboard updates instantly.
    function initRealtimeSubscription() {
        if (!window.supabaseClient) return;

        window.supabaseClient
            .channel('realtime-messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                const newMsg = payload.new;
                // [H5] Realtime payload not logged in prod — contains lead PII

                // If the chat is currently open for this lead, reload the messages live
                if (waActiveLeadId && String(newMsg.lead_id) === String(waActiveLeadId)) {
                    loadMessagesFromSupabase(waActiveLeadId);
                }

                // Refresh the chat list sidebar to show latest activity
                renderWAChatList();
            })
            .subscribe();
        
        // [H5] Realtime channel active (log removed)
    }

    // Start Realtime after Supabase is ready (slight delay to ensure init)  
    setTimeout(initRealtimeSubscription, 1000);

    // ─── SLUG-AWARE FORM HELPERS ─────────────────────────────────────────────
    const _pathParts = window.location.pathname.split('/').filter(Boolean);
    const _slug = _pathParts[0] || 'orlando';

    function copyFormLink(page) {
        const url = window.location.origin + '/' + _slug + '/' + page;
        navigator.clipboard.writeText(url).then(() => {
            alert('Link copiado: ' + url);
        });
    }

    function openForm(page) {
        const url = '/' + _slug + '/' + page;
        window.open(url, '_blank');
    }

    // Populate sidebar workspace name
    (async () => {
        if (!window.supabaseClient) return;
        const el = document.getElementById('sidebar-workspace-name');
        if (!el) return;
        const { data } = await window.supabaseClient
            .from('workspaces').select('name').eq('slug', _slug).single();
        if (data?.name) el.textContent = data.name;
    })();

    // ─── MOBILE SIDEBAR ───────────────────────────────────────────────
    function toggleSidebar() {
        const sb = document.querySelector('.sidebar');
        const ov = document.getElementById('sidebar-overlay');
        sb.classList.toggle('open');
        ov.classList.toggle('show');
    }
    function closeSidebar() {
        document.querySelector('.sidebar')?.classList.remove('open');
        document.getElementById('sidebar-overlay')?.classList.remove('show');
    }
    // Close sidebar when nav item clicked on mobile — skip submenu toggles
    document.querySelectorAll('.nav li[onclick], .nav-item-row[onclick]').forEach(el => {
        el.addEventListener('click', () => {
            if (window.innerWidth < 1024 && !el.dataset.submenuToggle) closeSidebar();
        });
    });


    // ─── Lead Drawer Logic ────────────────────────────────────────────
    let _drawerLeadId = null;

    window.openLeadDrawer = async function(lead) {
        _drawerLeadId = lead.id;
        // Populate fields
        document.getElementById('drawer-lead-name').textContent = lead.name || '—';
        document.getElementById('drawer-field-name').value = lead.name || '';
        document.getElementById('drawer-field-phone').value = lead.phone || '';
        const langSel = document.getElementById('drawer-field-lang');
        if (langSel) langSel.value = lead.preferred_language || 'pt';

        // Build tasks
        const taskDefs = [
            { key: 'task_start',    label: 'Convidar para Start' },
            { key: 'task_gc',       label: 'Convidar para GC' },
            { key: 'task_batismo',  label: 'Convite de Batismo' },
            { key: 'task_cafe',     label: 'Café de Novos Membros' },
            { key: 'task_followup', label: 'Follow-up Humano' }
        ];
        const tasksEl = document.getElementById('drawer-tasks');
        if (tasksEl) {
            tasksEl.innerHTML = taskDefs.map(t => {
                const done = Boolean(lead[t.key]);
                return `
                <div class="hub-task-item ${done ? 'done' : ''}" id="task-row-${t.key}" onclick="toggleLeadTask('${t.key}', this)">
                    <div class="hub-task-check">
                        <svg viewBox="0 0 20 20">
                            <circle class="check-circle" cx="10" cy="10" r="9" stroke-width="1.5"/>
                            <polyline class="check-mark" points="6,10 9,13 14,7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <span class="hub-task-label">${t.label}</span>
                </div>`;
            }).join('');
        }

        // Open panel
        document.getElementById('lead-drawer').classList.add('open');
        document.getElementById('lead-drawer-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';

        // Load timeline from messages
        const timelineEl = document.getElementById('drawer-timeline');
        if (timelineEl) {
            timelineEl.innerHTML = '<div class="hub-skeleton hub-skeleton-row" style="height:36px;"></div>';
            try {
                const sb = window.supabaseClient;
                const { data: msgs } = await sb.from('messages')
                    .select('content, direction, automated, created_at')
                    .eq('lead_id', lead.id)
                    .order('created_at', { ascending: false })
                    .limit(20);

                // Also add registration event
                const events = [
                    { type: 'register', content: `Cadastro recebido (${lead.type === 'visitor' ? 'Visitante' : 'Consolidação'})`, ts: lead.created_at }
                ];
                (msgs || []).forEach(m => events.push({ type: m.automated ? 'ai' : (m.direction === 'inbound' ? 'inbound' : 'human'), content: m.content, ts: m.created_at }));
                events.sort((a,b) => new Date(b.ts) - new Date(a.ts));

                if (events.length === 0) {
                    timelineEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;">Sem interações registradas.</div>';
                } else {
                    timelineEl.innerHTML = events.map(ev => {
                        const dotClass = ev.type === 'register' ? '' : ev.type === 'inbound' ? 'blue' : 'muted';
                        const d = new Date(ev.ts);
                        const dateStr = d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
                        const label = ev.type === 'ai' ? '(IA)' : ev.type === 'inbound' ? '(Resposta)' : ev.type === 'human' ? '(Humano)' : '';
                        return `
                        <div class="hub-timeline-item">
                            <div class="hub-timeline-dot ${dotClass}"></div>
                            <div class="hub-timeline-content">
                                <div class="hub-timeline-text">${(ev.content || '').substring(0, 160)}${ev.content && ev.content.length > 160 ? '…' : ''}</div>
                                <div class="hub-timeline-meta">${dateStr} ${label}</div>
                            </div>
                        </div>`;
                    }).join('');
                }
            } catch(e) {
                timelineEl.innerHTML = '<div style="color:#f87171;font-size:0.8rem;">Erro ao carregar timeline.</div>';
            }
        }
    };

    window.closeLeadDrawer = function() {
        document.getElementById('lead-drawer').classList.remove('open');
        document.getElementById('lead-drawer-overlay').classList.remove('open');
        document.body.style.overflow = '';
        _drawerLeadId = null;
    };

    window.saveDrawerLead = async function() {
        if (!_drawerLeadId) return;
        const name = document.getElementById('drawer-field-name').value.trim();
        const phone = document.getElementById('drawer-field-phone').value.trim();
        const lang = document.getElementById('drawer-field-lang').value;
        const sb = window.supabaseClient;
        const { error } = await sb.from('leads').update({ name, phone, preferred_language: lang }).eq('id', _drawerLeadId);
        if (error) {
            if (typeof hubToast !== 'undefined') hubToast('Erro ao salvar', 'error');
        } else {
            if (typeof hubToast !== 'undefined') hubToast('Lead atualizado!', 'success');
            document.getElementById('drawer-lead-name').textContent = name || '—';
        }
    };

    window.toggleLeadTask = async function(taskKey, rowEl) {
        if (!_drawerLeadId) return;
        const isDone = rowEl.classList.contains('done');
        const newVal = !isDone;
        rowEl.classList.toggle('done', newVal);
        const sb = window.supabaseClient;
        await sb.from('leads').update({ [taskKey]: newVal }).eq('id', _drawerLeadId);
        // Update in-memory lead
        const lead = (window.globalLeads || []).find(l => l.id === _drawerLeadId);
        if (lead) lead[taskKey] = newVal;
        // Recompute KPIs
        if (window._allSaved) {
            const saved = window._allSaved;
            if (typeof updateTopKPIs === 'function') updateTopKPIs(saved);
        }
        if (typeof hubToast !== 'undefined') hubToast(newVal ? 'Tarefa concluída!' : 'Tarefa reaberta', newVal ? 'success' : 'info');
    };

    // ─── Period filter ────────────────────────────────────────────────
    window.setPeriodFilter = function(view, days, btn) {
        const tabsId = view === 'dashboard' ? 'period-tabs-dashboard' : 'period-tabs-visitors';
        const tabs = document.querySelectorAll('#' + tabsId + ' .hub-period-tab');
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        // Hide custom date picker when clicking a period button
        const topCustom = document.getElementById('top-custom-date');
        if (topCustom) topCustom.style.display = 'none';
        // Sync the hidden filterTimeRange select so applyFilters works
        const frEl = document.getElementById('filterTimeRange');
        if (frEl) {
            if (days === 0) frEl.value = 'all';
            else if (days === 7) frEl.value = '7';
            else if (days === 30) frEl.value = '30';
            else if (days === 90) frEl.value = '90';
        }
        window._periodCutoff = null;
        if (view === 'dashboard') {
            if (window.applyFilters) window.applyFilters();
        } else {
            if (typeof applyVisitorFilters === 'function') applyVisitorFilters();
        }
    };

    // Toggle the custom date picker in the top bar
    window.toggleTopCustomDate = function(btn) {
        const topCustom = document.getElementById('top-custom-date');
        if (!topCustom) return;
        const isVisible = topCustom.style.display === 'flex';
        topCustom.style.display = isVisible ? 'none' : 'flex';
        const tabs = document.querySelectorAll('#period-tabs-dashboard .hub-period-tab');
        tabs.forEach(t => t.classList.remove('active'));
        if (!isVisible) btn.classList.add('active');
    };

    // Apply the custom date range from the top bar date pickers
    window.applyTopCustomDate = function() {
        const startEl = document.getElementById('topDateStart');
        const endEl = document.getElementById('topDateEnd');
        if (!startEl || !endEl || !startEl.value) return;
        window._topCustomStart = startEl.value;
        window._topCustomEnd = endEl.value || new Date().toISOString().split('T')[0];
        const frEl = document.getElementById('filterTimeRange');
        if (frEl) {
            let opt = frEl.querySelector('option[value="__top_custom__"]');
            if (!opt) {
                opt = document.createElement('option');
                opt.value = '__top_custom__';
                opt.text = 'Período selecionado';
                frEl.appendChild(opt);
            }
            frEl.value = '__top_custom__';
        }
        if (window.applyFilters) window.applyFilters();
    };

    // ─── QR Code generators ───────────────────────────────────────────
    window.generateQRCodes = function() {
        if (typeof QRCode === 'undefined') return;
        const base = window.location.origin + '/' + (_slug || 'orlando');
        function makeQR(canvasId, path) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            QRCode.toCanvas(canvas, base + '/' + path, {
                width: 96, margin: 1,
                color: { dark: '#000000', light: '#ffffff' }
            }, function(err) { if(err) console.warn('QR error:', err); });
        }
        makeQR('qr-consolida', 'consolida-form.html');
        makeQR('qr-visitor',   'visitor-form.html');
    };

    window.downloadQR = function(canvasId, filename) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = filename + '-qr.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    // ─── copyFormLink override: use toast instead of alert ────────────
    // (hub.js is loaded below and provides hubCopy)
    function copyFormLink(page) {
        const url = window.location.origin + '/' + _slug + '/' + page;
        navigator.clipboard.writeText(url).then(() => {
            if (typeof hubToast !== 'undefined') hubToast('Link copiado!', 'success');
            else alert('Link copiado: ' + url);
        });
    }


/* === D: CRIE Module === */

// ── Helpers ─────────────────────────────────────────
let _allAnnouncements = [];
let _devWorkspaces = [];
let _overrideTargetId = null;

// ── G2: Mural de Anúncios ────────────────────────────
async function loadMural() {
    try {
        const sb = window.supabaseClient;
        if (!sb) return;
        // Note: We do NOT join users(name) here because author_id → public.users causes PostgREST PGRST200.
        // Instead we fetch announcements without the join and show a generic author label.
        const { data, error } = await sb
            .from('announcements')
            .select('id, title, body, scope, workspace_id, author_id, created_at')
            .order('created_at', { ascending: false });
        if (error) throw error;
        _allAnnouncements = data || [];
        renderMural(_allAnnouncements);
        // Show create button for admins
        const me = window._currentUser;
        if (me && (me.role === 'church_admin' || me.role === 'master_admin')) {
            const btn = document.getElementById('btn-new-announcement');
            if (btn) btn.style.display = '';
        }
    } catch(e) { console.error('loadMural:', e); }
}

function renderMural(list) {
    const container = document.getElementById('mural-list');
    const empty = document.getElementById('mural-empty');
    if (!container) return;
    if (!list || list.length === 0) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    const scopeLabel = { global: 'Global', regional: 'Regional', local: 'Local' };
    const scopeColor = { global: '#FFD700', regional: '#60a5fa', local: '#a0aec0' };
    container.innerHTML = list.map(a => {
        const author = a.users?.name || 'Liderança';
        const date = new Date(a.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
        return `<div class="hub-announcement-card" data-scope="${a.scope}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <h4 style="font-size:.95rem; font-weight:700; margin:0;">${a.title}</h4>
                <span class="hub-scope-badge" style="background:${scopeColor[a.scope]}22; color:${scopeColor[a.scope]}; border:1px solid ${scopeColor[a.scope]}44;">${scopeLabel[a.scope]}</span>
            </div>
            <p style="font-size:.85rem; color:var(--text-dim); line-height:1.6; margin:0 0 12px;">${a.body || ''}</p>
            <div style="font-size:.72rem; color:var(--text-dim); display:flex; gap:12px;">
                <span>${author}</span>
                <span>${date}</span>
            </div>
        </div>`;
    }).join('');
}

function filterAnnouncements(scope, btn) {
    document.querySelectorAll('.hub-scope-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const filtered = scope === 'all' ? _allAnnouncements : _allAnnouncements.filter(a => a.scope === scope);
    renderMural(filtered);
}

function showAnnouncementModal() {
    document.getElementById('announcement-modal-overlay').style.display = 'flex';
}
function closeAnnouncementModal() {
    document.getElementById('announcement-modal-overlay').style.display = 'none';
}

async function createAnnouncement() {
    const title = document.getElementById('ann-title').value.trim();
    const body  = document.getElementById('ann-body').value.trim();
    const scope = document.getElementById('ann-scope').value;
    if (!title) { window.showToast && showToast('Título obrigatório', 'error'); return; }
    try {
        const sb = window.supabaseClient;
        const { error } = await sb.from('announcements').insert([{
            title, body, scope,
            workspace_id: window.currentWorkspaceId || null,
            author_id: (await sb.auth.getUser()).data.user?.id
        }]);
        if (error) throw error;
        closeAnnouncementModal();
        document.getElementById('ann-title').value = '';
        document.getElementById('ann-body').value = '';
        await loadMural();
        window.showToast && showToast('Anúncio publicado!', 'success');
    } catch(e) { console.error('createAnnouncement:', e); window.showToast && showToast('Erro ao publicar', 'error'); }
}

// ── G3: Workspace Settings ────────────────────────────
async function loadWorkspaceSettings() {
    if (!window.currentWorkspaceId) return;
    try {
        const sb = window.supabaseClient;
        const { data, error } = await sb
            .from('workspaces')
            .select('name, country, knowledge_base')
            .eq('id', window.currentWorkspaceId)
            .single();
        if (error) throw error;
        const kb = data.knowledge_base || {};
        const set = id => v => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        set('ws-cfg-name')(data.name);
        set('ws-cfg-country')(data.country);
        set('ws-cfg-pastor')(kb.pastor);
        set('ws-cfg-address')(kb.address);
        set('ws-cfg-phone')(kb.phone);
        set('ws-cfg-instagram')(kb.social?.instagram);
        set('ws-cfg-youtube')(kb.social?.youtube);
        set('ws-cfg-facebook')(kb.social?.facebook);
    } catch(e) { console.error('loadWorkspaceSettings:', e); }
}

async function saveWorkspaceSettings() {
    if (!window.currentWorkspaceId) return;
    const g = id => (document.getElementById(id)?.value || '').trim();
    try {
        // First, get existing knowledge_base so we don't overwrite unrelated fields
        const sb = window.supabaseClient;
        const { data: ws } = await sb.from('workspaces').select('knowledge_base').eq('id', window.currentWorkspaceId).single();
        const kb = { ...(ws?.knowledge_base || {}) };
        kb.pastor  = g('ws-cfg-pastor');
        kb.address = g('ws-cfg-address');
        kb.phone   = g('ws-cfg-phone');
        kb.social  = { instagram: g('ws-cfg-instagram'), youtube: g('ws-cfg-youtube'), facebook: g('ws-cfg-facebook') };
        const { error } = await sb.from('workspaces').update({
            name: g('ws-cfg-name') || undefined,
            country: g('ws-cfg-country') || undefined,
            knowledge_base: kb
        }).eq('id', window.currentWorkspaceId);
        if (error) throw error;
        window.showToast && showToast('Configurações salvas!', 'success');
    } catch(e) { console.error('saveWorkspaceSettings:', e); window.showToast && showToast('Erro ao salvar', 'error'); }
}

// ── G5: Dev Menu ─────────────────────────────────────
async function loadDevView() {
    try {
        const sb = window.supabaseClient;
        // Fetch all workspaces
        const { data: allWs } = await sb.from('workspaces').select('*');
        const { data: allLeads } = await sb.from('leads').select('id, workspace_id');
        const { data: allUsers } = await sb.from('users').select('id');
        _devWorkspaces = allWs || [];

        // KPIs
        const paid = (_devWorkspaces).filter(w => w.plan !== 'free').length;
        document.getElementById('dev-kpi-workspaces').textContent = _devWorkspaces.length;
        document.getElementById('dev-kpi-paid').textContent = paid;
        document.getElementById('dev-kpi-leads').textContent = (allLeads || []).length;
        document.getElementById('dev-kpi-users').textContent = (allUsers || []).length;

        renderDevTable(_devWorkspaces, allLeads || []);
    } catch(e) { console.error('loadDevView:', e); }
}

function renderDevTable(workspaces, leads) {
    const tbody = document.getElementById('dev-ws-tbody');
    if (!tbody) return;
    const planBg = { free:'rgba(150,150,150,.15)', basic:'rgba(96,165,250,.15)', medium:'rgba(100,220,150,.15)', premium:'rgba(255,215,0,.15)' };
    const planCl = { free:'#aaa', basic:'#60a5fa', medium:'#64dc96', premium:'#FFD700' };
    tbody.innerHTML = workspaces.map(ws => {
        const wsLeads = leads.filter(l => l.workspace_id === ws.id).length;
        const mods = Array.isArray(ws.modules) ? ws.modules.join(', ') : (ws.modules || '—');
        return `<tr>
            <td><span style="font-weight:600;">${ws.name}</span><br><span style="font-size:.7rem;color:var(--text-dim);">${ws.slug || ''}</span></td>
            <td><span style="background:${planBg[ws.plan]};color:${planCl[ws.plan]};padding:2px 8px;border-radius:6px;font-size:.75rem;font-weight:700;">${(ws.plan||'free').toUpperCase()}</span></td>
            <td><span style="color:${ws.status==='active'?'#64dc96':'#f59e0b'}; font-size:.8rem;">${ws.status}</span></td>
            <td style="font-size:.8rem;">${ws.country || '—'}</td>
            <td style="font-weight:600;">${wsLeads}</td>
            <td style="font-size:.72rem; color:var(--text-dim); max-width:140px; overflow:hidden; text-overflow:ellipsis;">${mods}</td>
            <td>
                <div style="display:flex; gap:6px;">
                    <button onclick="openAsAdmin('${ws.id}')" style="background:rgba(255,215,0,.1);color:#FFD700;border:1px solid rgba(255,215,0,.3);padding:4px 10px;border-radius:6px;font-size:.72rem;cursor:pointer;">Abrir</button>
                    <button onclick="showOverrideModal('${ws.id}','${ws.name}','${ws.plan}')" style="background:rgba(100,180,255,.1);color:#60a5fa;border:1px solid rgba(100,180,255,.3);padding:4px 10px;border-radius:6px;font-size:.72rem;cursor:pointer;">Override</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function filterDevTable(q) {
    const filtered = _devWorkspaces.filter(w =>
        (w.name || '').toLowerCase().includes(q.toLowerCase()) ||
        (w.slug || '').toLowerCase().includes(q.toLowerCase())
    );
    // get leads count from existing fetch — simplified: re-render with original leads count (0 for filtered)
    renderDevTable(filtered, []);
}

function openAsAdmin(wsId) {
    if (typeof switchWorkspace === 'function') {
        switchWorkspace(wsId);
        if (typeof switchTab === 'function') switchTab('home');
    }
}

function showOverrideModal(wsId, wsName, currentPlan) {
    _overrideTargetId = wsId;
    document.getElementById('override-ws-name').textContent = `Override: ${wsName}`;
    document.getElementById('override-plan-select').value = '';
    const ws = _devWorkspaces.find(w => w.id === wsId);
    const mods = Array.isArray(ws?.modules) ? ws.modules : [];
    const allMods = ['consolidation','visitors','ia_whatsapp','start','birthdays','crie','volunteers','financial'];
    document.getElementById('override-modules-list').innerHTML = allMods.map(m =>
        `<label style="display:flex;align-items:center;gap:6px;font-size:.8rem;cursor:pointer;">
            <input type="checkbox" value="${m}" ${mods.includes(m)?'checked':''}>
            ${m}
        </label>`
    ).join('');
    document.getElementById('override-modules-modal').style.display = 'flex';
}
function closeOverrideModal() {
    document.getElementById('override-modules-modal').style.display = 'none';
    _overrideTargetId = null;
}

async function saveOverrideModules() {
    if (!_overrideTargetId) return;
    const newPlan = document.getElementById('override-plan-select').value;
    const checked = Array.from(document.querySelectorAll('#override-modules-list input:checked')).map(c => c.value);
    const update = { modules: checked };
    if (newPlan) update.plan = newPlan;
    const sb = window.supabaseClient;
    const { error } = await sb.from('workspaces').update(update).eq('id', _overrideTargetId);
    if (error) { window.showToast && showToast('Erro ao salvar override', 'error'); return; }
    window.showToast && showToast('Override salvo!', 'success');
    closeOverrideModal();
    await loadDevView();
}

// ── Patch switchTab to handle new views ─────────────────
(function() {
    const _origSwitchTab = window.switchTab;
    window.switchTab = function(tab) {
        // Handle new G views
        ['mural', 'dev'].forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) el.style.display = (tab === v) ? '' : 'none';
        });
        // Delegate the rest to original
        if (_origSwitchTab) _origSwitchTab(tab);
        // Load data on tab activation
        if (tab === 'mural') loadMural();
        if (tab === 'dev')   loadDevView();
        if (tab === 'settings') {
            loadWorkspaceSettings();
        }
    };
})();

// ── Init: show nav-dev for master_admin ─────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Hide new views by default
    ['view-mural', 'view-dev'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
});

// ── Expose for use by existing auth bootstrap ────────────
window.initFaseG = function(user) {
    if (user && user.role === 'master_admin') {
        const navDev = document.getElementById('nav-dev');
        if (navDev) navDev.style.display = '';
    }
};

// ═══════════════════════════════════════════════════════════
// CRIE MODULE — Fase I
// ═══════════════════════════════════════════════════════════

// ── State ───────────────────────────────────────────────────
let crieInscritos = [];
let crieMembros = [];
let crieEventos = [];
let crieCheckinData = [];
let crieMenuOpen = false;

// ── Sidebar toggle ──────────────────────────────────────────
function toggleCrieMenu() {
    crieMenuOpen = !crieMenuOpen;
    const wrap = document.getElementById('crie-submenu-wrap');
    const arrow = document.getElementById('crie-arrow');
    if (wrap) wrap.style.display = crieMenuOpen ? 'flex' : 'none';
    if (arrow) arrow.style.transform = crieMenuOpen ? 'rotate(90deg)' : 'rotate(0deg)';
    const toggleRow = document.getElementById('nav-crie-toggle');
    if (toggleRow) toggleRow.classList.toggle('active', crieMenuOpen);
}

// ── Settings submenu toggle ──────────────────────────────────
let settingsMenuOpen = false;
function toggleSettingsMenu() {
    settingsMenuOpen = !settingsMenuOpen;
    const wrap = document.getElementById('settings-submenu-wrap');
    const arrow = document.getElementById('settings-arrow');
    if (wrap) wrap.style.display = settingsMenuOpen ? 'flex' : 'none';
    if (arrow) arrow.style.transform = settingsMenuOpen ? 'rotate(90deg)' : 'rotate(0deg)';
    const toggleRow = document.getElementById('nav-settings-toggle');
    if (toggleRow) toggleRow.classList.toggle('active', settingsMenuOpen);
}

window.toggleSettingsMenu = toggleSettingsMenu;

// ── switchTab patch — handle crie-* tabs ───────────────────
const _originalSwitchTab = window.switchTab;
window.switchTab = function(tab) {
    if (tab.startsWith('crie-')) {
        // Use classList.remove('active') on ALL view-sections (works with !important CSS)
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        // Activate the target view
        const target = document.getElementById('view-' + tab);
        if (target) target.classList.add('active');
        // Update sidebar active state
        document.querySelectorAll('#sidebar li').forEach(li => li.classList.remove('active'));
        const navItem = document.getElementById('nav-' + tab);
        if (navItem) navItem.classList.add('active');
        // Open CRIE submenu if not already
        if (!crieMenuOpen) toggleCrieMenu();
        // Load data for the view
        const loaders = {
            'crie-inscritos': loadCrieInscritos,
            'crie-membros': loadCrieMembros,
            'crie-eventos': loadCrieEventos,
            'crie-checkin': loadCrieCheckinEventos,
            'crie-relatorios': loadCrieRelatorios,
        };
        if (loaders[tab]) loaders[tab]();
        return;
    }
    if (_originalSwitchTab) _originalSwitchTab(tab);
};

// ── Helper: get current workspace_id ───────────────────────
function getCrieWorkspaceId() {
    return window.currentWorkspaceId || null;
}

// ── Payment badge helper ────────────────────────────────────
function payBadge(status) {
    const map = {
        'Pago':     'background:rgba(74,222,128,.12); color:#4ade80; border:1px solid rgba(74,222,128,.25)',
        'Gratuito': 'background:rgba(96,165,250,.12); color:#60a5fa; border:1px solid rgba(96,165,250,.25)',
        'Pendente': 'background:rgba(245,158,11,.12); color:#F59E0B; border:1px solid rgba(245,158,11,.25)',
    };
    const s = map[status] || map['Pendente'];
    return `<span style="${s}; padding:3px 10px; border-radius:20px; font-size:.72rem; font-weight:700; white-space:nowrap; cursor:pointer;">${status.toUpperCase()}</span>`;
}

// ═══════════════════════════════════════════════════════════
// CRIE — INSCRITOS
// ═══════════════════════════════════════════════════════════
async function loadCrieInscritos() {
    const wsId = getCrieWorkspaceId();
    if (!wsId) return;
    const sb = window.supabaseClient;
    const { data, error } = await sb
        .from('crie_attendees')
        .select('*, crie_events(title, date)')
        .eq('workspace_id', wsId)
        .order('name', { ascending: true }); // ← sorted alphabetically by default

    if (error) { console.error('CRIE inscritos:', error); return; }
    crieInscritos = data || [];

    // Also fetch real member count from crie_members table
    const { data: membData } = await sb
        .from('crie_members')
        .select('id')
        .eq('workspace_id', wsId);
    window._crieRealMembrosCount = (membData || []).length;

    // Also mark attendees as members if they exist in crie_members
    // (cross-reference by email or phone for display)
    const { data: membFull } = await sb
        .from('crie_members')
        .select('email, phone')
        .eq('workspace_id', wsId);
    const membEmails = new Set((membFull || []).map(m => (m.email || '').toLowerCase()));
    const membPhones = new Set((membFull || []).map(m => (m.phone || '').replace(/\D/g, '')));
    crieInscritos.forEach(a => {
        const emailMatch = membEmails.has((a.email || '').toLowerCase());
        const phoneMatch = membPhones.has((a.phone || '').replace(/\D/g, ''));
        a.is_member = emailMatch || phoneMatch;
    });

    // Populate event filter
    const events = [...new Set(crieInscritos.map(a => a.crie_events?.title).filter(Boolean))];
    const sel = document.getElementById('crie-filter-event');
    if (sel) {
        sel.innerHTML = '<option value="all">Todos os Eventos</option>' +
            events.map(e => `<option value="${e}">${e}</option>`).join('');
    }

    updateCrieInscritosKPIs();
    filterCrieInscritos();

}

function updateCrieInscritosKPIs() {
    const eventFilter = document.getElementById('crie-filter-event')?.value || 'all';
    if (eventFilter === 'all') {
        // Unique-person mode: count distinct people
        const unique = _getUniquePersons(crieInscritos);
        const membros = unique.filter(p => p.is_member).length;
        document.getElementById('crie-kpi-total').textContent = unique.length;
        document.getElementById('crie-kpi-membros').textContent = membros;
        document.getElementById('crie-kpi-convidados').textContent = unique.length - membros;
    } else {
        // Per-event mode: count rows for this event
        const eventRows = crieInscritos.filter(a => a.crie_events?.title === eventFilter);
        const membros = eventRows.filter(a => a.is_member).length;
        document.getElementById('crie-kpi-total').textContent = eventRows.length;
        document.getElementById('crie-kpi-membros').textContent = membros;
        document.getElementById('crie-kpi-convidados').textContent = eventRows.length - membros;
    }
    const pagosEl = document.getElementById('crie-kpi-pagos');
    if (pagosEl) pagosEl.textContent = crieInscritos.filter(a => a.payment_status === 'Pago').length;
}

// Returns unique persons grouped by phone OR email (whichever matches first)
function _getUniquePersons(rows) {
    const byPhone = new Map(); // phoneClean -> groupKey
    const byEmail = new Map(); // email -> groupKey
    const persons = new Map(); // groupKey -> person obj

    rows.forEach(a => {
        const phoneClean = (a.phone || '').replace(/\D/g, '');
        const email = (a.email || '').toLowerCase().trim();

        // Try to find an existing group by phone or email
        let key = null;
        if (phoneClean && byPhone.has(phoneClean)) key = byPhone.get(phoneClean);
        if (!key && email && byEmail.has(email)) key = byEmail.get(email);

        if (!key) {
            // New unique person
            key = phoneClean || email || (a.name || '').toLowerCase() + '_' + a.id;
            persons.set(key, { ...a, _allRows: [], _eventCount: 0 });
        }

        // Register phone & email under this key for future lookups
        if (phoneClean) byPhone.set(phoneClean, key);
        if (email) byEmail.set(email, key);

        const p = persons.get(key);
        p._allRows.push(a);
        p._eventCount = p._allRows.length;
        // Keep most recent record's data as the "primary" display
        if (new Date(a.created_at) > new Date(p.created_at)) {
            const saved = { _allRows: p._allRows, _eventCount: p._eventCount };
            Object.assign(p, a, saved);
        }
    });

    return [...persons.values()];
}

function filterCrieInscritos() {
    const search = document.getElementById('crie-search')?.value.toLowerCase() || '';
    const eventFilter = document.getElementById('crie-filter-event')?.value || 'all';
    const payFilter = document.getElementById('crie-filter-payment')?.value || 'all';
    const typeFilter = document.getElementById('crie-filter-type')?.value || 'all';

    updateCrieInscritosKPIs();

    if (eventFilter === 'all') {
        // ── Unique-person mode ──────────────────────────────────
        let unique = _getUniquePersons(crieInscritos);
        if (search) unique = unique.filter(p =>
            p.name?.toLowerCase().includes(search) ||
            p.email?.toLowerCase().includes(search) ||
            p.phone?.includes(search)
        );
        if (typeFilter !== 'all') unique = unique.filter(p =>
            typeFilter === 'member' ? p.is_member : !p.is_member
        );
        renderCrieInscritos(unique, true);
    } else {
        // ── Per-event mode ─────────────────────────────────────
        const filtered = crieInscritos.filter(a => {
            const matchSearch = !search ||
                a.name?.toLowerCase().includes(search) ||
                a.email?.toLowerCase().includes(search) ||
                a.industry?.toLowerCase().includes(search);
            const matchEvent = a.crie_events?.title === eventFilter;
            const matchPay = payFilter === 'all' || a.payment_status === payFilter;
            const matchType = typeFilter === 'all' ||
                (typeFilter === 'member' && a.is_member) ||
                (typeFilter === 'guest' && !a.is_member);
            return matchSearch && matchEvent && matchPay && matchType;
        });
        renderCrieInscritos(filtered, false);
    }
}

function renderCrieInscritos(list, uniqueMode = false) {
    const tbody = document.getElementById('crie-inscritos-body');
    if (!tbody) return;
    const sorted = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt'));
    if (!sorted.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:rgba(255,255,255,.3);">Nenhum inscrito encontrado.</td></tr>';
        return;
    }
    tbody.innerHTML = sorted.map(a => {
        const phoneClean = (a.phone || '').replace(/\D/g, '');
        const waLink = phoneClean ? `https://wa.me/${phoneClean}` : null;
        const waBtn = waLink ? `<a href="${waLink}" target="_blank" title="Abrir WhatsApp" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:rgba(37,211,102,.15);border-radius:50%;color:#25d366;text-decoration:none;" onmouseover="this.style.background='rgba(37,211,102,.3)'" onmouseout="this.style.background='rgba(37,211,102,.15)'"><svg viewBox='0 0 24 24' width='12' height='12' fill='#25d366'><path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z'/><path d='M11.998 0C5.373 0 0 5.373 0 11.998c0 2.117.553 4.1 1.518 5.823L0 24l6.335-1.493A11.945 11.945 0 0 0 11.999 24C18.625 24 24 18.627 24 12.002 24 5.373 18.625 0 11.998 0zm.001 21.818a9.823 9.823 0 0 1-5.011-1.37l-.36-.214-3.722.877.894-3.613-.235-.372A9.818 9.818 0 0 1 2.18 12c0-5.42 4.4-9.818 9.819-9.818 5.42 0 9.82 4.398 9.82 9.818 0 5.42-4.4 9.818-9.82 9.818z'/></svg></a>` : '';
        // ── Event count badge (unique mode only)
        const eventBadge = uniqueMode && a._eventCount > 1
            ? `<span title="${a._eventCount} eventos" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:rgba(96,165,250,.25);color:#60a5fa;border-radius:50%;font-size:.6rem;font-weight:800;flex-shrink:0;">${a._eventCount}</span>`
            : '';
        // ── Event cell
        const eventCell = uniqueMode
            ? (a._eventCount > 1
                ? `<span style="color:#60a5fa;font-size:.75rem;font-weight:600;">${a._eventCount} eventos</span>`
                : `<span style="font-size:.75rem;color:rgba(255,255,255,.4);">${a.crie_events?.title || 'N/A'}</span>`)
            : `${a.crie_events?.title || 'N/A'}`;
        // ── Click row to open drawer
        const rowClick = `onclick="openInscritoDrawer(${JSON.stringify(uniqueMode ? a._allRows : [a]).replace(/"/g,'&quot;')})"`;
        return `
        <tr style="border-bottom:1px solid rgba(255,255,255,.06); cursor:pointer;" onmouseover="this.style.background='rgba(255,255,255,.02)'" onmouseout="this.style.background=''">
            <td style="padding:12px 16px;" onclick="event.stopPropagation();"><input type="checkbox" class="crie-row-check" value="${a.id}"></td>
            <td style="padding:12px 16px;" ${rowClick}>
                <div style="font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
                    ${a.name}
                    ${a.is_member ? '<span style="color:#F59E0B; font-size:.7rem;">★</span>' : ''}
                    ${eventBadge}
                </div>
                <div style="font-size:.75rem; color:rgba(255,255,255,.35); margin-top:2px;">${new Date(a.created_at).toLocaleDateString('pt-PT')}</div>
            </td>
            <td style="padding:12px 16px; font-size:.78rem; color:rgba(255,255,255,.5);" ${rowClick}>
                <div>${a.email || '—'}</div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
                    <span>${a.phone || '—'}</span>
                    <span onclick="event.stopPropagation();">${waBtn}</span>
                </div>
            </td>
            <td style="padding:12px 16px; font-size:.78rem; color:rgba(255,255,255,.5);" ${rowClick}>${eventCell}</td>
            <td style="padding:12px 16px;" ${rowClick}>
                ${a.is_member
                    ? '<span style="background:rgba(245,158,11,.15); color:#F59E0B; padding:3px 8px; border-radius:6px; font-size:.72rem; font-weight:700;">MEMBRO</span>'
                    : '<span style="background:rgba(255,255,255,.06); color:rgba(255,255,255,.4); padding:3px 8px; border-radius:6px; font-size:.72rem; font-weight:700;">CONVIDADO</span>'
                }
            </td>
            <td style="padding:12px 16px;" onclick="event.stopPropagation(); cycleCriePayment('${a.id}', '${a.payment_status}')" style="cursor:pointer;">${payBadge(a.payment_status)}</td>
            <td style="padding:12px 16px;" ${rowClick}>
                ${a.presence_status === 'Presente'
                    ? '<span style="background:rgba(74,222,128,.12); color:#4ade80; padding:3px 8px; border-radius:6px; font-size:.72rem; font-weight:700;">PRESENTE</span>'
                    : a.presence_status === 'Faltou'
                    ? '<span style="background:rgba(248,113,113,.12); color:#f87171; padding:3px 8px; border-radius:6px; font-size:.72rem; font-weight:700;">FALTOU</span>'
                    : '<span style="background:rgba(255,255,255,.06); color:rgba(255,255,255,.35); padding:3px 8px; border-radius:6px; font-size:.72rem; font-weight:700;">PENDENTE</span>'
                }
            </td>
            <td style="padding:12px 16px;" onclick="event.stopPropagation();">
                <button onclick="deleteCrieInscrito('${a.id}')" style="background:none; border:none; color:rgba(255,100,100,.5); cursor:pointer; font-size:.8rem; padding:4px;" title="Remover">✕</button>
            </td>
        </tr>`;
    }).join('');
}

// ── Inscrito Person Drawer ────────────────────────────────────
window.openInscritoDrawer = function(rows) {
    if (!Array.isArray(rows)) rows = [rows];
    const person = rows[0];
    const el = document.getElementById('inscrito-drawer-overlay');
    if (!el) return;

    // Header
    document.getElementById('inscrito-drawer-name').textContent = person.name || '—';
    document.getElementById('inscrito-drawer-badge').textContent = `${rows.length} evento${rows.length !== 1 ? 's' : ''}`;

    // Edit fields
    document.getElementById('inscrito-drawer-input-name').value = person.name || '';
    document.getElementById('inscrito-drawer-input-email').value = person.email || '';
    document.getElementById('inscrito-drawer-input-phone').value = person.phone || '';
    // Store all ids for save
    el.dataset.ids = JSON.stringify(rows.map(r => r.id));
    el.dataset.primaryId = person.id;

    // Event history
    const hist = document.getElementById('inscrito-drawer-history');
    const sortedRows = [...rows].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    hist.innerHTML = sortedRows.map(r => {
        const evTitle = r.crie_events?.title || 'Evento desconhecido';
        const evDate = r.crie_events?.date ? new Date(r.crie_events.date).toLocaleDateString('pt-PT') : '—';
        const presColor = r.presence_status === 'Presente' ? '#4ade80' : r.presence_status === 'Faltou' ? '#f87171' : '#9ca3af';
        const payColor = r.payment_status === 'Pago' ? '#4ade80' : r.payment_status === 'Gratuito' ? '#60a5fa' : '#9ca3af';
        return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);">
            <div style="width:36px;height:36px;background:rgba(255,215,0,.08);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;color:#fff;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${evTitle}</div>
                <div style="font-size:.72rem;color:rgba(255,255,255,.35);margin-top:2px;">${evDate}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                <span style="font-size:.68rem;font-weight:700;color:${presColor};">${r.presence_status || 'PENDENTE'}</span>
                <span style="font-size:.68rem;font-weight:600;color:${payColor};">${r.payment_status || '—'}</span>
            </div>
        </div>`;
    }).join('');

    el.style.display = 'flex';
};

window.closeInscritoDrawer = function() {
    const el = document.getElementById('inscrito-drawer-overlay');
    if (el) el.style.display = 'none';
};

window.saveInscritoDrawer = async function() {
    const el = document.getElementById('inscrito-drawer-overlay');
    const ids = JSON.parse(el.dataset.ids || '[]');
    const name = document.getElementById('inscrito-drawer-input-name').value.trim();
    const email = document.getElementById('inscrito-drawer-input-email').value.trim();
    const phone = document.getElementById('inscrito-drawer-input-phone').value.trim();
    if (!name) { if(typeof hubToast!=='undefined') hubToast('Nome é obrigatório','error'); return; }
    const sb = window.supabaseClient;
    // Update all attendee rows for this person AND the crie_members entry if exists
    const { error } = await sb.from('crie_attendees').update({ name, email, phone }).in('id', ids);
    if (error) { if(typeof hubToast!=='undefined') hubToast('Erro ao salvar: '+error.message,'error'); return; }
    // Also update crie_members if phone/email matches
    await sb.from('crie_members').update({ name, email, phone }).or(`email.eq.${email},phone.eq.${phone}`);
    if(typeof hubToast!=='undefined') hubToast('Dados guardados!','success');
    closeInscritoDrawer();
    loadCrieInscritos();
};

async function cycleCriePayment(id, current) {
    const cycle = ['Pendente', 'Pago', 'Gratuito'];
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    const sb = window.supabaseClient;
    await sb.from('crie_attendees').update({ payment_status: next }).eq('id', id);
    const idx = crieInscritos.findIndex(a => a.id === id);
    if (idx !== -1) crieInscritos[idx].payment_status = next;
    filterCrieInscritos();
}

async function deleteCrieInscrito(id) {
    if (!confirm('Remover este inscrito?')) return;
    const sb = window.supabaseClient;
    await sb.from('crie_attendees').delete().eq('id', id);
    crieInscritos = crieInscritos.filter(a => a.id !== id);
    updateCrieInscritosKPIs();
    filterCrieInscritos();
}

function crieToggleAll(checkbox) {
    document.querySelectorAll('.crie-row-check').forEach(c => c.checked = checkbox.checked);
}

// ── Download report as HTML ─────────────────────────────────
async function downloadCrieReport() {
    const sorted = [...crieInscritos].sort((a,b) => (a.name||'').localeCompare(b.name||'','pt'));
    const wsName = document.getElementById('sidebar-workspace-name')?.textContent || 'CRIE';
    const dateStr = new Date().toLocaleDateString('pt-PT', {day:'2-digit',month:'long',year:'numeric'});
    const html = _buildCrieReportHtml(sorted, wsName, dateStr);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8;' }));
    link.download = `crie_inscritos_${new Date().toISOString().slice(0,10)}.html`;
    link.click();
    if (typeof hubToast !== 'undefined') hubToast('Lista baixada com sucesso!', 'success');
}


// ── Shared HTML report builder ──────────────────────────────
function _buildCrieReportHtml(sorted, wsName, dateStr) {
    const rowsHtml = sorted.map((a, i) => {
        const phoneClean = (a.phone || '').replace(/\D/g, '');
        const waLink = phoneClean ? `https://wa.me/${phoneClean}` : null;
        const bgRow = i % 2 === 0 ? '#1a1a2e' : '#16213e';
        return `
        <tr style="background:${bgRow};">
            <td style="padding:10px 14px; border-bottom:1px solid #2a2a4a; color:#fff; font-weight:600;">${a.name || '—'}</td>
            <td style="padding:10px 14px; border-bottom:1px solid #2a2a4a; color:#9ca3af; font-size:13px;">${a.email || '—'}</td>
            <td style="padding:10px 14px; border-bottom:1px solid #2a2a4a; color:#9ca3af; font-size:13px;">
                ${a.phone || '—'}
                ${waLink ? `&nbsp;<a href="${waLink}" style="display:inline-block;background:#25d366;color:#fff;text-decoration:none;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">WhatsApp</a>` : ''}
            </td>
            <td style="padding:10px 14px; border-bottom:1px solid #2a2a4a; font-size:12px;">
                <span style="background:${a.is_member ? 'rgba(245,158,11,.2)' : 'rgba(255,255,255,.06)'}; color:${a.is_member ? '#F59E0B' : '#9ca3af'}; padding:2px 8px; border-radius:4px; font-weight:700;">${a.is_member ? 'MEMBRO' : 'CONVIDADO'}</span>
            </td>
            <td style="padding:10px 14px; border-bottom:1px solid #2a2a4a; color:${a.presence_status==='Presente'?'#4ade80':a.presence_status==='Faltou'?'#f87171':'#9ca3af'}; font-size:12px; font-weight:700;">${a.presence_status || '—'}</td>
            <td style="padding:10px 14px; border-bottom:1px solid #2a2a4a; color:#9ca3af; font-size:12px;">${a.crie_events?.title || '—'}</td>
        </tr>`;
    }).join('');
    const totalMembros = sorted.filter(a => a.is_member).length;
    const totalPresentes = sorted.filter(a => a.presence_status === 'Presente').length;
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:900px;margin:0 auto;padding:32px 16px;">
  <div style="background:linear-gradient(135deg,#1a1a3e,#0d0d1a);border:1px solid rgba(255,215,0,.2);border-radius:16px;padding:32px;margin-bottom:24px;text-align:center;">
    <div style="font-size:36px;margin-bottom:8px;">🌟</div>
    <h1 style="color:#FFD700;font-size:26px;margin:0 0 6px;">Lista de Inscritos CRIE</h1>
    <p style="color:#9ca3af;font-size:14px;margin:0;">${wsName} · ${dateStr}</p>
  </div>
  <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
    <div style="flex:1;min-width:120px;background:#1a1a2e;border:1px solid rgba(255,215,0,.15);border-radius:12px;padding:16px;text-align:center;"><div style="font-size:28px;font-weight:800;color:#FFD700;">${sorted.length}</div><div style="font-size:12px;color:#9ca3af;margin-top:4px;">Total</div></div>
    <div style="flex:1;min-width:120px;background:#1a1a2e;border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:16px;text-align:center;"><div style="font-size:28px;font-weight:800;color:#F59E0B;">${totalMembros}</div><div style="font-size:12px;color:#9ca3af;margin-top:4px;">Membros</div></div>
    <div style="flex:1;min-width:120px;background:#1a1a2e;border:1px solid rgba(96,165,250,.2);border-radius:12px;padding:16px;text-align:center;"><div style="font-size:28px;font-weight:800;color:#60a5fa;">${sorted.length-totalMembros}</div><div style="font-size:12px;color:#9ca3af;margin-top:4px;">Convidados</div></div>
    <div style="flex:1;min-width:120px;background:#1a1a2e;border:1px solid rgba(74,222,128,.2);border-radius:12px;padding:16px;text-align:center;"><div style="font-size:28px;font-weight:800;color:#4ade80;">${totalPresentes}</div><div style="font-size:12px;color:#9ca3af;margin-top:4px;">Presentes</div></div>
  </div>
  <div style="background:#1a1a2e;border:1px solid rgba(255,255,255,.06);border-radius:12px;overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#252547;"><th style="padding:12px 14px;text-align:left;color:#FFD700;font-size:12px;font-weight:700;">NOME</th><th style="padding:12px 14px;text-align:left;color:#FFD700;font-size:12px;font-weight:700;">EMAIL</th><th style="padding:12px 14px;text-align:left;color:#FFD700;font-size:12px;font-weight:700;">TELEFONE</th><th style="padding:12px 14px;text-align:left;color:#FFD700;font-size:12px;font-weight:700;">TIPO</th><th style="padding:12px 14px;text-align:left;color:#FFD700;font-size:12px;font-weight:700;">PRESENÇA</th><th style="padding:12px 14px;text-align:left;color:#FFD700;font-size:12px;font-weight:700;">EVENTO</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
  <p style="text-align:center;color:#4a4a6a;font-size:12px;margin-top:24px;">Gerado pelo Lago HUB · ${dateStr}</p>
</div>
</body></html>`;
}

// ── Email report via Edge Function ──────────────────────────
async function emailCrieReport() {
    const userEmail = window._profileCache?.email;
    if (!userEmail) { if(typeof hubToast!=='undefined') hubToast('Email não disponível. Faça login novamente.','error'); return; }
    const sorted = [...crieInscritos].sort((a,b) => (a.name||'').localeCompare(b.name||'','pt'));
    const wsName = document.getElementById('sidebar-workspace-name')?.textContent || 'CRIE';
    const dateStr = new Date().toLocaleDateString('pt-PT', {day:'2-digit',month:'long',year:'numeric'});
    const html = _buildCrieReportHtml(sorted, wsName, dateStr);
    const totalMembros = sorted.filter(a => a.is_member).length;
    const totalPresentes = sorted.filter(a => a.presence_status === 'Presente').length;
    try {
        const sb = window.supabaseClient;
        const { data: { session } } = await sb.auth.getSession();
        const res = await fetch('https://uyseheucqikgcorrygzc.supabase.co/functions/v1/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({ to: userEmail, subject: `Lista CRIE ${wsName}`, html })
        });
        if (res.ok) {
            if (typeof hubToast !== 'undefined') hubToast(`Email enviado para ${userEmail}!`, 'success');
        } else throw new Error('send failed');
    } catch(e) {
        if (typeof hubToast !== 'undefined') hubToast('Erro ao enviar email. Verifique a Edge Function.', 'error');
    }
}

// ── Invite Modal ─────────────────────────────────────────────
window.openCrieInviteModal = function() {
    const checked = Array.from(document.querySelectorAll('.crie-row-check:checked'));
    if (checked.length === 0) {
        if(typeof hubToast!=='undefined') hubToast('Selecione pelo menos um inscrito.', 'info');
        return;
    }
    // Count display
    const countEl = document.getElementById('crie-invite-count');
    if (countEl) countEl.textContent = `${checked.length} inscrito(s) selecionado(s)`;

    // Populate event select from loaded events
    const sel = document.getElementById('crie-invite-event-sel');
    if (sel) {
        sel.innerHTML = '<option value="">— Escolha um evento —</option>';
        crieEventos.forEach(ev => {
            const dateStr = ev.date ? new Date(ev.date).toLocaleDateString('pt-PT') : '';
            const opt = document.createElement('option');
            opt.value = ev.id;
            opt.dataset.title = ev.title;
            opt.dataset.date = dateStr;
            opt.textContent = `${ev.title}${dateStr ? ' · ' + dateStr : ''}`;
            sel.appendChild(opt);
        });
        // When event changes, update message preview
        sel.onchange = function() {
            const opt = sel.options[sel.selectedIndex];
            const msgEl = document.getElementById('crie-invite-msg');
            if (!msgEl) return;
            if (!opt.value) { msgEl.value = ''; return; }
            const wsName = document.getElementById('sidebar-workspace-name')?.textContent || 'CRIE';
            msgEl.value = `Olá! 👋\n\nConvidamos você para o próximo evento do CRIE!\n\n✨ *${opt.dataset.title}*\n📅 ${opt.dataset.date}\n\nEsperamos por você! Se tiver dúvidas, entre em contacto.\n\n— Equipa ${wsName} 🙏`;
        };
    }

    const modal = document.getElementById('crie-invite-modal-overlay');
    if (modal) modal.style.display = 'flex';
};

window.closeCrieInviteModal = function() {
    const modal = document.getElementById('crie-invite-modal-overlay');
    if (modal) modal.style.display = 'none';
};

window.confirmCrieInvite = function() {
    const sel = document.getElementById('crie-invite-event-sel');
    if (!sel || !sel.value) {
        if(typeof hubToast!=='undefined') hubToast('Selecione um evento primeiro.', 'info');
        return;
    }
    const msg = document.getElementById('crie-invite-msg')?.value || '';
    const checked = Array.from(document.querySelectorAll('.crie-row-check:checked'));
    const ids = checked.map(c => c.value);
    const attendees = crieInscritos.filter(a => ids.includes(String(a.id)));
    let opened = 0;
    attendees.forEach((a, idx) => {
        const phoneClean = (a.phone || '').replace(/\D/g, '');
        if (!phoneClean) return;
        setTimeout(() => {
            window.open(`https://wa.me/${phoneClean}?text=${encodeURIComponent(msg)}`, '_blank');
        }, idx * 400); // stagger to avoid popup blockers
        opened++;
    });
    closeCrieInviteModal();
    if(typeof hubToast!=='undefined') hubToast(`${opened} convite(s) abertos no WhatsApp!`, 'success');
};

// ═══════════════════════════════════════════════════════════
// CRIE — MEMBROS
// ═══════════════════════════════════════════════════════════
async function loadCrieMembros() {
    const wsId = getCrieWorkspaceId();
    if (!wsId) return;
    const sb = window.supabaseClient;
    const { data } = await sb
        .from('crie_members')
        .select('*')
        .eq('workspace_id', wsId)
        .order('name');
    crieMembros = data || [];
    renderCrieMembros(crieMembros);
}

function filterCrieMembros() {
    const q = document.getElementById('crie-membro-search')?.value.toLowerCase() || '';
    renderCrieMembros(crieMembros.filter(m =>
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.company?.toLowerCase().includes(q)
    ));
}

function renderCrieMembros(list) {
    const grid = document.getElementById('crie-membros-grid');
    if (!grid) return;
    if (!list.length) {
        grid.innerHTML = '<div style="text-align:center; padding:40px; color:rgba(255,255,255,.3); grid-column:1/-1;">Nenhum membro encontrado.</div>';
        return;
    }
    grid.innerHTML = list.map(m => {
        const initials = m.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
        const statusColor = m.status === 'Ativo' ? '#4ade80' : '#f87171';
        const phoneClean = (m.phone || '').replace(/\D/g, '');
        const waLink = phoneClean ? `https://wa.me/${phoneClean}` : null;
        const feeStr = m.monthly_fee > 0 ? `€${Number(m.monthly_fee).toFixed(2)}/mês` : '';
        return `
        <div class="hub-announcement-card" style="cursor:pointer; transition:transform .15s,box-shadow .15s;" onclick="openMembroDrawer('${m.id}')"
             onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 30px rgba(245,158,11,.12)'"
             onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div style="display:flex; align-items:center; gap:14px; margin-bottom:14px;">
                <div style="width:44px; height:44px; border-radius:50%; background:rgba(245,158,11,.15); border:1px solid rgba(245,158,11,.3); display:flex; align-items:center; justify-content:center; font-weight:900; color:#F59E0B; font-size:1rem; flex-shrink:0;">${initials}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:800; color:#fff; font-size:.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.name}</div>
                    <div style="font-size:.72rem; color:rgba(255,255,255,.4); margin-top:2px;">${m.company || m.industry || (feeStr ? feeStr : 'Membro')}</div>
                </div>
                <span style="background:${m.status==='Ativo'?'rgba(74,222,128,.12)':'rgba(248,113,113,.12)'}; color:${statusColor}; border:1px solid ${statusColor}44; padding:3px 8px; border-radius:6px; font-size:.68rem; font-weight:700;">${m.status.toUpperCase()}</span>
            </div>
            <div style="font-size:.75rem; color:rgba(255,255,255,.4); display:flex; flex-direction:column; gap:4px;">
                <span>📧 ${m.email || '—'}</span>
                <span style="display:flex;align-items:center;gap:6px;">
                    📞 ${m.phone || '—'}
                    ${waLink ? `<a href="${waLink}" target="_blank" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:rgba(37,211,102,.15);border-radius:50%;color:#25d366;text-decoration:none;font-size:.65rem;">💬</a>` : ''}
                </span>
                ${feeStr ? `<span>💳 ${feeStr}</span>` : ''}
            </div>
            <div style="margin-top:14px; display:flex; gap:8px;">
                <button onclick="event.stopPropagation();openMembroDrawer('${m.id}')" style="flex:1; padding:8px; background:rgba(255,215,0,.08); border:1px solid rgba(255,215,0,.2); border-radius:10px; color:#FFD700; font-size:.72rem; font-weight:700; cursor:pointer;">
                    ✏️ Editar
                </button>
                <button onclick="event.stopPropagation();deleteCrieMembro('${m.id}')" style="padding:8px 12px; background:rgba(255,100,100,.08); border:1px solid rgba(255,100,100,.15); border-radius:10px; color:#f87171; font-size:.72rem; cursor:pointer;">✕</button>
            </div>
        </div>`;
    }).join('');
}

// ─── Member Drawer State ──────────────────────────────────────
let _membroDrawerId = null;

function openAddMembroModal() {
    const modal = document.getElementById('modal-add-membro');
    if (modal) { modal.style.display = 'flex'; }
}

async function openMembroDrawer(memberId) {
    _membroDrawerId = memberId;
    const m = crieMembros.find(x => x.id === memberId);
    if (!m) return;

    // Update header
    const initials = m.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
    document.getElementById('membro-drawer-avatar').textContent = initials;
    document.getElementById('membro-drawer-name').textContent = m.name;
    document.getElementById('membro-drawer-subtitle').textContent = m.email || '';
    const badge = document.getElementById('membro-drawer-status-badge');
    badge.textContent = m.status?.toUpperCase() || 'ATIVO';
    badge.style.cssText = m.status === 'Ativo'
        ? 'font-size:.68rem;font-weight:700;padding:4px 10px;border-radius:6px;background:rgba(74,222,128,.12);color:#4ade80;border:1px solid rgba(74,222,128,.3);'
        : 'font-size:.68rem;font-weight:700;padding:4px 10px;border-radius:6px;background:rgba(248,113,113,.12);color:#f87171;border:1px solid rgba(248,113,113,.3);';

    // Fill Dados tab
    document.getElementById('mdr-name').value = m.name || '';
    document.getElementById('mdr-email').value = m.email || '';
    document.getElementById('mdr-phone').value = m.phone || '';
    document.getElementById('mdr-company').value = m.company || m.industry || '';
    document.getElementById('mdr-fee').value = m.monthly_fee || '';
    document.getElementById('mdr-status').value = m.status || 'Ativo';
    document.getElementById('mdr-notes').value = m.notes || '';

    // Populate event selector in Presença tab
    const attEvtSel = document.getElementById('mdr-att-event');
    if (attEvtSel) {
        attEvtSel.innerHTML = '<option value="">Selecionar Evento…</option>' +
            (crieEventos || []).map(ev => `<option value="${ev.id}" data-title="${ev.title||''}" data-date="${ev.date||''}">${ev.title || 'Evento'}</option>`).join('');
    }

    // Show drawer
    document.getElementById('membro-drawer-overlay').style.display = 'block';
    const drawer = document.getElementById('membro-drawer');
    drawer.style.display = 'flex';

    // Switch to Dados tab
    switchMembroTab('dados', drawer.querySelector('[data-tab="dados"]'));

    // Load financial data and attendance
    await loadMembroTransactions(memberId);
    await loadMembroAttendance(memberId);
}

function closeMembroDrawer() {
    document.getElementById('membro-drawer-overlay').style.display = 'none';
    document.getElementById('membro-drawer').style.display = 'none';
    _membroDrawerId = null;
}

function switchMembroTab(tab, btn) {
    // Hide all content panes
    document.querySelectorAll('.membro-tab-content').forEach(el => el.style.display = 'none');
    // Deactivate all tabs
    document.querySelectorAll('.membro-tab').forEach(el => el.classList.remove('active'));
    // Show selected
    const content = document.getElementById('membro-tab-' + tab);
    if (content) content.style.display = 'block';
    if (btn) btn.classList.add('active');
}

async function saveMembroDrawer() {
    if (!_membroDrawerId) return;
    const sb = window.supabaseClient;
    const upd = {
        name:        document.getElementById('mdr-name').value.trim(),
        email:       document.getElementById('mdr-email').value.trim(),
        phone:       document.getElementById('mdr-phone').value.trim(),
        company:     document.getElementById('mdr-company').value.trim() || null,
        industry:    document.getElementById('mdr-company').value.trim() || null,
        monthly_fee: parseFloat(document.getElementById('mdr-fee').value) || 0,
        status:      document.getElementById('mdr-status').value,
    };
    const { error } = await sb.from('crie_members').update(upd).eq('id', _membroDrawerId);
    if (error) { if (window.hubToast) hubToast('Erro ao guardar: ' + error.message, 'error'); return; }
    // Update local cache
    const idx = crieMembros.findIndex(m => m.id === _membroDrawerId);
    if (idx !== -1) Object.assign(crieMembros[idx], upd);
    renderCrieMembros(crieMembros);
    // Update header
    document.getElementById('membro-drawer-name').textContent = upd.name;
    if (window.hubToast) hubToast('Membro atualizado!', 'success');
}

async function saveMembroNotes() {
    if (!_membroDrawerId) return;
    const sb = window.supabaseClient;
    const notes = document.getElementById('mdr-notes').value;
    const { error } = await sb.from('crie_members').update({ notes }).eq('id', _membroDrawerId);
    if (error) { if (window.hubToast) hubToast('Erro ao guardar notas', 'error'); return; }
    const idx = crieMembros.findIndex(m => m.id === _membroDrawerId);
    if (idx !== -1) crieMembros[idx].notes = notes;
    if (window.hubToast) hubToast('Notas guardadas!', 'success');
}

// ─── Mensalidades (Transactions) ─────────────────────────────
async function loadMembroTransactions(memberId) {
    const sb = window.supabaseClient;
    const { data, error } = await sb
        .from('crie_member_transactions')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });
    renderMembroTransactions(data || []);
}

function renderMembroTransactions(txns) {
    const listEl = document.getElementById('mdr-txn-list');
    if (!listEl) return;
    const totalPaid = txns.filter(t => t.type === 'payment').reduce((s, t) => s + (t.amount || 0), 0);
    const totalExp  = txns.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
    const balance   = totalPaid - totalExp;
    const fmt = n => `€${Number(n).toFixed(2)}`;
    document.getElementById('mdr-total-paid').textContent = fmt(totalPaid);
    document.getElementById('mdr-total-expenses').textContent = fmt(totalExp);
    const balEl = document.getElementById('mdr-balance');
    balEl.textContent = fmt(balance);
    balEl.style.color = balance >= 0 ? '#FFD700' : '#f87171';

    if (!txns.length) {
        listEl.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.2);padding:20px;font-size:.82rem;">Sem transações registadas.</div>';
        return;
    }
    listEl.innerHTML = txns.map(t => {
        const isPayment = t.type === 'payment';
        const color = isPayment ? '#4ade80' : '#f87171';
        const icon  = isPayment ? '💰' : '↩️';
        const dt = new Date(t.created_at).toLocaleDateString('pt-PT');
        const refMonth = t.reference_month ? ` · Ref: ${t.reference_month}` : '';
        return `
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px;">
            <div style="width:34px;height:34px;border-radius:50%;background:${isPayment ? 'rgba(74,222,128,.1)' : 'rgba(248,113,113,.1)'};display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">${icon}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:.84rem;color:#fff;font-weight:600;">${t.description || (isPayment ? 'Mensalidade' : 'Estorno/Despesa')}</div>
                <div style="font-size:.7rem;color:rgba(255,255,255,.35);margin-top:2px;">${dt}${refMonth}</div>
            </div>
            <div style="font-size:1rem;font-weight:800;color:${color};">${isPayment ? '+' : '-'}${fmt(t.amount)}</div>
            <button onclick="deleteMembroTransaction('${t.id}')" style="background:none;border:none;color:rgba(255,80,80,.4);cursor:pointer;font-size:.8rem;padding:4px;" title="Remover">✕</button>
        </div>`;
    }).join('');
}

async function addMembroTransaction() {
    if (!_membroDrawerId) return;
    const type   = document.getElementById('mdr-txn-type').value;
    const amount = parseFloat(document.getElementById('mdr-txn-amount').value);
    const month  = document.getElementById('mdr-txn-month').value || null;
    const desc   = document.getElementById('mdr-txn-desc').value.trim() || null;
    if (!amount || amount <= 0) { if (window.hubToast) hubToast('Insira um valor válido', 'error'); return; }
    const sb = window.supabaseClient;
    const wsId = getCrieWorkspaceId();
    const { error } = await sb.from('crie_member_transactions').insert({
        workspace_id: wsId, member_id: _membroDrawerId,
        type, amount, reference_month: month, description: desc
    });
    if (error) { if (window.hubToast) hubToast('Erro: ' + error.message, 'error'); return; }
    document.getElementById('mdr-txn-amount').value = '';
    document.getElementById('mdr-txn-desc').value = '';
    await loadMembroTransactions(_membroDrawerId);
    if (window.hubToast) hubToast(type === 'payment' ? '💰 Pagamento registado!' : '↩️ Despesa registada!', 'success');
}

async function deleteMembroTransaction(txnId) {
    if (!confirm('Remover esta transação?')) return;
    const sb = window.supabaseClient;
    await sb.from('crie_member_transactions').delete().eq('id', txnId);
    await loadMembroTransactions(_membroDrawerId);
}

// ─── Presenças (Attendance) ───────────────────────────────────
async function loadMembroAttendance(memberId) {
    const sb = window.supabaseClient;
    const { data } = await sb
        .from('crie_member_attendance')
        .select('*')
        .eq('member_id', memberId)
        .order('event_date', { ascending: false });
    renderMembroAttendance(data || []);
}

function renderMembroAttendance(att) {
    const listEl = document.getElementById('mdr-att-list');
    const present = att.filter(a => a.status === 'Presente').length;
    const absent  = att.filter(a => a.status === 'Faltou').length;
    const total   = att.length;
    document.getElementById('mdr-att-present').textContent = present;
    document.getElementById('mdr-att-absent').textContent  = absent;
    document.getElementById('mdr-att-rate').textContent    = total ? Math.round((present / total) * 100) + '%' : '—';

    if (!listEl) return;
    if (!att.length) {
        listEl.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.2);padding:20px;font-size:.82rem;">Sem registos de presença.</div>';
        return;
    }
    const statusMap = {
        'Presente':   { color: '#4ade80', bg: 'rgba(74,222,128,.1)',   icon: '✅' },
        'Faltou':     { color: '#f87171', bg: 'rgba(248,113,113,.1)',  icon: '❌' },
        'Justificado':{ color: '#F59E0B', bg: 'rgba(245,158,11,.1)',   icon: '⚠️' },
    };
    listEl.innerHTML = att.map(a => {
        const s = statusMap[a.status] || statusMap['Justificado'];
        const dt = a.event_date ? new Date(a.event_date + 'T00:00:00').toLocaleDateString('pt-PT') : '—';
        return `
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px;">
            <div style="width:34px;height:34px;border-radius:50%;background:${s.bg};display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">${s.icon}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:.84rem;color:#fff;font-weight:600;">${a.event_title || 'Evento'}</div>
                <div style="font-size:.7rem;color:rgba(255,255,255,.35);margin-top:2px;">${dt}</div>
            </div>
            <span style="background:${s.bg};color:${s.color};padding:3px 8px;border-radius:6px;font-size:.68rem;font-weight:700;">${a.status.toUpperCase()}</span>
            <button onclick="deleteMembroAttendance('${a.id}')" style="background:none;border:none;color:rgba(255,80,80,.4);cursor:pointer;font-size:.8rem;padding:4px;" title="Remover">✕</button>
        </div>`;
    }).join('');
}

async function addMembroAttendance() {
    if (!_membroDrawerId) return;
    const evtSel = document.getElementById('mdr-att-event');
    const opt    = evtSel?.selectedOptions[0];
    const evtId  = evtSel?.value || null;
    const evtTitle = opt?.dataset?.title || opt?.textContent || '';
    const evtDate  = opt?.dataset?.date || null;
    const status = document.getElementById('mdr-att-status').value;
    if (!evtId) { if (window.hubToast) hubToast('Selecione um evento', 'error'); return; }
    const sb  = window.supabaseClient;
    const wsId = getCrieWorkspaceId();
    const { error } = await sb.from('crie_member_attendance').insert({
        workspace_id: wsId, member_id: _membroDrawerId,
        event_id: evtId, event_title: evtTitle,
        event_date: evtDate || null, status
    });
    if (error) { if (window.hubToast) hubToast('Erro: ' + error.message, 'error'); return; }
    await loadMembroAttendance(_membroDrawerId);
    if (window.hubToast) hubToast('Presença registada!', 'success');
}

async function deleteMembroAttendance(attId) {
    if (!confirm('Remover este registo?')) return;
    const sb = window.supabaseClient;
    await sb.from('crie_member_attendance').delete().eq('id', attId);
    await loadMembroAttendance(_membroDrawerId);
}

async function saveCrieMembro(e) {
    e.preventDefault();
    const wsId = getCrieWorkspaceId();
    const form = e.target;
    // Build full international phone number
    const countryCode = document.getElementById('membro-phone-country')?.value || '+351';
    const rawNumber = (document.getElementById('membro-phone-number')?.value || '').replace(/\D/g, '');
    const fullPhone = rawNumber ? `${countryCode}${rawNumber}` : null;
    const data = {
        workspace_id: wsId,
        name: form.name.value,
        email: form.email.value,
        phone: fullPhone,
        company: form.company?.value || null,
        industry: form.industry?.value || null,
    };
    const sb = window.supabaseClient;
    const { error } = await sb.from('crie_members').insert(data);
    if (error) { if(typeof hubToast!=='undefined') hubToast('Erro: ' + error.message,'error'); return; }
    closeModal('modal-add-membro');
    form.reset();
    if(typeof hubToast!=='undefined') hubToast('Membro adicionado!','success');
    loadCrieMembros();
}


async function toggleCrieMembroStatus(id, current) {
    const next = current === 'Ativo' ? 'Inativo' : 'Ativo';
    const sb = window.supabaseClient;
    await sb.from('crie_members').update({ status: next }).eq('id', id);
    const idx = crieMembros.findIndex(m => m.id === id);
    if (idx !== -1) crieMembros[idx].status = next;
    renderCrieMembros(crieMembros);
}

async function deleteCrieMembro(id) {
    if (!confirm('Remover este membro permanentemente?')) return;
    const sb = window.supabaseClient;
    await sb.from('crie_members').delete().eq('id', id);
    crieMembros = crieMembros.filter(m => m.id !== id);
    renderCrieMembros(crieMembros);
    if (_membroDrawerId === id) closeMembroDrawer();
}

// ═══════════════════════════════════════════════════════════
// CRIE — EVENTOS
// ═══════════════════════════════════════════════════════════
async function loadCrieEventos() {
    const wsId = getCrieWorkspaceId();
    if (!wsId) return;
    const sb = window.supabaseClient;
    // Do not fail if relation does not exist; try-catch it
    let data = [];
    try {
        const res = await sb.from('crie_events').select('*').eq('workspace_id', wsId).order('date', { ascending: false });
        if (res.error) throw res.error;
        data = res.data || [];
    } catch(e) {
        console.error('loadCrieEventos:', e);
    }
    crieEventos = data || [];
    renderCrieEventos(crieEventos);
    // Also populate checkin event selector
    populateCheckinEventos(crieEventos);
}

let _eventoStatusFilter = 'all';
function filterEventos(status, btn) {
    _eventoStatusFilter = status;
    document.querySelectorAll('#view-crie-eventos .hub-scope-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const filtered = status === 'all' ? crieEventos : crieEventos.filter(e => e.status === status);
    renderCrieEventos(filtered);
}

function renderCrieEventos(list) {
    const grid = document.getElementById('crie-eventos-grid');
    if (!grid) return;
    if (!list.length) {
        grid.innerHTML = '<div style="text-align:center; padding:40px; color:rgba(255,255,255,.3); grid-column:1/-1;">Nenhum evento encontrado.</div>';
        return;
    }

    const statusMap = {
        ACTIVE:   { label: 'ATIVO',      color: '#4ade80', bg: 'rgba(74,222,128,.12)'  },
        DRAFT:    { label: 'RASCUNHO',   color: '#F59E0B', bg: 'rgba(245,158,11,.12)'  },
        ARCHIVED: { label: 'ARQUIVADO',  color: 'rgba(255,255,255,.3)', bg: 'rgba(255,255,255,.05)' },
    };

    grid.innerHTML = list.map(ev => {
        const st = statusMap[ev.status] || statusMap.DRAFT;
        const attendeeCount = ev.crie_attendees?.[0]?.count || 0;
        const occupancy = ev.capacity > 0 ? Math.round((attendeeCount / ev.capacity) * 100) : null;
        const dateStr = new Date(ev.date).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

        return `
        <div class="hub-announcement-card" style="cursor:default; display:flex; flex-direction:column; gap:16px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:900; color:#fff; font-size:1.05rem; margin-bottom:4px;">${ev.title}</div>
                    <div style="font-size:.75rem; color:rgba(255,255,255,.4);">📍 ${ev.location}</div>
                </div>
                <span style="background:${st.bg}; color:${st.color}; border:1px solid ${st.color}44; padding:3px 8px; border-radius:6px; font-size:.68rem; font-weight:700; flex-shrink:0; margin-left:10px;">${st.label}</span>
            </div>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
                <span style="font-size:.78rem; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:5px 10px; color:rgba(255,255,255,.6);">📅 ${dateStr}</span>
                ${ev.price > 0 ? `<span style="font-size:.78rem; background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.2); border-radius:8px; padding:5px 10px; color:#F59E0B; font-weight:700;">${ev.price.toFixed(2)}€</span>` : '<span style="font-size:.78rem; background:rgba(74,222,128,.08); border:1px solid rgba(74,222,128,.2); border-radius:8px; padding:5px 10px; color:#4ade80; font-weight:700;">GRATUITO</span>'}
                <span style="font-size:.78rem; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:5px 10px; color:rgba(255,255,255,.5);">👥 ${attendeeCount}${ev.capacity > 0 ? '/' + ev.capacity : ''}</span>
            </div>
            ${occupancy !== null ? `
            <div style="background:rgba(255,255,255,.04); border-radius:6px; height:4px; overflow:hidden;">
                <div style="height:100%; width:${Math.min(occupancy,100)}%; background:${occupancy>=90?'#f87171':occupancy>=70?'#F59E0B':'#4ade80'}; border-radius:6px; transition:width .5s;"></div>
            </div>` : ''}
            <div style="display:flex; gap:8px; margin-top:auto;">
                <button onclick="switchTab('crie-checkin'); setTimeout(()=>{const s=document.getElementById('checkin-event-select'); if(s){s.value='${ev.id}'; loadCheckinList();}},200)" 
                    style="flex:1; padding:9px; background:rgba(245,158,11,.1); border:1px solid rgba(245,158,11,.25); border-radius:10px; color:#F59E0B; font-size:.75rem; font-weight:700; cursor:pointer;">
                    ✓ Check-in
                </button>
                <button onclick="archiveCrieEvento('${ev.id}','${ev.status}')"
                    style="padding:9px 12px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); border-radius:10px; color:rgba(255,255,255,.5); font-size:.75rem; cursor:pointer;">
                    ${ev.status === 'ARCHIVED' ? '↩ Restaurar' : '📦 Arquivar'}
                </button>
            </div>
        </div>`;
    }).join('');
}

function openCreateEventoModal() {
    const modal = document.getElementById('modal-create-evento');
    if (modal) modal.style.display = 'flex';
}

async function saveCrieEvento(e) {
    e.preventDefault();
    const wsId = getCrieWorkspaceId();
    const form = e.target;
    const payload = {
        workspace_id: wsId,
        title: form.title.value,
        description: form.description.value || null,
        date: form.date.value,
        capacity: parseInt(form.capacity.value) || 0,
        location: form.location.value,
        price: parseFloat(form.price.value) || 0,
        currency: form.currency ? form.currency.value : 'R$',
        status: form.status.value,
    };
    const sb = window.supabaseClient;
    const { error } = await sb.from('crie_events').insert(payload);
    if (error) { alert('Erro: ' + error.message); return; }
    closeModal('modal-create-evento');
    form.reset();
    loadCrieEventos();
}

async function archiveCrieEvento(id, currentStatus) {
    const newStatus = currentStatus === 'ARCHIVED' ? 'DRAFT' : 'ARCHIVED';
    const sb = window.supabaseClient;
    await sb.from('crie_events').update({ status: newStatus }).eq('id', id);
    loadCrieEventos();
}

// ═══════════════════════════════════════════════════════════
// CRIE — CHECK-IN
// ═══════════════════════════════════════════════════════════
function populateCheckinEventos(eventos) {
    const sel = document.getElementById('checkin-event-select');
    if (!sel) return;
    const active = eventos.filter(e => e.status !== 'ARCHIVED');
    sel.innerHTML = '<option value="">Selecionar Evento…</option>' +
        active.map(e => `<option value="${e.id}">${e.title} — ${new Date(e.date).toLocaleDateString('pt-PT')}</option>`).join('');
}

function loadCrieCheckinEventos() {
    if (!crieEventos.length) {
        loadCrieEventos().then(() => populateCheckinEventos(crieEventos));
    } else {
        populateCheckinEventos(crieEventos);
    }
}

async function loadCheckinList() {
    const eventId = document.getElementById('checkin-event-select')?.value;
    if (!eventId) return;
    const sb = window.supabaseClient;
    const { data } = await sb
        .from('crie_attendees')
        .select('id, name, email, phone, presence_status, is_member')
        .eq('event_id', eventId)
        .order('name');
    crieCheckinData = data || [];
    filterCheckin();
    updateCheckinCounter();
}

function filterCheckin() {
    const q = document.getElementById('checkin-search')?.value.toLowerCase() || '';
    const filtered = !q ? crieCheckinData : crieCheckinData.filter(a =>
        a.name?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q) ||
        a.phone?.includes(q)
    );
    renderCheckinList(filtered);
}

function renderCheckinList(list) {
    const container = document.getElementById('checkin-list');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:rgba(255,255,255,.3);">Nenhum inscrito encontrado.</div>';
        return;
    }
    container.innerHTML = list.map(a => {
        const isPresente = a.presence_status === 'Presente';
        return `
        <div onclick="toggleCheckinPresence('${a.id}')" style="display:flex; align-items:center; gap:16px; background:${isPresente?'rgba(74,222,128,.07)':'rgba(255,255,255,.03)'}; border:1px solid ${isPresente?'rgba(74,222,128,.25)':'rgba(255,255,255,.07)'}; border-radius:16px; padding:16px 20px; cursor:pointer; transition:all .2s; user-select:none;">
            <div style="width:40px; height:40px; border-radius:50%; background:${isPresente?'rgba(74,222,128,.15)':'rgba(255,255,255,.06)'}; border:2px solid ${isPresente?'rgba(74,222,128,.5)':'rgba(255,255,255,.1)'}; display:flex; align-items:center; justify-content:center; font-size:1.1rem; transition:all .2s; flex-shrink:0;">
                ${isPresente ? '✓' : ''}
            </div>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
                    ${a.name}
                    ${a.is_member ? '<span style="color:#F59E0B; font-size:.7rem;">★</span>' : ''}
                </div>
                <div style="font-size:.75rem; color:rgba(255,255,255,.4);">${a.email} · ${a.phone}</div>
            </div>
            <div style="font-size:.8rem; font-weight:700; color:${isPresente?'#4ade80':'rgba(255,255,255,.25)'};">${isPresente?'PRESENTE':'TAP PARA CONFIRMAR'}</div>
        </div>`;
    }).join('');
}

async function toggleCheckinPresence(id) {
    const attendee = crieCheckinData.find(a => a.id === id);
    if (!attendee) return;
    const next = attendee.presence_status === 'Presente' ? 'Pendente' : 'Presente';
    const sb = window.supabaseClient;
    await sb.from('crie_attendees').update({ presence_status: next }).eq('id', id);
    attendee.presence_status = next;
    filterCheckin();
    updateCheckinCounter();
}

function updateCheckinCounter() {
    const count = crieCheckinData.filter(a => a.presence_status === 'Presente').length;
    const el = document.getElementById('checkin-counter');
    if (el) el.textContent = `${count} presente${count !== 1 ? 's' : ''}`;
}

// ═══════════════════════════════════════════════════════════
// CRIE — RELATÓRIOS
// ═══════════════════════════════════════════════════════════
async function loadCrieRelatorios() {
    const wsId = getCrieWorkspaceId();
    if (!wsId) return;
    const sb = window.supabaseClient;

    const [{ data: attendees }, { data: membros }, { data: eventos }, { data: financas }] = await Promise.all([
        sb.from('crie_attendees').select('id, payment_status, presence_status, event_id').eq('workspace_id', wsId),
        sb.from('crie_members').select('id, status').eq('workspace_id', wsId),
        sb.from('crie_events').select('id, title, date, status').eq('workspace_id', wsId).neq('status','ARCHIVED').order('date',{ascending:false}),
        sb.from('crie_finances').select('type, amount, event_id').eq('workspace_id', wsId),
    ]);

    const totalInscritos = attendees?.length || 0;
    const membrosAtivos = (membros||[]).filter(m => m.status === 'Ativo').length;
    const receita = (financas||[]).filter(f => f.type==='Receita').reduce((s,f) => s + Number(f.amount), 0);
    const despesas = (financas||[]).filter(f => f.type==='Despesa').reduce((s,f) => s + Number(f.amount), 0);

    document.getElementById('rel-total-inscritos').textContent = totalInscritos;
    document.getElementById('rel-membros-ativos').textContent = membrosAtivos;
    document.getElementById('rel-receita').textContent = `${receita.toFixed(2)}€`;
    document.getElementById('rel-despesas').textContent = `${despesas.toFixed(2)}€`;
    document.getElementById('rel-resultado').textContent = `${(receita-despesas).toFixed(2)}€`;
    document.getElementById('rel-eventos').textContent = (eventos||[]).length;

    // Build per-event table
    const tbody = document.getElementById('rel-eventos-body');
    if (tbody && eventos?.length) {
        tbody.innerHTML = eventos.map(ev => {
            const evAttendees = (attendees||[]).filter(a => a.event_id === ev.id);
            const presences = evAttendees.filter(a => a.presence_status === 'Presente').length;
            const pagos = evAttendees.filter(a => a.payment_status === 'Pago').length;
            const evReceita = (financas||[]).filter(f => f.event_id === ev.id && f.type==='Receita').reduce((s,f)=>s+Number(f.amount),0);
            const evDespesas = (financas||[]).filter(f => f.event_id === ev.id && f.type==='Despesa').reduce((s,f)=>s+Number(f.amount),0);
            const resultado = evReceita - evDespesas;
            return `<tr style="border-bottom:1px solid rgba(255,255,255,.05);">
                <td style="padding:12px 16px; font-weight:700; color:#fff;">${ev.title}</td>
                <td style="padding:12px 16px; font-size:.78rem; color:rgba(255,255,255,.5);">${new Date(ev.date).toLocaleDateString('pt-PT')}</td>
                <td style="padding:12px 16px; text-align:center; color:rgba(255,255,255,.7);">${evAttendees.length}</td>
                <td style="padding:12px 16px; text-align:center; color:#4ade80;">${presences}</td>
                <td style="padding:12px 16px; text-align:center; color:#F59E0B;">${pagos}</td>
                <td style="padding:12px 16px; color:#4ade80; font-weight:700;">${evReceita.toFixed(2)}€</td>
                <td style="padding:12px 16px; color:#f87171; font-weight:700;">${evDespesas.toFixed(2)}€</td>
                <td style="padding:12px 16px; font-weight:800; color:${resultado>=0?'#4ade80':'#f87171'};">${resultado.toFixed(2)}€</td>
            </tr>`;
        }).join('');
    }
}

// ── closeModal utility (if not already defined) ─────────────
if (!window.closeModal) {
    window.closeModal = function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    };
}
