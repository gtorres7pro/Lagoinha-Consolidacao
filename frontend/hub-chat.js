/* ============================================================
   hub-chat.js — Chat ao Vivo | Zelo Pro
   WhatsApp-style inbox for AI + human conversations
   ============================================================ */

const SUPABASE_URL = 'https://uyseheucqikgcorrygzc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';

const PRIORITY_LABELS = {
  batismo: { label: '🕊 Batismo', color: '#60a5fa' },
  escalation: { label: '🚨 Pastoral', color: '#f87171' },
  wecare: { label: '🤝 WeCare', color: '#34d399' },
  voluntariado: { label: '⭐ Voluntário', color: '#fbbf24' },
  none: { label: '', color: 'transparent' }
};

// State
let chatState = {
  leads: [],
  selectedLeadId: null,
  messages: [],
  realtimeChannel: null,
  filter: 'all',
  sidebarCollapsed: false,
  kpis: {},
  lockTimers: {},
  workspaceId: null,
  currentUser: null,
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function initChatAoVivo() {
  let container = document.getElementById('view-chat-ao-vivo');

  // If the container doesn't exist in the DOM (cached old HTML), create it dynamically
  if (!container) {
    console.log('[Chat] view-chat-ao-vivo not found — creating dynamically');
    container = document.createElement('div');
    container.id = 'view-chat-ao-vivo';
    container.className = 'view-section';
    container.style.cssText = 'padding:0; height:100%; overflow:hidden; display:none;';
    // Append to the main content area
    const mainContent = document.querySelector('.main-content') || document.querySelector('main') || document.querySelector('#main') || document.body;
    mainContent.appendChild(container);
  }

  // Get current user & workspace
  // Use the global supabaseClient set by hub-dashboard.js
  const _sb = window.supabaseClient || window._sb;
  if (!_sb) { console.error('[Chat] Supabase not initialized (supabaseClient not found)'); return; }
  // Assign to window._sb for backward compat with rest of file
  window._sb = _sb;
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) return;
  const { data: userData } = await _sb.from('users').select('id, name, workspace_id, role').eq('id', session.user.id).maybeSingle();
  if (!userData) return;

  chatState.currentUser = userData;
  // For master_admin, workspace_id may be null in users table — use the globally selected workspace
  chatState.workspaceId = userData.workspace_id || window.currentWorkspaceId || sessionStorage.getItem('ws_id');

  container.innerHTML = buildChatLayout();
  attachChatEvents();
  await loadKPIs();
  await loadLeads();
  setupRealtime();
  updateSidebarBadge();
}

