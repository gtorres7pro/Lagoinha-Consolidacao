// ═══════════════════════════════════════════════════════════
// MÓDULO START - Lógica do Dashboard
// ═══════════════════════════════════════════════════════════

let _startParticipants = [];
let _startLessonsConfig = [];
let _currentStartSelectedId = null;

// ── Entry Point ─────────────────────────────────────
window.loadStartModule = async function() {
    if (!window.currentWorkspaceId) return;
    try {
        const sb = window.supabaseClient;
        
        // Load Participants with their progress and completions
        const { data, error } = await sb
            .from('start_participants')
            .select(`
                *,
                start_progress(lesson_number, status, completed_at, quiz_score),
                start_completions(completion_type, completed_at)
            `)
            .eq('workspace_id', window.currentWorkspaceId)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        _startParticipants = data || [];
        
        updateStartKPIs();
        renderStartGrid();
        
        setupStartListeners();
        
    } catch (e) {
        console.error('loadStartModule error:', e);
    }
};

function setupStartListeners() {
    const sInput = document.getElementById('start-search');
    const fStatus = document.getElementById('start-filter-status');
    const fSource = document.getElementById('start-filter-source');
    
    // Remove old listeners to avoid duplicates if re-loaded
    const newSInput = sInput.cloneNode(true);
    sInput.parentNode.replaceChild(newSInput, sInput);
    const newFStatus = fStatus.cloneNode(true);
    fStatus.parentNode.replaceChild(newFStatus, fStatus);
    const newFSource = fSource.cloneNode(true);
    fSource.parentNode.replaceChild(newFSource, fSource);
    
    newSInput.addEventListener('input', renderStartGrid);
    newFStatus.addEventListener('change', renderStartGrid);
    newFSource.addEventListener('change', renderStartGrid);

    const btnPublic = document.getElementById('btn-copy-start-public');
    const btnPresential = document.getElementById('btn-copy-start-presential');
    if (btnPublic) btnPublic.onclick = () => copyStartLink('start');
    if (btnPresential) btnPresential.onclick = () => copyStartLink('start-conclusao');
}

function copyStartLink(page) {
    const slug = window._slug || (window.location.pathname.split('/')[1]);
    const url = window.location.origin + '/' + slug + '/' + page;
    navigator.clipboard.writeText(url).then(() => {
        if (typeof hubToast !== 'undefined') hubToast('Link copiado!', 'success');
        else alert('Link copiado: ' + url);
    });
}

// ── Sub-logic: Determine participant overall status ─
function getParticipantComputedStatus(p) {
    // If there is any completion record
    if (p.start_completions && p.start_completions.length > 0) {
        // Sort by most recent
        const comp = p.start_completions.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0];
        return { st: 'completed', type: comp.completion_type }; // 'online' or 'presential'
    }
    
    // Check progress
    if (p.start_progress && p.start_progress.length > 0) {
        // Find if they completed module 8
        const lesson8 = p.start_progress.find(x => x.lesson_number === 8);
        if (lesson8 && lesson8.status === 'completed') {
            return { st: 'completed', type: 'online' };
        }
        return { st: 'in_progress', type: null };
    }
    
    return { st: 'not_started', type: null };
}

function getLastLessonText(p) {
    if (!p.start_progress || p.start_progress.length === 0) return 'Nenhuma aula iniciada';
    let maxLes = -1;
    p.start_progress.forEach(pr => {
        if (pr.lesson_number > maxLes) maxLes = pr.lesson_number;
    });
    return maxLes === 0 ? 'Aula Boas-vindas' : `Aula ${maxLes}`;
}

// ── Render KPIs & Grid ──────────────────────────────
function updateStartKPIs() {
    let active = 0, compOnline = 0, compPresen = 0;
    
    _startParticipants.forEach(p => {
        const cStatus = getParticipantComputedStatus(p);
        if (cStatus.st === 'in_progress') active++;
        if (cStatus.st === 'completed') {
            if (cStatus.type === 'online') compOnline++;
            if (cStatus.type === 'presential') compPresen++;
        }
    });
    
    document.getElementById('start-kpi-total').textContent = _startParticipants.length;
    document.getElementById('start-kpi-active').textContent = active;
    document.getElementById('start-kpi-completed-online').textContent = compOnline;
    document.getElementById('start-kpi-completed-presential').textContent = compPresen;
}

