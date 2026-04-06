// ═══════════════════════════════════════════════════════════════════
// TASK MANAGER MODULE  —  task-manager.js
// ═══════════════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────────────
let _tasksAll      = [];
let _tasksDepts    = [];
let _tasksUsers    = [];
let _tasksView     = 'list';
let _currentTaskId = null;
let _publicReqsAll = [];
let _myTasksOnly   = false;
let _workspaceTags = [];  // tag catalog

// ── Status & Priority Configs ──────────────────────────────────────
const TASK_STATUS = {
    backlog:     { label: 'Backlog',      emoji: '📋', color: '#94A3B8' },
    todo:        { label: 'A Fazer',      emoji: '🔵', color: '#60A5FA' },
    in_progress: { label: 'Em Andamento', emoji: '🟡', color: '#F59E0B' },
    review:      { label: 'Em Revisão',   emoji: '🟣', color: '#A78BFA' },
    done:        { label: 'Concluída',    emoji: '🟢', color: '#34D399' },
    cancelled:   { label: 'Cancelada',    emoji: '⛔', color: '#EF4444' },
};
const TASK_PRIORITY = {
    low:    { label: 'Baixa',   emoji: '🔵', color: '#60A5FA' },
    medium: { label: 'Média',   emoji: '🟡', color: '#F59E0B' },
    high:   { label: 'Alta',    emoji: '🟠', color: '#FB923C' },
    urgent: { label: 'Urgente', emoji: '🔴', color: '#EF4444' },
};

// ── Wire switchTab ─────────────────────────────────────────────────
(function () {
    const _prevST = window.switchTab;
    window.switchTab = function (tab) {
        if (tab === 'admin-tarefas') {
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            document.querySelectorAll('#sidebar li').forEach(li => li.classList.remove('active'));
            const viewEl = document.getElementById('view-admin-tarefas');
            if (viewEl) { viewEl.classList.add('active'); viewEl.style.display = ''; }
            const navEl = document.getElementById('nav-administrativo');
            if (navEl) navEl.classList.add('active');
            loadTaskManager();
            return;
        }
        if (_prevST) _prevST(tab);
    };
})();

// ── Main Loader ────────────────────────────────────────────────────
window.loadTaskManager = async function () {
    const sb   = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!sb || !wsId) return;

    const tbody = document.getElementById('tasks-list-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:60px;text-align:center;color:rgba(255,255,255,.2);">Carregando tarefas...</td></tr>';

    try {
        const userId = window._currentUser?.id;
        const [tasksRes, deptsRes, usersRes, notifsRes, tagsRes] = await Promise.all([
            sb.from('tasks_full').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false }),
            sb.from('task_departments').select('*').eq('workspace_id', wsId).order('name'),
            sb.from('users').select('id,name,email').eq('workspace_id', wsId),
            userId
                ? sb.from('task_notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null)
                : Promise.resolve({ count: 0 }),
            sb.from('task_tags').select('*').eq('workspace_id', wsId).order('name'),
        ]);

        _tasksAll      = tasksRes.data  || [];
        _tasksDepts    = deptsRes.data  || [];
        _tasksUsers    = usersRes.data  || [];
        _workspaceTags = tagsRes.data   || [];

        // Notification bell badge
        const unread = notifsRes.count || 0;
        const notifBadge = document.getElementById('tasks-notif-badge');
        if (notifBadge) {
            notifBadge.textContent    = unread;
            notifBadge.style.display  = unread > 0 ? 'flex' : 'none';
        }

        // Sidebar admin badge — tasks created in last 24h from public form
        const yesterday = new Date(Date.now() - 86400000).toISOString();
        const newPublic = _tasksAll.filter(t => t.source === 'public_form' && t.created_at > yesterday).length;
        const adminBadge = document.getElementById('admin-tasks-badge');
        if (adminBadge) {
            adminBadge.textContent    = newPublic;
            adminBadge.style.display  = newPublic > 0 ? 'inline-flex' : 'none';
        }

        populateTaskFilterDropdowns();
        filterTasksView();
        updateTaskKPIs();

    } catch (e) {
        console.error('loadTaskManager error:', e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:60px;text-align:center;color:#EF4444;">Erro: ${e.message}</td></tr>`;
    }
};


// ── Populate Dropdowns ─────────────────────────────────────────────
function populateTaskFilterDropdowns() {
    ['tasks-filter-dept', 'task-modal-dept'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const first = id.includes('filter') ? '<option value="">Todos os dept.</option>' : '<option value="">— Nenhum —</option>';
        el.innerHTML = first + _tasksDepts.map(d => `<option value="${d.id}">${d.icon || '🏷️'} ${d.name}</option>`).join('');
    });

    ['tasks-filter-assignee', 'task-modal-assignee'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const first = id.includes('filter') ? '<option value="">Todos os membros</option>' : '<option value="">— Sem responsável —</option>';
        el.innerHTML = first + _tasksUsers.map(u => `<option value="${u.id}">${u.name || u.email}</option>`).join('');
    });
}

// ── KPIs ───────────────────────────────────────────────────────────
function updateTaskKPIs() {
    const now = new Date();
    const c   = { total: _tasksAll.length, todo: 0, in_progress: 0, review: 0, done: 0, overdue: 0 };
    _tasksAll.forEach(t => {
        if (t.status === 'todo')        c.todo++;
        if (t.status === 'in_progress') c.in_progress++;
        if (t.status === 'review')      c.review++;
        if (t.status === 'done')        c.done++;
        if (t.due_date && new Date(t.due_date) < now && !['done', 'cancelled'].includes(t.status)) c.overdue++;
    });
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('tkpi-total',    c.total);
    set('tkpi-todo',     c.todo);
    set('tkpi-progress', c.in_progress);
    set('tkpi-review',   c.review);
    set('tkpi-done',     c.done);
    set('tkpi-overdue',  c.overdue);
}

// ── Filter ─────────────────────────────────────────────────────────
window.filterTasksView = function () {
    const search   = (document.getElementById('tasks-search')?.value    || '').toLowerCase();
    const status   = (document.getElementById('tasks-filter-status')?.value    || '');
    const priority = (document.getElementById('tasks-filter-priority')?.value  || '');
    const dept     = (document.getElementById('tasks-filter-dept')?.value      || '');
    const assignee = (document.getElementById('tasks-filter-assignee')?.value  || '');

    let list = _tasksAll;
    if (_myTasksOnly) {
        const me = window._currentUser?.id;
        if (me) list = list.filter(t => t.assignee_id === me);
    }
    if (search)   list = list.filter(t => (t.title || '').toLowerCase().includes(search) || (t.description || '').toLowerCase().includes(search));
    if (status)   list = list.filter(t => t.status      === status);
    if (priority) list = list.filter(t => t.priority    === priority);
    if (dept)     list = list.filter(t => t.department_id === dept);
    if (assignee) list = list.filter(t => t.assignee_id  === assignee);

    if (_tasksView === 'list') renderTasksList(list);
    else renderTasksKanban(list);
};

// ── My Tasks Toggle ────────────────────────────────────────────────
window.toggleMyTasks = function () {
    _myTasksOnly = !_myTasksOnly;
    const btn = document.getElementById('btn-my-tasks');
    if (btn) {
        btn.style.background = _myTasksOnly ? 'rgba(255,215,0,.18)' : 'rgba(255,255,255,.05)';
        btn.style.color      = _myTasksOnly ? '#FFD700' : 'rgba(255,255,255,.5)';
        btn.style.borderColor= _myTasksOnly ? 'rgba(255,215,0,.4)' : 'rgba(255,255,255,.1)';
        btn.title = _myTasksOnly ? 'Mostrar todas as tarefas' : 'Mostrar apenas minhas tarefas';
    }
    filterTasksView();
};


