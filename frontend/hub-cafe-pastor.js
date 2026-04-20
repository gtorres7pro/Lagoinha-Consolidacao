// hub-cafe-pastor.js
// Manager for Café com Pastor module — alinhado ao schema real do banco

(function() {
    let _cpLoaded = false;
    let _cpConfig = null;
    let _cpCurrentPanel = 'agenda';
    let _cpPastors = [];

    const renderEmpty = (msg) => `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.4);font-size:0.9rem;">${msg}</div>`;
    const renderLoader = () => `<div style="padding:40px;text-align:center;"><div class="hub-loader"></div></div>`;

    window.cpSwitchPanel = function(panel) {
        _cpCurrentPanel = panel;
        ['agenda', 'pastores', 'config'].forEach(p => {
            const btn = document.getElementById('cp-tab-' + p);
            if (btn) {
                if (p === panel) {
                    btn.classList.add('active');
                    btn.style.background = 'var(--bg-card)';
                    btn.style.color = 'var(--text)';
                    btn.style.border = '1px solid var(--border)';
                } else {
                    btn.classList.remove('active');
                    btn.style.background = 'transparent';
                    btn.style.color = 'var(--text-muted)';
                    btn.style.border = '1px solid transparent';
                }
            }
        });

        if (panel === 'agenda')   cpRenderAgenda();
        else if (panel === 'pastores') cpRenderPastores();
        else if (panel === 'config')   cpRenderConfig();
    };

    /* ─── DATA LOADING ──────────────────────────────────────────────────────── */
    async function loadCafePastorData() {
        if (!window._currentWsId) return;
        const container = document.getElementById('cp-panels-container');
        if (container) container.innerHTML = renderLoader();

        // Load Config — use maybeSingle() so null result doesn't throw error
        const { data: cfg } = await window.supabase
            .from('cafe_pastor_config')
            .select('*')
            .eq('workspace_id', window._currentWsId)
            .maybeSingle();
        _cpConfig = cfg || { enabled: false, booking_form_id: null };

        // Load Pastors — use display_name (real column), no foreign join to users
        const { data: past } = await window.supabase
            .from('cafe_pastor_pastors')
            .select('id, user_id, display_name, gender, bio, photo_url, is_active, session_duration_minutes, max_weekly_sessions')
            .eq('workspace_id', window._currentWsId)
            .eq('is_active', true);
        _cpPastors = past || [];

        window.cpSwitchPanel(_cpCurrentPanel);
    }

    /* ─── PAINEL: AGENDA ──────────────────────────────────────────────────────── */
    async function cpRenderAgenda() {
        const container = document.getElementById('cp-panels-container');
        if (!container) return;
        container.innerHTML = renderLoader();

        const { data: appointments, error } = await window.supabase
            .from('cafe_pastor_appointments')
            .select('*')
            .eq('workspace_id', window._currentWsId)
            .gte('scheduled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .order('scheduled_at', { ascending: false });

        if (error) {
            container.innerHTML = renderEmpty('Erro ao carregar agenda: ' + error.message);
            return;
        }

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="font-size:1.1rem; margin:0;">Agendamentos (últimos 30 dias)</h3>
                <button onclick="cpAddManualAppointment()" class="hub-btn-primary" style="font-size:.8rem; padding:6px 14px;">+ Novo</button>
            </div>
        `;

        if (!appointments || appointments.length === 0) {
            html += `
                <div style="text-align:center; padding:60px 20px; background:var(--bg-elevated); border-radius:14px; border:1px dashed var(--border);">
                    <div style="font-size:3rem; margin-bottom:12px;">☕</div>
                    <div style="font-weight:600; font-size:1.05rem; margin-bottom:6px;">Nenhum agendamento encontrado</div>
                    <div style="font-size:0.85rem; color:var(--text-muted);">Compartilhe o link público para que os membros solicitem um café com um pastor.</div>
                </div>
            `;
        } else {
            html += `
                <div class="hub-table-wrapper">
                    <table class="hub-table" style="width:100%">
                        <thead>
                            <tr>
                                <th>Data / Hora</th>
                                <th>Solicitante</th>
                                <th>Pastor</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            appointments.forEach(app => {
                const pastor = _cpPastors.find(p => p.user_id === app.pastor_id || p.id === app.pastor_id);
                const pastorName = pastor?.display_name || 'Não atribuído';

                const statusMap = {
                    pending:   { label: 'Pendente',    color: '#FBBF24' },
                    confirmed: { label: 'Confirmado',  color: '#34D399' },
                    cancelled: { label: 'Cancelado',   color: '#F87171' },
                    completed: { label: 'Realizado',   color: '#60A5FA' },
                };
                const s = statusMap[app.status] || { label: app.status, color: '#aaa' };

                const schedDate = new Date(app.scheduled_at);
                const dur = app.duration_minutes || 60;
                const endDate = new Date(schedDate.getTime() + dur * 60000);
                const dateStr = schedDate.toLocaleDateString('pt-BR');
                const timeRange = `${schedDate.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})} – ${endDate.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`;

                html += `
                    <tr>
                        <td>
                            <div style="font-weight:600;">${dateStr}</div>
                            <div style="font-size:0.78rem; color:var(--text-dim);">${timeRange}</div>
                        </td>
                        <td>
                            <div style="font-weight:600;">${app.requester_name || '—'}</div>
                            <div style="font-size:0.78rem; color:var(--text-dim);">${app.requester_phone || app.requester_email || '—'}</div>
                        </td>
                        <td>${pastorName}</td>
                        <td><span style="background:${s.color}22; color:${s.color}; border:1px solid ${s.color}44; border-radius:20px; padding:2px 10px; font-size:0.75rem; font-weight:600;">${s.label}</span></td>
                        <td>
                            <button onclick="cpViewAppointmentDetails('${app.id}')" style="background:transparent; border:none; color:var(--accent); font-weight:600; cursor:pointer; font-size:0.85rem;">Detalhes</button>
                        </td>
                    </tr>
                `;
            });
            html += `</tbody></table></div>`;
        }

        container.innerHTML = html;
    }

    /* ─── PAINEL: PASTORES ────────────────────────────────────────────────────── */
    async function cpRenderPastores() {
        const container = document.getElementById('cp-panels-container');
        if (!container) return;

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
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
                const photoSrc = p.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3d2a1a&color=d4a574&bold=true`;
                const genderLabel = p.gender === 'male' ? 'Masculino' : (p.gender === 'female' ? 'Feminino' : '—');
                const duration = p.session_duration_minutes || 60;

                html += `
                    <div style="background:var(--bg-elevated); border:1px solid var(--border-light); border-radius:14px; padding:18px; display:flex; gap:14px; align-items:flex-start;">
                        <img src="${photoSrc}" style="width:52px; height:52px; border-radius:50%; object-fit:cover; border:2px solid rgba(212,165,116,0.4); flex-shrink:0;" alt="${name}" />
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:700; font-size:0.95rem; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                            <div style="font-size:0.78rem; color:var(--text-dim); margin-bottom:2px;">Gênero: ${genderLabel}</div>
                            <div style="font-size:0.78rem; color:var(--text-dim);">Duração sessão: ${duration}min</div>
                            ${p.bio ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:6px; line-height:1.4;" title="${p.bio}">${p.bio.substring(0, 60)}${p.bio.length > 60 ? '...' : ''}</div>` : ''}
                        </div>
                        <button onclick="cpManagePastorAvailability('${p.id}')" style="background:transparent; border:1px solid var(--border); border-radius:8px; cursor:pointer; color:var(--text-muted); padding:6px 8px; flex-shrink:0;" title="Gerenciar Disponibilidade">
                            <svg viewBox="0 0 24 24" width="16" height="16" style="stroke:currentColor;fill:none;stroke-width:2;display:block;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        </button>
                    </div>
                `;
            });
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    /* ─── PAINEL: CONFIGURAÇÕES ───────────────────────────────────────────────── */
    async function cpRenderConfig() {
        const container = document.getElementById('cp-panels-container');
        if (!container) return;
        container.innerHTML = renderLoader();

        const isEnabled = _cpConfig?.enabled || false;
        const wsSlug = window._currentWorkspace?.slug || window._currentWsId;

        // Fetch available forms from form_builder_forms
        const { data: forms } = await window.supabase
            .from('form_builder_forms')
            .select('id, title')
            .eq('workspace_id', window._currentWsId);

        const formOptions = (forms || []).map(f =>
            `<option value="${f.id}" ${f.id === _cpConfig?.booking_form_id ? 'selected' : ''}>${f.title}</option>`
        ).join('');

        const html = `
            <div style="max-width:600px; margin:0 auto; display:flex; flex-direction:column; gap:20px;">
                
                <!-- Card: Módulo Público -->
                <div style="background:var(--bg-elevated); padding:24px; border-radius:14px; border:1px solid var(--border-light);">
                    <h3 style="margin:0 0 18px 0; font-size:1.05rem;">⚙️ Configurações do Módulo</h3>

                    <label style="display:flex; align-items:center; gap:12px; cursor:pointer; margin-bottom:20px; padding:14px; background:rgba(212,165,116,0.06); border-radius:10px; border:1px solid rgba(212,165,116,0.2);">
                        <input type="checkbox" id="cp-config-enabled" ${isEnabled ? 'checked' : ''} style="width:18px; height:18px; accent-color:#d4a574;" />
                        <div>
                            <div style="font-weight:600;">Habilitar formulário público</div>
                            <div style="font-size:0.8rem; color:var(--text-dim);">Permite que membros solicitem atendimento pelo link público.</div>
                        </div>
                    </label>

                    <div style="margin-bottom:16px;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-dim); margin-bottom:6px;">Formulário de Briefing (Construtor de Formulários)</label>
                        <select id="cp-config-form" class="hub-field-input" style="width:100%;">
                            <option value="">(Nenhum formulário vinculado)</option>
                            ${formOptions}
                        </select>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;">
                            O formulário coleta dados para o match automático de pastor. 
                            <a href="javascript:void(0)" onclick="window.switchTab && window.switchTab('settings')" style="color:#d4a574;">Gerenciar formulários →</a>
                        </div>
                    </div>

                    <div style="margin-bottom:20px;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-dim); margin-bottom:6px;">Duração padrão da sessão (minutos)</label>
                        <input type="number" id="cp-config-duration" class="hub-field-input" style="width:100%;"
                               value="${_cpConfig?.default_duration_minutes || 60}" min="15" max="180" step="15" />
                    </div>

                    <div style="margin-bottom:20px;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-dim); margin-bottom:6px;">Email de Notificações</label>
                        <input type="email" id="cp-config-email" class="hub-field-input" style="width:100%;"
                               value="${_cpConfig?.notification_email || ''}" placeholder="pastor@igreja.com" />
                    </div>

                    <button onclick="cpSaveConfig()" style="background:#d4a574; color:#111; border:none; padding:12px 24px; border-radius:10px; font-weight:700; font-size:0.95rem; cursor:pointer; width:100%;">
                        💾 Salvar Configurações
                    </button>
                </div>

                <!-- Card: Link Público -->
                <div style="background:var(--bg-elevated); padding:24px; border-radius:14px; border:1px solid var(--border-light);">
                    <h3 style="margin:0 0 14px 0; font-size:1.05rem;">🔗 Link Público</h3>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Compartilhe este link para que membros solicitem um agendamento.</p>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="cp-public-url" readonly class="hub-field-input" style="flex:1; opacity:0.8;"
                               value="https://zelo.7prolabs.com/cafe-pastor.html?ws=${wsSlug}" />
                        <button onclick="navigator.clipboard.writeText(document.getElementById('cp-public-url').value); hubToast && hubToast('Link copiado!', 'success');"
                                style="background:var(--bg-card); border:1px solid var(--border); color:var(--text); padding:0 14px; border-radius:8px; cursor:pointer; flex-shrink:0;"
                                title="Copiar Link">
                            <svg viewBox="0 0 24 24" width="16" height="16" style="stroke:currentColor;fill:none;stroke-width:2;display:block;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                    </div>
                </div>

            </div>
        `;

        container.innerHTML = html;
    }

    /* ─── SAVE CONFIG ─────────────────────────────────────────────────────────── */
    window.cpSaveConfig = async function() {
        if (!window._currentWsId) return;
        const btn = event?.target;
        if (btn) { btn.disabled = true; btn.innerText = 'Salvando...'; }

        try {
            const enabled = document.getElementById('cp-config-enabled')?.checked || false;
            const booking_form_id = document.getElementById('cp-config-form')?.value || null;
            const default_duration_minutes = parseInt(document.getElementById('cp-config-duration')?.value) || 60;
            const notification_email = document.getElementById('cp-config-email')?.value || null;

            const { error } = await window.supabase
                .from('cafe_pastor_config')
                .upsert({
                    workspace_id: window._currentWsId,
                    enabled,
                    booking_form_id,
                    default_duration_minutes,
                    notification_email,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'workspace_id' });

            if (error) throw error;

            _cpConfig = { ..._cpConfig, enabled, booking_form_id, default_duration_minutes, notification_email };
            window.hubToast && window.hubToast('Configurações salvas com sucesso!', 'success');
        } catch (err) {
            console.error('cpSaveConfig:', err);
            window.hubToast && window.hubToast('Erro ao salvar: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = '💾 Salvar Configurações'; }
        }
    };

    /* ─── STUBS INTERATIVOS ───────────────────────────────────────────────────── */
    window.cpViewAppointmentDetails = function(appId) {
        window.hubToast && window.hubToast('Detalhes do agendamento em breve.', 'info');
        console.log('Appointment details:', appId);
    };

    window.cpAddManualAppointment = function() {
        window.hubToast && window.hubToast('Criação manual de agendamento em breve.', 'info');
    };

    window.cpAddPastor = function() {
        window.hubToast && window.hubToast('Gerenciamento de pastores em breve.', 'info');
    };

    window.cpManagePastorAvailability = function(pastorId) {
        window.hubToast && window.hubToast('Agenda do pastor em breve.', 'info');
        console.log('Manage availability for pastor:', pastorId);
    };

    /* ─── LAZY LOAD — Intercepta switchTab ──────────────────────────────────── */
    const _originalSwitchTab = window.switchTab;
    window.switchTab = function(tabId) {
        if (_originalSwitchTab) _originalSwitchTab(tabId);
        if (tabId === 'cafe-pastor') {
            loadCafePastorData();
        }
    };

})();