// ─── LAYOUT ───────────────────────────────────────────────────────────────────
function buildChatLayout() {
  return `
  <div id="chat-root" class="chat-root">

    <!-- KPI BAR — Em Destaque primeiro (urgência), depois volume -->
    <div class="chat-kpi-bar" id="chat-kpi-bar">
      <div class="chat-kpi-card highlighted" id="kpi-highlighted">
        <span class="kpi-icon">🔴</span>
        <div><span class="kpi-value" id="kv-highlighted">—</span><span class="kpi-label">Em Destaque</span></div>
      </div>
      <div class="chat-kpi-card" id="kpi-leads-responded">
        <span class="kpi-icon">✅</span>
        <div><span class="kpi-value" id="kv-responded">—</span><span class="kpi-label">Responderam</span></div>
      </div>
      <div class="chat-kpi-card" id="kpi-ai-initiated">
        <span class="kpi-icon">⚡</span>
        <div><span class="kpi-value" id="kv-ai-initiated">—</span><span class="kpi-label">Iniciados pela IA</span></div>
      </div>
      <div class="chat-kpi-card" id="kpi-total-msgs">
        <span class="kpi-icon">💬</span>
        <div><span class="kpi-value" id="kv-total">—</span><span class="kpi-label">Total Mensagens</span></div>
      </div>
      <div class="chat-kpi-card" id="kpi-ai-msgs">
        <span class="kpi-icon">🤖</span>
        <div><span class="kpi-value" id="kv-ai">—</span><span class="kpi-label">Enviadas pela IA</span></div>
      </div>
      <div class="chat-kpi-card" id="kpi-human-msgs">
        <span class="kpi-icon">👤</span>
        <div><span class="kpi-value" id="kv-human">—</span><span class="kpi-label">Enviadas pela Equipe</span></div>
      </div>
    </div>

    <!-- MAIN PANEL -->
    <div class="chat-panel" id="chat-panel">

      <!-- LEFT: Leads List -->
      <div class="chat-list-panel" id="chat-list-panel">
        <div class="chat-list-header">
          <span style="font-weight:700;font-size:1rem;color:#fff;">Conversas</span>
          <button class="chat-collapse-btn" id="chat-collapse-btn" onclick="toggleChatSidebar()" title="Recolher">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        </div>

        <div class="chat-search-wrap">
          <input type="text" id="chat-search" placeholder="🔍 Buscar conversa..." oninput="filterLeadsList()" autocomplete="off" />
        </div>

        <div class="chat-filter-tabs">
          <button class="chat-tab active" data-filter="all" onclick="setChatFilter('all',this)">Todos</button>
          <button class="chat-tab" data-filter="highlighted" onclick="setChatFilter('highlighted',this)">🔴 Destaque</button>
          <button class="chat-tab" data-filter="responded" onclick="setChatFilter('responded',this)">✅ Responderam</button>
          <button class="chat-tab" data-filter="no-response" onclick="setChatFilter('no-response',this)">⏳ Sem resposta</button>
          <button class="chat-tab" data-filter="archived" onclick="setChatFilter('archived',this)">📦 Arquivados</button>
        </div>

        <div class="chat-leads-list" id="chat-leads-list">
          <div class="chat-list-loading">Carregando conversas...</div>
        </div>
      </div>

      <!-- RIGHT: Chat Window -->
      <div class="chat-window" id="chat-window">
        <div class="chat-empty-state" id="chat-empty-state">
          <div class="chat-empty-icon">💬</div>
          <h3>Selecione uma conversa</h3>
          <p>Escolha um lead à esquerda para ver as mensagens</p>
        </div>

        <div class="chat-active" id="chat-active" style="display:none; flex-direction:column; height:100%;">
          <!-- Chat Header -->
          <div class="chat-header" id="chat-header">
            <div class="chat-header-avatar" id="chat-header-avatar">J</div>
            <div class="chat-header-info">
              <div class="chat-header-name" id="chat-header-name">-</div>
              <div class="chat-header-sub" id="chat-header-sub">-</div>
            </div>
            <div class="chat-header-actions">
              <span class="chat-lock-badge" id="chat-lock-badge" style="display:none;">
                🔒 IA pausada <span id="chat-lock-countdown"></span>
              </span>
              <button class="chat-reactivate-btn" id="chat-reactivate-btn" style="display:none;" onclick="reactivateAI()">
                ⚡ Reativar IA
              </button>
              <button class="chat-archive-btn" id="chat-archive-btn" onclick="archiveCurrentLead()" title="Arquivar conversa">
                📦
              </button>
              <button class="chat-expand-btn" onclick="toggleChatSidebar()" id="chat-expand-btn" title="Expandir chat" style="display:none;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>

          <!-- Task Badge -->
          <div class="chat-task-banner" id="chat-task-banner" style="display:none;">
            <span>📋 Tarefa vinculada:</span>
            <a id="chat-task-link" href="#" onclick="goToLinkedTask(event)">Ver tarefa →</a>
          </div>

          <!-- Window warning: 24h closed — show template button -->
          <div class="chat-window-warning" id="chat-window-warning" style="display:none;">
            <span>⚠️ Janela de 24h encerrada.</span>
            <button class="chat-template-warn-btn" onclick="openTemplateModal()">
              📨 Enviar Template
            </button>
          </div>

          <!-- Messages -->
          <div class="chat-messages" id="chat-messages"></div>

          <!-- Bottom Bar -->
          <div class="chat-bottom-bar" id="chat-bottom-bar">
            <!-- Attach file (only within 24h window) -->
            <button class="chat-attach-btn" id="chat-attach-btn" onclick="document.getElementById('chat-file-input').click()" title="Enviar arquivo">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <input type="file" id="chat-file-input" style="display:none;" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onchange="handleChatFileAttach(event)">
            <!-- Template button (within window) -->
            <button class="chat-template-btn" id="chat-template-btn" onclick="openTemplateModal()" title="Enviar template">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
            </button>
            <textarea id="chat-input" placeholder="Digite uma mensagem..." rows="1" onkeydown="handleChatKeydown(event)" oninput="autoresizeTextarea(this)"></textarea>
            <button class="chat-send-btn" id="chat-send-btn" onclick="sendManualMessage()">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>

          <!-- Template Modal -->
          <div class="chat-template-overlay" id="chat-template-overlay" style="display:none;" onclick="if(event.target===this)closeTemplateModal()">
            <div class="chat-template-modal">
              <div class="chat-template-modal-header">
                <span>📨 Enviar Template WhatsApp</span>
                <button onclick="closeTemplateModal()">✕</button>
              </div>
              <div class="chat-template-modal-body">
                <p class="chat-template-lead-name" id="tpl-lead-name"></p>
                <div class="chat-template-list" id="chat-template-list"></div>
              </div>
              <div class="chat-template-modal-footer">
                <button class="chat-tpl-cancel" onclick="closeTemplateModal()">Cancelar</button>
                <button class="chat-tpl-send" id="chat-tpl-send-btn" onclick="sendSelectedTemplate()" disabled>Enviar Template ✓</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <style>
    /* ── ROOT ── */
    .chat-root { display:flex; flex-direction:column; height:calc(100vh - 80px); background:transparent; gap:0; }

    /* ── KPI BAR ── */
    .chat-kpi-bar {
      display:flex; gap:12px; padding:16px 20px 12px;
      overflow-x:auto; scrollbar-width:none; flex-shrink:0;
    }
    .chat-kpi-bar::-webkit-scrollbar { display:none; }
    .chat-kpi-card {
      display:flex; align-items:center; gap:12px; min-width:160px;
      background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07);
      border-radius:14px; padding:12px 16px; flex-shrink:0;
      transition:border-color .2s, background .2s;
    }
    .chat-kpi-card:hover { background:rgba(255,255,255,0.07); border-color:rgba(255,215,0,.25); }
    .chat-kpi-card.highlighted { border-color:rgba(248,113,113,.35); background:rgba(248,113,113,.06); }
    .kpi-icon { font-size:1.4rem; }
    .kpi-value { display:block; font-size:1.5rem; font-weight:800; color:#FFD700; line-height:1; }
    .kpi-label { display:block; font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:.5px; margin-top:2px; }

    /* ── MAIN PANEL ── */
    .chat-panel { display:flex; flex:1; overflow:hidden; gap:0; }

    /* ── LIST PANEL ── */
    .chat-list-panel {
      width:320px; min-width:280px; max-width:360px;
      display:flex; flex-direction:column;
      background:rgba(255,255,255,0.03); border-right:1px solid rgba(255,255,255,0.07);
      transition:width .28s cubic-bezier(.4,0,.2,1), min-width .28s;
      flex-shrink:0; overflow:hidden;
    }
    .chat-list-panel.collapsed { width:0; min-width:0; }
    .chat-list-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:16px 16px 8px; flex-shrink:0;
    }
    .chat-collapse-btn, .chat-expand-btn {
      background:rgba(255,255,255,.07); border:none; color:#aaa; cursor:pointer;
      border-radius:8px; padding:6px; display:flex; align-items:center; transition:all .15s;
    }
    .chat-collapse-btn:hover, .chat-expand-btn:hover { background:rgba(255,215,0,.15); color:#FFD700; }
    .chat-search-wrap { padding:0 12px 8px; flex-shrink:0; }
    .chat-search-wrap input {
      width:100%; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
      border-radius:10px; padding:8px 12px; color:#fff; font-size:.85rem; outline:none; box-sizing:border-box;
      transition:border-color .15s;
    }
    .chat-search-wrap input:focus { border-color:rgba(255,215,0,.4); }
    .chat-filter-tabs {
      display:flex; gap:4px; padding:0 12px 8px; overflow-x:auto; scrollbar-width:none; flex-shrink:0;
    }
    .chat-filter-tabs::-webkit-scrollbar { display:none; }
    .chat-tab {
      background:rgba(255,255,255,.06); border:none; color:#888; cursor:pointer;
      border-radius:8px; padding:5px 10px; font-size:.72rem; white-space:nowrap; transition:all .15s;
    }
    .chat-tab.active, .chat-tab:hover { background:rgba(255,215,0,.15); color:#FFD700; }
    .chat-leads-list { flex:1; overflow-y:auto; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.1) transparent; }
    .chat-list-loading { color:#666; text-align:center; padding:40px 20px; font-size:.85rem; }

    /* ── LEAD CARD ── */
    .chat-lead-card {
      display:flex; align-items:flex-start; gap:10px; padding:12px 14px; cursor:pointer;
      border-bottom:1px solid rgba(255,255,255,.04); transition:background .12s;
      position:relative;
    }
    .chat-lead-card:hover { background:rgba(255,255,255,.05); }
    .chat-lead-card.active { background:rgba(255,215,0,.08); border-left:3px solid #FFD700; }
    .chat-lead-card.highlighted-card { border-left:3px solid #f87171; }
    .lead-avatar {
      width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg,#FFD700,#f59e0b);
      display:flex; align-items:center; justify-content:center; font-weight:700; color:#111; font-size:.95rem; flex-shrink:0;
    }
    .lead-card-body { flex:1; min-width:0; }
    .lead-card-name { font-weight:600; font-size:.88rem; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .lead-card-preview { font-size:.75rem; color:#777; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
    .lead-card-time { font-size:.65rem; color:#555; white-space:nowrap; }
    .lead-card-meta { display:flex; align-items:center; gap:6px; margin-top:4px; }
    .priority-badge {
      font-size:.6rem; font-weight:700; padding:2px 6px; border-radius:4px;
      text-transform:uppercase; letter-spacing:.5px;
    }
    .lead-card-unread {
      width:8px; height:8px; border-radius:50%; background:#f87171; flex-shrink:0; margin-top:4px;
    }
    .lead-window-dot {
      width:6px; height:6px; border-radius:50%; background:#34d399; flex-shrink:0;
      title:"Janela 24h aberta";
    }
    .section-header {
      padding:8px 14px 4px; font-size:.65rem; font-weight:700; color:#555;
      text-transform:uppercase; letter-spacing:1px;
    }

    /* ── CHAT WINDOW ── */
    .chat-window { flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden; }
    .chat-empty-state {
      flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
      color:#555; gap:12px;
    }
    .chat-empty-icon { font-size:3rem; }
    .chat-empty-state h3 { color:#888; margin:0; font-size:1.1rem; }
    .chat-empty-state p { color:#555; margin:0; font-size:.85rem; }
    .chat-active { display:flex; height:100%; flex-direction:column; }

    /* ── CHAT HEADER ── */
    .chat-header {
      display:flex; align-items:center; gap:12px; padding:12px 16px;
      background:rgba(255,255,255,.03); border-bottom:1px solid rgba(255,255,255,.07); flex-shrink:0;
    }
    .chat-header-avatar {
      width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg,#FFD700,#f59e0b);
      display:flex; align-items:center; justify-content:center; font-weight:700; color:#111; font-size:1rem; flex-shrink:0;
    }
    .chat-header-info { flex:1; }
    .chat-header-name { font-weight:700; font-size:.95rem; color:#fff; }
    .chat-header-sub { font-size:.72rem; color:#777; margin-top:1px; }
    .chat-header-actions { display:flex; align-items:center; gap:8px; }
    .chat-lock-badge {
      font-size:.7rem; background:rgba(251,191,36,.15); border:1px solid rgba(251,191,36,.3);
      color:#fbbf24; padding:4px 10px; border-radius:8px; white-space:nowrap;
    }
    .chat-reactivate-btn {
      font-size:.72rem; background:rgba(34,197,94,.12); border:1px solid rgba(34,197,94,.25);
      color:#4ade80; padding:4px 10px; border-radius:8px; cursor:pointer; transition:all .15s; white-space:nowrap;
    }
    .chat-reactivate-btn:hover { background:rgba(34,197,94,.22); }
    .chat-archive-btn {
      background:rgba(255,255,255,.07); border:none; color:#888; cursor:pointer;
      border-radius:8px; padding:6px 9px; font-size:1rem; transition:all .15s;
    }
    .chat-archive-btn:hover { background:rgba(255,255,255,.14); color:#ccc; }

    /* ── TASK BANNER ── */
    .chat-task-banner {
      background:rgba(96,165,250,.08); border-bottom:1px solid rgba(96,165,250,.15);
      padding:8px 16px; font-size:.78rem; color:#93c5fd; display:flex; align-items:center; gap:8px;
    }
    .chat-task-banner a { color:#60a5fa; text-decoration:none; font-weight:600; }
    .chat-task-banner a:hover { text-decoration:underline; }

    /* ── WINDOW WARNING ── */
    .chat-window-warning {
      background:rgba(251,191,36,.08); border-bottom:1px solid rgba(251,191,36,.2);
      padding:8px 16px; font-size:.78rem; color:#fbbf24;
    }

    /* ── MESSAGES ── */
    .chat-messages {
      flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:8px;
      scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.1) transparent;
    }
    .msg-row { display:flex; align-items:flex-end; gap:8px; }
    .msg-row.outbound { flex-direction:row-reverse; }
    .msg-bubble {
      max-width:68%; padding:10px 14px; border-radius:16px; font-size:.85rem; line-height:1.45;
      position:relative; word-break:break-word;
    }
    .msg-row.inbound .msg-bubble {
      background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.07);
      color:#ddd; border-bottom-left-radius:4px;
    }
    .msg-row.outbound .msg-bubble {
      background:rgba(255,215,0,.12); border:1px solid rgba(255,215,0,.2);
      color:#fff; border-bottom-right-radius:4px;
    }
    .msg-row.outbound.manual .msg-bubble {
      background:rgba(96,165,250,.12); border:1px solid rgba(96,165,250,.2);
    }
    .msg-meta { font-size:.62rem; color:#555; display:flex; gap:6px; align-items:center; margin-top:3px; }
    .msg-row.outbound .msg-meta { justify-content:flex-end; }
    .msg-badge {
      font-size:.55rem; font-weight:700; padding:1px 5px; border-radius:3px;
      background:rgba(255,215,0,.15); color:#fbbf24; text-transform:uppercase;
    }
    .msg-badge.manual { background:rgba(96,165,250,.15); color:#93c5fd; }
    .msg-badge.audio { background:rgba(52,211,153,.15); color:#6ee7b7; }
    .msg-audio-indicator { font-size:.8rem; display:flex; align-items:center; gap:6px; }
    .msg-audio-indicator::before { content:'🎵'; }
    .typing-indicator { animation:pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
    .messages-date-divider {
      text-align:center; font-size:.65rem; color:#555; margin:8px 0;
      display:flex; align-items:center; gap:8px;
    }
    .messages-date-divider::before, .messages-date-divider::after {
      content:''; flex:1; height:1px; background:rgba(255,255,255,.07);
    }

    /* ── BOTTOM BAR ── */
    .chat-bottom-bar {
      display:flex; align-items:flex-end; gap:8px; padding:12px 16px;
      background:rgba(255,255,255,.03); border-top:1px solid rgba(255,255,255,.07); flex-shrink:0;
    }
    .chat-bottom-bar textarea {
      flex:1; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.1);
      border-radius:12px; padding:10px 14px; color:#fff; font-size:.88rem; resize:none;
      outline:none; max-height:120px; line-height:1.4; font-family:inherit; transition:border-color .15s;
    }
    .chat-bottom-bar textarea:focus { border-color:rgba(255,215,0,.4); }
    .chat-bottom-bar textarea:disabled { opacity:.4; cursor:not-allowed; }
    .chat-send-btn {
      width:42px; height:42px; border-radius:12px; border:none; cursor:pointer;
      background:linear-gradient(135deg,#FFD700,#f59e0b); color:#111; display:flex;
      align-items:center; justify-content:center; flex-shrink:0; transition:all .15s;
    }
    .chat-send-btn:hover { transform:scale(1.05); box-shadow:0 4px 12px rgba(255,215,0,.3); }
    .chat-send-btn:disabled { opacity:.4; cursor:not-allowed; transform:none; }

    /* ── ATTACH & TEMPLATE BTNS ── */
    .chat-attach-btn, .chat-template-btn {
      width:36px; height:36px; border-radius:10px; border:1px solid rgba(255,255,255,.1);
      background:rgba(255,255,255,.06); color:#888; cursor:pointer; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; transition:all .15s;
    }
    .chat-attach-btn:hover { background:rgba(255,255,255,.12); color:#ccc; }
    .chat-template-btn:hover { background:rgba(255,215,0,.12); color:#FFD700; border-color:rgba(255,215,0,.3); }
    .chat-attach-btn:disabled, .chat-template-btn:disabled { opacity:.3; cursor:not-allowed; }

    /* ── WINDOW WARNING TEMPLATE BTN ── */
    .chat-window-warning { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .chat-template-warn-btn {
      margin-left:auto; background:rgba(255,215,0,.15); border:1px solid rgba(255,215,0,.3);
      color:#FFD700; font-size:.75rem; font-weight:700; padding:5px 12px; border-radius:8px;
      cursor:pointer; transition:all .15s; white-space:nowrap;
    }
    .chat-template-warn-btn:hover { background:rgba(255,215,0,.25); }

    /* ── TEMPLATE MODAL ── */
    .chat-template-overlay {
      position:absolute; inset:0; background:rgba(0,0,0,.65); backdrop-filter:blur(4px);
      z-index:100; display:flex; align-items:center; justify-content:center; border-radius:inherit;
    }
    .chat-template-modal {
      background:#141414; border:1px solid rgba(255,215,0,.2); border-radius:20px;
      width:100%; max-width:440px; margin:16px; overflow:hidden;
      box-shadow:0 24px 64px rgba(0,0,0,.7);
    }
    .chat-template-modal-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:16px 20px; border-bottom:1px solid rgba(255,255,255,.07);
      font-weight:700; font-size:.95rem; color:#fff;
    }
    .chat-template-modal-header button {
      background:none; border:none; color:#666; font-size:1.1rem; cursor:pointer;
      line-height:1; padding:2px 6px; border-radius:6px; transition:all .15s;
    }
    .chat-template-modal-header button:hover { color:#fff; background:rgba(255,255,255,.08); }
    .chat-template-modal-body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
    .chat-template-lead-name { font-size:.8rem; color:#888; margin:0 0 4px; }
    .chat-template-list { display:flex; flex-direction:column; gap:8px; max-height:320px; overflow-y:auto; }
    .chat-tpl-card {
      background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.09);
      border-radius:12px; padding:12px 14px; cursor:pointer; transition:all .15s;
    }
    .chat-tpl-card:hover { background:rgba(255,215,0,.07); border-color:rgba(255,215,0,.25); }
    .chat-tpl-card.selected { background:rgba(255,215,0,.12); border-color:rgba(255,215,0,.5); }
    .chat-tpl-name { font-weight:700; font-size:.85rem; color:#fff; margin-bottom:4px; }
    .chat-tpl-preview { font-size:.78rem; color:#888; line-height:1.45; white-space:pre-wrap; }
    .chat-template-modal-footer {
      padding:14px 20px; border-top:1px solid rgba(255,255,255,.07);
      display:flex; gap:8px; justify-content:flex-end;
    }
    .chat-tpl-cancel {
      background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
      color:#888; padding:8px 16px; border-radius:10px; cursor:pointer; font-size:.82rem;
    }
    .chat-tpl-send {
      background:linear-gradient(135deg,#FFD700,#f59e0b); border:none; color:#111;
      font-weight:700; padding:8px 18px; border-radius:10px; cursor:pointer; font-size:.82rem;
      transition:all .15s;
    }
    .chat-tpl-send:disabled { opacity:.4; cursor:not-allowed; }
    .chat-tpl-send:not(:disabled):hover { transform:scale(1.02); box-shadow:0 4px 12px rgba(255,215,0,.3); }

    /* ── RESPONSIVE ── */
    @media (max-width: 768px) {
      .chat-list-panel { width: 100%; max-width:100%; position:absolute; z-index:10; height:100%; }
      .chat-list-panel.collapsed { width:0; }
      .chat-panel { position:relative; }
      .chat-expand-btn { display:flex !important; }
      .chat-kpi-bar { padding: 10px 12px 8px; gap:8px; }
      .chat-kpi-card { min-width:130px; padding:10px 12px; }
    }
  </style>
  `;
}