// ── View Toggle ─────────────────────────────────────────────────────
window.setTasksView = function (view) {
    _tasksView = view;
    const lv = document.getElementById('tasks-list-view');
    const kv = document.getElementById('tasks-kanban-view');
    const lb = document.getElementById('tasks-view-list');
    const kb = document.getElementById('tasks-view-kanban');
    const gb = document.getElementById('tasks-kanban-groupby');

    if (view === 'list') {
        if (lv) lv.style.display = '';
        if (kv) kv.style.display = 'none';
        if (lb) { lb.style.background = 'rgba(255,215,0,.15)'; lb.style.color = '#FFD700'; }
        if (kb) { kb.style.background = 'transparent';         kb.style.color = 'rgba(255,255,255,.4)'; }
        if (gb) gb.style.display = 'none';
    } else {
        if (lv) lv.style.display = 'none';
        if (kv) kv.style.display = '';
        if (lb) { lb.style.background = 'transparent';         lb.style.color = 'rgba(255,255,255,.4)'; }
        if (kb) { kb.style.background = 'rgba(255,215,0,.15)'; kb.style.color = '#FFD700'; }
        if (gb) gb.style.display = '';
    }
    filterTasksView();
};

// ── List View ──────────────────────────────────────────────────────
function renderTasksList(tasks) {
    const tbody = document.getElementById('tasks-list-tbody');
    if (!tbody) return;

    if (!tasks.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:60px;text-align:center;color:rgba(255,255,255,.2);font-size:.88rem;">Nenhuma tarefa encontrada</td></tr>';
        return;
    }
    const now = new Date();
    tbody.innerHTML = tasks.map(t => {
        const st      = TASK_STATUS[t.status]     || TASK_STATUS.todo;
        const pr      = TASK_PRIORITY[t.priority] || TASK_PRIORITY.medium;
        const due     = t.due_date ? new Date(t.due_date) : null;
        const overdue = due && due < now && !['done', 'cancelled'].includes(t.status);
        const dueStr  = due ? due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
        const dueClr  = overdue ? '#EF4444' : (due && (due - now) < 2 * 86400000 ? '#F59E0B' : 'rgba(255,255,255,.4)');

        return `<tr style="border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;transition:background .15s;"
                    onclick="openTaskModal('${t.id}')"
                    onmouseover="this.style.background='rgba(255,215,0,.03)'"
                    onmouseout="this.style.background=''">
            <td data-label="Tarefa" style="padding:13px 16px;">
                <div style="font-weight:600;color:#fff;font-size:.88rem;line-height:1.3;">${t.title || 'Sem título'}</div>
                ${t.description ? `<div style="font-size:.74rem;color:rgba(255,255,255,.35);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px;">${t.description}</div>` : ''}
            </td>
            <td data-label="Status" style="padding:13px 16px;">
                <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:.7rem;font-weight:700;background:${st.color}20;color:${st.color};border:1px solid ${st.color}35;white-space:nowrap;">
                    ${st.emoji} ${st.label}
                </span>
            </td>
            <td data-label="Prioridade" style="padding:13px 16px;">
                <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:.7rem;font-weight:700;background:${pr.color}20;color:${pr.color};border:1px solid ${pr.color}35;white-space:nowrap;">
                    ${pr.emoji} ${pr.label}
                </span>
            </td>
            <td data-label="Dept." style="padding:13px 16px;font-size:.8rem;color:rgba(255,255,255,.55);">
                ${t.department_icon ? t.department_icon + ' ' : ''}${t.department_name || '—'}
            </td>
            <td data-label="Responsável" style="padding:13px 16px;">
                ${t.assignee_name
                    ? `<div style="display:flex;align-items:center;gap:7px;">
                           <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#FFD700,#FFA000);display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:900;color:#000;flex-shrink:0;">${(t.assignee_name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}</div>
                           <span style="font-size:.8rem;color:rgba(255,255,255,.7);">${t.assignee_name}</span>
                       </div>`
                    : '<span style="color:rgba(255,255,255,.25);font-size:.8rem;">—</span>'}
            </td>
            <td data-label="Data Ref." style="padding:13px 16px;text-align:center;font-size:.8rem;font-weight:600;color:${dueClr};">
                ${overdue ? '⚠️ ' : ''}${dueStr}
            </td>
            <td data-label="Logs" style="padding:13px 16px;text-align:center;font-size:.8rem;color:rgba(255,255,255,.4);">
                ${t.comment_count > 0 ? `<span style="color:rgba(255,255,255,.6);">${t.comment_count}</span>` : '—'}
            </td>
        </tr>`;
    }).join('');
}

// ── Kanban View ────────────────────────────────────────────────────
function renderTasksKanban(tasks) {
    const board = document.getElementById('tasks-kanban-board');
    if (!board) return;

    const groupBy = document.getElementById('tasks-kanban-groupby')?.value || 'status';
    let columnsData = [];

    if (groupBy === 'status') {
        const statuses = ['backlog', 'todo', 'in_progress', 'review', 'done'];
        columnsData = statuses.map(s => {
            const st = TASK_STATUS[s];
            return {
                id: s,
                label: st.label,
                emoji: st.emoji,
                color: st.color,
                tasks: tasks.filter(t => t.status === s || (s === 'backlog' && !t.status))
            };
        });
    } else if (groupBy === 'priority') {
        const priorities = ['urgent', 'high', 'medium', 'low'];
        columnsData = priorities.map(p => {
            const pr = TASK_PRIORITY[p];
            return {
                id: p,
                label: pr.label,
                emoji: pr.emoji,
                color: pr.color,
                tasks: tasks.filter(t => t.priority === p || (p === 'medium' && !t.priority))
            };
        });
    } else if (groupBy === 'assignee') {
        const map = new Map();
        tasks.forEach(t => { if (t.assignee_name) map.set(t.assignee_id, t.assignee_name); });
        columnsData = Array.from(map.entries()).map(([id, name]) => ({
            id: id,
            label: name.split(' ')[0],
            emoji: '👤',
            color: '#60A5FA',
            tasks: tasks.filter(t => t.assignee_id === id)
        }));
        columnsData.push({
            id: 'unassigned',
            label: 'Sem Responsável',
            emoji: '👻',
            color: '#94A3B8',
            tasks: tasks.filter(t => !t.assignee_id)
        });
    }

    board.innerHTML = columnsData.map(col => {
        const cards = col.tasks.map(buildKanbanCard).join('');
        return `<div data-kanban-col="${col.id}"
             style="width:280px;flex-shrink:0;position:relative;"
             ondragover="kanbanDragOver(event,'${col.id}')"
             ondragenter="kanbanDragEnter(event,'${col.id}')"
             ondragleave="kanbanDragLeave(event)"
             ondrop="kanbanDrop(event,'${col.id}','${groupBy}')">
            
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(18,18,18,0.85);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.07);border-radius:12px;position:sticky;top:0;z-index:10;margin-bottom:12px;">
                <span style="font-size:1rem;">${col.emoji}</span>
                <span style="font-weight:700;font-size:.85rem;flex:1;">${col.label}</span>
                <span style="padding:2px 8px;border-radius:20px;background:${col.color}20;color:${col.color};font-size:.7rem;font-weight:800;">${col.tasks.length}</span>
                <button onclick="openTaskModal(null,'${groupBy === 'status' ? col.id : 'todo'}')" title="Nova tarefa"
                        style="width:22px;height:22px;border-radius:6px;border:none;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4);cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;"
                        onmouseover="this.style.background='rgba(255,215,0,.15)';this.style.color='#FFD700'"
                        onmouseout="this.style.background='rgba(255,255,255,.06)';this.style.color='rgba(255,255,255,.4)'">+</button>
            </div>
            
            <div data-kanban-cards="${col.id}" style="display:flex;flex-direction:column;gap:10px;min-height:80px;padding:2px;border-radius:12px;transition:background .2s;">
                ${cards || `<div style="text-align:center;padding:24px 12px;border:1px dashed rgba(255,255,255,.07);border-radius:12px;color:rgba(255,255,255,.2);font-size:.78rem;">Vazia</div>`}
            </div>
        </div>`;
    }).join('');
}

