// hub-cafe-pastor.js
// Manager for Café com Pastor module

(function() {
    let _cpLoaded = false;
    let _cpConfig = null;
    let _cpCurrentPanel = 'agenda';
    let _cpPastors = [];

    const renderEmpty = (msg) => `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.4);font-size:0.9rem;">${msg}</div>`;

    window.cpSwitchPanel = function(panel) {
        _cpCurrentPanel = panel;
        ['agenda', 'pastores', 'config'].forEach(p => {
            const btn = document.getElementById('cp-tab-' + p);
            if(btn) {
                if(p === panel) {
                    btn.classList.add('active');
                    btn.style.background = 'var(--bg-card)';
                    btn.style.color = 'var(--text)';
                    btn.style.borderColor = 'var(--border)';
                } else {
                    btn.classList.remove('active');
                    btn.style.background = 'transparent';
                    btn.style.color = 'var(--text-muted)';
                    btn.style.borderColor = 'transparent';
                }
            }
        });
        
        if (panel === 'agenda') {
            cpRenderAgenda();
        } else if (panel === 'pastores') {
            cpRenderPastores();
        } else if (panel === 'config') {
            cpRenderConfig();
        }
    };

    async function loadCafePastorData() {
        if (!window._currentWsId) return;
        try {
            const container = document.getElementById('cp-panels-container');
            if (container) container.innerHTML = `<div style="padding:40px;text-align:center;"><div class="hub-loader"></div></div>`;

            // Load Config
            const { data: cfg } = await window.supabase
                .from('cafe_pastor_config')
                .select('*')
                .eq('workspace_id', window._currentWsId)
                .single();
            _cpConfig = cfg || { enabled: false, form_builder_id: null };

            // Load Pastors mapping
            const { data: past } = await window.supabase
                .from('cafe_pastor_pastors')
                .select('*, users!fk_cp_user(name, email, phone)')
                .eq('workspace_id', window._currentWsId);
            _cpPastors = past || [];
            
            window.cpSwitchPanel(_cpCurrentPanel);
        } catch (err) {
            console.error("loadCafePastorData error:", err);
            const container = document.getElementById('cp-panels-container');
            if (container) container.innerHTML = renderEmpty(`Erro ao carregar os dados: ${err.message}`);
        }
    }

    /* ─── PAINEL: AGENDA ──────────────────────────────────────────────────────── */
    async function cpRenderAgenda() {
        const container = document.getElementById('cp-panels-container');
        if (!container) return;

        // Fetch recent appointments
        const { data: appointments, error } = await window.supabase
            .from('cafe_pastor_appointments')
            .select('*')
            .eq('workspace_id', window._currentWsId)
            .gte('scheduled_at', new Date(Date.now() - 30*24*60*60*1000).toISOString())
            .order('scheduled_at', { ascending: false });

        if (error) {
            container.innerHTML = renderEmpty('Erro ao carregar agenda.');
            return;
        }

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="font-size:1.1rem; margin:0;">Agendamentos</h3>
                <button onclick="cpAddManualAppointment()" class="hub-btn-primary" style="font-size:.8rem; padding:6px 12px;">+ Novo Agendamento</button>
            </div>
            <div class="hub-table-wrapper">
                <table class="hub-table" style="width:100%">
                    <thead>
                        <tr>
                            <th>Data / Hora</th>
                            <th>Visitante / Integrante</th>
                            <th>Pastor</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (!appointments || appointments.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-dim);">Nenhum agendamento encontrado nos últimos 30 dias.</td></tr>`;
        } else {
            appointments.forEach(app => {
                const pastor = _cpPastors.find(p => p.user_id === app.pastor_id);
                const pastorName = pastor?.users?.name || 'Não atribuído';
                
                let badgeClass = '';
                let statusLabel = app.status;
                if(app.status === 'confirmed') { badgeClass = 'ws-plan-starter'; statusLabel = 'Confirmado'; }
                else if(app.status === 'pending') { badgeClass = 'ws-plan-medium'; statusLabel = 'Pendente'; }
                else if(app.status === 'cancelled') { badgeClass = 'ws-plan-free'; statusLabel = 'Cancelado'; }

                const schedDate = new Date(app.scheduled_at);
                const dur = app.duration_minutes || 60;
                const endDate = new Date(schedDate.getTime() + dur*60000);

                html += `
                    <tr>
                        <td>
                            <div style="font-weight:600;">${schedDate.toLocaleDateString('pt-BR')}</div>
                            <div style="font-size:0.8rem; color:var(--text-dim);">${schedDate.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})} - ${endDate.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>
                        </td>
                        <td>
                            <div style="font-weight:600;">${app.requester_name || '—'}</div>
                            <div style="font-size:0.8rem; color:var(--text-dim);">${app.requester_phone || '—'}</div>
                        </td>
                        <td>${pastorName}</td>
                        <td><span class="hub-status-badge ${badgeClass}" style="font-size:0.7rem; padding:3px 8px; border-radius:10px;">${statusLabel}</span></td>
                        <td>
                            <button onclick="cpViewAppointmentDetails('${app.id}')" style="background:transparent; border:none; color:var(--accent); font-weight:600; cursor:pointer;">Detalhes</button>
                        </td>
                    </tr>
                `;
            });
        }

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    }

    /* ─── PAINEL: PASTORES ────────────────────────────────────────────────────── */
    async function cpRenderPastores() {
        const container = document.getElementById('cp-panels-container');
        if (!container) return;

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="font-size:1.1rem; margin:0;">Pastores Ativos</h3>
                <button onclick="cpAddPastor()" style="background:var(--accent-hover); color:#fff; border:none; padding:6px 12px; border-radius:8px; font-weight:600; font-size:.8rem; cursor:pointer;">+ Adicionar Pastor</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">
        `;

        if (_cpPastors.length === 0) {
            html += `<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-dim);">Nenhum pastor configurado para receber agendamentos.</div>`;
        } else {
            _cpPastors.forEach(p => {
                const name = p.users?.name || 'Usuário Desconhecido';
                const photoSrc = p.photo_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=random';
                
                html += `
                    <div style="background:var(--bg-elevated); border:1px solid var(--border-light); border-radius:12px; padding:16px; display:flex; gap:14px; align-items:center;">
                        <img src="${photoSrc}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid var(--border);" alt="Foto" />
                        <div style="flex:1;">
                            <div style="font-weight:600; font-size:1rem; margin-bottom:2px;">${name}</div>
                            <div style="font-size:0.75rem; color:var(--text-dim);">Gênero: ${p.gender === 'male' ? 'Masculino' : (p.gender === 'female' ? 'Feminino' : 'Indefinido')}</div>
                        </div>
                        <button onclick="cpManagePastorAvailability('${p.user_id}')" style="background:transparent; border:none; cursor:pointer; color:var(--text-muted);" title="Gerenciar Disponibilidade">
                            <svg viewBox="0 0 24 24" width="20" height="20" style="stroke:currentColor;fill:none;stroke-width:2;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
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
        
        const isEnabled = _cpConfig?.enabled || false;
        
        // Fetch available forms from form_builder
        const { data: forms } = await window.supabase
            .from('form_builder_forms')
            .select('id, title')
            .eq('workspace_id', window._currentWsId)
            .eq('is_published', true);

        const formOptions = (forms || []).map(f => `<option value="${f.id}" ${f.id === _cpConfig?.form_builder_id ? 'selected' : ''}>${f.title}</option>`).join('');

        let html = `
            <div style="background:var(--bg-elevated); padding:24px; border-radius:14px; border:1px solid var(--border-light); max-width:600px; margin:0 auto;">
                <h3 style="margin:0 0 20px 0; font-size:1.15rem; display:flex; align-items:center; gap:8px;">
                    <svg viewBox="0 0 24 24" width="22" height="22" style="stroke:var(--accent);fill:none;stroke-width:2;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    Ajustes de Sistema
                </h3>

                <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:24px; padding:12px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid var(--border);">
                    <input type="checkbox" id="cp-config-enabled" ${isEnabled ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--accent);" />
                    <div>
                        <div style="font-weight:600; font-size:1rem;">Habilitar Módulo Público</div>
                        <div style="font-size:.8rem; color:var(--text-dim);">Permite acesso direto pelo link da igreja.</div>
                    </div>
                </label>

                <div style="margin-bottom:16px;">
                    <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-dim); margin-bottom:6px;">Formulário de Briefing</label>
                    <select id="cp-config-form" class="hub-field-input" style="width:100%;">
                        <option value="">(Nenhum formulário vinculado)</option>
                        ${formOptions}
                    </select>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;">O formulário que coleta dados antes do match. <a href="javascript:void(0)" onclick="if(window.switchTab)window.switchTab('settings')" style="color:var(--accent);">Ir para Construtor</a></div>
                </div>

                <div style="margin-bottom:16px;">
                    <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-dim); margin-bottom:6px;">Link Público (Compartilhável)</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="cp-public-url" readonly class="hub-field-input" style="width:100%; opacity:0.8;" 
                               value="https://zelo.7prolabs.com/cafe-pastor.html?ws=${window._currentWorkspace?.slug || window._currentWsId}" />
                        <button onclick="navigator.clipboard.writeText(document.getElementById('cp-public-url').value); hubToast('Link copiado!');" style="background:var(--bg-card); border:1px solid var(--border); color:var(--text); padding:0 14px; border-radius:8px; cursor:pointer;" title="Copiar Link"><svg viewBox="0 0 24 24" width="16" height="16" style="stroke:currentColor;fill:none;stroke-width:2;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                    </div>
                </div>

                <button onclick="cpSaveConfig()" class="hub-btn-primary" style="margin-top:24px; width:100%; padding:12px; font-weight:700;">💾 Salvar Configurações</button>
            </div>
        `;
        
        container.innerHTML = html;
    }

    window.cpSaveConfig = async function() {
        if (!window._currentWsId) return;
        const btn = event.target;
        btn.disabled = true;
        btn.innerText = "Salvando...";

        try {
            const enabled = document.getElementById('cp-config-enabled').checked;
            const form_builder_id = document.getElementById('cp-config-form').value || null;

            const { error } = await window.supabase
                .from('cafe_pastor_config')
                .upsert({
                    workspace_id: window._currentWsId,
                    enabled,
                    form_builder_id,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'workspace_id' });

            if (error) throw error;
            
            _cpConfig.enabled = enabled;
            _cpConfig.form_builder_id = form_builder_id;
            if(window.hubToast) window.hubToast('Configurações salvas.', 'success');
        } catch (err) {
            console.error("cpSaveConfig:", err);
            if(window.hubToast) window.hubToast('Erro ao salvar.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = "💾 Salvar Configurações";
        }
    };

    window.cpViewAppointmentDetails = async function(appId) {
        // Todo: modal view for appointment
        if(window.hubToast) window.hubToast('Carregando detalhes do agendamento...', 'info');
        console.log("Details for app:", appId);
        // Will implement modal logic soon
    };

    window.cpAddManualAppointment = async function() {
        if(window.hubToast) window.hubToast('Abertura de formulário manual em breve.', 'info');
    };

    window.cpAddPastor = async function() {
        if(window.hubToast) window.hubToast('Vinculação de pastor em breve.', 'info');
    };

    window.cpManagePastorAvailability = async function(userId) {
        if(window.hubToast) window.hubToast('Gestão de horários do pastor ' + userId + ' em breve.', 'info');
    };

    // Lazy load hook
    const originalSwitchTab = window.switchTab;
    window.switchTab = function(tabId) {
        if (originalSwitchTab) originalSwitchTab(tabId);
        if (tabId === 'cafe-pastor') {
            if (!_cpLoaded) {
                _cpLoaded = true;
            }
            // Always reload data on tab switch to be fresh
            loadCafePastorData();
        }
    };

})();