function renderStartGrid() {
    const container = document.getElementById('start-grid');
    if (!container) return;
    
    const search = (document.getElementById('start-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('start-filter-status')?.value || '';
    const sourceFilter = document.getElementById('start-filter-source')?.value || '';
    
    const filtered = _startParticipants.filter(p => {
        const cStatus = getParticipantComputedStatus(p);
        
        let matchSearch = !search || 
            (p.name && p.name.toLowerCase().includes(search)) || 
            (p.email && p.email.toLowerCase().includes(search));
            
        let matchStatus = !statusFilter || cStatus.st === statusFilter;
        let matchSource = !sourceFilter || p.source === sourceFilter;
        
        return matchSearch && matchStatus && matchSource;
    });
    
    // Sort: completed on top, then newest
    filtered.sort((a,b) => {
        const stA = getParticipantComputedStatus(a).st === 'completed' ? 1 : 0;
        const stB = getParticipantComputedStatus(b).st === 'completed' ? 1 : 0;
        if (stA !== stB) return stB - stA; // completed first
        return new Date(b.created_at) - new Date(a.created_at);
    });
    
    if (filtered.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-dim);">Nenhum participante encontrado.</div>`;
        return;
    }
    
    container.innerHTML = filtered.map(p => {
        const cStatus = getParticipantComputedStatus(p);
        let statusBadge = '';
        let statusBorder = 'rgba(255,255,255,.06)';
        
        if (cStatus.st === 'completed') {
            statusBorder = 'rgba(251, 191, 36, .4)';
            statusBadge = `<div style="background:rgba(251, 191, 36, .15); color:#FBBF24; padding:4px 10px; border-radius:12px; font-size:0.7rem; font-weight:700;">CONCLUÍDO (${cStatus.type === 'online'? 'Online': 'Presencial'})</div>`;
        } else if (cStatus.st === 'in_progress') {
            statusBadge = `<div style="background:rgba(96, 165, 250, .15); color:#60A5FA; padding:4px 10px; border-radius:12px; font-size:0.7rem; font-weight:700;">EM ANDAMENTO</div>`;
        } else {
            statusBadge = `<div style="background:rgba(255,255,255,.05); color:var(--text-dim); padding:4px 10px; border-radius:12px; font-size:0.7rem; font-weight:700;">NÃO INICIOU</div>`;
        }
        
        let sourceStr = 'Novo Cadastro';
        if (p.source === 'consolidation') sourceStr = 'Consolidado';
        if (p.source === 'visitor') sourceStr = 'Visitante';
        
        return `
            <div class="hub-card" style="border:1px solid ${statusBorder}; cursor:pointer;" onclick="openStartDrawer('${p.id}')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <h3 style="margin:0; font-size:1rem; color:#fff;">${p.name}</h3>
                        <p style="margin:2px 0 0; font-size:0.8rem; color:var(--text-dim);">${p.email}</p>
                    </div>
                </div>
                <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:12px;">Origem: ${sourceStr}</div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    ${statusBadge}
                    <div style="font-size:0.75rem; color:var(--text-dim); text-align:right;">Última: ${getLastLessonText(p)}<br>${new Date(p.created_at).toLocaleDateString('pt-BR')}</div>
                </div>
            </div>
        `;
    }).join('');
}


// ── Drawer ──────────────────────────────────────────
window.openStartDrawer = function(id) {
    const p = _startParticipants.find(x => x.id === id);
    if (!p) return;
    _currentStartSelectedId = id;
    
    document.getElementById('start-drawer-name').textContent = p.name;
    document.getElementById('start-drawer-input-name').value = p.name || '';
    document.getElementById('start-drawer-input-email').value = p.email || '';
    document.getElementById('start-drawer-input-phone').value = p.phone || '';
    
    const cStatus = getParticipantComputedStatus(p);
    const badgeEl = document.getElementById('start-drawer-badge');
    if (cStatus.st === 'completed') {
        badgeEl.textContent = 'CONCLUÍDO';
        badgeEl.style.background = 'rgba(251,191,36,.2)';
        badgeEl.style.color = '#FBBF24';
    } else if (cStatus.st === 'in_progress') {
        badgeEl.textContent = 'EM ANDAMENTO';
        badgeEl.style.background = 'rgba(96,165,250,.2)';
        badgeEl.style.color = '#60A5FA';
    } else {
        badgeEl.textContent = 'NÃO INICIOU';
        badgeEl.style.background = 'rgba(255,255,255,.1)';
        badgeEl.style.color = '#fff';
    }
    
    const histEl = document.getElementById('start-drawer-progress-history');
    if (!p.start_progress || p.start_progress.length === 0) {
        histEl.innerHTML = '<div style="font-size:0.8rem; color:var(--text-dim);">Nenhum progresso registrado.</div>';
    } else {
        const sorted = [...p.start_progress].sort((a,b) => a.lesson_number - b.lesson_number);
        histEl.innerHTML = sorted.map(pr => {
            let sCol = '#60A5FA';
            let sText = 'Assistindo';
            if (pr.status === 'completed') { sCol = '#34D399'; sText = 'Concluída'; }
            if (pr.status === 'quiz_failed') { sCol = '#F87171'; sText = 'Reprovada'; }
            return `
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px dashed rgba(255,255,255,.06);">
                <div>
                    <div style="font-weight:600; font-size:0.85rem; color:#fff;">Aula ${pr.lesson_number}</div>
                    <div style="font-size:0.7rem; color:var(--text-dim);">${pr.completed_at ? new Date(pr.completed_at).toLocaleString('pt-BR') : 'Sem data'}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.75rem; font-weight:700; color:${sCol};">${sText}</div>
                    <div style="font-size:0.7rem; color:var(--text-dim);">Score: ${pr.quiz_score !== null ? pr.quiz_score+'%' : '-'}</div>
                </div>
            </div>`;
        }).join('');
    }
    
    document.getElementById('start-drawer-overlay').style.display = 'flex';
};

window.closeStartDrawer = function() {
    document.getElementById('start-drawer-overlay').style.display = 'none';
    _currentStartSelectedId = null;
};

window.startDeleteParticipant = async function() {
    if (!_currentStartSelectedId) return;
    if (!confirm('Excluir participante e todo o seu progresso? Esta ação não pode ser desfeita.')) return;
    try {
        const sb = window.supabaseClient;
        const { error } = await sb.from('start_participants').delete().eq('id', _currentStartSelectedId);
        if (error) throw error;
        
        if (typeof hubToast !== 'undefined') hubToast('Participante excluído', 'success');
        closeStartDrawer();
        loadStartModule(); // reload data
    } catch(e) {
        console.error('startDeleteParticipant error:', e);
        if (typeof hubToast !== 'undefined') hubToast('Erro ao excluir', 'error');
    }
};


// ── Config Modal ────────────────────────────────────
window.startConfigOpen = async function() {
    document.getElementById('start-config-modal-overlay').style.display = 'flex';
    const container = document.getElementById('start-config-lessons-container');
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim);">Carregando aulas...</div>';
    
    try {
        const sb = window.supabaseClient;
        const { data, error } = await sb
            .from('start_lessons')
            .select('*')
            .eq('workspace_id', window.currentWorkspaceId)
            .order('lesson_number', { ascending: true });
            
        if (error) throw error;
        _startLessonsConfig = data || [];
        
        // Ensure we have 9 lessons (0 to 8)
        let html = '';
        for (let i = 0; i <= 8; i++) {
            const l = _startLessonsConfig.find(x => x.lesson_number === i) || {};
            const title = l.title || (i === 0 ? 'Aula de Boas-vindas' : `Aula ${i}`);
            const yt = l.youtube_url || '';
            const pdf = l.pdf_url || '';
            
            html += `
            <div style="margin-bottom:24px; padding:16px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.06); border-radius:12px;">
                <h4 style="margin:0 0 12px; font-size:0.95rem; color:#fff;">Aula ${i}: ${title}</h4>
                <input type="hidden" id="start-cfg-title-${i}" value="${title}">
                <div class="form-group" style="margin-bottom:10px;">
                    <label style="font-size:0.75rem; color:var(--text-dim);">URL do Vídeo (YouTube)</label>
                    <input type="text" id="start-cfg-yt-${i}" class="input-light" style="width:100%;" placeholder="https://youtube.com/watch?v=..." value="${yt}">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; color:var(--text-dim);">URL do PDF de Apoio (Opcional)</label>
                    <input type="text" id="start-cfg-pdf-${i}" class="input-light" style="width:100%;" placeholder="https://..." value="${pdf}">
                </div>
            </div>`;
        }
        
        container.innerHTML = html;
        
    } catch(e) {
        console.error('startConfigOpen error', e);
        container.innerHTML = '<div style="color:#F87171; text-align:center;">Erro ao carregar configurações.</div>';
    }
};