// ── Drag & Drop Handlers ───────────────────────────────────────────
let _draggedTaskId = null;

function kanbanDragEnter(e, colStatus) {
    e.preventDefault();
    const col = document.querySelector(`[data-kanban-cards="${colStatus}"]`);
    if (col) col.classList.add('kanban-col-drop-target');
}
function kanbanDragOver(e, colStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}
function kanbanDragLeave(e) {
    const related = e.relatedTarget;
    if (!related || !e.currentTarget.contains(related)) {
        const col = e.currentTarget.querySelector('[data-kanban-cards]');
        if (col) col.classList.remove('kanban-col-drop-target');
    }
}
async function kanbanDrop(e, newVal, groupBy = 'status') {
    e.preventDefault();
    document.querySelectorAll('[data-kanban-cards]').forEach(c => c.classList.remove('kanban-col-drop-target'));

    const taskId = _draggedTaskId || e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    const task = _tasksAll.find(t => t.id === taskId);
    if (!task) return;

    let dbField = 'status';
    let oldVal  = task.status;
    let msg     = 'Status atualizado ✅';

    if (groupBy === 'priority') {
        dbField = 'priority';
        oldVal  = task.priority;
        msg     = 'Prioridade atualizada ✅';
    } else if (groupBy === 'assignee') {
        dbField = 'assignee_id';
        oldVal  = task.assignee_id || 'unassigned';
        msg     = 'Responsável atualizado ✅';
    }

    if (oldVal === newVal) return;

    // Optimistic Update
    if (groupBy === 'assignee') {
        if (newVal === 'unassigned') {
            task.assignee_id = null;
            task.assignee_name = null;
        } else {
            task.assignee_id = newVal;
            task.assignee_name = 'Atualizando...';
        }
    } else {
        task[dbField] = newVal;
    }
    filterTasksView();

    // Persist
    const sb = window.supabaseClient;
    if (sb) {
        const payload = {};
        payload[dbField] = newVal === 'unassigned' ? null : newVal;
        const { error } = await sb.from('tasks').update(payload).eq('id', taskId);
        if (error) {
            if (typeof hubToast !== 'undefined') hubToast('Erro ao mover: ' + error.message, 'error');
            await loadTaskManager(); // revert
        } else {
            if (typeof hubToast !== 'undefined') hubToast(msg, 'success');
            if (groupBy === 'assignee') await loadTaskManager();
        }
    }
    _draggedTaskId = null;
}