// ─── KPIs ────────────────────────────────────────────────────────────────────
async function loadKPIs() {
  if (!chatState.workspaceId) return;
  try {
    const [totalRes, aiRes, humanRes, respondedRes, highlightedRes] = await Promise.all([
      window._sb.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', chatState.workspaceId),
      window._sb.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', chatState.workspaceId).eq('direction', 'outbound').eq('automated', true),
      window._sb.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', chatState.workspaceId).eq('direction', 'outbound').eq('automated', false),
      window._sb.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_id', chatState.workspaceId).eq('has_responded', true),
      window._sb.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_id', chatState.workspaceId).eq('inbox_status', 'highlighted'),
    ]);

    const aiInitiated = chatState.leads.filter(l => !l.has_responded && l.inbox_status !== 'archived').length;

    document.getElementById('kv-total').textContent = (totalRes.count ?? 0).toLocaleString();
    document.getElementById('kv-ai').textContent = (aiRes.count ?? 0).toLocaleString();
    document.getElementById('kv-human').textContent = (humanRes.count ?? 0).toLocaleString();
    document.getElementById('kv-responded').textContent = (respondedRes.count ?? 0).toLocaleString();
    document.getElementById('kv-highlighted').textContent = (highlightedRes.count ?? 0).toLocaleString();
    document.getElementById('kv-ai-initiated').textContent = aiInitiated.toLocaleString();
  } catch (e) { console.error('[Chat] KPI error:', e); }
}

