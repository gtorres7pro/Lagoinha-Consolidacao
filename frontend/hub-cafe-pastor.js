// hub-cafe-pastor.js — Café com Pastor — Admin Module (v6-cal)
// ─ Fixes: correct supabase client ref, first-load agenda blank,
//   manual appt modal, photo upload, availability UI, config save + slug, no QR

(function () {
    'use strict';

    /* ─── SUPABASE CLIENT ─────────────────────────────────────────────── */
    // hub-dashboard.js initialises as window.supabaseClient
    var _sb = function() { return window.supabaseClient || window.supabase; };

    /* ─── STATE ─────────────────────────────────────────────────────────── */
    var _cpConfig    = {};
    var _cpPastors   = [];
    var _cpAppts     = [];
    var _cpPanel     = 'agenda';
    var _cpLoaded    = false;
    var _cpWsSlug    = null;
    var _cpApptFilter = { pastor: '', status: '', period: '30' };

    /* ─── HELPERS ───────────────────────────────────────────────────────── */
    var $   = function(id) { return document.getElementById(id); };
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

    var getWsId = function() {
        return window._currentWsId || window.currentWorkspaceId || (window._currentWorkspace && window._currentWorkspace.id);
    };

    var fmtDT = function(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    };

    var STATUS = {
        pending:   { label:'Pendente',   color:'#FBBF24' },
        confirmed: { label:'Confirmado', color:'#60A5FA' },
        completed: { label:'Concluído',  color:'#4ADE80' },
        cancelled: { label:'Cancelado',  color:'#F87171' },
        no_show:   { label:'Não veio',   color:'#A78BFA' },
    };

    var DAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    var DAYS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

    /* ── CSS snippets used throughout ── */
    var CSS_CARD  = 'background:var(--bg-card-solid,#131318);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:12px;padding:16px;';
    var CSS_INPUT = 'background:var(--bg-input,rgba(0,0,0,0.06)) !important;border:1px solid var(--border,rgba(212,165,116,.25)) !important;border-radius:8px !important;'
                  + 'padding:9px 12px !important;color:var(--text,#f0ede8) !important;font-family:inherit;font-size:.88rem !important;'
                  + 'width:100%;outline:none;box-sizing:border-box;';
    var CSS_SELECT = '-webkit-appearance:none;-moz-appearance:none;appearance:none;'
                   + 'background:var(--bg-input,rgba(0,0,0,0.06)) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23d4a574\'/%3E%3C/svg%3E") no-repeat right 10px center/10px 6px !important;'
                   + 'border:1px solid rgba(212,165,116,.25) !important;border-radius:8px !important;'
                   + 'padding:9px 30px 9px 12px !important;color:var(--text,#f0ede8) !important;'
                   + 'font-family:inherit;font-size:.88rem !important;width:100%;outline:none;box-sizing:border-box;cursor:pointer;';
    var CSS_BTN_GOLD = 'background:#d4a574;color:#111;border:none;padding:10px 18px;border-radius:8px;'
                     + 'font-weight:700;font-size:.88rem;cursor:pointer;';
    var CSS_BTN_GHOST = 'background:var(--bg-card,rgba(0,0,0,.035));color:var(--text);border:1px solid var(--border);'
                      + 'padding:10px 18px;border-radius:8px;font-weight:600;font-size:.88rem;cursor:pointer;';

    var lbl = function(txt, sub) {
        return '<label style="display:block;font-size:.8rem;font-weight:600;color:#c8a87c;margin-bottom:6px;">'
             + esc(txt) + (sub ? '<span style="font-weight:400;color:rgba(255,255,255,.3);"> ' + esc(sub) + '</span>' : '')
             + '</label>';
    };

    var empty = function(msg) {
        return '<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,.35);font-size:.9rem;">' + esc(msg) + '</div>';
    };

    var errMsg = function(msg) {
        return '<div style="background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);color:#f87171;'
             + 'border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:.85rem;">' + esc(msg) + '</div>';
    };

    var badge = function(status) {
        var s = STATUS[status] || {label:status, color:'#aaa'};
        return '<span style="background:' + s.color + '22;color:' + s.color + ';border:1px solid ' + s.color + '44;'
             + 'border-radius:20px;padding:2px 10px;font-size:.72rem;font-weight:600;">' + s.label + '</span>';
    };

    var toast = function(msg, type) {
        if (window.hubToast) window.hubToast(msg, type || 'info');
    };

    /* ─── Inject global CSS for Chrome macOS form elements ──────────── */
    (function() {
        var styleId = 'cp-module-styles';
        if (!document.getElementById(styleId)) {
            var s = document.createElement('style');
            s.id = styleId;
            s.textContent = [
                '.cp-cal-event { cursor: pointer; transition: opacity .15s; }',
                '.cp-cal-event:hover { opacity: .8; }',
                '.cp-table-row:hover td { background: rgba(255,255,255,.03); }',
                '#cp-modal-overlay input, #cp-modal-overlay textarea {',
                '  background: var(--bg-input,rgba(0,0,0,0.06)) !important; color: var(--text,#f0ede8) !important;',
                '  border: 1px solid rgba(212,165,116,.3) !important;',
                '  border-radius: 8px !important; font-size: .88rem !important;',
                '}',
                '#cp-modal-overlay input:focus, #cp-modal-overlay textarea:focus {',
                '  border-color: rgba(212,165,116,.7) !important;',
                '  box-shadow: 0 0 0 3px rgba(212,165,116,.12) !important;',
                '}',
                '#cp-modal-overlay select {',
                '  background-color: var(--bg-input,rgba(0,0,0,0.06)) !important; color: var(--text,#f0ede8) !important;',
                '  border: 1px solid rgba(212,165,116,.3) !important;',
                '  border-radius: 8px !important; font-size: .88rem !important;',
                '  -webkit-appearance: none !important; appearance: none !important;',
                '  background-image: url("data:image/svg+xml,%3Csvg xmlns=\'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23d4a574\'/%3E%3C%2Fsvg%3E") !important;',
                '  background-repeat: no-repeat !important;',
                '  background-position: right 10px center !important;',
                '  background-size: 10px 6px !important;',
                '  padding-right: 32px !important;',
                '}',
                '#cp-modal-overlay select:focus {',
                '  border-color: rgba(212,165,116,.7) !important;',
                '  outline: none !important;',
                '}',
                '#cp-modal-overlay select option {',
                '  background: var(--bg-card-solid,#131318) !important; color: var(--text,#f0ede8) !important;',
                '}',
                '.cp-filter-select {',

                '  background-color: var(--bg-input,rgba(0,0,0,0.06)) !important; color: var(--text,#f0ede8) !important;',
                '  border: 1px solid rgba(255,255,255,.12) !important;',
                '  border-radius: 8px !important; font-size: .82rem !important;',
                '  padding: 7px 28px 7px 10px !important;',
                '  -webkit-appearance: none !important; appearance: none !important;',
                '  background-image: url("data:image/svg+xml,%3Csvg xmlns=\'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23aaa\'/%3E%3C%2Fsvg%3E") !important;',
                '  background-repeat: no-repeat !important;',
                '  background-position: right 8px center !important;',
                '  background-size: 9px 5px !important;',
                '  cursor: pointer;',
                '}',
                '.cp-filter-select option { background: var(--bg-card-solid,#131318) !important; color: var(--text,#f0ede8) !important; }',
                '.cp-table-row { border-bottom: 1px solid rgba(255,255,255,.05); }',
                '.cp-table-row:hover { background: rgba(212,165,116,.04) !important; }',
            ].join('\n');
            document.head.appendChild(s);
        }
    })();
    /* ═══════════════════════════════════════════════════════════════════
       MAIN ENTRY
    ═══════════════════════════════════════════════════════════════════ */
    window._cpLoadData = async function () {
        var wsId = getWsId();
        if (!wsId) { console.warn('[CP] No workspace ID'); return; }
        window._currentWsId = wsId;

        // Show skeleton immediately so tabs +sub-tabs respond
        _cpRenderAgendaSkeleton();

        try {
            var sb = _sb();

            // 1. Config
            var r1 = await sb.from('cafe_pastor_config').select('*')
                .eq('workspace_id', wsId).maybeSingle();
            _cpConfig = r1.data || {};

            // 2. Pastors
            var r2 = await sb.from('cafe_pastor_pastors')
                .select('*').eq('workspace_id', wsId).order('display_name');
            _cpPastors = r2.data || [];

            // 3. Appointments (last 90d + future)
            var since = new Date(Date.now() - 90*24*60*60*1000).toISOString();
            var r3 = await sb.from('cafe_pastor_appointments').select('*')
                .eq('workspace_id', wsId).gte('scheduled_at', since)
                .order('scheduled_at', { ascending: false });
            _cpAppts = r3.data || [];

            // 4. Fetch workspace slug for public link
            var r4 = await sb.from('workspaces').select('slug').eq('id', wsId).maybeSingle();
            _cpWsSlug = (r4.data && r4.data.slug) || wsId;

            _cpLoaded = true;
            window.cpSwitchPanel(_cpPanel);
        } catch(err) {
            console.error('[CP] load error:', err);
            var c = $('cp-panels-container');
            if (c) c.innerHTML = errMsg('Erro ao carregar dados: ' + (err.message || err));
        }
    };

    /* ═══════════════════════════════════════════════════════════════════
       INTERNAL TAB SWITCHER
    ═══════════════════════════════════════════════════════════════════ */
    window.cpSwitchPanel = function(panel) {
        _cpPanel = panel;
        ['agenda','pastores','config','pessoas'].forEach(function(p) {
            var b = $('cp-tab-' + p);
            if (!b) return;
            if (p === panel) {
                b.style.background = 'rgba(212,165,116,.15)';
                b.style.color = '#d4a574';
                b.style.border = '1px solid rgba(212,165,116,.4)';
                b.style.fontWeight = '700';
            } else {
                b.style.background = 'transparent';
                b.style.color = 'var(--text-muted, #6b7280)';
                b.style.border = '1px solid transparent';
                b.style.fontWeight = '600';
            }
        });

        if (!_cpLoaded) {
            // Data not yet ready — just trigger load
            if (!_cpLoadData._running) {
                _cpLoadData._running = true;
                window._cpLoadData().finally(function() { _cpLoadData._running = false; });
            }
            return;
        }

        if (panel === 'agenda')        _cpRenderAgenda();
        else if (panel === 'pastores') _cpRenderPastores();
        else if (panel === 'config')   _cpRenderConfig();
        else if (panel === 'pessoas')  _cpRenderPessoas();
    };

    /* ═══════════════════════════════════════════════════════════════════
       PANEL 1 — AGENDA
    ═══════════════════════════════════════════════════════════════════ */
    function _cpRenderAgendaSkeleton() {
        var c = $('cp-panels-container');
        if (!c) return;
        c.innerHTML = '<div style="color:var(--text-muted,#6b7280);font-size:.88rem;text-align:center;padding:50px 0;">☕ Carregando agenda...</div>';
    }

    function _cpFilteredList() {
        var cutoff = new Date(Date.now() - parseInt(_cpApptFilter.period || '30') * 86400000).toISOString();
        return _cpAppts.filter(function(a) {
            if (_cpApptFilter.status && a.status !== _cpApptFilter.status) return false;
            if (_cpApptFilter.pastor && a.pastor_id !== _cpApptFilter.pastor) return false;
            if (a.scheduled_at < cutoff) return false;
            return true;
        });
    }

    /* ─── CAL STATE ─────────────────────────────────────────────────── */
    var _calView   = 'month';   // 'month' | 'week' | 'day' | 'list'
    var _calDate   = new Date();  // anchor date for view navigation

    /* ─── CALENDAR ENTRY POINT ──────────────────────────────────────── */
    function _cpRenderAgenda() {
        var c = $('cp-panels-container');
        if (!c) return;

        // KPIs (always shown above cal)
        var all    = _cpAppts.filter(function(a){ return a.status !== 'cancelled' && a.status !== 'no_show'; });
        var today2 = new Date(); today2.setHours(0,0,0,0);
        var weekE  = new Date(today2.getTime() + 7*86400000);
        var kpiHtml =
            '<div class="cp-kpi-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px;">'
            + _calKpi('Total', all.length, '#60A5FA', 'agendamentos')
            + _calKpi('Confirmados', all.filter(function(a){return a.status==='confirmed';}).length, '#60A5FA', 'aguardando')
            + _calKpi('Concluídos',  all.filter(function(a){return a.status==='completed';}).length, '#4ADE80', 'realizados')
            + _calKpi('Esta semana', all.filter(function(a){var d=new Date(a.scheduled_at);return d>=today2&&d<weekE;}).length, '#d4a574', 'agendados')
            + _calKpi('Cancelados',  _cpAppts.filter(function(a){return a.status==='cancelled'||a.status==='no_show';}).length, '#F87171', 'desistências')
            + '</div>';

        // Toolbar
        var pastOpts = '<option value="">Todos os Pastores</option>'
            + _cpPastors.map(function(p){
                return '<option value="' + esc(p.id) + '"' + (p.id===_cpApptFilter.pastor?' selected':'') + '>' + esc(p.display_name) + '</option>';
            }).join('');

        var toolbarHtml =
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">'
            // prev/today/next
            + '<div style="display:flex;gap:4px;">'
            + '<button onclick="cpCalNav(-1)" style="' + CSS_BTN_GHOST + 'padding:7px 12px;">◀</button>'
            + '<button onclick="cpCalToday()" style="' + CSS_BTN_GHOST + 'padding:7px 12px;">Hoje</button>'
            + '<button onclick="cpCalNav(1)"  style="' + CSS_BTN_GHOST + 'padding:7px 12px;">▶</button>'
            + '</div>'
            // title
            + '<span id="cp-cal-title" style="font-weight:700;font-size:.95rem;color:var(--text,#fff);margin:0 6px;"></span>'
            // view switcher
            + '<div style="display:flex;gap:4px;margin-left:auto;">'
            + ['month','week','day','list'].map(function(v){
                var lbl = {month:'Mês',week:'Semana',day:'Dia',list:'Lista'}[v];
                var act = v===_calView;
                return '<button onclick="cpCalView(\'' + v + '\')" style="' + (act ? CSS_BTN_GOLD : CSS_BTN_GHOST) + 'padding:6px 12px;font-size:.8rem;">' + lbl + '</button>';
              }).join('')
            + '</div>'
            // pastor filter
            + '<select id="cp-f-pastor" onchange="cpApplyFilter()" class="cp-filter-select">' + pastOpts + '</select>'
            // new appt
            + '<button onclick="cpNewApptModal()" style="' + CSS_BTN_GOLD + '">+ Agendar</button>'
            + '</div>';

        c.innerHTML = kpiHtml + toolbarHtml + '<div id="cp-cal-body"></div>';

        _calRenderBody();
    }

    function _calKpi(title, val, color, sub) {
        return '<div class="cp-kpi-card" style="background:var(--bg-card-solid,#131318);border:1px solid var(--border,rgba(255,255,255,.07));'
            + 'border-top:3px solid ' + color + ';border-radius:12px;padding:14px;min-width:0;">'
            + '<div class="cp-kpi-title" style="font-size:.7rem;font-weight:600;color:var(--text-muted,#9ca3af);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">' + esc(title) + '</div>'
            + '<div class="cp-kpi-value" style="font-size:1.7rem;font-weight:800;color:' + color + ';line-height:1;">' + val + '</div>'
            + '<div class="cp-kpi-sub" style="font-size:.7rem;color:var(--text-muted,#6b7280);margin-top:3px;">' + esc(sub) + '</div>'
            + '</div>';
    }

    function _calRenderBody() {
        var body = $('cp-cal-body');
        if (!body) return;
        // Update title
        var titleEl = $('cp-cal-title');
        var d = _calDate;
        var MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        if (_calView === 'month')  { if(titleEl) titleEl.textContent = MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
        else if (_calView === 'week') {
            var ws = _calWeekStart(d), we = new Date(ws.getTime()+6*86400000);
            if(titleEl) titleEl.textContent = ws.getDate()+'/'+(ws.getMonth()+1)+' – '+we.getDate()+'/'+(we.getMonth()+1)+'/'+we.getFullYear();
        }
        else if (_calView === 'day')  { if(titleEl) titleEl.textContent = DAYS[d.getDay()]+', '+d.getDate()+' de '+MONTHS[d.getMonth()]+' '+d.getFullYear(); }
        else { if(titleEl) titleEl.textContent = 'Lista de Agendamentos'; }

        if (_calView === 'month') _calRenderMonth(body);
        else if (_calView === 'week') _calRenderWeek(body);
        else if (_calView === 'day') _calRenderDay(body);
        else _calRenderList(body);
    }

    /* navigation */
    window.cpCalNav = function(dir) {
        if (_calView === 'month') {
            _calDate = new Date(_calDate.getFullYear(), _calDate.getMonth() + dir, 1);
        } else if (_calView === 'week') {
            _calDate = new Date(_calDate.getTime() + dir * 7 * 86400000);
        } else if (_calView === 'day') {
            _calDate = new Date(_calDate.getTime() + dir * 86400000);
        } else {
            _cpApptFilter.period = dir > 0 ? '90' : '30';
        }
        _calRenderBody();
    };
    window.cpCalToday = function() { _calDate = new Date(); _calRenderBody(); };
    window.cpCalView  = function(v) { _calView = v; _cpRenderAgenda(); };

    function _calEventsForDate(dateStr) {
        return _cpAppts.filter(function(a) {
            if (!a.scheduled_at) return false;
            if (_cpApptFilter.pastor && a.pastor_id !== _cpApptFilter.pastor) return false;
            return a.scheduled_at.substring(0,10) === dateStr;
        });
    }

    function _calEventPill(a) {
        var s = STATUS[a.status] || {color:'#aaa'};
        var pastor = _cpPastors.find(function(p){ return p.id === a.pastor_id; });
        var time = a.scheduled_at ? new Date(a.scheduled_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
        return '<div onclick="cpOpenAppt(\'' + esc(a.id) + '\')" style="cursor:pointer;background:' + s.color + '22;border-left:3px solid ' + s.color + ';'
            + 'color:var(--text,#fff);border-radius:5px;padding:3px 7px;font-size:.73rem;margin-bottom:3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">'
            + time + ' ' + esc(a.requester_name || '?') + (pastor ? ' · ' + esc(pastor.display_name) : '')
            + '</div>';
    }

    function _calWeekStart(d) {
        var start = new Date(d);
        start.setDate(d.getDate() - d.getDay()); // Sunday start
        start.setHours(0,0,0,0);
        return start;
    }

    /* ---- MONTH VIEW ---- */
    function _calRenderMonth(body) {
        var year = _calDate.getFullYear(), month = _calDate.getMonth();
        var firstDay = new Date(year, month, 1).getDay(); // 0=Sun
        var daysInMonth = new Date(year, month+1, 0).getDate();
        var today = new Date(); today.setHours(0,0,0,0);

        var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--border,rgba(255,255,255,.07));border-radius:12px;overflow:hidden;">';
        // Day headers
        ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(function(d){
            html += '<div style="background:var(--bg-card-solid,#131318);padding:8px;text-align:center;font-size:.72rem;font-weight:700;color:#d4a574;text-transform:uppercase;">' + d + '</div>';
        });
        // Empty cells before month start
        for (var i = 0; i < firstDay; i++) {
            html += '<div style="background:var(--bg-deep,#0d0d0f);min-height:80px;padding:6px;opacity:.4;"></div>';
        }
        // Day cells
        for (var day = 1; day <= daysInMonth; day++) {
            var dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
            var cellDate = new Date(year, month, day);
            var isToday  = cellDate.getTime() === today.getTime();
            var events   = _calEventsForDate(dateStr);
            var MAX_SHOW = 2;
            var pillsHtml = events.slice(0, MAX_SHOW).map(_calEventPill).join('');
            if (events.length > MAX_SHOW) {
                pillsHtml += '<div style="font-size:.7rem;color:#d4a574;cursor:pointer;" onclick="cpCalView(\'day\');_calDate=new Date(\'' + dateStr + '\');_calRenderBody();">+' + (events.length-MAX_SHOW) + ' mais</div>';
            }
            html += '<div onclick="if(!event.target.closest(\'[onclick]\'))cpCalDrillDay(\'' + dateStr + '\')" style="background:' + (isToday?'rgba(212,165,116,.08)':'var(--bg-deep,#0d0d0f)') + ';min-height:80px;padding:6px;cursor:pointer;transition:background .15s;" '
                + 'onmouseover="this.style.background=\'rgba(255,255,255,.04)\'" onmouseout="this.style.background=\'' + (isToday?'rgba(212,165,116,.08)':'var(--bg-deep,#0d0d0f)') + '\'">'
                + '<div style="font-size:.78rem;font-weight:' + (isToday?'800':'600') + ';color:' + (isToday?'#d4a574':'var(--text-muted,#6b7280)') + ';margin-bottom:4px;">'
                + (isToday ? '<span style="background:#d4a574;color:#111;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:.72rem;">' + day + '</span>' : day)
                + '</div>'
                + pillsHtml
                + '</div>';
        }
        // Trailing empty cells
        var total = firstDay + daysInMonth;
        var trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
        for (var j = 0; j < trailing; j++) {
            html += '<div style="background:var(--bg-deep,#0d0d0f);min-height:80px;padding:6px;opacity:.4;"></div>';
        }
        html += '</div>';
        body.innerHTML = html;
    }
    window.cpCalDrillDay = function(dateStr) {
        _calDate = new Date(dateStr + 'T00:00:00');
        _calView = 'day';
        _cpRenderAgenda();
    };

    /* ---- WEEK VIEW ---- */
    function _calRenderWeek(body) {
        var ws = _calWeekStart(_calDate);
        var days = [];
        for (var i = 0; i < 7; i++) {
            var d = new Date(ws.getTime() + i*86400000);
            days.push(d);
        }
        var today = new Date(); today.setHours(0,0,0,0);

        var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--border,rgba(255,255,255,.07));border-radius:12px;overflow:hidden;">';
        days.forEach(function(d) {
            var isToday = d.getTime() === today.getTime();
            html += '<div style="background:var(--bg-card-solid,#131318);padding:8px 6px;text-align:center;">'
                + '<div style="font-size:.72rem;font-weight:700;color:' + (isToday?'#d4a574':'var(--text-muted)') + ';text-transform:uppercase;">' + DAYS_SHORT[d.getDay()] + '</div>'
                + '<div style="font-size:1.1rem;font-weight:' + (isToday?'800':'600') + ';color:' + (isToday?'#d4a574':'var(--text)') + ';">' + d.getDate() + '</div>'
                + '</div>';
        });
        days.forEach(function(d) {
            var dateStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
            var events = _calEventsForDate(dateStr);
            var isToday = d.getTime() === today.getTime();
            html += '<div style="background:' + (isToday?'rgba(212,165,116,.05)':'var(--bg-deep,#0d0d0f)') + ';min-height:120px;padding:6px;">'
                + events.map(_calEventPill).join('')
                + (events.length === 0 ? '<div style="font-size:.7rem;color:rgba(255,255,255,.1);text-align:center;padding:10px 0;">—</div>' : '')
                + '</div>';
        });
        html += '</div>';
        body.innerHTML = html;
    }

    /* ---- DAY VIEW ---- */
    function _calRenderDay(body) {
        var d = _calDate;
        var dateStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        var events = _calEventsForDate(dateStr).sort(function(a,b){ return new Date(a.scheduled_at)-new Date(b.scheduled_at); });

        var html = '<div style="background:var(--bg-card-solid,#131318);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:12px;padding:20px;">';
        if (events.length === 0) {
            html += '<div style="text-align:center;padding:40px 0;color:var(--text-muted,#6b7280);">☕ Nenhum agendamento neste dia.</div>';
        } else {
            events.forEach(function(a) {
                var s = STATUS[a.status] || {label:a.status,color:'#aaa'};
                var pastor = _cpPastors.find(function(p){ return p.id === a.pastor_id; });
                var time = new Date(a.scheduled_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
                var typeIco = a.appointment_type==='online'?'💻':'🏛️';
                html += '<div onclick="cpOpenAppt(\'' + esc(a.id) + '\')" style="cursor:pointer;display:flex;gap:14px;align-items:flex-start;'
                    + 'padding:14px;border-radius:10px;border:1px solid rgba(255,255,255,.07);margin-bottom:10px;'
                    + 'background:' + s.color + '11;border-left:4px solid ' + s.color + ';'
                    + 'transition:background .15s;" onmouseover="this.style.background=\'' + s.color + '22\'" onmouseout="this.style.background=\'' + s.color + '11\'">'
                    + '<div style="min-width:52px;text-align:center;">'
                    + '<div style="font-size:1rem;font-weight:700;color:' + s.color + ';">' + time + '</div>'
                    + '<div style="font-size:1.2rem;margin-top:2px;">' + typeIco + '</div>'
                    + '</div>'
                    + '<div style="flex:1;min-width:0;">'
                    + '<div style="font-weight:700;color:var(--text,#fff);font-size:.92rem;">' + esc(a.requester_name||'—') + '</div>'
                    + '<div style="font-size:.78rem;color:var(--text-muted,#6b7280);margin-top:2px;">' + esc(a.requester_email||'') + (a.requester_phone?' · '+esc(a.requester_phone):'') + '</div>'
                    + (pastor ? '<div style="font-size:.78rem;color:#d4a574;margin-top:4px;">Pastor: ' + esc(pastor.display_name) + '</div>' : '')
                    + '</div>'
                    + '<div>' + badge(a.status) + '</div>'
                    + '</div>';
            });
        }
        html += '</div>';
        body.innerHTML = html;
    }

    /* ---- LIST VIEW ---- */
    function _calRenderList(body) {
        var list = _cpFilteredList();
        if (list.length === 0) {
            body.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted,#6b7280);">☕ Nenhum agendamento encontrado.</div>';
            return;
        }
        // Group by date
        var byDate = {};
        list.forEach(function(a) {
            var key = a.scheduled_at ? a.scheduled_at.substring(0,10) : 'sem-data';
            if (!byDate[key]) byDate[key] = [];
            byDate[key].push(a);
        });
        var keys = Object.keys(byDate).sort().reverse();
        var MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

        var html = '';
        keys.forEach(function(key) {
            var label = key === 'sem-data' ? 'Sem data' : (function(){
                var parts = key.split('-'); var dd=parseInt(parts[2]),mm=parseInt(parts[1])-1,yyyy=parseInt(parts[0]);
                var d = new Date(yyyy,mm,dd);
                return DAYS[d.getDay()] + ', ' + dd + ' de ' + MONTHS[mm] + ' ' + yyyy;
            })();
            html += '<div style="font-size:.72rem;font-weight:700;color:#d4a574;text-transform:uppercase;letter-spacing:.06em;padding:14px 0 6px;">' + label + '</div>';
            byDate[key].forEach(function(a) {
                var s = STATUS[a.status] || {label:a.status,color:'#aaa'};
                var pastor = _cpPastors.find(function(p){ return p.id===a.pastor_id; });
                var time = a.scheduled_at ? new Date(a.scheduled_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
                var typeIco = a.appointment_type==='online'?'💻':'🏛️';
                html += '<div onclick="cpOpenAppt(\'' + esc(a.id) + '\')" style="cursor:pointer;display:flex;gap:12px;align-items:center;'
                    + 'padding:12px 14px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.07));margin-bottom:6px;'
                    + 'background:var(--bg-card-solid,#131318);transition:background .15s;"'
                    + ' onmouseover="this.style.background=\'rgba(255,255,255,.04)\'" onmouseout="this.style.background=\'var(--bg-card-solid,#131318)\'">'
                    + '<div style="min-width:38px;text-align:center;font-size:.85rem;font-weight:700;color:' + s.color + ';">' + time + '</div>'
                    + '<div style="font-size:1rem;">' + typeIco + '</div>'
                    + '<div style="flex:1;min-width:0;">'
                    + '<div style="font-weight:600;color:var(--text,#fff);font-size:.88rem;">' + esc(a.requester_name||'—') + '</div>'
                    + '<div style="font-size:.74rem;color:var(--text-muted,#6b7280);">' + esc((pastor&&pastor.display_name)||'—') + '</div>'
                    + '</div>'
                    + badge(a.status)
                    + '</div>';
            });
        });
        body.innerHTML = html;
    }

    window.cpApplyFilter = function() {
        _cpApptFilter.pastor = ($('cp-f-pastor')||{}).value || '';
        _cpApptFilter.status = ($('cp-f-status')||{}).value || '';
        _cpApptFilter.period = ($('cp-f-period')||{}).value || '30';
        _calRenderBody();
    };

    /* ─── MANUAL APPOINTMENT MODAL ────────────────────────────────────── */
    window.cpNewApptModal = function() {
        var today = new Date();
        var dateDefault = today.toISOString().split('T')[0];
        var timeDefault = '10:00';

        var pastorOpts = _cpPastors.map(function(p){
            return '<option value="' + esc(p.id) + '">' + esc(p.display_name) + '</option>';
        }).join('');
        if (!pastorOpts) pastorOpts = '<option value="">Nenhum pastor cadastrado</option>';

        _cpModal(
            '☕ Novo Agendamento Manual',
            '<div style="display:flex;flex-direction:column;gap:14px;">'
            + _field('Nome do Solicitante *', '<input id="cpa-name" style="' + CSS_INPUT + '" placeholder="Nome completo"/>')
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
            + _field('Email (opcional)', '<input id="cpa-email" type="email" style="' + CSS_INPUT + '" placeholder="email@..."/>')
            + _field('Telefone (opcional)', '<input id="cpa-phone" type="tel" style="' + CSS_INPUT + '" placeholder="+55..."/>')
            + '</div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
            + _field('Data *', '<input id="cpa-date" type="date" style="' + CSS_INPUT + '" value="' + dateDefault + '"/>')
            + _field('Hora *', '<input id="cpa-time" type="time" style="' + CSS_INPUT + '" value="' + timeDefault + '"/>')
            + '</div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">'
            + _field('Pastor', '<select id="cpa-pastor" style="' + CSS_SELECT + '">' + pastorOpts + '</select>')
            + _field('Tipo', '<select id="cpa-type" style="' + CSS_SELECT + '"><option value="inperson">🏛️ Presencial</option><option value="online">💻 Online</option></select>')
            + _field('Duração (min)', '<input id="cpa-dur" type="number" style="' + CSS_INPUT + '" value="60" min="15" max="180" step="15"/>')
            + '</div>'
            + _field('Gênero do Solicitante', '<select id="cpa-gender" style="' + CSS_SELECT + '"><option value="">—</option><option value="M">Masculino</option><option value="F">Feminino</option><option value="couple">Casal</option><option value="family">Família</option></select>')
            + _field('Status', '<select id="cpa-status" style="' + CSS_SELECT + '"><option value="confirmed">Confirmado</option><option value="pending">Pendente</option></select>')
            + _field('Notas internas (optional)', '<textarea id="cpa-notes" style="' + CSS_INPUT + 'resize:vertical;" rows="3" placeholder="Observações para o pastor..."></textarea>')
            + '</div>',
            '<button onclick="cpSaveNewAppt()" style="' + CSS_BTN_GOLD + 'width:100%;padding:12px;">💾 Salvar Agendamento</button>'
        );
    };

    window.cpSaveNewAppt = async function() {
        var name   = ($('cpa-name')||{}).value.trim();
        var date   = ($('cpa-date')||{}).value;
        var time   = ($('cpa-time')||{}).value;
        if (!name || !date || !time) { toast('Preencha nome, data e hora.','error'); return; }

        var pastorId = ($('cpa-pastor')||{}).value || null;
        var payload = {
            workspace_id:   getWsId(),
            pastor_id:      pastorId || null,
            requester_name: name,
            requester_email:($('cpa-email')||{}).value.trim() || null,
            requester_phone:($('cpa-phone')||{}).value.trim() || null,
            requester_gender:($('cpa-gender')||{}).value || null,
            appointment_type:($('cpa-type')||{}).value || 'inperson',
            scheduled_at:   date + 'T' + time + ':00',
            duration_minutes:parseInt(($('cpa-dur')||{}).value)||60,
            status:         ($('cpa-status')||{}).value || 'confirmed',
            pastor_notes:   ($('cpa-notes')||{}).value.trim() || null,
        };

        try {
            var { data, error } = await _sb().from('cafe_pastor_appointments').insert(payload).select().single();
            if (error) throw error;
            _cpAppts.unshift(data);
            _cpCloseModal();
            toast('Agendamento criado!','success');
            _cpRenderAgenda();
        } catch(err) { toast('Erro: ' + (err.message||err), 'error'); }
    };

    /* ─── APPOINTMENT DETAIL SIDE PANEL ───────────────────────────────── */
    window.cpOpenAppt = function(apptId) {
        var a = _cpAppts.find(function(x){ return x.id === apptId; });
        if (!a) return;
        var pastor = _cpPastors.find(function(p){ return p.id === a.pastor_id; });
        var s = STATUS[a.status] || { label: a.status, color:'#aaa' };

        var statusOpts = Object.keys(STATUS).map(function(k){
            return '<option value="' + k + '"' + (a.status===k?' selected':'') + '>' + STATUS[k].label + '</option>';
        }).join('');
        var pastorOpts = '<option value="">— Sem pastor —</option>' + _cpPastors.map(function(p){
            return '<option value="' + esc(p.id) + '"' + (a.pastor_id===p.id?' selected':'') + '>' + esc(p.display_name) + '</option>';
        }).join('');

        var briefingRows = '';
        if (a.briefing_data && typeof a.briefing_data === 'object') {
            Object.entries(a.briefing_data).forEach(function(kv) {
                briefingRows += '<div style="display:flex;gap:8px;padding:5px 0;font-size:.83rem;border-bottom:1px solid rgba(255,255,255,.05);">'
                    + '<span style="color:rgba(255,255,255,.4);min-width:80px;">' + esc(kv[0]) + '</span>'
                    + '<span style="color:var(--text,#f0ede8);">' + esc(kv[1]) + '</span></div>';
            });
        }

        var existing = $('cp-appt-panel');
        if (existing) existing.remove();

        var html = '<div id="cp-appt-panel" style="position:fixed;top:0;right:0;width:400px;max-width:95vw;height:100vh;'
            + 'background:var(--bg-deep,#0d0d0f);border-left:1px solid rgba(212,165,116,.25);z-index:3000;overflow-y:auto;'
            + 'box-shadow:-12px 0 40px rgba(0,0,0,.6);">'
            + '<div style="padding:24px;">'

            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">'
            + '<div style="font-size:1rem;font-weight:700;color:var(--text,#f0ede8);">☕ Detalhes do Agendamento</div>'
            + '<button onclick="document.getElementById(\'cp-appt-panel\').remove()" '
            + 'style="background:rgba(255,255,255,.08);border:none;color:#aaa;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:1rem;">✕</button>'
            + '</div>'

            + '<div style="display:flex;gap:8px;margin-bottom:20px;">'
            + badge(a.status)
            + (a.appointment_type ? '<span style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);'
              + 'border-radius:20px;padding:2px 10px;font-size:.72rem;color:#ccc;">'
              + (a.appointment_type==='online'?'💻 Online':'🏛️ Presencial') + '</span>' : '')
            + '</div>'

            + _panelSec('👤 Solicitante',
                _panelRow('Nome', a.requester_name)
                + _panelRow('Email', a.requester_email)
                + _panelRow('Telefone', a.requester_phone)
                + _panelRow('Gênero', { M:'Masculino', F:'Feminino', couple:'Casal', family:'Família' }[a.requester_gender] || a.requester_gender)
                + _panelRow('Agendado em', fmtDT(a.scheduled_at) + ' · ' + (a.duration_minutes||60) + 'min')
            )

            + (briefingRows ? _panelSec('📋 Briefing', briefingRows) : '')

            + _panelSec('👨‍⚖️ Pastor',
                '<select id="cp-appt-pastor" style="' + CSS_SELECT + 'margin-bottom:0;">' + pastorOpts + '</select>'
            )

            + _panelSec('🔗 Link da Sessão',
                '<input id="cp-appt-link" type="url" style="' + CSS_INPUT + '" placeholder="https://meet.google.com/..." value="' + esc(a.session_link||'') + '"/>'
            )

            + _panelSec('📝 Notas do Pastor (privadas)',
                '<textarea id="cp-appt-notes" style="' + CSS_INPUT + 'resize:vertical;" rows="4">'
                + esc(a.pastor_notes||'') + '</textarea>'
            )

            + _panelSec('⚙️ Status',
                '<select id="cp-appt-status" style="' + CSS_SELECT + '">' + statusOpts + '</select>'
            )

            + '<div style="display:flex;gap:8px;margin-top:8px;">'
            + '<button onclick="cpSaveAppt(\'' + esc(a.id) + '\')" style="' + CSS_BTN_GOLD + 'flex:1;padding:12px;">💾 Salvar</button>'
            + '<button onclick="document.getElementById(\'cp-appt-panel\').remove()" style="' + CSS_BTN_GHOST + 'flex:1;padding:12px;">Fechar</button>'
            + '</div>'

            + '</div></div>';

        document.body.insertAdjacentHTML('beforeend', html);
    };

    window.cpSaveAppt = async function(apptId) {
        var link     = ($('cp-appt-link')||{}).value    || null;
        var notes    = ($('cp-appt-notes')||{}).value   || null;
        var status   = ($('cp-appt-status')||{}).value  || null;
        var pastorId = ($('cp-appt-pastor')||{}).value  || null;
        try {
            var { error } = await _sb().from('cafe_pastor_appointments')
                .update({ session_link:link, pastor_notes:notes, status:status, pastor_id:pastorId, updated_at:new Date().toISOString() })
                .eq('id', apptId);
            if (error) throw error;
            var idx = _cpAppts.findIndex(function(a){ return a.id === apptId; });
            if (idx >= 0) { _cpAppts[idx].session_link=link; _cpAppts[idx].pastor_notes=notes; _cpAppts[idx].status=status; _cpAppts[idx].pastor_id=pastorId; }
            toast('Agendamento atualizado!','success');
            var p = $('cp-appt-panel'); if (p) p.remove();
            _cpRenderAgenda();
        } catch(err) { toast('Erro: ' + (err.message||err), 'error'); }
    };

    function _panelSec(title, body) {
        return '<div style="margin-bottom:18px;">'
            + '<div style="font-size:.73rem;font-weight:700;color:rgba(212,165,116,.8);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">' + esc(title) + '</div>'
            + body + '</div>';
    }
    function _panelRow(k, v) {
        if (!v && v !== 0) return '';
        return '<div style="display:flex;gap:8px;padding:5px 0;font-size:.84rem;border-bottom:1px solid rgba(255,255,255,.05);">'
            + '<span style="color:var(--text-muted,#6b7280);min-width:75px;">' + esc(k) + '</span>'
            + '<span style="color:var(--text,#fff);">' + esc(String(v)) + '</span></div>';
    }

    /* ═══════════════════════════════════════════════════════════════════
       PANEL 2 — PASTORES
    ═══════════════════════════════════════════════════════════════════ */
    function _cpRenderPastores() {
        var c = $('cp-panels-container');
        if (!c) return;

        var cards = '';
        if (_cpPastors.length === 0) {
            cards = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;background:var(--bg-card-solid,#131318);border:1px dashed rgba(212,165,116,.2);border-radius:14px;">'
                + '<div style="font-size:3rem;margin-bottom:12px;">🧑‍⚖️</div>'
                + '<div style="font-weight:700;color:var(--text,#fff);margin-bottom:6px;">Nenhum pastor configurado</div>'
                + '<div style="font-size:.85rem;color:rgba(255,255,255,.4);">Clique em "+ Adicionar Pastor" para começar.</div></div>';
        } else {
            _cpPastors.forEach(function(p) {
                var confirmed = _cpAppts.filter(function(a){ return a.pastor_id===p.id && a.status==='confirmed'; }).length;
                var done      = _cpAppts.filter(function(a){ return a.pastor_id===p.id && a.status==='completed'; }).length;
                var photo = p.photo_url
                    || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.display_name||'P') + '&background=3d2a1a&color=d4a574&bold=true&size=100';
                var genderLabel = p.gender==='M'?'Masculino':p.gender==='F'?'Feminina':'';

                cards += '<div style="background:var(--bg-card-solid,#131318);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:14px;padding:20px;">'
                    + '<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px;">'
                    + '<img src="' + esc(photo) + '" style="width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid rgba(212,165,116,.4);flex-shrink:0;" onerror="this.src=\'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.display_name||'P') + '&background=3d2a1a&color=d4a574&bold=true&size=100\'"/>'
                    + '<div style="flex:1;min-width:0;">'
                    + '<div style="font-weight:700;font-size:.95rem;color:var(--text,#fff);">' + esc(p.display_name||'—') + '</div>'
                    + '<div style="font-size:.76rem;color:rgba(255,255,255,.4);margin-top:2px;">' + (genderLabel||'—') + '</div>'
                    + (p.bio ? '<div style="font-size:.75rem;color:var(--text-muted,#6b7280);margin-top:5px;line-height:1.4;">' + esc(p.bio.substring(0,80)) + (p.bio.length>80?'...':'') + '</div>' : '')
                    + '</div>'
                    + '<span style="background:' + (p.is_active?'rgba(74,222,128,.1)':'rgba(248,113,113,.1)') + ';color:' + (p.is_active?'#4ADE80':'#F87171') + ';'
                    +   'border:1px solid ' + (p.is_active?'rgba(74,222,128,.3)':'rgba(248,113,113,.3)') + ';'
                    +   'border-radius:20px;padding:2px 9px;font-size:.7rem;font-weight:600;flex-shrink:0;">'
                    + (p.is_active?'Ativo':'Inativo') + '</span>'
                    + '</div>'
                    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">'
                    + '<div style="background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.2);border-radius:8px;padding:8px;text-align:center;">'
                    +   '<div style="font-size:1.2rem;font-weight:700;color:#60A5FA;">' + confirmed + '</div><div style="font-size:.7rem;color:rgba(255,255,255,.3);">Confirmados</div></div>'
                    + '<div style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);border-radius:8px;padding:8px;text-align:center;">'
                    +   '<div style="font-size:1.2rem;font-weight:700;color:#4ADE80;">' + done + '</div><div style="font-size:.7rem;color:rgba(255,255,255,.3);">Concluídos</div></div>'
                    + '</div>'
                    + '<div style="display:flex;gap:8px;">'
                    + '<button onclick="cpEditPastor(\'' + esc(p.id) + '\')" style="flex:1;background:rgba(212,165,116,.12);color:#d4a574;border:1px solid rgba(212,165,116,.3);padding:7px;border-radius:8px;font-size:.78rem;font-weight:600;cursor:pointer;">✏️ Editar</button>'
                    + '<button onclick="cpManageAvailability(\'' + esc(p.id) + '\')" style="flex:1;background:rgba(96,165,250,.1);color:#60A5FA;border:1px solid rgba(96,165,250,.25);padding:7px;border-radius:8px;font-size:.78rem;font-weight:600;cursor:pointer;">🗓️ Horários</button>'
                    + '</div>'
                    + '<button onclick="cpCopyICal(\'' + esc(p.id) + '\')" '
                    + 'style="margin-top:8px;width:100%;background:rgba(139,92,246,.1);color:#a78bfa;border:1px solid rgba(139,92,246,.25);padding:6px;border-radius:8px;font-size:.75rem;font-weight:600;cursor:pointer;">📅 Copiar Link iCal</button>'
                    + '</div>';
            });
        }

        c.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px;">'
            + '<h3 style="font-size:1.05rem;margin:0;color:var(--text,#f0ede8);">Pastores do Módulo</h3>'
            + '<button onclick="cpAddPastor()" style="' + CSS_BTN_GOLD + '">+ Adicionar Pastor</button>'
            + '</div>'
            + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">' + cards + '</div>';
    }

    /* ─── PASTOR CRUD MODAL ───────────────────────────────────────────── */
    window.cpAddPastor  = function() { _cpPastorModal(null); };
    window.cpEditPastor = function(id) { _cpPastorModal(_cpPastors.find(function(p){ return p.id===id; })||null); };

    function _cpPastorModal(p) {
        var isNew = !p || !p.id;
        p = p || {};

        _cpModal(
            (isNew ? 'Adicionar' : 'Editar') + ' Pastor',

            '<div style="display:flex;flex-direction:column;gap:14px;">'

            // Photo upload
            + '<div style="text-align:center;">'
            + '<div id="cppm-photo-preview" style="width:80px;height:80px;border-radius:50%;margin:0 auto 10px;overflow:hidden;border:2px solid rgba(212,165,116,.4);background:rgba(0,0,0,.3);">'
            + (p.photo_url ? '<img src="' + esc(p.photo_url) + '" style="width:100%;height:100%;object-fit:cover;"/>' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;color:rgba(212,165,116,.5);">👤</div>')
            + '</div>'
            + '<input type="file" id="cppm-photo-file" accept="image/*" onchange="cpPreviewPhoto()" style="display:none;"/>'
            + '<button onclick="document.getElementById(\'cppm-photo-file\').click()" style="background:rgba(255,255,255,.06);color:#ccc;border:1px solid rgba(255,255,255,.12);padding:6px 14px;border-radius:8px;font-size:.8rem;cursor:pointer;">📸 Selecionar Foto</button>'
            + '<input type="hidden" id="cppm-photo-url" value="' + esc(p.photo_url||'') + '"/>'
            + '</div>'

            + _field('Nome de Exibição *', '<input id="cppm-name" style="' + CSS_INPUT + '" placeholder="Ex: Pastor João" value="' + esc(p.display_name||'') + '"/>')

            + _field('Email para Notificações', '<input id="cppm-email" type="email" style="' + CSS_INPUT + '" placeholder="pastor@igreja.com" value="' + esc(p.email||'') + '"/>')

            + _field('Gênero *',
                '<select id="cppm-gender" style="' + CSS_SELECT + '">'
                + '<option value="M"' + (p.gender==='M'?' selected':'') + '>Masculino</option>'
                + '<option value="F"' + (p.gender==='F'?' selected':'') + '>Feminino</option>'
                + '</select>')

            + _field('Bio (opcional)',
                '<textarea id="cppm-bio" style="' + CSS_INPUT + 'resize:vertical;" rows="3">' + esc(p.bio||'') + '</textarea>')

            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
            + _field('Duração padrão (min)', '<input id="cppm-dur" type="number" style="' + CSS_INPUT + '" value="' + (p.session_duration_minutes||60) + '" min="15" max="180" step="15"/>')
            + _field('Máx. sessões / semana', '<input id="cppm-max" type="number" style="' + CSS_INPUT + '" value="' + (p.max_weekly_sessions||10) + '" min="1" max="50"/>')
            + '</div>'

            + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:12px;background:rgba(212,165,116,.06);border:1px solid rgba(212,165,116,.15);border-radius:8px;">'
            + '<input type="checkbox" id="cppm-active"' + (p.is_active!==false?' checked':'') + ' style="width:16px;height:16px;accent-color:#d4a574;"/>'
            + '<span style="color:var(--text,#f0ede8);font-size:.88rem;">Pastor ativo (aceita novos agendamentos)</span></label>'

            + '</div>',

            '<div style="display:flex;gap:8px;">'
            + '<button onclick="cpSavePastor(\'' + esc(p.id||'') + '\',' + isNew + ')" style="' + CSS_BTN_GOLD + 'flex:1;padding:12px;">💾 Salvar</button>'
            + (!isNew ? '<button onclick="cpTogglePastor(\'' + esc(p.id) + '\',' + (!p.is_active) + ')" style="' + CSS_BTN_GHOST + 'padding:12px 16px;">' + (p.is_active?'Desativar':'Ativar') + '</button>' : '')
            + '</div>'
        );
    }

    window.cpPreviewPhoto = function() {
        var file = (document.getElementById('cppm-photo-file')||{}).files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
            var preview = $('cppm-photo-preview');
            if (preview) preview.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover;"/>';
        };
        reader.readAsDataURL(file);
    };

    window.cpSavePastor = async function(id, isNew) {
        var name   = ($('cppm-name')||{}).value.trim();
        var gender = ($('cppm-gender')||{}).value || 'M';
        var bio    = ($('cppm-bio')||{}).value.trim() || null;
        var dur    = parseInt(($('cppm-dur')||{}).value)||60;
        var maxS   = parseInt(($('cppm-max')||{}).value)||10;
        var active = ($('cppm-active')||{}).checked !== false;
        var photoUrl = ($('cppm-photo-url')||{}).value || null;

        if (!name) { toast('O nome é obrigatório.','error'); return; }

        // Upload photo if new file selected
        var fileInput = $('cppm-photo-file');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            try {
                var file = fileInput.files[0];
                var ext = file.name.split('.').pop();
                var path = 'pastor-photos/' + getWsId() + '/' + Date.now() + '.' + ext;
                var { data: upData, error: upErr } = await _sb().storage.from('pastor-photos').upload(path, file, { upsert:true });
                if (upErr) throw upErr;
                var { data: urlData } = _sb().storage.from('pastor-photos').getPublicUrl(path);
                photoUrl = urlData && urlData.publicUrl;
            } catch(e) { toast('Aviso: não foi possível fazer upload da foto. ' + e.message, 'info'); }
        }

        var email  = ($('cppm-email')||{}).value.trim() || null;

        var payload = {
            workspace_id: getWsId(), display_name:name, gender:gender, bio:bio, email:email,
            session_duration_minutes:dur, max_weekly_sessions:maxS, photo_url:photoUrl, is_active:active
        };

        try {
            if (isNew) {
                var { data:r, error:e } = await _sb().from('cafe_pastor_pastors').insert(payload).select().single();
                if (e) throw e;
                _cpPastors.push(r);
            } else {
                var { data:r2, error:e2 } = await _sb().from('cafe_pastor_pastors').update(payload).eq('id',id).select().single();
                if (e2) throw e2;
                var idx = _cpPastors.findIndex(function(p){return p.id===id;}); if(idx>=0) _cpPastors[idx]=r2;
            }
            _cpCloseModal();
            toast('Pastor salvo!','success');
            _cpRenderPastores();
        } catch(err) { toast('Erro: '+(err.message||err),'error'); }
    };

    window.cpTogglePastor = async function(id, newVal) {
        try {
            var { error } = await _sb().from('cafe_pastor_pastors').update({is_active:newVal}).eq('id',id);
            if (error) throw error;
            var idx = _cpPastors.findIndex(function(p){return p.id===id;}); if(idx>=0) _cpPastors[idx].is_active=newVal;
            _cpCloseModal();
            toast('Pastor '+(newVal?'ativado':'desativado')+'!','success');
            _cpRenderPastores();
        } catch(err) { toast('Erro: '+(err.message||err),'error'); }
    };

    /* ─── ICAL LINK ──────────────────────────────────────────────────── */
    window.cpCopyICal = function(pastorId) {
        var pastor = _cpPastors.find(function(p){ return p.id === pastorId; });
        var token = pastor && pastor.ical_token;
        if (!token) {
            toast('Token iCal não disponível. O pastor precisa ter sido salvo primeiro.', 'error');
            return;
        }
        var url = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1/cafe-pastor-ical?token=' + token;
        navigator.clipboard.writeText(url).then(function() {
            toast('Link iCal copiado! Cole no seu Apple Calendar / Google Calendar.', 'success');
        }).catch(function() {
            var ta = document.createElement('textarea');
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            toast('Link iCal copiado!', 'success');
        });
    };

    /* ─── AVAILABILITY MODAL ──────────────────────────────────────────── */
    window.cpManageAvailability = async function(pastorId) {
        var pastor = _cpPastors.find(function(p){return p.id===pastorId;});
        if (!pastor) return;

        // Load existing availability
        var avails = [];
        try {
            var { data } = await _sb().from('cafe_pastor_availability')
                .select('*').eq('pastor_id', pastorId);
            avails = data || [];
        } catch(e) { /* ignore */ }

        // Build matrix per day
        var rows = '';
        for (var dow = 1; dow <= 6; dow++) {
            var existing = avails.find(function(a){ return a.day_of_week === dow; });
            var isActive = existing && existing.is_active;
            var startT   = (existing && existing.start_time) ? existing.start_time.substring(0,5) : '09:00';
            var endT     = (existing && existing.end_time)   ? existing.end_time.substring(0,5)   : '17:00';
            var sessType = (existing && existing.session_type) || 'both';

            rows += '<div style="display:grid;grid-template-columns:100px 1fr;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border,rgba(255,255,255,.07));">'
                // Day toggle
                + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">'
                + '<input type="checkbox" class="cp-avail-active" data-dow="' + dow + '"' + (isActive?' checked':'') + ' onchange="cpAvailToggleDay(' + dow + ')" style="width:15px;height:15px;accent-color:#d4a574;"/>'
                + '<span style="font-size:.85rem;font-weight:600;color:' + (isActive?'#d4a574':'rgba(255,255,255,.3)') + ';" id="cp-avail-lbl-' + dow + '">' + DAYS[dow] + '</span>'
                + '</label>'
                // Time + type controls
                + '<div id="cp-avail-ctrl-' + dow + '" style="display:' + (isActive?'flex':'none') + ';gap:8px;align-items:center;flex-wrap:wrap;">'
                + '<input type="time" class="cp-avail-start" data-dow="' + dow + '" value="' + startT + '" style="' + CSS_INPUT + 'width:auto;padding:5px 8px;"/>'
                + '<span style="color:rgba(255,255,255,.3);font-size:.8rem;">até</span>'
                + '<input type="time" class="cp-avail-end" data-dow="' + dow + '" value="' + endT + '" style="' + CSS_INPUT + 'width:auto;padding:5px 8px;"/>'
                + '<select class="cp-avail-type" data-dow="' + dow + '" style="' + CSS_SELECT + 'width:auto;padding:5px 8px;font-size:.8rem;">'
                + '<option value="both"' +  (sessType==='both'?' selected':'')    + '>🏛️ + 💻 Ambos</option>'
                + '<option value="inperson"' + (sessType==='inperson'?' selected':'') + '>🏛️ Só Presencial</option>'
                + '<option value="online"' +  (sessType==='online'?' selected':'')   + '>💻 Só Online</option>'
                + '</select>'
                + '</div>'
                + '</div>';
        }

        _cpModal(
            '🗓️ Horários — ' + esc(pastor.display_name),
            '<p style="font-size:.83rem;color:var(--text-muted,#6b7280);margin-bottom:16px;">Defina os dias e horários de atendimento do pastor.</p>'
            + rows
            + '<div style="margin-top:20px;padding-top:18px;border-top:1px solid rgba(255,255,255,.07);">'
            + '<div style="font-size:.73rem;font-weight:700;color:rgba(212,165,116,.8);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">🚫 Bloquear Data Específica</div>'
            + '<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:end;">'
            + '<div>' + lbl('Data') + '<input type="date" id="cp-block-date" style="' + CSS_INPUT + '"/></div>'
            + '<div>' + lbl('Início') + '<input type="time" id="cp-block-start" value="00:00" style="' + CSS_INPUT + 'width:auto;padding:9px 8px;"/></div>'
            + '<div>' + lbl('Fim') + '<input type="time" id="cp-block-end" value="23:59" style="' + CSS_INPUT + 'width:auto;padding:9px 8px;"/></div>'
            + '<button onclick="cpAddBlock(\'' + esc(pastorId) + '\')" style="' + CSS_BTN_GOLD + 'padding:9px 14px;white-space:nowrap;">+ Bloquear</button>'
            + '</div>'
            + '<div id="cp-blocks-list" style="margin-top:10px;"></div>'
            + '</div>',
            '<button onclick="cpSaveAvailability(\'' + esc(pastorId) + '\')" style="' + CSS_BTN_GOLD + 'width:100%;padding:12px;">💾 Salvar Horários</button>'
        );

        // Load existing blocks
        cpLoadBlocks(pastorId);
    };

    window.cpLoadBlocks = async function(pastorId) {
        var el = $('cp-blocks-list');
        if (!el) return;
        try {
            var { data } = await _sb().from('cafe_pastor_blocked_slots')
                .select('*').eq('pastor_id', pastorId).order('blocked_date');
            var blocks = data || [];
            if (blocks.length === 0) {
                el.innerHTML = '<div style="font-size:.78rem;color:rgba(255,255,255,.25);padding:8px 0;">Nenhum bloqueio registrado.</div>';
            } else {
                el.innerHTML = blocks.map(function(b) {
                    var timeRange = (b.blocked_start && b.blocked_end)
                        ? ' · ' + b.blocked_start.substring(0,5) + '–' + b.blocked_end.substring(0,5)
                        : ' · Dia todo';
                    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:rgba(248,113,113,.07);border:1px solid rgba(248,113,113,.15);border-radius:8px;margin-bottom:6px;">'
                        + '<span style="font-size:.82rem;color:var(--text,#fff);">' + esc(b.blocked_date) + timeRange + (b.reason ? ' — ' + esc(b.reason) : '') + '</span>'
                        + '<button onclick="cpDeleteBlock(\'' + esc(b.id) + '\',\'' + esc(pastorId) + '\')" style="background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.3);border-radius:6px;padding:3px 10px;font-size:.75rem;cursor:pointer;">✕</button>'
                        + '</div>';
                }).join('');
            }
        } catch(e) { if (el) el.innerHTML = ''; }
    };

    window.cpAddBlock = async function(pastorId) {
        var date  = ($('cp-block-date')||{}).value;
        var start = ($('cp-block-start')||{}).value || null;
        var end   = ($('cp-block-end')||{}).value   || null;
        if (!date) { toast('Selecione uma data para bloquear.', 'error'); return; }
        var row = { workspace_id: getWsId(), pastor_id: pastorId, blocked_date: date,
                    blocked_start: start, blocked_end: end };
        try {
            var { error } = await _sb().from('cafe_pastor_blocked_slots').insert(row);
            if (error) throw error;
            toast('Data bloqueada!', 'success');
            cpLoadBlocks(pastorId);
        } catch(err) { toast('Erro: ' + (err.message||err), 'error'); }
    };

    window.cpDeleteBlock = async function(blockId, pastorId) {
        try {
            var { error } = await _sb().from('cafe_pastor_blocked_slots').delete().eq('id', blockId);
            if (error) throw error;
            cpLoadBlocks(pastorId);
        } catch(err) { toast('Erro: ' + (err.message||err), 'error'); }
    };

    window.cpAvailToggleDay = function(dow) {
        var cb   = document.querySelector('.cp-avail-active[data-dow="' + dow + '"]');
        var ctrl = $('cp-avail-ctrl-' + dow);
        var lbl  = $('cp-avail-lbl-' + dow);
        if (cb && ctrl) { ctrl.style.display = cb.checked ? 'flex' : 'none'; }
        if (lbl) { lbl.style.color = cb && cb.checked ? '#d4a574' : 'rgba(255,255,255,.3)'; }
    };

    window.cpSaveAvailability = async function(pastorId) {
        var upserts = [];
        for (var dow = 1; dow <= 6; dow++) {
            var cb    = document.querySelector('.cp-avail-active[data-dow="' + dow + '"]');
            var start = document.querySelector('.cp-avail-start[data-dow="' + dow + '"]');
            var end   = document.querySelector('.cp-avail-end[data-dow="' + dow + '"]');
            var type  = document.querySelector('.cp-avail-type[data-dow="' + dow + '"]');
            upserts.push({
                workspace_id: getWsId(),
                pastor_id:    pastorId,
                day_of_week:  dow,
                start_time:   (start && start.value) || '09:00',
                end_time:     (end   && end.value)   || '17:00',
                session_type: (type  && type.value)  || 'both',
                is_active:    !!(cb && cb.checked),
            });
        }
        try {
            var { error } = await _sb().from('cafe_pastor_availability')
                .upsert(upserts, { onConflict: 'pastor_id,day_of_week' });
            if (error) throw error;
            toast('Horários salvos!','success');
            _cpCloseModal();
        } catch(err) { toast('Erro: '+(err.message||err),'error'); }
    };

    /* ═══════════════════════════════════════════════════════════════════
       PANEL 3 — CONFIGURAÇÕES
    ═══════════════════════════════════════════════════════════════════ */
    async function _cpRenderConfig() {
        var c = $('cp-panels-container');
        if (!c) return;
        c.innerHTML = '<div style="color:var(--text-muted,#6b7280);font-size:.88rem;text-align:center;padding:50px 0;">Carregando configurações...</div>';

        var cfg = _cpConfig || {};
        var wsSlug = _cpWsSlug || getWsId();
        var pubUrl = 'https://zelo.7prolabs.com/cafe-pastor.html?ws=' + encodeURIComponent(wsSlug);
        var typeCheck = function(v) { var t=cfg.session_types||['online','inperson']; return t.indexOf(v)>=0?' checked':''; };

        c.innerHTML =
            '<div style="max-width:620px;display:flex;flex-direction:column;gap:20px;">'

            // ── Block 1: Geral
            + '<div style="background:var(--bg-card-solid,#131318);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:14px;padding:24px;">'
            + '<h3 style="margin:0 0 18px;font-size:1rem;color:var(--text,#f0ede8);">⚙️ Configurações Gerais</h3>'

            + '<label style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:20px;padding:14px;background:rgba(212,165,116,.06);border:1px solid rgba(212,165,116,.15);border-radius:10px;">'
            + '<input type="checkbox" id="cp-cfg-enabled"' + (cfg.enabled?' checked':'') + ' style="width:18px;height:18px;accent-color:#d4a574;"/>'
            + '<div><div style="font-weight:600;color:var(--text,#fff);">Módulo habilitado</div>'
            + '<div style="font-size:.78rem;color:rgba(255,255,255,.35);">Permite acesso ao formulário público de agendamento.</div></div></label>'

            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">'
            + _field('Duração padrão (min)', '<input id="cp-cfg-dur" type="number" style="' + CSS_INPUT + '" value="' + (cfg.default_duration_minutes||60) + '" min="15" max="180" step="15"/>')
            + _field('Janela de agendamento (dias)', '<input id="cp-cfg-window" type="number" style="' + CSS_INPUT + '" value="' + (cfg.booking_window_days||30) + '" min="1" max="90"/>')
            + '</div>'

            + '<div style="margin-bottom:12px;">' + _field('Aviso mínimo (horas antes)', '<input id="cp-cfg-advance" type="number" style="' + CSS_INPUT + '" value="' + (cfg.min_advance_hours||24) + '" min="0" max="168"/>') + '</div>'

            + '<div style="margin-bottom:12px;"><label style="display:block;font-size:.79rem;font-weight:600;color:rgba(200,180,150,.9);margin-bottom:8px;">Tipos de sessão disponíveis</label>'
            + '<div style="display:flex;gap:20px;">'
            + '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;color:var(--text,#f0ede8);font-size:.88rem;"><input type="checkbox" id="cp-cfg-online"' + typeCheck('online') + ' style="accent-color:#d4a574;"/> 💻 Online</label>'
            + '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;color:var(--text,#f0ede8);font-size:.88rem;"><input type="checkbox" id="cp-cfg-inperson"' + typeCheck('inperson') + ' style="accent-color:#d4a574;"/> 🏛️ Presencial</label>'
            + '</div></div>'

            + '<div style="margin-bottom:12px;">' + _field('Endereço da Igreja (para sessões presenciais)', '<input id="cp-cfg-address" style="' + CSS_INPUT + '" value="' + esc(cfg.church_address||'') + '" placeholder="Rua, Número, Cidade"/>') + '</div>'

            + '<div style="margin-bottom:12px;">' + _field('Instruções Online (aparece no email de confirmação)',
                '<textarea id="cp-cfg-instructions" style="' + CSS_INPUT + 'resize:vertical;" rows="3" placeholder="Ex: Um link de Google Meet será enviado para o seu email antes da sessão.">'
                + esc(cfg.meeting_link_instructions||'') + '</textarea>') + '</div>'

            

            + '<button onclick="cpSaveConfig()" id="cp-cfg-save-btn" style="' + CSS_BTN_GOLD + 'width:100%;padding:13px;font-size:.95rem;">💾 Salvar Configurações</button>'
            + '</div>'

            // ── Block 2: Link público (SEM QR code)
            + '<div style="background:var(--bg-card-solid,#131318);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:14px;padding:24px;">'
            + '<h3 style="margin:0 0 10px;font-size:1rem;color:var(--text,#f0ede8);">🔗 Link Público de Agendamento</h3>'
            + '<p style="font-size:.82rem;color:rgba(255,255,255,.35);margin-bottom:12px;">Partilhe este link com os membros da sua comunidade.</p>'
            + '<div style="display:flex;gap:8px;">'
            + '<input type="text" id="cp-pub-url" readonly style="' + CSS_INPUT + 'flex:1;opacity:.75;cursor:default;" value="' + esc(pubUrl) + '"/>'
            + '<button onclick="navigator.clipboard.writeText(\'' + pubUrl.replace(/'/g,"\\'") + '\').then(function(){window.hubToast&&window.hubToast(\'Link copiado!\',\'success\');})" '
            + 'style="background:#252525;border:1px solid rgba(255,255,255,.15);color:#ccc;padding:0 14px;border-radius:8px;cursor:pointer;font-size:1rem;" title="Copiar link">📋</button>'
            + '<a href="' + esc(pubUrl) + '" target="_blank" style="background:#252525;border:1px solid rgba(255,255,255,.15);color:#ccc;padding:0 14px;border-radius:8px;cursor:pointer;font-size:1rem;text-decoration:none;display:flex;align-items:center;" title="Abrir">↗</a>'
            + '</div>'
            + '<div style="margin-top:16px;text-align:center;">'
            + '<p style="font-size:.75rem;color:var(--text-muted,#6b7280);margin-bottom:8px;">QR Code para o formulário público</p>'
            + '<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent(pubUrl) + '" style="border-radius:8px;border:4px solid rgba(212,165,116,.2);" alt="QR Code" />'
            + '</div>'
            + '</div>'

            + '</div>';
    }

    function _field(label, inputHtml) {
        return '<div>' + lbl(label) + inputHtml + '</div>';
    }

    window.cpSaveConfig = async function() {
        var wsId = getWsId();
        if (!wsId) { toast('Workspace não identificado.', 'error'); return; }

        var btn = $('cp-cfg-save-btn');
        if (btn) { btn.disabled = true; btn.innerText = 'Salvando...'; }

        var types = [];
        if (($('cp-cfg-online')||{}).checked)   types.push('online');
        if (($('cp-cfg-inperson')||{}).checked) types.push('inperson');

        var payload = {
            workspace_id:              wsId,
            enabled:                   !!($('cp-cfg-enabled')||{}).checked,
            default_duration_minutes:  parseInt(($('cp-cfg-dur')||{}).value)||60,
            booking_window_days:       parseInt(($('cp-cfg-window')||{}).value)||30,
            min_advance_hours:         parseInt(($('cp-cfg-advance')||{}).value)||24,
            session_types:             types,
            church_address:            ($('cp-cfg-address')||{}).value || null,
            meeting_link_instructions: ($('cp-cfg-instructions')||{}).value || null,
            updated_at:                new Date().toISOString(),
        };

        try {
            var { error } = await _sb().from('cafe_pastor_config')
                .upsert(payload, { onConflict: 'workspace_id' });
            if (error) throw error;
            _cpConfig = payload;
            toast('Configurações salvas!','success');
        } catch(err) {
            toast('Erro ao salvar: ' + (err.message||err), 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = '💾 Salvar Configurações'; }
        }
    };

    /* ═══════════════════════════════════════════════════════════════════
       PANEL 4 — PESSOAS ATENDIDAS
    ═══════════════════════════════════════════════════════════════════ */
    var _cpPessoasFilter = '';

    function _cpRenderPessoas() {
        var c = $('cp-panels-container');
        if (!c) return;

        // ── Compute per-pastor stats ──────────────────────────────────────
        var pastorStats = {};
        _cpPastors.forEach(function(p) {
            pastorStats[p.id] = { id: p.id, name: p.display_name, photo: p.photo_url, total: 0, completed: 0, pending: 0, unique: new Set() };
        });
        _cpAppts.forEach(function(a) {
            if (!a.pastor_id || !pastorStats[a.pastor_id]) return;
            var ps = pastorStats[a.pastor_id];
            if (a.status === 'cancelled' || a.status === 'no_show') return;
            ps.total++;
            if (a.status === 'completed') ps.completed++;
            else ps.pending++;
            var key = (a.requester_email || '').toLowerCase() || a.requester_name;
            if (key) ps.unique.add(key);
        });
        var statsArr = Object.values(pastorStats).filter(function(s){ return s.total > 0; })
            .sort(function(a,b){ return b.total - a.total; });
        var maxTotal = statsArr.length ? statsArr[0].total : 1;

        // ── Build people map (grouped by requester) ───────────────────────
        var map = {};
        _cpAppts.forEach(function(a) {
            if (a.status === 'cancelled' || a.status === 'no_show') return;
            var key = (a.requester_email || '').toLowerCase() || a.requester_name;
            if (!key) return;
            if (!map[key]) {
                map[key] = { name: a.requester_name, email: a.requester_email, phone: a.requester_phone,
                             sessions: [], lastAt: null, pastors: [] };
            }
            map[key].sessions.push(a);
            if (!map[key].lastAt || new Date(a.scheduled_at) > new Date(map[key].lastAt)) map[key].lastAt = a.scheduled_at;
            if (a.pastor_id && map[key].pastors.indexOf(a.pastor_id) < 0) map[key].pastors.push(a.pastor_id);
        });

        var allPeople = Object.values(map).sort(function(a,b){ return new Date(b.lastAt) - new Date(a.lastAt); });

        // Apply filter
        var people = allPeople;
        if (_cpPessoasFilter) {
            people = allPeople.filter(function(p){ return p.pastors.indexOf(_cpPessoasFilter) >= 0; });
        }

        // ── KPI bar cards per pastor ─────────────────────────────────────
        var pastorCards = statsArr.map(function(ps) {
            var pct = Math.round((ps.total / maxTotal) * 100);
            var avatar = ps.photo
                ? '<img src="' + esc(ps.photo) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(212,165,116,.4);" />'
                : '<div style="width:36px;height:36px;border-radius:50%;background:rgba(212,165,116,.2);display:flex;align-items:center;justify-content:center;font-size:1rem;">🧑‍💼</div>';
            var isActive = _cpPessoasFilter === ps.id;
            return '<div onclick="window.cpFilterPessoas(\'' + esc(ps.id) + '\')" style="cursor:pointer;background:' + (isActive ? 'rgba(212,165,116,.12)' : 'var(--bg-card-solid,#131318)') + ';border:1px solid ' + (isActive ? 'rgba(212,165,116,.5)' : 'var(--border,rgba(255,255,255,.07))') + ';border-radius:14px;padding:16px;transition:all .2s;">'
                + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">'
                + avatar
                + '<div><div style="font-weight:700;font-size:.88rem;color:var(--text,#fff);">' + esc(ps.name) + '</div>'
                + '<div style="font-size:.72rem;color:var(--text-muted,#6b7280);">' + ps.unique.size + ' pessoas únicas</div></div></div>'
                + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
                + '<div style="flex:1;height:8px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden;">'
                + '<div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#d4a574,#f0c070);border-radius:99px;transition:width .6s;"></div></div>'
                + '<span style="font-weight:700;font-size:.95rem;color:#d4a574;min-width:24px;text-align:right;">' + ps.total + '</span></div>'
                + '<div style="display:flex;gap:8px;">'
                + '<span style="font-size:.72rem;background:rgba(74,222,128,.1);color:#4ade80;border-radius:20px;padding:2px 8px;">✓ ' + ps.completed + ' concluídos</span>'
                + (ps.pending ? '<span style="font-size:.72rem;background:rgba(251,191,36,.1);color:#fbbf24;border-radius:20px;padding:2px 8px;">⏳ ' + ps.pending + ' pendentes</span>' : '')
                + '</div></div>';
        }).join('');

        // ── Table rows ────────────────────────────────────────────────────
        var rows = '';
        if (people.length === 0) {
            rows = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted,#6b7280);font-size:.88rem;">☕ '
                 + (_cpPessoasFilter ? 'Nenhuma pessoa encontrada para este pastor.' : 'Nenhuma pessoa atendida ainda.') + '</td></tr>';
        } else {
            people.forEach(function(p) {
                var pastorNames = p.pastors.map(function(pid) {
                    var pp = _cpPastors.find(function(x){ return x.id === pid; });
                    return pp ? pp.display_name : '—';
                }).join(', ');
                var recurBadge = p.sessions.length > 1
                    ? '<span style="margin-left:6px;font-size:.68rem;background:rgba(212,165,116,.15);color:#d4a574;border-radius:20px;padding:1px 7px;">↩ recorrente</span>' : '';
                rows += '<tr class="cp-table-row">'
                    + '<td style="padding:11px 14px;"><div style="font-weight:600;color:var(--text,#fff);">' + esc(p.name||'—') + recurBadge + '</div>'
                    +     '<div style="font-size:.73rem;color:var(--text-muted,#6b7280);">' + esc(p.email||'') + '</div></td>'
                    + '<td style="padding:11px 14px;color:var(--text-muted,#6b7280);font-size:.84rem;">' + esc(p.phone||'—') + '</td>'
                    + '<td style="padding:11px 14px;text-align:center;"><span style="background:rgba(212,165,116,.15);color:#d4a574;border:1px solid rgba(212,165,116,.3);border-radius:20px;padding:2px 12px;font-weight:700;">' + p.sessions.length + '</span></td>'
                    + '<td style="padding:11px 14px;color:var(--text,#fff);font-size:.84rem;">' + esc(fmtDT(p.lastAt)) + '</td>'
                    + '<td style="padding:11px 14px;font-size:.82rem;color:var(--text-muted,#6b7280);">' + esc(pastorNames||'—') + '</td>'
                    + '</tr>';
            });
        }

        // ── CSV export helper ─────────────────────────────────────────────
        window.cpExportPessoas = function() {
            var header = 'Nome,Email,Telefone,Total Sessões,Última Sessão,Pastor(es)\n';
            var csv = header + allPeople.map(function(p) {
                return [
                    '"' + (p.name||'').replace(/"/g,'""') + '"',
                    '"' + (p.email||'').replace(/"/g,'""') + '"',
                    '"' + (p.phone||'').replace(/"/g,'""') + '"',
                    p.sessions.length,
                    '"' + fmtDT(p.lastAt) + '"',
                    '"' + p.pastors.map(function(pid){ var pp = _cpPastors.find(function(x){return x.id===pid;}); return pp ? pp.display_name : pid; }).join('; ') + '"'
                ].join(',');
            }).join('\n');
            var blob = new Blob([csv], { type: 'text/csv' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'cafe-pastor-pessoas.csv';
            a.click();
            toast('CSV baixado!', 'success');
        };

        window.cpFilterPessoas = function(pastorId) {
            _cpPessoasFilter = (_cpPessoasFilter === pastorId) ? '' : pastorId;
            _cpRenderPessoas();
        };

        // ── Render ─────────────────────────────────────────────────────────
        c.innerHTML =
            // Top bar
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">'
            + '<div>'
            +   '<h3 style="font-size:1.05rem;margin:0 0 2px;color:var(--text,#fff);">👥 Pessoas Atendidas</h3>'
            +   '<div style="font-size:.78rem;color:var(--text-muted,#6b7280);">' + allPeople.length + ' pessoas · ' + _cpAppts.filter(function(a){ return a.status !== 'cancelled' && a.status !== 'no_show'; }).length + ' atendimentos'
            +   (_cpPessoasFilter ? ' · <span style="color:#d4a574;">Filtrado por pastor</span>' : '') + '</div>'
            + '</div>'
            + '<button onclick="window.cpExportPessoas()" style="' + CSS_BTN_GHOST + 'font-size:.8rem;padding:7px 13px;">⬇️ Exportar CSV</button>'
            + '</div>'

            // Pastor KPI cards
            + (statsArr.length
                ? '<div style="margin-bottom:22px;">'
                +   '<div style="font-size:.72rem;font-weight:700;color:rgba(212,165,116,.7);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;">Clique num pastor para filtrar</div>'
                +   '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;">'
                +   pastorCards
                +   '</div></div>'
                : '')

            // Table
            + '<div style="overflow-x:auto;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.07));">'
            + '<table style="width:100%;border-collapse:collapse;">'
            + '<thead><tr style="background:var(--bg-card-solid,#131318);border-bottom:2px solid rgba(212,165,116,.3);">'
            + ['Nome / Email','Telefone','Sessões','Última Sessão','Pastor Habitual'].map(function(h){
                return '<th style="padding:11px 14px;text-align:left;font-size:.72rem;font-weight:700;color:#d4a574;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;">' + h + '</th>';
              }).join('')
            + '</tr></thead>'
            + '<tbody>' + rows + '</tbody>'
            + '</table></div>';
    }

    /* ═══════════════════════════════════════════════════════════════════
       GENERIC MODAL
    ═══════════════════════════════════════════════════════════════════ */
    function _cpModal(title, body, footer) {
        _cpCloseModal();
        var html = '<div id="cp-modal-overlay" style="position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)cpCloseModal();">'
            + '<div style="background:var(--bg-deep,#0d0d0f);border:1px solid rgba(212,165,116,.2);border-radius:18px;padding:28px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;">'
            + '<h3 style="margin:0;font-size:1.05rem;color:var(--text,#f0ede8);">☕ ' + esc(title) + '</h3>'
            + '<button onclick="cpCloseModal()" style="background:rgba(255,255,255,.08);border:none;color:#aaa;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:1rem;">✕</button>'
            + '</div>'
            + '<div style="margin-bottom:20px;">' + body + '</div>'
            + (footer ? '<div>' + footer + '</div>' : '')
            + '</div></div>';
        document.body.insertAdjacentHTML('beforeend', html);
    }
    window.cpCloseModal  = function() { _cpCloseModal(); };
    function _cpCloseModal() { var m=$('cp-modal-overlay'); if(m) m.remove(); }

    console.log('[CafePastor] v4 ready — window._cpLoadData exposed.');
})();