function buildKanbanCard(t) {
    const pr       = TASK_PRIORITY[t.priority] || TASK_PRIORITY.medium;
    const now      = new Date();
    const due      = t.due_date ? new Date(t.due_date) : null;
    const overdue  = due && due < now && !['done', 'cancelled'].includes(t.status);
    const dueStr   = due ? due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : null;
    const isPublic = t.source === 'public_form';

    // Subtask progress
    const subs     = Array.isArray(t.subtasks) ? t.subtasks : [];
    const subDone  = subs.filter(s => s.done).length;
    const subBar   = subs.length > 0
        ? `<div style="margin-bottom:8px;">
               <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                   <span style="font-size:.62rem;color:rgba(255,255,255,.35);">Subtarefas</span>
                   <span style="font-size:.62rem;color:rgba(255,255,255,.35);">${subDone}/${subs.length}</span>
               </div>
               <div style="height:3px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;">
                   <div style="height:100%;width:${Math.round((subDone/subs.length)*100)}%;background:linear-gradient(90deg,#34D399,#059669);border-radius:2px;transition:width .3s;"></div>
               </div>
           </div>`
        : '';

    // Tags
    const tagsHtml = (t.tags || []).slice(0, 3).map(tag => {
        const wt = _workspaceTags.find(x => x.name === tag);
        const c  = wt?.color || '#94A3B8';
        return `<span style="font-size:.58rem;font-weight:700;padding:1px 6px;border-radius:8px;background:${c}22;color:${c};border:1px solid ${c}33;">${tag}</span>`;
    }).join('');

    return `<div onclick="openTaskModal('${t.id}')"
         draggable="true"
         data-task-id="${t.id}"
         ondragstart="_draggedTaskId='${t.id}';this.classList.add('kanban-card-dragging');event.dataTransfer.setData('text/plain','${t.id}')"
         ondragend="this.classList.remove('kanban-card-dragging')"
         style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 16px 14px 18px;cursor:grab;transition:all .2s;user-select:none;position:relative;overflow:hidden;"
         onmouseover="this.style.background='rgba(255,255,255,.07)';this.style.borderColor='rgba(255,215,0,.2)'"
         onmouseout="this.style.background='rgba(255,255,255,.04)';this.style.borderColor='rgba(255,255,255,.08)'">
        <!-- Priority bar -->
        <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${pr.color};border-radius:14px 0 0 14px;opacity:.85;"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <span style="font-size:.62rem;font-weight:800;color:${pr.color};letter-spacing:.02em;">${pr.emoji} ${pr.label}</span>
            <div style="display:flex;align-items:center;gap:6px;">
                ${t.recurrence ? '<span style="font-size:.65rem;color:#A78BFA;opacity:.8;" title="Recorrente">🔄</span>' : ''}
                ${isPublic ? '<span style="font-size:.65rem;color:#FFD700;opacity:.75;" title="Form público">📥</span>' : ''}
                ${t.comment_count > 0 ? `<span style="font-size:.7rem;color:rgba(255,255,255,.3);">💬 ${t.comment_count}</span>` : ''}
            </div>
        </div>
        <div style="font-weight:700;font-size:.85rem;margin-bottom:${t.description ? '4px' : '8px'};line-height:1.35;">${t.title || 'Sem título'}</div>
        ${t.description ? `<div style="font-size:.72rem;color:rgba(255,255,255,.4);margin-bottom:8px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${t.description}</div>` : ''}
        ${t.department_name ? `<div style="font-size:.7rem;color:rgba(255,255,255,.35);margin-bottom:6px;">${t.department_icon || ''} ${t.department_name}</div>` : ''}
        ${tagsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">${tagsHtml}</div>` : ''}
        ${subBar}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
            ${t.assignee_name
                ? `<div style="display:flex;align-items:center;gap:5px;">
                       <div style="width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#FFD700,#FFA000);display:flex;align-items:center;justify-content:center;font-size:.55rem;font-weight:900;color:#000;">${(t.assignee_name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}</div>
                       <span style="font-size:.7rem;color:rgba(255,255,255,.45);">${t.assignee_name.split(' ')[0]}</span>
                   </div>`
                : '<span></span>'}
            ${dueStr ? `<span style="font-size:.7rem;font-weight:600;color:${overdue ? '#EF4444' : 'rgba(255,255,255,.35)'};">${overdue ? '⚠️ ' : '⏰ '}${dueStr}</span>` : ''}
        </div>
    </div>`;
}



// ── Task Modal ─────────────────────────────────────────────────────
window.openTaskModal = async function (taskId, defaultStatus) {
    _currentTaskId = taskId || null;
    defaultStatus  = defaultStatus || 'todo';

    populateTaskFilterDropdowns();

    // Reset form
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('task-modal-title',    '');
    setVal('task-modal-desc',     '');
    setVal('task-modal-notes',    '');
    setVal('task-modal-status',   defaultStatus);
    setVal('task-modal-priority', 'medium');
    setVal('task-modal-due',      '');
    setVal('task-modal-dept',     '');
    setVal('task-modal-assignee', '');

    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText('task-modal-created', '—');

    const srcBadge = document.getElementById('task-modal-source-badge');
    if (srcBadge) srcBadge.style.display = 'none';

    const commEl = document.getElementById('task-modal-comments');
    if (commEl) commEl.innerHTML = '';

    const attEl = document.getElementById('task-modal-attachments-preview');
    if (attEl) attEl.innerHTML = '';

    const delBtn = document.getElementById('btn-delete-task');
    if (delBtn) { delBtn.style.display = taskId ? '' : 'none'; delBtn.dataset.confirm = ''; delBtn.textContent = '🗑️'; }

    if (taskId) {
        const task = _tasksAll.find(t => t.id === taskId);
        if (task) {
            setVal('task-modal-title',    task.title       || '');
            setVal('task-modal-desc',     task.description || '');
            setVal('task-modal-notes',    task.notes       || '');
            setVal('task-modal-status',   task.status      || 'todo');
            setVal('task-modal-priority', task.priority    || 'medium');
            setVal('task-modal-due',      task.due_date ? task.due_date.substring(0, 10) : '');
            setVal('task-modal-dept',     task.department_id || '');
            setVal('task-modal-assignee', task.assignee_id   || '');
            setVal('task-modal-recurrence', task.recurrence || '');
            setText('task-modal-created', task.created_at
                ? new Date(task.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—');

            if (task.source === 'public_form' && srcBadge) {
                srcBadge.style.display = '';
                srcBadge.innerHTML = `<span style="font-size:.72rem;font-weight:700;padding:3px 12px;border-radius:20px;background:rgba(255,215,0,.1);color:#FFD700;border:1px solid rgba(255,215,0,.25);">📥 Formulário Público${task.requester_name ? ' · ' + task.requester_name : ''}</span>`;
            }

            renderTaskAttachments(task.attachments || []);
            renderSubtasks(taskId, task.subtasks || []);
            renderTaskTags(taskId, task.tags || []);
            loadTaskComments(taskId);
            loadTaskActivity(taskId);
        }
    } else {
        // New task — reset new-feature fields
        const setVal2 = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal2('task-modal-recurrence', '');
        renderSubtasks(null, []);
        renderTaskTags(null, []);
        const actEl = document.getElementById('task-modal-activity');
        if (actEl) actEl.innerHTML = '';
    }

    const overlay = document.getElementById('task-modal-overlay');
    const panel   = document.getElementById('task-modal-panel');
    if (overlay && panel) {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; }));
    }
};


window.closeTaskModal = function () {
    const overlay = document.getElementById('task-modal-overlay');
    const panel   = document.getElementById('task-modal-panel');
    if (panel) panel.style.transform = 'translateX(100%)';
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 360);
};

// ── Save ───────────────────────────────────────────────────────────
window.saveTaskModal = async function () {
    const sb   = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!sb || !wsId) return;

    const btn = document.getElementById('btn-save-task');
    if (btn) { btn.textContent = 'Salvando...'; btn.disabled = true; }

    const getVal = id => document.getElementById(id)?.value?.trim() || null;

    const prevTask    = _tasksAll.find(t => t.id === _currentTaskId);
    const prevAssignee = prevTask?.assignee_id || null;  // tasks_full view uses assignee_id
    const newAssignee  = document.getElementById('task-modal-assignee')?.value || null;


    const payload = {
        workspace_id: wsId,
        title:        getVal('task-modal-title') || 'Sem título',
        description:  getVal('task-modal-desc'),
        notes:        getVal('task-modal-notes'),
        status:       document.getElementById('task-modal-status')?.value   || 'todo',
        priority:     document.getElementById('task-modal-priority')?.value || 'medium',
        due_date:     document.getElementById('task-modal-due')?.value      || null,
        department_id:document.getElementById('task-modal-dept')?.value     || null,
        assigned_to:  newAssignee || null,
        recurrence:   document.getElementById('task-modal-recurrence')?.value || null,
    };


    try {
        let savedId = _currentTaskId;
        let error;
        if (_currentTaskId) {
            ({ error } = await sb.from('tasks').update(payload).eq('id', _currentTaskId));
        } else {
            const { data: newTask, error: err } = await sb.from('tasks').insert({
                ...payload,
                created_by: window._currentUser?.id || null,
            }).select().single();
            error = err;
            if (!error && newTask) { _currentTaskId = newTask.id; savedId = newTask.id; }
        }
        if (error) throw error;

        // Notify newly assigned user
        if (savedId && newAssignee && newAssignee !== prevAssignee) {
            const me = window._currentUser;
            await sb.from('task_notifications').insert({
                user_id:    newAssignee,
                workspace_id: wsId,
                task_id:    savedId,
                type:       'assigned',
                content:    `${me?.name || 'Alguém'} atribuiu a tarefa "${payload.title}" a você.`,
                created_by: me?.id || null,
            });
        }

        if (typeof hubToast !== 'undefined') hubToast('Tarefa salva ✅', 'success');

        // Trigger recurrence cloning if task just became done
        if (payload.status === 'done' && prevTask?.status !== 'done' && payload.recurrence) {
            await handleRecurrenceOnDone({ ...prevTask, ...payload, assignee_id: newAssignee });
        }

        closeTaskModal();
        await loadTaskManager();
    } catch (e) {
        if (typeof hubToast !== 'undefined') hubToast('Erro: ' + e.message, 'error');
    } finally {
        if (btn) { btn.textContent = '💾 Salvar Tarefa'; btn.disabled = false; }
    }
};

// ── Delete ─────────────────────────────────────────────────────────
window.deleteTaskModal = async function () {
    if (!_currentTaskId) return;
    const sb   = window.supabaseClient;
    const task = _tasksAll.find(t => t.id === _currentTaskId);
    const btn  = document.getElementById('btn-delete-task');

    if (btn && btn.dataset.confirm !== '1') {
        btn.dataset.confirm  = '1';
        btn.textContent      = '⚠️ Confirmar exclusão';
        btn.style.background = 'rgba(239,68,68,.2)';
        btn.style.color      = '#EF4444';
        setTimeout(() => {
            if (btn.dataset.confirm === '1') {
                btn.dataset.confirm  = '';
                btn.textContent      = '🗑️';
                btn.style.background = 'rgba(239,68,68,.06)';
                btn.style.color      = 'rgba(239,68,68,.7)';
            }
        }, 4000);
        return;
    }

    if (btn) btn.dataset.confirm = '';
    const { error } = await sb.from('tasks').delete().eq('id', _currentTaskId);
    if (error) {
        if (typeof hubToast !== 'undefined') hubToast('Erro: ' + error.message, 'error');
    } else {
        if (typeof hubToast !== 'undefined') hubToast(`"${task?.title || 'Tarefa'}" excluída 🗑️`, 'success');
        closeTaskModal();
        await loadTaskManager();
    }
};

// ── Comments ───────────────────────────────────────────────────────
async function loadTaskComments(taskId) {
    const sb  = window.supabaseClient;
    const el  = document.getElementById('task-modal-comments');
    if (!el || !sb) return;
    el.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:.8rem;padding:8px;">Carregando...</div>';

    const { data: comments } = await sb
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

    if (!comments || !comments.length) {
        el.innerHTML = '<div style="color:rgba(255,255,255,.2);font-size:.8rem;padding:12px;text-align:center;">Sem comentários ainda</div>';
        return;
    }

    el.innerHTML = comments.map(c => {
        const authorId = c.author_id; // correct column name
        const isMe   = authorId === window._currentUser?.id;
        const u      = _tasksUsers.find(x => x.id === authorId);
        const name   = u?.name || 'Usuário';
        const init   = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        const date   = new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const body   = (c.content || '').replace(/@(\w+)/g, '<span style="color:#FFD700;font-weight:700;">@$1</span>');
        return `<div style="display:flex;gap:10px;${isMe ? 'flex-direction:row-reverse;' : ''}">
            <div style="width:30px;height:30px;border-radius:50%;background:${isMe ? 'linear-gradient(135deg,#FFD700,#FFA000)' : 'rgba(255,255,255,.1)'};display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:900;color:${isMe ? '#000' : '#fff'};flex-shrink:0;">${init}</div>
            <div style="flex:1;${isMe ? 'text-align:right;' : ''}">
                <div style="font-size:.7rem;color:rgba(255,255,255,.35);margin-bottom:4px;">${name} · ${date}</div>
                <div style="display:inline-block;background:${isMe ? 'rgba(255,215,0,.1)' : 'rgba(255,255,255,.06)'};border-radius:12px;padding:8px 13px;font-size:.83rem;text-align:left;max-width:90%;border:1px solid ${isMe ? 'rgba(255,215,0,.15)' : 'rgba(255,255,255,.06)'}">${body}</div>
            </div>
        </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
}

window.submitTaskComment = async function () {
    const sb      = window.supabaseClient;
    const taskId  = _currentTaskId;
    const input   = document.getElementById('task-comment-input');
    const content = input?.value?.trim();
    if (!sb || !taskId || !content) return;

    input.value = '';
    const { error } = await sb.from('task_comments').insert({
        task_id:      taskId,
        author_id:    window._currentUser?.id,  // correct column
        workspace_id: window.currentWorkspaceId,
        content,
    });
    if (error) {
        if (typeof hubToast !== 'undefined') hubToast('Erro: ' + error.message, 'error');
        if (input) input.value = content;
    } else {
        await loadTaskComments(taskId);
    }
};

// @mention autocomplete
document.addEventListener('input', function (e) {
    if (e.target?.id !== 'task-comment-input') return;
    const val    = e.target.value;
    const atIdx  = val.lastIndexOf('@');
    if (atIdx < 0) { hideMentionSuggestions(); return; }
    const query  = val.slice(atIdx + 1).toLowerCase();
    if (query.includes(' ') || query.length > 20) { hideMentionSuggestions(); return; }
    const matches = _tasksUsers.filter(u => (u.name || u.email).toLowerCase().includes(query));
    if (!matches.length) { hideMentionSuggestions(); return; }

    const box = document.getElementById('task-mention-suggestions');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = matches.slice(0, 5).map(u =>
        `<div style="padding:6px 10px;border-radius:8px;cursor:pointer;font-size:.8rem;transition:background .15s;"
              onmouseover="this.style.background='rgba(255,215,0,.1)'"
              onmouseout="this.style.background='transparent'"
              onclick="insertMention('${(u.name || u.email).replace(/'/g, '\\\'')}')">${u.name || u.email}</div>`
    ).join('');
});

window.insertMention = function (name) {
    const input  = document.getElementById('task-comment-input');
    if (!input) return;
    const val    = input.value;
    const atIdx  = val.lastIndexOf('@');
    input.value  = val.slice(0, atIdx) + '@' + name + ' ';
    hideMentionSuggestions();
    input.focus();
};
function hideMentionSuggestions() {
    const b = document.getElementById('task-mention-suggestions');
    if (b) b.style.display = 'none';
}

// ── File Uploads ───────────────────────────────────────────────────
window.uploadTaskFiles = async function (input) {
    const sb     = window.supabaseClient;
    const taskId = _currentTaskId;
    const files  = Array.from(input.files || []);
    if (!files.length || !sb) return;

    const statusEl = document.getElementById('task-modal-upload-status');
    if (statusEl) statusEl.textContent = `Enviando ${files.length} arquivo(s)...`;

    const uploaded = [];
    for (const file of files) {
        const ext  = file.name.split('.').pop();
        const path = `${window.currentWorkspaceId}/${taskId || 'new'}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await sb.storage.from('task-attachments').upload(path, file, { cacheControl: '3600', upsert: false });
        if (error) { if (typeof hubToast !== 'undefined') hubToast('Upload error: ' + error.message, 'error'); continue; }
        const { data: urlData } = sb.storage.from('task-attachments').getPublicUrl(path);
        uploaded.push(urlData.publicUrl);
    }

    if (uploaded.length && taskId) {
        const task     = _tasksAll.find(t => t.id === taskId);
        const updated  = [...(task?.attachments || []), ...uploaded];
        await sb.from('tasks').update({ attachments: updated }).eq('id', taskId);
        if (task) task.attachments = updated;
        renderTaskAttachments(updated);
    }

    if (statusEl) statusEl.textContent = uploaded.length ? `✅ ${uploaded.length} enviado(s)!` : '';
    input.value = '';
};

function renderTaskAttachments(urls) {
    const el = document.getElementById('task-modal-attachments-preview');
    if (!el) return;
    if (!urls || !urls.length) { el.innerHTML = ''; return; }
    el.innerHTML = urls.map(url => {
        const isImg = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
        if (isImg) return `<a href="${url}" target="_blank" style="display:block;width:72px;height:72px;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.1);flex-shrink:0;"><img src="${url}" style="width:100%;height:100%;object-fit:cover;" alt="Anexo"></a>`;
        const name = decodeURIComponent(url.split('/').pop()).substring(0, 20);
        return `<a href="${url}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:.75rem;color:rgba(255,255,255,.6);text-decoration:none;transition:all .2s;" onmouseover="this.style.borderColor='rgba(255,215,0,.3)'" onmouseout="this.style.borderColor='rgba(255,255,255,.1)'">📎 ${name}…</a>`;
    }).join('');
}

// ── Notifications ──────────────────────────────────────────────────
window.openTaskNotifications = async function () {
    const sb     = window.supabaseClient;
    const userId = window._currentUser?.id;
    if (!sb || !userId) return;

    const overlay = document.getElementById('tasks-notif-overlay');
    const panel   = document.getElementById('tasks-notif-panel');
    if (overlay && panel) {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; }));
    }

    const list = document.getElementById('tasks-notif-list');
    if (list) list.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:.82rem;">Carregando...</div>';

    const { data: notifs } = await sb
        .from('task_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(40);

    if (!list) return;
    if (!notifs || !notifs.length) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,.2);">Nenhuma notificação</div>';
        return;
    }

    const typeLabel = {
        assigned:       '📌 Te atribuíram uma tarefa',
        mentioned:      '💬 Você foi @mencionado',
        status_changed: '♻️ Status da tarefa alterado',
        commented:      '💬 Novo comentário',
    };

    list.innerHTML = notifs.map(n => {
        const task    = _tasksAll.find(t => t.id === n.task_id);
        const title   = task?.title || 'Tarefa';
        const dateStr = new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const isRead  = !!n.read_at;
        const alphaBg = isRead ? '.02' : '.06';
        const alphaBd = isRead ? '.06' : '.12';
        return `<div onclick="handleNotifClick('${n.id}','${n.task_id}')"
                     style="padding:12px 14px;border-radius:12px;cursor:pointer;border:1px solid rgba(255,255,255,${alphaBd});background:rgba(255,255,255,${alphaBg});transition:all .2s;"
                     onmouseover="this.style.background='rgba(255,255,255,.08)'"
                     onmouseout="this.style.background='rgba(255,255,255,${alphaBg})'">
            <div style="display:flex;align-items:flex-start;gap:10px;">
                ${!isRead ? '<div style="width:7px;height:7px;border-radius:50%;background:#818CF8;flex-shrink:0;margin-top:5px;"></div>' : '<div style="width:7px;"></div>'}
                <div style="flex:1;">
                    <div style="font-size:.8rem;font-weight:600;margin-bottom:3px;">${typeLabel[n.type] || '🔔 Notificação'}</div>
                    <div style="font-size:.75rem;color:rgba(255,255,255,.5);">"${title}"</div>
                    <div style="font-size:.7rem;color:rgba(255,255,255,.3);margin-top:4px;">${dateStr}</div>
                </div>
            </div>
        </div>`;
    }).join('');
};

window.closeTaskNotifications = function () {
    const overlay = document.getElementById('tasks-notif-overlay');
    const panel   = document.getElementById('tasks-notif-panel');
    if (panel) panel.style.transform = 'translateX(100%)';
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 350);
};

window.handleNotifClick = async function (notifId, taskId) {
    const sb = window.supabaseClient;
    // read_at is the correct column (not 'read')
    if (sb && notifId) await sb.from('task_notifications').update({ read_at: new Date().toISOString() }).eq('id', notifId);
    closeTaskNotifications();
    if (taskId) openTaskModal(taskId);
};

window.markAllNotifsRead = async function () {
    const sb     = window.supabaseClient;
    const userId = window._currentUser?.id;
    if (!sb || !userId) return;
    await sb.from('task_notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
    const badge = document.getElementById('tasks-notif-badge');
    if (badge) badge.style.display = 'none';
    openTaskNotifications();
};

// ── Public Requests ────────────────────────────────────────────────
window.openPublicRequestsDrawer = async function () {
    const overlay = document.getElementById('public-requests-overlay');
    const panel   = document.getElementById('public-requests-panel');
    if (overlay && panel) {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; }));
    }
    await loadPublicRequests();
};

window.closePublicRequestsDrawer = function () {
    const overlay = document.getElementById('public-requests-overlay');
    const panel   = document.getElementById('public-requests-panel');
    if (panel) panel.style.transform = 'translateX(100%)';
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 360);
};

async function loadPublicRequests() {
    const sb   = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!sb || !wsId) return;

    const listEl = document.getElementById('public-requests-list');
    if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,.2);">Carregando...</div>';

    const { data } = await sb
        .from('task_public_requests')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

    _publicReqsAll = data || [];
    filterPublicRequests();
}

window.filterPublicRequests = function () {
    const s    = document.getElementById('requests-filter-status')?.value || '';
    const list = s ? _publicReqsAll.filter(r => r.status === s) : _publicReqsAll;
    renderPublicRequests(list);
};

function renderPublicRequests(reqs) {
    const el = document.getElementById('public-requests-list');
    if (!el) return;
    if (!reqs || !reqs.length) {
        el.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,.2);font-size:.85rem;">Nenhuma demanda encontrada</div>';
        return;
    }
    const sc = {
        pending:   { bg: 'rgba(251,191,36,.1)',  color: '#FBBF24', label: '⏳ Pendente' },
        converted: { bg: 'rgba(52,211,153,.1)',   color: '#34D399', label: '✅ Convertida' },
        rejected:  { bg: 'rgba(239,68,68,.1)',    color: '#EF4444', label: '❌ Rejeitada' },
    };
    el.innerHTML = reqs.map(r => {
        const s    = sc[r.status] || sc.pending;
        const date = new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;transition:border-color .2s;"
                     onmouseover="this.style.borderColor='rgba(255,215,0,.2)'"
                     onmouseout="this.style.borderColor='rgba(255,255,255,.08)'">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;">
                <div>
                    <div style="font-weight:700;font-size:.9rem;margin-bottom:2px;">${r.title || 'Sem título'}</div>
                    <div style="font-size:.75rem;color:rgba(255,255,255,.4);">👤 ${r.requester_name || 'Anônimo'}${r.requester_phone ? ' · ' + r.requester_phone : ''} · ${date}</div>
                </div>
                <span style="font-size:.7rem;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;background:${s.bg};color:${s.color};">${s.label}</span>
            </div>
            ${r.description ? `<div style="font-size:.8rem;color:rgba(255,255,255,.5);margin-bottom:12px;line-height:1.5;">${r.description}</div>` : ''}
            ${r.status === 'pending' ? `
            <div style="display:flex;gap:8px;">
                <button onclick="convertRequestToTask('${r.id}')" style="flex:1;padding:8px;border-radius:10px;border:1px solid rgba(52,211,153,.25);background:rgba(52,211,153,.1);color:#34D399;font-weight:700;font-size:.78rem;cursor:pointer;transition:all .2s;" onmouseover="this.style.background='rgba(52,211,153,.2)'" onmouseout="this.style.background='rgba(52,211,153,.1)'">✅ Converter em Tarefa</button>
                <button onclick="rejectPublicRequest('${r.id}')" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(239,68,68,.2);background:rgba(239,68,68,.06);color:rgba(239,68,68,.7);font-weight:700;font-size:.78rem;cursor:pointer;transition:all .2s;" onmouseover="this.style.background='rgba(239,68,68,.15)'" onmouseout="this.style.background='rgba(239,68,68,.06)'">❌</button>
            </div>` : ''}
        </div>`;
    }).join('');
}

