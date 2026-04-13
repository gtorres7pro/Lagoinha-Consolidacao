/**
 * hub-logs.js — Registro de Atividades da Plataforma
 * Módulo Logs: exibe todas as ações geradas por usuários, automações e forms
 * Padrão: lazy-load via patchSwitchTab. Carrega apenas quando o usuário navega para Logs.
 */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────────────────────
    let _allLogs       = [];
    let _activeFilter  = 'all';
    let _searchQuery   = '';
    let _activePeriod  = 30; // days; 0 = all time
    let _loaded        = false;
    let _loading       = false;

    // ── Category config ───────────────────────────────────────────────────────
    const CATEGORIES = {
        forms:      { label: 'Formulários',  icon: '📋', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
        automacoes: { label: 'Automações',   icon: '🤖', color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
        usuarios:   { label: 'Usuários',     icon: '👤', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
        crie:       { label: 'CRIE',         icon: '🎉', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
        cantina:    { label: 'Cantina',      icon: '🍽️', color: '#FB7185', bg: 'rgba(251,113,133,0.12)' },
        dados:      { label: 'Dados',        icon: '📊', color: '#FFD700', bg: 'rgba(255,215,0,0.12)'  },
        geral:      { label: 'Geral',        icon: '⚡', color: '#8696a0', bg: 'rgba(134,150,160,0.12)'},
    };

    // ── Action → readable description fallback ────────────────────────────────
    const ACTION_LABELS = {
        'lead.form_submitted':           'Formulário de Consolidação preenchido',
        'lead.visitor_form_submitted':   'Formulário de Visitante preenchido',
        'lead.baptism_form_submitted':   'Formulário de Batismo preenchido',
        'lead.created':                  'Lead criado manualmente',
        'lead.updated':                  'Lead atualizado',
        'lead.deleted':                  'Lead removido',
        'report.csv_exported':           'Relatório CSV exportado',
        'user.invited':                  'Convite de equipe enviado',
        'user.status_changed':           'Status de membro alterado',
        'whatsapp.sent_automated':       'Mensagem WhatsApp automática disparada',
        'email.sent':                    'Email enviado',
        'crie.event_created':            'Evento CRIE criado',
        'crie.event_updated':            'Evento CRIE atualizado',
        'crie.member_approved':          'Membro CRIE aprovado',
        'crie.attendee_registered':      'Inscrição em evento CRIE',
        'cantina.order_placed':          'Pedido online recebido',
        'cantina.pos_sale':              'Venda registrada no POS',
        'cantina.cash_closed':           'Caixa fechado',
        'cantina.order_status_changed':  'Status de pedido atualizado',
        'workspace.plan_changed':        'Plano do workspace atualizado',
        'plan.checkout_initiated':       'Checkout de plano iniciado',
        'start.participant_added':       'Participante adicionado ao Start',
        'task.created':                  'Tarefa criada',
        'task.completed':                'Tarefa concluída',
    };

    // ── Helpers ───────────────────────────────────────────────────────────────
    function relativeTime(dateStr) {
        const now   = new Date();
        const date  = new Date(dateStr);
        const diffS = Math.floor((now - date) / 1000);
        if (diffS < 60)           return 'agora mesmo';
        if (diffS < 3600)         return `há ${Math.floor(diffS / 60)} min`;
        if (diffS < 86400)        return `há ${Math.floor(diffS / 3600)}h`;
        if (diffS < 86400 * 2)    return 'ontem';
        if (diffS < 86400 * 7)    return `há ${Math.floor(diffS / 86400)} dias`;
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' });
    }

    function exactTime(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
             + ' às '
             + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function catCfg(cat) {
        return CATEGORIES[cat] || CATEGORIES.geral;
    }

    function getActor(log) {
        if (log.user_email) {
            const name = log.metadata?.user_name || log.user_email.split('@')[0];
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
        return 'Sistema / Form Público';
    }

    function getDescription(log) {
        if (log.description) return log.description;
        return ACTION_LABELS[log.action] || log.action;
    }

    function periodStart(days) {
        if (!days) return null;
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString();
    }

    // ── Data Loading ─────────────────────────────────────────────────────────
    async function loadLogs(force = false) {
        if (_loading) return;
        if (_loaded && !force) { renderFeed(); return; }

        const sb  = window.supabaseClient;
        const wsId = window.currentWorkspaceId;
        if (!sb || !wsId) return;

        _loading = true;
        showSkeleton();

        try {
            let query = sb
                .from('audit_logs')
                .select('*')
                .eq('workspace_id', wsId)
                .order('created_at', { ascending: false })
                .limit(300);

            if (_activePeriod) {
                query = query.gte('created_at', periodStart(_activePeriod));
            }

            const { data, error } = await query;
            if (error) throw error;

            _allLogs = data || [];
            _loaded  = true;
            renderKPIs();
            renderFeed();
        } catch (e) {
            document.getElementById('activity-feed').innerHTML =
                `<div style="padding:40px;text-align:center;color:#ff6b6b;">❌ Erro ao carregar logs: ${e.message}</div>`;
        } finally {
            _loading = false;
        }
    }

    // ── KPIs ─────────────────────────────────────────────────────────────────
    function renderKPIs() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayLogs  = _allLogs.filter(l => new Date(l.created_at) >= today);
        const formLogs   = _allLogs.filter(l => l.category === 'forms');
        const autoLogs   = _allLogs.filter(l => l.category === 'automacoes');

        setEl('logs-kpi-total',  _allLogs.length);
        setEl('logs-kpi-today',  todayLogs.length);
        setEl('logs-kpi-forms',  formLogs.length);
        setEl('logs-kpi-auto',   autoLogs.length);
    }

    function setEl(id, val) {
        const el = document.getElementById(id);
        if (el) { if (typeof hubCountUp === 'function') hubCountUp(el, val, 600); else el.textContent = val; }
    }

    // ── Render Feed ──────────────────────────────────────────────────────────
    function getFiltered() {
        let list = _allLogs;

        // Category filter
        if (_activeFilter !== 'all') {
            list = list.filter(l => (l.category || 'geral') === _activeFilter);
        }

        // Search filter
        if (_searchQuery) {
            const q = _searchQuery.toLowerCase();
            list = list.filter(l => {
                return (
                    getDescription(l).toLowerCase().includes(q) ||
                    getActor(l).toLowerCase().includes(q) ||
                    (l.action || '').toLowerCase().includes(q) ||
                    (l.metadata?.lead_name || '').toLowerCase().includes(q)
                );
            });
        }

        return list;
    }

    function renderFeed() {
        const feed = document.getElementById('activity-feed');
        if (!feed) return;

        const list = getFiltered();

        if (list.length === 0) {
            feed.innerHTML = `
                <div style="padding:60px 40px;text-align:center;color:rgba(255,255,255,0.25);">
                    <div style="font-size:3rem;margin-bottom:16px;">📭</div>
                    <div style="font-size:0.95rem;font-weight:600;">Nenhuma atividade encontrada</div>
                    <div style="font-size:0.8rem;margin-top:6px;">Tente ajustar os filtros ou o período selecionado</div>
                </div>`;
            return;
        }

        // Group by day
        const grouped = {};
        list.forEach(log => {
            const day = new Date(log.created_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(log);
        });

        feed.innerHTML = Object.entries(grouped).map(([day, logs]) => `
            <div class="logs-day-group">
                <div class="logs-day-header">${day.charAt(0).toUpperCase() + day.slice(1)}</div>
                <div class="logs-timeline">
                    ${logs.map(log => renderLogItem(log)).join('')}
                </div>
            </div>
        `).join('');
    }

    function renderLogItem(log) {
        const cfg   = catCfg(log.category || 'geral');
        const actor = getActor(log);
        const desc  = getDescription(log);
        const extra = log.metadata?.lead_name || log.metadata?.event_name
                    || log.metadata?.order_number || log.metadata?.user_email || '';
        const time  = relativeTime(log.created_at);
        const exact = exactTime(log.created_at);

        return `
            <div class="log-entry" title="${exact}">
                <div class="log-entry-dot" style="background:${cfg.color};box-shadow:0 0 8px ${cfg.color}66;"></div>
                <div class="log-entry-body">
                    <div class="log-entry-top">
                        <span class="log-cat-badge" style="background:${cfg.bg};color:${cfg.color};">
                            ${cfg.icon} ${cfg.label}
                        </span>
                        <span class="log-desc">${desc}${extra ? ` — <span style="color:rgba(255,255,255,0.7)">${extra}</span>` : ''}</span>
                    </div>
                    <div class="log-entry-meta">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        ${actor}
                        <span style="color:rgba(255,255,255,0.15)">·</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${time}
                    </div>
                </div>
            </div>`;
    }

    // ── Skeleton ──────────────────────────────────────────────────────────────
    function showSkeleton() {
        const feed = document.getElementById('activity-feed');
        if (!feed) return;
        feed.innerHTML = Array.from({ length: 8 }, () => `
            <div style="display:flex;align-items:flex-start;gap:14px;padding:14px 0;">
                <div class="hub-skeleton" style="width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:5px;"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
                    <div class="hub-skeleton" style="width:60%;height:14px;border-radius:6px;"></div>
                    <div class="hub-skeleton" style="width:35%;height:11px;border-radius:6px;"></div>
                </div>
            </div>`).join('');
    }

    // ── Filter buttons ────────────────────────────────────────────────────────
    window.setLogsFilter = function (filter) {
        _activeFilter = filter;
        document.querySelectorAll('.log-filter-btn').forEach(btn => {
            const active = btn.dataset.filter === filter;
            btn.style.background     = active ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.04)';
            btn.style.borderColor    = active ? 'var(--accent)'        : 'rgba(255,255,255,0.1)';
            btn.style.color          = active ? 'var(--accent)'        : 'rgba(255,255,255,0.55)';
            btn.style.fontWeight     = active ? '700'                  : '500';
        });
        renderFeed();
    };

    window.setLogsPeriod = function (days, btn) {
        _activePeriod = days;
        _loaded = false;
        document.querySelectorAll('.logs-period-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        loadLogs();
    };

    window.refreshLogs = function () {
        _loaded = false;
        loadLogs();
    };

    window.onLogsSearch = function (val) {
        _searchQuery = val.trim();
        renderFeed();
    };

    // ── Inject CSS ────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('hub-logs-style')) return;
        const style = document.createElement('style');
        style.id = 'hub-logs-style';
        style.textContent = `
            #view-logs .logs-toolbar {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 0 32px 20px;
                flex-wrap: wrap;
            }
            #view-logs .log-filter-btn {
                padding: 6px 14px;
                border-radius: 10px;
                border: 1px solid rgba(255,255,255,0.1);
                background: rgba(255,255,255,0.04);
                color: rgba(255,255,255,0.55);
                font-size: 0.78rem;
                font-weight: 500;
                cursor: pointer;
                font-family: var(--font, 'Outfit', sans-serif);
                transition: all 0.18s ease;
                white-space: nowrap;
            }
            #view-logs .log-filter-btn:hover {
                background: rgba(255,255,255,0.08);
                color: rgba(255,255,255,0.85);
            }
            #view-logs .logs-search {
                margin-left: auto;
                display: flex;
                align-items: center;
                gap: 8px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 10px;
                padding: 7px 12px;
            }
            #view-logs .logs-search input {
                background: none;
                border: none;
                outline: none;
                color: #fff;
                font-size: 0.82rem;
                font-family: var(--font, 'Outfit', sans-serif);
                width: 180px;
            }
            #view-logs .logs-search input::placeholder { color: rgba(255,255,255,0.3); }

            #view-logs .logs-period-row {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 0 32px 20px;
            }
            #view-logs .logs-period-btn {
                padding: 5px 14px;
                border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.08);
                background: rgba(255,255,255,0.03);
                color: rgba(255,255,255,0.4);
                font-size: 0.75rem;
                font-weight: 600;
                cursor: pointer;
                font-family: var(--font, 'Outfit', sans-serif);
                transition: all 0.15s;
            }
            #view-logs .logs-period-btn.active,
            #view-logs .logs-period-btn:hover {
                background: rgba(255,215,0,0.1);
                border-color: rgba(255,215,0,0.3);
                color: #FFD700;
            }

            #activity-feed {
                padding: 0 32px 48px;
            }
            .logs-day-group { margin-bottom: 28px; }
            .logs-day-header {
                font-size: 0.72rem;
                font-weight: 700;
                color: rgba(255,255,255,0.3);
                text-transform: uppercase;
                letter-spacing: 0.07em;
                padding: 0 0 12px;
                border-bottom: 1px solid rgba(255,255,255,0.06);
                margin-bottom: 2px;
            }
            .logs-timeline {
                position: relative;
                padding-left: 20px;
            }
            .logs-timeline::before {
                content: '';
                position: absolute;
                left: 4px;
                top: 12px;
                bottom: 12px;
                width: 1px;
                background: rgba(255,255,255,0.07);
            }
            .log-entry {
                display: flex;
                align-items: flex-start;
                gap: 14px;
                padding: 12px 0;
                cursor: default;
                transition: background 0.15s;
                border-radius: 8px;
            }
            .log-entry:hover { background: rgba(255,255,255,0.025); }
            .log-entry-dot {
                width: 9px;
                height: 9px;
                border-radius: 50%;
                flex-shrink: 0;
                margin-top: 5px;
                position: relative;
                z-index: 1;
                left: -24px;
            }
            .log-entry-body {
                flex: 1;
                margin-left: -14px;
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            .log-entry-top {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .log-cat-badge {
                font-size: 0.7rem;
                font-weight: 700;
                padding: 2px 8px;
                border-radius: 6px;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .log-desc {
                font-size: 0.85rem;
                color: rgba(255,255,255,0.85);
                font-weight: 500;
            }
            .log-entry-meta {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 0.75rem;
                color: rgba(255,255,255,0.35);
            }
            .log-entry-meta svg { flex-shrink: 0; }

            @media (max-width: 768px) {
                #activity-feed { padding: 0 16px 48px; }
                #view-logs .logs-toolbar { padding: 0 16px 16px; }
                #view-logs .logs-period-row { padding: 0 16px 16px; }
                #view-logs .logs-search { display: none; }
                .log-desc { font-size: 0.82rem; }
            }
        `;
        document.head.appendChild(style);
    }

    // ── Patch switchTab ───────────────────────────────────────────────────────
    (function patchSwitchTab() {
        const _orig = window.switchTab;
        window.switchTab = function (tabName) {
            _orig(tabName);
            if (tabName === 'logs') {
                injectStyles();
                // Reset and load fresh on every visit
                _loaded  = false;
                _loading = false;
                loadLogs();
            }
        };
    })();

    // ── Expose logAudit globally ──────────────────────────────────────────────
    // This is the central function called throughout the platform to record actions
    window.logAudit = async function (action, options = {}) {
        try {
            const sb    = window.supabaseClient;
            const wsId  = window.currentWorkspaceId;
            if (!sb) return;

            const { data: { session } } = await sb.auth.getSession();
            const userId    = session?.user?.id    || null;
            const userEmail = session?.user?.email || null;

            const {
                description = null,
                category    = 'geral',
                entity_type = null,
                entity_id   = null,
                metadata    = {},
            } = options;

            // Fire and forget — don't block UX for logging
            sb.from('audit_logs').insert({
                workspace_id: wsId || null,
                user_id:      userId,
                user_email:   userEmail,
                action,
                description,
                category,
                entity_type,
                entity_id:    entity_id ? String(entity_id) : null,
                metadata,
            }).then(({ error }) => {
                if (error) console.warn('[logAudit] insert error:', error.message);
            });
        } catch (e) {
            // Never block UX for logging errors
            console.warn('[logAudit] error:', e.message);
        }
    };

    // ── logAudit for public/anonymous forms ────────────────────────────────
    // Used directly in public HTML pages (no auth session)
    window.logAuditPublic = async function (action, options = {}, supabaseClient, workspaceId) {
        try {
            const sb = supabaseClient;
            if (!sb) return;

            const {
                description = null,
                category    = 'forms',
                entity_type = null,
                entity_id   = null,
                metadata    = {},
            } = options;

            await sb.from('audit_logs').insert({
                workspace_id: workspaceId || null,
                user_id:      null,
                user_email:   null,
                action,
                description,
                category,
                entity_type,
                entity_id:    entity_id ? String(entity_id) : null,
                metadata,
            });
        } catch (e) {
            console.warn('[logAuditPublic] error:', e.message);
        }
    };

})();
