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
                start_completions(completion_type, completed_at),
                start_comments(id, lesson_number, lesson_title, message, reply, reply_at, reply_viewed, created_at),
                start_notes(id, content, created_at, user_id, users(name))
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

}

window.copyStartLink = function(page) {
    const slug = window._slug || (window.location.pathname.split('/')[1]);
    // Ensure .html extension is always present
    const pageName = page.endsWith('.html') ? page : page + '.html';
    const url = window.location.origin + '/' + slug + '/' + pageName;
    
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(() => {
            if (typeof hubToast !== 'undefined') hubToast('Link copiado!', 'success');
            else alert('Link copiado!');
        }).catch(err => {
            console.error('Failed to copy', err);
            prompt('Copie o link manualmente:', url);
        });
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            if (typeof hubToast !== 'undefined') hubToast('Link copiado!', 'success');
            else alert('Link copiado!');
        } catch (err) {
            console.error('Failed to copy', err);
            prompt('Copie o link manualmente:', url);
        }
        document.body.removeChild(textArea);
    }
};

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
    
    if (!document.getElementById('start-premium-styles')) {
        const style = document.createElement('style');
        style.id = 'start-premium-styles';
        style.innerHTML = `
            .premium-hover-card { transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important; }
            .premium-hover-card:hover { transform: translateY(-3px) scale(1.01); background: rgba(255,255,255,0.04) !important; border-color: rgba(255,255,255,0.15) !important; z-index: 2; box-shadow: 0 15px 35px rgba(0,0,0,0.4) !important; }
        `;
        document.head.appendChild(style);
    }

    container.innerHTML = filtered.map(p => {
        const cStatus = getParticipantComputedStatus(p);
        
        let maxL = 0;
        if (p.start_progress && p.start_progress.length > 0) {
            maxL = Math.max(...p.start_progress.map(x => x.lesson_number));
        }
        let progressPct = cStatus.st === 'completed' ? 100 : (cStatus.st === 'in_progress' ? Math.round((maxL) / 8 * 100) : 0);
        
        let statusBadge = '';
        let borderGlow = '0 5px 15px rgba(0,0,0,0.2)';
        
        if (cStatus.st === 'completed') {
            borderGlow = '0 0 20px rgba(251, 191, 36, 0.05)';
            statusBadge = `<div style="background:linear-gradient(90deg, rgba(251, 191, 36, .15), rgba(251, 191, 36, .05)); color:#FBBF24; padding:5px 12px; border-radius:12px; font-size:0.65rem; font-weight:800; border:1px solid rgba(251,191,36,0.3); box-shadow:0 0 10px rgba(251,191,36,0.1); display:flex; align-items:center; gap:4px;"><span>✨</span>CONCLUÍDO (${cStatus.type === 'online'? 'ONLINE': 'PRESENCIAL'})</div>`;
        } else if (cStatus.st === 'in_progress') {
            borderGlow = '0 0 20px rgba(96, 165, 250, 0.05)';
            statusBadge = `<div style="background:rgba(96, 165, 250, .15); color:#60A5FA; padding:5px 12px; border-radius:12px; font-size:0.65rem; font-weight:800; border:1px solid rgba(96,165,250,0.2);">EM ANDAMENTO</div>`;
        } else {
            statusBadge = `<div style="background:rgba(255,255,255,.05); color:var(--text-dim); padding:5px 12px; border-radius:12px; font-size:0.65rem; font-weight:700; border:1px solid rgba(255,255,255,0.05);">NÃO INICIOU</div>`;
        }
        
        let sourceStr = 'Novo Cadastro'; let sourceIcon = '🌍';
        if (p.source === 'consolidation') { sourceStr = 'Consolidado'; sourceIcon = '🤝'; }
        if (p.source === 'visitor') { sourceStr = 'Visitante'; sourceIcon = '👋'; }
        
        // Unread comments
        const unreadComments = p.start_comments?.filter(c => !c.reply) || [];
        const commentBadge = unreadComments.length > 0 ? `<div style="background:rgba(239, 68, 68, 0.15); color:#ef4444; font-size:0.65rem; font-weight:800; padding:4px 10px; border-radius:12px; border:1px solid rgba(239, 68, 68, 0.3); display:flex; align-items:center; gap:4px; animation: pulse 2s infinite;"><span style="font-size:0.8rem;">💬</span> ${unreadComments.length} nova(s)</div>` : '';

        return `
            <div class="hub-card premium-hover-card" style="border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.01); backdrop-filter:blur(10px); cursor:pointer; position:relative; overflow:hidden; box-shadow:${borderGlow}; padding:20px; border-radius:16px;" onclick="openStartDrawer('${p.id}')">
                ${cStatus.st === 'completed' ? `<div style="position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg, transparent, #FBBF24, transparent); opacity:0.8;"></div>` : ''}

                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px;">
                    <div style="width:100%;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <h3 style="margin:0; font-size:1.15rem; color:#fff; font-weight:800; letter-spacing:-0.3px;">${p.name}</h3>
                                <span title="${sourceStr}" style="font-size:0.85rem; opacity:0.9;">${sourceIcon}</span>
                            </div>
                            ${commentBadge}
                        </div>
                        <p style="margin:4px 0 0; font-size:0.85rem; color:var(--text-dim);">${p.email}</p>
                        ${p.phone ? `
                        <div style="margin-top:8px; display:inline-flex; align-items:center; gap:6px; background:rgba(37, 211, 102, 0.1); border:1px solid rgba(37, 211, 102, 0.2); padding:4px 10px; border-radius:8px; cursor:pointer; color:#25D366; font-size:0.75rem; font-weight:600; transition:all 0.2s;" class="hub-premium-hover" onclick="event.stopPropagation(); window.open('https://wa.me/${p.phone.replace(/[^0-9]/g, '')}', '_blank')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.996 2C6.471 2 2 6.471 2 11.996c0 1.777.463 3.454 1.34 4.965L2 22l5.163-1.332C8.65 21.536 10.283 22 11.996 22c5.525 0 9.996-4.471 9.996-9.997 0-5.524-4.471-9.995-9.996-9.995zm5.542 14.394c-.237.669-1.373 1.258-1.928 1.348-.521.085-1.187.161-3.327-.723-2.583-1.066-4.228-3.705-4.357-3.878-.129-.174-1.042-1.383-1.042-2.636 0-1.253.649-1.874.885-2.115.236-.242.518-.303.689-.303.172 0 .343.006.495.012.161.006.376-.06.58.43.216.516.732 1.79.796 1.92.064.129.108.28.022.451-.086.173-.129.28-.258.431-.13.151-.274.32-.387.432-.129.129-.265.267-.12.516.145.249.646 1.068 1.393 1.737.965.864 1.765 1.132 2.013 1.261.248.13.393.109.544-.065.15-.173.649-.757.821-1.015.172-.259.344-.216.57-.13.226.086 1.431.674 1.678.798.247.124.412.186.473.29.062.105.062.607-.175 1.275z"/></svg>
                            ${p.phone}
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <div style="margin-bottom:18px; padding:12px; background:rgba(0,0,0,0.2); border-radius:10px; border:1px solid rgba(255,255,255,0.03);">
                    <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-dim); margin-bottom:8px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">
                        <span>Última: <span style="color:#fff;">${getLastLessonText(p)}</span></span>
                        <span style="color:${cStatus.st === 'completed' ? '#FBBF24' : (progressPct>0?'#60A5FA':'var(--text-dim)')}">${progressPct}%</span>
                    </div>
                    <div style="width:100%; height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden;">
                        <div style="height:100%; width:${progressPct}%; background:${cStatus.st === 'completed' ? '#FBBF24' : '#60A5FA'}; border-radius:2px; box-shadow:0 0 8px ${cStatus.st === 'completed' ? 'rgba(251,191,36,0.5)' : 'rgba(96,165,250,0.5)'}; transition:width 0.8s;"></div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    ${statusBadge}
                    <div style="font-size:0.65rem; color:var(--text-dim); text-align:right; text-transform:uppercase; letter-spacing:0.5px;">Ativo em<br><span style="color:rgba(255,255,255,0.85); font-weight:700; font-size:0.75rem;">${new Date(p.created_at).toLocaleDateString('pt-BR')}</span></div>
                </div>
            </div>
        `;
    }).join('');
}


// ── Drawer ──────────────────────────────────────────
window.openStartDrawer = async function(id) {
    const p = _startParticipants.find(x => x.id === id);
    if (!p) return;
    _currentStartSelectedId = id;
    
    document.getElementById('start-drawer-name').textContent = p.name;
    document.getElementById('start-drawer-input-name').value = p.name || '';
    document.getElementById('start-drawer-input-email').value = p.email || '';
    document.getElementById('start-drawer-input-phone').value = p.phone || '';
    
    document.getElementById('start-drawer-input-notes').value = '';
    startRenderNotesList(p);

    const cStatus = getParticipantComputedStatus(p);
    const badgeEl = document.getElementById('start-drawer-badge');
    if (badgeEl) {
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
    }
    
    const histEl = document.getElementById('start-drawer-progress-history');
    if (histEl) {
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
    }
    
    // Open drawer first so user sees it immediately
    const overlay = document.getElementById('start-drawer-overlay');
    const drawerEl = overlay?.querySelector('.hub-drawer');
    if (overlay) overlay.classList.add('open');
    if (drawerEl) drawerEl.classList.add('open');
    
    // Load comments fresh from DB
    const commentsEl = document.getElementById('start-drawer-comments');
    if (commentsEl) {
        commentsEl.innerHTML = '<div style="font-size:0.8rem; color:var(--text-dim); text-align:center; padding:12px;">Carregando reflexões...</div>';
        try {
            const sb = window.supabaseClient;
            const { data: comments, error } = await sb.from('start_comments')
                .select('*')
                .eq('participant_id', p.id)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            
            if (!comments || comments.length === 0) {
                commentsEl.innerHTML = '<div style="font-size:0.85rem; color:var(--text-dim); text-align:center; padding:16px 0;">Nenhuma reflexão ainda.</div>';
            } else {
                commentsEl.innerHTML = comments.map(c => {
                    const lessonStr = c.lesson_title || `Aula ${c.lesson_number}`;
                    const safeId = c.id;
                    const safeEmail = (p.email || '').replace(/'/g, '').replace(/"/g, '');
                    const safeName = (p.name || '').replace(/'/g, '').replace(/"/g, '');
                    const safeLesson = lessonStr.replace(/'/g, '').replace(/"/g, '');
                    
                    const replyHtml = c.reply
                        ? `<div style="margin-top:12px; background:rgba(255,215,0,0.07); border:1px solid rgba(255,215,0,0.25); border-radius:10px; padding:12px 14px;">
                            <div style="font-size:0.65rem; color:rgba(255,215,0,0.7); text-transform:uppercase; letter-spacing:1px; font-weight:700; margin-bottom:6px;">✅ Sua resposta</div>
                            <div style="font-size:0.9rem; color:#fff; line-height:1.5;">${c.reply}</div>
                           </div>`
                        : `<div style="margin-top:12px;">
                            <textarea id="reply-input-${safeId}" placeholder="Escrever resposta para ${safeName}..." style="width:100%; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#fff; padding:10px 12px; font-family:'Outfit'; font-size:0.9rem; resize:vertical; min-height:70px; margin-bottom:8px; box-sizing:border-box;"></textarea>
                            <button data-comment-id="${safeId}" data-participant-id="${p.id}" data-participant-email="${safeEmail}" data-participant-name="${safeName}" data-lesson-title="${safeLesson}" data-lesson-number="${c.lesson_number}" onclick="handleStartReply(this)" style="background:linear-gradient(135deg, #FBBF24, #D97706); border:none; border-radius:10px; color:#000; font-family:'Outfit'; font-weight:800; font-size:0.85rem; padding:12px 16px; cursor:pointer; width:100%; transition:all 0.2s; box-shadow:0 10px 20px -5px rgba(251, 191, 36, 0.4);" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">✨ Responder &amp; Enviar Email</button>
                           </div>`;
                    
                    return `
                    <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:14px; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span style="font-size:0.7rem; font-weight:800; color:var(--primary); text-transform:uppercase; letter-spacing:1px;">${lessonStr}</span>
                            <span style="font-size:0.7rem; color:var(--text-dim);">${new Date(c.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <p style="margin:0; font-size:0.9rem; color:rgba(255,255,255,0.85); line-height:1.5; font-style:italic;">&ldquo;${c.message}&rdquo;</p>
                        ${replyHtml}
                    </div>`;
                }).join('');
            }
        } catch(e) {
            console.error('Error loading comments:', e);
            commentsEl.innerHTML = `<div style="font-size:0.8rem; color:#F87171; text-align:center; padding:12px;">Erro ao carregar reflexões: ${e.message}</div>`;
        }
    }
};

window.closeStartDrawer = function() {
    const overlay = document.getElementById('start-drawer-overlay');
    const drawerEl = overlay?.querySelector('.hub-drawer');
    if (overlay) overlay.classList.remove('open');
    if (drawerEl) drawerEl.classList.remove('open');
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

window.saveStartNotes = async function() {
    if (!_currentStartSelectedId) return;
    const notesInput = document.getElementById('start-drawer-input-notes');
    if (!notesInput) return;
    
    const newNotes = notesInput.value.trim();
    if (!newNotes) return;

    const btn = document.getElementById('start-drawer-save-notes-btn') || event.currentTarget;
    const originalText = btn.innerText;
    btn.innerText = 'Adicionando...';
    btn.disabled = true;

    try {
        const sb = window.supabaseClient;
        const { data, error } = await sb.from('start_notes').insert({
            participant_id: _currentStartSelectedId,
            workspace_id: window.currentWorkspaceId,
            content: newNotes
        }).select('id, content, created_at, user_id, users(name)').single();
        if (error) throw error;
        
        if (typeof hubToast !== 'undefined') hubToast('Nota adicionada com sucesso', 'success');
        
        // Update local state
        const p = _startParticipants.find(x => x.id === _currentStartSelectedId);
        if (p) {
            if (!p.start_notes) p.start_notes = [];
            p.start_notes.push(data);
            notesInput.value = '';
            startRenderNotesList(p);
        }
    } catch(e) {
        console.error('saveStartNotes error:', e);
        if (typeof hubToast !== 'undefined') hubToast('Erro ao salvar nota', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

window.startDeleteNote = async function(noteId) {
    if (!confirm('Excluir esta nota permanentemente?')) return;
    const p = _startParticipants.find(x => x.id === _currentStartSelectedId);
    if (!p) return;

    try {
        const sb = window.supabaseClient;
        const { error } = await sb.from('start_notes').delete().eq('id', noteId);
        if (error) throw error;
        
        if (typeof hubToast !== 'undefined') hubToast('Nota excluída', 'success');
        
        if (p.start_notes) {
            p.start_notes = p.start_notes.filter(n => n.id !== noteId);
            startRenderNotesList(p);
        }
    } catch(e) {
        console.error(e);
        if (typeof hubToast !== 'undefined') hubToast('Erro ao excluir nota', 'error');
    }
};

function startRenderNotesList(p) {
    const listEl = document.getElementById('start-drawer-notes-list');
    if (!listEl) return;
    if (!p.start_notes || p.start_notes.length === 0) {
        listEl.innerHTML = '<div style="font-size:0.8rem; color:var(--text-dim); text-align:center; padding:12px;">Nenhuma nota adicionada ainda.</div>';
        return;
    }
    const sorted = [...p.start_notes].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    listEl.innerHTML = sorted.map(n => {
        const authorName = n.users && n.users.name ? n.users.name : 'Administrador';
        return `
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-size:0.75rem; font-weight:700; color:var(--accent); display:flex; align-items:center; gap:6px;">
                    <div style="width:18px; height:18px; border-radius:50%; background:var(--accent); color:#000; display:flex; align-items:center; justify-content:center; font-size:0.6rem;">${authorName.charAt(0)}</div>
                    ${authorName}
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:0.7rem; color:var(--text-dim);">${new Date(n.created_at).toLocaleString('pt-BR').substring(0, 16)}</span>
                    <button onclick="window.startDeleteNote('${n.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.8rem; padding:0; opacity:0.7; transition:0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" title="Excluir nota">✕</button>
                </div>
            </div>
            <div style="font-size:0.85rem; color:#fff; line-height:1.4; white-space:pre-wrap;">${n.content}</div>
        </div>`;
    }).join('');
}


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

// ── Handle Reply Button Click ─────────────────────────
window.handleStartReply = function(btn) {
    const commentId = btn.getAttribute('data-comment-id');
    const participantId = btn.getAttribute('data-participant-id');
    const participantEmail = btn.getAttribute('data-participant-email');
    const participantName = btn.getAttribute('data-participant-name');
    const lessonTitle = btn.getAttribute('data-lesson-title');
    const lessonNumber = parseInt(btn.getAttribute('data-lesson-number'), 10);
    sendStartReply(commentId, participantId, participantEmail, participantName, lessonTitle, lessonNumber);
};

// ── Send Reply to Participant ─────────────────────────
window.sendStartReply = async function(commentId, participantId, participantEmail, participantName, lessonTitle, lessonNumber) {
    const replyText = document.getElementById(`reply-input-${commentId}`)?.value?.trim();
    if (!replyText) {
        if (typeof hubToast !== 'undefined') hubToast('Escreva uma resposta primeiro.', 'error');
        return;
    }
    
    const btn = document.querySelector(`button[onclick*="${commentId}"]`);
    if (btn) { btn.textContent = 'Enviando...'; btn.disabled = true; }
    
    try {
        const sb = window.supabaseClient;
        
        // Get participant's original message for email context
        const { data: commentData } = await sb.from('start_comments')
            .select('message')
            .eq('id', commentId)
            .single();
        
        // Get workspace name
        const { data: wsData } = await sb.from('workspaces')
            .select('name')
            .eq('id', window.currentWorkspaceId)
            .single();
        
        const supabaseUrl = window.SUPABASE_URL || 'https://uyseheucqikgcorrygzc.supabase.co';
        const supabaseKey = window.SUPABASE_ANON_KEY;
        
        // Call edge function
        const res = await fetch(`${supabaseUrl}/functions/v1/send-start-reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
            },
            body: JSON.stringify({
                comment_id: commentId,
                participant_email: participantEmail,
                participant_name: participantName,
                lesson_title: lessonTitle,
                lesson_number: lessonNumber,
                original_message: commentData?.message || '',
                reply_message: replyText,
                workspace_name: wsData?.name || 'Igreja',
            })
        });
        
        const result = await res.json();
        if (result.error) throw new Error(result.error);
        
        if (typeof hubToast !== 'undefined') hubToast('Resposta enviada por email! 📧', 'success');
        
        // Reload to show updated state
        loadStartModule();
        closeStartDrawer();
        
    } catch(e) {
        console.error('sendStartReply error:', e);
        if (typeof hubToast !== 'undefined') hubToast('Erro ao enviar resposta: ' + e.message, 'error');
        if (btn) { btn.textContent = 'Responder & enviar email 💬'; btn.disabled = false; }
    }
};