window.convertRequestToTask = async function (rid) {
    const sb   = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!sb || !wsId) return;
    const req = _publicReqsAll.find(r => r.id === rid);
    if (!req) return;

    const { data: newTask, error } = await sb.from('tasks').insert({
        workspace_id:    wsId,
        title:           req.title,
        description:     req.description || null,
        status:          'todo',
        priority:        'medium',
        source:          'public_form',
        requester_name:  req.requester_name  || null,
        requester_phone: req.requester_phone || null,
        created_by:      window._currentUser?.id || null,
    }).select().single();

    if (error) { if (typeof hubToast !== 'undefined') hubToast('Erro: ' + error.message, 'error'); return; }
    await sb.from('task_public_requests').update({ status: 'converted', converted_task_id: newTask.id }).eq('id', rid);
    if (typeof hubToast !== 'undefined') hubToast('Demanda convertida em tarefa ✅', 'success');
    await loadPublicRequests();
    await loadTaskManager();
};

window.rejectPublicRequest = async function (rid) {
    const sb = window.supabaseClient;
    if (!sb) return;
    await sb.from('task_public_requests').update({ status: 'rejected' }).eq('id', rid);
    if (typeof hubToast !== 'undefined') hubToast('Demanda rejeitada', 'info');
    await loadPublicRequests();
};