// ─── LEADS ───────────────────────────────────────────────────────────────────
async function loadLeads() {
  if (!chatState.workspaceId) return;
  const { data: leads } = await window._sb
    .from('leads')
    .select('id, name, phone, inbox_status, inbox_priority, has_responded, llm_lock_until, wa_window_expires_at, last_message_at')
    .eq('workspace_id', chatState.workspaceId)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(200);

  chatState.leads = leads ?? [];
  renderLeadsList();
  updateSidebarBadge();
}

function renderLeadsList() {
  const container = document.getElementById('chat-leads-list');
  if (!container) return;

  const searchVal = (document.getElementById('chat-search')?.value ?? '').toLowerCase();
  let leads = chatState.leads.filter(l => {
    if (searchVal && !l.name?.toLowerCase().includes(searchVal) && !l.phone?.includes(searchVal)) return false;
    switch (chatState.filter) {
      case 'highlighted': return l.inbox_status === 'highlighted';
      case 'responded': return l.has_responded;
      case 'no-response': return !l.has_responded && l.inbox_status !== 'archived';
      case 'archived': return l.inbox_status === 'archived';
      default: return l.inbox_status !== 'archived';
    }
  });

  if (!leads.length) {
    container.innerHTML = '<div class="chat-list-loading">Nenhuma conversa encontrada.</div>';
    return;
  }

  // Group: highlighted → inbound → rest
  const highlighted = leads.filter(l => l.inbox_status === 'highlighted');
  const normal = leads.filter(l => l.inbox_status !== 'highlighted');

  let html = '';
  if (highlighted.length && chatState.filter === 'all') {
    html += `<div class="section-header">🔴 Em destaque (${highlighted.length})</div>`;
    html += highlighted.map(buildLeadCard).join('');
    if (normal.length) html += `<div class="section-header">💬 Conversas (${normal.length})</div>`;
  }
  html += normal.map(buildLeadCard).join('');
  container.innerHTML = html;
}

