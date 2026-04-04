/* hub-dashboard.js — Zelo Pro Dashboard Logic */
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
            // ── Safety: read role from JWT metadata first (no DB needed) ──
            const jwtRole = user.user_metadata?.role || user.app_metadata?.role || null;

            // Fetch full profile (name, phone, role, modules) from public.users
            (async () => {
                const { data: uRow, error: profileErr } = await window.supabaseClient
                    .from('users')
                    .select('name, phone, role, modules, id')
                    .eq('id', userId)
                    .maybeSingle();

                if (profileErr) console.warn('[profile] RLS or query error:', profileErr.message);

                // Resolve role: prefer DB row, fallback to JWT metadata
                const resolvedRole = uRow?.role || jwtRole || 'user';
                const name = uRow?.name || user.user_metadata?.name || user.user_metadata?.full_name || user.email || 'Usuário';
                const initial = name.substring(0, 1).toUpperCase();

                const avatarEl = document.getElementById('user-avatar-initials');
                if (avatarEl) avatarEl.textContent = initial;

                const nameEl = document.getElementById('user-display-name');
                if (nameEl) nameEl.textContent = name;

                const roleEl = document.getElementById('user-role-label');
                if (roleEl) {
                    const roleMap = { pastor_senior: 'Pastor Sênior', admin: 'Admin', pastor: 'Pastor', lider_ministerio: 'Líder de Ministério', user: 'Voluntário', master_admin: 'Master Admin', church_admin: 'Admin' };
                    roleEl.textContent = roleMap[resolvedRole] || resolvedRole || 'Líder';
                }

                // Store globally for re-use
                window.cachedProfile = { id: userId, name, phone: uRow?.phone || '', email: user.email, initial, role: resolvedRole, modules: uRow?.modules };
                window._profileCache = window.cachedProfile;

                // ── Apply module-based nav visibility ────────────────────
                // CRITICAL: ONLY restrict if we are 100% sure the user is NOT master_admin
                const freeRoles = ['pastor_senior', 'admin', 'master_admin', 'church_admin'];
                if (!freeRoles.includes(resolvedRole)) {
                    const userModules = uRow?.modules;
                    // Only restrict if modules array is explicitly set; otherwise show all
                    if (Array.isArray(userModules)) {
                        applyModuleAccess(userModules);
                    }
                }

                // ── Personalized Home Greeting ──────────────────────────
                const firstName = name.split(' ')[0];
                const greetingTitle = document.getElementById('home-greeting-title');
                if (greetingTitle) greetingTitle.textContent = `Bem-vindo, ${firstName}!`;

                // ── Daily Bible Verse ──────────────────────────────────
                loadDailyVerse();
            })();

        })();

        // ── Module Access Control — hide/show nav items ────────────────────
        function applyModuleAccess(modules) {
            if (!modules || !Array.isArray(modules)) return;
            const moduleNavMap = {
                mural:           ['nav-mural'],
                consolidados:    ['nav-dashboard'],
                visitantes:      ['nav-visitors'],
                start:           ['nav-start'],
                aniversariantes: ['nav-birthdays'],
                ia_chat:         ['nav-messages'],
                relatorios:      ['nav-relatorios'],
                logs:            ['nav-logs'],
                crie:            ['nav-crie-toggle'],
                configuracoes:   ['nav-settings-toggle'],
            };
            const subNavMap = {
                crie_inscritos:  'nav-crie-inscritos',
                crie_membros:    'nav-crie-membros',
                crie_eventos:    'nav-crie-eventos',
                crie_checkin:    'nav-crie-checkin',
                crie_relatorios: 'nav-crie-relatorios',
            };

            // Build effective module set: if any crie_* present, auto-include 'crie'
            const effectiveModules = [...modules];
            if (effectiveModules.some(m => m.startsWith('crie_')) && !effectiveModules.includes('crie')) {
                effectiveModules.push('crie');
            }

            // Hide top-level menus not in modules
            Object.entries(moduleNavMap).forEach(([mod, navIds]) => {
                if (!effectiveModules.includes(mod)) {
                    navIds.forEach(navId => {
                        const el = document.getElementById(navId);
                        if (el) el.style.display = 'none';
                    });
                }
            });

            // CRIE submenus: hide those not explicitly granted
            if (effectiveModules.includes('crie')) {
                const hasCrieSub = Object.keys(subNavMap).some(k => effectiveModules.includes(k));
                if (hasCrieSub) {
                    Object.entries(subNavMap).forEach(([subMod, navId]) => {
                        if (!effectiveModules.includes(subMod)) {
                            const el = document.getElementById(navId);
                            if (el) el.style.display = 'none';
                        }
                    });
                }
            }
        }
        window.applyModuleAccess = applyModuleAccess;


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
                    localStorage.setItem('currentWorkspaceId', initial.id);
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
            if (tabName === 'logs'  && window.loadAuditLogs) window.loadAuditLogs();
            if (tabName === 'users' && window.loadTeam)      window.loadTeam();
            if (tabName === 'home' && typeof generateQRCodes === 'function') setTimeout(generateQRCodes, 50);
            // Legacy regional/global — now handled by new patch; kept for safety
            if (tabName === 'regional' && window.loadRegionalView) window.loadRegionalView();
            if (tabName === 'global'   && window.loadGlobalView)   window.loadGlobalView();
        }

        // ─── Sidebar visibility based on user level ──────────────────────
        window.applyHierarchyNav = function(level) {
            const levels = { workspace: 0, regional: 1, global: 2, master: 3 };
            const rank = levels[level] || 0;
            // Regional: stats view + financial submenu
            const navRelRegional = document.getElementById('nav-relatorios-regional');
            if (navRelRegional) navRelRegional.style.display = (rank >= 1) ? '' : 'none';
            const navFinRegional = document.getElementById('nav-rel-financeiro-regional');
            if (navFinRegional) navFinRegional.style.display = (rank >= 1) ? '' : 'none';
            // Global: stats view + financial submenu
            const navRelGlobal = document.getElementById('nav-relatorios-global');
            if (navRelGlobal) navRelGlobal.style.display = (rank >= 2) ? '' : 'none';
            const navFinGlobal = document.getElementById('nav-rel-financeiro-global');
            if (navFinGlobal) navFinGlobal.style.display = (rank >= 2) ? '' : 'none';
            // Desenvolvedor — only master (rank>=3)
            const navDev = document.getElementById('nav-admin-logs');
            if (navDev) navDev.style.display = (rank >= 3) ? 'flex' : 'none';
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
                const statusLabels = { published: 'Resolvido', in_progress: 'Em Progresso', pending: 'Pendente' };
                return `
                    <div class="log-item" style="border-left: 3px solid ${cfg.color}; padding: 14px 18px; margin-bottom: 8px; border-radius: 0 10px 10px 0; background: rgba(255,255,255,0.03);">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
                            <span style="font-size:1.1rem;">${cfg.icon}</span>
                            <span style="color:${cfg.color};font-size:0.75rem;font-weight:600;border:1px solid ${cfg.color}40;padding:2px 8px;border-radius:6px;">${cfg.label}</span>
                            <span style="color:var(--text-main);font-weight:600;">${log.title || '(sem título)'}</span>
                            <span style="margin-left:auto;color:var(--text-dim);font-size:0.75rem;">${date} ${time}</span>
                            <span style="color:${statusColors[log.status]||'#8696a0'};font-size:0.75rem;border:1px solid ${statusColors[log.status]||'#8696a0'}40;padding:2px 8px;border-radius:6px;">${statusLabels[log.status]||log.status}</span>
                            ${log.status === 'pending' ? `<button onclick="window.resolveTicket('${log.id}')" style="background:#4CAF50; color:#fff; border:none; border-radius:6px; padding:4px 10px; font-size:0.75rem; font-weight:bold; cursor:pointer;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">✔ Resolver</button>` : ''}
                        </div>
                        ${log.description ? `<div style="color:var(--text-dim);font-size:0.85rem;line-height:1.5;">${log.description}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        window.resolveTicket = async function(ticketId) {
            const note = prompt("Deseja adicionar uma nota técnica para o usuário sobre como o problema foi resolvido? (Opcional)");
            if (note === null) return; // User cancelled
            
            try {
                if(typeof hubToast !== 'undefined') hubToast("Marcando como resolvido e notificando...", "info");
                
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (!session) throw new Error("Não autenticado");

                const response = await fetch('https://uyseheucqikgcorrygzc.supabase.co/functions/v1/resolve-ticket', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ ticketId, resolutionText: note })
                });

                if (!response.ok) throw new Error("Falha na API.");
                
                if(typeof hubToast !== 'undefined') hubToast("Ticket resolvido com sucesso!", "success");
                
                if (window.loadAuditLogs) window.loadAuditLogs();
            } catch(e) {
                console.error(e);
                if(typeof hubToast !== 'undefined') hubToast("Erro ao resolver: " + e.message, "error");
                else alert("Erro ao resolver");
            }
        };

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
                    indexAxis: 'y',
                    plugins: { 
                        legend: { display: false },
                        tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', titleFont: {family: 'Outfit'}, bodyFont: {family: 'Outfit'} }
                    },
                    scales: {
                        x: { display: false, grid: { display: false } },
                        y: { border: { display: false }, grid: { display: false }, ticks: { color: '#CCC', font: {family: 'Outfit', size: 10} } }
                    },
                    onClick: (evt, activeEls, chart) => {
                        if (activeEls.length > 0) {
                            const index = activeEls[0].index;
                            const labelClicked = chart.data.labels[index];
                            
                            // Auto trigger filters based on chart type!
                            const chartId = chart.canvas.id;
                            if (chartId === 'chartCulto' || chartId === 'vChartCulto') {
                                document.getElementById('filterCulto').value = String(labelClicked).toLowerCase();
                                if(window.applyFilters) applyFilters();
                            } else if (chartId === 'chartDecisao' || chartId === 'filterStatus') {
                                document.getElementById('filterStatus').value = String(labelClicked).toLowerCase();
                                if(window.applyFilters) applyFilters();
                            }
                        }
                    }
                };

                ['Idade', 'Pais', 'Batizado', 'GC', 'Culto'].forEach(type => {
                    const canvasEl = document.getElementById('vChart'+type);
                    if(canvasEl) {
                        chartInstances['v'+type] = new Chart(canvasEl.getContext('2d'), {
                            type: 'bar',
                            data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 4 }] },
                            options: commonOpts
                        });
                    }
                });

                ['Culto', 'Pais', 'Decisao', 'GC'].forEach(type => {
                    const canvasEl = document.getElementById('chart'+type);
                    if(canvasEl) {
                        const ctx = canvasEl.getContext('2d');
                        chartInstances[type] = new Chart(ctx, {
                            type: 'bar',
                            data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 4 }] },
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
                const cultoFreq = getFrequencies(visitorsArray.map(l => String(l.culto)));
                
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
                setChartData(chartInstances['vCulto'], cultoFreq);
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

                    const mock_decisions = ["Aceitei Jesus pela primeira vez", "Eu voltei para Jesus, reconciliação", "Quero ser membro"];
                    const mock_cultos = ["Domingo 1", "Domingo 2", "Domingo 3", "Hope", "Fé", "Legacy", "Rocket", "Shine", "Hero", "Outro"];
                    const mock_paises = ["BR", "US", "PT", "CA"];
                    const mock_gcs = ["Sim", "Quero participar", "Não"];

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
                    let setVCultos = new Set();

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
                            setVCultos.add(String(lead.culto));
                        }
                        return lead;
                    });
                    
                    globalConsolidados = window.globalConsolidados = globalLeads.filter(l => l.type !== 'visitor');
                    globalVisitors = window.globalVisitors = globalLeads.filter(l => l.type === 'visitor');

                    populateSelect('filterStatus', setDecisao, 'Todas as Decisões');
                    populateSelect('filterCulto', setCultos, 'Qualquer Culto');
                    populateSelect('vFilterCountry', setPaises, 'Todos os Países...');
                    populateSelect('vFilterCulto', setVCultos, 'Qualquer Culto');

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
                                else if (timeRangeDays === '90') matchTime = diffDays <= 90;
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
                    const vCultoObj = document.getElementById('vFilterCulto');
                    const vCulto = vCultoObj ? vCultoObj.value : 'all';
                    const vSortOrder = document.getElementById('vFilterDate') ? document.getElementById('vFilterDate').value : 'newest';
                    const vTimeRangeDays = document.getElementById('vFilterTimeRange').value;
                    
                    let vFiltered = globalVisitors.filter(lead => {
                        const nameStr = String(lead.name || '').toLowerCase();
                        const phoneStr = String(lead.phone || '').toLowerCase();
                        const matchName = nameStr.includes(vSearch) || phoneStr.includes(vSearch);
                        const matchC = (vCountry === 'all') || (String(lead.pais||'').toLowerCase() === vCountry);
                        const matchCu = (vCulto === 'all') || (String(lead.culto||'').toLowerCase() === vCulto);
                        
                        let matchTime = true;
                        if (vTimeRangeDays === '__top_custom__' && window._vTopCustomStart && window._vTopCustomEnd) {
                            const ld = new Date(lead.created_at);
                            const st = new Date(window._vTopCustomStart);
                            const en = new Date(window._vTopCustomEnd);
                            en.setHours(23,59,59,999);
                            if (ld < st || ld > en) matchTime = false;
                        } else if (vTimeRangeDays !== 'all') {
                            const leadDate = new Date(lead.created_at);
                            if (isNaN(leadDate.valueOf())) { matchTime = false; }
                            else {
                                const now = new Date();
                                const diffTime = now - leadDate;
                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                
                                if (vTimeRangeDays === '7') matchTime = diffDays <= 7;
                                else if (vTimeRangeDays === '30') matchTime = diffDays <= 30;
                                else if (vTimeRangeDays === '90') matchTime = diffDays <= 90;
                                else if (vTimeRangeDays === 'today') matchTime = diffDays <= 1;
                            }
                        }
                        return matchName && matchC && matchCu && matchTime;
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
                                <button onclick="deleteLead('${lead.id}')" class="icon-btn tooltip-container" aria-label="Excluir Definitivamente" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border:none; cursor:pointer;" title="Excluir Ficha">🗑️</button>
                            </div>
                        </div>
                        
                        ${crossTagHtml}

                        <div class="tags-area">
                            ${lead.type !== 'visitor' ? `<span class="tag decision">🔥 Decisão: ${cap(lead.decisao)}</span>` : ''}
                            ${lead.type !== 'visitor' ? `<span class="tag service">🏛 Culto: ${cap(lead.culto)}</span>` : ''}
                            <span class="tag baptism" style="background: rgba(255, 255, 255, 0.05); color: #FFF; border-color: rgba(255, 255, 255, 0.1);">🌍 País: ${cap(lead.pais)}</span>
                            ${lead.type !== 'visitor' ? `<span class="tag gc">👥 GC: ${cap(lead.gc_status)}</span>` : ''}
                            ${(() => {
                                const startTag = typeof window.getStartStatusTag === 'function' ? window.getStartStatusTag(lead) : '';
                                return startTag;
                            })()}
                            ${lead.batismo_at ? `<span style="background:rgba(167,139,250,.12);color:#A78BFA;border:1px solid rgba(167,139,250,.25);padding:2px 8px;border-radius:6px;font-size:0.68rem;font-weight:700;display:inline-block;white-space:nowrap;">🌊 Batizado em ${new Date(lead.batismo_at).toLocaleDateString('pt-PT')}</span>` : ''}
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

        let kpis = {};
        if (type === 'consolidados') {
            kpis = {
                "Celebração Aut. (IA)": document.getElementById('kpi-t1')?.innerText || "0",
                "Convidar p/ Start": document.getElementById('kpi-t2')?.innerText || "0",
                "Convidar p/ GC": document.getElementById('kpi-tgc')?.innerText || "0",
                "Convite de Batismo": document.getElementById('kpi-t3')?.innerText || "0"
            };
        } else {
            kpis = {
                "Welcome Message (IA)": document.getElementById('vkpi-t1')?.innerText || "0",
                "Convite para GC": document.getElementById('vkpi-t2')?.innerText || "0",
                "Follow-up Humano": document.getElementById('vkpi-t3')?.innerText || "0"
            };
        }

        try {
            const res = await fetch(`${API_BASE}/api/email/send-report`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    user_email: email, 
                    report_type: type, 
                    total_count: count, 
                    csv_link: "https://hub.lagoinha.com/download/relatorio.csv",
                    leads: formatados,
                    kpis: kpis
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

    // ====================================================================
    // UI HELPERS — Custom Modal & Toast (replaces window.confirm/alert)
    // ====================================================================

    function showConfirmModal(title, message, onConfirm) {
        let overlay = document.getElementById('_confirm-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = '_confirm-modal-overlay';
            overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = `
              <div style="background:#111;border:1px solid #333;border-radius:16px;padding:32px;max-width:460px;width:90%;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.7);">
                <h3 id="_cm-title" style="margin:0 0 12px;color:#FFD700;font-size:1.1rem;"></h3>
                <p id="_cm-message" style="margin:0 0 24px;font-size:0.9rem;line-height:1.6;color:#ccc;"></p>
                <div style="display:flex;gap:12px;justify-content:flex-end;">
                  <button id="_cm-cancel" style="background:#222;border:1px solid #444;color:#aaa;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:0.9rem;">Cancelar</button>
                  <button id="_cm-confirm" style="background:#FFD700;border:none;color:#000;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.9rem;">Confirmar</button>
                </div>
              </div>`;
            document.body.appendChild(overlay);
        }
        document.getElementById('_cm-title').textContent = title;
        document.getElementById('_cm-message').innerHTML = message;
        overlay.style.display = 'flex';
        const close = () => { overlay.style.display = 'none'; };
        document.getElementById('_cm-cancel').onclick = close;
        document.getElementById('_cm-confirm').onclick = () => { close(); onConfirm(); };
    }

    function showToast(message, type = 'success', duration = 4000) {
        const toast = document.createElement('div');
        const bg = type === 'error' ? '#ef4444' : '#22c55e';
        toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;background:${bg};color:#fff;padding:14px 20px;border-radius:10px;font-size:0.9rem;max-width:380px;line-height:1.5;box-shadow:0 4px 20px rgba(0,0,0,0.4);animation:slideIn 0.3s ease;`;
        toast.textContent = message;
        if (!document.getElementById('_toast-style')) {
            const s = document.createElement('style');
            s.id = '_toast-style';
            s.textContent = '@keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}';
            document.head.appendChild(s);
        }
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    // ====================================================================
    // USER / TEAM MANAGEMENT
    // ====================================================================

    const MANAGE_URL = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1/manage-users';

    async function callManageUsers(payload) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) throw new Error('Sessão expirada. Recarregue a página.');
        const res = await fetch(MANAGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data?.error) throw new Error(data.error);
        return data;
    }

    window.loadTeam = async function() {
        const table = document.getElementById('team-tbody');
        try {
            if (table) table.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">Carregando membros...</td></tr>';
            let wsId = window.currentWorkspaceId;
            if (!wsId) { const ws = await window.HubRouter?.getWorkspace(); wsId = ws?.id; }
            if (!wsId) throw new Error('Workspace não encontrado');

            const { data: users, error } = await window.supabaseClient
                .from('users')
                .select('id, name, email, role, phone, status, modules, temp_password, password_changed')
                .eq('workspace_id', wsId)
                .order('role');

            if (error) throw error;
            renderTeam(users || [], wsId);
        } catch (err) {
            console.error('[loadTeam] Erro:', err.message);
            if (table) table.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#f87171;">Erro: ${err.message}</td></tr>`;
        }
    };

    function renderTeam(users, workspaceId) {
        window.currentTeamData = users;
        const tbody = document.getElementById('team-tbody');
        if (!tbody) return;
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#888;">Nenhum membro encontrado.</td></tr>';
            return;
        }

        const roleMap = {
            'master_admin':     '<span style="background:rgba(255,215,0,.15);color:var(--accent);padding:4px 8px;border-radius:6px;font-weight:bold;font-size:11px;">Master Admin</span>',
            'pastor_senior':    '<span style="background:rgba(255,180,0,.15);color:#ffb400;padding:4px 8px;border-radius:6px;font-weight:bold;font-size:11px;">Pastor Sênior</span>',
            'admin':            '<span style="background:rgba(100,180,255,.15);color:#64b4ff;padding:4px 8px;border-radius:6px;font-weight:bold;font-size:11px;">Admin</span>',
            'church_admin':     '<span style="background:rgba(100,180,255,.15);color:#64b4ff;padding:4px 8px;border-radius:6px;font-weight:bold;font-size:11px;">Admin da Igreja</span>',
            'pastor':           '<span style="background:rgba(180,150,255,.15);color:#b496ff;padding:4px 8px;border-radius:6px;font-weight:bold;font-size:11px;">Pastor</span>',
            'lider_ministerio': '<span style="background:rgba(255,140,80,.15);color:#ff8c50;padding:4px 8px;border-radius:6px;font-weight:bold;font-size:11px;">Líder de Ministério</span>',
            'user':             '<span style="background:rgba(100,220,150,.15);color:#64dc96;padding:4px 8px;border-radius:6px;font-weight:bold;font-size:11px;">Voluntário</span>'
        };

        const RANK = { master_admin: 4, pastor_senior: 3, church_admin: 2, admin: 2, pastor: 1, lider_ministerio: 1, user: 0 };
        const myRank = RANK[window.cachedProfile?.role] ?? 0;
        let html = '';

        users.forEach(u => {
            const statusNorm = (u.status || 'ativo').toLowerCase();
            const statusColor = statusNorm === 'ativo' ? '#4ade80' : '#f87171';
            const uRank = RANK[u.role] ?? 0;

            // Password status cell
            let pwdCell = '';
            if (u.password_changed) {
                pwdCell = '<span title="Usuário trocou a senha" style="font-size:11px;color:#4ade80;">🔒 Senha própria</span>';
            } else if (u.temp_password) {
                const safe = u.temp_password.replace(/'/g, "\\'");
                pwdCell = `<span style="display:flex;align-items:center;gap:4px;">
                    <span id="pwd-${u.id}" style="font-family:monospace;font-size:11px;background:#222;padding:2px 6px;border-radius:4px;color:#FFD700;display:none;">${safe}</span>
                    <button onclick="document.getElementById('pwd-${u.id}').style.display=document.getElementById('pwd-${u.id}').style.display==='none'?'inline':'none'" 
                        style="background:none;border:none;color:#888;cursor:pointer;font-size:12px;" title="Ver senha temporária">
                        👁️
                    </button>
                    <span style="font-size:10px;color:#f59e0b;">Aguardando</span>
                </span>`;
            } else {
                pwdCell = '<span style="font-size:11px;color:#555;">-</span>';
            }

            let actions = '';
            if (myRank > uRank || (myRank === uRank && window.cachedProfile?.id !== u.id && myRank >= 2) || myRank === 3) {
                actions = `
                    <button onclick="window.editUserModal('${u.id}')" title="Editar" style="background:none;border:none;color:#aaa;cursor:pointer;margin-right:8px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    ${myRank >= 2 ? `<button onclick="window.resendInvite('${u.id}', '${u.email}')" title="Gerar nova senha" style="background:none;border:none;color:#aaa;cursor:pointer;margin-right:8px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 2v6h6"/></svg>
                    </button>` : ''}
                    <button onclick="window.deleteUser('${u.id}')" title="Excluir" style="background:none;border:none;color:#f87171;cursor:pointer;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>`;
            }

            html += `
                <tr style="border-bottom:1px solid rgba(255,255,255,.05);">
                    <td style="padding:14px 18px;">
                        <div style="font-weight:600;color:#fff;">${u.name || 'Sem nome'}</div>
                        <div style="font-size:0.75rem;color:#888;">${u.email}</div>
                    </td>
                    <td style="padding:14px 18px;color:#ccc;font-size:0.85rem;">${u.phone || '-'}</td>
                    <td style="padding:14px 18px;">${roleMap[u.role] || u.role}</td>
                    <td style="padding:14px 18px;color:${statusColor};font-weight:600;font-size:0.85rem;">${statusNorm === 'ativo' ? 'Ativo' : 'Inativo'}</td>
                    <td style="padding:14px 18px;">${pwdCell}</td>
                    <td style="padding:14px 18px;text-align:right;">${actions}</td>
                </tr>`;
        });
        tbody.innerHTML = html;
        const masterOpts = document.querySelectorAll('.master-only');
        masterOpts.forEach(el => el.style.display = (myRank >= 4) ? 'block' : 'none');
    }



    // ─── Module + Submenu definitions matching actual sidebar ──────────────
    const AVAILABLE_MODULES = [
        { key: 'consolidados',    label: 'Consolidados',    navIds: ['nav-dashboard'],
          svg: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
        { key: 'visitantes',      label: 'Visitantes',      navIds: ['nav-visitors'],
          svg: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>' },
        { key: 'start',           label: 'Start',           navIds: ['nav-start'],
          svg: '<polygon points="5 3 19 12 5 21 5 3"/>' },
        { key: 'aniversariantes', label: 'Aniversariantes', navIds: ['nav-birthdays'],
          svg: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
        { key: 'ia_chat',         label: 'IA Chat',         navIds: ['nav-messages'],
          svg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
        { key: 'relatorios',      label: 'Relatórios',      navIds: ['nav-relatorios'],
          svg: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
        { key: 'logs',            label: 'Logs',            navIds: ['nav-logs'],
          svg: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
        { key: 'crie',            label: 'CRIE',            navIds: ['nav-crie-toggle'],
          svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
          submodules: [
              { key: 'crie_inscritos',  label: 'Inscritos',  navId: 'nav-crie-inscritos' },
              { key: 'crie_membros',    label: 'Membros',    navId: 'nav-crie-membros' },
              { key: 'crie_eventos',    label: 'Eventos',    navId: 'nav-crie-eventos' },
              { key: 'crie_checkin',    label: 'Check-in',   navId: 'nav-crie-checkin' },
              { key: 'crie_relatorios', label: 'Relatórios', navId: 'nav-crie-relatorios' },
          ]
        },
        { key: 'configuracoes',   label: 'Configurações',   navIds: ['nav-settings-toggle'],
          svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
    ];

    // Role presets: what each role gets by default
    const ROLE_PRESETS = {
        pastor_senior:    { allModules: true,  hideSettings: false },
        admin:            { allModules: true,  hideSettings: false },
        pastor:           { allModules: false, hideSettings: true  },
        lider_ministerio: { allModules: false, hideSettings: true  },
        user:             { allModules: false, hideSettings: true  },
        // legacy compat
        master_admin:     { allModules: true,  hideSettings: false },
        church_admin:     { allModules: true,  hideSettings: false },
    };

    // Pill toggle click handler
    window.toggleModulePill = function(btn) {
        const nowActive = btn.getAttribute('data-active') !== '1';
        btn.setAttribute('data-active', nowActive ? '1' : '0');
        _stylePill(btn, nowActive);
    };

    function _stylePill(btn, active) {
        btn.style.border = `1.5px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,.12)'}`;
        btn.style.background = active ? 'rgba(255,215,0,.14)' : 'rgba(255,255,255,.03)';
        btn.style.color = active ? 'var(--accent)' : 'rgba(255,255,255,.55)';
        btn.style.boxShadow = active ? '0 0 0 1px rgba(255,215,0,.2)' : 'none';
        const badge = btn.querySelector('.mod-badge');
        if (active && !badge) {
            const span = document.createElement('span');
            span.className = 'mod-badge';
            span.style.cssText = 'margin-left:auto; font-size:.6rem; background:rgba(255,215,0,.2); color:var(--accent); padding:1px 6px; border-radius:6px; flex-shrink:0;';
            span.textContent = '✓';
            btn.appendChild(span);
        } else if (!active && badge) {
            badge.remove();
        }
    }

    // Renders module pill toggles (with CRIE submenu expansion)
    function renderModuleToggles(selectedModules) {
        const container = document.getElementById('modules-checkboxes');
        if (!container) return;
        const sel = selectedModules || [];

        // Set grid layout on container
        container.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:7px;';

        const items = AVAILABLE_MODULES.map(m => {
            const active = sel.includes(m.key);
            const hasSubActive = m.submodules && m.submodules.some(s => sel.includes(s.key));
            const parentActive = active || hasSubActive;
            const isCrie = !!m.submodules;

            let subHtml = '';
            if (isCrie) {
                subHtml = `<div class="mod-sub-wrap" id="sub-${m.key}" 
                    style="display:${parentActive ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;
                           padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);
                           border-radius:10px;margin-top:6px;box-sizing:border-box;width:100%;">
                    ${m.submodules.map(s => {
                        const sActive = sel.includes(s.key);
                        return `<button type="button" data-module="${s.key}" onclick="window.toggleModulePill(this)"
                            data-active="${sActive ? '1' : '0'}"
                            style="display:flex;align-items:center;gap:5px;padding:5px 10px;
                                   border-radius:8px;cursor:pointer;font-size:.72rem;font-weight:600;
                                   flex:1;min-width:80px;max-width:calc(33% - 5px);
                                   justify-content:center;
                                   border:1.5px solid ${sActive ? 'var(--accent)' : 'rgba(255,255,255,.1)'};
                                   background:${sActive ? 'rgba(255,215,0,.12)' : 'rgba(255,255,255,.02)'};
                                   color:${sActive ? 'var(--accent)' : 'rgba(255,255,255,.45)'};
                                   box-shadow:${sActive ? '0 0 0 1px rgba(255,215,0,.2)' : 'none'};">
                            ${s.label}${sActive ? ' ✓' : ''}
                        </button>`;
                    }).join('')}
                </div>`;
            }

            // CRIE spans both columns; its subpanel also spans both
            const spanStyle = isCrie ? 'grid-column:1/-1;' : '';

            return `<div style="${spanStyle}">
                <button type="button"
                    data-module="${m.key}"
                    data-has-sub="${isCrie ? '1' : '0'}"
                    data-active="${parentActive ? '1' : '0'}"
                    onclick="window.onModulePillClick(this)"
                    style="display:flex;align-items:center;gap:7px;padding:8px 12px;border-radius:11px;
                           cursor:pointer;font-size:.8rem;font-weight:600;width:100%;
                           border:1.5px solid ${parentActive ? 'var(--accent)' : 'rgba(255,255,255,.12)'};
                           background:${parentActive ? 'rgba(255,215,0,.14)' : 'rgba(255,255,255,.03)'};
                           color:${parentActive ? 'var(--accent)' : 'rgba(255,255,255,.55)'};
                           box-shadow:${parentActive ? '0 0 0 1px rgba(255,215,0,.2)' : 'none'};">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${m.svg}</svg>
                    <span style="flex:1;text-align:left;">${m.label}</span>
                    ${isCrie ? '<span style="font-size:.65rem;color:rgba(255,255,255,.3);">▼</span>' : ''}
                    ${parentActive ? '<span class="mod-badge" style="font-size:.58rem;background:rgba(255,215,0,.2);color:var(--accent);padding:1px 5px;border-radius:5px;flex-shrink:0;">✓</span>' : ''}
                </button>
                ${subHtml}
            </div>`;
        });
        container.innerHTML = items.join('');
    }

    window.onModulePillClick = function(btn) {
        const hasSub = btn.getAttribute('data-has-sub') === '1';
        const key    = btn.getAttribute('data-module');
        if (hasSub) {
            // Toggle submodule panel visibility
            const subWrap = document.getElementById('sub-' + key);
            if (subWrap) {
                const visible = subWrap.style.display !== 'none';
                subWrap.style.display = visible ? 'none' : 'flex';
            }
        } else {
            window.toggleModulePill(btn);
        }
    };

    // Role change → auto-preset modules
    window.onUserRoleChange = function(role) {
        const preset = ROLE_PRESETS[role] || ROLE_PRESETS['user'];
        if (preset.allModules) {
            const allKeys = [];
            AVAILABLE_MODULES.forEach(m => {
                allKeys.push(m.key);
                if (m.submodules) m.submodules.forEach(s => allKeys.push(s.key));
            });
            renderModuleToggles(allKeys);
        } else if (preset.hideSettings) {
            // keep current selection but ensure configuracoes is deselected
            const cur = _getCurrentModules();
            renderModuleToggles(cur.filter(k => k !== 'configuracoes'));
        }
    };

    function _getCurrentModules() {
        const mods = [...document.querySelectorAll('#modules-checkboxes button[data-module]')]
            .filter(b => b.getAttribute('data-active') === '1')
            .map(b => b.getAttribute('data-module'));
        // Auto-include 'crie' parent if any crie_* submodule is selected
        const hasCrieSub = mods.some(m => m.startsWith('crie_'));
        if (hasCrieSub && !mods.includes('crie')) mods.unshift('crie');
        return mods;
    }

    window.openUserModal = function() {

        document.getElementById('user-id-hidden').value = '';
        document.getElementById('user-name').value = '';
        document.getElementById('user-email').value = '';
        document.getElementById('user-phone').value = '';
        document.getElementById('user-role').value = 'user';
        document.getElementById('user-status').value = 'Ativo';
        
        const errBox = document.getElementById('user-modal-error'); if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }
        document.getElementById('user-modal-title').textContent = 'Adicionar Novo Membro';
        document.getElementById('user-modal-subtitle').style.display = 'block';
        document.getElementById('user-status-group').style.display = 'none';

        // Default modules for new user
        renderModuleToggles(['consolidados', 'visitantes']);
        
        document.getElementById('user-modal-overlay').style.display = 'flex';
    };

    window.editUserModal = function(id) {
        const u = window.currentTeamData.find(x => x.id === id);
        if (!u) return;
        document.getElementById('user-modal-title').textContent = 'Editar Membro';
        document.getElementById('user-modal-subtitle').style.display = 'none';
        
        document.getElementById('user-id-hidden').value = u.id;
        document.getElementById('user-name').value = u.name || '';
        document.getElementById('user-email').value = u.email;
        document.getElementById('user-phone').value = u.phone || '';
        document.getElementById('user-role').value = u.role;
        document.getElementById('user-status').value = u.status || 'Ativo';
        
        document.getElementById('user-status-group').style.display = 'block';

        // Render modules with the user's existing selection
        renderModuleToggles(u.modules || []);
        
        document.getElementById('user-modal-overlay').style.display = 'flex';
    };

    window.onUserRoleChange = function(role) {
        // If master_admin, auto-select all modules
        if (role === 'master_admin') {
            renderModuleToggles(AVAILABLE_MODULES.map(m => m.key));
        }
    };

    window.closeUserModal = function() {
        document.getElementById('user-modal-overlay').style.display = 'none';
    };

    window.saveUserSubmit = async function() {
        const id = document.getElementById('user-id-hidden').value;
        const name = document.getElementById('user-name').value.trim();
        const email = document.getElementById('user-email').value.trim();
        const phone = document.getElementById('user-phone').value.trim();
        const role = document.getElementById('user-role').value;
        const status = document.getElementById('user-status').value;
        
        // Collect selected modules from pill toggles (top-level + sub)
        const modules = [...document.querySelectorAll('#modules-checkboxes button[data-module]')]
            .filter(btn => btn.getAttribute('data-active') === '1')
            .map(btn => btn.getAttribute('data-module'));
        
        // telefone não obrigatório
        if (!name || !email) return alert('Por favor, preencha Nome e E-mail.');
        
        // Workspace resolution: prefer currentWorkspaceId, fallback to HubRouter
        let wsId = window.currentWorkspaceId;
        if (!wsId) {
            const ws = await window.HubRouter?.getWorkspace();
            wsId = ws?.id;
        }
        if (!wsId) return alert('Workspace não carregado. Tente recarregar a página.');

        const btn = document.getElementById('save-user-btn');
        const oldText = btn.textContent;
        btn.innerHTML = '⏳ Salvando...';
        btn.disabled = true;

        try {
            const fnData = await callManageUsers({
                action: id ? 'update' : 'create',
                id: id || undefined,
                email, name, phone: phone || null, role, status, modules,
                workspace_id: wsId
            });

            window.closeUserModal();
            window.loadTeam();

            // If creating a new user, show credentials popup
            if (!id && fnData.tempPassword) {
                showConfirmModal(
                    '✅ Membro adicionado!',
                    `<div style="text-align:left;">
                        <p style="margin:0 0 12px;color:#ccc;">Guarde estas credenciais e envie ao membro:</p>
                        <div style="background:#111;border:1px solid #333;border-radius:8px;padding:14px;font-family:monospace;font-size:14px;line-height:2;">
                            <div>📧 <b>Email:</b> ${email}</div>
                            <div>🔑 <b>Senha:</b> <span style="color:#FFD700;font-size:16px;">${fnData.tempPassword}</span></div>
                        </div>
                        <p style="margin:12px 0 0;font-size:11px;color:#888;">A senha estará visível na lista até o membro fazer login e alterá-la.</p>
                    </div>`,
                    () => {}
                );
                // Change Confirmar button to just "OK" for this case
                setTimeout(() => {
                    const cancelBtn = document.getElementById('_cm-cancel');
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    const confirmBtn = document.getElementById('_cm-confirm');
                    if (confirmBtn) confirmBtn.textContent = 'OK, entendido!';
                }, 50);
            }
        } catch (e) {
            const errBox = document.getElementById('user-modal-error');
            if (errBox) {
                errBox.textContent = '⚠️ ' + e.message;
                errBox.style.display = 'block';
            } else {
                showToast('Erro: ' + e.message, 'error');
            }
        } finally {
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    };

    window.deleteUser = async function(id) {
        showConfirmModal(
            '⚠️ Excluir Membro',
            'Deseja realmente excluir este membro? O acesso dele será bloqueado imediatamente. Esta ação não tem retorno.',
            async () => {
                try {
                    await callManageUsers({ action: 'delete', id });
                    window.loadTeam();
                    showToast('Membro excluído com sucesso.', 'success');
                } catch (e) {
                    showToast('Erro ao excluir: ' + e.message, 'error');
                }
            }
        );
    };

    window.resendInvite = async function(id, email) {
        showConfirmModal(
            '🔑 Gerar Nova Senha',
            `Deseja gerar uma nova senha temporária para <strong>${email}</strong>?<br><br>A senha atual será invalidada e o membro receberá um email com as novas credenciais.`,
            async () => {
                try {
                    const fnData = await callManageUsers({ action: 'resend_invite', id, email });
                    window.loadTeam();
                    showConfirmModal(
                        '✅ Nova senha gerada!',
                        `<div style="background:#111;border:1px solid #333;border-radius:8px;padding:14px;font-family:monospace;font-size:14px;line-height:2;">
                            <div>📧 <b>Email:</b> ${email}</div>
                            <div>🔑 <b>Nova Senha:</b> <span style="color:#FFD700;font-size:16px;">${fnData.tempPassword}</span></div>
                        </div>`,
                        () => {}
                    );
                    setTimeout(() => {
                        const cancelBtn = document.getElementById('_cm-cancel');
                        if (cancelBtn) cancelBtn.style.display = 'none';
                        const confirmBtn = document.getElementById('_cm-confirm');
                        if (confirmBtn) confirmBtn.textContent = 'OK';
                    }, 50);
                } catch (e) {
                    showToast('Erro: ' + e.message, 'error');
                }
            }
        );
    };



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
            scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
            return_scopes: true
        });
    }

    async function fetchAndSaveWAAccounts(shortToken) {
        setWASignupStatus('info', '🔍 Buscando contas WhatsApp Business...');
        try {
            // 1. Exchange for long-lived token
            const { data: exchangeData, error: exchangeError } = await window.supabaseClient.functions.invoke('whatsapp-auth', {
                body: { action: 'exchange', short_lived_token: shortToken }
            });
            if (exchangeError) throw new Error(exchangeError.message);
            const longToken = exchangeData.long_lived_token || shortToken; // fallback to short if exchange fails

            // 2. Fetch WABA accounts
            const { data: accountsData, error: accountsError } = await window.supabaseClient.functions.invoke('whatsapp-auth', {
                body: { action: 'fetch-accounts', short_lived_token: longToken }
            });
            if (accountsError) throw new Error(accountsError.message);

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
            // Fetch latest creds first since we don't have _currentWorkspace object
            const { data: wsData } = await window.supabaseClient.from('workspaces').select('credentials').eq('id', window.currentWorkspaceId).single();
            let currentCreds = wsData?.credentials || {};
            const payload = {
                ...currentCreds,
                whatsapp_token: token, 
                phone_id: account.phone_id, 
                business_id: account.waba_id, 
                phone_display: account.phone_display || account.phone_id
            };
            const { error: saveError } = await window.supabaseClient.from('workspaces').update({
                credentials: payload
            }).eq('id', window.currentWorkspaceId);
            
            const saveData = saveError ? { error: saveError.message } : { status: 'saved' };
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

    window.toggleWaAi = async function(isActive) {
        if (!window.supabaseClient || !window.currentWorkspaceId) return;
        
        try {
            const { data: wsData } = await window.supabaseClient.from('workspaces').select('credentials').eq('id', window.currentWorkspaceId).single();
            let creds = wsData?.credentials || {};
            creds.ia_active = isActive;

            await window.supabaseClient.from('workspaces').update({ credentials: creds }).eq('id', window.currentWorkspaceId);
            const statusEl = document.getElementById('ia-active-status');
            if (statusEl) statusEl.innerText = isActive ? 'IA Ativa' : 'IA Pausada';
        } catch(e) {
            console.error('Failed to toggle IA:', e);
            alert('Não foi possível alterar o status da IA.');
        }
    };

    window.disconnectWhatsapp = async function() {
        if (!window.supabaseClient || !window.currentWorkspaceId) return;
        if (!confirm('Tem certeza que deseja desconectar a conta do WhatsApp? Mila parará imediatamente de responder às mensagens.')) return;

        const { data: wsData } = await window.supabaseClient.from('workspaces').select('credentials').eq('id', window.currentWorkspaceId).single();
        let creds = wsData?.credentials || {};
        // clear WA fields
        delete creds.whatsapp_token;
        delete creds.phone_id;
        delete creds.business_id;
        delete creds.phone_display;

        window.supabaseClient.from('workspaces').update({ credentials: creds }).eq('id', window._currentWorkspace.id).then(() => {
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
            let creds = window._currentWorkspace?.credentials || {};
            const { error } = await window.supabaseClient.from('workspaces').update({
                credentials: {...creds, whatsapp_token: token, phone_id: id, business_id: b_id, app_secret: secret}
            }).eq('id', window._currentWorkspace.id);
            
            if (error) throw error;
            alert('✅ Credenciais Salvas!');
            checkWAStatus();
        } catch(e) {
            alert('❌ Erro: ' + e.message);
        }
    }

    async function checkWAStatus() {
        if (!window.supabaseClient || !window._currentWorkspace?.id) return;
        window.hasWhatsappConfig = false;
        
        const { data, error } = await window.supabaseClient.from('workspaces').select('credentials').eq('id', window._currentWorkspace.id).single();
        if (data && data.credentials && data.credentials.whatsapp_token) {
            window.hasWhatsappConfig = true;
            const phoneDisplay = data.credentials.phone_display || data.credentials.phone_id || 'Número conectado';
            document.getElementById('wa-status-text').innerText = `Conectado — ${phoneDisplay}`;
            document.getElementById('wa-status-text').style.color = '#25D366';
            document.getElementById('wa-status-dot').style.background = '#25D366';
            document.getElementById('wa-status-dot').style.boxShadow = '0 0 8px rgba(37,211,102,0.6)';

            const iaActive = data.credentials.ia_active !== false;
            const toggleWrap = document.getElementById('wa-power-toggle');
            if (toggleWrap) toggleWrap.checked = iaActive;
            const statusEl = document.getElementById('ia-active-status');
            if (statusEl) statusEl.innerText = iaActive ? 'IA Ativa' : 'IA Pausada';

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

    // ─── DESKTOP SIDEBAR COLLAPSE ─────────────────────────────────────
    window.toggleMainSidebar = function() {
        const sidebar = document.getElementById('main-sidebar');
        const btn = document.getElementById('sidebar-collapse-btn');
        const isCollapsed = sidebar.classList.toggle('sidebar-collapsed');
        document.body.classList.toggle('sidebar-collapsed', isCollapsed);

        // Rotate arrow icon
        const svg = btn?.querySelector('path');
        if (svg) {
            svg.setAttribute('d', isCollapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6');
        }

        // Persist preference
        try { localStorage.setItem('sidebarCollapsed', isCollapsed ? '1' : '0'); } catch(e) {}
    };

    // Restore sidebar collapse preference on load
    (function restoreSidebarState() {
        try {
            if (localStorage.getItem('sidebarCollapsed') === '1') {
                const sidebar = document.getElementById('main-sidebar');
                const btn = document.getElementById('sidebar-collapse-btn');
                sidebar?.classList.add('sidebar-collapsed');
                document.body.classList.add('sidebar-collapsed');
                const svg = btn?.querySelector('path');
                if (svg) svg.setAttribute('d', 'M9 18l6-6-6-6');
            }
        } catch(e) {}
    })();



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
        let tabsId = 'period-tabs-dashboard';
        if (view === 'visitors') tabsId = 'period-tabs-visitors';
        else if (view === 'jornada') tabsId = 'period-tabs-jornada';
        
        const tabs = document.querySelectorAll('#' + tabsId + ' .hub-period-tab');
        tabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        
        let topCustomId = 'top-custom-date';
        if (view === 'visitors') topCustomId = 'top-custom-date-v';
        else if (view === 'jornada') topCustomId = 'top-custom-date-j';
        
        const topCustom = document.getElementById(topCustomId);
        if (topCustom) topCustom.style.display = 'none';
        
        let frElId = 'filterTimeRange';
        if (view === 'visitors') frElId = 'vFilterTimeRange';
        else if (view === 'jornada') frElId = 'jFilterTimeRange';
        
        const frEl = document.getElementById(frElId);
        if (frEl) {
            if (days === 0) frEl.value = 'all';
            else if (days === 7) frEl.value = '7';
            else if (days === 30) frEl.value = '30';
            else if (days === 90) frEl.value = '90';
        }
        
        if (view === 'dashboard') {
            window._periodCutoff = null;
            if (window.applyFilters) window.applyFilters();
        } else if (view === 'visitors') {
            window._vPeriodCutoff = null;
            if (window.applyFilters) window.applyFilters();
        } else if (view === 'jornada') {
            window._jFilterDays = days;
            if (window.loadJornadaModule) window.loadJornadaModule();
        }
    };

    window.toggleTopCustomDate = function(btn) {
        const topCustom = document.getElementById('top-custom-date');
        if (!topCustom) return;
        const isVisible = topCustom.style.display === 'flex';
        topCustom.style.display = isVisible ? 'none' : 'flex';
        const tabs = document.querySelectorAll('#period-tabs-dashboard .hub-period-tab');
        tabs.forEach(t => t.classList.remove('active'));
        if (!isVisible) btn.classList.add('active');
    };

    window.toggleTopCustomDateV = function(btn) {
        const topCustom = document.getElementById('top-custom-date-v');
        if (!topCustom) return;
        const isVisible = topCustom.style.display === 'flex';
        topCustom.style.display = isVisible ? 'none' : 'flex';
        const tabs = document.querySelectorAll('#period-tabs-visitors .hub-period-tab');
        tabs.forEach(t => t.classList.remove('active'));
        if (!isVisible) btn.classList.add('active');
    };

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

    window.applyTopCustomDateV = function() {
        const startEl = document.getElementById('vTopDateStart');
        const endEl = document.getElementById('vTopDateEnd');
        if (!startEl || !endEl || !startEl.value) return;
        window._vTopCustomStart = startEl.value;
        window._vTopCustomEnd = endEl.value || new Date().toISOString().split('T')[0];
        const frEl = document.getElementById('vFilterTimeRange');
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

async function loadNotificationSettings() {
    if (!window.currentWorkspaceId) return;
    try {
        const sb = window.supabaseClient;
        const { data, error } = await sb
            .from('workspaces')
            .select('credentials')
            .eq('id', window.currentWorkspaceId)
            .single();
        if (error) throw error;
        const notif = data.credentials?.notifications || {};
        
        const emailPastor = document.getElementById('notif-email-pastor');
        if (emailPastor) {
            emailPastor.checked = notif.email_pastor !== false; // default true
        }
    } catch(e) { console.error('loadNotificationSettings:', e); }
}

async function saveNotificationSettings() {
    if (!window.currentWorkspaceId) return;
    const emailPastor = document.getElementById('notif-email-pastor')?.checked;
    
    try {
        const sb = window.supabaseClient;
        const { data: ws } = await sb.from('workspaces').select('credentials').eq('id', window.currentWorkspaceId).single();
        const creds = { ...(ws?.credentials || {}) };
        
        creds.notifications = {
            ...creds.notifications,
            email_pastor: emailPastor
        };
        
        const { error } = await sb.from('workspaces').update({
            credentials: creds
        }).eq('id', window.currentWorkspaceId);
        
        if (error) throw error;
        window.showToast && showToast('Preferências de notificação salvas!', 'success');
    } catch(e) { console.error('saveNotificationSettings:', e); window.showToast && showToast('Erro ao salvar notificações', 'error'); }
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
        ['dev', 'start', 'jornada', 'batismo', 'membros'].forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) el.style.display = (tab === v) ? '' : 'none';
        });
        // Delegate the rest to original
        if (_origSwitchTab) _origSwitchTab(tab);
        // Load data on tab activation
        if (tab === 'dev')   loadDevView();
        if (tab === 'start') {
            if (typeof loadStartModule === 'function') loadStartModule();
        }
        if (tab === 'jornada') {
            if (typeof loadJornadaModule === 'function') loadJornadaModule();
        }
        if (tab === 'batismo') {
            if (typeof loadBatismoModule === 'function') loadBatismoModule();
        }
        if (tab === 'membros') {
            if (typeof loadMembrosModule === 'function') loadMembrosModule();
        }
        if (tab === 'settings') {
            loadWorkspaceSettings();
            loadNotificationSettings();
        }
    };
})();

// ── Init: show nav-dev for master_admin ─────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Hide new views by default
    ['view-dev'].forEach(id => {
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
// JORNADA MODULE
// ═══════════════════════════════════════════════════════════
window.loadJornadaModule = async function() {
    if (!window.supabaseClient || !window.currentWorkspaceId) return;
    const wsId = window.currentWorkspaceId;
    const sb = window.supabaseClient;

    try {
        let dateLimit = null;
        const days = typeof window._jFilterDays !== 'undefined' ? window._jFilterDays : 7;
        if (days > 0) {
            dateLimit = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
        }

        // 1. Visitantes
        let queryVisitantes = sb.from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', wsId)
            .eq('type', 'visitor');
        if (dateLimit) queryVisitantes = queryVisitantes.gte('created_at', dateLimit);
        const { count: visitantesCount } = await queryVisitantes;
            
        document.getElementById('jornada-kpi-visitantes').innerText = visitantesCount || '0';

        // 2. Consolidação
        let queryConsolidados = sb.from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', wsId)
            .eq('type', 'saved');
        if (dateLimit) queryConsolidados = queryConsolidados.gte('created_at', dateLimit);
        const { count: consolidadosCount } = await queryConsolidados;
            
        document.getElementById('jornada-kpi-consolidacao').innerText = consolidadosCount || '0';

        // 3. Start Participantes
        let queryStart = sb.from('start_participants')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', wsId);
        if (dateLimit) queryStart = queryStart.gte('created_at', dateLimit);
        const { count: startCount } = await queryStart;
            
        document.getElementById('jornada-kpi-start').innerText = startCount || '0';

        // 4. Batismo — count from baptism_registrations
        let queryBatismo = sb.from('baptism_registrations')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', wsId);
        if (dateLimit) queryBatismo = queryBatismo.gte('created_at', dateLimit);
        const { count: batismoCount } = await queryBatismo;

        document.getElementById('jornada-kpi-batismo').innerText = batismoCount || '0';

    } catch (e) {
        console.error("Erro ao carregar KPIs da Jornada", e);
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
    const eventMap = new Map();
    crieInscritos.forEach(a => {
        if (a.crie_events?.title) {
            eventMap.set(a.crie_events.title, a.crie_events.date);
        }
    });

    const sel = document.getElementById('crie-filter-event');
    if (sel) {
        const eventsSorted = Array.from(eventMap.entries()).sort((a,b) => {
            const d1 = a[1] ? new Date(a[1]) : new Date(0);
            const d2 = b[1] ? new Date(b[1]) : new Date(0);
            return d2 - d1;
        });

        sel.innerHTML = '<option value="all">Todos os Eventos</option>' +
            eventsSorted.map(([title, dateStr]) => {
                const parts = dateStr ? dateStr.split('T')[0].split('-') : [];
                const dForm = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : '';
                return `<option value="${title}">${title}${dForm ? ' — ' + dForm : ''}</option>`;
            }).join('');
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
                    ${a.is_member ? '<span title="Membro CRIE" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:linear-gradient(135deg,rgba(245,158,11,.25),rgba(255,215,0,.15));border:1px solid rgba(245,158,11,.4);border-radius:50%;color:#F59E0B;font-size:.65rem;flex-shrink:0;box-shadow:0 0 6px rgba(245,158,11,.2);">★</span>' : ''}
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
  <p style="text-align:center;color:#4a4a6a;font-size:12px;margin-top:24px;">Gerado pelo Zelo Pro · ${dateStr}</p>
</div>
</body></html>`;
}

// ── Email report via Resend (Edge Function send-email) ──────
async function emailCrieReport() {
    // 1. Respeitar filtros activos
    const eventFilter = document.getElementById('crie-filter-event')?.value || 'all';
    const payFilter   = document.getElementById('crie-filter-payment')?.value || 'all';
    const typeFilter  = document.getElementById('crie-filter-type')?.value || 'all';
    const search      = document.getElementById('crie-search')?.value.toLowerCase() || '';

    let listToExport;
    if (eventFilter === 'all') {
        listToExport = _getUniquePersons(crieInscritos);
    } else {
        listToExport = crieInscritos.filter(a => {
            const matchEvent  = a.crie_events?.title === eventFilter;
            const matchPay    = payFilter === 'all' || a.payment_status === payFilter;
            const matchType   = typeFilter === 'all' ||
                (typeFilter === 'member' && a.is_member) ||
                (typeFilter === 'guest' && !a.is_member);
            const matchSearch = !search ||
                a.name?.toLowerCase().includes(search) ||
                a.email?.toLowerCase().includes(search) ||
                a.phone?.includes(search);
            return matchEvent && matchPay && matchType && matchSearch;
        });
    }

    const sorted     = [...listToExport].sort((a,b) => (a.name||'').localeCompare(b.name||'','pt'));
    const wsName     = document.getElementById('sidebar-workspace-name')?.textContent || 'CRIE';
    const eventLabel = eventFilter !== 'all' ? eventFilter : 'Todos os Eventos';
    const dateStr    = new Date().toLocaleDateString('pt-PT', {day:'2-digit',month:'long',year:'numeric'});

    if (sorted.length === 0) {
        if (typeof hubToast !== 'undefined') hubToast('Nenhum inscrito para enviar.', 'info');
        return;
    }

    if (typeof hubToast !== 'undefined') hubToast('Preparando email... ✉️', 'info');

    try {
        const sb = window.supabaseClient;
        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw new Error('Sessão expirada. Faça login novamente.');

        const res = await fetch('https://uyseheucqikgcorrygzc.supabase.co/functions/v1/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                wsName,
                eventLabel,
                dateStr,
                attendees: sorted.map(a => ({
                    name:            a.name,
                    email:           a.email,
                    phone:           a.phone,
                    is_member:       a.is_member,
                    presence_status: a.presence_status,
                    payment_status:  a.payment_status,
                    crie_events:     a.crie_events,
                }))
            })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (typeof hubToast !== 'undefined') hubToast(`✅ Email enviado com ${sorted.length} inscrito(s)!`, 'success');
    } catch(e) {
        console.error('[emailCrieReport]', e);
        if (typeof hubToast !== 'undefined') hubToast('Erro ao enviar email: ' + e.message, 'error');
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

/**
 * Converts a datetime-local string (interpreted as Europe/Lisbon local time)
 * to a UTC ISO string. Accounts for DST.
 */
function localLisbonToUTC(datetimeLocalValue) {
    if (!datetimeLocalValue) return null;
    // datetimeLocalValue is like '2026-03-30T19:30'
    // We need to find the UTC equivalent for that instant in Lisbon
    const naive = new Date(datetimeLocalValue); // JS interprets as LOCAL browser time
    // Get Lisbon offset at that moment using Intl
    const lisbonTz = 'Europe/Lisbon';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: lisbonTz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(naive);
    const get = type => parts.find(p => p.type === type)?.value;
    const lisbonDate = new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`);
    const diffMs = naive - lisbonDate; // difference between UTC-naive and Lisbon-naive
    const utcDate = new Date(naive.getTime() + diffMs);
    return utcDate.toISOString();
}

async function loadCrieEventos() {
    let wsId = getCrieWorkspaceId();
    // Retry up to 6×500ms if workspace not yet resolved
    if (!wsId) {
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 500));
            wsId = getCrieWorkspaceId();
            if (wsId) break;
        }
    }
    if (!wsId) { console.warn('loadCrieEventos: workspace still null after retries'); return; }
    const sb = window.supabaseClient;
    let data = [];
    try {
        const res = await sb.from('crie_events').select('*, crie_attendees(count)').eq('workspace_id', wsId).order('date', { ascending: false });
        if (res.error) throw res.error;
        data = res.data || [];
    } catch(e) {
        console.error('loadCrieEventos:', e);
    }
    crieEventos = data || [];

    // Auto-expire: move ACTIVE/LIVE events to CONCLUIDO if date has passed
    const now = new Date();
    const expired = crieEventos.filter(ev =>
        (ev.status === 'ACTIVE' || ev.status === 'LIVE') &&
        ev.date && new Date(ev.date) < now
    );
    if (expired.length) {
        const ids = expired.map(e => e.id);
        await sb.from('crie_events').update({ status: 'CONCLUIDO' }).in('id', ids);
        // Update local array too
        crieEventos.forEach(ev => { if (ids.includes(ev.id)) ev.status = 'CONCLUIDO'; });
    }

    renderCrieEventos(crieEventos);
    populateCheckinEventos(crieEventos);
}


function _getPublicCrieUrl() {
    // Derive workspace slug from current URL path (/braga/dashboard.html → braga)
    if (window.location.protocol === 'file:') return window.location.origin + '/crie-inscricao.html';
    const parts = window.location.pathname.split('/').filter(Boolean);
    const slug = (parts.length >= 2 && !parts[0].endsWith('.html')) ? parts[0] : null;
    const base = window.location.origin;
    return slug ? `${base}/${slug}/crie-inscricao.html` : `${base}/crie-inscricao.html`;
}


// filterEventos kept as no-op for backwards compatibility (groups replace filters now)
function filterEventos() {}

let _finalizadosCollapsed = false;
function toggleFinalizadosGroup() {
    const grid = document.getElementById('crie-grupo-finalizados');
    const chev = document.getElementById('finalizados-chevron');
    if (!grid) return;
    _finalizadosCollapsed = !_finalizadosCollapsed;
    grid.style.display = _finalizadosCollapsed ? 'none' : 'grid';
    if (chev) chev.style.transform = _finalizadosCollapsed ? 'rotate(-90deg)' : '';
}

function renderCrieEventos(list) {
    // Use all crieEventos if called without param
    const eventos = list || crieEventos;

    const statusMap = {
        ACTIVE:    { label: 'ATIVO',      color: '#4ade80', bg: 'rgba(74,222,128,.12)'  },
        LIVE:      { label: 'AO VIVO',    color: '#f87171', bg: 'rgba(248,113,113,.15)' },
        DRAFT:     { label: 'RASCUNHO',   color: '#F59E0B', bg: 'rgba(245,158,11,.12)'  },
        CONCLUIDO: { label: 'CONCLUIDO',  color: 'rgba(255,255,255,.4)', bg: 'rgba(255,255,255,.06)' },
        ARCHIVED:  { label: 'ARQUIVADO',  color: 'rgba(255,255,255,.3)', bg: 'rgba(255,255,255,.05)' },
    };

    const publicUrl = _getPublicCrieUrl();
    const currency  = ev => ev.currency || '€';

    function renderCard(ev) {
        const st = statusMap[ev.status] || statusMap.DRAFT;
        const attendeeCount = ev.crie_attendees?.[0]?.count || 0;
        const occupancy = ev.capacity > 0 ? Math.round((attendeeCount / ev.capacity) * 100) : null;
        const dateStr = ev.date ? new Date(ev.date).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Lisbon' }) : '—';
        const isPublic = ev.status === 'ACTIVE' || ev.status === 'LIVE';
        const isFinalizado = ev.status === 'CONCLUIDO' || ev.locked;
        const hasReport = !!ev.report_sent_at;

        // Border style for finalizados
        let cardBorderStyle = '';
        if (isFinalizado) {
            cardBorderStyle = hasReport
                ? 'border:2px solid rgba(74,222,128,.5);'
                : 'border:2.5px solid rgba(248,113,113,.55);';
        }

        return `
        <div onclick="openEventoDrawer('${ev.id}')" class="hub-announcement-card" style="cursor:pointer;display:flex;flex-direction:column;gap:14px;${cardBorderStyle}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:900;color:#fff;font-size:1.02rem;margin-bottom:4px;">${ev.title}</div>
                    <div style="font-size:.74rem;color:rgba(255,255,255,.4);">&#128205; ${ev.location || '&mdash;'}</div>
                </div>
                <span style="background:${st.bg};color:${st.color};border:1px solid ${st.color}44;padding:3px 8px;border-radius:6px;font-size:.67rem;font-weight:700;flex-shrink:0;margin-left:10px;">${st.label}</span>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <span style="font-size:.76rem;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:4px 9px;color:rgba(255,255,255,.55);">&#128197; ${dateStr}</span>
                ${ev.price > 0
                    ? `<span style="font-size:.76rem;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:4px 9px;color:#F59E0B;font-weight:700;">${ev.price.toFixed(2)}${currency(ev)}</span>`
                    : '<span style="font-size:.76rem;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);border-radius:8px;padding:4px 9px;color:#4ade80;font-weight:700;">GRATUITO</span>'}
                <span style="font-size:.76rem;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:4px 9px;color:rgba(255,255,255,.5);">&#128101; ${attendeeCount}${ev.capacity > 0 ? '/' + ev.capacity : ''}</span>
                ${hasReport ? '<span style="font-size:.76rem;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);border-radius:8px;padding:4px 9px;color:#4ade80;font-weight:700;">&#10003; Relatório enviado</span>' :
                              (isFinalizado ? '<span style="font-size:.76rem;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.2);border-radius:8px;padding:4px 9px;color:#f87171;font-weight:700;">&#9888; Relatório pendente</span>' : '')}
            </div>
            ${isPublic ? `
            <div style="display:flex;align-items:center;gap:8px;background:rgba(96,165,250,.07);border:1px solid rgba(96,165,250,.2);border-radius:10px;padding:8px 12px;" onclick="event.stopPropagation()">
                <span style="flex:1;font-size:.73rem;color:#60a5fa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${publicUrl}</span>
                <button onclick="navigator.clipboard.writeText('${publicUrl}').then(()=>{ if(typeof hubToast!=='undefined') hubToast('Link copiado!','success'); })" style="background:rgba(96,165,250,.15);border:1px solid rgba(96,165,250,.3);border-radius:6px;padding:3px 7px;color:#60a5fa;font-size:.66rem;font-weight:700;cursor:pointer;">Copiar</button>
                <a href="${publicUrl}" target="_blank" style="background:rgba(96,165,250,.15);border:1px solid rgba(96,165,250,.3);border-radius:6px;padding:3px 7px;color:#60a5fa;font-size:.66rem;font-weight:700;text-decoration:none;">Abrir &#8599;</a>
            </div>` : ''}
            ${occupancy !== null ? `
            <div style="background:rgba(255,255,255,.04);border-radius:6px;height:4px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(occupancy,100)}%;background:${occupancy>=90?'#f87171':occupancy>=70?'#F59E0B':'#4ade80'};border-radius:6px;transition:width .5s;"></div>
            </div>` : ''}
        </div>`;
    }

    const ativos     = eventos.filter(e => e.status === 'ACTIVE' || e.status === 'LIVE');
    const rascunhos  = eventos.filter(e => e.status === 'DRAFT');
    const finalizados = eventos.filter(e => e.status === 'CONCLUIDO' || e.status === 'ARCHIVED');

    const gA = document.getElementById('crie-grupo-ativos');
    const gR = document.getElementById('crie-grupo-rascunhos');
    const gF = document.getElementById('crie-grupo-finalizados');

    if (gA) gA.innerHTML = ativos.length ? ativos.map(renderCard).join('') : '<div style="text-align:center;padding:22px;color:rgba(255,255,255,.25);grid-column:1/-1;font-size:.82rem;">Nenhum evento ativo</div>';
    if (gR) gR.innerHTML = rascunhos.length ? rascunhos.map(renderCard).join('') : '<div style="text-align:center;padding:18px;color:rgba(255,255,255,.2);grid-column:1/-1;font-size:.82rem;">Nenhum rascunho</div>';
    if (gF) gF.innerHTML = finalizados.length ? finalizados.map(renderCard).join('') : '<div style="text-align:center;padding:18px;color:rgba(255,255,255,.2);grid-column:1/-1;font-size:.82rem;">Nenhum evento finalizado</div>';
}

// ═══════════════════════════════════════════════════════════
// EVENTO DRAWER
// ═══════════════════════════════════════════════════════════
window._drawerEventoId     = null;
window._drawerEventoStatus = null;
window._drawerEventoData   = null;
let   _finLancamentoType   = 'Receita';

function openEventoDrawer(id) {
    const ev = crieEventos.find(e => e.id === id);
    if (!ev) return;
    window._drawerEventoId     = id;
    window._drawerEventoStatus = ev.status;
    window._drawerEventoData   = ev;

    // Populate header
    document.getElementById('drawer-ev-title').textContent = ev.title || '—';
    document.getElementById('drawer-ev-date').textContent  = ev.date ? new Date(ev.date).toLocaleDateString('pt-PT', { weekday:'long', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Lisbon' }) : '—';

    const statusMap = { ACTIVE:'ATIVO', LIVE:'AO VIVO', DRAFT:'RASCUNHO', CONCLUIDO:'CONCLUIDO', ARCHIVED:'ARQUIVADO' };
    const statusColors = { ACTIVE:'#4ade80', LIVE:'#f87171', DRAFT:'#F59E0B', CONCLUIDO:'rgba(255,255,255,.4)', ARCHIVED:'rgba(255,255,255,.3)' };
    const sc = statusColors[ev.status] || '#F59E0B';
    document.getElementById('drawer-ev-status-badge').innerHTML = `<span style="background:${sc}22;color:${sc};border:1px solid ${sc}44;padding:4px 10px;border-radius:7px;font-size:.7rem;font-weight:800;">${statusMap[ev.status]||ev.status}</span>`;

    // Populate edit fields
    document.getElementById('dedit-title').value    = ev.title || '';
    document.getElementById('dedit-desc').value     = ev.description || '';
    document.getElementById('dedit-date').value     = ev.date ? (() => {
        // Show Lisbon local time in the datetime-local input (not raw UTC)
        const d = new Date(ev.date);
        const lp = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Lisbon', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(d);
        const g = t => lp.find(p => p.type === t)?.value;
        return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
    })() : '';
    document.getElementById('dedit-capacity').value = ev.capacity || '';
    document.getElementById('dedit-location').value = ev.location || '';
    document.getElementById('dedit-price').value    = ev.price ?? '';
    document.getElementById('dedit-currency').value = ev.currency || '€';
    document.getElementById('dedit-status').value   = (ev.status === 'ARCHIVED' || ev.status === 'LIVE') ? 'DRAFT' : (ev.status || 'DRAFT');

    // Handle locked state
    const isLocked   = !!ev.locked;
    const hasReport  = !!ev.report_sent_at;
    const saveBtn    = document.getElementById('drawer-save-btn');
    const fecharBtn  = document.getElementById('btn-fechar-evento');
    const reopenWrap = document.getElementById('drawer-reopen-wrap');

    if (saveBtn)    saveBtn.disabled = isLocked;
    if (fecharBtn)  { fecharBtn.disabled = isLocked; fecharBtn.textContent = isLocked ? (hasReport ? '&#128274; Relatório Enviado' : '&#128274; Evento Fechado') : '&#128274; GERAR RELATÓRIO & FECHAR EVENTO'; }
    if (reopenWrap) reopenWrap.style.display = isLocked ? 'block' : 'none';

    // Pre-fill email with logged-in user email if available
    const emailField = document.getElementById('dedit-report-email');
    if (emailField && !emailField.value) {
        const userEmail = window.supabaseClient?.auth?.getUser ? '' : '';
        window.supabaseClient?.auth?.getUser().then(({data}) => { if (data?.user?.email && emailField) emailField.value = data.user.email; });
    }

    switchDrawerTab('info');

    const overlay = document.getElementById('evento-drawer-overlay');
    const drawer  = document.getElementById('evento-drawer');
    if (overlay) { overlay.style.display = 'block'; }
    if (drawer)  { drawer.style.display  = 'flex'; }
}

function closeEventoDrawer() {
    document.getElementById('evento-drawer-overlay').style.display = 'none';
    document.getElementById('evento-drawer').style.display         = 'none';
}

function switchDrawerTab(tab) {
    ['info','inscritos','financeiro'].forEach(t => {
        const panel = document.getElementById(`drawer-panel-${t}`);
        const btn   = document.getElementById(`dtab-${t}`);
        if (panel) panel.style.display = t === tab ? 'flex' : 'none';
        if (btn) {
            btn.style.color       = t === tab ? '#F59E0B' : 'rgba(255,255,255,.4)';
            btn.style.borderBottom = t === tab ? '2px solid #F59E0B' : '2px solid transparent';
        }
    });
    if (tab === 'info') document.getElementById('drawer-panel-info').style.flexDirection = 'column';
    if (tab === 'inscritos')  loadDrawerInscritos();
    if (tab === 'financeiro') loadDrawerFinanceiro();
}

async function saveEventoDrawer() {
    const id = window._drawerEventoId;
    if (!id) return;
    const sb  = window.supabaseClient;
    const btn = document.getElementById('drawer-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'A guardar…'; }

    const payload = {
        title:       document.getElementById('dedit-title').value.trim(),
        description: document.getElementById('dedit-desc').value.trim() || null,
        date:        localLisbonToUTC(document.getElementById('dedit-date').value) || null,
        capacity:    parseInt(document.getElementById('dedit-capacity').value) || 0,
        location:    document.getElementById('dedit-location').value.trim(),
        price:       parseFloat(document.getElementById('dedit-price').value) || 0,
        currency:    document.getElementById('dedit-currency').value || '€',
        status:      document.getElementById('dedit-status').value,
    };
    const { error } = await sb.from('crie_events').update(payload).eq('id', id);
    if (error) { hubToast('Erro ao guardar: ' + error.message, 'error'); }
    else        { hubToast('Evento actualizado!', 'success'); }

    if (btn) { btn.disabled = false; btn.textContent = 'Guardar Alterações'; }
    await loadCrieEventos();
    window._drawerEventoData = crieEventos.find(e => e.id === id);
}

// ── Drawer: Inscritos ─────────────────────────────────────────
async function loadDrawerInscritos() {
    const id = window._drawerEventoId;
    if (!id) return;
    const container = document.getElementById('drawer-inscritos-list');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,.3);">A carregar…</div>';
    const sb = window.supabaseClient;
    const { data } = await sb.from('crie_attendees')
        .select('id, name, phone, email, presence_status, payment_status, industry, is_member')
        .eq('event_id', id)
        .order('name');
    if (!data || !data.length) {
        container.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,.3);">Nenhum inscrito.</div>';
        return;
    }
    container.innerHTML = data.map(a => {
        const pres = a.presence_status === 'Presente';
        const payCl = a.payment_status === 'Pago' ? '#60a5fa' : a.payment_status === 'Gratuito' ? '#6ee7b7' : '#fbbf24';
        return `<div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:10px 14px;">
            <div style="width:32px;height:32px;border-radius:50%;background:${pres?'rgba(74,222,128,.15)':'rgba(255,255,255,.06)'};border:1.5px solid ${pres?'rgba(74,222,128,.4)':'rgba(255,255,255,.1)'};display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0;">${pres?'&#10003;':''}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;color:#fff;font-size:.85rem;">${a.name}${a.is_member?'<span style="color:#F59E0B;font-size:.6rem;margin-left:5px;">&#9733; membro</span>':''}</div>
                <div style="font-size:.72rem;color:rgba(255,255,255,.35);">${a.phone||''} ${a.email?'&middot; '+a.email:''}</div>
            </div>
            <span style="color:${payCl};font-size:.68rem;font-weight:800;flex-shrink:0;">${a.payment_status||'PENDENTE'}</span>
        </div>`;
    }).join('');
}

// ── Drawer: Financeiro ────────────────────────────────────────
async function loadDrawerFinanceiro() {
    const id = window._drawerEventoId;
    const ev = window._drawerEventoData;
    if (!id || !ev) return;
    const sb = window.supabaseClient;

    // Get attendees payment info
    const { data: att } = await sb.from('crie_attendees')
        .select('payment_status')
        .eq('event_id', id);

    const pagos    = (att || []).filter(a => a.payment_status === 'Pago').length;
    const price    = ev.price || 0;
    const currency = ev.currency || '€';
    const recInscricoes = pagos * price;
    document.getElementById('fin-inscricoes-info').textContent = `${pagos} pagos x ${price.toFixed(2)}${currency} = ${recInscricoes.toFixed(2)}${currency}`;

    // Get manual lancamentos
    const { data: lans } = await sb.from('crie_finances')
        .select('*')
        .eq('event_id', id)
        .order('created_at', { ascending: false });

    const lancamentos = lans || [];
    const manualIncome  = lancamentos.filter(l => l.type === 'Receita').reduce((s,l) => s + (l.amount || 0), 0);
    const manualExpense = lancamentos.filter(l => l.type === 'Despesa').reduce((s,l) => s + (l.amount || 0), 0);

    const totalReceita  = recInscricoes + manualIncome;
    const totalDespesas = manualExpense;
    const saldo         = totalReceita - totalDespesas;

    document.getElementById('fin-receita').textContent  = totalReceita.toFixed(2)  + currency;
    document.getElementById('fin-despesas').textContent = totalDespesas.toFixed(2) + currency;
    const elSaldo = document.getElementById('fin-saldo');
    if (elSaldo) { elSaldo.textContent = saldo.toFixed(2) + currency; elSaldo.style.color = saldo >= 0 ? '#60a5fa' : '#f87171'; }

    // Render lancamentos list
    const list = document.getElementById('fin-lancamentos-list');
    if (!list) return;
    if (!lancamentos.length) {
        list.innerHTML = '<div style="text-align:center;padding:16px;color:rgba(255,255,255,.3);font-size:.8rem;">Nenhum lançamento manual.</div>';
        return;
    }
    list.innerHTML = lancamentos.map(l => {
        const isInc = l.type === 'Receita';
        return `<div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 14px;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:.82rem;font-weight:600;color:#fff;">${l.description||'—'}</div>
                <div style="font-size:.7rem;color:rgba(255,255,255,.35);">${new Date(l.created_at).toLocaleDateString('pt-PT')}</div>
            </div>
            <span style="font-size:.9rem;font-weight:800;color:${isInc?'#4ade80':'#f87171'};">${isInc?'+':'-'}${(l.amount||0).toFixed(2)}${currency}</span>
            <button onclick="deleteFinLancamento('${l.id}')" style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.2);border-radius:7px;padding:4px 8px;color:#f87171;cursor:pointer;font-size:.7rem;">&#10005;</button>
        </div>`;
    }).join('');
}

function openFinLancamento(type) {
    _finLancamentoType = type;
    document.getElementById('fin-form-label').textContent = type === 'Receita' ? 'Nova Receita' : 'Nova Despesa';
    document.getElementById('fin-form-desc').value   = '';
    document.getElementById('fin-form-amount').value = '';
    document.getElementById('fin-lancamento-form').style.display = 'block';
    document.getElementById('fin-form-desc').focus();
}

async function saveFinLancamento() {
    const id     = window._drawerEventoId;
    const wsId   = getCrieWorkspaceId();
    const desc   = document.getElementById('fin-form-desc').value.trim();
    const amount = parseFloat(document.getElementById('fin-form-amount').value);
    if (!id || !desc || isNaN(amount) || amount <= 0) { hubToast('Preenche descrição e valor!', 'error'); return; }
    const sb = window.supabaseClient;
    const { error } = await sb.from('crie_finances').insert({ event_id: id, workspace_id: wsId, type: _finLancamentoType, description: desc, amount });
    if (error) { hubToast('Erro: ' + error.message, 'error'); return; }
    hubToast(`${_finLancamentoType} lançada!`, 'success');
    document.getElementById('fin-lancamento-form').style.display = 'none';
    loadDrawerFinanceiro();
}

async function deleteFinLancamento(lancId) {
    const sb = window.supabaseClient;
    await sb.from('crie_finances').delete().eq('id', lancId);
    loadDrawerFinanceiro();
}

// ── Fechar Evento & Relatório ─────────────────────────────────
async function fecharEvento() {
    const id  = window._drawerEventoId;
    const ev  = window._drawerEventoData;
    const email = document.getElementById('dedit-report-email')?.value?.trim();
    if (!id || !ev) return;

    const sb = window.supabaseClient;

    // 1. Gather all data for the report
    const wsId = getCrieWorkspaceId();

    const [attRes, finRes] = await Promise.all([
        sb.from('crie_attendees').select('*').eq('event_id', id),
        sb.from('crie_finances').select('*').eq('event_id', id)
    ]);
    const attendees  = attRes.data || [];
    const lancamentos = finRes.data || [];

    const total     = attendees.length;
    const presentes = attendees.filter(a => a.presence_status === 'Presente').length;
    const ausentes  = total - presentes;
    const pagos     = attendees.filter(a => a.payment_status === 'Pago').length;
    const price     = ev.price || 0;
    const currency  = ev.currency || '€';
    const recInsc   = pagos * price;
    const manRec    = lancamentos.filter(l => l.type === 'Receita').reduce((s,l) => s + l.amount, 0);
    const manDesp   = lancamentos.filter(l => l.type === 'Despesa').reduce((s,l) => s + l.amount, 0);
    const totalRec  = recInsc + manRec;
    const saldo     = totalRec - manDesp;

    // Check recurring attendees (attendees in >1 CRIE event)
    const phones = attendees.map(a => a.phone).filter(Boolean);
    let recorrentes = 0;
    if (phones.length) {
        const { data: prevAtt } = await sb.from('crie_attendees')
            .select('phone, event_id')
            .in('phone', phones)
            .eq('workspace_id', wsId)
            .neq('event_id', id);
        const prevPhones = new Set((prevAtt || []).map(a => a.phone));
        recorrentes = attendees.filter(a => prevPhones.has(a.phone)).length;
    }

    // 2. Generate elegant HTML report
    const dateStr = ev.date ? new Date(ev.date).toLocaleDateString('pt-PT', { weekday:'long', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Lisbon' }) : '—';
    const reportHtml = `<!DOCTYPE html>
<html lang="pt"><head><meta charset="UTF-8"><title>Relatório CRIE — ${ev.title}</title>
<style>
body{font-family:'Inter',system-ui,sans-serif;background:#0a0c14;color:#e2e8f0;margin:0;padding:40px 24px;max-width:680px;margin:0 auto;}
h1{font-size:1.8rem;font-weight:900;color:#fff;margin-bottom:4px;}
.sub{font-size:.9rem;color:rgba(255,255,255,.4);margin-bottom:32px;}
.badge{display:inline-block;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);color:#F59E0B;padding:4px 12px;border-radius:8px;font-size:.75rem;font-weight:800;}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:28px 0;}
.kpi{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px;text-align:center;}
.kpi .val{font-size:2rem;font-weight:900;color:#fff;}
.kpi .lbl{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.35);margin-top:4px;}
.section{margin:28px 0;}
.section h2{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.35);margin-bottom:12px;}
.row{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;margin-bottom:6px;font-size:.9rem;}
.green{color:#4ade80;font-weight:800;} .red{color:#f87171;font-weight:800;} .blue{color:#60a5fa;font-weight:800;}
.analysis{background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:16px;padding:20px 22px;font-size:.9rem;line-height:1.7;color:rgba(255,255,255,.7);}
.footer{margin-top:40px;font-size:.75rem;color:rgba(255,255,255,.25);text-align:center;border-top:1px solid rgba(255,255,255,.06);padding-top:16px;}
</style></head><body>
<div class="badge">CRIE BRAGA</div>
<h1 style="margin-top:12px;">&#128197; ${ev.title}</h1>
<div class="sub">${dateStr} &nbsp;|&nbsp; ${ev.location || '&mdash;'}</div>

<div class="kpi-grid">
    <div class="kpi"><div class="val">${total}</div><div class="lbl">Inscritos</div></div>
    <div class="kpi"><div class="val green">${presentes}</div><div class="lbl">Presentes</div></div>
    <div class="kpi"><div class="val red">${ausentes}</div><div class="lbl">Ausentes</div></div>
    <div class="kpi"><div class="val">${((total>0?presentes/total:0)*100).toFixed(0)}%</div><div class="lbl">Taxa Presença</div></div>
    <div class="kpi"><div class="val">${recorrentes}</div><div class="lbl">Recorrentes</div></div>
    <div class="kpi"><div class="val">${pagos}</div><div class="lbl">Pagamentos</div></div>
</div>

<div class="section">
    <h2>&#128176; Resumo Financeiro</h2>
    <div class="row"><span>Inscrições pagas (${pagos} x ${price.toFixed(2)}${currency})</span><span class="green">+${recInsc.toFixed(2)}${currency}</span></div>
    ${lancamentos.filter(l=>l.type==='Receita').map(l=>`<div class="row"><span>${l.description}</span><span class="green">+${l.amount.toFixed(2)}${currency}</span></div>`).join('')}
    ${lancamentos.filter(l=>l.type==='Despesa').map(l=>`<div class="row"><span>${l.description}</span><span class="red">-${l.amount.toFixed(2)}${currency}</span></div>`).join('')}
    <div class="row" style="margin-top:8px;background:rgba(96,165,250,.06);border-color:rgba(96,165,250,.15);"><strong>Saldo Final</strong><span class="${saldo>=0?'blue':'red'}">${saldo>=0?'+':''}${saldo.toFixed(2)}${currency}</span></div>
</div>

<div class="analysis">
    <strong style="color:#F59E0B;">&#128161; Análise do Evento</strong><br><br>
    O evento <strong>${ev.title}</strong> registou <strong>${total} inscri${total!==1?'tos':'to'}</strong>, com uma taxa de presença de <strong>${total>0?((presentes/total)*100).toFixed(0):0}%</strong>.
    ${recorrentes>0?`<br><br>Dos presentes, <strong>${recorrentes}</strong> j&aacute; tinham participado em eventos anteriores do CRIE Braga — sinal positivo de fideliza&ccedil;&atilde;o da comunidade.`:''}
    ${saldo>0?`<br><br>O evento gerou um saldo positivo de <strong>${saldo.toFixed(2)}${currency}</strong>, contribuindo para a sustentabilidade do ministério.`:saldo<0?`<br><br>O evento registou um saldo negativo de <strong>${Math.abs(saldo).toFixed(2)}${currency}</strong>. Considerar ajustar o valor da inscrição ou reduzir custos nos próximos eventos.`:'<br><br>O evento equilibrou receitas e despesas.'}
    <br><br>Continue a registar os inscritos no CRIE para construir um historial preciso da comunidade e personalizar as próximas experiências!
</div>

<div class="footer">Gerado automaticamente pelo Zelo Pro &middot; ${new Date().toLocaleDateString('pt-PT')}</div>
</body></html>`;

    // 3. Open report in new window
    const reportWin = window.open('', '_blank', 'width=720,height=850');
    if (reportWin) {
        reportWin.document.write(reportHtml);
        reportWin.document.close();
    }

    // 4. Prepare mailto with summary
    if (email) {
        const subject = encodeURIComponent(`Relatório CRIE — ${ev.title}`);
        const body    = encodeURIComponent(
            `Relatório do evento: ${ev.title}\nData: ${dateStr}\nLocal: ${ev.location||'—'}\n\nInscritos: ${total}\nPresentes: ${presentes}\nAusentes: ${ausentes}\nTaxa presença: ${total>0?((presentes/total)*100).toFixed(0):0}%\nRecorrentes: ${recorrentes}\n\nReceita Total: ${totalRec.toFixed(2)}${currency}\nDespesas Total: ${manDesp.toFixed(2)}${currency}\nSaldo Final: ${saldo.toFixed(2)}${currency}\n\nO relatório completo foi aberto numa nova janela.`
        );
        window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    }

    // 5. Lock the event
    await sb.from('crie_events').update({ locked: true, report_sent_at: new Date().toISOString(), status: 'CONCLUIDO' }).eq('id', id);
    hubToast('Evento fechado! Relatório gerado.', 'success');
    await loadCrieEventos();
    closeEventoDrawer();
}

async function reabrirEvento() {
    const id = window._drawerEventoId;
    if (!id) return;
    const sb = window.supabaseClient;
    await sb.from('crie_events').update({ locked: false }).eq('id', id);
    hubToast('Evento reaberto!', 'success');
    await loadCrieEventos();
    window._drawerEventoData = crieEventos.find(e => e.id === id);
    openEventoDrawer(id);
}




function openCreateEventoModal() {
    const modal = document.getElementById('modal-create-evento');
    clearEventBanner();
    if (modal) modal.style.display = 'flex';
}

// ── Banner image preview/clear helpers ────────────────────────
let _bannerFile = null;

function previewEventBanner(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        if (typeof hubToast !== 'undefined') hubToast('Imagem demasiado grande (máx 5MB)', 'error');
        input.value = '';
        return;
    }
    _bannerFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
        const pi = document.getElementById('banner-preview-img');
        const ph = document.getElementById('banner-placeholder');
        const pw = document.getElementById('banner-preview-wrap');
        if (pi) pi.src = ev.target.result;
        if (ph) ph.style.display = 'none';
        if (pw) pw.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function clearEventBanner() {
    _bannerFile = null;
    const fi = document.getElementById('banner-file-input');
    const uf = document.getElementById('banner-url-field');
    const ph = document.getElementById('banner-placeholder');
    const pw = document.getElementById('banner-preview-wrap');
    const pi = document.getElementById('banner-preview-img');
    if (fi) fi.value = '';
    if (uf) uf.value = '';
    if (ph) ph.style.display = 'block';
    if (pw) pw.style.display = 'none';
    if (pi) pi.src = '';
}


async function saveCrieEvento(e) {
    e.preventDefault();
    const wsId = getCrieWorkspaceId();
    const form = e.target;
    // ⚠️ form.title resolves to document.title in DOM — use elements[] instead
    const payload = {
        workspace_id: wsId,
        title:       form.elements['title'].value.trim(),
        description: form.elements['description'].value.trim() || null,
        date:        localLisbonToUTC(form.elements['date'].value),
        capacity:    parseInt(form.elements['capacity'].value) || 0,
        location:    form.elements['location'].value.trim(),
        price:       parseFloat(form.elements['price'].value) || 0,
        currency:    form.elements['currency'] ? form.elements['currency'].value : '€',
        status:      form.elements['status'].value,
        banner_url:  null,
    };
    if (!payload.title) {
        if (typeof hubToast !== 'undefined') hubToast('Título é obrigatório', 'error');
        return;
    }
    const sb = window.supabaseClient;
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'A criar…'; }

    // Upload banner if a file was selected
    if (_bannerFile) {
        try {
            const ext = _bannerFile.name.split('.').pop().toLowerCase();
            const path = `crie-banners/${wsId}/${Date.now()}.${ext}`;
            const { data: upData, error: upErr } = await sb.storage
                .from('event-banners')
                .upload(path, _bannerFile, { upsert: true, contentType: _bannerFile.type });
            if (!upErr) {
                const { data: { publicUrl } } = sb.storage.from('event-banners').getPublicUrl(path);
                payload.banner_url = publicUrl;
            } else {
                console.warn('[CRIE] Banner upload warning:', upErr.message);
            }
        } catch(err) {
            console.warn('[CRIE] Banner upload error:', err);
        }
    }

    const { error } = await sb.from('crie_events').insert(payload);
    if (btn) { btn.disabled = false; btn.textContent = 'Criar Evento'; }
    if (error) {
        if (typeof hubToast !== 'undefined') hubToast('Erro: ' + error.message, 'error');
        else alert('Erro: ' + error.message);
        return;
    }
    form.reset();
    clearEventBanner();
    closeModal('modal-create-evento');
    if (typeof hubToast !== 'undefined') hubToast('Evento criado com sucesso! 🎉', 'success');
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
    
    // sort by date descending
    active.sort((a,b) => {
        const d1 = a.date ? new Date(a.date) : new Date(0);
        const d2 = b.date ? new Date(b.date) : new Date(0);
        return d2 - d1;
    });

    sel.innerHTML = '<option value="">Selecionar Evento…</option>' +
        active.map(e => {
            const dateStr = e.date ? new Date(e.date).toLocaleDateString('pt-PT') : '';
            return `<option value="${e.id}">${e.title}${dateStr ? ' — ' + dateStr : ''}</option>`;
        }).join('');
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
        .select('id, name, email, phone, presence_status, payment_status, is_member')
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

// ── Payment helpers ──────────────────────────────────────────
const PAYMENT_CYCLE = ['Pendente', 'Pago', 'Gratuito'];

function _checkinPayBadge(status) {
    if (status === 'Pago')     return '<span style="background:rgba(96,165,250,.15);color:#60a5fa;border:1px solid rgba(96,165,250,.3);padding:4px 10px;border-radius:8px;font-size:.7rem;font-weight:800;box-shadow:0 0 10px rgba(96,165,250,.2);">PAGO</span>';
    if (status === 'Gratuito') return '<span style="background:rgba(110,231,183,.1);color:#6ee7b7;border:1px solid rgba(110,231,183,.2);padding:4px 10px;border-radius:8px;font-size:.7rem;font-weight:800;box-shadow:0 0 10px rgba(110,231,183,.1);">GRATUITO</span>';
    return '<span style="background:rgba(251,191,36,.1);color:#fbbf24;border:1px solid rgba(251,191,36,.25);padding:4px 10px;border-radius:8px;font-size:.7rem;font-weight:800;box-shadow:0 0 10px rgba(251,191,36,.15);">PENDENTE</span>';
}

function _checkinCard(a, presente) {
    const phoneClean = (a.phone || '').replace(/\D/g, '');
    const waBtn = phoneClean
        ? `<a href="https://wa.me/${phoneClean}" target="_blank" onclick="event.stopPropagation()" title="Abrir WhatsApp" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:rgba(37,211,102,.12);border-radius:10px;color:#25d366;text-decoration:none;flex-shrink:0;transition:all .2s;" onmouseover="this.style.background='rgba(37,211,102,.28)';this.style.transform='scale(1.1)'" onmouseout="this.style.background='rgba(37,211,102,.12)';this.style.transform='scale(1)'"><svg viewBox='0 0 24 24' width='14' height='14' fill='#25d366'><path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z'/><path d='M11.998 0C5.373 0 0 5.373 0 11.998c0 2.117.553 4.1 1.518 5.823L0 24l6.335-1.493A11.945 11.945 0 0 0 11.999 24C18.625 24 24 18.627 24 12.002 24 5.373 18.625 0 11.998 0zm.001 21.818a9.823 9.823 0 0 1-5.011-1.37l-.36-.214-3.722.877.894-3.613-.235-.372A9.818 9.818 0 0 1 2.18 12c0-5.42 4.4-9.818 9.819-9.818 5.42 0 9.82 4.398 9.82 9.818 0 5.42-4.4 9.818-9.82 9.818z'/></svg></a>`
        : '';
    const bg     = presente ? 'radial-gradient(135deg, rgba(74,222,128,.15), rgba(74,222,128,.02))' : 'radial-gradient(135deg, rgba(255,255,255,.05), rgba(255,255,255,.01))';
    const border = presente ? 'rgba(74,222,128,.3)'  : 'rgba(255,255,255,.08)';
    const shadow = presente ? '0 8px 30px rgba(74,222,128,.1)' : '0 4px 15px rgba(0,0,0,.3)';
    return `
    <div id="checkin-card-${a.id}" class="crie-checkin-card anim-card-enter" onclick="toggleCheckinPresence('${a.id}')" style="display:flex;align-items:center;gap:16px;background:${bg};border:1px solid ${border};border-radius:20px;padding:16px 20px;cursor:pointer;transition:all .3s cubic-bezier(0.175, 0.885, 0.32, 1.275);user-select:none;box-shadow:${shadow};backdrop-filter:blur(10px);" onmouseover="this.style.transform='scale(1.02) translateY(-2px)'" onmouseout="this.style.transform='scale(1) translateY(0)'">
        <div style="width:42px;height:42px;border-radius:12px;background:${presente?'rgba(74,222,128,.2)':'rgba(255,255,255,.05)'};border:2px solid ${presente?'rgba(74,222,128,.6)':'rgba(255,255,255,.1)'};display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;transition:all .3s;box-shadow:inset 0 2px 5px rgba(255,255,255,.1);">
            ${presente ? '<span style="color:#4ade80;text-shadow:0 0 8px rgba(74,222,128,.5);">&#10003;</span>' : ''}
        </div>
        <div class="checkin-info-container" style="flex:1;min-width:0;overflow:hidden;display:flex;flex-direction:column;justify-content:center;">
            <div style="font-weight:800;font-size:1.05rem;color:#fff;display:flex;align-items:center;gap:8px;flex-wrap:wrap;letter-spacing:.02em;">
                ${a.name}
                ${a.is_member ? '<span title="Membro CRIE" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:linear-gradient(135deg,#F59E0B,#FFD700);border-radius:50%;color:#111;font-size:.7rem;flex-shrink:0;box-shadow:0 0 10px rgba(245,158,11,.4);">&#9733;</span>' : ''}
            </div>
            <div style="font-size:.8rem;font-weight:500;color:rgba(255,255,255,.45);margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span>${a.email || '&mdash;'}</span>
                <span style="opacity:.3;">&bull;</span>
                <span>${a.phone || '&mdash;'}</span>
                ${waBtn}
            </div>
        </div>
        <div class="crie-checkin-controls" style="display:flex;align-items:center;gap:16px;">
            <div onclick="event.stopPropagation(); cycleCheckinPayment('${a.id}','${a.payment_status || 'Pendente'}')" title="Clique para alterar pagamento" style="flex-shrink:0;transition:transform .2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                ${_checkinPayBadge(a.payment_status)}
            </div>
            <div style="font-size:.75rem;font-weight:900;letter-spacing:.05em;padding:6px 12px;border-radius:8px;background:${presente?'rgba(74,222,128,.1)':'rgba(255,255,255,.05)'};color:${presente?'#4ade80':'rgba(255,255,255,.3)'};text-align:center;flex-shrink:0;min-width:90px;">
                ${presente ? 'PRESENTE' : 'CONFIRMAR'}
            </div>
        </div>
    </div>`;
}

function renderCheckinList(list) {
    const container = document.getElementById('checkin-list');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:rgba(255,255,255,.3);">Nenhum inscrito encontrado.</div>';
        return;
    }
    const pending = [...list].filter(a => a.presence_status !== 'Presente').sort((a,b) => (a.name||'').localeCompare(b.name||'','pt'));
    const present = [...list].filter(a => a.presence_status === 'Presente').sort((a,b) => (a.name||'').localeCompare(b.name||'','pt'));

    let html = '';
    if (pending.length) {
        html += `<div style="font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:8px;padding:0 2px;">A confirmar &middot; ${pending.length}</div>`;
        html += pending.map(a => _checkinCard(a, false)).join('');
    }
    if (present.length) {
        html += `<div style="margin-top:${pending.length ? 24 : 0}px;">`;
        html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">`;
        html += `<div style="flex:1;height:1px;background:rgba(74,222,128,.15);"></div>`;
        html += `<span style="font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4ade80;">&#10003; PRESENTES &middot; ${present.length}</span>`;
        html += `<div style="flex:1;height:1px;background:rgba(74,222,128,.15);"></div></div>`;
        html += present.map(a => _checkinCard(a, true)).join('');
        html += '</div>';
    }
    container.innerHTML = html;
}

async function toggleCheckinPresence(id) {
    const attendee = crieCheckinData.find(a => a.id === id);
    if (!attendee) return;
    
    // Add leave animation locally
    const card = document.getElementById(`checkin-card-${id}`);
    if (card) {
        card.classList.add('anim-card-leave');
    }

    const next = attendee.presence_status === 'Presente' ? 'Pendente' : 'Presente';
    const sb = window.supabaseClient;
    await sb.from('crie_attendees').update({ presence_status: next }).eq('id', id);
    attendee.presence_status = next;
    
    setTimeout(() => {
        filterCheckin();
        updateCheckinCounter();
    }, 250);
}

async function cycleCheckinPayment(id, currentStatus) {
    const idx  = PAYMENT_CYCLE.indexOf(currentStatus);
    const next = PAYMENT_CYCLE[(idx + 1) % PAYMENT_CYCLE.length];
    const sb   = window.supabaseClient;
    await sb.from('crie_attendees').update({ payment_status: next }).eq('id', id);
    const attendee = crieCheckinData.find(a => a.id === id);
    if (attendee) attendee.payment_status = next;
    filterCheckin();
    updateCheckinCounter();
}

function updateCheckinCounter() {
    const total     = crieCheckinData.length;
    const presentes = crieCheckinData.filter(a => a.presence_status === 'Presente').length;
    const pagos     = crieCheckinData.filter(a => a.payment_status === 'Pago').length;
    const pendentes = crieCheckinData.filter(a => (a.payment_status || 'Pendente') === 'Pendente').length;

    const elC  = document.getElementById('checkin-counter');
    const elPg = document.getElementById('checkin-pagos');
    const elPd = document.getElementById('checkin-pendentes');

    if (elC)  elC.textContent  = `${presentes} / ${total}`;
    if (elPg) elPg.textContent = `${pagos}`;
    if (elPd) elPd.textContent = `${pendentes}`;
}

// ───────────────────────────────────────────────────────────
// Quick Override Adds
// ───────────────────────────────────────────────────────────
function openQuickAddCrie() {
    const eventId = document.getElementById('checkin-event-select')?.value;
    if (!eventId) {
        if (typeof hubToast !== 'undefined') hubToast('Selecione um evento primeiro!', 'error');
        else alert('Selecione um evento primeiro para poder adicionar inscritos avulsos.');
        return;
    }
    document.getElementById('modal-quick-add-checkin').style.display = 'flex';
}

async function quickAddCrieAttendee(e) {
    e.preventDefault();
    const eventId = document.getElementById('checkin-event-select')?.value;
    const wsId = getCrieWorkspaceId();
    if (!eventId || !wsId) return;

    const form = e.target;
    const qName = form.elements['q_name'].value.trim();
    const qPhone = form.elements['q_phone'].value.trim() || null;
    
    const btn = document.getElementById('btn-quick-add');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Adicionando...';
    }

    const payload = {
        workspace_id: wsId,
        event_id: eventId,
        name: qName,
        phone: qPhone,
        payment_status: 'Pendente',
        presence_status: 'Presente',
        is_member: false
    };

    const sb = window.supabaseClient;
    const { data, error } = await sb.from('crie_attendees').insert(payload).select().single();
    
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Confirmar Entrada (Override)';
    }

    if (error) {
        if (typeof hubToast !== 'undefined') hubToast('Erro ao adicionar: ' + error.message, 'error');
        return;
    }

    // Append to local state and update UI
    crieCheckinData.push(data);
    form.reset();
    closeModal('modal-quick-add-checkin');
    
    if (typeof hubToast !== 'undefined') hubToast('Entrada rápida confirmada!', 'success');
    
    filterCheckin();
    updateCheckinCounter();
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

// ── deleteLead global capability ─────────────
if (!window.deleteLead) {
    window.deleteLead = async function(leadId) {
        if (!confirm("⚠️ Tem certeza que deseja exluir esta Ficha permanentemente? Não será possível recuperar.")){
            return;
        }
        
        try {
            if (window.showToast) window.showToast('Excluindo...', 9999);
            
            const sb = window.supabaseClient;
            const { error } = await sb.from('leads').delete().eq('id', leadId);
            
            if (error) throw error;
            
            if (window.showToast) window.showToast('✅ Ficha Excluída.', 2000);
            
            // Re-fetch everything immediately
            if (typeof window.fetchLiveLeads === 'function') {
                window.fetchLiveLeads();
            }
        } catch (e) {
            console.error("Erro ao excluir lead: ", e);
            alert("Erro ao excluir: " + e.message);
        }
    };
}


// ═══════════════════════════════════════════════════════════
// BATISMO MODULE
// ═══════════════════════════════════════════════════════════

let _batismoAll = []; // combined: registrations + course participants

window.loadBatismoModule = async function() {
    if (!window.supabaseClient || !window.currentWorkspaceId) return;
    const wsId = window.currentWorkspaceId;
    const sb = window.supabaseClient;

    try {
        // 1. Fetch all baptism registrations
        const { data: regs } = await sb.from('baptism_registrations')
            .select('*')
            .eq('workspace_id', wsId)
            .order('created_at', { ascending: false });

        // 2. Fetch all course participants
        const { data: course } = await sb.from('baptism_course_participants')
            .select('*')
            .eq('workspace_id', wsId)
            .order('created_at', { ascending: false });

        // 3. Merge lists — regs take precedence over course (by email)
        const regEmails = new Set((regs || []).map(r => (r.email || '').toLowerCase()));
        const courseOnly = (course || []).filter(c => !regEmails.has((c.email || '').toLowerCase()));

        _batismoAll = [
            ...(regs || []).map(r => ({ ...r, _source: 'registration' })),
            ...courseOnly.map(c => ({ ...c, _source: 'course', status: 'course' }))
        ];

        // KPIs
        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const totalBatizados = (regs || []).filter(r => r.status === 'baptized').length;
        const monthBatizados = (regs || []).filter(r => r.status === 'baptized' && r.created_at >= thisMonthStart).length;
        const pending = (regs || []).filter(r => r.status === 'will_baptize_today').length;
        const courseCount = courseOnly.length;

        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setEl('batismo-kpi-total', totalBatizados);
        setEl('batismo-kpi-month', monthBatizados);
        setEl('batismo-kpi-curso', courseCount);
        setEl('batismo-kpi-pending', pending);

        // Generate QR
        if (typeof QRCode !== 'undefined') {
            const slug = (window._allWorkspaces || []).find(w => w.id === window.currentWorkspaceId)?.slug || '';
            const qrUrl = window.location.origin + (slug ? `/${slug}/` : '/') + 'batismo-form.html';
            const canvas = document.getElementById('qr-batismo');
            if (canvas) {
                QRCode.toCanvas(canvas, qrUrl, { width: 64, margin: 1, color: { dark: '#000000', light: '#ffffff' } }, () => {});
            }
        }

        filterBatismoTable();
    } catch(e) {
        console.error('Batismo module error:', e);
    }
};

window.filterBatismoTable = function() {
    const search = (document.getElementById('batismo-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('batismo-filter-status')?.value || 'all';

    let list = _batismoAll;
    if (search) {
        list = list.filter(r =>
            (r.name || '').toLowerCase().includes(search) ||
            (r.email || '').toLowerCase().includes(search) ||
            (r.phone || '').includes(search)
        );
    }
    if (statusFilter !== 'all') {
        list = list.filter(r => r.status === statusFilter);
    }

    renderBatismoTable(list);
};

function renderBatismoTable(list) {
    const tbody = document.getElementById('batismo-table-body');
    if (!tbody) return;

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:40px; text-align:center; color:rgba(255,255,255,.3);">Nenhum registro encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(r => {
        const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-PT') : '—';
        const phoneClean = (r.phone || '').replace(/\D/g, '');
        const waBtn = phoneClean
            ? `<a href="https://wa.me/${phoneClean}" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:rgba(37,211,102,.15);border-radius:50%;color:#25d366;text-decoration:none;margin-left:6px;">
                <svg viewBox='0 0 24 24' width='10' height='10' fill='#25d366'><path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z'/></svg>
               </a>` : '';

        let statusBadge;
        if (r.status === 'baptized') {
            statusBadge = '<span style="background:rgba(167,139,250,.15);color:#A78BFA;padding:3px 10px;border-radius:20px;font-size:.7rem;font-weight:700;">✅ BATIZADO</span>';
        } else if (r.status === 'will_baptize_today') {
            statusBadge = '<span style="background:rgba(251,191,36,.12);color:#FBBF24;padding:3px 10px;border-radius:20px;font-size:.7rem;font-weight:700;">🕐 SERÁ BATIZADO</span>';
        } else {
            statusBadge = '<span style="background:rgba(96,165,250,.12);color:#60A5FA;padding:3px 10px;border-radius:20px;font-size:.7rem;font-weight:700;">📖 EM CURSO</span>';
        }

        const rowData = encodeURIComponent(JSON.stringify(r));
        return `
        <tr style="border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;" onmouseover="this.style.background='rgba(255,215,0,.04)'" onmouseout="this.style.background=''" onclick="openPersonDrawer('batismo', ${JSON.stringify(r).replace(/"/g,'&quot;')})">
            <td style="padding:12px 14px; font-weight:700; color:#fff;">${r.name || '—'}</td>
            <td style="padding:12px 14px; font-size:.78rem; color:rgba(255,255,255,.5);">
                <div>${r.email || '—'}</div>
                <div style="display:flex;align-items:center;margin-top:2px;">${r.phone || '—'}${waBtn}</div>
            </td>
            <td style="padding:12px 14px; text-align:center;">${statusBadge}</td>
            <td style="padding:12px 14px; font-size:.78rem; color:rgba(255,255,255,.4);">${dateStr}</td>
        </tr>`;
    }).join('');
}

window.copyBatismoFormLink = function() {
    const slug = (window._allWorkspaces || []).find(w => w.id === window.currentWorkspaceId)?.slug || '';
    const url = window.location.origin + (slug ? `/${slug}/` : '/') + 'batismo-form.html';
    navigator.clipboard.writeText(url).then(() => {
        if (typeof hubToast !== 'undefined') hubToast('Link copiado!', 'success');
    });
};

window.openBatismoForm = function() {
    const slug = (window._allWorkspaces || []).find(w => w.id === window.currentWorkspaceId)?.slug || '';
    const url = window.location.origin + (slug ? `/${slug}/` : '/') + 'batismo-form.html';
    window.open(url, '_blank');
};

// ═══════════════════════════════════════════════════════════
// START STATUS TAGS on Lead Cards
// ═══════════════════════════════════════════════════════════
// These are loaded once and used in renderCards to show Start progress tags

window._startParticipantsMap = null; // Map<email_lower, status_obj>

async function loadStartParticipantsMap() {
    if (!window.supabaseClient || !window.currentWorkspaceId) return;
    if (window._startParticipantsMap) return; // Already loaded
    const sb = window.supabaseClient;
    const wsId = window.currentWorkspaceId;

    try {
        // Load participants + their progress to determine status
        const { data: participants } = await sb.from('start_participants')
            .select('id, email, phone')
            .eq('workspace_id', wsId);

        if (!participants || !participants.length) {
            window._startParticipantsMap = new Map();
            return;
        }

        const ids = participants.map(p => p.id);
        const { data: progress } = await sb.from('start_progress')
            .select('participant_id, lesson_number')
            .in('participant_id', ids);

        // Group progress by participant
        const progressByP = {};
        (progress || []).forEach(pr => {
            if (!progressByP[pr.participant_id]) progressByP[pr.participant_id] = [];
            progressByP[pr.participant_id].push(pr.lesson_number);
        });

        // Get total lessons count for this workspace
        const { count: totalLessons } = await sb.from('start_lessons')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', wsId);
        const total = totalLessons || 3; // default 3 lessons

        // Build map by email
        const map = new Map();
        participants.forEach(p => {
            const done = (progressByP[p.id] || []).length;
            let status;
            if (done === 0) status = 'not_started';
            else if (done >= total) status = 'completed';
            else status = 'in_progress';

            const key = (p.email || '').toLowerCase();
            if (key) map.set(key, { status, done, total });
            // Also index by phone
            const phoneClean = (p.phone || '').replace(/\D/g, '');
            if (phoneClean) map.set('phone:' + phoneClean, { status, done, total });
        });

        window._startParticipantsMap = map;
    } catch(e) {
        console.error('loadStartParticipantsMap:', e);
        window._startParticipantsMap = new Map();
    }
}

/**
 * Returns a tag HTML string for the Start status of a lead.
 * Call this when rendering lead cards.
 */
window.getStartStatusTag = function(lead) {
    const map = window._startParticipantsMap;
    if (!map) return '';

    const email = (lead.email || '').toLowerCase();
    const phoneClean = (lead.phone || '').replace(/\D/g, '');

    const info = map.get(email) || (phoneClean ? map.get('phone:' + phoneClean) : null);
    if (!info) return ''; // Not in Start — no tag

    const styles = {
        not_started: 'background:rgba(255,255,255,.07); color:rgba(255,255,255,.5); border:1px solid rgba(255,255,255,.12);',
        in_progress: 'background:rgba(96,165,250,.12); color:#60A5FA; border:1px solid rgba(96,165,250,.25);',
        completed: 'background:rgba(52,211,153,.1); color:#34D399; border:1px solid rgba(52,211,153,.25);',
    };
    const labels = {
        not_started: '⬜ START: Não Iniciou',
        in_progress: `🔵 START: Aula ${info.done}/${info.total}`,
        completed: '✅ START: Concluído',
    };

    const s = styles[info.status] || styles.not_started;
    const l = labels[info.status] || '';
    return `<span style="${s} padding:2px 8px; border-radius:6px; font-size:0.68rem; font-weight:700; display:inline-block; white-space:nowrap;">${l}</span>`;
};

// Preload start map when workspace is ready
document.addEventListener('DOMContentLoaded', () => {
    // Slight delay to ensure supabaseClient and currentWorkspaceId are set
    setTimeout(() => {
        if (window.supabaseClient && window.currentWorkspaceId) {
            loadStartParticipantsMap();
        } else {
            // Try again after auth
            const _origInit = window.initFaseG;
            window.initFaseG = function(user) {
                if (_origInit) _origInit(user);
                loadStartParticipantsMap();
            };
        }
    }, 1500);
});

// ═══════════════════════════════════════════════════════════
// NOVOS MEMBROS MODULE
// ═══════════════════════════════════════════════════════════

let _membrosAll = []; // cached records from member_registrations

window.loadMembrosModule = async function() {
    if (!window.supabaseClient || !window.currentWorkspaceId) return;
    const wsId = window.currentWorkspaceId;
    const sb = window.supabaseClient;

    try {
        const { data: regs, error } = await sb
            .from('member_registrations')
            .select('*')
            .eq('workspace_id', wsId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        _membrosAll = regs || [];

        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const total    = _membrosAll.length;
        const done     = _membrosAll.filter(r => r.inpeace_status === 'done').length;
        const pending  = _membrosAll.filter(r => r.inpeace_status === 'pending').length;
        const thisMonth = _membrosAll.filter(r => r.created_at >= thisMonthStart).length;

        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setEl('membros-kpi-total',   total);
        setEl('membros-kpi-done',    done);
        setEl('membros-kpi-pending', pending);
        setEl('membros-kpi-month',   thisMonth);
        setEl('jornada-kpi-membros', total);

        if (typeof QRCode !== 'undefined') {
            const slug = (window._allWorkspaces || []).find(w => w.id === window.currentWorkspaceId)?.slug || '';
            const qrUrl = window.location.origin + (slug ? `/${slug}/` : '/') + 'novos-membros-form.html';
            const canvas = document.getElementById('qr-membros');
            if (canvas) {
                QRCode.toCanvas(canvas, qrUrl, { width: 64, margin: 1, color: { dark: '#000000', light: '#ffffff' } }, () => {});
            }
        }

        filterMembrosTable();
    } catch(e) {
        console.error('Membros module error:', e);
    }
};

window.filterMembrosTable = function() {
    const search = (document.getElementById('membros-search')?.value || '').toLowerCase();
    const inpeaceFilter = document.getElementById('membros-filter-inpeace')?.value || 'all';

    let list = _membrosAll;
    if (search) {
        list = list.filter(r =>
            (r.name || '').toLowerCase().includes(search) ||
            (r.email || '').toLowerCase().includes(search) ||
            (r.phone || '').includes(search)
        );
    }
    if (inpeaceFilter !== 'all') {
        list = list.filter(r => r.inpeace_status === inpeaceFilter);
    }
    renderMembrosTable(list);
};

function renderMembrosTable(list) {
    const tbody = document.getElementById('membros-table-body');
    if (!tbody) return;

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:40px; text-align:center; color:rgba(255,255,255,.3);">Nenhum registro encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(r => {
        const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-PT') : '\u2014';
        const phoneClean = (r.phone || '').replace(/\D/g, '');
        const waBtn = phoneClean
            ? `<a href="https://wa.me/${phoneClean}" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:rgba(37,211,102,.15);border-radius:50%;color:#25d366;text-decoration:none;margin-left:6px;"><svg viewBox='0 0 24 24' width='10' height='10' fill='#25d366'><path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z'/></svg></a>` : '';

        const isDone = r.inpeace_status === 'done';
        const inpeaceBadge = `<span id="inpeace-tag-${r.id}" onclick="toggleInPeaceStatus('${r.id}', '${r.inpeace_status}')" title="Clique para alterar status InPeace" style="cursor:pointer;display:inline-block;padding:4px 12px;border-radius:20px;font-size:.7rem;font-weight:700;transition:all .2s;${isDone ? 'background:rgba(52,211,153,.15);color:#34D399;border:1px solid rgba(52,211,153,.3);' : 'background:rgba(251,191,36,.12);color:#FBBF24;border:1px solid rgba(251,191,36,.25);'}">${isDone ? '\u2705 InPeace Feito' : '\ud83d\udd50 Pendente'}</span>`;

        return `<tr style="border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;" onmouseover="this.style.background='rgba(255,215,0,.04)'" onmouseout="this.style.background=''" onclick="openPersonDrawer('membros', ${JSON.stringify(r).replace(/"/g,'&quot;')})">
            <td style="padding:12px 14px;font-weight:700;color:#fff;">${r.name || '\u2014'}</td>
            <td style="padding:12px 14px;font-size:.78rem;color:rgba(255,255,255,.5);"><div>${r.email || '\u2014'}</div><div style="display:flex;align-items:center;margin-top:2px;">${r.phone || '\u2014'}${waBtn}</div></td>
            <td style="padding:12px 14px;text-align:center;">${inpeaceBadge}</td>
            <td style="padding:12px 14px;font-size:.78rem;color:rgba(255,255,255,.4);">${dateStr}</td>
        </tr>`;
    }).join('');
}

window.toggleInPeaceStatus = async function(id, currentStatus) {
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    const sb = window.supabaseClient;

    const tag = document.getElementById('inpeace-tag-' + id);
    if (tag) {
        const isDone = newStatus === 'done';
        tag.style.background = isDone ? 'rgba(52,211,153,.15)' : 'rgba(251,191,36,.12)';
        tag.style.color       = isDone ? '#34D399' : '#FBBF24';
        tag.style.border      = isDone ? '1px solid rgba(52,211,153,.3)' : '1px solid rgba(251,191,36,.25)';
        tag.textContent       = isDone ? '\u2705 InPeace Feito' : '\ud83d\udd50 Pendente';
        tag.setAttribute('onclick', "toggleInPeaceStatus('" + id + "', '" + newStatus + "')");
    }

    const rec = _membrosAll.find(r => r.id === id);
    if (rec) rec.inpeace_status = newStatus;

    const { error } = await sb.from('member_registrations').update({ inpeace_status: newStatus }).eq('id', id);
    if (error) {
        if (typeof hubToast !== 'undefined') hubToast('Erro ao atualizar status: ' + error.message, 'error');
        if (rec) rec.inpeace_status = currentStatus;
        filterMembrosTable();
    } else {
        if (typeof hubToast !== 'undefined') hubToast('Status atualizado: ' + (newStatus === 'done' ? 'InPeace Feito \u2705' : 'Pendente \ud83d\udd50'), 'success');
        const setEl = (elId, val) => { const el = document.getElementById(elId); if (el) el.innerText = val; };
        setEl('membros-kpi-done',    _membrosAll.filter(r => r.inpeace_status === 'done').length);
        setEl('membros-kpi-pending', _membrosAll.filter(r => r.inpeace_status === 'pending').length);
    }
};

window.copyMembrosFormLink = function() {
    const slug = (window._allWorkspaces || []).find(w => w.id === window.currentWorkspaceId)?.slug || '';
    const url = window.location.origin + (slug ? '/' + slug + '/' : '/') + 'novos-membros-form.html';
    navigator.clipboard.writeText(url).then(() => {
        if (typeof hubToast !== 'undefined') hubToast('Link copiado! \ud83c\udfdb\ufe0f', 'success');
    });
};

window.openMembrosForm = function() {
    const slug = (window._allWorkspaces || []).find(w => w.id === window.currentWorkspaceId)?.slug || '';
    const url = window.location.origin + (slug ? '/' + slug + '/' : '/') + 'novos-membros-form.html';
    window.open(url, '_blank');
};

// ═══════════════════════════════════════════════════════════
// PERSON PROFILE DRAWER
// ═══════════════════════════════════════════════════════════

let _pdSource = null; // 'batismo' | 'membros'
let _pdId     = null;
let _pdData   = null;

window.openPersonDrawer = function(source, record) {
    // record may arrive as object or HTML-escaped JSON string
    const r = (typeof record === 'string') ? JSON.parse(record) : record;
    _pdSource = source;
    _pdId     = r.id;
    _pdData   = r;

    // Fill header
    const name = r.name || 'Sem nome';
    const initials = name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
    document.getElementById('pd-avatar').textContent = initials || '?';
    document.getElementById('pd-name-display').textContent = name;
    document.getElementById('pd-source-badge').textContent = source === 'batismo' ? '🙏 Batismo' : '🏛️ Novos Membros';

    // Fill fields
    document.getElementById('pd-name').value  = r.name  || '';
    document.getElementById('pd-email').value = r.email || '';
    document.getElementById('pd-phone').value = r.phone || '';

    // Module-specific fields
    const modFields = document.getElementById('pd-module-fields');
    if (source === 'batismo') {
        modFields.innerHTML = `
        <div>
          <label class="pd-label">Status Batismo</label>
          <select id="pd-batismo-status" class="pd-select">
            <option value="course" ${r.status==='course'?'selected':''} style="background:#0d0f1e;">&#x1F4D6; Em Curso de Batismo</option>
            <option value="will_baptize_today" ${r.status==='will_baptize_today'?'selected':''} style="background:#0d0f1e;">&#x1F550; Ser\xE1 Batizado Hoje</option>
            <option value="baptized" ${r.status==='baptized'?'selected':''} style="background:#0d0f1e;">&#x2705; Batizado</option>
          </select>
        </div>`;
    } else {
        modFields.innerHTML = `
        <div>
          <label class="pd-label">Status InPeace</label>
          <select id="pd-inpeace-status" class="pd-select">
            <option value="pending" ${r.inpeace_status==='pending'?'selected':''} style="background:#0d0f1e;">&#x1F550; Pendente</option>
            <option value="done" ${r.inpeace_status==='done'?'selected':''} style="background:#0d0f1e;">&#x2705; InPeace Feito</option>
          </select>
        </div>`;
    }

    // Reset to perfil tab
    pdSwitchTab('perfil');

    // Show overlay + animate panel
    const overlay = document.getElementById('person-drawer-overlay');
    const panel   = document.getElementById('person-drawer-panel');
    overlay.style.display = 'block';
    overlay.style.opacity = '0';
    panel.style.transform = 'translateX(100%)';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            panel.style.transform = 'translateX(0)';
        });
    });

    // Always reset action buttons (prevents delete confirmation persisting between cards)
    cancelDeletePersonDrawer();

    // Load journey in background
    loadPersonJourney(r.email, r.phone);
};


window.closePersonDrawer = function() {
    const overlay = document.getElementById('person-drawer-overlay');
    const panel   = document.getElementById('person-drawer-panel');
    overlay.style.opacity = '0';
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => { overlay.style.display = 'none'; }, 350);
};

window.pdSwitchTab = function(tab) {
    ['perfil','jornada'].forEach(t => {
        document.getElementById('pd-tab-' + t).style.display = (t === tab) ? 'block' : 'none';
        const btn = document.getElementById('pd-tab-btn-' + t);
        if (btn) {
            btn.style.borderBottomColor = (t === tab) ? '#FFD700' : 'rgba(255,255,255,.1)';
            btn.style.color             = (t === tab) ? '#FFD700' : 'rgba(255,255,255,.4)';
        }
    });
};

async function loadPersonJourney(email, phone) {
    const tl = document.getElementById('pd-journey-timeline');
    if (!tl) return;
    tl.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:.82rem;padding:12px 0;">Carregando jornada...</div>';

    const sb    = window.supabaseClient;
    const wsId  = window.currentWorkspaceId;
    if (!sb || !wsId || !email) { tl.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:.82rem;padding:12px 0;">Email não disponível para busca.</div>'; return; }

    const [leadsRes, startRes, baptismoRes, membrosRes] = await Promise.all([
        sb.from('leads').select('id,name,email,type,created_at').eq('workspace_id', wsId).ilike('email', email).maybeSingle(),
        sb.from('start_participants').select('id,created_at,status').eq('workspace_id', wsId).ilike('email', email).maybeSingle(),
        sb.from('baptism_registrations').select('id,created_at,status').eq('workspace_id', wsId).ilike('email', email).maybeSingle(),
        sb.from('member_registrations').select('id,created_at,inpeace_status').eq('workspace_id', wsId).ilike('email', email).maybeSingle(),
    ]);

    const steps = [
        {
            icon: '👋',
            label: 'Visitante / Lead',
            color: '#60A5FA',
            found: !!leadsRes.data,
            date: leadsRes.data?.created_at,
            detail: leadsRes.data ? (leadsRes.data.type === 'saved' ? 'Salvo' : 'Visitante') : null,
        },
        {
            icon: '🚀',
            label: 'START',
            color: '#A78BFA',
            found: !!startRes.data,
            date: startRes.data?.created_at,
            detail: startRes.data?.status || null,
        },
        {
            icon: '🙏',
            label: 'Batismo',
            color: '#34D399',
            found: !!baptismoRes.data,
            date: baptismoRes.data?.created_at,
            detail: baptismoRes.data?.status === 'baptized' ? 'Batizado ✅' : baptismoRes.data?.status === 'will_baptize_today' ? 'Será Batizado' : baptismoRes.data ? 'Em Curso' : null,
        },
        {
            icon: '🏛️',
            label: 'Novos Membros',
            color: '#FFD700',
            found: !!membrosRes.data,
            date: membrosRes.data?.created_at,
            detail: membrosRes.data?.inpeace_status === 'done' ? 'InPeace Feito ✅' : membrosRes.data ? 'InPeace Pendente 🕐' : null,
        },
    ];

    tl.innerHTML = steps.map((s, i) => {
        const dateStr = s.date ? new Date(s.date).toLocaleDateString('pt-PT') : '';
        const isLast  = i === steps.length - 1;
        return `
        <div style="display:flex;gap:14px;${!isLast ? 'padding-bottom:0;' : ''}">
          <!-- Dot + line -->
          <div style="display:flex;flex-direction:column;align-items:center;width:28px;flex-shrink:0;">
            <div style="width:28px;height:28px;border-radius:50%;background:${s.found ? s.color : 'rgba(255,255,255,.08)'};display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0;box-shadow:${s.found ? '0 0 12px ' + s.color + '55' : 'none'};transition:all .3s;">${s.found ? s.icon : '○'}</div>
            ${!isLast ? `<div style="width:2px;flex:1;min-height:24px;background:${s.found ? 'linear-gradient(' + s.color + ', rgba(255,255,255,.1))' : 'rgba(255,255,255,.06)'};margin:4px 0;"></div>` : ''}
          </div>
          <!-- Content -->
          <div style="padding-bottom:${!isLast ? '20px' : '0'};flex:1;padding-top:4px;">
            <div style="font-weight:700;font-size:.85rem;color:${s.found ? '#fff' : 'rgba(255,255,255,.25)'};">${s.label}</div>
            ${s.found ? `<div style="font-size:.74rem;color:rgba(255,255,255,.4);margin-top:2px;">${dateStr}${s.detail ? ' · ' + s.detail : ''}</div>` : '<div style="font-size:.74rem;color:rgba(255,255,255,.2);margin-top:2px;">Não registrado</div>'}
          </div>
        </div>`;
    }).join('');
}

window.savePersonDrawer = async function() {
    if (!_pdSource || !_pdId) return;
    const sb = window.supabaseClient;

    const updates = {
        name:  document.getElementById('pd-name')?.value  || _pdData.name,
        email: document.getElementById('pd-email')?.value || _pdData.email,
        phone: document.getElementById('pd-phone')?.value || _pdData.phone,
    };

    if (_pdSource === 'batismo') {
        updates.status = document.getElementById('pd-batismo-status')?.value || _pdData.status;
    } else {
        updates.inpeace_status = document.getElementById('pd-inpeace-status')?.value || _pdData.inpeace_status;
    }

    const table = _pdSource === 'batismo' ? 'baptism_registrations' : 'member_registrations';
    const { error } = await sb.from(table).update(updates).eq('id', _pdId);

    if (error) {
        if (typeof hubToast !== 'undefined') hubToast('Erro ao salvar: ' + error.message, 'error');
    } else {
        if (typeof hubToast !== 'undefined') hubToast('Salvo com sucesso! ✅', 'success');
        // Update local cache and re-render
        if (_pdSource === 'batismo') {
            const rec = (window._batismoAll || []).find(r => r.id === _pdId);
            if (rec) Object.assign(rec, updates);
            if (typeof filterBatismoTable === 'function') filterBatismoTable();
        } else {
            const rec = _membrosAll.find(r => r.id === _pdId);
            if (rec) Object.assign(rec, updates);
            if (typeof filterMembrosTable === 'function') filterMembrosTable();
        }
        // Update header name
        document.getElementById('pd-name-display').textContent = updates.name;
        const initials = updates.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
        document.getElementById('pd-avatar').textContent = initials;
        _pdData = { ..._pdData, ...updates };
    }
};

window.deletePersonDrawer = function() {
    if (!_pdSource || !_pdId) return;
    const name = _pdData?.name || 'este registro';

    // Inline confirmation inside the drawer (window.confirm is blocked in production HTTPS)
    const actionsDiv = document.getElementById('pd-actions-row');
    if (!actionsDiv) { confirmDeletePersonDrawer(); return; } // fallback

    actionsDiv.innerHTML = `
      <div style="width:100%;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:12px;padding:14px 16px;">
        <div style="font-size:.82rem;color:#EF4444;font-weight:700;margin-bottom:10px;">🗑️ Excluir ${name}?</div>
        <div style="font-size:.74rem;color:rgba(255,255,255,.4);margin-bottom:14px;">Apenas o registro deste módulo será removido.</div>
        <div style="display:flex;gap:8px;">
          <button onclick="confirmDeletePersonDrawer()" style="flex:1;padding:9px;border:none;border-radius:9px;background:#EF4444;color:#fff;font-weight:700;font-size:.82rem;cursor:pointer;">Sim, excluir</button>
          <button onclick="cancelDeletePersonDrawer()" style="flex:1;padding:9px;border:1px solid rgba(255,255,255,.15);border-radius:9px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.6);font-weight:700;font-size:.82rem;cursor:pointer;">Cancelar</button>
        </div>
      </div>`;
};

window.cancelDeletePersonDrawer = function() {
    const actionsDiv = document.getElementById('pd-actions-row');
    if (actionsDiv) {
        actionsDiv.innerHTML = `
          <button onclick="savePersonDrawer()"
                  style="flex:1;padding:12px 20px;border:none;border-radius:12px;
                         background:linear-gradient(135deg,#FFD700,#FFA000);
                         color:#000;font-weight:800;font-size:.82rem;
                         cursor:pointer;transition:opacity .18s;letter-spacing:.01em;"
                  onmouseover="this.style.opacity='.8'"
                  onmouseout="this.style.opacity='1'">&#x1F4BE; Salvar Altera\xE7\xF5es</button>
          <button onclick="deletePersonDrawer()" title="Excluir registro"
                  style="padding:12px 14px;border:1px solid rgba(239,68,68,.18);border-radius:12px;
                         background:rgba(239,68,68,.05);color:rgba(239,68,68,.7);
                         font-size:.82rem;cursor:pointer;transition:all .2s;"
                  onmouseover="this.style.background='rgba(239,68,68,.14)';this.style.color='#EF4444';this.style.borderColor='rgba(239,68,68,.35)'"
                  onmouseout="this.style.background='rgba(239,68,68,.05)';this.style.color='rgba(239,68,68,.7)';this.style.borderColor='rgba(239,68,68,.18)'">&#x1F5D1;&#xFE0F;</button>`;
        actionsDiv.style.display = 'flex';
    }
};

window.confirmDeletePersonDrawer = async function() {
    if (!_pdSource || !_pdId) return;
    const name = _pdData?.name || 'este registro';
    const sb    = window.supabaseClient;
    const table = _pdSource === 'batismo' ? 'baptism_registrations' : 'member_registrations';
    const { error } = await sb.from(table).delete().eq('id', _pdId);

    if (error) {
        if (typeof hubToast !== 'undefined') hubToast('Erro ao excluir: ' + error.message, 'error');
        cancelDeletePersonDrawer();
    } else {
        if (typeof hubToast !== 'undefined') hubToast(name + ' removido do módulo. 🗑️', 'success');
        if (_pdSource === 'batismo') {
            window._batismoAll = (window._batismoAll || []).filter(r => r.id !== _pdId);
            if (typeof filterBatismoTable === 'function') filterBatismoTable();
        } else {
            _membrosAll = _membrosAll.filter(r => r.id !== _pdId);
            if (typeof filterMembrosTable === 'function') filterMembrosTable();
        }
        closePersonDrawer();
    }
};


// ═══════════════════════════════════════════════════════════════════
// MENU REESTRUTURAÇÃO — Relatórios, Desenvolvedor, Administrativo
// ═══════════════════════════════════════════════════════════════════

// ── Relatórios: no toggle needed (always open), kept as no-op for safety ───
window.toggleRelatoriosMenu = function() { /* menus are now fixed/non-collapsible */ };

// ── Administrativo: no toggle needed (always open) ───────────────────────────
window.toggleAdminMenu = function() { /* menus are now fixed/non-collapsible */ };

// ── Patch switchTab for new tabs ──────────────────────────────────────────────
(function() {
    const _prev = window.switchTab;
    window.switchTab = function(tab) {
        const newTabs = ['relatorios-local','relatorios-regional','relatorios-global',
                         'admin-tarefas','admin-financeiro','desenvolvedor'];
        if (newTabs.includes(tab)) {
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            document.querySelectorAll('#sidebar li').forEach(li => li.classList.remove('active'));
            const viewEl = document.getElementById('view-' + tab);
            if (viewEl) { viewEl.classList.add('active'); viewEl.style.display = ''; }

            // Highlight nav item — for admin-tarefas, highlight #nav-administrativo (the clickable header)
            if (tab === 'admin-tarefas') {
                const navEl = document.getElementById('nav-administrativo');
                if (navEl) navEl.classList.add('active');
            } else {
                const navEl = document.getElementById('nav-' + tab);
                if (navEl) navEl.classList.add('active');
            }
            // Also highlight Relatórios header when on any relatorios-* tab
            if (tab.startsWith('relatorios-')) {
                const relToggle = document.getElementById('nav-relatorios-toggle');
                if (relToggle) relToggle.classList.add('active');
            }

            // Load data
            if (tab === 'relatorios-local')    loadRelatoriosLocal('30d');
            if (tab === 'relatorios-regional') loadRelatoriosRegional('30d', null);
            if (tab === 'relatorios-global')   loadRelatoriosGlobal('30d', null);
            if (tab === 'desenvolvedor')       loadDevPanel();
            return;
        }
        if (_prev) _prev(tab);
    };
})();


// ── Nav visibility: update for new menu ──────────────────────────
(function() {
    const _origApply = window.applyHierarchyNav;
    window.applyHierarchyNav = function(level) {
        if (_origApply) _origApply(level);
        const user = window._currentUser;
        const role = user?.role;
        const RANK = { master_admin:4, pastor_senior:3, church_admin:2, admin:2, pastor:1, lider_ministerio:1, user:0 };
        const rank = RANK[role] || 0;
        // Desenvolvedor — master_admin only
        const navDev = document.getElementById('nav-desenvolvedor');
        if (navDev) navDev.style.display = (role === 'master_admin') ? '' : 'none';
        // Hide old nav-dev if still present
        const oldNavDev = document.getElementById('nav-dev');
        if (oldNavDev) oldNavDev.style.display = 'none';
        // Relatórios submenus
        const navRelRegional = document.getElementById('nav-relatorios-regional');
        const navRelGlobal   = document.getElementById('nav-relatorios-global');
        if (navRelRegional) navRelRegional.style.display = (rank >= 1) ? '' : 'none';
        if (navRelGlobal)   navRelGlobal.style.display   = (role === 'master_admin') ? '' : 'none';
    };
})();

// Also patch initFaseG to set new nav
window.initFaseG = function(user) {
    if (user?.role === 'master_admin') {
        ['nav-desenvolvedor'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        const navDev = document.getElementById('nav-dev');
        if (navDev) navDev.style.display = 'none';
        const navRelGlobal = document.getElementById('nav-relatorios-global');
        if (navRelGlobal) navRelGlobal.style.display = '';
    }
};

// ═══════════════════════════════════════════════════════════════════
// DESENVOLVEDOR — Panel Logic
// ═══════════════════════════════════════════════════════════════════
let _devWorkspacesAll = [];

window.loadDevPanel = async function() {
    const sb = window.supabaseClient;
    if (!sb) return;
    const tbody = document.getElementById('dev-workspaces-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:rgba(255,255,255,.3);">Carregando...</td></tr>';

    try {
        // Parallel fetches
        const [wsRes, regRes, leadsRes, usersRes] = await Promise.all([
            sb.from('workspaces').select('*').order('created_at'),
            sb.from('regionals').select('*'),
            sb.from('leads').select('id, workspace_id, created_at').order('created_at', {ascending:false}),
            sb.from('users').select('id, workspace_id, role'),
        ]);

        const workspaces = wsRes.data || [];
        const regionals  = regRes.data || [];
        const leads      = leadsRes.data || [];
        const users      = usersRes.data || [];

        _devWorkspacesAll = workspaces;

        // Populate regional dropdown in create drawer
        const regSelect = document.getElementById('new-ws-regional');
        if (regSelect) {
            regSelect.innerHTML = regionals.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        }

        // KPIs
        const activeWs = workspaces.filter(w => w.status === 'active').length;
        const totalLeads = leads.length;
        const now = Date.now();
        const thirtyAgo = new Date(now - 30*24*3600*1000).toISOString();
        // (AI messages — from messages table with automated=true, last 30d)
        const { count: aiMsgs } = await sb.from('messages').select('id', {count:'exact',head:true})
            .eq('automated', true).gte('created_at', thirtyAgo);

        const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
        setKpi('dkpi-workspaces', activeWs);
        setKpi('dkpi-regionals', regionals.length);
        setKpi('dkpi-leads', totalLeads.toLocaleString('pt-BR'));
        setKpi('dkpi-users', users.length);
        setKpi('dkpi-ai-msgs', (aiMsgs || 0).toLocaleString('pt-BR'));

        // Build table
        const leadsPerWs = {};
        leads.forEach(l => { leadsPerWs[l.workspace_id] = (leadsPerWs[l.workspace_id]||0)+1; });
        const lastActPerWs = {};
        leads.forEach(l => { if (!lastActPerWs[l.workspace_id]) lastActPerWs[l.workspace_id] = l.created_at; });
        const regionMap = Object.fromEntries(regionals.map(r => [r.id, r.name]));

        renderDevWorkspacesTable(workspaces, leadsPerWs, lastActPerWs, regionMap);

    } catch(e) {
        console.error('loadDevPanel error', e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#EF4444;">Erro ao carregar dados</td></tr>`;
    }
};

window.renderDevWorkspacesTable = function(workspaces, leadsPerWs, lastActPerWs, regionMap) {
    const tbody = document.getElementById('dev-workspaces-tbody');
    if (!tbody) return;
    if (!workspaces.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:rgba(255,255,255,.3);">Nenhum workspace encontrado</td></tr>';
        return;
    }
    const planColor = { free:'#60A5FA', medium:'#F59E0B', premium:'#FFD700' };
    const statusColor = { active:'#34D399', draft:'rgba(255,255,255,.3)', inactive:'#EF4444' };
    tbody.innerHTML = workspaces.map(ws => {
        const modules = ws.modules || [];
        const hasAi = modules.includes('ai_whatsapp');
        const plan = ws.plan || 'free';
        const status = ws.status || 'draft';
        const regional = regionMap[ws.regional_id] || '—';
        const leadsCount = leadsPerWs[ws.id] || 0;
        const lastAct = lastActPerWs[ws.id]
            ? new Date(lastActPerWs[ws.id]).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'})
            : '—';
        const moduleIcons = {visitantes:'👋',consolidados:'🤝',start:'🚀',batismo:'🙏',novos_membros:'🏛️',crie:'C*',ai_whatsapp:'🤖'};
        const modBadges = modules.map(m => `<span title="${m}" style="font-size:.65rem;padding:1px 6px;background:rgba(255,255,255,.06);border-radius:6px;">${moduleIcons[m]||m}</span>`).join('');
        return `<tr style="border-bottom:1px solid rgba(255,255,255,.04);transition:background .15s;" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background=''">
            <td style="padding:12px 16px;font-weight:600;">${ws.name}</td>
            <td style="padding:12px 16px;color:rgba(255,255,255,.5);font-size:.8rem;">${regional}</td>
            <td style="padding:12px 16px;text-align:center;"><span style="padding:2px 10px;border-radius:20px;font-size:.7rem;font-weight:700;background:rgba(0,0,0,.3);color:${planColor[plan]||'#fff'};border:1px solid ${planColor[plan]||'#fff'}30;">${plan.toUpperCase()}</span></td>
            <td style="padding:12px 16px;text-align:center;font-weight:700;">${leadsCount.toLocaleString('pt-BR')}</td>
            <td style="padding:12px 16px;text-align:center;">${modBadges||'—'}</td>
            <td style="padding:12px 16px;text-align:center;">${hasAi ? '<span style="color:#FFD700;font-size:1rem;" title="IA WhatsApp ativo">🤖</span>' : '<span style="color:rgba(255,255,255,.15);">—</span>'}</td>
            <td style="padding:12px 16px;text-align:center;color:rgba(255,255,255,.4);font-size:.8rem;">${lastAct}</td>
            <td style="padding:12px 16px;text-align:center;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor[status]||'gray'};display:inline-block;" title="${status}"></span></td>
        </tr>`;
    }).join('');
};

window.filterDevWorkspaces = function() {
    const q = document.getElementById('dev-ws-search')?.value?.toLowerCase() || '';
    const filtered = _devWorkspacesAll.filter(w => w.name.toLowerCase().includes(q) || (w.slug||'').includes(q));
    renderDevWorkspacesTable(filtered, {}, {}, {});
};

// ── Create Workspace Drawer ───────────────────────────────────────
window.openCreateWorkspaceDrawer = function() {
    const overlay = document.getElementById('dev-ws-drawer-overlay');
    const drawer  = document.getElementById('dev-ws-drawer');
    if (!overlay || !drawer) return;
    overlay.style.display = 'block';
    requestAnimationFrame(() => { drawer.style.transform = 'translateX(0)'; });
};

window.closeCreateWorkspaceDrawer = function() {
    const overlay = document.getElementById('dev-ws-drawer-overlay');
    const drawer  = document.getElementById('dev-ws-drawer');
    if (!drawer) return;
    drawer.style.transform = 'translateX(100%)';
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 380);
};

window.updateWsSlug = function() {
    const name = document.getElementById('new-ws-name')?.value || '';
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
    const slugInput = document.getElementById('new-ws-slug');
    if (slugInput) slugInput.value = slug;
};

window.submitCreateWorkspace = async function() {
    const sb = window.supabaseClient;
    if (!sb) return;
    const btn = document.getElementById('btn-create-ws');
    const feedback = document.getElementById('dev-ws-feedback');

    const name       = document.getElementById('new-ws-name')?.value?.trim();
    const slug       = document.getElementById('new-ws-slug')?.value?.trim();
    const city       = document.getElementById('new-ws-city')?.value?.trim();
    const country    = document.getElementById('new-ws-country')?.value?.trim() || 'Brazil';
    const regionalId = document.getElementById('new-ws-regional')?.value;
    const plan       = document.getElementById('new-ws-plan')?.value || 'premium';
    const adminName  = document.getElementById('new-ws-admin-name')?.value?.trim();
    const adminEmail = document.getElementById('new-ws-admin-email')?.value?.trim();

    const checkedModules = [...document.querySelectorAll('#new-ws-modules-grid input[type=checkbox]:checked')]
        .map(cb => cb.value);

    if (!name || !slug) { alert('Nome e slug são obrigatórios.'); return; }

    if (btn) { btn.textContent = 'Criando...'; btn.disabled = true; }
    if (feedback) { feedback.style.display = 'none'; }

    try {
        // 1. Create workspace
        const { data: ws, error: wsErr } = await sb.from('workspaces').insert({
            name, slug, plan, status: 'active',
            modules: checkedModules,
            regional_id: regionalId || null,
            country: country || 'Brazil',
        }).select().single();

        if (wsErr) throw wsErr;

        // 2. Create admin user via Supabase Admin invite (Edge Function manage-users)
        if (adminEmail) {
            const { data: { session } } = await sb.auth.getSession();
            const token = session?.access_token;
            const fnUrl = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1/manage-users';
            const resp = await fetch(fnUrl, {
                method: 'POST',
                headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    action: 'invite',
                    email: adminEmail,
                    name: adminName || adminEmail.split('@')[0],
                    role: 'church_admin',
                    workspace_id: ws.id,
                    workspace_name: name,
                }),
            });
            const fnData = await resp.json();
            if (!resp.ok) console.warn('manage-users invite warning:', fnData);
        }

        if (feedback) {
            feedback.textContent = `✅ Workspace "${name}" criado com sucesso!${adminEmail ? ` Email de boas-vindas enviado para ${adminEmail}.` : ''}`;
            feedback.style.color = '#34D399';
            feedback.style.display = 'block';
        }
        // Reset form
        ['new-ws-name','new-ws-slug','new-ws-city','new-ws-country','new-ws-admin-name','new-ws-admin-email'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        // Reload table
        setTimeout(() => { loadDevPanel(); closeCreateWorkspaceDrawer(); }, 1800);

    } catch(e) {
        console.error('createWorkspace error', e);
        if (feedback) {
            feedback.textContent = `❌ Erro: ${e.message}`;
            feedback.style.color = '#EF4444';
            feedback.style.display = 'block';
        }
    } finally {
        if (btn) { btn.textContent = '🚀 Criar Workspace'; btn.disabled = false; }
    }
};

// ── Create Regional Modal ─────────────────────────────────────────
window.openCreateRegionalModal = function() {
    const modal = document.getElementById('dev-regional-modal');
    if (modal) { modal.style.display = 'flex'; }
};
window.closeCreateRegionalModal = function() {
    const modal = document.getElementById('dev-regional-modal');
    if (modal) modal.style.display = 'none';
};
window.submitCreateRegional = async function() {
    const sb = window.supabaseClient;
    const name = document.getElementById('new-regional-name')?.value?.trim();
    const slug = document.getElementById('new-regional-slug')?.value?.trim();
    if (!name) { alert('Nome é obrigatório.'); return; }
    const { error } = await sb.from('regionals').insert({ name, slug: slug||name.toLowerCase().replace(/\s+/g,'-') });
    if (error) { alert('Erro: ' + error.message); return; }
    alert(`Regional "${name}" criada!`);
    closeCreateRegionalModal();
    loadDevPanel();
};

// ═══════════════════════════════════════════════════════════════════
// RELATÓRIOS — Data Layer
// ═══════════════════════════════════════════════════════════════════

const _relatoriosPeriod = { local:'30d', regional:'30d', global:'30d' };
const _relatoriosFilters = { regional:[], global:{ regionalIds:[], wsIds:[] } };

function getDateLimit(period) {
    if (!period || period === 'all') return null;
    const num = parseInt(period);
    const unit = period.slice(-1);
    let days;
    if (unit === 'd') days = num;
    else if (unit === 'm') days = num * 30;
    else days = 30;
    return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

window.setRelatoriosPeriod = function(scope, period, btn) {
    _relatoriosPeriod[scope] = period;
    // Update active button
    const container = btn?.parentElement;
    if (container) container.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    // Reload
    if (scope === 'local')    loadRelatoriosLocal(period);
    if (scope === 'regional') loadRelatoriosRegional(period, _relatoriosFilters.regional);
    if (scope === 'global')   loadRelatoriosGlobal(period, _relatoriosFilters.global.regionalIds);
};

// ── Module KPI block builder ──────────────────────────────────────
function buildModuleKpiBlock(moduleId, title, icon, accentColor, kpis) {
    const kpiItems = kpis.map(k =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);">
            <span style="font-size:.8rem;color:rgba(255,255,255,.45);">${k.label}</span>
            <span style="font-size:1rem;font-weight:800;color:${k.color||'#fff'};">${k.value ?? '—'}</span>
        </div>`
    ).join('');
    return `<div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);border-radius:18px;overflow:hidden;transition:border-color .2s;" onmouseover="this.style.borderColor='${accentColor}40'" onmouseout="this.style.borderColor='rgba(255,255,255,.07)'">
        <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;gap:10px;border-left:3px solid ${accentColor};">
            <span style="font-size:1.3rem;">${icon}</span>
            <span style="font-weight:800;font-size:.9rem;">${title}</span>
        </div>
        <div style="padding:10px 20px 16px;">${kpiItems}</div>
    </div>`;
}

// ── Local ─────────────────────────────────────────────────────────
window.loadRelatoriosLocal = async function(period) {
    const sb = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!sb || !wsId) return;
    const grid = document.getElementById('rl-modules-grid');
    if (grid) grid.innerHTML = '<div style="text-align:center;padding:60px;color:rgba(255,255,255,.3);grid-column:1/-1;">Calculando KPIs...</div>';

    const dateLimit = getDateLimit(period || '30d');

    // Get workspace modules
    const { data: ws } = await sb.from('workspaces').select('name,modules').eq('id', wsId).single();
    const modules = ws?.modules || [];
    const wsName = document.getElementById('rl-workspace-name');
    if (wsName) wsName.textContent = ws?.name || '';

    const blocks = [];

    // Visitantes
    if (modules.includes('visitantes')) {
        let q = sb.from('leads').select('id',{count:'exact',head:true}).eq('workspace_id',wsId).eq('type','visitor');
        if (dateLimit) q = q.gte('created_at', dateLimit);
        const {count:total} = await q;
        let qw = sb.from('leads').select('id',{count:'exact',head:true}).eq('workspace_id',wsId).eq('type','visitor')
            .gte('created_at', new Date(Date.now()-7*24*3600*1000).toISOString());
        const {count:week} = await qw;
        blocks.push(buildModuleKpiBlock('visitantes','Visitantes','👋','#60A5FA',[
            {label:'Total no período', value:total||0},
            {label:'Últimos 7 dias', value:week||0, color:'#60A5FA'},
        ]));
    }

    // Consolidação
    if (modules.includes('consolidados')) {
        let q = sb.from('leads').select('id,tasks',{count:'exact'}).eq('workspace_id',wsId).eq('type','saved');
        if (dateLimit) q = q.gte('created_at', dateLimit);
        const {data:saved, count:total} = await q;
        const completed = (saved||[]).filter(l => (l.tasks||[]).every(t=>t.status==='completed')).length;
        blocks.push(buildModuleKpiBlock('consolidados','Consolidação','🤝','#34D399',[
            {label:'Total no período', value:total||0},
            {label:'Concluídos', value:completed, color:'#34D399'},
            {label:'Em andamento', value:(total||0)-completed},
        ]));
    }

    // START
    if (modules.includes('start')) {
        let q = sb.from('start_participants').select('id,completed',{count:'exact'}).eq('workspace_id',wsId);
        if (dateLimit) q = q.gte('created_at', dateLimit);
        const {data:starts, count:total} = await q;
        const completed = (starts||[]).filter(s=>s.completed).length;
        blocks.push(buildModuleKpiBlock('start','START','🚀','#A78BFA',[
            {label:'Participantes', value:total||0},
            {label:'Concluíram', value:completed, color:'#A78BFA'},
        ]));
    }

    // Batismo
    if (modules.includes('batismo')) {
        let q = sb.from('baptism_registrations').select('id,status',{count:'exact'}).eq('workspace_id',wsId);
        if (dateLimit) q = q.gte('created_at', dateLimit);
        const {data:baps, count:total} = await q;
        const baptized = (baps||[]).filter(b=>b.status==='baptized').length;
        const inCourse = (baps||[]).filter(b=>b.status==='course').length;
        blocks.push(buildModuleKpiBlock('batismo','Batismo','🙏','#F59E0B',[
            {label:'Total inscritos', value:total||0},
            {label:'Batizados', value:baptized, color:'#34D399'},
            {label:'Em curso', value:inCourse, color:'#F59E0B'},
        ]));
    }

    // Novos Membros
    if (modules.includes('novos_membros')) {
        let q = sb.from('member_registrations').select('id,inpeace_status',{count:'exact'}).eq('workspace_id',wsId);
        if (dateLimit) q = q.gte('created_at', dateLimit);
        const {data:mems, count:total} = await q;
        const done = (mems||[]).filter(m=>m.inpeace_status==='done').length;
        blocks.push(buildModuleKpiBlock('novos_membros','Novos Membros','🏛️','#F472B6',[
            {label:'Total inscritos', value:total||0},
            {label:'InPeace feito', value:done, color:'#34D399'},
            {label:'Pendente', value:(total||0)-done, color:'#F472B6'},
        ]));
    }

    // CRIE
    if (modules.includes('crie')) {
        let qe = sb.from('crie_events').select('id',{count:'exact',head:true}).eq('workspace_id',wsId);
        if (dateLimit) qe = qe.gte('created_at', dateLimit);
        const {count:events} = await qe;
        let qa = sb.from('crie_attendees').select('id',{count:'exact',head:true}).eq('workspace_id',wsId);
        if (dateLimit) qa = qa.gte('created_at', dateLimit);
        const {count:checkins} = await qa;
        blocks.push(buildModuleKpiBlock('crie','CRIE','C*','#F59E0B',[
            {label:'Eventos', value:events||0},
            {label:'Check-ins', value:checkins||0, color:'#F59E0B'},
        ]));
    }

    if (!blocks.length) {
        grid.innerHTML = '<div style="text-align:center;padding:60px;color:rgba(255,255,255,.3);grid-column:1/-1;">Nenhum módulo habilitado para este workspace.</div>';
        return;
    }
    grid.innerHTML = blocks.join('');
};

// ── Regional ──────────────────────────────────────────────────────
window.loadRelatoriosRegional = async function(period, wsIds) {
    const sb = window.supabaseClient;
    if (!sb) return;
    const user = window._currentUser;
    const grid = document.getElementById('rr-modules-grid');
    const nameEl = document.getElementById('rr-regional-name');
    if (grid) grid.innerHTML = '<div style="text-align:center;padding:60px;color:rgba(255,255,255,.3);grid-column:1/-1;">Calculando...</div>';

    // Find regional — from current workspace
    const { data: wsData } = await sb.from('workspaces').select('regional_id').eq('id', window.currentWorkspaceId).single();
    const regionalId = wsData?.regional_id;
    if (!regionalId) {
        if (grid) grid.innerHTML = '<div style="text-align:center;padding:60px;color:rgba(255,255,255,.3);grid-column:1/-1;">Regional não configurada para este workspace.</div>';
        return;
    }

    // Get all workspaces in this regional
    const { data: allWs } = await sb.from('workspaces').select('id,name,modules').eq('regional_id', regionalId);
    const { data: regional } = await sb.from('regionals').select('name').eq('id', regionalId).single();
    if (nameEl) nameEl.textContent = regional?.name || 'Regional';

    const targetWsIds = (wsIds && wsIds.length) ? wsIds : (allWs||[]).map(w=>w.id);

    // Populate church multi-select
    const churchList = document.getElementById('rr-churches-list');
    if (churchList && !(churchList.children.length)) {
        churchList.innerHTML = (allWs||[]).map(w =>
            `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:.8rem;transition:background .15s;" onmouseover="this.style.background='rgba(255,255,255,.05)'" onmouseout="this.style.background=''">
                <input type="checkbox" value="${w.id}" checked onchange="updateRegionalFilter()" style="accent-color:#818CF8;"> ${w.name}
            </label>`
        ).join('');
    }
    updateChurchFilterCount('rr-churches-list','rr-churches-count');

    const dateLimit = getDateLimit(period||'30d');
    const blocks = await buildAggregateBlocks(sb, targetWsIds, allWs||[], dateLimit);
    if (grid) grid.innerHTML = blocks.join('') || '<div style="text-align:center;padding:60px;color:rgba(255,255,255,.3);grid-column:1/-1;">Nenhum dado no período.</div>';
};

// ── Global ────────────────────────────────────────────────────────
window.loadRelatoriosGlobal = async function(period, regionalIds) {
    const sb = window.supabaseClient;
    if (!sb) return;
    const grid = document.getElementById('rg-modules-grid');
    if (grid) grid.innerHTML = '<div style="text-align:center;padding:60px;color:rgba(255,255,255,.3);grid-column:1/-1;">Calculando...</div>';

    const { data: regionals } = await sb.from('regionals').select('*');
    const { data: allWs }     = await sb.from('workspaces').select('id,name,modules,regional_id');

    // Populate regionals multi-select
    const regList = document.getElementById('rg-regionals-list');
    if (regList && !(regList.children.length)) {
        regList.innerHTML = (regionals||[]).map(r =>
            `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:.8rem;" onmouseover="this.style.background='rgba(255,255,255,.05)'" onmouseout="this.style.background=''">
                <input type="checkbox" value="${r.id}" checked onchange="updateGlobalFilter()" style="accent-color:#34D399;"> ${r.name}
            </label>`
        ).join('');
        updateGlobalFilter();
    }

    const targetRegIds = (regionalIds && regionalIds.length)
        ? regionalIds
        : (regionals||[]).map(r=>r.id);

    const targetWs = (allWs||[]).filter(w => !targetRegIds.length || targetRegIds.includes(w.regional_id));
    const targetWsIds = targetWs.map(w=>w.id);

    // Populate churches list
    const churchList = document.getElementById('rg-churches-list');
    if (churchList) {
        churchList.innerHTML = targetWs.map(w =>
            `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:.8rem;" onmouseover="this.style.background='rgba(255,255,255,.05)'" onmouseout="this.style.background=''">
                <input type="checkbox" value="${w.id}" checked style="accent-color:#34D399;"> ${w.name}
            </label>`
        ).join('');
    }
    updateChurchFilterCount('rg-churches-list','rg-churches-count');
    updateChurchFilterCount('rg-regionals-list','rg-regionals-count');

    const dateLimit = getDateLimit(period||'30d');
    const blocks = await buildAggregateBlocks(sb, targetWsIds, allWs||[], dateLimit);
    if (grid) grid.innerHTML = blocks.join('') || '<div style="text-align:center;padding:60px;color:rgba(255,255,255,.3);grid-column:1/-1;">Nenhum dado no período.</div>';
};

// ── Aggregate blocks helper ───────────────────────────────────────
async function buildAggregateBlocks(sb, wsIds, allWs, dateLimit) {
    if (!wsIds.length) return ['<div style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,.3);padding:40px;">Nenhuma igreja selecionada.</div>'];

    // Detect which modules are present across selection
    const selectedWs = allWs.filter(w => wsIds.includes(w.id));
    const moduleSet = new Set();
    selectedWs.forEach(w => (w.modules||[]).forEach(m => moduleSet.add(m)));

    const blocks = [];

    const countTable = async (table, col, vals, extra={}) => {
        let q = sb.from(table).select('id',{count:'exact',head:true}).in(col, vals);
        if (dateLimit && extra.dateField) q = q.gte(extra.dateField, dateLimit);
        if (extra.filters) Object.entries(extra.filters).forEach(([k,v]) => { q = q.eq(k,v); });
        const {count} = await q;
        return count || 0;
    };

    if (moduleSet.has('visitantes')) {
        const total = await countTable('leads','workspace_id',wsIds,{dateField:'created_at',filters:{type:'visitor'}});
        blocks.push(buildModuleKpiBlock('visitantes','Visitantes','👋','#60A5FA',[{label:'Total no período',value:total}]));
    }
    if (moduleSet.has('consolidados')) {
        const total = await countTable('leads','workspace_id',wsIds,{dateField:'created_at',filters:{type:'saved'}});
        blocks.push(buildModuleKpiBlock('consolidados','Consolidação','🤝','#34D399',[{label:'Total no período',value:total}]));
    }
    if (moduleSet.has('start')) {
        const total = await countTable('start_participants','workspace_id',wsIds,{dateField:'created_at'});
        blocks.push(buildModuleKpiBlock('start','START','🚀','#A78BFA',[{label:'Participantes',value:total}]));
    }
    if (moduleSet.has('batismo')) {
        const total = await countTable('baptism_registrations','workspace_id',wsIds,{dateField:'created_at'});
        blocks.push(buildModuleKpiBlock('batismo','Batismo','🙏','#F59E0B',[{label:'Total inscritos',value:total}]));
    }
    if (moduleSet.has('novos_membros')) {
        const total = await countTable('member_registrations','workspace_id',wsIds,{dateField:'created_at'});
        blocks.push(buildModuleKpiBlock('novos_membros','Novos Membros','🏛️','#F472B6',[{label:'Total inscritos',value:total}]));
    }
    if (moduleSet.has('crie')) {
        const events = await countTable('crie_events','workspace_id',wsIds,{dateField:'created_at'});
        blocks.push(buildModuleKpiBlock('crie','CRIE','C*','#F59E0B',[{label:'Eventos',value:events}]));
    }
    return blocks;
}

// ── Multi-select helpers ──────────────────────────────────────────
window.toggleMultiSelect = function(dropdownId) {
    const dd = document.getElementById(dropdownId);
    if (!dd) return;
    const isOpen = dd.style.display !== 'none';
    // Close all
    document.querySelectorAll('[id$="-dropdown"]').forEach(el => el.style.display = 'none');
    if (!isOpen) dd.style.display = 'block';
};

function updateChurchFilterCount(listId, countId) {
    const list = document.getElementById(listId);
    const countEl = document.getElementById(countId);
    if (!list || !countEl) return;
    const total = list.querySelectorAll('input[type=checkbox]').length;
    const checked = list.querySelectorAll('input[type=checkbox]:checked').length;
    countEl.textContent = (checked === total) ? 'Todas' : `${checked}`;
}

window.updateRegionalFilter = function() {
    updateChurchFilterCount('rr-churches-list','rr-churches-count');
    const checked = [...document.querySelectorAll('#rr-churches-list input:checked')].map(c=>c.value);
    loadRelatoriosRegional(_relatoriosPeriod.regional, checked);
};
window.updateGlobalFilter = function() {
    updateChurchFilterCount('rg-regionals-list','rg-regionals-count');
    const checked = [...document.querySelectorAll('#rg-regionals-list input:checked')].map(c=>c.value);
    loadRelatoriosGlobal(_relatoriosPeriod.global, checked);
};

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('[id$="-dropdown"]') && !e.target.closest('button[onclick*="toggleMultiSelect"]')) {
        document.querySelectorAll('[id$="-dropdown"]').forEach(el => {
            if (el.id === 'ws-dropdown') return; // ws-dropdown is controlled by its own handler via CSS class
            el.style.display = 'none';
        });
    }
});

// ═══════════════════════════════════════════════════════════════════
// SEND REPORT EMAIL
// ═══════════════════════════════════════════════════════════════════
const _SUPABASE_FNURL = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1';

window.sendReportEmail = async function(scope, btnEl) {
    const sb = window.supabaseClient;
    if (!sb) return;

    // Get session
    let session;
    try { ({ data: { session } } = await sb.auth.getSession()); } catch(e) { alert('Erro de sessão'); return; }
    const token = session?.access_token;
    const userEmail = session?.user?.email;
    if (!userEmail) { alert('Não foi possível identificar seu email.'); return; }

    // btn is passed explicitly from onclick to avoid event context issues
    const btn = btnEl || null;
    const origHTML = btn?.innerHTML;
    if (btn) { btn.innerHTML = '⏳ Enviando...'; btn.disabled = true; }

    try {
        const res = await fetch(`${_SUPABASE_FNURL}/send-report-email`, {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                scope,
                workspace_id: window.currentWorkspaceId,
                period: _relatoriosPeriod[scope] || '30d',
                recipient_email: userEmail,
            }),
        });
        const data = await res.json();
        if (res.ok) {
            if (btn) { btn.innerHTML = '✅ Enviado!'; }
            setTimeout(() => { if (btn) { btn.innerHTML = origHTML; btn.disabled = false; } }, 3000);
        } else {
            throw new Error(data.error || 'Falha no envio');
        }
    } catch(e) {
        console.error('sendReportEmail error', e);
        if (btn) { btn.innerHTML = origHTML; btn.disabled = false; }
        // Show inline error instead of alert
        const errEl = document.createElement('div');
        errEl.textContent = '❌ ' + e.message;
        errEl.style.cssText = 'position:fixed;top:24px;right:24px;background:#1e0a0a;border:1px solid #EF4444;color:#EF4444;padding:12px 20px;border-radius:12px;font-size:.85rem;z-index:9999;';
        document.body.appendChild(errEl);
        setTimeout(() => errEl.remove(), 5000);
    }
};



// ═══════════════════════════════════════════════════════════════════
// MÓDULO FINANCEIRO — Financial Reports (Local / Regional / Global)
// ═══════════════════════════════════════════════════════════════════

// ─── Helpers ──────────────────────────────────────────────────────
function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
}

function fmtMoney(val, currency) {
    if (val == null || isNaN(val)) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ' + (currency || '');
}

function periodToDateRange(period) {
    const now = new Date();
    let from = null;
    if (period === '7d')  from = new Date(now - 7  * 86400000);
    if (period === '30d') from = new Date(now - 30 * 86400000);
    if (period === '90d') from = new Date(now - 90 * 86400000);
    if (period === '12m') from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    return { from: from ? from.toISOString().slice(0,10) : null, to: now.toISOString().slice(0,10) };
}

function paymentBadge(status) {
    if (status === 'paid') return '<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:.7rem;font-weight:700;background:rgba(74,222,128,.12);color:#4ADE80;border:1px solid rgba(74,222,128,.2);">✓ Pago</span>';
    return '<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:.7rem;font-weight:700;background:rgba(248,113,113,.1);color:#F87171;border:1px solid rgba(248,113,113,.2);">⏳ Pendente</span>';
}

function msgBtn(reportId, count, isMaster) {
    const unread = count > 0;
    return '<button onclick="openFinMsgDrawer(\'' + reportId + '\',\'' + (isMaster?'master':'local') + '\')" style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:.72rem;font-weight:700;cursor:pointer;background:' + (unread?'rgba(129,140,248,.15)':'rgba(255,255,255,.05)') + ';border:1px solid ' + (unread?'rgba(129,140,248,.35)':'rgba(255,255,255,.1)') + ';color:' + (unread?'#818CF8':'rgba(255,255,255,.35)') + ';">💬' + (unread ? ' ' + count : '') + '</button>';
}

// ─── Exchange Rate (with 60min cache) ─────────────────────────────
async function getExchangeRate(fromCurrency) {
    if (fromCurrency === 'USD') return 1.0;
    const cacheKey = 'fx_' + fromCurrency + '_usd';
    const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
    if (cached.rate && (Date.now() - (cached.ts || 0)) < 3600000) return cached.rate;
    try {
        const resp = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!resp.ok) throw new Error('API error');
        const data = await resp.json();
        const rate = 1 / (data.rates[fromCurrency] || 1);
        localStorage.setItem(cacheKey, JSON.stringify({ rate, ts: Date.now() }));
        return rate;
    } catch(e) {
        console.warn('[FX API]', e);
        const banner = document.getElementById('fin-exchange-warning');
        if (banner) banner.style.display = 'flex';
        try {
            await window.supabaseClient.from('app_logs').insert({
                type: 'bug', title: 'Taxa de câmbio indisponível',
                description: 'Falha ao buscar taxa ' + fromCurrency + '/USD: ' + e.message,
                status: 'pending'
            });
        } catch(_) {}
        return null;
    }
}

// ─── Form Controls ────────────────────────────────────────────────
window.openFinancialForm = async function() {
    const overlay = document.getElementById('fin-form-overlay');
    const drawer  = document.getElementById('fin-form-drawer');
    if (!overlay || !drawer) return;

    const now = new Date();
    const isoWk = getISOWeek(now);
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    document.getElementById('fin-input-week').value  = isoWk.week;
    document.getElementById('fin-input-month').value = now.getMonth() + 1;
    document.getElementById('fin-input-year').value  = isoWk.year;

    const weekLabelEl = document.getElementById('fin-form-week-label');
    if (weekLabelEl) weekLabelEl.textContent = 'Semana ' + isoWk.week + ' — ' + monthNames[now.getMonth()] + ' ' + isoWk.year;

    const wsId = window.currentWorkspaceId;
    if (wsId) {
        try {
            const { data: ws } = await window.supabaseClient.from('workspaces').select('credentials').eq('id', wsId).single();
            const localCur = ws && ws.credentials && ws.credentials.local_currency;
            if (localCur) {
                const sel = document.getElementById('fin-input-currency');
                if (sel) sel.value = localCur;
            }
        } catch(_) {}
    }

    await onFinCurrencyChange();
    ['fin-input-total','fin-input-submitter-name','fin-input-submitter-role','fin-input-notes'].forEach(function(id) {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    recalcFinValues();

    const errEl = document.getElementById('fin-form-error');
    if (errEl) errEl.style.display = 'none';

    overlay.style.display = 'flex';
    requestAnimationFrame(function() { drawer.style.transform = 'translateX(0)'; });
};

window.closeFinancialForm = function() {
    const overlay = document.getElementById('fin-form-overlay');
    const drawer  = document.getElementById('fin-form-drawer');
    if (drawer)  drawer.style.transform  = 'translateX(100%)';
    if (overlay) setTimeout(function() { overlay.style.display = 'none'; }, 360);
};

window.onFinCurrencyChange = async function() {
    const cur = (document.getElementById('fin-input-currency') || {}).value || 'USD';
    const rateInput = document.getElementById('fin-input-rate');
    const indicator = document.getElementById('fin-rate-indicator');
    if (!rateInput) return;
    if (cur === 'USD') {
        rateInput.value = '1.000000';
        rateInput.readOnly = true;
        if (indicator) indicator.textContent = '= US$ 1';
    } else {
        rateInput.value = '';
        rateInput.readOnly = false;
        if (indicator) indicator.textContent = '🔄';
        const rate = await getExchangeRate(cur);
        if (rate) {
            rateInput.value = rate.toFixed(6);
            if (indicator) indicator.textContent = '≈ ' + rate.toFixed(4) + ' USD';
        } else {
            if (indicator) indicator.textContent = '⚠️ manual';
        }
    }
    recalcFinValues();
};

window.recalcFinValues = function() {
    const total    = parseFloat((document.getElementById('fin-input-total') || {}).value) || 0;
    const rate     = parseFloat((document.getElementById('fin-input-rate') || {}).value)  || 1;  // 1 localCur = rate USD
    const currency = (document.getElementById('fin-input-currency') || {}).value || 'USD';
    const regCur   = (document.getElementById('fin-input-regional-currency') || {}).value || '';

    // --- GLOBAL (10%) ---
    const global10Local = total * 0.10;
    const global10Usd   = global10Local * rate;  // convert to USD

    const gUsdEl   = document.getElementById('fin-calc-global-usd');   // primary — USD (big)
    const gLocalEl = document.getElementById('fin-calc-global-local');  // secondary — local (small)

    if (gUsdEl)   gUsdEl.textContent   = 'US$ ' + fmtMoney(global10Usd, '');
    if (gLocalEl) gLocalEl.textContent = fmtMoney(global10Local, currency) + ' em moeda local';

    // --- REGIONAL (5%) ---
    const reg5Local = total * 0.05;  // always in local currency

    const rConvEl  = document.getElementById('fin-calc-regional-converted'); // primary — converted (big)
    const rLocalEl = document.getElementById('fin-calc-regional-local');     // secondary — local (small)
    const rCurEl   = document.getElementById('fin-calc-regional-currency');  // note

    if (!regCur || regCur === currency) {
        // Same currency — no conversion needed
        if (rConvEl)  rConvEl.textContent  = fmtMoney(reg5Local, currency);
        if (rLocalEl) rLocalEl.style.display = 'none';
        if (rCurEl)   rCurEl.textContent    = '';
    } else {
        // Different currency — convert: reg5Local (local) → USD → regCur
        // We have: rate = 1 localCur = rate USD
        // To get regCur amount: need regCur rate from cache
        const regCacheKey = 'fx_' + regCur + '_usd';
        const regCached   = JSON.parse(localStorage.getItem(regCacheKey) || '{}');
        const regRate     = regCached.rate || null; // 1 regCur = regRate USD

        if (rLocalEl) { rLocalEl.style.display = ''; rLocalEl.textContent = fmtMoney(reg5Local, currency) + ' em moeda local'; }

        if (regRate && regRate > 0) {
            const reg5Usd   = reg5Local * rate;          // local → USD
            const reg5RegCur = reg5Usd / regRate;        // USD → regCur
            if (rConvEl) rConvEl.textContent  = fmtMoney(reg5RegCur, regCur);
            if (rCurEl)  rCurEl.textContent   = '≈ via USD (taxa: 1 ' + regCur + ' = ' + regRate.toFixed(4) + ' USD)';
        } else {
            // Rate not cached yet — trigger fetch
            if (rConvEl) rConvEl.textContent  = '⏳ Buscando taxa...';
            if (rCurEl)  rCurEl.textContent   = '';
            getExchangeRate(regCur).then(function(r) {
                if (r) { window.recalcFinValues(); }  // re-run once rate is available
            });
        }
    }
};

// ─── Period filters (Local) ───────────────────────────────────────
var _finPeriod = '7d', _finDateFrom = null, _finDateTo = null;
window.setFinPeriod = function(p, btn) {
    _finPeriod = p; _finDateFrom = null; _finDateTo = null;
    document.querySelectorAll('#fin-period-btns .period-btn').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    loadFinancialReports();
};
window.setFinPeriodCustom = function() {
    _finPeriod = 'custom';
    _finDateFrom = (document.getElementById('fin-date-from') || {}).value || null;
    _finDateTo   = (document.getElementById('fin-date-to') || {}).value   || null;
    document.querySelectorAll('#fin-period-btns .period-btn').forEach(function(b) { b.classList.remove('active'); });
    loadFinancialReports();
};

// ─── Load Financial Reports (Local) ──────────────────────────────
window.loadFinancialReports = async function() {
    const sb   = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!sb || !wsId) return;

    const tbody = document.getElementById('fin-reports-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:rgba(255,255,255,.25);">Carregando...</td></tr>';

    var dateFrom = _finDateFrom, dateTo = _finDateTo;
    if (_finPeriod !== 'custom') { var dr = periodToDateRange(_finPeriod); dateFrom = dr.from; dateTo = dr.to; }

    var query = sb.from('financial_reports').select('*').eq('workspace_id', wsId).order('year', { ascending: false }).order('week_number', { ascending: false });
    if (dateFrom) query = query.gte('submission_date', dateFrom);
    if (dateTo)   query = query.lte('submission_date', dateTo);

    const { data: reports, error } = await query;

    const now = new Date();
    const isoWk = getISOWeek(now);
    const hasThisWeek = reports && reports.some(function(r) { return r.year === isoWk.year && r.week_number === isoWk.week; });
    const weekStatusEl = document.getElementById('fin-week-status');
    if (weekStatusEl) {
        weekStatusEl.textContent = hasThisWeek ? '✓ Semana ' + isoWk.week + ' enviada' : '⚠ Semana ' + isoWk.week + ' pendente';
        weekStatusEl.style.color = hasThisWeek ? '#4ADE80' : '#F87171';
        weekStatusEl.style.background = hasThisWeek ? 'rgba(74,222,128,.08)' : 'rgba(248,113,113,.08)';
        weekStatusEl.style.borderColor = hasThisWeek ? 'rgba(74,222,128,.2)' : 'rgba(248,113,113,.2)';
    }

    if (error || !reports || !reports.length) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:rgba(255,255,255,.2);">Nenhum relatório encontrado para o período selecionado.</td></tr>';
        ['fin-kpi-total','fin-kpi-global','fin-kpi-regional','fin-kpi-count','fin-kpi-pending'].forEach(function(id) {
            var el = document.getElementById(id); if (el) el.textContent = '0';
        });
        return;
    }

    const totIncome  = reports.reduce(function(a,r) { return a + (parseFloat(r.total_income_local) || 0); }, 0);
    const totGlobalUsd = reports.reduce(function(a,r) { return a + (parseFloat(r.global_10pct_usd) || 0); }, 0);
    const totReg5    = reports.reduce(function(a,r) { return a + (parseFloat(r.regional_5pct_local) || 0); }, 0);
    const pendingCount = reports.filter(function(r) { return r.payment_status_global === 'pending' || r.payment_status_regional === 'pending'; }).length;
    const currency = reports[0] ? reports[0].local_currency : '';

    function setText(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }
    setText('fin-kpi-total', fmtMoney(totIncome, currency));
    setText('fin-kpi-global', 'US$ ' + fmtMoney(totGlobalUsd, ''));
    setText('fin-kpi-regional', fmtMoney(totReg5, currency));
    setText('fin-kpi-count', reports.length);
    setText('fin-kpi-pending', pendingCount);

    const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    if (tbody) tbody.innerHTML = reports.map(function(r) {
        return '<tr style="border-bottom:1px solid rgba(255,255,255,.04);" onmouseover="this.style.background=\'rgba(255,255,255,.02)\'" onmouseout="this.style.background=\'\'">'
            + '<td style="padding:12px 16px;font-weight:700;">Sem. ' + r.week_number + '</td>'
            + '<td style="padding:12px 16px;color:rgba(255,255,255,.55);font-size:.78rem;">' + monthNames[(r.month||1)-1] + ' ' + r.year + '</td>'
            + '<td style="padding:12px 16px;text-align:right;font-weight:700;">' + fmtMoney(r.total_income_local, r.local_currency) + '</td>'
            + '<td style="padding:12px 16px;text-align:right;color:#34D399;">' + fmtMoney(r.global_10pct_usd, 'USD') + '</td>'
            + '<td style="padding:12px 16px;text-align:right;color:#818CF8;">' + fmtMoney(r.regional_5pct_local, r.regional_currency || r.local_currency) + '</td>'
            + '<td style="padding:12px 16px;text-align:center;">' + paymentBadge(r.payment_status_global) + '</td>'
            + '<td style="padding:12px 16px;text-align:center;">' + paymentBadge(r.payment_status_regional) + '</td>'
            + '<td style="padding:12px 16px;text-align:center;">' + msgBtn(r.id, r.unread_for_local ? 1 : 0, false) + '</td>'
            + '</tr>';
    }).join('');
};

// ─── Submit Report ────────────────────────────────────────────────
window.submitFinancialReport = async function() {
    const sb   = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!sb || !wsId) return;

    const btn   = document.getElementById('btn-submit-report');
    const errEl = document.getElementById('fin-form-error');
    if (errEl) errEl.style.display = 'none';

    const week   = parseInt((document.getElementById('fin-input-week') || {}).value)  || 0;
    const month  = parseInt((document.getElementById('fin-input-month') || {}).value) || 0;
    const year   = parseInt((document.getElementById('fin-input-year') || {}).value)  || 0;
    const currency = (document.getElementById('fin-input-currency') || {}).value || 'USD';
    const rate   = parseFloat((document.getElementById('fin-input-rate') || {}).value) || 1;
    const total  = parseFloat((document.getElementById('fin-input-total') || {}).value) || 0;
    const submitterName = ((document.getElementById('fin-input-submitter-name') || {}).value || '').trim();
    const submitterRole = ((document.getElementById('fin-input-submitter-role') || {}).value || '').trim();
    const notes = ((document.getElementById('fin-input-notes') || {}).value || '').trim();
    const regCurrency = (document.getElementById('fin-input-regional-currency') || {}).value || '';

    function showErr(msg) { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } }

    if (!submitterName) { showErr('Informe o nome de quem contabilizou.'); return; }
    if (total <= 0) { showErr('O total arrecadado deve ser maior que zero.'); return; }
    if (week < 1 || week > 53) { showErr('Semana inválida.'); return; }

    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const periodLabel = 'Semana ' + week + ' — ' + monthNames[(month||1)-1] + ' ' + year;

    if (btn) { btn.textContent = '⏳ Enviando...'; btn.disabled = true; }

    try {
        const { data: inserted, error: insertErr } = await sb.from('financial_reports').insert({
            workspace_id: wsId, year: year, week_number: week, month: month,
            period_label: periodLabel, local_currency: currency,
            regional_currency: regCurrency || currency, exchange_rate_to_usd: rate,
            total_income_local: total, submitted_by_name: submitterName,
            submitted_by_role: submitterRole || null,
            submission_date: new Date().toISOString().slice(0,10), notes: notes || null,
        }).select().single();

        if (insertErr) {
            if (insertErr.code === '23505') { showErr('Já existe um relatório para esta semana.'); }
            else { showErr('Erro ao salvar: ' + insertErr.message); }
            if (btn) { btn.textContent = '📤 Enviar Relatório'; btn.disabled = false; }
            return;
        }

        sendFinancialSubmissionEmail(inserted).catch(function(e) { console.warn('[fin email]', e); });

        if (btn) btn.textContent = '✅ Enviado!';
        setTimeout(function() {
            window.closeFinancialForm();
            if (btn) { btn.textContent = '📤 Enviar Relatório'; btn.disabled = false; }
            window.loadFinancialReports();
            if (window.showToast) showToast('✅ Relatório financeiro enviado!', 3000);
        }, 1000);
    } catch(e) {
        showErr('Erro inesperado: ' + e.message);
        if (btn) { btn.textContent = '📤 Enviar Relatório'; btn.disabled = false; }
    }
};

async function sendFinancialSubmissionEmail(report) {
    const sb = window.supabaseClient;
    const { data: ws } = await sb.from('workspaces').select('name, credentials, regional_id').eq('id', report.workspace_id).single();
    const churchName = (ws && ws.name) || 'Igreja';
    const SUPABASE_URL = 'https://uyseheucqikgcorrygzc.supabase.co';
    const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';

    const fmt = function(v) { return new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2}).format(v||0); };
    const payload = {
        type: 'submission', church_name: churchName,
        submitter_name: report.submitted_by_name, submitter_role: report.submitted_by_role || '',
        week_label: report.period_label, total_local: fmt(report.total_income_local),
        currency: report.local_currency,
        global_10_local: fmt(report.global_10pct_local),
        global_10_usd: fmt(report.global_10pct_usd),
        regional_5_local: fmt(report.regional_5pct_local),
        exchange_rate: (report.exchange_rate_to_usd || 1).toFixed(6), notes: report.notes || '',
    };

    var regionalEmail = null, regionalName = 'Responsável Regional';
    if (ws && ws.credentials && ws.credentials.financial_contact_email) {
        regionalEmail = ws.credentials.financial_contact_email;
    }
    if (ws && ws.regional_id) {
        const { data: reg } = await sb.from('regionals').select('name, financial_contact_email, global_financial_contact_email').eq('id', ws.regional_id).single();
        if (reg && reg.financial_contact_email) { regionalEmail = reg.financial_contact_email; regionalName = reg.name; }
        if (reg && reg.global_financial_contact_email) {
            fetch(SUPABASE_URL + '/functions/v1/financial-report-email', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
                body: JSON.stringify(Object.assign({}, payload, { recipient_email: reg.global_financial_contact_email, recipient_name: 'Responsável Global' }))
            }).catch(function() {});
        }
    }
    if (regionalEmail) {
        fetch(SUPABASE_URL + '/functions/v1/financial-report-email', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
            body: JSON.stringify(Object.assign({}, payload, { recipient_email: regionalEmail, recipient_name: regionalName }))
        }).catch(function() {});
    }
}

// ─── Message Drawer ───────────────────────────────────────────────
var _finMsgReportId = null, _finMsgRole = 'local';

window.openFinMsgDrawer = async function(reportId, role) {
    _finMsgReportId = reportId; _finMsgRole = role;
    const overlay = document.getElementById('fin-msg-overlay');
    const drawer  = document.getElementById('fin-msg-drawer');
    if (!overlay || !drawer) return;
    overlay.style.display = 'flex';
    requestAnimationFrame(function() { drawer.style.transform = 'translateX(0)'; });
    var unreadField = role === 'local' ? 'unread_for_local' : role === 'regional' ? 'unread_for_regional' : 'unread_for_global';
    var upd = {}; upd[unreadField] = false;
    await window.supabaseClient.from('financial_reports').update(upd).eq('id', reportId);
    await renderFinMessages(reportId, role);
};

window.closeFinMsgDrawer = function() {
    const overlay = document.getElementById('fin-msg-overlay');
    const drawer  = document.getElementById('fin-msg-drawer');
    if (drawer) drawer.style.transform = 'translateX(100%)';
    if (overlay) setTimeout(function() { overlay.style.display = 'none'; }, 340);
};

async function renderFinMessages(reportId, role) {
    const sb   = window.supabaseClient;
    const title = document.getElementById('fin-msg-title');
    const sub   = document.getElementById('fin-msg-subtitle');
    const list  = document.getElementById('fin-msg-list');
    if (list) list.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.3);padding:20px;">Carregando...</div>';
    const { data: report } = await sb.from('financial_reports').select('week_number, year, period_label').eq('id', reportId).single();
    if (title) title.textContent = '💬 ' + (report && report.period_label ? report.period_label : 'Mensagens');
    if (sub)   sub.textContent   = role === 'local' ? 'Conversa com o Regional' : 'Conversa com a Igreja Local';
    const { data: msgs } = await sb.from('financial_messages').select('*').eq('report_id', reportId).order('created_at', { ascending: true });
    if (!msgs || !msgs.length) {
        if (list) list.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.25);padding:20px;font-size:.85rem;">Nenhuma mensagem ainda.</div>';
        return;
    }
    if (list) list.innerHTML = msgs.map(function(m) {
        var isOwn = (role === 'local' && m.direction.startsWith('local')) ||
                    (role === 'regional' && m.direction.startsWith('regional')) ||
                    (role === 'master' && m.direction.startsWith('global'));
        return '<div style="display:flex;justify-content:' + (isOwn?'flex-end':'flex-start') + ';">'
            + '<div style="max-width:80%;background:' + (isOwn?'rgba(255,215,0,.1)':'rgba(255,255,255,.05)') + ';border:1px solid ' + (isOwn?'rgba(255,215,0,.2)':'rgba(255,255,255,.08)') + ';border-radius:14px;padding:12px 16px;">'
            + '<div style="font-size:.68rem;font-weight:700;color:' + (isOwn?'#FFD700':'rgba(255,255,255,.4)') + ';margin-bottom:5px;">' + m.sender_name + '</div>'
            + '<p style="margin:0;font-size:.85rem;line-height:1.5;">' + m.message + '</p>'
            + '<div style="font-size:.65rem;color:rgba(255,255,255,.25);margin-top:5px;text-align:right;">' + new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) + '</div>'
            + '</div></div>';
    }).join('');
}

window.sendFinMessage = async function() {
    const sb  = window.supabaseClient;
    const msgInput = document.getElementById('fin-msg-input');
    const msg = msgInput ? msgInput.value.trim() : '';
    if (!msg || !_finMsgReportId) return;
    const profile = window._profileCache || {};
    const wsId = window.currentWorkspaceId;
    var direction;
    if (_finMsgRole === 'regional') direction = 'regional_to_local';
    else if (_finMsgRole === 'master' || _finMsgRole === 'global') direction = 'global_to_local';
    else direction = 'local_to_regional';
    await sb.from('financial_messages').insert({
        report_id: _finMsgReportId, workspace_id: wsId, direction: direction,
        sender_name: profile.name || 'Responsável', sender_user_id: profile.id || null, message: msg
    });
    var unreadFld = direction.includes('to_local') ? 'unread_for_local' : 'unread_for_regional';
    var upd2 = {}; upd2[unreadFld] = true;
    await sb.from('financial_reports').update(upd2).eq('id', _finMsgReportId);
    if (msgInput) msgInput.value = '';
    sendFinMessageEmail(_finMsgReportId, msg, direction, profile).catch(function() {});
    await renderFinMessages(_finMsgReportId, _finMsgRole);
};

async function sendFinMessageEmail(reportId, message, direction, profile) {
    const sb = window.supabaseClient;
    const { data: report } = await sb.from('financial_reports').select('period_label, workspace_id').eq('id', reportId).single();
    const { data: ws } = await sb.from('workspaces').select('name, credentials, regional_id').eq('id', report.workspace_id).single();
    var recipientEmail = null, recipientName = 'Responsável';
    if (direction.includes('to_local')) {
        recipientEmail = ws && ws.credentials && ws.credentials.financial_contact_email ? ws.credentials.financial_contact_email : null;
        recipientName  = ws ? ws.name : 'Igreja';
    } else if (ws && ws.regional_id) {
        const { data: reg } = await sb.from('regionals').select('financial_contact_email, name').eq('id', ws.regional_id).single();
        recipientEmail = reg && reg.financial_contact_email ? reg.financial_contact_email : null;
        recipientName  = reg ? reg.name : 'Regional';
    }
    if (!recipientEmail) return;
    const SUPABASE_URL = 'https://uyseheucqikgcorrygzc.supabase.co';
    const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';
    fetch(SUPABASE_URL + '/functions/v1/financial-report-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
        body: JSON.stringify({
            type: 'message', recipient_email: recipientEmail, recipient_name: recipientName,
            sender_name: profile.name || 'Responsável', sender_church: ws ? ws.name : 'Igreja',
            message: message, direction: direction,
            week_label: report ? report.period_label : ''
        })
    }).catch(function() {});
}

// ─── REGIONAL VIEW ────────────────────────────────────────────────
window.loadRegionalFinancialView = async function() {
    const sb = window.supabaseClient;
    if (!sb) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data: profile } = await sb.from('users').select('regional_id, role').eq('id', user.id).single();
    if (!profile) return;

    let regionalId = profile.regional_id;

    // master_admin: sem regional_id próprio → deriva do workspace em visualização
    if (!regionalId && (profile.role === 'master_admin') && window.currentWorkspaceId) {
        const { data: wsData } = await sb.from('workspaces').select('regional_id').eq('id', window.currentWorkspaceId).single();
        if (wsData && wsData.regional_id) regionalId = wsData.regional_id;
    }

    if (!regionalId) {
        var tbody = document.getElementById('rr-reports-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">Este workspace não pertence a nenhuma regional.</td></tr>';
        return;
    }

    const { data: regional } = await sb.from('regionals').select('name, financial_contact_email').eq('id', regionalId).single();
    var nameEl = document.getElementById('rr-regional-name');
    if (nameEl && regional) nameEl.textContent = regional.name;
    if (regional && regional.financial_contact_email) {
        var configInput = document.getElementById('rr-config-email');
        if (configInput) configInput.value = regional.financial_contact_email;
    }
    const { data: workspaces } = await sb.from('workspaces').select('id, name').eq('regional_id', regionalId);
    if (!workspaces || !workspaces.length) return;
    window._rrRegionalId = regionalId;
    window._rrWorkspaces = workspaces;
    await loadRRReports();
};

var _rrPeriod = '7d', _rrDateFrom = null, _rrDateTo = null;
window.setRRPeriod = function(p, btn) {
    _rrPeriod = p; _rrDateFrom = null; _rrDateTo = null;
    document.querySelectorAll('#rr-period-btns .period-btn').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    loadRRReports();
};
window.setRRPeriodCustom = function() {
    _rrPeriod = 'custom';
    _rrDateFrom = (document.getElementById('rr-date-from') || {}).value || null;
    _rrDateTo   = (document.getElementById('rr-date-to') || {}).value   || null;
    document.querySelectorAll('#rr-period-btns .period-btn').forEach(function(b) { b.classList.remove('active'); });
    loadRRReports();
};

async function loadRRReports() {
    const sb = window.supabaseClient;
    const workspaces = window._rrWorkspaces || [];
    if (!workspaces.length) return;
    const wsIds = workspaces.map(function(w) { return w.id; });
    const tbody = document.getElementById('rr-reports-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:rgba(255,255,255,.25);">Carregando...</td></tr>';
    var dateFrom = _rrDateFrom, dateTo = _rrDateTo;
    if (_rrPeriod !== 'custom') { var dr = periodToDateRange(_rrPeriod); dateFrom = dr.from; dateTo = dr.to; }
    var query = sb.from('financial_reports').select('*').in('workspace_id', wsIds).order('submission_date', { ascending: false });
    if (dateFrom) query = query.gte('submission_date', dateFrom);
    if (dateTo)   query = query.lte('submission_date', dateTo);
    const { data: reports } = await query;

    const now = new Date(); const isoWk = getISOWeek(now);
    var complianceLabel = document.getElementById('rr-compliance-week-label');
    if (complianceLabel) complianceLabel.textContent = 'Semana ' + isoWk.week + ' — ' + isoWk.year;
    const submitted = workspaces.filter(function(w) {
        return reports && reports.some(function(r) { return r.workspace_id === w.id && r.year === isoWk.year && r.week_number === isoWk.week; });
    });
    const pct = workspaces.length > 0 ? Math.round((submitted.length / workspaces.length) * 100) : 0;
    var bar = document.getElementById('rr-compliance-bar');
    var text = document.getElementById('rr-compliance-text');
    var badge = document.getElementById('rr-compliance-badge');
    var kpiComp = document.getElementById('rr-kpi-compliance');
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = submitted.length + ' de ' + workspaces.length + ' igrejas enviaram esta semana';
    if (badge) {
        badge.textContent = pct + '% compliance';
        badge.style.background = pct >= 80 ? 'rgba(74,222,128,.1)' : pct >= 50 ? 'rgba(245,158,11,.1)' : 'rgba(248,113,113,.1)';
        badge.style.color = pct >= 80 ? '#4ADE80' : pct >= 50 ? '#F59E0B' : '#F87171';
    }
    if (kpiComp) kpiComp.textContent = pct + '%';
    const missing = workspaces.filter(function(w) { return !submitted.find(function(s) { return s.id === w.id; }); });
    var missingBody = document.getElementById('rr-missing-body');
    if (missingBody) missingBody.innerHTML = missing.map(function(w) {
        return '<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:.72rem;font-weight:600;background:rgba(248,113,113,.08);color:#F87171;border:1px solid rgba(248,113,113,.15);">' + w.name + '</span>';
    }).join('');

    const totIncome = (reports || []).reduce(function(a,r) { return a + (parseFloat(r.total_income_local)||0); }, 0);
    const totRep    = (reports || []).reduce(function(a,r) { return a + (parseFloat(r.regional_5pct_local)||0); }, 0);
    const paidCount = (reports || []).filter(function(r) { return r.payment_status_regional === 'paid'; }).length;
    const pendCount = (reports || []).filter(function(r) { return r.payment_status_regional === 'pending'; }).length;
    function setT(id,txt) { var el=document.getElementById(id); if(el) el.textContent=txt; }
    setT('rr-kpi-total', fmtMoney(totIncome, ''));
    setT('rr-kpi-repasse', fmtMoney(totRep, ''));
    setT('rr-kpi-paid', paidCount);
    setT('rr-kpi-pending', pendCount);

    var wsMap = {};
    workspaces.forEach(function(w) { wsMap[w.id] = w.name; });
    // Enrich each report with workspace name and store globally for sort/group
    window._rrAllReports = (reports || []).map(function(r) {
        return Object.assign({}, r, {
            _wsName: wsMap[r.workspace_id] || r.workspace_id,
            // normalise field names for renderRRTable
            regional_amount: parseFloat(r.regional_5pct_local) || 0,
            regional_currency: r.regional_currency || r.local_currency,
            total_amount: parseFloat(r.total_income_local) || 0,
            currency: r.local_currency,
            regional_payment_status: r.payment_status_regional
        });
    });
    renderRRTable();
}

window.toggleRrMissing = function() {
    var el = document.getElementById('rr-missing-list');
    var btn = document.getElementById('btn-rr-missing');
    if (!el) return;
    var open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'block';
    if (btn) btn.textContent = open ? 'Ver pendentes ▼' : 'Ocultar ▲';
};

// ─── GLOBAL VIEW ──────────────────────────────────────────────────
window.loadGlobalFinancialView = async function() {
    const sb = window.supabaseClient;
    if (!sb) return;
    const { data: regionals } = await sb.from('regionals').select('id, name, global_financial_contact_email');
    const { data: workspaces } = await sb.from('workspaces').select('id, name, regional_id').eq('status', 'active');
    window._rgRegionals = regionals || [];
    window._rgWorkspaces = workspaces || [];
    var listEl = document.getElementById('rg-regionals-list');
    if (listEl && regionals) {
        listEl.innerHTML = regionals.map(function(r) {
            return '<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:.82rem;color:rgba(255,255,255,.7);">'
                + '<input type="checkbox" checked data-reg-id="' + r.id + '" onchange="filterRGRegionals()" style="accent-color:#34D399;width:14px;height:14px;">'
                + r.name + '</label>';
        }).join('');
    }
    await loadRGReports();
};

var _rgPeriod = '7d', _rgDateFrom = null, _rgDateTo = null, _rgSelectedRegionals = null;
window.setRGPeriod = function(p, btn) {
    _rgPeriod = p; _rgDateFrom = null; _rgDateTo = null;
    document.querySelectorAll('#view-relatorios-global .period-btn').forEach(function(b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    loadRGReports();
};
window.setRGPeriodCustom = function() {
    _rgPeriod = 'custom';
    _rgDateFrom = (document.getElementById('rg-date-from') || {}).value || null;
    _rgDateTo   = (document.getElementById('rg-date-to') || {}).value   || null;
    document.querySelectorAll('#view-relatorios-global .period-btn').forEach(function(b) { b.classList.remove('active'); });
    loadRGReports();
};
window.filterRGRegionals = function() {
    _rgSelectedRegionals = Array.from(document.querySelectorAll('#rg-regionals-list input[type=checkbox]:checked')).map(function(cb) { return cb.dataset.regId; });
    var countEl = document.getElementById('rg-regionals-count');
    if (countEl) countEl.textContent = _rgSelectedRegionals.length === (window._rgRegionals ? window._rgRegionals.length : 0) ? 'Todas' : _rgSelectedRegionals.length;
    loadRGReports();
};
window.toggleMultiSelect = function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};
document.addEventListener('click', function(e) {
    var dd = document.getElementById('rg-regionals-dropdown');
    if (dd && !dd.contains(e.target) && !e.target.closest('[onclick*="rg-regionals-dropdown"]')) dd.style.display = 'none';
});

async function loadRGReports() {
    const sb = window.supabaseClient;
    const allWorkspaces = window._rgWorkspaces || [];
    const regionals = window._rgRegionals || [];
    var filteredWs = _rgSelectedRegionals ? allWorkspaces.filter(function(w) { return _rgSelectedRegionals.includes(w.regional_id); }) : allWorkspaces;
    var wsIds = filteredWs.map(function(w) { return w.id; });
    if (!wsIds.length) return;
    var tbody = document.getElementById('rg-reports-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:rgba(255,255,255,.25);">Carregando...</td></tr>';
    var dateFrom = _rgDateFrom, dateTo = _rgDateTo;
    if (_rgPeriod !== 'custom') { var dr = periodToDateRange(_rgPeriod); dateFrom = dr.from; dateTo = dr.to; }
    var query = sb.from('financial_reports').select('*').in('workspace_id', wsIds).order('submission_date', { ascending: false });
    if (dateFrom) query = query.gte('submission_date', dateFrom);
    if (dateTo)   query = query.lte('submission_date', dateTo);
    const { data: reports } = await query;

    const totUsd   = (reports || []).reduce(function(a,r) { return a + ((parseFloat(r.global_10pct_usd)||0)/0.10); }, 0);
    const tot10Usd = (reports || []).reduce(function(a,r) { return a + (parseFloat(r.global_10pct_usd)||0); }, 0);
    const pendGlob = (reports || []).filter(function(r) { return r.payment_status_global === 'pending'; }).length;
    function setG(id,txt) { var el=document.getElementById(id); if(el) el.textContent=txt; }
    setG('rg-kpi-total', 'US$ ' + fmtMoney(totUsd, ''));
    setG('rg-kpi-global10', 'US$ ' + fmtMoney(tot10Usd, ''));
    setG('rg-kpi-submitted', (reports || []).length);
    setG('rg-kpi-regionals', regionals.length);
    setG('rg-kpi-pending', pendGlob);

    var wsMap  = {}, regMap = {};
    filteredWs.forEach(function(w) { wsMap[w.id] = w.name; });
    filteredWs.forEach(function(w) {
        var reg = regionals.find(function(r) { return r.id === w.regional_id; });
        regMap[w.id] = reg ? reg.name : '—';
    });
    // Enrich and store globally for sort/group
    window._rgAllReports = (reports || []).map(function(r) {
        var totUSD = (parseFloat(r.global_10pct_usd) || 0) / 0.10;
        return Object.assign({}, r, {
            _wsName: wsMap[r.workspace_id] || r.workspace_id,
            _regName: regMap[r.workspace_id] || '—',
            _totalUSD: totUSD,
            _globalUSD: parseFloat(r.global_10pct_usd) || 0
        });
    });
    renderRGTable();
}

// ─── Toggle Payment Status ────────────────────────────────────────
window.togglePaymentStatus = async function(reportId, scope) {
    const sb = window.supabaseClient;
    var field = scope === 'global' ? 'payment_status_global' : 'payment_status_regional';
    var timeField = scope === 'global' ? 'payment_status_global_at' : 'payment_status_regional_at';
    var upd = {}; upd[field] = 'paid'; upd[timeField] = new Date().toISOString();
    await sb.from('financial_reports').update(upd).eq('id', reportId);
    if (window.showToast) showToast('✅ Status atualizado para PAGO', 2500);
    var activeView = document.querySelector('.view-section.active');
    if (activeView && activeView.id === 'view-rel-financeiro-regional') loadRRReports();
    else if (activeView && activeView.id === 'view-rel-financeiro-global') loadRGReports();
};

// Aliases used by the new rrRow / rgRow buttons
window.markRRPaid = async function(reportId, btnEl) {
    if (btnEl) { btnEl.style.opacity = '.4'; btnEl.style.pointerEvents = 'none'; }
    await window.togglePaymentStatus(reportId, 'regional');
};
window.markRGPaid = async function(reportId, btnEl) {
    if (btnEl) { btnEl.style.opacity = '.4'; btnEl.style.pointerEvents = 'none'; }
    await window.togglePaymentStatus(reportId, 'global');
};

// Chat placeholder stubs (if not already defined)
if (!window.openRRChat) window.openRRChat = function(id) { if (window.showToast) showToast('Chat — em breve', 2000); };
if (!window.openRGChat) window.openRGChat = function(id) { if (window.showToast) showToast('Chat — em breve', 2000); };

// ─── Config Drawers ───────────────────────────────────────────────
window.openRrConfigDrawer  = function() { var o=document.getElementById('rr-config-overlay'); if(o) o.style.display='flex'; };
window.closeRrConfigDrawer = function() { var o=document.getElementById('rr-config-overlay'); if(o) o.style.display='none'; };
window.openRgConfigDrawer  = function() { var o=document.getElementById('rg-config-overlay'); if(o) o.style.display='flex'; };
window.closeRgConfigDrawer = function() { var o=document.getElementById('rg-config-overlay'); if(o) o.style.display='none'; };

window.saveRrConfig = async function() {
    const sb = window.supabaseClient;
    var email = ((document.getElementById('rr-config-email') || {}).value || '').trim();
    var regId = window._rrRegionalId;
    var feedback = document.getElementById('rr-config-feedback');
    if (!regId || !email) return;
    const { error } = await sb.from('regionals').update({ financial_contact_email: email }).eq('id', regId);
    if (feedback) {
        feedback.style.display = 'block';
        feedback.style.color = error ? '#F87171' : '#4ADE80';
        feedback.textContent = error ? '❌ ' + error.message : '✅ Salvo com sucesso!';
        setTimeout(function() { feedback.style.display = 'none'; window.closeRrConfigDrawer(); }, 2000);
    }
};

window.saveRgConfig = async function() {
    const sb = window.supabaseClient;
    var email = ((document.getElementById('rg-config-email') || {}).value || '').trim();
    var feedback = document.getElementById('rg-config-feedback');
    if (!email) return;
    var regionals = window._rgRegionals || [];
    for (var i = 0; i < regionals.length; i++) {
        await sb.from('regionals').update({ global_financial_contact_email: email }).eq('id', regionals[i].id);
    }
    if (feedback) {
        feedback.style.display = 'block';
        feedback.style.color = '#4ADE80';
        feedback.textContent = '✅ Email global salvo!';
        setTimeout(function() { feedback.style.display = 'none'; window.closeRgConfigDrawer(); }, 2000);
    }
};

// ─── Hook into switchTab for lazy loading ─────────────────────────
(function() {
    var _origSwitchTab = window.switchTab;
    window.switchTab = function(tabName) {
        if (_origSwitchTab) _origSwitchTab(tabName);
        // Financial Local
        if (tabName === 'admin-financeiro' && window.loadFinancialReports) window.loadFinancialReports();
        // Financial Regional submenu (unique ID)
        if (tabName === 'rel-financeiro-regional' && window.loadRegionalFinancialView) window.loadRegionalFinancialView();
        // Financial Global submenu (unique ID)
        if (tabName === 'rel-financeiro-global' && window.loadGlobalFinancialView) window.loadGlobalFinancialView();
    };
})();

// ─── Financial Table Sort & Group — Regional (RR) ──────────────────
var _rrSortBy = 'week', _rrSortAsc = false, _rrGroup = 'none';
window._rrAllReports = [];

window.setRRSort = function(field, btnEl) {
    if (_rrSortBy === field) { _rrSortAsc = !_rrSortAsc; }
    else { _rrSortBy = field; _rrSortAsc = (field === 'church'); }
    // Update toolbar buttons
    if (btnEl) {
        document.querySelectorAll('#rr-sort-btns .toolbar-sort-btn').forEach(function(b) { b.classList.remove('active'); });
        btnEl.classList.add('active');
    }
    // Update dir button
    var dirBtn = document.getElementById('rr-dir-btn');
    if (dirBtn) dirBtn.textContent = _rrSortAsc ? '↑ Asc' : '↓ Desc';
    // Update column header arrows
    ['church','week','value','status'].forEach(function(f) {
        var el = document.getElementById('rr-th-' + f);
        if (el) { el.textContent = (f === _rrSortBy) ? (_rrSortAsc ? '↑' : '↓') : ''; el.style.opacity = (f === _rrSortBy) ? '.8' : '.3'; }
    });
    renderRRTable();
};
window.toggleRRSortDir = function() {
    _rrSortAsc = !_rrSortAsc;
    var dirBtn = document.getElementById('rr-dir-btn');
    if (dirBtn) dirBtn.textContent = _rrSortAsc ? '↑ Asc' : '↓ Desc';
    renderRRTable();
};
window.setRRGroup = function(g) { _rrGroup = g; renderRRTable(); };

function sortRRData(data) {
    return data.slice().sort(function(a, b) {
        var av, bv;
        if (_rrSortBy === 'church')  { av = (a._wsName||'').toLowerCase(); bv = (b._wsName||'').toLowerCase(); }
        else if (_rrSortBy === 'value') { av = a.regional_amount || 0; bv = b.regional_amount || 0; }
        else if (_rrSortBy === 'status') { av = (a.regional_payment_status||''); bv = (b.regional_payment_status||''); }
        else { av = a.year * 100 + a.week_number; bv = b.year * 100 + b.week_number; } // week
        if (av < bv) return _rrSortAsc ? -1 : 1;
        if (av > bv) return _rrSortAsc ? 1 : -1;
        return 0;
    });
}

function renderRRTable() {
    var tbody = document.getElementById('rr-reports-tbody');
    if (!tbody) return;
    var data = sortRRData(window._rrAllReports || []);
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:48px;color:rgba(255,255,255,.2);font-size:.82rem;">Nenhum relatório encontrado no período.</td></tr>';
        return;
    }
    var html = '';
    if (_rrGroup !== 'none') {
        var groups = {};
        data.forEach(function(r) {
            var key = _rrGroup === 'church' ? (r._wsName || r.workspace_id) : ('Sem. ' + r.week_number + '/' + r.year);
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        Object.keys(groups).sort().forEach(function(key) {
            html += '<tr><td colspan="7" class="fin-group-header">' + key + ' <span style="color:rgba(255,255,255,.15);font-weight:500;">' + groups[key].length + ' entrada' + (groups[key].length !== 1 ? 's' : '') + '</span></td></tr>';
            groups[key].forEach(function(r) { html += rrRow(r); });
        });
    } else {
        data.forEach(function(r) { html += rrRow(r); });
    }
    tbody.innerHTML = html;
}

function rrRow(r) {
    var isPaid = r.regional_payment_status === 'paid';
    var statusBadge = isPaid
        ? '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;background:rgba(74,222,128,.1);color:#4ADE80;font-size:.72rem;font-weight:700;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Pago</span>'
        : '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;background:rgba(248,113,113,.09);color:#F87171;font-size:.72rem;font-weight:700;cursor:pointer;" onclick="markRRPaid(\'' + r.id + '\',this)"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Pendente</span>';
    var dateStr = r.submission_date ? new Date(r.submission_date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : '—';
    var chatBtn = '<button onclick="openRRChat(\'' + r.id + '\')" title="Abrir chat" style="background:none;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:5px 9px;cursor:pointer;color:rgba(255,255,255,.4);transition:all .2s;" onmouseover="this.style.borderColor=\'rgba(129,140,248,.4)\';this.style.color=\'#818CF8\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,.1)\';this.style.color=\'rgba(255,255,255,.4)\'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>';
    var cur = r.currency || 'BRL';
    var totalFmt = (r.total_amount || 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' ' + cur;
    var repasseFmt = (r.regional_amount || 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' ' + (r.regional_currency || cur);
    return '<tr class="fin-tr">'
        + '<td style="padding:13px 16px;font-weight:600;color:rgba(255,255,255,.85);white-space:nowrap;">' + (r._wsName || r.workspace_id) + '</td>'
        + '<td style="padding:13px 16px;color:rgba(255,255,255,.55);white-space:nowrap;">Sem. ' + r.week_number + ' · ' + r.year + '</td>'
        + '<td style="padding:13px 16px;text-align:right;color:rgba(255,255,255,.7);font-variant-numeric:tabular-nums;white-space:nowrap;">' + totalFmt + '</td>'
        + '<td style="padding:13px 16px;text-align:right;color:rgba(129,140,248,.9);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;">' + repasseFmt + '</td>'
        + '<td style="padding:13px 16px;text-align:center;">' + statusBadge + '</td>'
        + '<td style="padding:13px 16px;text-align:center;color:rgba(255,255,255,.35);font-size:.78rem;white-space:nowrap;">' + dateStr + '</td>'
        + '<td style="padding:13px 16px;text-align:center;">' + chatBtn + '</td>'
        + '</tr>';
}

// Patch loadRRReports to store data and use renderRRTable
var _origLoadRRReports = window.loadRRReports || null;
(function() {
    var _orig = window.loadRRReports;
    if (!_orig) return;
    window.loadRRReports = async function() {
        // Run original to compute KPIs, compliance, etc.
        await _orig.apply(this, arguments);
        // Also patch the tbody rendering
        // (original already renders tbody; we re-render with styling after it runs)
        // But we need _rrAllReports populated first — hook into query
    };
})();

// ─── Financial Table Sort & Group — Global (RG) ────────────────────
var _rgSortBy = 'week', _rgSortAsc = false, _rgGroupBy = 'none';
window._rgAllReports = [];

window.setRGSort = function(field, btnEl) {
    if (_rgSortBy === field) { _rgSortAsc = !_rgSortAsc; }
    else { _rgSortBy = field; _rgSortAsc = (field === 'church' || field === 'regional'); }
    if (btnEl) {
        document.querySelectorAll('#rg-sort-btns .toolbar-sort-btn').forEach(function(b) { b.classList.remove('active'); });
        btnEl.classList.add('active');
    }
    var dirBtn = document.getElementById('rg-dir-btn');
    if (dirBtn) dirBtn.textContent = _rgSortAsc ? '↑ Asc' : '↓ Desc';
    ['church','regional','week','value','status'].forEach(function(f) {
        var el = document.getElementById('rg-th-' + f);
        if (el) { el.textContent = (f === _rgSortBy) ? (_rgSortAsc ? '↑' : '↓') : ''; el.style.opacity = (f === _rgSortBy) ? '.8' : '.3'; }
    });
    renderRGTable();
};
window.toggleRGSortDir = function() {
    _rgSortAsc = !_rgSortAsc;
    var dirBtn = document.getElementById('rg-dir-btn');
    if (dirBtn) dirBtn.textContent = _rgSortAsc ? '↑ Asc' : '↓ Desc';
    renderRGTable();
};
window.setRGGroup = function(g) { _rgGroupBy = g; renderRGTable(); };

function sortRGData(data) {
    return data.slice().sort(function(a, b) {
        var av, bv;
        if (_rgSortBy === 'church') { av = (a._wsName||'').toLowerCase(); bv = (b._wsName||'').toLowerCase(); }
        else if (_rgSortBy === 'regional') { av = (a._regName||'').toLowerCase(); bv = (b._regName||'').toLowerCase(); }
        else if (_rgSortBy === 'value') { av = a._totalUSD || 0; bv = b._totalUSD || 0; }
        else if (_rgSortBy === 'status') { av = a.global_payment_status||''; bv = b.global_payment_status||''; }
        else { av = a.year * 100 + a.week_number; bv = b.year * 100 + b.week_number; }
        if (av < bv) return _rgSortAsc ? -1 : 1;
        if (av > bv) return _rgSortAsc ? 1 : -1;
        return 0;
    });
}

function renderRGTable() {
    var tbody = document.getElementById('rg-reports-tbody');
    if (!tbody) return;
    var data = sortRGData(window._rgAllReports || []);
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:48px;color:rgba(255,255,255,.2);font-size:.82rem;">Nenhum relatório encontrado no período.</td></tr>';
        return;
    }
    var html = '';
    if (_rgGroupBy !== 'none') {
        var groups = {};
        data.forEach(function(r) {
            var key = _rgGroupBy === 'regional' ? (r._regName || 'Sem regional')
                    : _rgGroupBy === 'church'   ? (r._wsName || r.workspace_id)
                    : ('Sem. ' + r.week_number + '/' + r.year);
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        Object.keys(groups).sort().forEach(function(key) {
            var groupTotal = groups[key].reduce(function(s, r) { return s + (r._totalUSD || 0); }, 0);
            html += '<tr><td colspan="7" class="fin-group-header">' + key
                + ' <span style="color:rgba(255,255,255,.15);font-weight:500;">' + groups[key].length + ' relatório' + (groups[key].length !== 1 ? 's' : '')
                + ' · US$ ' + groupTotal.toLocaleString('pt-BR',{minimumFractionDigits:2}) + '</span></td></tr>';
            groups[key].forEach(function(r) { html += rgRow(r); });
        });
    } else {
        data.forEach(function(r) { html += rgRow(r); });
    }
    tbody.innerHTML = html;
}

function rgRow(r) {
    var isPaid = r.global_payment_status === 'paid';
    var statusBadge = isPaid
        ? '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;background:rgba(74,222,128,.1);color:#4ADE80;font-size:.72rem;font-weight:700;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Pago</span>'
        : '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;background:rgba(248,113,113,.09);color:#F87171;font-size:.72rem;font-weight:700;cursor:pointer;" onclick="markRGPaid(\'' + r.id + '\',this)"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Pendente</span>';
    var chatBtn = '<button onclick="openRGChat(\'' + r.id + '\')" title="Abrir chat" style="background:none;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:5px 9px;cursor:pointer;color:rgba(255,255,255,.4);transition:all .2s;" onmouseover="this.style.borderColor=\'rgba(52,211,153,.4)\';this.style.color=\'#34D399\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,.1)\';this.style.color=\'rgba(255,255,255,.4)\'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>';
    var totalUSD = (r._totalUSD || 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    var globalAmt = (r._globalUSD || r.global_amount || 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    return '<tr class="fin-tr">'
        + '<td style="padding:13px 16px;font-weight:600;color:rgba(255,255,255,.85);white-space:nowrap;">' + (r._wsName || r.workspace_id) + '</td>'
        + '<td style="padding:13px 16px;color:rgba(255,255,255,.45);font-size:.8rem;white-space:nowrap;">' + (r._regName || '—') + '</td>'
        + '<td style="padding:13px 16px;color:rgba(255,255,255,.55);white-space:nowrap;">Sem. ' + r.week_number + ' · ' + r.year + '</td>'
        + '<td style="padding:13px 16px;text-align:right;color:#fff;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;">US$ ' + totalUSD + '</td>'
        + '<td style="padding:13px 16px;text-align:right;color:rgba(52,211,153,.9);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;">US$ ' + globalAmt + '</td>'
        + '<td style="padding:13px 16px;text-align:center;">' + statusBadge + '</td>'
        + '<td style="padding:13px 16px;text-align:center;">' + chatBtn + '</td>'
        + '</tr>';
}

// ── MILA AI ASSISTANT LOGIC ──────────────────────────────────────
const milaChatWindow = document.getElementById('mila-chat-window');
const milaInput = document.getElementById('mila-input');

function handleMilaKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMilaMessage();
    }
}

function startNewMilaChat() {
    milaChatWindow.innerHTML = `
        <div style="display: flex; gap: 16px; max-width: 85%;">
            <div style="width: 32px; height: 32px; border-radius: 16px; background: #FFD700; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #111; font-size: 0.8rem;">M</div>
            <div style="background: rgba(255,255,255,0.05); padding: 16px 20px; border-radius: 0 16px 16px 16px; color: #E5E7EB; font-size: 0.95rem; line-height: 1.6; border: 1px solid rgba(255,255,255,0.05);">
                Pra cima Lagoinha! 🚀 Nova conversa iniciada. Estou conectada e pronta para te ajudar com o Workspace. No que posso ser útil?
            </div>
        </div>
    `;
    milaInput.value = '';
    milaInput.style.height = '';
}
let milaHistoryVars = [];

function loadMilaHistory() {
    const saved = localStorage.getItem('milaHistory');
    if (saved) {
        try {
            milaHistoryVars = JSON.parse(saved);
        } catch(e) {}
    }
    
    // Render
    const milaChatWindow = document.getElementById('mila-chat-window');
    if (!milaChatWindow) return;
    
    if (milaHistoryVars.length === 0) {
        // High-end empty state styling
        const emptyStateHTML = `
            <div id="mila-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; color: #FFF; padding-bottom: 40px; animation: fadeIn 0.5s ease-out;">
                <div style="width: 72px; height: 72px; border-radius: 36px; background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), transparent); display: flex; align-items: center; justify-content: center; margin-bottom: 24px; box-shadow: 0 0 40px rgba(255, 215, 0, 0.1);">
                    <div style="width: 56px; height: 56px; border-radius: 28px; background: linear-gradient(135deg, #FFD700, #F59E0B); display: flex; align-items: center; justify-content: center; font-weight: 800; color: #111; font-size: 1.8rem; box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);">M</div>
                </div>
                <h2 style="font-size: 1.8rem; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.5px;">Olá, eu sou a Mila.</h2>
                <p style="color: rgba(255,255,255,0.6); max-width: 400px; line-height: 1.5; margin-bottom: 40px;">Sua assistente integrada ao Zelo Pro. Consulte a base de dados, atualize fluxos ou relate feedbacks.</p>
                
                <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; max-width: 600px;">
                    <div onclick="document.getElementById('mila-input').value = 'Gostaria de relatar uma melhoria no sistema...'; document.getElementById('mila-input').focus();" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 12px 20px; border-radius: 20px; cursor: pointer; transition: all 0.2s; font-size: 0.9rem; color: #E5E7EB;">💡 Sugerir melhoria</div>
                    <div onclick="document.getElementById('mila-input').value = 'Quais são os cultos cadastrados?'; document.getElementById('mila-input').focus();" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 12px 20px; border-radius: 20px; cursor: pointer; transition: all 0.2s; font-size: 0.9rem; color: #E5E7EB;">📅 Consultar horários</div>
                    <div onclick="document.getElementById('mila-input').value = 'Encontrei um erro na página de Relatórios.'; document.getElementById('mila-input').focus();" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 12px 20px; border-radius: 20px; cursor: pointer; transition: all 0.2s; font-size: 0.9rem; color: #E5E7EB;">🐛 Relatar erro</div>
                </div>
            </div>
        `;
        milaChatWindow.innerHTML = emptyStateHTML;
    } else {
        milaChatWindow.innerHTML = ''; // clear for history mapping
    }
    
    milaHistoryVars.forEach(msg => {
        const bubble = document.createElement('div');
        if (msg.role === 'user') {
            bubble.style = "display: flex; max-width: 85%; align-self: flex-end;";
            bubble.innerHTML = `
                <div style="background: #FFD700; padding: 12px 18px; border-radius: 18px 18px 0 18px; color: #111; font-size: 0.95rem; line-height: 1.5; font-weight: 500; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                    ${msg.content.replace(/\n/g, '<br>')}
                </div>
            `;
        } else {
            bubble.style = "display: flex; gap: 12px; max-width: 90%;";
            bubble.innerHTML = `
                <div style="width: 34px; height: 34px; border-radius: 17px; background: linear-gradient(135deg, #FFD700, #F59E0B); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #111; font-size: 0.9rem;">M</div>
                <div style="background: #1a1a1a; padding: 14px 18px; border-radius: 0 18px 18px 18px; color: #E5E7EB; font-size: 0.95rem; line-height: 1.5; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                    ${msg.content.replace(/\n/g, '<br>')}
                </div>
            `;
        }
        milaChatWindow.appendChild(bubble);
    });
    
    milaChatWindow.scrollTop = milaChatWindow.scrollHeight;
}

// ─── Chat ao Vivo — switchTab hook ────────────────────────────────────────────
(function() {
    var _prevSwitchTabChat = window.switchTab;
    var _chatInitialized = false;
    window.switchTab = function(tabName) {
        if (tabName === 'chat-ao-vivo') {
            // Use classList only — no inline style — to be compatible with hub.css:
            // .view-section.active { display: flex !important }
            document.querySelectorAll('.view-section').forEach(function(v) {
                v.classList.remove('active');
            });

            // Ensure container exists in the DOM
            var chatView = document.getElementById('view-chat-ao-vivo');
            if (!chatView) {
                chatView = document.createElement('div');
                chatView.id = 'view-chat-ao-vivo';
                chatView.className = 'view-section';
                chatView.style.cssText = 'padding:0; height:100%; overflow:hidden;';
                var mainArea = document.querySelector('.main') || document.querySelector('main') || document.body;
                mainArea.appendChild(chatView);
            }

            // Activate via classList (.view-section.active { display: flex !important })
            chatView.classList.add('active');

            // Sync nav highlight
            document.querySelectorAll('.nav li').forEach(function(el) { el.classList.remove('active'); });
            var navEl = document.getElementById('nav-chat-ao-vivo');
            if (navEl) navEl.classList.add('active');

            // Lazy init — run only once on first open
            if (!_chatInitialized) {
                _chatInitialized = true;
                if (typeof window.initChatAoVivo === 'function') {
                    window.initChatAoVivo();
                } else {
                    var attempts = 0;
                    var iv = setInterval(function() {
                        attempts++;
                        if (typeof window.initChatAoVivo === 'function') {
                            clearInterval(iv);
                            window.initChatAoVivo();
                        } else if (attempts > 50) {
                            clearInterval(iv);
                            console.error('[Chat] initChatAoVivo never became available');
                        }
                    }, 100);
                }
            }
        } else {
            // Delegate to original switchTab and ensure chat view is hidden
            if (_prevSwitchTabChat) _prevSwitchTabChat(tabName);
            var chatView = document.getElementById('view-chat-ao-vivo');
            if (chatView) chatView.classList.remove('active');
        }
    };
})();

function clearMilaHistory() {
    if(confirm("Tem certeza que deseja apagar o histórico de conversa com a Mila?")) {
        milaHistoryVars = [];
        localStorage.removeItem('milaHistory');
        loadMilaHistory();
    }
}

function startNewMilaChat() {
    clearMilaHistory();
}

// Hook to load history on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    loadMilaHistory();
});

let currentMilaAttachment = null;

function handleMilaAttachment(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        if (typeof hubToast !== 'undefined') hubToast("O arquivo é muito grande. Máximo de 5MB.", "error");
        else alert("Máximo de 5MB.");
        event.target.value = "";
        return;
    }

    currentMilaAttachment = file;
    document.getElementById('mila-attachment-name').innerText = file.name;
    document.getElementById('mila-attachment-preview').style.display = 'flex';
}

function clearMilaAttachment() {
    currentMilaAttachment = null;
    document.getElementById('mila-file-input').value = "";
    document.getElementById('mila-attachment-preview').style.display = 'none';
}

async function sendMilaMessage() {
    const text = milaInput.value.trim();
    if (!text && !currentMilaAttachment) return;

    const fileToUpload = currentMilaAttachment;
    let appendedUrl = "";
    
    // UI Feedback immediately
    const emptyNode = document.getElementById('mila-empty-state');
    if (emptyNode) emptyNode.remove();

    // Append user message to UI
    let userDisplayHtml = text.replace(/\\n/g, '<br>');
    if (fileToUpload) {
        userDisplayHtml += `<br><br><div style="font-size:0.8rem; background:rgba(0,0,0,0.2); padding:4px 8px; border-radius:4px; display:inline-block;">📎 Anexo: ${fileToUpload.name}</div>`;
    }
    
    const userBubble = document.createElement('div');
    userBubble.style = "display: flex; max-width: 85%; align-self: flex-end;";
    userBubble.innerHTML = `
        <div style="background: #FFD700; padding: 12px 18px; border-radius: 18px 18px 0 18px; color: #111; font-size: 0.95rem; line-height: 1.5; font-weight: 500; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
            ${userDisplayHtml || '📎 Arquivo enviado'}
        </div>
    `;
    milaChatWindow.appendChild(userBubble);
    
    milaInput.value = '';
    milaInput.style.height = '';
    clearMilaAttachment(); // Clear immediately for UI
    milaChatWindow.scrollTop = milaChatWindow.scrollHeight;

    // Append thinking indicator
    const thinkingBubble = document.createElement('div');
    thinkingBubble.id = 'mila-thinking';
    thinkingBubble.style = "display: flex; gap: 12px; max-width: 90%;";
    thinkingBubble.innerHTML = `
        <div style="width: 34px; height: 34px; border-radius: 17px; background: linear-gradient(135deg, #FFD700, #F59E0B); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #111; font-size: 0.9rem;">M</div>
        <div style="background: #1a1a1a; padding: 14px 18px; border-radius: 0 18px 18px 18px; color: rgba(255,255,255,0.5); font-size: 0.95rem; line-height: 1.5; box-shadow: 0 2px 5px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 4px;">
            Digitando<span style="opacity:0.5">...</span>
        </div>
    `;
    milaChatWindow.appendChild(thinkingBubble);
    milaChatWindow.scrollTop = milaChatWindow.scrollHeight;

    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) throw new Error("Não autenticado");

        // Upload attachment if exists
        if (fileToUpload) {
            const ext = fileToUpload.name.split('.').pop();
            const filePath = `uploads/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const { data: uploadData, error: uploadError } = await window.supabaseClient.storage
                .from('app_files')
                .upload(filePath, fileToUpload);
            
            if (uploadError) {
                console.error("Upload error", uploadError);
                throw new Error("Falha ao subir anexo.");
            }
            const { data: urlData } = window.supabaseClient.storage.from('app_files').getPublicUrl(filePath);
            appendedUrl = urlData.publicUrl;
        }

        let backendMessage = text || "Aqui está um anexo.";
        if (appendedUrl) {
            backendMessage += `\n\n[ARQUIVO ANEXADO PELO USUÁRIO (Contexto para relatórios/bugs): ${appendedUrl}]`;
        }

        // Save to history (only the text so we don't pollute UI next load)
        milaHistoryVars.push({ role: 'user', content: backendMessage });
        localStorage.setItem('milaHistory', JSON.stringify(milaHistoryVars));

        const response = await fetch('https://uyseheucqikgcorrygzc.supabase.co/functions/v1/mila-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ message: backendMessage, history: milaHistoryVars })
        });
        
        const rawText = await response.text();
        let result;
        try {
            result = JSON.parse(rawText);
        } catch (parseError) {
            console.error("Mila API returned non-JSON:", rawText);
            throw new Error("Resposta inválida do servidor: " + response.status);
        }
        
        document.getElementById('mila-thinking')?.remove();

        const replyBubble = document.createElement('div');
        replyBubble.style = "display: flex; gap: 12px; max-width: 90%;";
        replyBubble.innerHTML = `
            <div style="width: 34px; height: 34px; border-radius: 17px; background: linear-gradient(135deg, #FFD700, #F59E0B); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #111; font-size: 0.9rem;">M</div>
            <div style="background: #1a1a1a; padding: 14px 18px; border-radius: 0 18px 18px 18px; color: #E5E7EB; font-size: 0.95rem; line-height: 1.5; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                ${result.reply ? result.reply.replace(/\\n/g, '<br>') : (result.error ? "Aviso técnico: " + result.error : "Ocorreu um erro ao gerar a resposta.")}
            </div>
        `;
        milaChatWindow.appendChild(replyBubble);

        if (result.reply) {
            milaHistoryVars.push({ role: 'model', content: result.reply });
            localStorage.setItem('milaHistory', JSON.stringify(milaHistoryVars));
        }

    } catch (e) {
        document.getElementById('mila-thinking')?.remove();
        console.error(e);
        if (typeof hubToast !== 'undefined') {
            const errMsg = e.message ? e.message : 'Erro genérico';
            hubToast("Mila Offline: " + errMsg, "error");
        }
    }
    
    // Memory limit: trim to last 30 items
    if (milaHistoryVars.length > 30) {
        milaHistoryVars = milaHistoryVars.slice(-30);
        localStorage.setItem('milaHistory', JSON.stringify(milaHistoryVars));
    }
    
    milaChatWindow.scrollTop = milaChatWindow.scrollHeight;
}