window.copyPublicFormLink = function () {
    const ws   = (window._allWorkspaces || []).find(w => w.id === window.currentWorkspaceId)
              || { slug: window._currentWorkspaceSlug || '' };
    const slug = ws?.slug || '';
    const url  = window.location.origin + (slug ? '/' + slug + '/demanda.html' : '/demanda.html') + (slug ? '' : `?ws=${slug}`);
    const finalUrl = slug
        ? `${window.location.origin}/${slug}/demanda.html`
        : `${window.location.origin}/demanda.html`;

    // Show in settings panel if open
    const linkEl = document.getElementById('settings-form-link');
    if (linkEl) linkEl.textContent = finalUrl;

    navigator.clipboard.writeText(finalUrl).then(() => {
        if (typeof hubToast !== 'undefined') hubToast('Link copiado! 🔗', 'success');
    });
};

// ── Task Settings Panel ───────────────────────────────────────────
window.openTaskSettings = function () {
    const overlay = document.getElementById('task-settings-overlay');
    const panel   = document.getElementById('task-settings-panel');
    if (overlay && panel) {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; }));
    }
    renderSettingsDeptList();
    copyPublicFormLink(); // populate form link field
    // Load email setting from workspace knowledge_base
    const wb = window._currentWorkspaceData?.knowledge_base || {};
    const toggle = document.getElementById('settings-email-notif');
    if (toggle) toggle.checked = wb.task_email_notif !== false;
    updateEmailToggleUI();
};

window.closeTaskSettings = function () {
    const overlay = document.getElementById('task-settings-overlay');
    const panel   = document.getElementById('task-settings-panel');
    if (panel) panel.style.transform = 'translateX(100%)';
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 360);
};

