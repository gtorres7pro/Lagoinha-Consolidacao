// hub-cafe-pastor.js — Café com Pastor module
// Loading is triggered by hub-dashboard.js base switchTab via window._cpLoadData

(function() {
    'use strict';

    let _cpConfig = null;
    let _cpPastors = [];
    let _cpCurrentPanel = 'agenda';

    const renderEmpty = (msg) => `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.4);font-size:0.9rem;">${msg}</div>`;
    const renderLoader = () => `<div style="padding:40px;text-align:center;"><div class="hub-loader"></div></div>`;

    /* ══════════════════════════════════════════════════════════════════════
       TAB SWITCHER (internal: Agenda / Pastores / Config)
    ══════════════════════════════════════════════════════════════════════ */
    window.cpSwitchPanel = function(panel) {
        _cpCurrentPanel = panel;
        ['agenda', 'pastores', 'config'].forEach(p => {
            const btn = document.getElementById('cp-tab-' + p);
            if (btn) {
                btn.style.background = p === panel ? 'var(--bg-card)' : 'transparent';
                btn.style.color     = p === panel ? 'var(--text)' : 'var(--text-muted)';
                btn.style.border    = p === panel ? '1px solid var(--border)' : '1px solid transparent';
            }
        });

        if (panel === 'agenda')        cpRenderAgenda();
        else if (panel === 'pastores') cpRenderPastores();
        else if (panel === 'config')   cpRenderConfig();
    };

    /* ══════════════════════════════════════════════════════════════════════
       MAIN DATA LOADER — exposed as window._cpLoadData
    ══════════════════════════════════════════════════════════════════════ */
    window._cpLoadData = async function() {
        if (!window._currentWsId) {
            console.warn('[CafePastor] No workspace ID');
            return;
        }

        const container = document.getElementById('cp-panels-container');
        if (container) container.innerHTML = renderLoader();

        try {
            // Config
            const { data: cfg, error: e1 } = await window.supabase
                .from('cafe_pastor_config')
                .select('*')
                .eq('workspace_id', window._currentWsId)
                .maybeSingle();
            if (e1) console.warn('[CafePastor] config query error:', e1.message);
            _cpConfig = cfg || {};

            // Pastors
            const { data: past, error: e2 } = await window.supabase
                .from('cafe_pastor_pastors')
                .select('id, user_id, display_name, gender, bio, photo_url, is_active, session_duration_minutes, max_weekly_sessions')
                .eq('workspace_id', window._currentWsId)
                .eq('is_active', true);
            if (e2) console.warn('[CafePastor] pastors query error:', e2.message);
            _cpPastors = past || [];

            // Render the active panel
            window.cpSwitchPanel(_cpCurrentPanel);
        } catch (err) {
            console.error('[CafePastor] Fatal load error:', err);
            if (container) container.innerHTML = renderEmpty('Erro ao carregar: ' + (err.message || err));
        }
    };

    /* ══════════════════════════════════════════════════════════════════════
       PANEL: AGENDA
    ══════════════════════════════════════════════════════════════════════ */
    async function cpRenderAgenda() {
        const container = document.getElementById('cp-panels-container');
        if (!container) return;
        container.innerHTML = renderLoader();

        try {
            const { data: appointments, error } = await window.supabase
                .from('cafe_pastor_appointments')
                .select('*')
                .eq('workspace_id', window._currentWsId)
                .gte('scheduled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
                .order('scheduled_at', { ascending: false });

            if (error) throw error;

            let html = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                    <h3 style="font-size:1.1rem; margin:0;">Agendamentos (últimos 30 dias)</h3>
                    <button onclick="cpAddManualAppointment()" style="background:rgba(212,165,116,0.15); color:#d4a574; border:1px solid rgba(212,165,116,0.4); padding:6px 14px; border-radius:8px; font-weight:600; font-size:.85rem; cursor:pointer;">+ Novo</button>
                </div>
            `;

            if (!appointments || appointments.length === 0) {
                html += `
                    <div style="text-align:center; padding:60px 20px; background:var(--bg-elevated); border-radius:14px; border:1px dashed var(--border);">
                        <div style="font-size:3rem; margin-bottom:12px;">☕</div>
                        <div style="font-weight:600; font-size:1.05rem; margin-bottom:6px;">Nenhum agendamento encontrado</div>
                        <div style="font-size:0.85rem; color:var(--text-muted);">Compartilhe o link público para que membros solicitem um café com um pastor.</div>
                    </div>
                `;
            } else {
                html += `<div class="hub-table-wrapper"><table class="hub-table" style="width:100%"><thead><tr>
                    <th>Data / Hora</th><th>Solicitante</th><th>Pastor</th><th>Status</th><th>Ações</th>
                </tr></thead><tbody>`;
                appointments.forEach(app => {
                    const pastor = _cpPastors.find(p => p.user_id === app.pastor_id || p.id === app.pastor_id);
                    const pastorName = pastor ? pastor.display_name : 'Não atribuído';
                    const sMap = { pending:['Pendente','#FBBF24'], confirmed:['Confirmado','#34D399'], cancelled:['Cancelado','#F87171'], completed:['Realizado','#60A5FA'] };
                    const [sLabel, sColor] = sMap[app.status] || [app.status, '#aaa'];
                    const d = new Date(app.scheduled_at);
                    const dur = app.duration_minutes || 60;
                    const end = new Date(d.getTime() + dur * 60000);
                    html += `<tr>
                        <td><div style="font-weight:600;">${d.toLocaleDateString('pt-BR')}</div><div style="font-size:.78rem;color:var(--text-dim);">${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} – ${end.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div></td>
                        <td><div style="font-weight:600;">${app.requester_name||'—'}</div><div style="font-size:.78rem;color:var(--text-dim);">${app.requester_phone||app.requester_email||'—'}</div></td>
                        <td>${pastorName}</td>
                        <td><span style="background:${sColor}22;color:${sColor};border:1px solid ${sColor}44;border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:600;">${sLabel}</span></td>
                        <td><button onclick="cpViewAppointmentDetails('${app.id}')" style="background:transparent;border:none;color:var(--accent);font-weight:600;cursor:pointer;font-size:.85rem;">Detalhes</button></td>
                    </tr>`;
                });
                html += `</tbody></table></div>`;
            }
            container.innerHTML = html;
        } catch (err) {
            console.error('[CafePastor] Agenda error:', err);
            container.innerHTML = renderEmpty('Erro ao carregar agenda: ' + (err.message || err));
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
       PANEL: PASTORES
    ══════════════════════════════════════════════════════════════════════ */
    function cpRenderPastores() {
        const container = document.getElementById('cp-panels-container');
        if (!container) return;

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
                <h3 style="font-size:1.1rem; margin:0;">Pastores Disponíveis</h3>
                <button onclick="cpAddPastor()" style="background:rgba(212,165,116,0.15); color:#d4a574; border:1px solid rgba(212,165,116,0.4); padding:6px 14px; border-radius:8px; font-weight:600; font-size:.85rem; cursor:pointer;">+ Adicionar Pastor</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">
        `;

        if (_cpPastors.length === 0) {
            html += `<div style="grid-column:1/-1; text-align:center; padding:50px; background:var(--bg-elevated); border-radius:14px; border:1px dashed var(--border);">
                <div style="font-size:2.5rem; margin-bottom:10px;">🧑‍⚖️</div>
                <div style="font-weight:600; margin-bottom:6px;">Nenhum pastor configurado</div>
                <div style="font-size:0.85rem; color:var(--text-muted);">Adicione pastores para que eles apareçam disponíveis para agendamentos.</div>
            </div>`;
        } else {
            _cpPastors.forEach(p => {
                const name = p.display_name || 'Pastor';
                const photo = p.photo_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=3d2a1a&color=d4a574&bold=true';
                const gLabel = p.gender === 'male' ? 'Masculino' : (p.gender === 'female' ? 'Feminino' : '—');
                const dur = p.session_duration_minutes || 60;
                html += `
                    <div style="background:var(--bg-elevated); border:1px solid var(--border-light); border-radius:14px; padding:18px; display:flex; gap:14px; align-items:flex-start;">
                        <img src="${photo}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid rgba(212,165,116,0.4);flex-shrink:0;" alt="${name}"/>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;font-size:.95rem;margin-bottom:4px;">${name}</div>
                            <div style="font-size:.78rem;color:var(--text-dim);">Gênero: ${gLabel}</div>
                            <div style="font-size:.78rem;color:var(--text-dim);">Sessão: ${dur}min</div>
                            ${p.bio ? '<div style="font-size:.78rem;color:var(--text-muted);margin-top:6px;line-height:1.4;">' + p.bio.substring(0,80) + (p.bio.length>80?'...':'') + '</div>' : ''}
                        </div>
                        <button onclick="cpManagePastorAvailability('${p.id}')" style="background:transparent;border:1px solid var(--border);border-radius:8px;cursor:pointer;color:var(--text-muted);padding:6px 8px;flex-shrink:0;" title="Horários">
                            <svg viewBox="0 0 24 24" width="16" height="16" style="stroke:currentColor;fill:none;stroke-width:2;display:block;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </button>
                    </div>`;
            });
        }
        html += '</div>';
        container.innerHTML = html;
    }

    /* ══════════════════════════════════════════════════════════════════════
       PANEL: CONFIGURAÇÕES
    ══════════════════════════════════════════════════════════════════════ */
    async function cpRenderConfig() {
        const container = document.getElementById('cp-panels-container');
        if (!container) return;
        container.innerHTML = renderLoader();

        try {
            const isEnabled = _cpConfig && _cpConfig.enabled || false;
            const wsSlug = (window._currentWorkspace && window._currentWorkspace.slug) || window._currentWsId || '';

            // Try to fetch forms — graceful fallback if table doesn't exist
            let formOptions = '';
            try {
                const { data: forms } = await window.supabase
                    .from('form_builder_forms')
                    .select('id, title')
                    .eq('workspace_id', window._currentWsId);
                if (forms && forms.length) {
                    formOptions = forms.map(function(f) {
                        var sel = (_cpConfig && f.id === _cpConfig.booking_form_id) ? ' selected' : '';
                        return '<option value="' + f.id + '"' + sel + '>' + f.title + '</option>';
                    }).join('');
                }
            } catch(e) { console.warn('[CafePastor] form_builder_forms query failed:', e); }

            var duration = (_cpConfig && _cpConfig.default_duration_minutes) || 60;
            var email = (_cpConfig && _cpConfig.notification_email) || '';
            var formId = (_cpConfig && _cpConfig.booking_form_id) || '';

            container.innerHTML = '<div style="max-width:600px; margin:0 auto; display:flex; flex-direction:column; gap:20px;">'

                // Card 1: Settings
                + '<div style="background:var(--bg-elevated); padding:24px; border-radius:14px; border:1px solid var(--border-light);">'
                + '<h3 style="margin:0 0 18px 0; font-size:1.05rem;">⚙️ Configurações do Módulo</h3>'

                + '<label style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:20px;padding:14px;background:rgba(212,165,116,0.06);border-radius:10px;border:1px solid rgba(212,165,116,0.2);">'
                + '<input type="checkbox" id="cp-config-enabled"' + (isEnabled ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:#d4a574;"/>'
                + '<div><div style="font-weight:600;">Habilitar formulário público</div><div style="font-size:.8rem;color:var(--text-dim);">Permite que membros solicitem atendimento pelo link público.</div></div>'
                + '</label>'

                + '<div style="margin-bottom:16px;"><label style="display:block;font-size:.85rem;font-weight:600;color:var(--text-dim);margin-bottom:6px;">Formulário de Briefing</label>'
                + '<select id="cp-config-form" class="hub-field-input" style="width:100%;"><option value="">(Nenhum formulário vinculado)</option>' + formOptions + '</select>'
                + '<div style="font-size:.75rem;color:var(--text-muted);margin-top:6px;">O formulário coleta dados antes do match automático de pastor.</div>'
                + '</div>'

                + '<div style="margin-bottom:16px;"><label style="display:block;font-size:.85rem;font-weight:600;color:var(--text-dim);margin-bottom:6px;">Duração padrão da sessão (min)</label>'
                + '<input type="number" id="cp-config-duration" class="hub-field-input" style="width:100%;" value="' + duration + '" min="15" max="180" step="15"/>'
                + '</div>'

                + '<div style="margin-bottom:20px;"><label style="display:block;font-size:.85rem;font-weight:600;color:var(--text-dim);margin-bottom:6px;">Email de Notificações</label>'
                + '<input type="email" id="cp-config-email" class="hub-field-input" style="width:100%;" value="' + email + '" placeholder="pastor@igreja.com"/>'
                + '</div>'

                + '<button onclick="cpSaveConfig()" style="background:#d4a574;color:#111;border:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:.95rem;cursor:pointer;width:100%;">💾 Salvar Configurações</button>'
                + '</div>'

                // Card 2: Public Link
                + '<div style="background:var(--bg-elevated); padding:24px; border-radius:14px; border:1px solid var(--border-light);">'
                + '<h3 style="margin:0 0 14px 0; font-size:1.05rem;">🔗 Link Público</h3>'
                + '<p style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px;">Compartilhe este link para que membros solicitem um agendamento.</p>'
                + '<div style="display:flex;gap:8px;">'
                + '<input type="text" id="cp-public-url" readonly class="hub-field-input" style="flex:1;opacity:.8;" value="https://zelo.7prolabs.com/cafe-pastor.html?ws=' + wsSlug + '"/>'
                + '<button onclick="navigator.clipboard.writeText(document.getElementById(\'cp-public-url\').value);window.hubToast&&window.hubToast(\'Link copiado!\',\'success\');" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text);padding:0 14px;border-radius:8px;cursor:pointer;flex-shrink:0;" title="Copiar">'
                + '<svg viewBox="0 0 24 24" width="16" height="16" style="stroke:currentColor;fill:none;stroke-width:2;display:block;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
                + '</button></div>'
                + '</div>'

                + '</div>';

        } catch (err) {
            console.error('[CafePastor] Config render error:', err);
            container.innerHTML = renderEmpty('Erro ao carregar configurações: ' + (err.message || err));
        }
    }

    /* ══════════════════════════════════════════════════════════════════════
       SAVE CONFIG
    ══════════════════════════════════════════════════════════════════════ */
    window.cpSaveConfig = async function() {
        if (!window._currentWsId) return;
        var btn = document.querySelector('[onclick="cpSaveConfig()"]');
        if (btn) { btn.disabled = true; btn.innerText = 'Salvando...'; }

        try {
            var enabled = document.getElementById('cp-config-enabled') ? document.getElementById('cp-config-enabled').checked : false;
            var booking_form_id = document.getElementById('cp-config-form') ? document.getElementById('cp-config-form').value || null : null;
            var default_duration_minutes = parseInt(document.getElementById('cp-config-duration') ? document.getElementById('cp-config-duration').value : '60') || 60;
            var notification_email = document.getElementById('cp-config-email') ? document.getElementById('cp-config-email').value || null : null;

            var result = await window.supabase
                .from('cafe_pastor_config')
                .upsert({
                    workspace_id: window._currentWsId,
                    enabled: enabled,
                    booking_form_id: booking_form_id,
                    default_duration_minutes: default_duration_minutes,
                    notification_email: notification_email,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'workspace_id' });

            if (result.error) throw result.error;

            _cpConfig = _cpConfig || {};
            _cpConfig.enabled = enabled;
            _cpConfig.booking_form_id = booking_form_id;
            _cpConfig.default_duration_minutes = default_duration_minutes;
            _cpConfig.notification_email = notification_email;
            window.hubToast && window.hubToast('Configurações salvas!', 'success');
        } catch (err) {
            console.error('[CafePastor] Save error:', err);
            window.hubToast && window.hubToast('Erro ao salvar: ' + (err.message || err), 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = '💾 Salvar Configurações'; }
        }
    };

    /* ══════════════════════════════════════════════════════════════════════
       STUBS — to be expanded
    ══════════════════════════════════════════════════════════════════════ */
    window.cpViewAppointmentDetails = function(appId) {
        window.hubToast && window.hubToast('Detalhes do agendamento em breve.', 'info');
    };
    window.cpAddManualAppointment = function() {
        window.hubToast && window.hubToast('Criação manual de agendamento em breve.', 'info');
    };
    window.cpAddPastor = function() {
        window.hubToast && window.hubToast('Vinculação de pastor em breve.', 'info');
    };
    window.cpManagePastorAvailability = function(pastorId) {
        window.hubToast && window.hubToast('Gestão de horários em breve.', 'info');
    };

    console.log('[CafePastor] Module loaded. window._cpLoadData ready.');
})();
