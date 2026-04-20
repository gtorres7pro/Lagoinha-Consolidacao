// hub-cafe-pastor.js — Café com Pastor — Admin Module (v3)
// Triggered by hub-dashboard.js base switchTab via window._cpLoadData

(function () {
    'use strict';

    /* ─── STATE ─────────────────────────────────────────────────────────── */
    var _cpConfig    = {};
    var _cpPastors   = [];
    var _cpAppts     = [];
    var _cpPanel     = 'agenda';
    var _cpApptFilter = { pastor: '', status: '', period: '30' };

    /* ─── HELPERS ───────────────────────────────────────────────────────── */
    var $ = function(id) { return document.getElementById(id); };
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var fmtDate = function(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    };
    var fmtDateOnly = function(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('pt-BR');
    };
    var STATUS = {
        pending:   { label:'Pendente',   color:'#FBBF24' },
        confirmed: { label:'Confirmado', color:'#60A5FA' },
        completed: { label:'Concluído',  color:'#4ADE80' },
        cancelled: { label:'Cancelado',  color:'#F87171' },
        no_show:   { label:'Não veio',   color:'#A78BFA' },
    };
    var loader = '<div style="padding:50px;text-align:center;"><div class="hub-loader"></div></div>';
    var empty  = function(msg) { return '<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,.35);font-size:.9rem;">' + esc(msg) + '</div>'; };

    /* ═══════════════════════════════════════════════════════════════════
       MAIN ENTRY — exposed as window._cpLoadData
    ═══════════════════════════════════════════════════════════════════ */
    window._cpLoadData = async function () {
        // Support both globals — hub-dashboard.js sets window.currentWorkspaceId
        var wsId = window._currentWsId || window.currentWorkspaceId || window._currentWorkspace?.id;
        if (!wsId) { console.warn('[CP] No workspace ID'); return; }
        // Normalise to one global
        window._currentWsId = wsId;
        var c = $('cp-panels-container');
        if (c) c.innerHTML = loader;

        try {
            // 1. Config
            var r1 = await window.supabase.from('cafe_pastor_config').select('*')
                .eq('workspace_id', window._currentWsId).maybeSingle();
            _cpConfig = r1.data || {};

            // 2. Pastors
            var r2 = await window.supabase.from('cafe_pastor_pastors')
                .select('*').eq('workspace_id', window._currentWsId).order('display_name');
            _cpPastors = r2.data || [];

            // 3. Appointments (last 90 days + future)
            var since = new Date(Date.now() - 90*24*60*60*1000).toISOString();
            var r3 = await window.supabase.from('cafe_pastor_appointments')
                .select('*').eq('workspace_id', window._currentWsId)
                .gte('scheduled_at', since)
                .order('scheduled_at', { ascending: false });
            _cpAppts = r3.data || [];

            window.cpSwitchPanel(_cpPanel);
        } catch(err) {
            console.error('[CP] load error:', err);
            var cx = $('cp-panels-container');
            if (cx) cx.innerHTML = empty('Erro ao carregar dados: ' + (err.message || err));
        }
    };

    /* ═══════════════════════════════════════════════════════════════════
       INTERNAL TAB SWITCHER
    ═══════════════════════════════════════════════════════════════════ */
    window.cpSwitchPanel = function(panel) {
        _cpPanel = panel;
        ['agenda','pastores','config'].forEach(function(p) {
            var b = $('cp-tab-' + p);
            if (!b) return;
            b.style.background = p === panel ? 'var(--bg-card)' : 'transparent';
            b.style.color      = p === panel ? 'var(--text)'    : 'var(--text-muted)';
            b.style.border     = p === panel ? '1px solid var(--border)' : '1px solid transparent';
        });
        if (panel === 'agenda')        _cpRenderAgenda();
        else if (panel === 'pastores') _cpRenderPastores();
        else if (panel === 'config')   _cpRenderConfig();
    };

    /* ═══════════════════════════════════════════════════════════════════
       PANEL 1 — AGENDA
    ═══════════════════════════════════════════════════════════════════ */
    function _cpRenderAgenda() {
        var c = $('cp-panels-container');
        if (!c) return;

        // Filter
        var period = _cpApptFilter.period;
        var since = new Date(Date.now() - parseInt(period||'30')*24*60*60*1000).toISOString();
        var list = _cpAppts.filter(function(a) {
            if (_cpApptFilter.status && a.status !== _cpApptFilter.status) return false;
            if (_cpApptFilter.pastor && a.pastor_id !== _cpApptFilter.pastor) return false;
            if (a.scheduled_at < since) return false;
            return true;
        });

        // KPIs
        var today = new Date(); today.setHours(0,0,0,0);
        var weekEnd = new Date(today.getTime()+7*24*60*60*1000);
        var kConfirmed = list.filter(function(a){return a.status==='confirmed';}).length;
        var kCompleted = list.filter(function(a){return a.status==='completed';}).length;
        var kThisWeek  = list.filter(function(a){
            var d=new Date(a.scheduled_at); return d>=today && d<weekEnd;
        }).length;
        var kCancelled = list.filter(function(a){return a.status==='cancelled'||a.status==='no_show';}).length;

        // Pastor dropdown options
        var pastOpts = '<option value="">Todos os Pastores</option>' + _cpPastors.map(function(p){
            return '<option value="'+esc(p.id)+'"'+(p.id===_cpApptFilter.pastor?' selected':'')+'>'+esc(p.display_name)+'</option>';
        }).join('');
        var statOpts = [
            ['','Todos os Status'],['pending','Pendente'],['confirmed','Confirmado'],
            ['completed','Concluído'],['cancelled','Cancelado'],['no_show','Não veio']
        ].map(function(x){return '<option value="'+x[0]+'"'+(x[0]===_cpApptFilter.status?' selected':'')+'>'+x[1]+'</option>';}).join('');
        var perOpts = [['7','Últimos 7 dias'],['30','Últimos 30 dias'],['90','Últimos 90 dias']].map(function(x){
            return '<option value="'+x[0]+'"'+(_cpApptFilter.period===x[0]?' selected':'')+'>'+x[1]+'</option>';
        }).join('');

        var rows = '';
        if (list.length === 0) {
            rows = '<tr><td colspan="6" style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">☕ Nenhum agendamento encontrado para os filtros selecionados.</td></tr>';
        } else {
            list.forEach(function(a) {
                var pastor = _cpPastors.find(function(p){return p.id===a.pastor_id || p.user_id===a.pastor_id;});
                var pName = pastor ? esc(pastor.display_name) : '<span style="color:rgba(255,255,255,.3)">—</span>';
                var s = STATUS[a.status] || {label:a.status, color:'#aaa'};
                var badge = '<span style="background:'+s.color+'22;color:'+s.color+';border:1px solid '+s.color+'44;border-radius:20px;padding:2px 10px;font-size:.73rem;font-weight:600;">'+s.label+'</span>';
                var typeIcon = a.appointment_type==='online' ? '💻' : (a.appointment_type==='inperson' ? '🏛️' : '');
                rows += '<tr>'
                    + '<td><div style="font-weight:600;">'+esc(a.requester_name||'—')+'</div><div style="font-size:.75rem;color:var(--text-dim);">'+esc(a.requester_phone||a.requester_email||'')+'</div></td>'
                    + '<td>'+pName+'</td>'
                    + '<td><div style="font-weight:600;">'+fmtDate(a.scheduled_at)+'</div></td>'
                    + '<td style="text-align:center;">'+typeIcon+'</td>'
                    + '<td>'+badge+'</td>'
                    + '<td><button onclick="cpOpenAppt(\''+esc(a.id)+'\')" style="background:transparent;border:1px solid rgba(212,165,116,.4);color:#d4a574;border-radius:6px;padding:4px 10px;font-size:.78rem;cursor:pointer;font-weight:600;">Detalhes</button></td>'
                    + '</tr>';
            });
        }

        c.innerHTML =
            // KPIs
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;">'
            + _kpi('Total','#60A5FA',list.length,'no período')
            + _kpi('Confirmados','#60A5FA',kConfirmed,'aguardando')
            + _kpi('Concluídos','#4ADE80',kCompleted,'realizados')
            + _kpi('Esta semana','#d4a574',kThisWeek,'agendados')
            + _kpi('Cancelados','#F87171',kCancelled,'desistências')
            + '</div>'

            // Controls bar
            + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">'
            + '<select id="cp-f-pastor" onchange="cpApplyFilter()" style="'+_sel()+'">'+pastOpts+'</select>'
            + '<select id="cp-f-status" onchange="cpApplyFilter()" style="'+_sel()+'">'+statOpts+'</select>'
            + '<select id="cp-f-period" onchange="cpApplyFilter()" style="'+_sel()+'">'+perOpts+'</select>'
            + '<button onclick="cpAddAppt()" style="margin-left:auto;background:rgba(212,165,116,.15);color:#d4a574;border:1px solid rgba(212,165,116,.4);padding:7px 14px;border-radius:8px;font-weight:600;font-size:.84rem;cursor:pointer;">+ Novo Agendamento</button>'
            + '</div>'

            // Table
            + '<div class="hub-table-wrapper"><table class="hub-table" style="width:100%">'
            + '<thead><tr><th>Solicitante</th><th>Pastor</th><th>Data / Hora</th><th style="text-align:center">Tipo</th><th>Status</th><th>Ação</th></tr></thead>'
            + '<tbody>'+rows+'</tbody></table></div>';
    }

    function _kpi(title, color, val, sub) {
        return '<div style="background:var(--bg-elevated);border:1px solid var(--border-light);border-radius:12px;padding:16px;">'
            + '<div style="font-size:.75rem;color:var(--text-dim);margin-bottom:4px;">'+esc(title)+'</div>'
            + '<div style="font-size:1.8rem;font-weight:700;color:'+esc(color)+';">'+val+'</div>'
            + '<div style="font-size:.72rem;color:var(--text-muted);margin-top:2px;">'+esc(sub)+'</div>'
            + '</div>';
    }

    function _sel() { return 'background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:7px 12px;color:var(--text);font-size:.83rem;outline:none;cursor:pointer;'; }

    window.cpApplyFilter = function() {
        _cpApptFilter.pastor = ($('cp-f-pastor')||{}).value || '';
        _cpApptFilter.status = ($('cp-f-status')||{}).value || '';
        _cpApptFilter.period = ($('cp-f-period')||{}).value || '30';
        _cpRenderAgenda();
    };

    /* ─── APPOINTMENT DETAIL SIDE PANEL ───────────────────────────────── */
    window.cpOpenAppt = function(apptId) {
        var a = _cpAppts.find(function(x){return x.id===apptId;});
        if (!a) return;
        var pastor = _cpPastors.find(function(p){return p.id===a.pastor_id||p.user_id===a.pastor_id;});
        var s = STATUS[a.status]||{label:a.status,color:'#aaa'};
        var briefing = '';
        if (a.briefing_data && typeof a.briefing_data === 'object') {
            briefing = Object.entries(a.briefing_data).map(function(kv){
                return '<tr><td style="color:var(--text-dim);font-size:.8rem;padding:4px 8px 4px 0;white-space:nowrap;">'+esc(kv[0])+'</td><td style="font-size:.85rem;padding:4px 0;">'+esc(kv[1])+'</td></tr>';
            }).join('');
        }
        var statusOpts = Object.keys(STATUS).map(function(k){
            return '<option value="'+k+'"'+(a.status===k?' selected':'')+'>'+STATUS[k].label+'</option>';
        }).join('');

        var html =
            '<div id="cp-appt-panel" style="position:fixed;top:0;right:0;width:420px;max-width:95vw;height:100vh;background:#111;border-left:1px solid rgba(212,165,116,.25);z-index:3000;overflow-y:auto;box-shadow:-10px 0 40px rgba(0,0,0,.5);">'
            + '<div style="padding:24px;">'

            // Header
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">'
            + '<div><div style="font-size:1rem;font-weight:700;">☕ Detalhes do Agendamento</div>'
            + '<div style="font-size:.78rem;color:var(--text-dim);margin-top:2px;">'+fmtDate(a.scheduled_at)+'</div></div>'
            + '<button onclick="document.getElementById(\'cp-appt-panel\').remove()" style="background:transparent;border:none;color:var(--text-muted);font-size:1.3rem;cursor:pointer;">✕</button>'
            + '</div>'

            // Badge + type
            + '<div style="display:flex;gap:10px;align-items:center;margin-bottom:20px;">'
            + '<span style="background:'+s.color+'22;color:'+s.color+';border:1px solid '+s.color+'44;border-radius:20px;padding:3px 12px;font-size:.8rem;font-weight:600;">'+s.label+'</span>'
            + (a.appointment_type ? '<span style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:3px 12px;font-size:.8rem;">'+(a.appointment_type==='online'?'💻 Online':'🏛️ Presencial')+'</span>' : '')
            + '</div>'

            // Solicitante
            + _section('👤 Solicitante',
                _row('Nome', a.requester_name)
                + _row('Email', a.requester_email)
                + _row('Telefone', a.requester_phone)
                + _row('Gênero', a.requester_gender==='M'?'Masculino':a.requester_gender==='F'?'Feminino':a.requester_gender==='couple'?'Casal':a.requester_gender==='family'?'Família':a.requester_gender)
            )

            // Pastor
            + _section('👨‍⚖️ Pastor Designado',
                _row('Pastor', pastor ? pastor.display_name : '—')
            )

            // Briefing
            + (briefing ? _section('📋 Briefing', '<table style="width:100%">'+briefing+'</table>') : '')

            // Session link (editable)
            + _section('🔗 Link da Sessão',
                '<input id="cp-appt-link" type="url" class="hub-field-input" style="width:100%;margin-bottom:8px;" placeholder="https://meet.google.com/..." value="'+esc(a.session_link||'')+'"/>'
            )

            // Pastor notes (editable)
            + _section('📝 Notas do Pastor',
                '<textarea id="cp-appt-notes" class="hub-field-input" rows="4" style="width:100%;resize:vertical;margin-bottom:8px;" placeholder="Anotações privadas (visíveis apenas para o pastor e admin)...">'+esc(a.pastor_notes||'')+'</textarea>'
            )

            // Status change
            + _section('⚙️ Atualizar Status',
                '<select id="cp-appt-status" class="hub-field-input" style="width:100%;margin-bottom:8px;">'+statusOpts+'</select>'
            )

            // Actions
            + '<div style="display:flex;gap:10px;margin-top:4px;">'
            + '<button onclick="cpSaveAppt(\''+esc(a.id)+'\')" style="flex:1;background:#d4a574;color:#111;border:none;padding:12px;border-radius:10px;font-weight:700;cursor:pointer;">💾 Salvar</button>'
            + '<button onclick="document.getElementById(\'cp-appt-panel\').remove()" style="flex:1;background:rgba(255,255,255,.05);color:var(--text);border:1px solid rgba(255,255,255,.1);padding:12px;border-radius:10px;font-weight:600;cursor:pointer;">Fechar</button>'
            + '</div>'

            + '</div></div>';

        // Remove any existing panel and insert
        var existing = $('cp-appt-panel');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', html);
    };

    window.cpSaveAppt = async function(apptId) {
        var link  = ($('cp-appt-link')||{}).value || null;
        var notes = ($('cp-appt-notes')||{}).value || null;
        var status= ($('cp-appt-status')||{}).value || null;
        try {
            var { error } = await window.supabase.from('cafe_pastor_appointments')
                .update({ session_link: link, pastor_notes: notes, status: status, updated_at: new Date().toISOString() })
                .eq('id', apptId);
            if (error) throw error;
            // Update local state
            var idx = _cpAppts.findIndex(function(a){return a.id===apptId;});
            if (idx>=0) { _cpAppts[idx].session_link=link; _cpAppts[idx].pastor_notes=notes; _cpAppts[idx].status=status; }
            window.hubToast && window.hubToast('Agendamento atualizado!','success');
            var p=$('cp-appt-panel'); if(p) p.remove();
            _cpRenderAgenda();
        } catch(err) {
            window.hubToast && window.hubToast('Erro: '+(err.message||err),'error');
        }
    };

    window.cpAddAppt = function() {
        window.hubToast && window.hubToast('Use o formulário público para adicionar agendamentos.','info');
    };

    function _section(title, body) {
        return '<div style="margin-bottom:18px;"><div style="font-size:.8rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">'+esc(title)+'</div>'+body+'</div>';
    }
    function _row(k, v) {
        return '<div style="display:flex;gap:8px;margin-bottom:6px;font-size:.85rem;"><span style="color:var(--text-dim);min-width:70px;">'+esc(k)+'</span><span>'+esc(v||'—')+'</span></div>';
    }

    /* ═══════════════════════════════════════════════════════════════════
       PANEL 2 — PASTORES
    ═══════════════════════════════════════════════════════════════════ */
    function _cpRenderPastores() {
        var c = $('cp-panels-container');
        if (!c) return;

        var cards = '';
        if (_cpPastors.length === 0) {
            cards = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;background:var(--bg-elevated);border-radius:14px;border:1px dashed var(--border);">'
                + '<div style="font-size:3rem;margin-bottom:12px;">🧑‍⚖️</div>'
                + '<div style="font-weight:600;margin-bottom:6px;">Nenhum pastor configurado</div>'
                + '<div style="font-size:.85rem;color:var(--text-muted);">Clique em "+ Adicionar Pastor" para vincular um pastor do Zelo ao módulo de agendamentos.</div>'
                + '</div>';
        } else {
            _cpPastors.forEach(function(p) {
                var appts = _cpAppts.filter(function(a){return a.pastor_id===p.id && a.status==='confirmed';}).length;
                var done  = _cpAppts.filter(function(a){return a.pastor_id===p.id && a.status==='completed';}).length;
                var photo = p.photo_url || ('https://ui-avatars.com/api/?name='+encodeURIComponent(p.display_name||'P')+'&background=3d2a1a&color=d4a574&bold=true&size=100');
                cards += '<div style="background:var(--bg-elevated);border:1px solid var(--border-light);border-radius:14px;padding:20px;">'
                    + '<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px;">'
                    + '<img src="'+esc(photo)+'" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid rgba(212,165,116,.4);flex-shrink:0;" />'
                    + '<div style="flex:1;min-width:0;">'
                    + '<div style="font-weight:700;font-size:.95rem;">'+esc(p.display_name||'—')+'</div>'
                    + '<div style="font-size:.78rem;color:var(--text-dim);margin-top:2px;">'+( p.gender==='M'?'👨 Masculino':p.gender==='F'?'👩 Feminino':'Gênero indefinido')+'</div>'
                    + (p.bio ? '<div style="font-size:.77rem;color:var(--text-muted);margin-top:5px;line-height:1.4;">'+esc(p.bio.substring(0,80))+(p.bio.length>80?'...':'')+'</div>' : '')
                    + '</div>'
                    + '<span style="background:'+(p.is_active?'rgba(74,222,128,.1)':'rgba(248,113,113,.1)')+';color:'+(p.is_active?'#4ADE80':'#F87171')+';border:1px solid '+(p.is_active?'rgba(74,222,128,.3)':'rgba(248,113,113,.3)')+';border-radius:20px;padding:2px 9px;font-size:.72rem;font-weight:600;flex-shrink:0;">'+(p.is_active?'Ativo':'Inativo')+'</span>'
                    + '</div>'
                    + '<div style="display:flex;gap:8px;margin-bottom:12px;">'
                    + '<div style="flex:1;background:rgba(96,165,250,.06);border:1px solid rgba(96,165,250,.2);border-radius:8px;padding:8px;text-align:center;"><div style="font-size:1.2rem;font-weight:700;color:#60A5FA;">'+appts+'</div><div style="font-size:.7rem;color:var(--text-dim);">Confirmados</div></div>'
                    + '<div style="flex:1;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2);border-radius:8px;padding:8px;text-align:center;"><div style="font-size:1.2rem;font-weight:700;color:#4ADE80;">'+done+'</div><div style="font-size:.7rem;color:var(--text-dim);">Concluídos</div></div>'
                    + '</div>'
                    + '<div style="display:flex;gap:8px;">'
                    + '<button onclick="cpEditPastor(\''+esc(p.id)+'\')" style="flex:1;background:rgba(212,165,116,.1);color:#d4a574;border:1px solid rgba(212,165,116,.3);padding:7px;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;">✏️ Editar</button>'
                    + '<button onclick="cpManageAvailability(\''+esc(p.id)+'\')" style="flex:1;background:rgba(96,165,250,.1);color:#60A5FA;border:1px solid rgba(96,165,250,.3);padding:7px;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;">🗓️ Horários</button>'
                    + '</div>'
                    + '</div>';
            });
        }

        c.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">'
            + '<h3 style="font-size:1.1rem;margin:0;">Pastores do Módulo</h3>'
            + '<button onclick="cpAddPastor()" style="background:rgba(212,165,116,.15);color:#d4a574;border:1px solid rgba(212,165,116,.4);padding:7px 14px;border-radius:8px;font-weight:600;font-size:.84rem;cursor:pointer;">+ Adicionar Pastor</button>'
            + '</div>'
            + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">'+cards+'</div>';
    }

    /* ─── PASTOR CRUD MODAL ───────────────────────────────────────────── */
    window.cpAddPastor = function() { _cpPastorModal(null); };
    window.cpEditPastor = function(id) { _cpPastorModal(_cpPastors.find(function(p){return p.id===id;})||null); };

    function _cpPastorModal(pastor) {
        var existing = $('cp-pastor-modal-overlay');
        if (existing) existing.remove();

        var p = pastor || {};
        var isNew = !p.id;
        var html = '<div id="cp-pastor-modal-overlay" style="position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)this.remove();">'
            + '<div style="background:#141414;border:1px solid rgba(212,165,116,.2);border-radius:18px;padding:28px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;">'

            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;">'
            + '<h3 style="margin:0;font-size:1.1rem;">☕ '+(isNew?'Adicionar':'Editar')+' Pastor</h3>'
            + '<button onclick="document.getElementById(\'cp-pastor-modal-overlay\').remove()" style="background:transparent;border:none;color:var(--text-muted);font-size:1.2rem;cursor:pointer;">✕</button>'
            + '</div>'

            + '<div style="margin-bottom:14px;"><label style="'+_lbl()+'">Nome de Exibição *</label>'
            + '<input id="cppm-name" class="hub-field-input" style="width:100%;" value="'+esc(p.display_name||'')+'" placeholder="Ex: Pastor João" /></div>'

            + '<div style="margin-bottom:14px;"><label style="'+_lbl()+'">Gênero *</label>'
            + '<select id="cppm-gender" class="hub-field-input" style="width:100%;">'
            + '<option value="M"'+(p.gender==='M'?' selected':'')+'>Masculino</option>'
            + '<option value="F"'+(p.gender==='F'?' selected':'')+'>Feminino</option>'
            + '</select></div>'

            + '<div style="margin-bottom:14px;"><label style="'+_lbl()+'">Bio (opcional)</label>'
            + '<textarea id="cppm-bio" class="hub-field-input" rows="3" style="width:100%;resize:vertical;">'+esc(p.bio||'')+'</textarea></div>'

            + '<div style="margin-bottom:14px;"><label style="'+_lbl()+'">Duração padrão da sessão (min)</label>'
            + '<input id="cppm-duration" type="number" class="hub-field-input" style="width:100%;" value="'+(p.session_duration_minutes||60)+'" min="15" max="180" step="15"/></div>'

            + '<div style="margin-bottom:14px;"><label style="'+_lbl()+'">Máx. sessões por semana</label>'
            + '<input id="cppm-maxsess" type="number" class="hub-field-input" style="width:100%;" value="'+(p.max_weekly_sessions||10)+'" min="1" max="50"/></div>'

            + '<div style="margin-bottom:14px;"><label style="'+_lbl()+'">URL da foto (opcional)</label>'
            + '<input id="cppm-photo" type="url" class="hub-field-input" style="width:100%;" value="'+esc(p.photo_url||'')+'" placeholder="https://..." /></div>'

            + '<div style="margin-bottom:20px;display:flex;align-items:center;gap:10px;">'
            + '<input type="checkbox" id="cppm-active"'+(p.is_active!==false?' checked':'')+' style="width:16px;height:16px;accent-color:#d4a574;"/>'
            + '<label for="cppm-active" style="font-size:.9rem;cursor:pointer;">Pastor ativo (aceita novos agendamentos)</label></div>'

            + '<div style="display:flex;gap:10px;">'
            + '<button onclick="cpSavePastor(\''+esc(p.id||'')+'\','+isNew+')" style="flex:1;background:#d4a574;color:#111;border:none;padding:12px;border-radius:10px;font-weight:700;cursor:pointer;">💾 Salvar</button>'
            + (!isNew ? '<button onclick="cpTogglePastor(\''+esc(p.id)+'\','+(!p.is_active)+')" style="flex:0 0 auto;background:rgba(255,255,255,.05);color:var(--text-muted);border:1px solid rgba(255,255,255,.1);padding:12px 16px;border-radius:10px;cursor:pointer;">'+(p.is_active?'Desativar':'Ativar')+'</button>' : '')
            + '</div>'
            + '</div></div>';

        document.body.insertAdjacentHTML('beforeend', html);
    }

    function _lbl() { return 'display:block;font-size:.83rem;font-weight:600;color:var(--text-dim);margin-bottom:6px;'; }

    window.cpSavePastor = async function(id, isNew) {
        var name    = ($('cppm-name')||{}).value||'';
        var gender  = ($('cppm-gender')||{}).value||'M';
        var bio     = ($('cppm-bio')||{}).value||null;
        var dur     = parseInt(($('cppm-duration')||{}).value)||60;
        var maxS    = parseInt(($('cppm-maxsess')||{}).value)||10;
        var photo   = ($('cppm-photo')||{}).value||null;
        var active  = ($('cppm-active')||{}).checked!==false;
        if (!name) { window.hubToast&&window.hubToast('O nome é obrigatório.','error'); return; }

        var payload = {
            workspace_id: window._currentWsId,
            display_name: name, gender: gender, bio: bio,
            session_duration_minutes: dur, max_weekly_sessions: maxS,
            photo_url: photo, is_active: active
        };
        try {
            if (isNew) {
                var r = await window.supabase.from('cafe_pastor_pastors').insert(payload).select().single();
                if (r.error) throw r.error;
                _cpPastors.push(r.data);
            } else {
                var r2 = await window.supabase.from('cafe_pastor_pastors').update(payload).eq('id',id).select().single();
                if (r2.error) throw r2.error;
                var idx=_cpPastors.findIndex(function(p){return p.id===id;}); if(idx>=0) _cpPastors[idx]=r2.data;
            }
            window.hubToast&&window.hubToast('Pastor salvo!','success');
            var ov=$('cp-pastor-modal-overlay'); if(ov) ov.remove();
            _cpRenderPastores();
        } catch(err) { window.hubToast&&window.hubToast('Erro: '+(err.message||err),'error'); }
    };

    window.cpTogglePastor = async function(id, newActive) {
        try {
            var { error } = await window.supabase.from('cafe_pastor_pastors').update({is_active:newActive}).eq('id',id);
            if (error) throw error;
            var idx=_cpPastors.findIndex(function(p){return p.id===id;}); if(idx>=0) _cpPastors[idx].is_active=newActive;
            window.hubToast&&window.hubToast('Pastor '+(newActive?'ativado':'desativado')+'!','success');
            var ov=$('cp-pastor-modal-overlay'); if(ov) ov.remove();
            _cpRenderPastores();
        } catch(err) { window.hubToast&&window.hubToast('Erro: '+(err.message||err),'error'); }
    };

    window.cpManageAvailability = function(pastorId) {
        window.hubToast&&window.hubToast('Gestão de disponibilidade em breve.','info');
    };

    /* ═══════════════════════════════════════════════════════════════════
       PANEL 3 — CONFIGURAÇÕES
    ═══════════════════════════════════════════════════════════════════ */
    async function _cpRenderConfig() {
        var c = $('cp-panels-container');
        if (!c) return;
        c.innerHTML = loader;

        // Fetch forms for dropdown
        var forms = [];
        try {
            var rf = await window.supabase.from('form_builder_forms').select('id, title').eq('workspace_id', window._currentWsId);
            forms = rf.data || [];
        } catch(e) { /* form_builder might not have data */ }

        var cfg = _cpConfig || {};
        var wsSlug = (window._currentWorkspace && window._currentWorkspace.slug) || window._currentWsId || '';
        var pubUrl = 'https://zelo.7prolabs.com/cafe-pastor.html?ws=' + wsSlug;
        var formOpts = '<option value="">(Nenhum)</option>' + forms.map(function(f){
            return '<option value="'+esc(f.id)+'"'+(cfg.booking_form_id===f.id?' selected':'')+'>'+esc(f.title)+'</option>';
        }).join('');
        var typeCheck = function(v) { var t=cfg.session_types||['online','inperson']; return t.indexOf(v)>=0?' checked':''; };

        c.innerHTML =
            '<div style="max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:20px;">'

            // Block: Module settings
            + '<div style="background:var(--bg-elevated);padding:24px;border-radius:14px;border:1px solid var(--border-light);">'
            + '<h3 style="margin:0 0 18px;font-size:1.05rem;">⚙️ Configurações Gerais</h3>'

            + '<label style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:20px;padding:14px;background:rgba(212,165,116,.06);border-radius:10px;border:1px solid rgba(212,165,116,.2);">'
            + '<input type="checkbox" id="cp-cfg-enabled"'+(cfg.enabled?' checked':'')+' style="width:18px;height:18px;accent-color:#d4a574;"/>'
            + '<div><div style="font-weight:600;">Módulo habilitado</div>'
            + '<div style="font-size:.8rem;color:var(--text-dim);">Permite que membros acessem o formulário público de agendamento.</div></div></label>'

            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">'
            + _field('Duração padrão (min)', '<input id="cp-cfg-dur" type="number" class="hub-field-input" style="width:100%;" value="'+(cfg.default_duration_minutes||60)+'" min="15" max="180" step="15"/>')
            + _field('Janela de agendamento (dias)', '<input id="cp-cfg-window" type="number" class="hub-field-input" style="width:100%;" value="'+(cfg.booking_window_days||30)+'" min="1" max="90"/>')
            + '</div>'

            + '<div style="margin-bottom:14px;">'+_field('Aviso mínimo (horas antes)', '<input id="cp-cfg-advance" type="number" class="hub-field-input" style="width:100%;" value="'+(cfg.min_advance_hours||24)+'" min="0" max="168"/>')+'</div>'

            + '<div style="margin-bottom:14px;"><label style="'+_lbl()+'">Tipos de sessão disponíveis</label>'
            + '<div style="display:flex;gap:16px;">'
            + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="cp-cfg-online"'+typeCheck('online')+' style="accent-color:#d4a574;"/> 💻 Online</label>'
            + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="cp-cfg-inperson"'+typeCheck('inperson')+' style="accent-color:#d4a574;"/> 🏛️ Presencial</label>'
            + '</div></div>'

            + '<div style="margin-bottom:14px;">'+_field('Endereço da Igreja (presencial)',
                '<input id="cp-cfg-address" class="hub-field-input" style="width:100%;" value="'+esc(cfg.church_address||'')+'" placeholder="Rua, Número, Cidade"/>')+'</div>'

            + '<div style="margin-bottom:14px;">'+_field('Instruções Online (aparece no email de confirmação)',
                '<textarea id="cp-cfg-instructions" class="hub-field-input" rows="3" style="width:100%;resize:vertical;" placeholder="Ex: Um link de Google Meet será enviado no dia...">'+esc(cfg.meeting_link_instructions||'')+'</textarea>')+'</div>'

            + '<div style="margin-bottom:14px;">'+_field('Email para notificações',
                '<input id="cp-cfg-email" type="email" class="hub-field-input" style="width:100%;" value="'+esc(cfg.notification_email||'')+'" placeholder="pastor@igreja.com"/>')+'</div>'

            + '<div style="margin-bottom:14px;">'+_field('Formulário de Briefing (Form Builder)',
                '<select id="cp-cfg-form" class="hub-field-input" style="width:100%;">'+formOpts+'</select>'
                +'<div style="font-size:.75rem;color:var(--text-muted);margin-top:5px;">Perguntas extras coletadas antes do match.</div>')+'</div>'

            + '<button onclick="cpSaveConfig()" style="background:#d4a574;color:#111;border:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:.95rem;cursor:pointer;width:100%;">💾 Salvar Configurações</button>'
            + '</div>'

            // Block: Public Link + QR
            + '<div style="background:var(--bg-elevated);padding:24px;border-radius:14px;border:1px solid var(--border-light);">'
            + '<h3 style="margin:0 0 14px;font-size:1.05rem;">🔗 Link e QR Code Público</h3>'
            + '<p style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px;">Compartilhe para que membros solicitem um agendamento.</p>'
            + '<div style="display:flex;gap:8px;margin-bottom:16px;">'
            + '<input type="text" id="cp-pub-url" readonly class="hub-field-input" style="flex:1;opacity:.8;" value="'+esc(pubUrl)+'"/>'
            + '<button onclick="navigator.clipboard.writeText(document.getElementById(\'cp-pub-url\').value);window.hubToast&&window.hubToast(\'Link copiado!\',\'success\');" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text);padding:0 14px;border-radius:8px;cursor:pointer;" title="Copiar">'
            + '<svg viewBox="0 0 24 24" width="16" height="16" style="stroke:currentColor;fill:none;stroke-width:2;display:block;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
            + '</button>'
            + '</div>'
            + '<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data='+encodeURIComponent(pubUrl)+'" style="border-radius:10px;display:block;" alt="QR Code" />'
            + '</div>'

            + '</div>';
    }

    function _field(label, input) {
        return '<div><label style="'+_lbl()+'">'+esc(label)+'</label>'+input+'</div>';
    }

    window.cpSaveConfig = async function() {
        if (!window._currentWsId) return;
        var btn = document.querySelector('[onclick="cpSaveConfig()"]');
        if (btn) { btn.disabled=true; btn.innerText='Salvando...'; }

        var types = [];
        if (($('cp-cfg-online')||{}).checked)   types.push('online');
        if (($('cp-cfg-inperson')||{}).checked) types.push('inperson');

        var payload = {
            workspace_id: window._currentWsId,
            enabled:                  !!($('cp-cfg-enabled')||{}).checked,
            default_duration_minutes: parseInt(($('cp-cfg-dur')||{}).value)||60,
            booking_window_days:      parseInt(($('cp-cfg-window')||{}).value)||30,
            min_advance_hours:        parseInt(($('cp-cfg-advance')||{}).value)||24,
            session_types:            types,
            church_address:           ($('cp-cfg-address')||{}).value||null,
            meeting_link_instructions:($('cp-cfg-instructions')||{}).value||null,
            notification_email:       ($('cp-cfg-email')||{}).value||null,
            booking_form_id:          ($('cp-cfg-form')||{}).value||null,
            updated_at:               new Date().toISOString()
        };

        try {
            var { error } = await window.supabase.from('cafe_pastor_config')
                .upsert(payload, { onConflict:'workspace_id' });
            if (error) throw error;
            _cpConfig = payload;
            window.hubToast&&window.hubToast('Configurações salvas!','success');
        } catch(err) {
            window.hubToast&&window.hubToast('Erro: '+(err.message||err),'error');
        } finally {
            if (btn) { btn.disabled=false; btn.innerText='💾 Salvar Configurações'; }
        }
    };

    console.log('[CafePastor] v3 loaded. window._cpLoadData ready.');
})();