function renderSettingsDeptList() {
    const el = document.getElementById('settings-dept-list');
    if (!el) return;
    el.innerHTML = _tasksDepts.length
        ? _tasksDepts.map(d => `
            <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;">
                <span style="font-size:1.1rem;">${d.icon || '🏷️'}</span>
                <span style="flex:1;font-weight:600;font-size:.85rem;">${d.name}</span>
                <div style="width:12px;height:12px;border-radius:50%;background:${d.color || '#FFD700'};flex-shrink:0;"></div>
                <button onclick="deleteDepartment('${d.id}','${d.name}')"
                    style="width:24px;height:24px;border-radius:8px;border:none;background:rgba(239,68,68,.08);color:rgba(239,68,68,.6);cursor:pointer;font-size:.75rem;transition:all .2s;"
                    onmouseover="this.style.background='rgba(239,68,68,.2)';this.style.color='#EF4444'"
                    onmouseout="this.style.background='rgba(239,68,68,.08)';this.style.color='rgba(239,68,68,.6)'">✕</button>
            </div>`).join('')
        : '<div style="color:rgba(255,255,255,.3);font-size:.82rem;text-align:center;padding:12px;">Nenhum departamento ainda</div>';
}

window.deleteDepartment = async function (deptId, name) {
    const sb = window.supabaseClient;
    if (!sb) return;
    const { error } = await sb.from('task_departments').delete().eq('id', deptId);
    if (error) { if (typeof hubToast !== 'undefined') hubToast('Erro: ' + error.message, 'error'); return; }
    if (typeof hubToast !== 'undefined') hubToast(`"${name}" removido`, 'success');
    await loadTaskManager();
    renderSettingsDeptList();
};

window.saveTaskEmailSetting = async function () {
    const sb   = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!sb || !wsId) return;
    const toggle  = document.getElementById('settings-email-notif');
    const checked = toggle?.checked || false;

    // Merge into knowledge_base JSONB
    const ws = window._currentWorkspaceData || {};
    const kb = { ...(ws.knowledge_base || {}), task_email_notif: checked };
    await sb.from('workspaces').update({ knowledge_base: kb }).eq('id', wsId);
    updateEmailToggleUI();
    if (typeof hubToast !== 'undefined') hubToast(checked ? 'Avisos ativados ✅' : 'Avisos desativados', 'success');
};

function updateEmailToggleUI() {
    const toggle = document.getElementById('settings-email-notif');
    const track  = document.getElementById('email-toggle-track');
    const thumb  = document.getElementById('email-toggle-thumb');
    if (!toggle || !track || !thumb) return;
    const on = toggle.checked;
    track.style.background = on ? 'linear-gradient(135deg,#FFD700,#FFA000)' : 'rgba(255,255,255,.1)';
    thumb.style.transform  = on ? 'translateX(20px)' : 'translateX(0)';
}

// ── Department Manager (simplified, now inside settings) ───────────
window.openDeptManager = openTaskSettings;  // alias for any legacy calls
window.closeDeptManager = closeTaskSettings;
window.addNewDepartment = async function () {
    const sb   = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!sb || !wsId) return;
    const icon  = document.getElementById('new-dept-icon')?.value?.trim()  || '🏷️';
    const name  = document.getElementById('new-dept-name')?.value?.trim();
    const color = document.getElementById('new-dept-color')?.value || '#FFD700';
    if (!name) { if (typeof hubToast !== 'undefined') hubToast('Informe o nome', 'error'); return; }
    const { error } = await sb.from('task_departments').insert({ workspace_id: wsId, name, icon, color });
    if (error) { if (typeof hubToast !== 'undefined') hubToast('Erro: ' + error.message, 'error'); return; }
    const nameEl = document.getElementById('new-dept-name');
    if (nameEl) nameEl.value = '';
    if (typeof hubToast !== 'undefined') hubToast(`Departamento "${name}" criado ✅`, 'success');
    await loadTaskManager();
    renderSettingsDeptList();
};

// ═══════════════════════════════════════════════════════════════════
// SUBTAREFAS
// ═══════════════════════════════════════════════════════════════════

function renderSubtasks(taskId, subtasks) {
    const el = document.getElementById('task-modal-subtasks');
    if (!el) return;
    const total = subtasks.length;
    const done  = subtasks.filter(s => s.done).length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    el.innerHTML = `
        ${total > 0 ? `
        <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                <span style="font-size:.72rem;color:rgba(255,255,255,.4);">${done}/${total} concluídas</span>
                <span style="font-size:.72rem;color:rgba(255,255,255,.4);">${pct}%</span>
            </div>
            <div style="height:4px;background:rgba(255,255,255,.07);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#34D399,#059669);border-radius:4px;transition:width .4s;"></div>
            </div>
        </div>` : ''}
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
            ${subtasks.map(s => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;">
                <input type="checkbox" ${s.done ? 'checked' : ''} onchange="toggleSubtask('${taskId}','${s.id}',this.checked)" style="width:16px;height:16px;accent-color:#FFD700;cursor:pointer;flex-shrink:0;">
                <span style="flex:1;font-size:.83rem;color:rgba(255,255,255,${s.done ? '.3' : '.8'});text-decoration:${s.done ? 'line-through' : 'none'};">${s.title}</span>
                <button onclick="deleteSubtask('${taskId}','${s.id}')" style="width:22px;height:22px;border-radius:6px;border:none;background:rgba(255,68,68,.1);color:#F87171;cursor:pointer;font-size:.7rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:8px;">
            <input id="new-subtask-input" type="text" placeholder="Nova subtarefa..."
                style="flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 12px;color:#fff;font-size:.83rem;outline:none;font-family:inherit;"
                onkeydown="if(event.key==='Enter'){event.preventDefault();addSubtask('${taskId}');}">
            <button onclick="addSubtask('${taskId}')" style="padding:9px 14px;border:none;border-radius:10px;background:linear-gradient(135deg,#FFD700,#FFA000);color:#000;font-weight:800;font-size:.8rem;cursor:pointer;white-space:nowrap;">+ Add</button>
        </div>`;
}

window.toggleSubtask = async function(taskId, subId, checked) {
    if (!taskId) return;
    const task = _tasksAll.find(t => t.id === taskId);
    if (!task) return;
    const subs = (task.subtasks || []).map(s => s.id === subId ? { ...s, done: checked } : s);
    task.subtasks = subs;
    await window.supabaseClient.from('tasks').update({ subtasks: subs }).eq('id', taskId);
    renderSubtasks(taskId, subs);
    await logActivity(taskId, checked ? 'subtask_done' : 'subtask_undone', null, subs.find(s => s.id === subId)?.title);
};

window.addSubtask = async function(taskId) {
    const input = document.getElementById('new-subtask-input');
    const title = input?.value?.trim();
    if (!title) return;
    const task = _tasksAll.find(t => t.id === taskId);
    const subs = [...(task?.subtasks || []), { id: crypto.randomUUID(), title, done: false, created_at: new Date().toISOString() }];
    if (task) task.subtasks = subs;
    if (taskId) {
        await window.supabaseClient.from('tasks').update({ subtasks: subs }).eq('id', taskId);
        await logActivity(taskId, 'subtask_added', null, title);
    }
    if (input) input.value = '';
    renderSubtasks(taskId, subs);
};

window.deleteSubtask = async function(taskId, subId) {
    const task = _tasksAll.find(t => t.id === taskId);
    if (!task) return;
    const sub  = task.subtasks?.find(s => s.id === subId);
    const subs = (task.subtasks || []).filter(s => s.id !== subId);
    task.subtasks = subs;
    await window.supabaseClient.from('tasks').update({ subtasks: subs }).eq('id', taskId);
    await logActivity(taskId, 'subtask_removed', sub?.title, null);
    renderSubtasks(taskId, subs);
};

// ═══════════════════════════════════════════════════════════════════
// ETIQUETAS / TAGS
// ═══════════════════════════════════════════════════════════════════