window.startConfigClose = function() {
    document.getElementById('start-config-modal-overlay').style.display = 'none';
};

window.startConfigSave = async function() {
    const btn = document.getElementById('btn-start-config-save');
    btn.textContent = 'Salvando...';
    btn.disabled = true;
    
    try {
        const sb = window.supabaseClient;
        const wid = window.currentWorkspaceId;
        
        // Collect data
        const upserts = [];
        for (let i = 0; i <= 8; i++) {
            const idField = _startLessonsConfig.find(x => x.lesson_number === i)?.id;
            const title = document.getElementById(`start-cfg-title-${i}`).value;
            const yt = document.getElementById(`start-cfg-yt-${i}`).value.trim();
            const pdf = document.getElementById(`start-cfg-pdf-${i}`).value.trim();
            
            let obj = {
                workspace_id: wid,
                lesson_number: i,
                title: title,
                youtube_url: yt || null,
                pdf_url: pdf || null,
                is_active: true
            };
            if (idField) obj.id = idField;
            upserts.push(obj);
        }
        
        const { error } = await sb.from('start_lessons').upsert(upserts);
        if (error) throw error;
        
        if (typeof hubToast !== 'undefined') hubToast('Configurações salvas!', 'success');
        startConfigClose();
        
    } catch(e) {
        console.error('startConfigSave error', e);
        if (typeof hubToast !== 'undefined') hubToast('Erro ao salvar', 'error');
    } finally {
        btn.textContent = 'Salvar Configurações';
        btn.disabled = false;
    }
};