function buildLeadCard(lead) {
  const isActive = lead.id === chatState.selectedLeadId;
  const isHighlighted = lead.inbox_status === 'highlighted';
  const windowOpen = lead.wa_window_expires_at && new Date(lead.wa_window_expires_at) > new Date();
  const prio = PRIORITY_LABELS[lead.inbox_priority] || PRIORITY_LABELS.none;
  const initials = (lead.name || 'V').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const timeAgo = lead.last_message_at ? formatTimeAgo(lead.last_message_at) : '';

  return `
  <div class="chat-lead-card ${isActive ? 'active' : ''} ${isHighlighted ? 'highlighted-card' : ''}"
       id="lead-card-${lead.id}" onclick="selectLead('${lead.id}')">
    <div class="lead-avatar">${initials}</div>
    <div class="lead-card-body">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="lead-card-name">${escapeHtml(lead.name || 'Visitante')}</span>
        <span class="lead-card-time">${timeAgo}</span>
      </div>
      <div class="lead-card-preview">${lead.phone || ''}</div>
      <div class="lead-card-meta">
        ${prio.label ? `<span class="priority-badge" style="background:${prio.color}22;color:${prio.color};border:1px solid ${prio.color}44;">${prio.label}</span>` : ''}
        ${windowOpen ? '<span class="lead-window-dot" title="Janela 24h aberta"></span>' : ''}
        ${!lead.has_responded ? '<span style="font-size:.62rem;color:#666;">Sem resposta</span>' : ''}
      </div>
    </div>
  </div>`;
}