function renderTaskTags(taskId, tags) {
    const el = document.getElementById('task-modal-tags');
    if (!el) return;
    const suggestions = _workspaceTags.filter(t => !tags.includes(t.name));
    el.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
            ${tags.map(tag => {
                const wt = _workspaceTags.find(x => x.name === tag);
                const c  = wt?.color || '#94A3B8';
                return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:20px;background:${c}20;color:${c};border:1px solid ${c}40;cursor:pointer;" onclick="removeTag('${taskId}','${tag}')">${tag} <span style="opacity:.6;">✕</span></span>`;
            }).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
            <input id="new-tag-input" type="text" placeholder="Nova etiqueta..." list="tag-suggestions"
                style="flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 12px;color:#fff;font-size:.8rem;outline:none;font-family:inherit;"
                onkeydown="if(event.key==='Enter'){event.preventDefault();addTagToTask('${taskId}');}">
            <datalist id="tag-suggestions">${suggestions.map(t => `<option value="${t.name}">`).join('')}</datalist>
            <input id="new-tag-color" type="color" value="#FFD700" style="width:38px;height:36px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);cursor:pointer;padding:3px;">
            <button onclick="addTagToTask('${taskId}')" style="padding:8px 12px;border:none;border-radius:10px;background:linear-gradient(135deg,#FFD700,#FFA000);color:#000;font-weight:800;font-size:.78rem;cursor:pointer;">+ Tag</button>
        </div>
        ${suggestions.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:5px;">${suggestions.slice(0,6).map(t => `<span style="font-size:.68rem;font-weight:600;padding:2px 8px;border-radius:20px;background:${t.color}18;color:${t.color};border:1px solid ${t.color}30;cursor:pointer;" onclick="addTagToTaskDirect('${taskId}','${t.name}')">+ ${t.name}</span>`).join('')}</div>` : ''}`;
}

window.addTagToTask = async function(taskId) {
    const input = document.getElementById('new-tag-input');
    const color = document.getElementById('new-tag-color')?.value || '#FFD700';
    const tag   = input?.value?.trim();
    if (!tag) return;
    const sb = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!_workspaceTags.find(t => t.name === tag)) {
        const { data: newTag } = await sb.from('task_tags').insert({ workspace_id: wsId, name: tag, color }).select().single();
        if (newTag) _workspaceTags.push(newTag);
    }
    const task = _tasksAll.find(t => t.id === taskId);
    const tags = [...new Set([...(task?.tags || []), tag])];
    if (task) task.tags = tags;
    if (taskId) { await sb.from('tasks').update({ tags }).eq('id', taskId); await logActivity(taskId, 'tag_added', null, tag); }
    if (input) input.value = '';
    renderTaskTags(taskId, tags);
};

window.addTagToTaskDirect = async function(taskId, tag) {
    const task = _tasksAll.find(t => t.id === taskId);
    const tags = [...new Set([...(task?.tags || []), tag])];
    if (task) task.tags = tags;
    if (taskId) { await window.supabaseClient.from('tasks').update({ tags }).eq('id', taskId); await logActivity(taskId, 'tag_added', null, tag); }
    renderTaskTags(taskId, tags);
};

window.removeTag = async function(taskId, tag) {
    const task = _tasksAll.find(t => t.id === taskId);
    const tags = (task?.tags || []).filter(t => t !== tag);
    if (task) task.tags = tags;
    await window.supabaseClient.from('tasks').update({ tags }).eq('id', taskId);
    await logActivity(taskId, 'tag_removed', tag, null);
    renderTaskTags(taskId, tags);
};

// ═══════════════════════════════════════════════════════════════════
// RECORRÊNCIA
// ═══════════════════════════════════════════════════════════════════

async function handleRecurrenceOnDone(task) {
    if (!task?.recurrence || task.recurrence === 'none') return;
    const baseDate = task.due_date ? new Date(task.due_date) : new Date();
    const next = new Date(baseDate);
    switch (task.recurrence) {
        case 'daily':   next.setDate(next.getDate() + 1); break;
        case 'weekly':  next.setDate(next.getDate() + 7); break;
        case 'monthly': next.setMonth(next.getMonth() + 1); break;
        case 'yearly':  next.setFullYear(next.getFullYear() + 1); break;
    }
    await window.supabaseClient.from('tasks').insert({
        workspace_id: task.workspace_id,
        title: task.title,
        description: task.description,
        department_id: task.department_id,
        assigned_to: task.assignee_id,
        priority: task.priority,
        status: 'todo',
        recurrence: task.recurrence,
        due_date: next.toISOString().split('T')[0],
        created_by: window._currentUser?.id || null,
        source: task.source,
    });
    const labels = { daily: 'amanhã', weekly: 'em 7 dias', monthly: 'no próximo mês', yearly: 'no próximo ano' };
    if (typeof hubToast !== 'undefined') hubToast(`🔄 Próxima ocorrência criada para ${labels[task.recurrence]}`, 'success');
}

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOG / ATIVIDADE
// ═══════════════════════════════════════════════════════════════════

async function logActivity(taskId, action, oldValue, newValue) {
    const sb = window.supabaseClient;
    const wsId = window.currentWorkspaceId;
    if (!sb || !wsId || !taskId) return;
    await sb.from('task_activity').insert({ task_id: taskId, workspace_id: wsId, user_id: window._currentUser?.id || null, action, old_value: oldValue || null, new_value: newValue || null });
}

async function loadTaskActivity(taskId) {
    const el = document.getElementById('task-modal-activity');
    if (!el) return;
    el.innerHTML = '<div style="padding:12px 0;color:rgba(255,255,255,.25);font-size:.78rem;">Carregando...</div>';
    const { data } = await window.supabaseClient.from('task_activity').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(30);
    if (!data?.length) { el.innerHTML = '<div style="padding:12px 0;color:rgba(255,255,255,.2);font-size:.78rem;">Nenhuma atividade ainda.</div>'; return; }
    const icons = { created:'✨', status_changed:'📌', priority_changed:'🔺', assigned:'👤', subtask_added:'➕', subtask_removed:'✂️', subtask_done:'✅', subtask_undone:'↩️', tag_added:'🏷️', tag_removed:'🗑️' };
    const statusLabel = s => TASK_STATUS[s]?.label || s || '—';
    const prioLabel   = p => TASK_PRIORITY[p]?.label || p || '—';
    function describe(item) {
        switch (item.action) {
            case 'created':          return `Tarefa criada: <b>${item.new_value}</b>`;
            case 'status_changed':   return `Status: <b>${statusLabel(item.old_value)}</b> → <b>${statusLabel(item.new_value)}</b>`;
            case 'priority_changed': return `Prioridade: <b>${prioLabel(item.old_value)}</b> → <b>${prioLabel(item.new_value)}</b>`;
            case 'assigned':         return `Responsável atualizado`;
            case 'subtask_added':    return `Subtarefa adicionada: <b>${item.new_value}</b>`;
            case 'subtask_removed':  return `Subtarefa removida: <b>${item.old_value}</b>`;
            case 'subtask_done':     return `Subtarefa concluída: <b>${item.new_value}</b>`;
            case 'subtask_undone':   return `Subtarefa reaberta: <b>${item.new_value}</b>`;
            case 'tag_added':        return `Tag adicionada: <b>${item.new_value}</b>`;
            case 'tag_removed':      return `Tag removida: <b>${item.old_value}</b>`;
            default:                 return item.action;
        }
    }
    el.innerHTML = data.map(item => {
        const dateStr = new Date(item.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        return `<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04);">
            <div style="width:24px;height:24px;border-radius:8px;background:rgba(255,255,255,.05);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.75rem;">${icons[item.action] || '•'}</div>
            <div style="flex:1;"><div style="font-size:.78rem;color:rgba(255,255,255,.7);">${describe(item)}</div><div style="font-size:.68rem;color:rgba(255,255,255,.25);margin-top:2px;">${dateStr}</div></div>
        </div>`;
    }).join('');
}