// ─── SELECT LEAD ─────────────────────────────────────────────────────────────
async function selectLead(leadId) {
  chatState.selectedLeadId = leadId;
  let lead = chatState.leads.find(l => l.id === leadId);
  if (!lead) return;

  // Update active state
  document.querySelectorAll('.chat-lead-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`lead-card-${leadId}`)?.classList.add('active');

  // Show chat window
  document.getElementById('chat-empty-state').style.display = 'none';
  const activeEl = document.getElementById('chat-active');
  activeEl.style.display = 'flex';

  // Header
  const initials = (lead.name || 'V').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('chat-header-avatar').textContent = initials;
  document.getElementById('chat-header-name').textContent = lead.name || 'Visitante';
  document.getElementById('chat-header-sub').textContent = `${lead.phone || ''}`;

  // On mobile, collapse list
  if (window.innerWidth <= 768) {
    document.getElementById('chat-list-panel').classList.add('collapsed');
    document.getElementById('chat-expand-btn').style.display = 'flex';
  }

  // Human lock
  updateLockUI(lead);

  // ── Refresh wa_window_expires_at from DB (cache may be stale after inbound message) ──
  try {
    const { data: freshLead } = await window._sb
      .from('leads')
      .select('wa_window_expires_at, llm_lock_until, inbox_status')
      .eq('id', leadId)
      .maybeSingle();
    if (freshLead) {
      // Merge fresh data into in-memory lead
      lead = Object.assign(lead, freshLead);
      // Also update leads array
      const idx = chatState.leads.findIndex(l => l.id === leadId);
      if (idx >= 0) chatState.leads[idx] = Object.assign(chatState.leads[idx], freshLead);
      // Re-eval lock UI with fresh data
      updateLockUI(lead);
    }
  } catch(e) { /* non-fatal */ }

  // Window warning / input toggle
  applyWindowUI(lead);

  // Load messages
  await loadMessages(leadId);

  // Check linked task
  await loadLinkedTask(leadId, lead.inbox_priority);

  // Subscribe to realtime for this lead
  subscribeToLead(leadId);
}

function applyWindowUI(lead) {
  const windowOpen = lead.wa_window_expires_at && new Date(lead.wa_window_expires_at) > new Date();
  const warnEl = document.getElementById('chat-window-warning');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const attachBtn = document.getElementById('chat-attach-btn');
  const tplBtn = document.getElementById('chat-template-btn');

  warnEl.style.display = windowOpen ? 'none' : 'flex';
  inputEl.disabled = !windowOpen;
  sendBtn.disabled = !windowOpen;
  if (attachBtn) attachBtn.disabled = !windowOpen;
  if (tplBtn) tplBtn.style.display = windowOpen ? 'flex' : 'none'; // template in bar only when window open
}

async function loadMessages(leadId) {
  const { data: msgs } = await window._sb
    .from('messages')
    .select('id, direction, type, content, automated, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(500);

  chatState.messages = msgs ?? [];
  renderMessages();
}

function renderMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  if (!chatState.messages.length) {
    container.innerHTML = '<div style="text-align:center;color:#555;padding:40px;font-size:.85rem;">Nenhuma mensagem ainda.</div>';
    return;
  }

  let html = '';
  let lastDate = null;
  for (const msg of chatState.messages) {
    const msgDate = new Date(msg.created_at).toLocaleDateString('pt-BR');
    if (msgDate !== lastDate) {
      html += `<div class="messages-date-divider">${msgDate}</div>`;
      lastDate = msgDate;
    }
    html += buildMessageBubble(msg);
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function buildMessageBubble(msg) {
  const isOutbound = msg.direction === 'outbound';
  const isManual = isOutbound && !msg.automated;
  const isAudio = msg.type === 'audio';
  const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const rowClass = `msg-row ${isOutbound ? 'outbound' : 'inbound'} ${isManual ? 'manual' : ''}`;

  let content = escapeHtml(msg.content || '');
  if (isAudio) {
    // Show full transcription — no truncation
    const audioText = msg.content?.replace(/^\[ÁUDIO GERADO\]: /, '') || '';
    content = `<div class="msg-audio-indicator" style="white-space:pre-wrap;">${escapeHtml(audioText)}</div>`;
  }

  const badge = isManual
    ? '<span class="msg-badge manual">Equipe</span>'
    : isAudio
      ? '<span class="msg-badge audio">🎵 Áudio</span>'
      : isOutbound ? '<span class="msg-badge">IA</span>' : '';

  return `
  <div class="${rowClass}">
    <div class="msg-bubble">
      ${content}
      <div class="msg-meta">
        <span>${time}</span>
        ${badge}
      </div>
    </div>
  </div>`;
}

// ─── LINKED TASK ─────────────────────────────────────────────────────────────
async function loadLinkedTask(leadId, priority) {
  const bannerEl = document.getElementById('chat-task-banner');
  bannerEl.style.display = 'none';
  if (!priority || priority === 'none') return;
  const lead = chatState.leads.find(l => l.id === leadId);
  if (!lead) return;
  const { data: tasks } = await window._sb
    .from('tasks')
    .select('id, title')
    .eq('workspace_id', chatState.workspaceId)
    .eq('requester_phone', lead.phone)
    .order('created_at', { ascending: false })
    .limit(1);
  if (tasks?.length) {
    document.getElementById('chat-task-link').dataset.taskId = tasks[0].id;
    document.getElementById('chat-task-link').textContent = `${tasks[0].title} →`;
    bannerEl.style.display = 'flex';
  }
}

function goToLinkedTask(e) {
  e.preventDefault();
  const taskId = e.currentTarget.dataset.taskId;
  if (taskId && typeof switchTab === 'function') {
    switchTab('tarefas');
    // highlight task after a small delay for tab to load
    setTimeout(() => {
      const taskEl = document.getElementById(`task-${taskId}`);
      if (taskEl) { taskEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); taskEl.classList.add('task-highlight'); }
    }, 400);
  }
}

// ─── SEND MANUAL MESSAGE ──────────────────────────────────────────────────────
async function sendManualMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || !chatState.selectedLeadId) return;

  const sendBtn = document.getElementById('chat-send-btn');
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20m-7-7 7 7 7-7"/></svg>';

  try {
    const res = await fetch('https://api.consolidacao.7pro.tech/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: chatState.selectedLeadId,
        text: message,
        workspace_id: chatState.workspaceId
      })
    });
    const result = await res.json();
    if (result.ok) {
      input.value = '';
      input.style.height = '';
      // Update human lock UI
      const lead = chatState.leads.find(l => l.id === chatState.selectedLeadId);
      if (lead && result.lock_until) {
        lead.llm_lock_until = result.lock_until;
        updateLockUI(lead);
      }
      // Optimistically show message
      chatState.messages.push({
        id: crypto.randomUUID(), direction: 'outbound', type: 'text',
        content: message, automated: false, created_at: new Date().toISOString()
      });
      renderMessages();
    } else {
      showChatToast(`❌ ${result.error || 'Erro ao enviar mensagem.'}`, 'error');
    }
  } catch (e) {
    console.error('[Chat] Send error:', e);
    showChatToast('❌ Erro de conexão com o servidor.', 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  }
}

function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManualMessage(); }
}

function autoresizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ─── HUMAN LOCK UI ────────────────────────────────────────────────────────────
function updateLockUI(lead) {
  const lockBadge = document.getElementById('chat-lock-badge');
  const reactivateBtn = document.getElementById('chat-reactivate-btn');
  if (!lockBadge || !reactivateBtn) return;

  if (chatState.lockTimers[lead.id]) {
    clearInterval(chatState.lockTimers[lead.id]);
    delete chatState.lockTimers[lead.id];
  }

  const isLocked = lead.llm_lock_until && new Date(lead.llm_lock_until) > new Date();
  lockBadge.style.display = isLocked ? 'inline-flex' : 'none';
  reactivateBtn.style.display = isLocked ? 'inline-flex' : 'none';

  if (isLocked) {
    const updateCountdown = () => {
      const diff = new Date(lead.llm_lock_until) - new Date();
      if (diff <= 0) {
        lockBadge.style.display = 'none';
        reactivateBtn.style.display = 'none';
        clearInterval(chatState.lockTimers[lead.id]);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      document.getElementById('chat-lock-countdown').textContent = `até ${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    };
    updateCountdown();
    chatState.lockTimers[lead.id] = setInterval(updateCountdown, 1000);
  }
}

async function reactivateAI() {
  if (!chatState.selectedLeadId) return;
  await window._sb.from('leads').update({ llm_lock_until: null }).eq('id', chatState.selectedLeadId);
  const lead = chatState.leads.find(l => l.id === chatState.selectedLeadId);
  if (lead) { lead.llm_lock_until = null; updateLockUI(lead); }
  showChatToast('✅ IA reativada!', 'success');
}

// ─── ARCHIVE ──────────────────────────────────────────────────────────────────
async function archiveCurrentLead() {
  if (!chatState.selectedLeadId) return;
  await window._sb.from('leads').update({ inbox_status: 'archived' }).eq('id', chatState.selectedLeadId);
  const lead = chatState.leads.find(l => l.id === chatState.selectedLeadId);
  if (lead) lead.inbox_status = 'archived';
  chatState.selectedLeadId = null;
  document.getElementById('chat-empty-state').style.display = 'flex';
  document.getElementById('chat-active').style.display = 'none';
  renderLeadsList();
  showChatToast('📦 Conversa arquivada.', 'info');
}

// ─── REALTIME ─────────────────────────────────────────────────────────────────
function setupRealtime() {
  if (chatState.realtimeChannel) {
    window._sb.removeChannel(chatState.realtimeChannel);
  }
  chatState.realtimeChannel = window._sb
    .channel(`chat-workspace-${chatState.workspaceId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages',
      filter: `workspace_id=eq.${chatState.workspaceId}`
    }, (payload) => {
      const msg = payload.new;
      // Update lead last_message_at in state
      const lead = chatState.leads.find(l => l.id === msg.lead_id);
      if (lead) lead.last_message_at = msg.created_at;
      // If this lead is open, add message live
      if (msg.lead_id === chatState.selectedLeadId) {
        chatState.messages.push(msg);
        renderMessages();
      }
      renderLeadsList();
      updateSidebarBadge();
      loadKPIs();
    })
    .subscribe();
}

function subscribeToLead(leadId) {
  // Already covered by workspace-level subscription
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function toggleChatSidebar() {
  chatState.sidebarCollapsed = !chatState.sidebarCollapsed;
  const panel = document.getElementById('chat-list-panel');
  const expandBtn = document.getElementById('chat-expand-btn');
  const collapseBtn = document.getElementById('chat-collapse-btn');
  panel.classList.toggle('collapsed', chatState.sidebarCollapsed);
  if (expandBtn) expandBtn.style.display = chatState.sidebarCollapsed ? 'flex' : 'none';
  if (collapseBtn) collapseBtn.style.display = chatState.sidebarCollapsed ? 'none' : 'flex';
}

// ─── FILTERS ───────────────────────────────────────────────────────────────────
function setChatFilter(filter, btn) {
  chatState.filter = filter;
  document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderLeadsList();
}

function filterLeadsList() { renderLeadsList(); }

// ─── SIDEBAR BADGE ────────────────────────────────────────────────────────────
function updateSidebarBadge() {
  const highlighted = chatState.leads.filter(l => l.inbox_status === 'highlighted').length;
  const badge = document.getElementById('chat-unread-badge');
  if (!badge) return;
  badge.textContent = highlighted;
  badge.style.display = highlighted > 0 ? 'inline-flex' : 'none';
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
function attachChatEvents() {
  // Nothing extra needed — all events are inline
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function showChatToast(msg, type = 'info') {
  const colors = { success: '#4ade80', warn: '#fbbf24', error: '#f87171', info: '#60a5fa' };
  const toast = document.createElement('div');
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;background:#1a1a1a;border:1px solid ${colors[type]};color:#fff;padding:12px 20px;border-radius:12px;font-size:.85rem;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:slideUp .2s ease;`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ─── TEMPLATES ─────────────────────────────────────────────────────────────
const BACKEND_URL = 'https://api.consolidacao.7pro.tech';

let _selectedTemplate = null; // { name, language_code, body_text, variables_count }

// Extract readable body text from a Meta template's component array
function extractTemplateBody(components) {
  const body = (components || []).find(c => c.type === 'BODY');
  return body?.text || '';
}

// Count how many {{N}} variables exist in the template body
function countTemplateVars(text) {
  const matches = text.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
}

// Interpolate variable placeholders for preview (replaces {{1}} with actual value)
function interpolatePreview(text, vars) {
  let out = text;
  (vars || []).forEach((v, i) => { out = out.replace(`{{${i + 1}}}`, v); });
  return out;
}

async function openTemplateModal() {
  if (!chatState.selectedLeadId) return;
  const lead = chatState.leads.find(l => l.id === chatState.selectedLeadId);
  _selectedTemplate = null;

  // Populate lead name label
  const nameEl = document.getElementById('tpl-lead-name');
  if (nameEl) nameEl.textContent = `Para: ${lead?.name || 'Lead'}`;

  // Reset send button
  const sendBtn = document.getElementById('chat-tpl-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Enviar Template ✓'; }

  const listEl = document.getElementById('chat-template-list');
  if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#666;font-size:.82rem;">Carregando templates...</div>';

  // Show overlay
  const overlay = document.getElementById('chat-template-overlay');
  if (overlay) overlay.style.display = 'flex';

  // Fetch real templates from Meta via backend
  try {
    const res = await fetch(`${BACKEND_URL}/whatsapp/templates?workspace_id=${chatState.workspaceId}`);
    const data = await res.json();

    if (data.error || !data.templates?.length) {
      if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:24px;color:#f87171;font-size:.82rem;">❌ ${data.error || 'Nenhum template aprovado encontrado'}<br><span style="color:#666;font-size:.75rem;">Verifique seus templates aprovados no Meta Business Manager</span></div>`;
      return;
    }

    const firstName = lead?.name?.split(' ')[0] || lead?.name || 'Amigo';

    if (listEl) {
      listEl.innerHTML = data.templates.map(t => {
        const bodyText = extractTemplateBody(t.components);
        const varCount = countTemplateVars(bodyText);
        // For preview: fill {{1}} with lead first name
        const previewVars = Array(varCount).fill('').map((_, i) => i === 0 ? firstName : '...');
        const preview = interpolatePreview(bodyText, previewVars);
        const lang = t.language || 'pt_BR';
        return `<div class="chat-tpl-card" id="tpl-card-${t.name}" onclick="selectTemplate('${t.name}', '${lang}', ${varCount})">
          <div class="chat-tpl-name">${t.name.replace(/_/g, ' ')}</div>
          <div class="chat-tpl-preview">${escapeHtml(preview)}</div>
          <div style="font-size:.68rem;color:#555;margin-top:4px;">${lang} • ${varCount} variável${varCount !== 1 ? 'is' : ''}</div>
        </div>`;
      }).join('');
    }
  } catch(e) {
    if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:24px;color:#f87171;font-size:.82rem;">❌ Erro ao carregar templates: ${e.message}</div>`;
  }
}


function selectTemplate(name, languageCode, varCount) {
  _selectedTemplate = { name, language_code: languageCode, variables_count: varCount };
  document.querySelectorAll('.chat-tpl-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`tpl-card-${name}`);
  if (card) card.classList.add('selected');
  const btn = document.getElementById('chat-tpl-send-btn');
  if (btn) btn.disabled = false;
}

function closeTemplateModal() {
  const overlay = document.getElementById('chat-template-overlay');
  if (overlay) overlay.style.display = 'none';
  _selectedTemplate = null;
}

async function sendSelectedTemplate() {
  if (!_selectedTemplate || !chatState.selectedLeadId) return;
  const lead = chatState.leads.find(l => l.id === chatState.selectedLeadId);

  const sendBtn = document.getElementById('chat-tpl-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Enviando...'; }

  const firstName = lead?.name?.split(' ')[0] || lead?.name || '';
  const variables = [];
  if (_selectedTemplate.variables_count > 0) variables.push(firstName);
  for (let i = 1; i < _selectedTemplate.variables_count; i++) variables.push('');

  try {
    const res = await fetch(`${BACKEND_URL}/whatsapp/send-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: chatState.selectedLeadId,
        workspace_id: chatState.workspaceId,
        template_name: _selectedTemplate.name,
        language_code: _selectedTemplate.language_code,
        variables
      })
    });
    const result = await res.json();
    if (result.ok) {
      closeTemplateModal();
      showChatToast('\u2705 Template enviado com sucesso!', 'success');
      chatState.messages.push({
        id: crypto.randomUUID(), direction: 'outbound', type: 'text',
        content: `\ud83d\udce8 Template: ${_selectedTemplate.name}`,
        automated: false, created_at: new Date().toISOString()
      });
      renderMessages();
    } else {
      const errMsg = result.details?.error?.message || result.error || 'Erro desconhecido';
      showChatToast(`\u274c ${errMsg}`, 'error');
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar Template \u2713'; }
    }
  } catch(e) {
    showChatToast(`\u274c Erro de conex\u00e3o: ${e.message}`, 'error');
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar Template \u2713'; }
  }
}

// ─── FILE ATTACHMENT ─────────────────────────────────────────────────────
async function handleChatFileAttach(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !chatState.selectedLeadId) return;

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) { showChatToast('\u274c Arquivo muito grande. M\u00e1ximo 10MB.', 'error'); return; }

  showChatToast('\ud83d\udcce Fazendo upload...', 'info');

  try {
    const ext = file.name.split('.').pop();
    const path = `chat/${chatState.selectedLeadId}/${Date.now()}.${ext}`;

    const { error: upErr } = await window._sb.storage
      .from('app_files')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (upErr) throw upErr;

    const { data: urlData } = window._sb.storage.from('app_files').getPublicUrl(path);
    const publicUrl = urlData?.publicUrl;

    const isImage = file.type.startsWith('image/');
    const res = await fetch(`${BACKEND_URL}/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: chatState.selectedLeadId,
        text: publicUrl,
        workspace_id: chatState.workspaceId
      })
    });
    const result = await res.json();
    if (result.ok || result.status === 'success') {
      showChatToast('\u2705 Arquivo enviado!', 'success');
      chatState.messages.push({
        id: crypto.randomUUID(), direction: 'outbound',
        type: isImage ? 'image' : 'document',
        content: `[${isImage ? 'Imagem' : 'Arquivo'}: ${file.name}] ${publicUrl}`,
        automated: false, created_at: new Date().toISOString()
      });
      renderMessages();
    } else {
      throw new Error(result.error || 'Erro no envio');
    }
  } catch(e) {
    showChatToast(`\u274c Erro no envio: ${e.message}`, 'error');
  }
}

// ─── EXPOSE ─────────────────────────────────────────────────────────────
window.initChatAoVivo = initChatAoVivo;
window.selectLead = selectLead;
window.setChatFilter = setChatFilter;
window.filterLeadsList = filterLeadsList;
window.toggleChatSidebar = toggleChatSidebar;
window.sendManualMessage = sendManualMessage;
window.handleChatKeydown = handleChatKeydown;
window.autoresizeTextarea = autoresizeTextarea;
window.reactivateAI = reactivateAI;
window.archiveCurrentLead = archiveCurrentLead;
window.goToLinkedTask = goToLinkedTask;
window.openTemplateModal = openTemplateModal;
window.closeTemplateModal = closeTemplateModal;
window.selectTemplate = selectTemplate;
window.sendSelectedTemplate = sendSelectedTemplate;
window.handleChatFileAttach = handleChatFileAttach;
