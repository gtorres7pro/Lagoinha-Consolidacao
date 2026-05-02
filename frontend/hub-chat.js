/* ============================================================
   hub-chat.js — Chat ao Vivo | Zelo
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
  selectedPhoneKey: null,
  messages: [],
  realtimeChannel: null,
  filter: 'all',
  sidebarCollapsed: false,
  kpis: {},
  lockTimers: {},
  workspaceId: null,
  currentUser: null,
  voiceRecorder: null,
  voiceStream: null,
  voiceChunks: [],
  voiceRecordingStartedAt: null,
};

async function resolveChatWorkspaceId(_sb, userWorkspaceId) {
  const pathSlug = window.location.pathname.split('/').filter(Boolean)[0];
  const slugWorkspace = (window._allWorkspaces || []).find(w => w.slug === pathSlug);
  if (slugWorkspace?.id) return slugWorkspace.id;
  if (pathSlug && !pathSlug.endsWith('.html')) {
    try {
      const { data: wsBySlug } = await _sb
        .from('workspaces')
        .select('id')
        .eq('slug', pathSlug)
        .maybeSingle();
      if (wsBySlug?.id) return wsBySlug.id;
    } catch (e) {
      console.warn('[Chat] workspace slug resolution failed:', e);
    }
  }
  return slugWorkspace?.id
    || window.currentWorkspaceId
    || window._currentWorkspaceId
    || sessionStorage.getItem('ws_id')
    || localStorage.getItem('currentWorkspaceId')
    || userWorkspaceId;
}

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
  // Use the globally selected workspace first, then fallback to user's assigned workspace
  chatState.workspaceId = await resolveChatWorkspaceId(_sb, userData.workspace_id);
  window.__chatAoVivoWorkspaceId = chatState.workspaceId;

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

    <!-- Hidden KPI holders for data (queried by JS but not displayed) -->
    <div id="chat-kpi-bar" style="display:none;">
      <span id="kv-highlighted">0</span><span id="kv-responded">0</span>
      <span id="kv-ai-initiated">0</span><span id="kv-total">0</span>
      <span id="kv-ai">0</span><span id="kv-human">0</span>
    </div>

    <!-- MAIN PANEL — full-height two-column WhatsApp layout -->
    <div class="chat-panel" id="chat-panel">

      <!-- LEFT: Contacts Sidebar -->
      <div class="chat-list-panel" id="chat-list-panel">
        <!-- Sidebar header -->
        <div class="chat-sidebar-header">
          <div class="chat-sidebar-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFD700" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Conversas</span>
            <span id="chat-realtime-dot" title="Conectando..." style="width:8px;height:8px;border-radius:50%;background:#fbbf24;display:inline-block;margin-left:6px;flex-shrink:0;transition:background .3s;"></span>
          </div>
          <div class="chat-sidebar-actions">
            <button class="csb" onclick="openBroadcastModal()" title="Broadcast">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            </button>
            <button class="csb" onclick="setChatFilter('archived',this)" title="Arquivadas" id="chat-archive-filter-btn">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            </button>
            <button class="csb" id="chat-collapse-btn" onclick="toggleChatSidebar()" title="Recolher">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>
        </div>

        <!-- Search -->
        <div class="chat-search-wrap">
          <div class="chat-search-inner">
            <svg class="chat-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="chat-search" placeholder="Pesquisar conversa..." oninput="filterLeadsList()" autocomplete="off" />
          </div>
          <button class="chat-new-convo-btn" onclick="openNewConvoModal()" title="Nova Conversa">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            Nova
          </button>
        </div>

        <!-- Leads list -->
        <div class="chat-leads-list" id="chat-leads-list">
          <div class="chat-list-loading">
            <div class="chat-loading-dots"><span></span><span></span><span></span></div>
            Carregando conversas...
          </div>
        </div>
      </div>

      <!-- RIGHT: Chat Window -->
      <div class="chat-window" id="chat-window">
        <!-- Floating expand button (visible only when sidebar is collapsed) -->
        <button class="chat-sidebar-expand-fab" id="chat-sidebar-expand-fab" onclick="toggleChatSidebar()" title="Mostrar conversas" style="display:none;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
          <span>Conversas</span>
        </button>
        <!-- Empty state -->
        <div class="chat-empty-state" id="chat-empty-state">
          <div class="chat-empty-graphic">
            <svg viewBox="0 0 190 190" width="190" height="190" fill="none">
              <circle cx="95" cy="95" r="90" stroke="rgba(255,215,0,0.08)" stroke-width="2"/>
              <circle cx="95" cy="95" r="60" stroke="rgba(255,215,0,0.05)" stroke-width="1.5"/>
              <path d="M95 50c-24.8 0-45 18.4-45 41 0 8.6 2.8 16.6 7.6 23.2L52 135l22.4-5.4c6 3 12.8 4.6 20 4.6h.6c24.8 0 45-18.4 45-41S119.8 50 95 50z" fill="rgba(255,215,0,0.06)" stroke="rgba(255,215,0,0.15)" stroke-width="1.5"/>
              <circle cx="78" cy="88" r="3" fill="rgba(255,215,0,0.3)"/>
              <circle cx="95" cy="88" r="3" fill="rgba(255,215,0,0.3)"/>
              <circle cx="112" cy="88" r="3" fill="rgba(255,215,0,0.3)"/>
            </svg>
          </div>
          <h3>Chat ao Vivo</h3>
          <p>Selecione uma conversa para começar a mensagem</p>
          <div class="chat-empty-hint">As mensagens são criptografadas e enviadas via WhatsApp</div>
        </div>

        <!-- Active chat -->
        <div class="chat-active" id="chat-active" style="display:none; flex-direction:column; height:100%;">
          <!-- Chat Header -->
          <div class="chat-header" id="chat-header">
            <button class="chat-back-btn" onclick="toggleChatSidebar()" id="chat-expand-btn" title="Voltar" style="display:none;">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <div class="chat-header-avatar" id="chat-header-avatar" onclick="openLeadProfileDrawer()" title="Abrir perfil">J</div>
            <div class="chat-header-info" onclick="openLeadProfileDrawer()" title="Abrir perfil">
              <div class="chat-header-name" id="chat-header-name">—</div>
              <div class="chat-header-sub" id="chat-header-sub">—</div>
            </div>
            <div class="chat-header-actions">
              <span class="chat-lock-badge" id="chat-lock-badge" style="display:none;">
                🔒 <span id="chat-lock-countdown"></span>
              </span>
              <button class="chat-reactivate-btn" id="chat-reactivate-btn" style="display:none;" onclick="reactivateAI()">
                ⚡ Reativar IA
              </button>
              <button class="cha-btn" id="chat-profile-btn" onclick="openLeadProfileDrawer()" title="Perfil">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              </button>
              <button class="cha-btn" id="chat-pin-btn" onclick="togglePinCurrentLead()" title="Fixar conversa">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M5 17h14"/><path d="M6 3h12l-2 8 3 6H5l3-6-2-8Z"/></svg>
              </button>
              <button class="cha-btn" id="chat-template-header-btn" onclick="openTemplateModal()" title="Enviar template">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg>
              </button>
              <button class="cha-btn" id="chat-archive-btn" onclick="toggleArchiveCurrentLead()" title="Arquivar">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
              </button>
            </div>
          </div>

          <!-- Task Badge -->
          <div class="chat-task-banner" id="chat-task-banner" style="display:none;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>
            <a id="chat-task-link" href="#" onclick="goToLinkedTask(event)">Ver tarefa →</a>
          </div>

          <!-- Window warning -->
          <div class="chat-window-warning" id="chat-window-warning" style="display:none;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Janela de 24h encerrada</span>
            <button class="chat-tpl-warn-btn" onclick="openTemplateModal()">Enviar Template</button>
          </div>

          <!-- Messages -->
          <div class="chat-messages" id="chat-messages"></div>

          <!-- Bottom composer bar -->
          <div class="chat-bottom-bar" id="chat-bottom-bar">
            <button class="cbb" id="chat-attach-btn" onclick="document.getElementById('chat-file-input').click()" title="Anexar arquivo">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <input type="file" id="chat-file-input" style="display:none;" accept="image/*,audio/*,video/mp4,application/pdf,.doc,.docx,.xls,.xlsx" onchange="handleChatFileAttach(event)">
            
            <div class="chat-composer">
              <button class="cbb cbb-inner" title="Emoji">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </button>
              <textarea id="chat-input" placeholder="Mensagem" rows="1" onkeydown="handleChatKeydown(event)" oninput="autoresizeTextarea(this)"></textarea>
              <button class="cbb cbb-inner" id="chat-template-btn" onclick="openTemplateModal()" title="Templates" style="display:none;">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
              </button>
            </div>

            <button class="chat-send-btn empty" id="chat-send-btn" onclick="handleChatSendButton()" title="Enviar mensagem ou gravar áudio">
              <svg id="chat-mic-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              <svg id="chat-send-icon" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style="display:none;"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
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
                <div id="tpl-vars-section" style="display:none;margin-top:12px;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;">
                  <div style="font-size:.68rem;color:#8696a0;letter-spacing:.08em;margin-bottom:10px;">PREENCHER VARIÁVEIS DO TEMPLATE</div>
                  <div id="tpl-vars-inputs"></div>
                </div>
              </div>
              <div class="chat-template-modal-footer">
                <button class="chat-tpl-cancel" onclick="closeTemplateModal()">Cancelar</button>
                <button class="chat-tpl-send" id="chat-tpl-send-btn" onclick="sendSelectedTemplate()" disabled>Enviar Template ✓</button>
              </div>
            </div>
          </div>
        </div>

        <!-- New Conversation Modal -->
        <div class="chat-template-overlay" id="new-convo-overlay" style="display:none;" onclick="if(event.target===this)closeNewConvoModal()">
          <div class="chat-template-modal" style="max-width:520px;">
            <div class="chat-template-modal-header">
              <span>💬 Nova Conversa WhatsApp</span>
              <button onclick="closeNewConvoModal()">✕</button>
            </div>
            <div class="chat-template-modal-body">
              <div style="margin-bottom:16px;">
                <label style="font-size:.68rem;color:#8696a0;letter-spacing:.08em;display:block;margin-bottom:6px;">NÚMERO WHATSAPP</label>
                <input class="hub-field-input" id="new-convo-phone" placeholder="+1 321 444 3034" style="width:100%;padding:10px 14px;box-sizing:border-box;" oninput="_lookupConvoPhone()">
                <div id="new-convo-lead-info" style="margin-top:6px;font-size:.78rem;color:#8696a0;"></div>
              </div>
              <div>
                <label style="font-size:.68rem;color:#8696a0;letter-spacing:.08em;display:block;margin-bottom:8px;">SELECIONAR TEMPLATE</label>
                <div class="chat-template-list" id="new-convo-template-list" style="max-height:220px;">Carregando templates...</div>
              </div>
              <div id="new-convo-vars-section" style="display:none;margin-top:12px;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;">
                <div style="font-size:.68rem;color:#8696a0;letter-spacing:.08em;margin-bottom:10px;">PREENCHER VARIÁVEIS</div>
                <div id="new-convo-vars-inputs"></div>
              </div>
            </div>
            <div class="chat-template-modal-footer">
              <button class="chat-tpl-cancel" onclick="closeNewConvoModal()">Cancelar</button>
              <button class="chat-tpl-send" id="new-convo-send-btn" onclick="sendNewConversation()" disabled>Enviar ✓</button>
            </div>
          </div>
        </div>

        <!-- Broadcast Modal -->
        <div class="chat-template-overlay" id="broadcast-overlay" style="display:none;" onclick="if(event.target===this)closeBroadcastModal()">
          <div class="chat-template-modal" style="max-width:560px;">
            <div class="chat-template-modal-header">
              <span>📢 Envio em Massa</span>
              <button onclick="closeBroadcastModal()">✕</button>
            </div>
            <div class="chat-template-modal-body">
              <div style="margin-bottom:14px;">
                <label class="kpi-label" style="display:block;margin-bottom:6px;font-size:.72rem;">DESTINATÁRIOS</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;" id="broadcast-audience-chips">
                  <button class="chat-tab active" data-audience="all" onclick="setBroadcastAudience('all',this)">Todos</button>
                  <button class="chat-tab" data-audience="responded" onclick="setBroadcastAudience('responded',this)">Responderam</button>
                  <button class="chat-tab" data-audience="no-response" onclick="setBroadcastAudience('no-response',this)">Sem resposta</button>
                  <button class="chat-tab" data-audience="highlighted" onclick="setBroadcastAudience('highlighted',this)">Destacados</button>
                </div>
                <div style="font-size:.72rem;color:#8696a0;margin-top:8px;" id="broadcast-count">— leads selecionados</div>
              </div>
              <div>
                <label class="kpi-label" style="display:block;margin-bottom:6px;font-size:.72rem;">TEMPLATE</label>
                <div class="chat-template-list" id="broadcast-template-list" style="max-height:220px;">Carregando templates...</div>
              </div>
            </div>
            <div class="chat-template-modal-footer">
              <button class="chat-tpl-cancel" onclick="closeBroadcastModal()">Cancelar</button>
              <button class="chat-tpl-send" id="broadcast-send-btn" onclick="sendBroadcast()" disabled>📢 Enviar Broadcast</button>
            </div>
          </div>
        </div>

        <!-- Lead Profile Drawer -->
        <div class="chat-profile-overlay" id="chat-profile-overlay" style="display:none;" onclick="if(event.target===this)closeLeadProfileDrawer()">
          <aside class="chat-profile-drawer">
            <div class="chat-profile-header">
              <span>Perfil</span>
              <button onclick="closeLeadProfileDrawer()" title="Fechar">✕</button>
            </div>
            <div class="chat-profile-body" id="chat-profile-body"></div>
          </aside>
        </div>
      </div>
    </div>
  </div>

  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    /* ═══════════ ZELO BRAND PALETTE ═══════════
     * --gold:      #FFD700  (primary accent, badges, active)
     * --gold-dim:  #FFD70022 (soft glow backgrounds)
     * --dark-0:    #0a0a0c  (deepest — chat wallpaper)
     * --dark-1:    #0f0f10  (root bg)
     * --dark-2:    #141418  (sidebar / panels)
     * --dark-3:    #1c1c26  (active card, composer bg)
     * --dark-4:    #22222e  (hover card)
     * --dark-5:    #1e1e28  (borders)
     * --out-mila:  #1e1600  (Mila outbound bubble — dark amber)
     * --out-equipe:#0d1a2e  (Equipe outbound bubble — deep navy)
     * --text-1:    #e9edef  (primary text)
     * --text-2:    #a8a8b8  (secondary text / timestamps)
     * --text-3:    #5a5a72  (muted placeholder)
     ═══════════════════════════════════════════ */

    /* ═══════════ ROOT ═══════════ */
    .chat-root {
      display:flex; flex-direction:column; height:100%; width:100%; max-width:100%; min-width:0;
      background:#0f0f10; font-family:'Inter',-apple-system,system-ui,sans-serif;
      border-radius:0; overflow:hidden;
      box-sizing:border-box;
    }

    /* ═══════════ MAIN PANEL ═══════════ */
    .chat-panel { display:flex; flex:1; overflow:hidden; min-width:0; width:100%; max-width:100%; }

    /* ═══════════ LEFT SIDEBAR ═══════════ */
    .chat-list-panel {
      width:clamp(270px, 28vw, 330px); min-width:250px; max-width:330px;
      display:flex; flex-direction:column;
      background:#0f0f10;
      border-right:1px solid #1e1e28;
      transition:width .25s ease, min-width .25s ease;
      flex-shrink:0; overflow:hidden;
    }
    .chat-list-panel.collapsed { width:0; min-width:0; border-right:none; overflow:hidden; }

    .chat-sidebar-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 16px; height:54px; background:#141418; flex-shrink:0;
      border-bottom:1px solid #1e1e28;
    }
    .chat-sidebar-title {
      display:flex; align-items:center; gap:8px;
      font-weight:600; font-size:.95rem; color:#e9edef;
    }
    .chat-sidebar-actions { display:flex; align-items:center; gap:2px; }
    .csb {
      width:36px; height:36px; border-radius:50%; border:none; background:transparent;
      color:#5a5a72; cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition:all .15s;
    }
    .csb:hover { background:rgba(255,215,0,.08); color:#FFD700; }
    .csb.active-filter { color:#FFD700; background:rgba(255,215,0,.1); }

    /* Floating expand button (shows when sidebar is collapsed) */
    .chat-sidebar-expand-fab {
      position:absolute; top:50%; left:14px; transform:translateY(-50%);
      z-index:20; background:#141418; border:1px solid #1e1e28;
      color:#a8a8b8; cursor:pointer;
      display:flex; align-items:center; gap:6px;
      padding:7px 14px 7px 10px; border-radius:20px;
      font-size:.8rem; font-weight:500; font-family:inherit;
      box-shadow:0 4px 16px rgba(0,0,0,.4);
      transition:all .15s;
      white-space:nowrap;
    }
    .chat-sidebar-expand-fab:hover { background:rgba(255,215,0,.08); color:#FFD700; border-color:rgba(255,215,0,.25); }
    @keyframes fabIn { from{opacity:0;transform:translateY(-50%) translateX(-8px)} to{opacity:1;transform:translateY(-50%) translateX(0)} }
    .chat-sidebar-expand-fab[style*="flex"] { animation:fabIn .18s ease; }

    /* Search */
    .chat-search-wrap { padding:8px 12px; flex-shrink:0; background:#0f0f10; display:flex; align-items:center; gap:8px; }
    .chat-search-inner {
      flex: 1;
      display:flex; align-items:center; gap:10px;
      background:#141418; border-radius:8px; padding:6px 12px;
      border:1px solid #1e1e28; transition:border-color .15s;
    }
    .chat-search-inner:focus-within { border-color:rgba(255,215,0,.3); }
    .chat-search-icon { color:#5a5a72; flex-shrink:0; transition:color .15s; }
    .chat-search-inner:focus-within .chat-search-icon { color:#FFD700; }
    .chat-search-inner input {
      width:100%; background:transparent; border:none;
      color:#e9edef; font-size:.875rem; outline:none; font-family:inherit;
    }
    .chat-search-inner input::placeholder { color:#5a5a72; }

    .chat-new-convo-btn {
      flex-shrink:0;
      min-height:36px;
      padding:0 11px;
      border:none;
      border-radius:10px;
      background:var(--accent);
      color:#0a0a0c;
      cursor:pointer;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:5px;
      font-size:.78rem;
      font-weight:700;
      white-space:nowrap;
      box-shadow:0 2px 8px rgba(251,191,36,0.3);
      transition:transform .15s, box-shadow .15s;
      line-height:1;
    }
    .chat-new-convo-btn:hover {
      transform:translateY(-1px);
      box-shadow:0 4px 12px rgba(251,191,36,0.4);
    }
    .chat-new-convo-btn svg { flex-shrink:0; }

    /* Filter tabs (broadcast modal only) */
    .chat-filter-tabs { display:none; }
    .chat-tab {
      background:#1c1c26; border:1px solid #1e1e28; color:#a8a8b8; cursor:pointer;
      border-radius:18px; padding:5px 14px; font-size:.78rem; white-space:nowrap;
      transition:all .12s; font-weight:500;
    }
    .chat-tab.active { background:rgba(255,215,0,.15); color:#FFD700; border-color:rgba(255,215,0,.3); }
    .chat-tab:hover:not(.active) { background:#22222e; color:#e9edef; }

    /* Leads list */
    .chat-leads-list {
      flex:1; overflow-y:auto;
      scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.06) transparent;
    }
    .chat-leads-list::-webkit-scrollbar { width:5px; }
    .chat-leads-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,.06); border-radius:3px; }

    .chat-list-loading {
      display:flex; flex-direction:column; align-items:center; gap:12px;
      color:#5a5a72; padding:60px 20px; font-size:.82rem;
    }
    .chat-loading-dots { display:flex; gap:4px; }
    .chat-loading-dots span {
      width:6px; height:6px; border-radius:50%; background:#5a5a72;
      animation:loadDot .8s ease infinite alternate;
    }
    .chat-loading-dots span:nth-child(2) { animation-delay:.15s; }
    .chat-loading-dots span:nth-child(3) { animation-delay:.3s; }
    @keyframes loadDot { from{opacity:.3;transform:scale(.8)} to{opacity:1;transform:scale(1)} }

    /* ═══════════ LEAD CARD ═══════════ */
    .chat-lead-card {
      display:flex; align-items:center; gap:13px; padding:0 14px; height:72px; cursor:pointer;
      position:relative; transition:background .1s;
    }
    .chat-lead-card:hover { background:#22222e; }
    .chat-lead-card.active { background:#1c1c26; border-left:2px solid #FFD700; padding-left:12px; }

    .lead-avatar-wrap { position:relative; flex-shrink:0; }
    .lead-avatar {
      width:49px; height:49px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-weight:700; color:#0a0a0c; font-size:1.1rem; flex-shrink:0;
      text-transform:uppercase; letter-spacing:-.5px;
      overflow:hidden; position:relative;
    }
    .lead-avatar img, .chat-header-avatar img, .chat-profile-avatar img {
      width:100%; height:100%; object-fit:cover; display:block;
    }
    .lead-avatar.has-photo .avatar-fallback,
    .chat-header-avatar.has-photo .avatar-fallback,
    .chat-profile-avatar.has-photo .avatar-fallback { display:none; }
    /* 24h active window dot — gold instead of green */
    .lead-window-dot {
      width:10px; height:10px; border-radius:50%; background:#FFD700;
      position:absolute; bottom:1px; right:1px; border:2px solid #0f0f10;
    }
    .chat-lead-card.active .lead-window-dot { border-color:#1c1c26; }

    .lead-card-body {
      flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center;
      border-bottom:1px solid #1e1e28; height:100%; padding:0 2px 0 0;
    }
    .chat-lead-card:last-child .lead-card-body { border-bottom:none; }

    .lead-card-row { display:flex; align-items:center; justify-content:space-between; width:100%; }
    .lead-card-bottom { margin-top:3px; }
    .lead-card-name {
      font-weight:500; font-size:.97rem; color:#e9edef;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0;
    }
    .lead-merge-badge {
      display:inline-flex; align-items:center; justify-content:center; vertical-align:middle;
      min-width:18px; height:18px; margin-left:6px; padding:0 6px; border-radius:999px;
      background:rgba(255,215,0,.14); color:#FFD700; font-size:.68rem; font-weight:800;
    }
    .lead-card-time { font-size:.72rem; color:#5a5a72; white-space:nowrap; flex-shrink:0; margin-left:8px; }
    .lead-card-time.has-unread { color:#FFD700; }
    .lead-card-preview {
      font-size:.845rem; color:#5a5a72;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      flex:1; min-width:0;
    }
    .lead-card-badges { display:flex; align-items:center; gap:6px; flex-shrink:0; margin-left:6px; }
    .unread-badge {
      background:#FFD700; color:#0a0a0c; font-size:.68rem; font-weight:800;
      min-width:20px; height:20px; border-radius:10px;
      display:flex; align-items:center; justify-content:center; padding:0 5px;
    }
    .pin-badge { color:#5a5a72; }

    /* ═══════════ CHAT WINDOW ═══════════ */
    .chat-window { flex:1 1 0; width:0; display:flex; flex-direction:column; min-width:0; max-width:100%; overflow:hidden; background:#0a0a0c; position:relative; }

    .chat-empty-state {
      flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
      color:#5a5a72; gap:8px; text-align:center; user-select:none;
      background:#0a0a0c;
    }
    .chat-empty-graphic { margin-bottom:12px; opacity:.6; }
    .chat-empty-state h3 { color:#e9edef; margin:0; font-size:1.8rem; font-weight:300; letter-spacing:-.5px; }
    .chat-empty-state p { margin:8px 0 0; font-size:.9rem; color:#5a5a72; }
    .chat-empty-hint {
      margin-top:24px; font-size:.76rem; color:#3a3a4a; display:flex; align-items:center; gap:6px;
    }
    .chat-empty-hint::before { content:'🔒'; font-size:.7rem; }
    .chat-active { display:flex; height:100%; flex-direction:column; min-width:0; width:100%; }

    /* ═══════════ CHAT HEADER ═══════════ */
    .chat-header {
      display:flex; align-items:center; gap:12px; padding:10px 16px; height:59px;
      background:#141418; border-bottom:1px solid #1e1e28; flex-shrink:0;
      min-width:0; width:100%; box-sizing:border-box;
    }
    .chat-back-btn {
      width:36px; height:36px; border-radius:50%; border:none; background:transparent;
      color:#5a5a72; cursor:pointer; display:flex; align-items:center; justify-content:center;
      flex-shrink:0; transition:all .12s;
    }
    .chat-back-btn:hover { background:rgba(255,215,0,.08); color:#FFD700; }
    .chat-header-avatar {
      width:40px; height:40px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-weight:700; color:#0a0a0c; font-size:1.05rem; flex-shrink:0;
      cursor:pointer; overflow:hidden; position:relative;
    }
    .chat-header-info { flex:1; min-width:0; cursor:pointer; }
    .chat-header-name { font-weight:500; font-size:.97rem; color:#e9edef; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .chat-header-sub { font-size:.76rem; color:#5a5a72; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .chat-header-actions { display:flex; align-items:center; gap:4px; }

    /* AI lock badge — golden */
    .chat-lock-badge {
      font-size:.7rem; background:rgba(255,215,0,.1); color:#FFD700;
      padding:4px 10px; border-radius:16px; white-space:nowrap; font-weight:500;
      display:inline-flex; align-items:center; gap:4px;
    }
    .chat-reactivate-btn {
      font-size:.7rem; background:transparent; border:1px solid rgba(255,215,0,.3);
      color:#FFD700; padding:4px 12px; border-radius:16px; cursor:pointer;
      font-weight:500; transition:all .12s; white-space:nowrap;
    }
    .chat-reactivate-btn:hover { background:rgba(255,215,0,.1); }

    .cha-btn {
      width:36px; height:36px; border-radius:50%; border:none; background:transparent;
      color:#5a5a72; cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition:all .12s;
    }
    .cha-btn:hover { background:rgba(255,215,0,.08); color:#FFD700; }
    .cha-btn.active { color:#FFD700; }

    /* Task banner */
    .chat-task-banner {
      background:rgba(255,215,0,.06); border-bottom:1px solid rgba(255,215,0,.12);
      padding:6px 16px; font-size:.8rem; color:#FFD700;
      display:flex; align-items:center; gap:8px; flex-shrink:0;
      min-width:0; width:100%; box-sizing:border-box;
    }
    .chat-task-banner a { color:#FFD700; text-decoration:none; font-weight:500; opacity:.8; }
    .chat-task-banner a:hover { opacity:1; text-decoration:underline; }

    /* Window warning — amber */
    .chat-window-warning {
      background:#140e00; border-bottom:1px solid rgba(255,215,0,.15);
      padding:8px 16px; font-size:.82rem; color:#e9aa33;
      display:flex; align-items:center; gap:10px; flex-shrink:0;
      min-width:0; width:100%; box-sizing:border-box;
    }
    .chat-tpl-warn-btn {
      margin-left:auto; background:rgba(255,215,0,.15); border:1px solid rgba(255,215,0,.3);
      color:#FFD700; font-size:.78rem; font-weight:600; padding:6px 14px; border-radius:18px;
      cursor:pointer; transition:all .12s; white-space:nowrap;
    }
    .chat-tpl-warn-btn:hover { background:rgba(255,215,0,.25); }

    /* ═══════════ MESSAGES ═══════════ */
    .chat-messages {
      flex:1; overflow-y:auto; overflow-x:hidden; padding:12px 18px 12px 12px; display:flex; flex-direction:column; gap:2px;
      scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.04) transparent;
      background-color:#0a0a0c;
      background-image:url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23FFD700' fill-opacity='0.018'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
      min-width:0; width:100%; box-sizing:border-box;
    }
    .chat-messages::-webkit-scrollbar { width:5px; }
    .chat-messages::-webkit-scrollbar-thumb { background:rgba(255,255,255,.04); border-radius:3px; }

    @keyframes msgIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
    .msg-row { display:flex; animation:msgIn .12s ease; width:100%; margin-bottom:1px; padding:0 10px 0 6px; box-sizing:border-box; min-width:0; }
    .msg-row.outbound { justify-content:flex-end; }
    .msg-row.inbound { justify-content:flex-start; }

    .msg-bubble {
      max-width:min(68%, 680px); padding:6px 7px 8px 9px; border-radius:7.5px; font-size:.875rem; line-height:1.38;
      position:relative; word-break:break-word; overflow-wrap:anywhere; min-width:80px;
      box-shadow:0 1px 2px rgba(0,0,0,.25);
    }

    /* INBOUND — neutral dark */
    .msg-row.inbound .msg-bubble {
      background:#1A1A1E; color:#e9edef; border-top-left-radius:0;
    }
    .msg-row.inbound .msg-bubble::before {
      content:''; position:absolute; top:0; left:-7px;
      border-right:7px solid #1A1A1E; border-bottom:7px solid transparent;
    }
    .msg-row.inbound.consecutive .msg-bubble { border-top-left-radius:7.5px; }
    .msg-row.inbound.consecutive .msg-bubble::before { display:none; }

    /* OUTBOUND EQUIPE — deep dark with subtle border */
    .msg-row.outbound.manual .msg-bubble {
      background:#111114; color:#e9edef; border-top-right-radius:0;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .msg-row.outbound.manual .msg-bubble::before {
      content:''; position:absolute; top:0; right:-7px;
      border-left:7px solid #111114; border-bottom:7px solid transparent;
    }
    .msg-row.outbound.manual.consecutive .msg-bubble { border-top-right-radius:7.5px; }
    .msg-row.outbound.manual.consecutive .msg-bubble::before { display:none; }

    /* OUTBOUND MILA — dark amber/gold-tinted */
    .msg-row.outbound:not(.manual) .msg-bubble {
      background:#1e1600; color:#e8d080; border-top-right-radius:0;
      border: 1px solid rgba(255,215,0,0.15);
    }
    .msg-row.outbound:not(.manual) .msg-bubble::before {
      content:''; position:absolute; top:0; right:-7px;
      border-left:7px solid #1e1600; border-bottom:7px solid transparent;
    }
    .msg-row.outbound:not(.manual).consecutive .msg-bubble { border-top-right-radius:7.5px; }
    .msg-row.outbound:not(.manual).consecutive .msg-bubble::before { display:none; }

    /* ═══════════ LIGHT MODE OVERRIDES ═══════════ */
    [data-theme="light"] .chat-root { background: #fdfdfd; }
    [data-theme="light"] .chat-list-panel { background: #f9f9fb; border-right: 1px solid #e5e5eb; }
    [data-theme="light"] .chat-sidebar-header { background: #fdfdfd; border-bottom: 1px solid #e5e5eb; }
    [data-theme="light"] .chat-sidebar-title { color: #111; }
    [data-theme="light"] .csb { color: #888; }
    [data-theme="light"] .csb:hover { background: rgba(251,191,36,0.12); color: #B48600; }
    [data-theme="light"] .chat-search-wrap { background: #f9f9fb; }
    [data-theme="light"] .chat-search-inner { background: #fff; border: 1px solid #ddd; }
    [data-theme="light"] .chat-search-inner input { color: #111; }
    [data-theme="light"] .chat-new-convo-btn { color:#111; }
    [data-theme="light"] .chat-lead-card { background: transparent; border-bottom: 1px solid #edf0f2; }
    [data-theme="light"] .chat-lead-card:hover { background: #f3f4f6; }
    [data-theme="light"] .chat-lead-card.active { background: #fff; border-left: 3px solid #FBBF24; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    [data-theme="light"] .lead-name { color: #111; }
    [data-theme="light"] .lead-msg { color: #666; }
    [data-theme="light"] .lead-time { color: #888; }
    [data-theme="light"] .chat-header { background: #fdfdfd; border-bottom: 1px solid #e5e5eb; }
    [data-theme="light"] .chat-title-main { color: #111; }
    [data-theme="light"] .chat-title-sub { color: #666; }
    [data-theme="light"] .chat-messages { background: #f4f4f7; }
    [data-theme="light"] .msg-bubble { box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    [data-theme="light"] .msg-row.inbound .msg-bubble { background: #fff; color: #111; border: 1px solid #eaeaea; }
    [data-theme="light"] .msg-row.inbound .msg-bubble::before { border-right-color: #fff; }
    [data-theme="light"] .msg-row.outbound.manual .msg-bubble { background: #fffdf5; color: #333; border: 1px solid rgba(251,191,36,0.3); }
    [data-theme="light"] .msg-row.outbound.manual .msg-bubble::before { border-left-color: #fffdf5; }
    [data-theme="light"] .msg-row.outbound:not(.manual) .msg-bubble { background: #fffbeb; color: #555; border: 1px solid #fde68a; }
    [data-theme="light"] .msg-row.outbound:not(.manual) .msg-bubble::before { border-left-color: #fffbeb; }
    [data-theme="light"] .chat-bottom-bar { background: #fdfdfd; border-top: 1px solid #e5e5eb; }
    [data-theme="light"] .chat-composer-wrap { background: #fff; border: 1px solid #ddd; }
    [data-theme="light"] .chat-composer { color: #111; }
    [data-theme="light"] .cw-btn { color: #888; }
    [data-theme="light"] .cw-btn:hover { background: #f5f5f5; color: #333; }
    [data-theme="light"] .cw-btn.send-btn { background: #FBBF24; color: #000; border: none; }
    [data-theme="light"] .cw-btn.send-btn:hover { background: #F59E0B; }


    .msg-content { white-space:pre-wrap; padding-right:56px; min-height:18px; word-break:break-word; overflow-wrap:anywhere; }

    .msg-meta {
      font-size:.6875rem; color:rgba(255,255,255,.32); display:inline-flex; gap:3px; align-items:center;
      float:right; margin:4px 0 -4px 8px; position:relative;
    }
    .msg-double-check { display:flex; align-items:center; opacity:.5; }

    .msg-sender-name { font-size:.7rem; font-weight:600; margin-bottom:3px; letter-spacing:.01em; }
    .msg-row.inbound .msg-sender-name { color:#a8a8b8; }
    .msg-row.outbound.manual .msg-sender-name { color:#7096c8; }
    .msg-row.outbound:not(.manual) .msg-sender-name { color:#c8a400; }

    .msg-audio-indicator { display:flex; align-items:center; gap:6px; }
    .msg-audio-indicator::before { content:'🎵'; }

    /* Rich media messages */
    .msg-audio-player {
      display:flex; align-items:center; gap:8px; min-width:200px;
    }
    .msg-audio-stack { display:flex; flex-direction:column; gap:8px; min-width:min(260px, 70vw); }
    .msg-transcription {
      border-left:3px solid rgba(255,215,0,.65); background:rgba(255,215,0,.06);
      border-radius:0 7px 7px 0; padding:7px 9px; line-height:1.38;
    }
    .msg-transcription-label {
      display:block; color:#FFD700; font-size:.68rem; font-weight:700; margin-bottom:3px;
      text-transform:uppercase; letter-spacing:.04em;
    }
    .msg-image-wrap {
      cursor:pointer; line-height:0; border-radius:8px; overflow:hidden;
    }
    .msg-image-wrap img { display:block; border-radius:8px; transition:opacity .15s; }
    .msg-image-wrap img:hover { opacity:.88; }
    .msg-content a { color:#FFD700; }

    .messages-date-divider { display:flex; justify-content:center; margin:14px 0; user-select:none; }
    .messages-date-divider span {
      background:#141418; color:#5a5a72; font-size:.74rem;
      padding:5px 12px; border-radius:7.5px; border:1px solid #1e1e28;
    }
    .msg-system-divider { display:flex; justify-content:center; margin:10px 0; user-select:none; }
    .msg-system-divider span {
      background:rgba(255,215,0,0.06); color:#d4a017; font-size:.72rem;
      padding:5px 14px; border-radius:7.5px; border:1px solid rgba(255,215,0,0.15);
      letter-spacing:0.01em;
    }
    .msg-system-divider small { color:#8a7535; margin-left:6px; }

    /* ═══════════ BOTTOM COMPOSER ═══════════ */
    .chat-bottom-bar {
      display:grid; grid-template-columns:42px minmax(0, 1fr) 42px; align-items:end; gap:6px; padding:8px 24px 8px 10px;
      background:#141418; border-top:1px solid #1e1e28; flex-shrink:0; min-height:58px;
      min-width:0; width:100%; box-sizing:border-box;
    }
    .cbb {
      width:42px; height:42px; border-radius:50%; border:none; background:transparent;
      color:#5a5a72; cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition:color .12s; flex-shrink:0; padding:0;
    }
    .cbb:hover { color:#FFD700; }
    .cbb:disabled { opacity:.3; cursor:not-allowed; }
    .cbb-inner { width:34px; height:34px; }

    .chat-composer {
      display:flex; align-items:flex-end; gap:4px;
      background:#1c1c26; border-radius:8px; border:1px solid #1e1e28;
      padding:4px 8px; min-height:38px; min-width:0; width:100%; box-sizing:border-box; transition:border-color .12s;
    }
    .chat-composer:focus-within { border-color:rgba(255,215,0,.25); }
    .chat-composer textarea {
      flex:1 1 0; min-width:0; background:transparent; border:none; color:#e9edef; font-size:.93rem;
      resize:none; outline:none; max-height:100px; line-height:1.38; padding:6px 4px;
      font-family:inherit;
    }
    .chat-composer textarea::placeholder { color:#5a5a72; }
    .chat-composer textarea:disabled { opacity:.35; cursor:not-allowed; }

    /* Send button: gold when active */
    .chat-send-btn {
      width:42px; height:42px; border-radius:50%; border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center; flex-shrink:0;
      justify-self:end; box-sizing:border-box;
      transition:all .15s;
    }
    .chat-send-btn.empty { background:transparent; color:#5a5a72; }
    .chat-send-btn:not(.empty) { background:#FFD700; color:#0a0a0c; }
    .chat-send-btn:not(.empty):hover { background:#ffe033; box-shadow:0 0 12px rgba(255,215,0,.3); }
    .chat-send-btn:disabled { opacity:.3; cursor:not-allowed; }
    .chat-send-btn.recording {
      background:#f87171; color:#fff; box-shadow:0 0 0 6px rgba(248,113,113,.12);
      animation:recordPulse 1.1s ease-in-out infinite;
    }
    @keyframes recordPulse {
      0%,100% { transform:scale(1); }
      50% { transform:scale(1.04); }
    }

    /* ═══════════ TEMPLATE MODAL ═══════════ */
    .chat-template-overlay {
      position:absolute; inset:0; background:rgba(0,0,0,.7); backdrop-filter:blur(6px);
      z-index:100; display:flex; align-items:center; justify-content:center;
    }
    @keyframes modalSlide { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
    .chat-template-modal {
      background:#141418; border:1px solid rgba(255,215,0,.15); border-radius:14px;
      width:100%; max-width:440px; margin:16px; overflow:hidden;
      box-shadow:0 20px 60px rgba(0,0,0,.6); animation:modalSlide .2s ease;
    }
    .chat-template-modal-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:16px 20px; border-bottom:1px solid #1e1e28;
      font-weight:600; font-size:.92rem; color:#e9edef;
    }
    .chat-template-modal-header button {
      background:none; border:none; color:#5a5a72; font-size:1.2rem; cursor:pointer;
      line-height:1; padding:4px 8px; border-radius:6px; transition:all .12s;
    }
    .chat-template-modal-header button:hover { color:#e9edef; background:rgba(255,255,255,.06); }
    .chat-template-modal-body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
    .chat-template-lead-name { font-size:.8rem; color:#5a5a72; margin:0 0 4px; }
    .chat-template-list {
      display:flex; flex-direction:column; gap:8px; max-height:300px; overflow-y:auto;
      scrollbar-width:thin; scrollbar-color:rgba(255,215,0,.08) transparent;
    }
    .chat-tpl-card {
      background:#1c1c26; border:1px solid #1e1e28;
      border-radius:10px; padding:12px 14px; cursor:pointer; transition:all .15s;
    }
    .chat-tpl-card:hover { background:#22222e; border-color:rgba(255,215,0,.2); }
    .chat-tpl-card.selected { background:rgba(255,215,0,.08); border-color:rgba(255,215,0,.4); }
    .chat-tpl-name { font-weight:600; font-size:.82rem; color:#e9edef; margin-bottom:4px; }
    .chat-tpl-preview { font-size:.76rem; color:#5a5a72; line-height:1.5; white-space:pre-wrap; }
    .chat-template-modal-footer {
      padding:14px 20px; border-top:1px solid #1e1e28;
      display:flex; gap:8px; justify-content:flex-end;
    }
    .chat-tpl-cancel {
      background:transparent; border:1px solid #1e1e28;
      color:#5a5a72; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:.8rem; transition:all .15s;
    }
    .chat-tpl-cancel:hover { background:#22222e; color:#a8a8b8; }
    .chat-tpl-send {
      background:#FFD700; border:none; color:#0a0a0c;
      font-weight:700; padding:8px 20px; border-radius:8px; cursor:pointer; font-size:.82rem;
      transition:all .12s;
    }
    .chat-tpl-send:disabled { opacity:.35; cursor:not-allowed; }
    .chat-tpl-send:not(:disabled):hover { background:#ffe033; box-shadow:0 4px 16px rgba(255,215,0,.25); }

    .chat-profile-overlay {
      position:absolute; inset:0; z-index:70; background:rgba(0,0,0,.42);
      display:flex; justify-content:flex-end;
    }
    .chat-profile-drawer {
      width:min(360px, 92vw); height:100%; background:#141418; border-left:1px solid #252532;
      box-shadow:-18px 0 40px rgba(0,0,0,.35); display:flex; flex-direction:column;
      animation:profileDrawerIn .16s ease;
    }
    @keyframes profileDrawerIn { from{transform:translateX(22px);opacity:.85} to{transform:none;opacity:1} }
    .chat-profile-header {
      height:56px; padding:0 16px; display:flex; align-items:center; justify-content:space-between;
      border-bottom:1px solid #252532; color:#e9edef; font-weight:700;
    }
    .chat-profile-header button {
      width:34px; height:34px; border-radius:50%; border:none; background:transparent; color:#a8a8b8;
      cursor:pointer; font-size:1rem;
    }
    .chat-profile-header button:hover { background:rgba(255,255,255,.06); color:#fff; }
    .chat-profile-body { overflow:auto; padding:20px 18px 28px; }
    .chat-profile-hero { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; margin-bottom:20px; }
    .chat-profile-avatar {
      width:88px; height:88px; border-radius:50%; overflow:hidden; display:flex; align-items:center; justify-content:center;
      color:#0a0a0c; font-size:1.9rem; font-weight:800; position:relative;
      border:2px solid rgba(255,215,0,.22);
    }
    .chat-profile-name { color:#fff; font-size:1.15rem; font-weight:750; margin-top:4px; }
    .chat-profile-phone { color:#8696a0; font-size:.84rem; }
    .chat-profile-section { border-top:1px solid #252532; padding-top:14px; margin-top:14px; }
    .chat-profile-section-title {
      color:#5a5a72; font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px;
    }
    .chat-profile-field { display:flex; justify-content:space-between; gap:12px; padding:7px 0; }
    .chat-profile-label { color:#8696a0; font-size:.78rem; flex-shrink:0; }
    .chat-profile-value { color:#e9edef; font-size:.84rem; text-align:right; overflow-wrap:anywhere; }
    .chat-profile-bio {
      background:#101014; border:1px solid #252532; border-radius:8px; color:#d1d5db;
      padding:10px 12px; font-size:.84rem; line-height:1.5; white-space:pre-wrap;
    }

    /* Section separator in leads list */
    .chat-section-label {
      padding:7px 14px; font-size:.68rem; color:#3a3a4a; text-transform:uppercase;
      letter-spacing:.7px; font-weight:600;
    }

    /* ═══════════ RESPONSIVE ═══════════ */
    @media (max-width: 1280px) {
      .chat-list-panel { width:280px; min-width:235px; max-width:280px; }
      .msg-bubble { max-width:min(72%, 620px); }
    }

    @media (max-width: 768px) {
      .chat-list-panel { width:100%; max-width:100%; position:absolute; z-index:10; height:100%; background:#0f0f10; }
      .chat-list-panel.collapsed { width:0; }
      .chat-panel { position:relative; }
      .chat-back-btn { display:flex !important; }
      .chat-messages { padding:12px 16px; }
      .chat-bottom-bar { padding:8px 8px; }
      .chat-composer { min-height:34px; }
      .chat-sidebar-expand-fab { top:14px; left:14px; transform:none; }
    }
    @media (max-width: 390px) {
      .chat-messages { padding:8px 10px; }
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
  const { data: leads, error } = await window._sb
    .from('leads')
    .select('id, name, phone, email, type, source, inbox_status, inbox_priority, has_responded, llm_lock_until, wa_window_expires_at, last_message_at, created_at, decisao, culto, batizado, gc_status, melhor_horario, cidade, estado, pais, tags, bot_context, task_meta, chat_pinned, chat_pinned_at, profile_photo_url, bio')
    .eq('workspace_id', chatState.workspaceId)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[Chat] loadLeads error:', error);
    const container = document.getElementById('chat-leads-list');
    if (container) {
      container.innerHTML = '<div class="chat-list-loading" style="padding:40px 20px;">Erro ao carregar conversas</div>';
    }
    return;
  }

  chatState.leads = (leads ?? []).map(l => ({
    ...l,
    inbox_status: l.inbox_status || 'neutral',
    inbox_priority: l.inbox_priority || 'none',
    chat_pinned: !!l.chat_pinned,
  }));
  renderLeadsList();
  updateSidebarBadge();
}

// ── Avatar color palette (deterministic per lead) ──
const AVATAR_COLORS = [
  '#25D366', '#00a884', '#53bdeb', '#7c90db', '#e67e73',
  '#e6a050', '#d4cf59', '#a8d86e', '#6ec4d8', '#c990db',
];
function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (name || '').charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getLeadInitials(lead) {
  return (lead?.name || lead?.phone || 'V')
    .split(' ')
    .map(w => w?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'V';
}

function getLeadPhotoUrl(lead) {
  return lead?.profile_photo_url
    || lead?.bot_context?.profile_photo_url
    || lead?.bot_context?.photo_url
    || lead?.task_meta?.profile_photo_url
    || lead?.task_meta?.photo_url
    || '';
}

function getLeadBio(lead) {
  return lead?.bio
    || lead?.bot_context?.bio
    || lead?.bot_context?.description
    || lead?.task_meta?.bio
    || lead?.task_meta?.description
    || '';
}

function chatPhoneKey(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function leadTimeValue(lead, field) {
  const value = lead?.[field];
  return value ? new Date(value).getTime() || 0 : 0;
}

function maxIso(leads, field) {
  const latest = Math.max(0, ...(leads || []).map(l => leadTimeValue(l, field)));
  return latest ? new Date(latest).toISOString() : null;
}

function conversationLeadsFor(seedLead) {
  if (!seedLead) return [];
  const key = chatPhoneKey(seedLead.phone);
  if (!key) return [seedLead];
  return chatState.leads.filter(l => chatPhoneKey(l.phone) === key);
}

function conversationLeadIdsFor(seedLead) {
  return [...new Set(conversationLeadsFor(seedLead).map(l => l.id).filter(Boolean))];
}

function primaryLeadFor(leads) {
  return [...(leads || [])].sort((a, b) =>
    (leadTimeValue(b, 'last_message_at') || leadTimeValue(b, 'created_at')) -
    (leadTimeValue(a, 'last_message_at') || leadTimeValue(a, 'created_at'))
  )[0] || null;
}

function mergedConversationLead(leads) {
  const primary = primaryLeadFor(leads);
  if (!primary) return null;
  const leadIds = [...new Set(leads.map(l => l.id).filter(Boolean))];
  const highlighted = leads.some(l => l.inbox_status === 'highlighted');
  const archived = leads.every(l => l.inbox_status === 'archived');
  const latestLock = maxIso(leads, 'llm_lock_until');
  const latestWindow = maxIso(leads, 'wa_window_expires_at');
  const latestMessage = maxIso(leads, 'last_message_at') || primary.last_message_at;
  const pinnedAt = maxIso(leads, 'chat_pinned_at');
  const priorityLead = leads.find(l => l.inbox_priority && l.inbox_priority !== 'none') || primary;
  const profileLead = leads.find(l => getLeadPhotoUrl(l) || getLeadBio(l) || l.email) || primary;

  return {
    ...primary,
    inbox_status: highlighted ? 'highlighted' : (archived ? 'archived' : (primary.inbox_status || 'neutral')),
    inbox_priority: priorityLead.inbox_priority || 'none',
    has_responded: leads.every(l => !!l.has_responded),
    llm_lock_until: latestLock || primary.llm_lock_until,
    wa_window_expires_at: latestWindow || primary.wa_window_expires_at,
    last_message_at: latestMessage,
    chat_pinned: leads.some(l => !!l.chat_pinned),
    chat_pinned_at: pinnedAt || primary.chat_pinned_at,
    profile_photo_url: profileLead.profile_photo_url || primary.profile_photo_url,
    bio: profileLead.bio || primary.bio,
    email: profileLead.email || primary.email,
    bot_context: profileLead.bot_context || primary.bot_context,
    task_meta: profileLead.task_meta || primary.task_meta,
    _conversationLeadIds: leadIds,
    _conversationLeads: leads,
  };
}

function conversationLeadForId(leadId) {
  const seed = chatState.leads.find(l => l.id === leadId);
  return mergedConversationLead(conversationLeadsFor(seed));
}

function selectedConversationLead() {
  if (!chatState.selectedLeadId) return null;
  return conversationLeadForId(chatState.selectedLeadId);
}

function conversationGroups() {
  const groups = new Map();
  for (const lead of chatState.leads) {
    const key = chatPhoneKey(lead.phone) || lead.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(lead);
  }
  return Array.from(groups.values()).map(mergedConversationLead).filter(Boolean);
}

function avatarInnerHtml(lead) {
  const initials = escapeHtml(getLeadInitials(lead));
  const photo = getLeadPhotoUrl(lead);
  if (!photo) return `<span class="avatar-fallback">${initials}</span>`;
  const safePhoto = escapeHtml(photo);
  return `<span class="avatar-fallback">${initials}</span><img src="${safePhoto}" alt="" loading="lazy" onerror="this.parentElement.classList.remove('has-photo');this.remove()">`;
}

function setAvatarElement(el, lead) {
  if (!el) return;
  const photo = getLeadPhotoUrl(lead);
  el.classList.toggle('has-photo', !!photo);
  el.style.background = getAvatarColor(lead?.name || lead?.phone || '');
  el.innerHTML = avatarInnerHtml(lead);
}

function renderLeadsList() {
  const container = document.getElementById('chat-leads-list');
  if (!container) return;

  const searchVal = (document.getElementById('chat-search')?.value ?? '').toLowerCase();
  let leads = conversationGroups().filter(l => {
    const haystack = (l._conversationLeads || [l])
      .map(item => `${item.name || ''} ${item.phone || ''}`)
      .join(' ')
      .toLowerCase();
    if (searchVal && !haystack.includes(searchVal)) return false;
    switch (chatState.filter) {
      case 'highlighted': return l.inbox_status === 'highlighted';
      case 'responded': return l.has_responded;
      case 'no-response': return !l.has_responded && l.inbox_status !== 'archived';
      case 'archived': return l.inbox_status === 'archived';
      default: return l.inbox_status !== 'archived';
    }
  });

  // Also collect archived count (always, for the sidebar button)
  const archivedCount = conversationGroups().filter(l => l.inbox_status === 'archived').length;
  const archiveBtn = document.getElementById('chat-archive-filter-btn');
  if (archiveBtn) {
    archiveBtn.classList.toggle('active-filter', chatState.filter === 'archived');
  }

  if (!leads.length) {
    container.innerHTML = `<div class="chat-list-loading" style="padding:40px 20px;">
      ${chatState.filter === 'archived' ? '📦 Nenhuma conversa arquivada' : 'Nenhuma conversa encontrada'}
    </div>`;
    return;
  }

  leads.sort((a, b) => {
    if (!!a.chat_pinned !== !!b.chat_pinned) return b.chat_pinned ? 1 : -1;
    const pinA = a.chat_pinned_at ? new Date(a.chat_pinned_at).getTime() : 0;
    const pinB = b.chat_pinned_at ? new Date(b.chat_pinned_at).getTime() : 0;
    if (pinA !== pinB) return pinB - pinA;
    return new Date(b.last_message_at || b.created_at || 0) - new Date(a.last_message_at || a.created_at || 0);
  });

  container.innerHTML = leads.map(buildLeadCard).join('');
}

function buildLeadCard(lead) {
  const isActive = chatPhoneKey(lead.phone) === chatState.selectedPhoneKey || lead.id === chatState.selectedLeadId;
  const isPinned = !!lead.chat_pinned;
  const windowOpen = lead.wa_window_expires_at && new Date(lead.wa_window_expires_at) > new Date();
  const timeAgo = lead.last_message_at ? formatTimeAgo(lead.last_message_at) : '';
  const unreadCount = !lead.has_responded ? 1 : 0;
  const avatarBg = getAvatarColor(lead.name || lead.phone || '');
  const hasPhoto = !!getLeadPhotoUrl(lead);
  const mergedCount = lead._conversationLeadIds?.length || 1;
  const mergedBadge = mergedCount > 1
    ? `<span class="lead-merge-badge" title="Cadastros unidos por WhatsApp">${mergedCount}</span>`
    : '';

  // Build last message preview
  const lastMsgPreview = lead._lastPreview || lead.phone || 'Toque para conversar';
  const hasUnread = unreadCount > 0;

  return `
  <div class="chat-lead-card ${isActive ? 'active' : ''}"
       id="lead-card-${lead.id}" onclick="selectLead('${lead.id}')">
    <div class="lead-avatar-wrap">
      <div class="lead-avatar ${hasPhoto ? 'has-photo' : ''}" style="background:${avatarBg};">${avatarInnerHtml(lead)}</div>
      ${windowOpen ? '<span class="lead-window-dot" title="Janela 24h aberta"></span>' : ''}
    </div>
    <div class="lead-card-body">
      <div class="lead-card-row">
        <span class="lead-card-name">${escapeHtml(lead.name || 'Visitante')}${mergedBadge}</span>
        <span class="lead-card-time ${hasUnread ? 'has-unread' : ''}" style="color:${hasUnread ? '#25D366' : '#8696a0'}">${timeAgo}</span>
      </div>
      <div class="lead-card-row lead-card-bottom">
        <span class="lead-card-preview">${isPinned ? '📌 ' : ''}${escapeHtml(lastMsgPreview)}</span>
        <div class="lead-card-badges">
          ${hasUnread ? `<span class="unread-badge">${unreadCount}</span>` : ''}
          ${isPinned && !hasUnread ? '<span class="pin-badge">📌</span>' : ''}
        </div>
      </div>
    </div>
  </div>`;
}

// ─── SELECT LEAD ─────────────────────────────────────────────────────────────
async function selectLead(leadId) {
  let lead = conversationLeadForId(leadId);
  if (!lead) return;
  chatState.selectedLeadId = lead.id;
  chatState.selectedPhoneKey = chatPhoneKey(lead.phone);
  const conversationIds = lead._conversationLeadIds || [lead.id];

  // Update active state
  renderLeadsList();

  // Show chat window
  document.getElementById('chat-empty-state').style.display = 'none';
  const activeEl = document.getElementById('chat-active');
  activeEl.style.display = 'flex';

  // Header
  const avatarEl = document.getElementById('chat-header-avatar');
  setAvatarElement(avatarEl, lead);
  document.getElementById('chat-header-name').textContent = lead.name || 'Visitante';
  const subParts = [lead.phone || '', lead.type === 'saved' ? 'Consolidação' : 'Visitante'];
  document.getElementById('chat-header-sub').textContent = subParts.filter(Boolean).join(' · ');

  // On mobile, collapse list
  if (window.innerWidth <= 768) {
    document.getElementById('chat-list-panel').classList.add('collapsed');
    document.getElementById('chat-expand-btn').style.display = 'flex';
  }

  // Human lock
  updateLockUI(lead);

  // ── Refresh wa fields from DB (cache may be stale after inbound message) ──
  try {
    const { data: freshLeads } = await window._sb
      .from('leads')
      .select('id, wa_window_expires_at, llm_lock_until, inbox_status, last_message_at, inbox_priority, chat_pinned, chat_pinned_at, profile_photo_url, bio, email, source, cidade, estado, pais, decisao, culto, batizado, gc_status, melhor_horario, tags, bot_context, task_meta')
      .in('id', conversationIds);
    if (freshLeads?.length) {
      freshLeads.forEach(freshLead => {
        const idx = chatState.leads.findIndex(l => l.id === freshLead.id);
        if (idx >= 0) chatState.leads[idx] = Object.assign(chatState.leads[idx], freshLead);
      });
      lead = conversationLeadForId(chatState.selectedLeadId) || lead;
      chatState.selectedLeadId = lead.id;
      chatState.selectedPhoneKey = chatPhoneKey(lead.phone);
      // Re-eval lock UI with fresh data
      setAvatarElement(avatarEl, lead);
      document.getElementById('chat-header-name').textContent = lead.name || 'Visitante';
      document.getElementById('chat-header-sub').textContent = [lead.phone || '', lead.type === 'saved' ? 'Consolidação' : 'Visitante'].filter(Boolean).join(' · ');
      updateLockUI(lead);
    }
  } catch (e) { /* non-fatal */ }

  // Window warning / input toggle
  applyWindowUI(lead);

  // Load messages
  await loadMessages(chatState.selectedLeadId);

  // Check linked task
  await loadLinkedTask(chatState.selectedLeadId, lead.inbox_priority);

  // Subscribe to realtime for this lead
  subscribeToLead(chatState.selectedLeadId);
}

// Track window expire timer so we can clear it
let _windowExpireTimer = null;

function applyWindowUI(lead) {
  const now = new Date();
  const expiresAt = lead.wa_window_expires_at ? new Date(lead.wa_window_expires_at) : null;
  const lastMsg = lead.last_message_at ? new Date(lead.last_message_at) : null;

  // Grace period: if there was an inbound in the last 60 minutes, treat the window as open
  const recentActivity = lastMsg && (now - lastMsg) < 60 * 60 * 1000;
  const windowOpen = (expiresAt && expiresAt > now) || recentActivity;

  const warnEl = document.getElementById('chat-window-warning');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const attachBtn = document.getElementById('chat-attach-btn');
  const tplBtn = document.getElementById('chat-template-btn');

  // Always show the template button — templates RE-OPEN the 24h window
  if (tplBtn) tplBtn.style.display = 'flex';

  // Update archive button visual state
  const archiveBtn = document.getElementById('chat-archive-btn');
  if (archiveBtn) {
    if (lead.inbox_status === 'archived') {
      archiveBtn.classList.add('is-archived');
      archiveBtn.title = 'Reativar conversa';
      archiveBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 12 3 19 21 19 21 12"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
    } else {
      archiveBtn.classList.remove('is-archived');
      archiveBtn.title = 'Arquivar conversa';
      archiveBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
    }
  }

  updatePinButtons(lead);

  // Clear any previous window expire timer
  if (_windowExpireTimer) { clearTimeout(_windowExpireTimer); _windowExpireTimer = null; }

  if (windowOpen) {
    // 24h window is open: full input available
    warnEl.style.display = 'none';
    inputEl.disabled = false;
    sendBtn.disabled = false;
    if (attachBtn) attachBtn.disabled = false;

    // Set auto-expire timer to lock input when window closes
    const effectiveExpiry = expiresAt || (lastMsg ? new Date(lastMsg.getTime() + 24 * 60 * 60 * 1000) : null);
    if (effectiveExpiry) {
      const msUntilExpiry = effectiveExpiry - now;
      if (msUntilExpiry > 0 && msUntilExpiry < 48 * 60 * 60 * 1000) {
        _windowExpireTimer = setTimeout(() => {
          // Re-apply UI to lock the input
          const currentLead = selectedConversationLead();
          if (currentLead) {
            applyWindowUI(currentLead);
            // Inject a system message about window closing
            chatState.messages.push({
              id: crypto.randomUUID(), direction: 'system', type: 'system',
              content: '🔒 Janela de 24h encerrada. Use um template para reabrir.',
              created_at: new Date().toISOString(),
            });
            renderMessages();
          }
        }, msUntilExpiry);
      }
    }
  } else {
    // 24h window closed: show warning + template button, disable free-text input
    warnEl.style.display = 'flex';
    inputEl.disabled = true;
    sendBtn.disabled = true;
    if (attachBtn) attachBtn.disabled = true;
  }
}

async function loadMessages(leadId) {
  const lead = conversationLeadForId(leadId) || chatState.leads.find(l => l.id === leadId);
  const leadIds = lead?._conversationLeadIds || conversationLeadIdsFor(lead);
  if (!leadIds.length) return;
  const { data: msgs } = await window._sb
    .from('messages')
    .select('id, direction, type, content, automated, created_at')
    .in('lead_id', leadIds)
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
  let lastSenderKey = null;

  for (const msg of chatState.messages) {
    const msgDate = new Date(msg.created_at).toLocaleDateString('pt-BR');
    let showDate = false;
    if (msgDate !== lastDate) {
      const isToday = msgDate === new Date().toLocaleDateString('pt-BR');
      const dateText = isToday ? 'Hoje' : msgDate;
      html += `<div class="messages-date-divider"><span>${dateText}</span></div>`;
      lastDate = msgDate;
      showDate = true;
      lastSenderKey = null;
    }

    // System messages (24h window events)
    if (msg.direction === 'system' || msg.type === 'system') {
      const sysTime = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      html += `<div class="msg-system-divider"><span>${escapeHtml(msg.content)} <small>${sysTime}</small></span></div>`;
      lastSenderKey = null;
      continue;
    }

    const currentSenderKey = `${msg.direction}-${msg.automated ? 'auto' : 'manual'}`;
    const isConsecutive = !showDate && currentSenderKey === lastSenderKey;
    lastSenderKey = currentSenderKey;

    html += buildMessageBubble(msg, isConsecutive);
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function parseAudioMessageContent(raw) {
  const text = String(raw || '');
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  const mediaMatch = text.match(/\[MEDIA_ID:\s*([A-Za-z0-9_-]+)\]/i);
  const transcriptMatch = text.match(/\[ÁUDIO TRANSCRITO\]\s*["“]?([\s\S]*?)["”]?(?:\n\[MEDIA_ID:|$)/i)
    || text.match(/\[AUDIO TRANSCRITO\]\s*["“]?([\s\S]*?)["”]?(?:\n\[MEDIA_ID:|$)/i)
    || text.match(/\[ÁUDIO TRANSCRITO\]:\s*([\s\S]*?)(?:\n\[MEDIA_ID:|$)/i);
  const compactRaw = text.trim();
  const mediaId = mediaMatch?.[1]
    || (!urlMatch && /^[A-Za-z0-9_-]{12,}$/.test(compactRaw) ? compactRaw : null);
  let transcription = transcriptMatch?.[1]?.trim() || '';
  transcription = transcription.replace(/\n?\[MEDIA_ID:[\s\S]*$/i, '').replace(/^"|"$/g, '').trim();
  return { audioUrl: urlMatch?.[0] || (compactRaw.startsWith('http') ? compactRaw : null), mediaId, transcription };
}

function buildMessageBubble(msg, isConsecutive) {
  const isOutbound = msg.direction === 'outbound';
  const isManual = isOutbound && !msg.automated;
  const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const rowClass = `msg-row ${isOutbound ? 'outbound' : 'inbound'} ${isManual ? 'manual' : ''} ${isConsecutive ? 'consecutive' : ''}`;

  const type = msg.type || 'text';
  const raw = msg.content || '';

  // Extract URL from content if present (handles "[Imagem: file.jpg] https://..." format)
  const urlMatch = raw.match(/https?:\/\/[^\s]+/);
  const rawUrl = urlMatch ? urlMatch[0] : null;

  let content = '';

  if (type === 'audio' || type === 'voice') {
    const audioInfo = parseAudioMessageContent(raw);
    let player = '';
    if (audioInfo.audioUrl) {
      player = `
        <div class="msg-audio-player">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="flex-shrink:0;opacity:.7;"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
          <audio controls preload="none" style="height:32px;flex:1;min-width:0;accent-color:#FFD700;">
            <source src="${audioInfo.audioUrl}">
            Seu browser não suporta áudio.
          </audio>
        </div>`;
    } else if (audioInfo.mediaId) {
      player = `
        <div class="msg-audio-player" id="ap-${msg.id}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="flex-shrink:0;opacity:.7;"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
          <button onclick="playAudioMessage('${msg.id}','${audioInfo.mediaId}')" style="background:rgba(255,215,0,0.15);border:1px solid rgba(255,215,0,0.3);color:#FFD700;border-radius:20px;padding:4px 14px;cursor:pointer;font-size:.75rem;">▶ Ouvir áudio</button>
        </div>`;
    } else {
      player = `
        <div class="msg-audio-player">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="flex-shrink:0;opacity:.7;"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
          <span style="font-size:.82rem;color:#a8a8b8;">Áudio recebido</span>
        </div>`;
    }
    const transcript = audioInfo.transcription
      ? `<div class="msg-transcription"><span class="msg-transcription-label">Transcrição</span>${escapeHtml(audioInfo.transcription)}</div>`
      : '';
    content = `<div class="msg-audio-stack">${player}${transcript}</div>`;
  } else if (type === 'image') {
    const imgUrl = rawUrl || raw;
    content = `
      <div class="msg-image-wrap">
        <img src="${imgUrl}" alt="Imagem" loading="lazy" onclick="window.open('${imgUrl}','_blank')" style="max-width:260px;max-height:200px;border-radius:8px;cursor:pointer;display:block;object-fit:cover;">
      </div>`;
  } else if (type === 'document' || type === 'file') {
    const docUrl = rawUrl || raw;
    // Extract filename from URL or content
    const fnMatch = raw.match(/\[(?:Imagem|Arquivo|Documento|Áudio|Audio|Vídeo|Video): ([^\]]+)\]/) || raw.match(/([^/]+\.[a-z0-9]{2,5})$/i);
    const fileName = fnMatch ? fnMatch[1] : 'Arquivo';
    content = `
      <a href="${docUrl}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;color:#FFD700;text-decoration:none;">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span style="font-size:.82rem;text-decoration:underline;word-break:break-all;">${escapeHtml(fileName)}</span>
      </a>`;
  } else if (type === 'template') {
    // Show a styled template card with the actual body text
    const tplLabel = raw.match(/^📨 Template: ([\w_]+)$/)?.[1]?.replace(/_/g, ' ') || '';
    const tplBody = raw.replace(/^📨 Template: [\w_]+(\s*\|\s*)?/, '').trim();
    if (tplBody && tplBody !== raw) {
      content = `<div style="border-left:3px solid #FFD700;padding:4px 10px;margin-bottom:4px;border-radius:0 6px 6px 0;background:rgba(255,215,0,0.06);">
        <div style="font-size:.68rem;color:#FFD700;font-weight:600;margin-bottom:3px;">📋 Template${tplLabel ? ': ' + escapeHtml(tplLabel) : ''}</div>
        <div style="font-size:.82rem;color:#d1d5db;line-height:1.4;">${escapeHtml(tplBody)}</div>
      </div>`;
    } else {
      content = `<div style="border-left:3px solid #FFD700;padding:4px 10px;border-radius:0 6px 6px 0;background:rgba(255,215,0,0.06);">
        <div style="font-size:.68rem;color:#FFD700;font-weight:600;margin-bottom:2px;">📋 Template</div>
        <div style="font-size:.82rem;color:#8696a0;font-style:italic;">${escapeHtml(raw)}</div>
      </div>`;
    }
  } else {
    // Plain text — linkify URLs
    content = escapeHtml(raw).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#FFD700;">$1</a>');
  }

  const badge = (!isConsecutive) ? (
    isManual ? '👤 Equipe' :
      (type === 'audio' || type === 'voice') ? '🎵 Áudio' :
        isOutbound ? '🤖 Mila' : ''
  ) : '';

  const doubleCheck = isOutbound ? `<svg viewBox="0 0 16 11" width="16" height="11" fill="none"><path d="M11.07 0L5.43 5.57 2.93 3.06 0 5.97l5.43 5.34L14 2.92z" fill="currentColor" opacity=".5"/><path d="M14.07 0L8.43 5.57 7.5 4.65 4.57 7.56l3.86 3.75L17 2.92z" fill="currentColor" opacity=".5"/></svg>` : '';

  return `
  <div class="${rowClass}">
    <div class="msg-bubble">
      ${badge ? `<div class="msg-sender-name">${badge}</div>` : ''}
      <div class="msg-content">${content}<span class="msg-meta"><span>${time}</span>${doubleCheck ? `<span class="msg-double-check">${doubleCheck}</span>` : ''}</span></div>
    </div>
  </div>`;
}

// ─── LINKED TASK ─────────────────────────────────────────────────────────────
async function loadLinkedTask(leadId, priority) {
  const bannerEl = document.getElementById('chat-task-banner');
  bannerEl.style.display = 'none';
  if (!priority || priority === 'none') return;
  const lead = conversationLeadForId(leadId) || chatState.leads.find(l => l.id === leadId);
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

  const lead = selectedConversationLead();
  if (!lead) return;
  const leadIds = lead._conversationLeadIds || [lead.id];

  const sendBtn = document.getElementById('chat-send-btn');
  sendBtn.disabled = true;
  document.getElementById('chat-send-icon').style.display = 'none';
  document.getElementById('chat-mic-icon').style.display = 'block';
  sendBtn.classList.add('empty');

  const EDGE_URL = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1';

  try {
    const session = (await window._sb.auth.getSession()).data.session;
    const token = session?.access_token;

    const res = await fetch(`${EDGE_URL}/whatsapp-send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspace_id: chatState.workspaceId,
        lead_id: lead.id,
        message: { type: 'text', content: message },
      }),
    });

    const result = await res.json();

    if (res.ok && result.ok !== false) {
      const lockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      input.value = '';
      input.style.height = '';
      // Update in-memory lead so window stays open
      lead.llm_lock_until = lockUntil;
      lead.last_message_at = now;
      lead.wa_window_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      chatState.leads.forEach(l => {
        if (leadIds.includes(l.id)) {
          l.llm_lock_until = lockUntil;
          l.last_message_at = now;
          l.wa_window_expires_at = lead.wa_window_expires_at;
          l.has_responded = true;
        }
      });
      updateLockUI(lead);
      applyWindowUI(lead);
      const msgObj = {
        id: crypto.randomUUID(), direction: 'outbound', type: 'text',
        content: message, automated: false, created_at: now,
      };
      chatState.messages.push(msgObj);
      renderMessages();

      // Persist to DB (separate try-catch to not block UI)
      try {
        await window._sb.from('messages').insert({
          workspace_id: chatState.workspaceId,
          lead_id: lead.id,
          direction: 'outbound', type: 'text',
          content: message, automated: false, responded_at: now,
        });
        await window._sb.from('leads').update({
          llm_lock_until: lockUntil,
          last_message_at: now,
          has_responded: true,
        }).in('id', leadIds);
      } catch (dbErr) {
        console.warn('[Chat] DB persist failed:', dbErr.message);
      }
    } else {
      const errMsg = result.error || result.message || 'Erro ao enviar mensagem.';
      showChatToast(`❌ ${errMsg}`, 'error');
    }
  } catch (e) {
    console.error('[Chat] Send error:', e);
    showChatToast('❌ Erro de conexão com o servidor.', 'error');
  } finally {
    sendBtn.disabled = false;
    autoresizeTextarea(input);
  }
}

async function handleChatSendButton() {
  const input = document.getElementById('chat-input');
  if (input?.value?.trim()) {
    await sendManualMessage();
    return;
  }
  await toggleVoiceRecording();
}

function chooseRecordingMimeType() {
  if (!window.MediaRecorder) return '';
  const preferred = [
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
  return preferred.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function audioExtensionForMime(mimeType) {
  const clean = String(mimeType || '').split(';')[0].toLowerCase();
  if (clean.includes('ogg')) return 'ogg';
  if (clean.includes('mp4') || clean.includes('m4a')) return 'm4a';
  if (clean.includes('mpeg') || clean.includes('mp3')) return 'mp3';
  if (clean.includes('webm')) return 'webm';
  return 'ogg';
}

function setVoiceRecordingUI(isRecording) {
  const btn = document.getElementById('chat-send-btn');
  const input = document.getElementById('chat-input');
  const mic = document.getElementById('chat-mic-icon');
  const send = document.getElementById('chat-send-icon');
  if (btn) {
    btn.classList.toggle('recording', isRecording);
    btn.classList.toggle('empty', !isRecording);
    btn.title = isRecording ? 'Parar e enviar áudio' : 'Enviar mensagem ou gravar áudio';
  }
  if (mic) mic.style.display = isRecording ? 'block' : (input?.value?.trim() ? 'none' : 'block');
  if (send) send.style.display = isRecording ? 'none' : (input?.value?.trim() ? 'block' : 'none');
  if (input) input.placeholder = isRecording ? 'Gravando áudio...' : 'Mensagem';
}

async function toggleVoiceRecording() {
  if (chatState.voiceRecorder?.state === 'recording') {
    chatState.voiceRecorder.stop();
    return;
  }

  if (!chatState.selectedLeadId) return;
  const input = document.getElementById('chat-input');
  if (input?.disabled) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showChatToast('❌ Gravação de áudio não suportada neste navegador.', 'error');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = chooseRecordingMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chatState.voiceRecorder = recorder;
    chatState.voiceStream = stream;
    chatState.voiceChunks = [];
    chatState.voiceRecordingStartedAt = Date.now();

    recorder.ondataavailable = (ev) => {
      if (ev.data?.size) chatState.voiceChunks.push(ev.data);
    };
    recorder.onerror = () => {
      showChatToast('❌ Erro ao gravar áudio.', 'error');
      stopVoiceStream();
      setVoiceRecordingUI(false);
    };
    recorder.onstop = async () => {
      const durationMs = Date.now() - (chatState.voiceRecordingStartedAt || Date.now());
      const recordedType = recorder.mimeType || mimeType || 'audio/ogg';
      const blob = new Blob(chatState.voiceChunks, { type: recordedType });
      stopVoiceStream();
      setVoiceRecordingUI(false);

      if (durationMs < 600 || blob.size < 400) {
        showChatToast('Áudio muito curto.', 'warn');
        return;
      }

      const ext = audioExtensionForMime(recordedType);
      const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: recordedType });
      await sendChatMediaFile(file, { fromRecorder: true });
    };

    recorder.start();
    setVoiceRecordingUI(true);
    showChatToast('Gravando áudio...', 'info');
  } catch (e) {
    setVoiceRecordingUI(false);
    stopVoiceStream();
    showChatToast(`❌ Microfone indisponível: ${e.message}`, 'error');
  }
}

function stopVoiceStream() {
  chatState.voiceStream?.getTracks?.().forEach(track => track.stop());
  chatState.voiceStream = null;
  chatState.voiceRecorder = null;
  chatState.voiceChunks = [];
  chatState.voiceRecordingStartedAt = null;
}

function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManualMessage(); }
}

function autoresizeTextarea(el) {
  if (chatState.voiceRecorder?.state === 'recording') return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';

  const mic = document.getElementById('chat-mic-icon');
  const send = document.getElementById('chat-send-icon');
  const btn = document.getElementById('chat-send-btn');
  if (el.value.trim().length > 0) {
    if (mic) mic.style.display = 'none';
    if (send) send.style.display = 'block';
    if (btn) btn.classList.remove('empty');
  } else {
    if (mic) mic.style.display = 'block';
    if (send) send.style.display = 'none';
    if (btn) btn.classList.add('empty');
  }
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
      document.getElementById('chat-lock-countdown').textContent = `até ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };
    updateCountdown();
    chatState.lockTimers[lead.id] = setInterval(updateCountdown, 1000);
  }
}

async function reactivateAI() {
  if (!chatState.selectedLeadId) return;
  const lead = selectedConversationLead();
  const leadIds = lead?._conversationLeadIds || [chatState.selectedLeadId];
  await window._sb.from('leads').update({ llm_lock_until: null }).in('id', leadIds);
  chatState.leads.forEach(l => { if (leadIds.includes(l.id)) l.llm_lock_until = null; });
  const refreshed = selectedConversationLead();
  if (refreshed) updateLockUI(refreshed);
  showChatToast('✅ IA reativada!', 'success');
}

// ─── ARCHIVE ──────────────────────────────────────────────────────────────────
// Smart archive toggle: archive if active/highlighted, unarchive if archived
async function toggleArchiveCurrentLead() {
  if (!chatState.selectedLeadId) return;
  const lead = selectedConversationLead();
  if (!lead) return;
  const leadIds = lead._conversationLeadIds || [lead.id];

  const isCurrentlyArchived = lead.inbox_status === 'archived';
  const newStatus = isCurrentlyArchived ? 'neutral' : 'archived';

  await window._sb.from('leads').update({ inbox_status: newStatus }).in('id', leadIds);
  chatState.leads.forEach(l => { if (leadIds.includes(l.id)) l.inbox_status = newStatus; });
  lead.inbox_status = newStatus;

  if (newStatus === 'archived') {
    // Remove from view and close chat
    chatState.selectedLeadId = null;
    chatState.selectedPhoneKey = null;
    document.getElementById('chat-empty-state').style.display = 'flex';
    document.getElementById('chat-active').style.display = 'none';
    showChatToast('📦 Conversa arquivada.', 'info');
  } else {
    // Stay on current lead, update button state
    applyWindowUI(lead);
    showChatToast('✅ Conversa reativada.', 'success');
  }

  renderLeadsList();
}

function updatePinButtons(lead) {
  const isPinned = !!lead?.chat_pinned;
  const pinBtn = document.getElementById('chat-pin-btn');

  if (pinBtn) {
    pinBtn.classList.toggle('active', isPinned);
    pinBtn.title = isPinned ? 'Desafixar conversa' : 'Fixar conversa';
  }
}

// Toggle pin on current lead
async function togglePinCurrentLead() {
  if (!chatState.selectedLeadId) return;
  const lead = selectedConversationLead();
  if (!lead) return;
  const leadIds = lead._conversationLeadIds || [lead.id];

  const newPinned = !lead.chat_pinned;
  const pinnedAt = newPinned ? new Date().toISOString() : null;

  const { error } = await window._sb
    .from('leads')
    .update({ chat_pinned: newPinned, chat_pinned_at: pinnedAt })
    .in('id', leadIds);
  if (error) {
    showChatToast(`❌ ${error.message}`, 'error');
    return;
  }

  chatState.leads.forEach(l => {
    if (leadIds.includes(l.id)) {
      l.chat_pinned = newPinned;
      l.chat_pinned_at = pinnedAt;
    }
  });
  updatePinButtons(selectedConversationLead() || lead);
  showChatToast(newPinned ? '📌 Conversa fixada.' : 'Conversa desafixada.', newPinned ? 'success' : 'info');
  renderLeadsList();
}

const toggleHighlightCurrentLead = togglePinCurrentLead;

// ─── REALTIME ─────────────────────────────────────────────────────────────────
function _setRealtimeStatus(status) {
  // status: 'connecting' | 'connected' | 'reconnecting' | 'error'
  const dot = document.getElementById('chat-realtime-dot');
  if (!dot) return;
  const colors = { connecting: '#fbbf24', connected: '#4ade80', reconnecting: '#f59e0b', error: '#f87171' };
  dot.style.background = colors[status] || '#666';
  dot.title = status === 'connected' ? 'Tempo real ativo' : status === 'error' ? 'Reconectando...' : 'Conectando...';
}

function setupRealtime() {
  if (chatState.realtimeChannel) {
    window._sb.removeChannel(chatState.realtimeChannel);
    chatState.realtimeChannel = null;
  }

  _setRealtimeStatus('connecting');

  chatState.realtimeChannel = window._sb
    .channel(`chat-workspace-${chatState.workspaceId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages',
      filter: `workspace_id=eq.${chatState.workspaceId}`
    }, (payload) => {
      const msg = payload.new;
      // Update lead state
      const lead = chatState.leads.find(l => l.id === msg.lead_id);
      const selectedIds = selectedConversationLead()?._conversationLeadIds || [];
      if (lead) {
        const hadWindowBefore = lead.wa_window_expires_at && new Date(lead.wa_window_expires_at) > new Date();
        lead.last_message_at = msg.created_at;
        // If inbound, refresh the 24h window so input unlocks without reload
        if (msg.direction === 'inbound') {
          const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
          lead.wa_window_expires_at = newExpiry.toISOString();
          if (selectedIds.includes(msg.lead_id)) {
            const activeLead = selectedConversationLead() || lead;
            applyWindowUI(activeLead);
            // If window was previously closed (or first inbound), inject a system message
            if (!hadWindowBefore) {
              const expiryTime = newExpiry.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              chatState.messages.push({
                id: crypto.randomUUID(), direction: 'system', type: 'system',
                content: `🔓 Janela de 24h aberta — expira às ${expiryTime}`,
                created_at: new Date().toISOString(),
              });
            }
          }
        }
      }
      // If this lead is open, add message live
      if (selectedIds.includes(msg.lead_id)) {
        // Avoid duplicates from optimistic inserts (check by id OR by content+direction within 3s)
        const isDupe = chatState.messages.find(m =>
          m.id === msg.id ||
          (m.direction === msg.direction && m.content === msg.content &&
            Math.abs(new Date(m.created_at) - new Date(msg.created_at)) < 3000)
        );
        if (!isDupe) {
          chatState.messages.push(msg);
          renderMessages();
        }
      }
      renderLeadsList();
      updateSidebarBadge();
      loadKPIs();
    })
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        _setRealtimeStatus('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
        _setRealtimeStatus('error');
        // Auto-reconnect after 5 seconds
        setTimeout(() => {
          if (chatState.workspaceId) setupRealtime();
        }, 5000);
      } else if (status === 'CLOSED') {
        _setRealtimeStatus('reconnecting');
        setTimeout(() => {
          if (chatState.workspaceId) setupRealtime();
        }, 3000);
      }
    });
}

function subscribeToLead(leadId) {
  // Already covered by workspace-level subscription
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function toggleChatSidebar() {
  chatState.sidebarCollapsed = !chatState.sidebarCollapsed;
  const panel = document.getElementById('chat-list-panel');
  const fab = document.getElementById('chat-sidebar-expand-fab');
  panel.classList.toggle('collapsed', chatState.sidebarCollapsed);
  if (fab) fab.style.display = chatState.sidebarCollapsed ? 'flex' : 'none';
}

// ─── FILTERS ───────────────────────────────────────────────────────────────────
function setChatFilter(filter, btn) {
  // Toggle behavior for archive button
  if (filter === 'archived' && chatState.filter === 'archived') {
    chatState.filter = 'all';
  } else {
    chatState.filter = filter;
  }
  // Active state for broadcast modal tabs only
  if (btn?.closest('#broadcast-audience-chips')) {
    document.querySelectorAll('#broadcast-audience-chips .chat-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
  }
  renderLeadsList();
}

function filterLeadsList() { renderLeadsList(); }

// ─── SIDEBAR BADGE ────────────────────────────────────────────────────────────
function updateSidebarBadge() {
  const highlighted = conversationGroups().filter(l => l.inbox_status === 'highlighted').length;
  const badge = document.getElementById('chat-unread-badge');
  if (!badge) return;
  badge.textContent = highlighted;
  badge.style.display = highlighted > 0 ? 'inline-flex' : 'none';
}

function profileField(label, value) {
  const display = value === null || value === undefined || value === '' ? '—' : value;
  return `
    <div class="chat-profile-field">
      <span class="chat-profile-label">${escapeHtml(label)}</span>
      <span class="chat-profile-value">${escapeHtml(display)}</span>
    </div>`;
}

function formatProfileDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function openLeadProfileDrawer() {
  if (!chatState.selectedLeadId) return;
  const lead = selectedConversationLead();
  if (!lead) return;

  const overlay = document.getElementById('chat-profile-overlay');
  const body = document.getElementById('chat-profile-body');
  if (!overlay || !body) return;

  const bio = getLeadBio(lead) || 'Sem bio cadastrada.';
  const hasPhoto = !!getLeadPhotoUrl(lead);
  const avatarBg = getAvatarColor(lead.name || lead.phone || '');
  const tags = Array.isArray(lead.tags) && lead.tags.length ? lead.tags.join(', ') : '';
  const location = [lead.cidade, lead.estado, lead.pais].filter(Boolean).join(', ');
  const source = lead.source || lead.type || 'whatsapp';
  const status = lead.chat_pinned ? 'Fixada' : lead.inbox_status === 'archived' ? 'Arquivada' : 'Ativa';

  body.innerHTML = `
    <div class="chat-profile-hero">
      <div class="chat-profile-avatar ${hasPhoto ? 'has-photo' : ''}" style="background:${avatarBg};">${avatarInnerHtml(lead)}</div>
      <div class="chat-profile-name">${escapeHtml(lead.name || 'Visitante')}</div>
      <div class="chat-profile-phone">${escapeHtml(lead.phone || 'Sem telefone')}</div>
    </div>

    <div class="chat-profile-section">
      <div class="chat-profile-section-title">Bio</div>
      <div class="chat-profile-bio">${escapeHtml(bio)}</div>
    </div>

    <div class="chat-profile-section">
      <div class="chat-profile-section-title">Dados</div>
      ${profileField('Nome', lead.name || 'Visitante')}
      ${profileField('Telefone', lead.phone)}
      ${profileField('Email', lead.email)}
      ${profileField('Origem', source)}
      ${profileField('Status', status)}
      ${profileField('Localização', location)}
      ${profileField('Tags', tags)}
    </div>

    <div class="chat-profile-section">
      <div class="chat-profile-section-title">Consolidação</div>
      ${profileField('Decisão', lead.decisao)}
      ${profileField('Culto', lead.culto)}
      ${profileField('Batizado', lead.batizado)}
      ${profileField('GC', lead.gc_status)}
      ${profileField('Melhor horário', lead.melhor_horario)}
      ${profileField('Criado em', formatProfileDate(lead.created_at))}
      ${profileField('Última mensagem', formatProfileDate(lead.last_message_at))}
    </div>`;
  overlay.style.display = 'flex';
}

function closeLeadProfileDrawer() {
  const overlay = document.getElementById('chat-profile-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
function attachChatEvents() {
  // Nothing extra needed — all events are inline
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
const EDGE_URL_CHAT = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1';

let _selectedTemplate = null; // { name, language_code, body_text, variables_count }

// Extract readable body text from a Meta template's component array
function extractTemplateBody(components) {
  const body = (components || []).find(c => c.type === 'BODY');
  return body?.text || '';
}

// Count how many template variables exist — {{name}}, {{1}}, etc.
// NOTE: Meta's {{}} (empty braces) = 0 params, do NOT count those
function countTemplateVars(text) {
  const matches = text.match(/\{\{[^{}]+\}\}/g);
  return matches ? matches.length : 0;
}

// Extract variable names/labels from template body for display in input fields
function extractTemplateVarNames(text) {
  const matches = text.match(/\{\{([^{}]+)\}\}/g) || [];
  return matches.map(m => m.replace(/\{\{|\}\}/g, '').trim());
}

// Check if a variable name is a named param (not a numeric positional like "1" or "2")
function isNamedParam(varName) {
  return varName && !/^\d+$/.test(varName);
}

// Interpolate variable placeholders for preview display only
function interpolatePreview(text, vars) {
  let out = text;
  // Replace proper {{1}}, {{2}}... style
  (vars || []).forEach((v, i) => { out = out.replace(`{{${i + 1}}}`, v); });
  // Display {{}} as [nome] for preview purposes (but send 0 vars to Meta)
  out = out.replace(/\{\{\}\}/g, vars?.[0] ? `[${vars[0]}]` : '[nome]');
  return out;
}

async function openTemplateModal() {
  if (!chatState.selectedLeadId) return;
  const lead = chatState.leads.find(l => l.id === chatState.selectedLeadId);
  _selectedTemplate = null;

  const nameEl = document.getElementById('tpl-lead-name');
  if (nameEl) nameEl.textContent = `Para: ${lead?.name || 'Lead'}`;

  const sendBtn = document.getElementById('chat-tpl-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Enviar Template ✓'; }

  const listEl = document.getElementById('chat-template-list');
  if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#666;font-size:.82rem;">Carregando templates...</div>';

  const overlay = document.getElementById('chat-template-overlay');
  if (overlay) overlay.style.display = 'flex';

  // Fetch approved templates via Edge Function (Meta Graph API)
  try {
    const session = (await window._sb.auth.getSession()).data.session;
    const res = await fetch(`${EDGE_URL_CHAT}/whatsapp-list-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ workspace_id: chatState.workspaceId }),
    });
    const data = await res.json();

    if (!data.ok || !data.templates?.length) {
      if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:24px;color:#f87171;font-size:.82rem;">❌ ${data.error || 'Nenhum template aprovado encontrado'}<br><span style="color:#666;font-size:.75rem;">Verifique seus templates aprovados no Meta Business Manager</span></div>`;
      return;
    }

    const firstName = lead?.name?.split(' ')[0] || lead?.name || 'Amigo';
    _cachedTemplates = data.templates; // cache for broadcast

    if (listEl) {
      // Cache body text per template for variable extraction
      window._tplBodyCache = {};
      listEl.innerHTML = data.templates.map(t => {
        const bodyText = extractTemplateBody(t.components);
        const varCount = countTemplateVars(bodyText);
        const varNames = extractTemplateVarNames(bodyText);
        window._tplBodyCache[t.name] = { bodyText, varCount, varNames };
        const previewVars = varNames.map((n, i) => i === 0 ? firstName : n);
        const preview = interpolatePreview(bodyText, previewVars);
        const lang = t.language || 'pt_BR';
        const safeBody = bodyText.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `<div class="chat-tpl-card" id="tpl-card-${t.name}" onclick="selectTemplate('${t.name}', '${lang}', ${varCount})">
          <div class="chat-tpl-name">${t.name.replace(/_/g, ' ')}</div>
          <div class="chat-tpl-preview">${escapeHtml(preview)}</div>
          <div style="font-size:.68rem;color:#555;margin-top:4px;">${lang} • ${varCount} variável${varCount !== 1 ? 'is' : ''}</div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:24px;color:#f87171;font-size:.82rem;">❌ Erro ao carregar templates: ${e.message}</div>`;
  }
}


function selectTemplate(name, languageCode, varCount) {
  // Get cached body info
  const cached = window._tplBodyCache?.[name] || {};
  _selectedTemplate = { name, language_code: languageCode, variables_count: varCount, var_names: cached.varNames || [] };
  document.querySelectorAll('.chat-tpl-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`tpl-card-${name}`);
  if (card) card.classList.add('selected');

  // Show variable input fields if template has vars
  const varsSection = document.getElementById('tpl-vars-section');
  const varsInputs = document.getElementById('tpl-vars-inputs');
  if (varCount > 0 && varsSection && varsInputs) {
    const lead = chatState.leads.find(l => l.id === chatState.selectedLeadId);
    const firstName = lead?.name?.split(' ')[0] || '';
    const varNames = cached.varNames || Array.from({ length: varCount }, (_, i) => String(i + 1));
    varsInputs.innerHTML = varNames.map((vName, i) => `
      <div style="margin-bottom:10px;">
        <label style="font-size:.72rem;color:#8696a0;display:block;margin-bottom:4px;">{{${vName}}}</label>
        <input class="hub-field-input" id="tpl-var-${i}" placeholder="Digite o valor para {{${vName}}}" value="${i === 0 ? escapeHtml(firstName) : ''}" style="width:100%;padding:9px 12px;box-sizing:border-box;">
      </div>
    `).join('');
    varsSection.style.display = 'block';
  } else if (varsSection) {
    varsSection.style.display = 'none';
  }

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
  // Capture template data locally to avoid race condition if modal closes during await
  const tpl = { ..._selectedTemplate };
  const lead = chatState.leads.find(l => l.id === chatState.selectedLeadId);

  const sendBtn = document.getElementById('chat-tpl-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Enviando...'; }

  const components = [];
  if (tpl.variables_count > 0) {
    // Collect values from user-filled inputs
    const params = Array.from({ length: tpl.variables_count }, (_, i) => {
      const input = document.getElementById(`tpl-var-${i}`);
      return input?.value?.trim() || '';
    });
    // Validate all vars filled
    const empty = params.findIndex(p => !p);
    if (empty !== -1) {
      showChatToast(`❌ Preencha a variável ${empty + 1} do template.`, 'warn');
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar Template ✓'; }
      return;
    }
    const varNames = tpl.var_names || [];
    components.push({
      type: 'body',
      parameters: params.map((v, i) => {
        const p = { type: 'text', text: v };
        if (varNames[i] && isNamedParam(varNames[i])) {
          p.parameter_name = varNames[i];
        }
        return p;
      }),
    });
  }

  try {
    const session = (await window._sb.auth.getSession()).data.session;
    const res = await fetch(`${EDGE_URL_CHAT}/whatsapp-send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        workspace_id: chatState.workspaceId,
        lead_id: chatState.selectedLeadId,
        message: {
          type: 'template',
          content: {
            name: tpl.name,
            language: tpl.language_code,
            components,
          },
        },
      }),
    });
    const result = await res.json();
    if (res.ok && result.ok) {
      // Build actual displayed content: "📨 Template: name | interpolated body"
      const cached = window._tplBodyCache?.[tpl.name] || {};
      let displayBody = cached.bodyText || '';
      if (tpl.variables_count > 0) {
        const params = Array.from({ length: tpl.variables_count }, (_, i) => {
          return document.getElementById(`tpl-var-${i}`)?.value?.trim() || '';
        });
        // Interpolate named params like {{name}} and positional {{1}}
        (tpl.var_names || []).forEach((vName, i) => {
          displayBody = displayBody.replace(`{{${vName}}}`, params[i] || '');
        });
        params.forEach((v, i) => { displayBody = displayBody.replace(`{{${i + 1}}}`, v); });
      }
      // Remove empty {{}} placeholders
      displayBody = displayBody.replace(/\{\{\}\}/g, '');
      const content = displayBody ? `📨 Template: ${tpl.name} | ${displayBody}` : `📨 Template: ${tpl.name}`;

      const now = new Date().toISOString();
      // Close modal + show success FIRST (before DB insert which may fail due to RLS)
      closeTemplateModal();
      console.log('[Template OK] Meta response:', result.meta_response, 'status:', result.message_status);
      showChatToast('✅ Template enviado com sucesso!', 'success');
      chatState.messages.push({
        id: crypto.randomUUID(), direction: 'outbound', type: 'template',
        content,
        automated: false, created_at: now,
      });
      renderMessages();
      // Persist to DB (separate try-catch to not block UI)
      try {
        await window._sb.from('messages').insert({
          workspace_id: chatState.workspaceId,
          lead_id: chatState.selectedLeadId,
          direction: 'outbound', type: 'template',
          content,
          automated: false, responded_at: now,
          wa_message_id: result.wa_message_id || null,
        });
      } catch (dbErr) {
        console.warn('[Template] DB insert failed (RLS?):', dbErr.message);
      }
    } else {
      const errMsg = result.error || 'Erro desconhecido';
      showChatToast(`❌ ${errMsg}`, 'error');
      console.error('[Template Error]', result);
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar Template ✓'; }
    }
  } catch (e) {
    showChatToast(`❌ Erro de conexão: ${e.message}`, 'error');
    console.error('[Template Fetch Error]', e);
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar Template ✓'; }
  }
}

// ─── FILE ATTACHMENT ─────────────────────────────────────────────────────
async function handleChatFileAttach(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !chatState.selectedLeadId) return;
  await sendChatMediaFile(file);
}

async function sendChatMediaFile(file, options = {}) {
  if (!file || !chatState.selectedLeadId) return;
  const lead = selectedConversationLead();
  if (!lead) return;
  const leadIds = lead._conversationLeadIds || [lead.id];
  const isImage = file.type.startsWith('image/');
  const isAudio = file.type.startsWith('audio/');
  const isVideo = file.type.startsWith('video/');

  let msgType = 'document';
  if (isImage && ['image/jpeg', 'image/png'].includes(file.type)) msgType = 'image';
  else if (isAudio) msgType = 'audio';
  else if (isVideo && file.type === 'video/mp4') msgType = 'video';

  const maxByType = {
    image: 5 * 1024 * 1024,
    audio: 16 * 1024 * 1024,
    video: 16 * 1024 * 1024,
    document: 100 * 1024 * 1024,
  };
  const maxSize = maxByType[msgType] || maxByType.document;
  if (file.size > maxSize) {
    const mb = Math.round(maxSize / 1024 / 1024);
    showChatToast(`❌ Arquivo muito grande. Máximo ${mb}MB.`, 'error');
    return;
  }

  if (isImage && msgType === 'document') {
    showChatToast('Imagem enviada como arquivo. WhatsApp aceita JPEG ou PNG como imagem.', 'warn');
  }
  if (isVideo && msgType === 'document') {
    showChatToast('Vídeo enviado como arquivo. WhatsApp aceita MP4 como vídeo.', 'warn');
  }

  showChatToast(options.fromRecorder ? 'Enviando áudio...' : '📎 Fazendo upload...', 'info');

  try {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const path = `chat/${lead.id}/${Date.now()}-${safeName || `file.${ext}`}`;

    const { error: upErr } = await window._sb.storage
      .from('app_files')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream' });
    if (upErr) throw upErr;

    const { data: urlData } = window._sb.storage.from('app_files').getPublicUrl(path);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error('Falha ao obter URL do arquivo');

    // Send as proper Meta media message using link (Meta accepts public URLs)
    const session = (await window._sb.auth.getSession()).data.session;

    const res = await fetch(`${EDGE_URL_CHAT}/whatsapp-send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        workspace_id: chatState.workspaceId,
        lead_id: lead.id,
        message: {
          type: msgType,
          content: publicUrl,
          filename: file.name,
          mime_type: file.type || null,
        },
      }),
    });
    const result = await res.json();
    if (res.ok && result.ok) {
      const now = new Date().toISOString();
      const label = msgType === 'image' ? 'Imagem'
        : msgType === 'audio' ? 'Áudio'
          : msgType === 'video' ? 'Vídeo'
            : 'Arquivo';
      const dbContent = `[${label}: ${file.name}] ${publicUrl}`;
      await window._sb.from('messages').insert({
        workspace_id: chatState.workspaceId,
        lead_id: lead.id,
        direction: 'outbound', type: msgType,
        content: dbContent,
        automated: false, responded_at: now,
        wa_message_id: result.wa_message_id || null,
      });
      showChatToast('✅ Arquivo enviado!', 'success');
      chatState.messages.push({
        id: crypto.randomUUID(), direction: 'outbound', type: msgType,
        content: dbContent, automated: false, created_at: now,
      });
      const lockUntil = result.human_lock_until || new Date(Date.now() + 30 * 60 * 1000).toISOString();
      chatState.leads.forEach(l => {
        if (leadIds.includes(l.id)) {
          l.last_message_at = now;
          l.llm_lock_until = lockUntil;
          l.wa_window_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          l.has_responded = true;
        }
      });
      const updatedLead = selectedConversationLead() || lead;
      updateLockUI(updatedLead);
      applyWindowUI(updatedLead);
      renderMessages();
    } else {
      throw new Error(result.error || 'Erro no envio');
    }
  } catch (e) {
    showChatToast(`❌ Erro no envio: ${e.message}`, 'error');
  }
}

// ─── BROADCAST ─────────────────────────────────────────────────────────────
let _cachedTemplates = [];
let _broadcastAudience = 'all';
let _broadcastTemplate = null;

function setBroadcastAudience(audience, btn) {
  _broadcastAudience = audience;
  document.querySelectorAll('#broadcast-audience-chips .chat-tab').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _updateBroadcastCount();
}

function _getBroadcastLeads() {
  return chatState.leads.filter(l => {
    if (l.inbox_status === 'archived') return false;
    switch (_broadcastAudience) {
      case 'responded': return l.has_responded;
      case 'no-response': return !l.has_responded;
      case 'highlighted': return l.inbox_status === 'highlighted';
      default: return true;
    }
  });
}

function _updateBroadcastCount() {
  const leads = _getBroadcastLeads();
  const el = document.getElementById('broadcast-count');
  if (el) el.textContent = `${leads.length} lead${leads.length !== 1 ? 's' : ''} selecionado${leads.length !== 1 ? 's' : ''}`;
  // Enable/disable send
  const sendBtn = document.getElementById('broadcast-send-btn');
  if (sendBtn) sendBtn.disabled = !_broadcastTemplate || leads.length === 0;
}

function selectBroadcastTemplate(name, lang, varCount) {
  _broadcastTemplate = { name, language_code: lang, variables_count: varCount };
  document.querySelectorAll('#broadcast-template-list .chat-tpl-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`bc-tpl-${name}`);
  if (card) card.classList.add('selected');
  _updateBroadcastCount();
}

async function openBroadcastModal() {
  _broadcastAudience = 'all';
  _broadcastTemplate = null;

  const overlay = document.getElementById('broadcast-overlay');
  if (overlay) overlay.style.display = 'flex';

  _updateBroadcastCount();

  const listEl = document.getElementById('broadcast-template-list');
  const sendBtn = document.getElementById('broadcast-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  // Load templates (use cache if available)
  if (_cachedTemplates.length) {
    _renderBroadcastTemplates(listEl, _cachedTemplates);
    return;
  }

  if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#666;font-size:.82rem;">Carregando templates...</div>';

  try {
    const session = (await window._sb.auth.getSession()).data.session;
    const res = await fetch(`${EDGE_URL_CHAT}/whatsapp-list-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ workspace_id: chatState.workspaceId }),
    });
    const data = await res.json();
    if (!data.ok || !data.templates?.length) {
      if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:20px;color:#f87171;font-size:.82rem;">❌ ${data.error || 'Nenhum template encontrado'}</div>`;
      return;
    }
    _cachedTemplates = data.templates;
    _renderBroadcastTemplates(listEl, data.templates);
  } catch (e) {
    if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:20px;color:#f87171;font-size:.82rem;">❌ ${e.message}</div>`;
  }
}

function _renderBroadcastTemplates(listEl, templates) {
  if (!listEl) return;
  listEl.innerHTML = templates.map(t => {
    const bodyText = extractTemplateBody(t.components);
    const varCount = countTemplateVars(bodyText);
    const lang = t.language || 'pt_BR';
    return `<div class="chat-tpl-card" id="bc-tpl-${t.name}" onclick="selectBroadcastTemplate('${t.name}','${lang}',${varCount})">
      <div class="chat-tpl-name">${t.name.replace(/_/g, ' ')}</div>
      <div class="chat-tpl-preview">${escapeHtml(bodyText).slice(0, 100)}...</div>
      <div style="font-size:.68rem;color:#555;margin-top:4px;">${lang}</div>
    </div>`;
  }).join('');
}

function closeBroadcastModal() {
  const overlay = document.getElementById('broadcast-overlay');
  if (overlay) overlay.style.display = 'none';
  _broadcastTemplate = null;
}

async function sendBroadcast() {
  if (!_broadcastTemplate) return;
  const leads = _getBroadcastLeads();
  if (!leads.length) return;

  const confirmed = confirm(`📢 Enviar template "${_broadcastTemplate.name}" para ${leads.length} lead(s)?\n\nEsta ação não pode ser desfeita.`);
  if (!confirmed) return;

  const sendBtn = document.getElementById('broadcast-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '📢 Enviando...'; }

  try {
    const session = (await window._sb.auth.getSession()).data.session;
    const res = await fetch(`${EDGE_URL_CHAT}/whatsapp-broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        workspace_id: chatState.workspaceId,
        lead_ids: leads.map(l => l.id),
        template_name: _broadcastTemplate.name,
        language_code: _broadcastTemplate.language_code,
        variables_count: _broadcastTemplate.variables_count,
      }),
    });
    const result = await res.json();
    if (res.ok && result.ok) {
      closeBroadcastModal();
      showChatToast(`✅ Broadcast enviado para ${result.sent || leads.length} lead(s)!`, 'success');
    } else {
      showChatToast(`❌ ${result.error || 'Erro no broadcast'}`, 'error');
    }
  } catch (e) {
    showChatToast(`❌ ${e.message}`, 'error');
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '📢 Enviar Broadcast'; }
  }
}

// ─── NEW CONVERSATION ────────────────────────────────────────────────────────
let _newConvoTemplate = null;

async function openNewConvoModal() {
  _newConvoTemplate = null;
  const overlay = document.getElementById('new-convo-overlay');
  if (overlay) overlay.style.display = 'flex';

  const sendBtn = document.getElementById('new-convo-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  const phoneEl = document.getElementById('new-convo-phone');
  if (phoneEl) { phoneEl.value = ''; phoneEl.focus(); }
  const infoEl = document.getElementById('new-convo-lead-info');
  if (infoEl) infoEl.textContent = '';
  const varsSection = document.getElementById('new-convo-vars-section');
  if (varsSection) varsSection.style.display = 'none';

  // Load templates
  const listEl = document.getElementById('new-convo-template-list');
  if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:16px;color:#666;font-size:.82rem;">Carregando templates...</div>';

  try {
    const session = (await window._sb.auth.getSession()).data.session;
    const res = await fetch(`${EDGE_URL_CHAT}/whatsapp-list-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ workspace_id: chatState.workspaceId }),
    });
    const data = await res.json();
    if (!data.ok || !data.templates?.length) {
      if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:16px;color:#f87171;font-size:.82rem;">❌ ${data.error || 'Nenhum template aprovado'}</div>`;
      return;
    }
    _cachedTemplates = data.templates;
    window._tplBodyCache = window._tplBodyCache || {};
    if (listEl) {
      listEl.innerHTML = data.templates.map(t => {
        const bodyText = extractTemplateBody(t.components);
        const varCount = countTemplateVars(bodyText);
        const varNames = extractTemplateVarNames(bodyText);
        window._tplBodyCache[t.name] = { bodyText, varCount, varNames };
        const lang = t.language || 'pt_BR';
        return `<div class="chat-tpl-card" id="nc-tpl-${t.name}" onclick="selectNewConvoTemplate('${t.name}','${lang}',${varCount})">
          <div class="chat-tpl-name">${t.name.replace(/_/g, ' ')}</div>
          <div class="chat-tpl-preview">${escapeHtml(bodyText.slice(0, 100))}${bodyText.length > 100 ? '...' : ''}</div>
          <div style="font-size:.68rem;color:#555;margin-top:4px;">${lang} • ${varCount} variável${varCount !== 1 ? 'is' : ''}</div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:16px;color:#f87171;font-size:.82rem;">❌ ${e.message}</div>`;
  }
}

function closeNewConvoModal() {
  const overlay = document.getElementById('new-convo-overlay');
  if (overlay) overlay.style.display = 'none';
  _newConvoTemplate = null;
}

function _lookupConvoPhone() {
  const phone = document.getElementById('new-convo-phone')?.value?.trim();
  const infoEl = document.getElementById('new-convo-lead-info');
  if (!phone || !infoEl) return;
  // Check if we have a matching lead in memory
  const normalized = phone.replace(/\D/g, '');
  const match = chatState.leads.find(l => (l.phone || '').replace(/\D/g, '').endsWith(normalized.slice(-8)));
  if (match) {
    infoEl.innerHTML = `<span style="color:#4ade80;">✓ Lead existente: <strong>${escapeHtml(match.name)}</strong></span>`;
  } else if (normalized.length >= 8) {
    infoEl.innerHTML = `<span style="color:#fbbf24;">⚡ Novo contato será criado</span>`;
  } else {
    infoEl.textContent = '';
  }
  _updateNewConvoSendBtn();
}

function selectNewConvoTemplate(name, languageCode, varCount) {
  const cached = window._tplBodyCache?.[name] || {};
  _newConvoTemplate = { name, language_code: languageCode, variables_count: varCount, var_names: cached.varNames || [] };

  document.querySelectorAll('#new-convo-template-list .chat-tpl-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`nc-tpl-${name}`);
  if (card) card.classList.add('selected');

  // Show variable inputs
  const varsSection = document.getElementById('new-convo-vars-section');
  const varsInputs = document.getElementById('new-convo-vars-inputs');
  if (varCount > 0 && varsSection && varsInputs) {
    // Try to pre-fill from phone lookup
    const phone = document.getElementById('new-convo-phone')?.value?.trim();
    const normalized = phone?.replace(/\D/g, '') || '';
    const match = chatState.leads.find(l => (l.phone || '').replace(/\D/g, '').endsWith(normalized.slice(-8)));
    const firstName = match?.name?.split(' ')[0] || '';
    const varNames = cached.varNames || Array.from({ length: varCount }, (_, i) => String(i + 1));
    varsInputs.innerHTML = varNames.map((vName, i) => `
      <div style="margin-bottom:10px;">
        <label style="font-size:.72rem;color:#8696a0;display:block;margin-bottom:4px;">{{${vName}}}</label>
        <input class="hub-field-input" id="nc-var-${i}" placeholder="Digite o valor para {{${vName}}}" value="${i === 0 ? escapeHtml(firstName) : ''}" style="width:100%;padding:9px 12px;box-sizing:border-box;" oninput="_updateNewConvoSendBtn()">
      </div>
    `).join('');
    varsSection.style.display = 'block';
  } else if (varsSection) {
    varsSection.style.display = 'none';
  }

  _updateNewConvoSendBtn();
}

function _updateNewConvoSendBtn() {
  const btn = document.getElementById('new-convo-send-btn');
  if (!btn) return;
  const phone = document.getElementById('new-convo-phone')?.value?.trim() || '';
  const hasPhone = phone.replace(/\D/g, '').length >= 8;
  const hasTemplate = !!_newConvoTemplate;
  let varsOk = true;
  if (_newConvoTemplate?.variables_count > 0) {
    for (let i = 0; i < _newConvoTemplate.variables_count; i++) {
      const v = document.getElementById(`nc-var-${i}`)?.value?.trim();
      if (!v) { varsOk = false; break; }
    }
  }
  btn.disabled = !(hasPhone && hasTemplate && varsOk);
}

async function sendNewConversation() {
  if (!_newConvoTemplate) return;
  // Capture template data locally to avoid race condition if modal closes during await
  const tpl = { ..._newConvoTemplate };
  const rawPhone = document.getElementById('new-convo-phone')?.value?.trim();
  if (!rawPhone) return;

  const sendBtn = document.getElementById('new-convo-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Enviando...'; }

  try {
    const session = (await window._sb.auth.getSession()).data.session;

    // Collect variable values
    const params = Array.from({ length: tpl.variables_count }, (_, i) => {
      return document.getElementById(`nc-var-${i}`)?.value?.trim() || '';
    });
    const empty = params.findIndex(p => !p);
    if (empty !== -1) {
      showChatToast(`❌ Preencha a variável ${empty + 1}.`, 'warn');
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar ✓'; }
      return;
    }

    // Normalize phone
    const phone = rawPhone.startsWith('+') ? rawPhone : '+' + rawPhone;

    // Find or create lead
    let leadId = null;
    const normalized = rawPhone.replace(/\D/g, '');
    const existing = chatState.leads.find(l => (l.phone || '').replace(/\D/g, '').endsWith(normalized.slice(-8)));
    if (existing) {
      leadId = existing.id;
    } else {
      // Create a new lead
      const { data: newLead, error: createErr } = await window._sb.from('leads').insert({
        workspace_id: chatState.workspaceId,
        name: phone,
        phone: phone,
        type: 'visitor',
        source: 'chat_manual',
      }).select('id').single();
      if (createErr || !newLead) throw new Error(createErr?.message || 'Erro ao criar lead');
      leadId = newLead.id;
    }

    // Build components with named parameter support
    const components = [];
    if (params.length > 0) {
      const varNames = tpl.var_names || [];
      components.push({
        type: 'body',
        parameters: params.map((v, i) => {
          const p = { type: 'text', text: v };
          if (varNames[i] && isNamedParam(varNames[i])) {
            p.parameter_name = varNames[i];
          }
          return p;
        }),
      });
    }

    // Send via Edge Function
    const res = await fetch(`${EDGE_URL_CHAT}/whatsapp-send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        workspace_id: chatState.workspaceId,
        lead_id: leadId,
        message: {
          type: 'template',
          content: {
            name: tpl.name,
            language: tpl.language_code,
            components,
          },
        },
      }),
    });
    const result = await res.json();

    if (res.ok && result.ok) {
      // Build actual displayed content with interpolated body
      const cached = window._tplBodyCache?.[tpl.name] || {};
      let displayBody = cached.bodyText || '';
      if (params.length > 0) {
        (tpl.var_names || []).forEach((vName, i) => {
          displayBody = displayBody.replace(`{{${vName}}}`, params[i] || '');
        });
        params.forEach((v, i) => { displayBody = displayBody.replace(`{{${i + 1}}}`, v); });
      }
      displayBody = displayBody.replace(/\{\{\}\}/g, '');
      const content = displayBody ? `📨 Template: ${tpl.name} | ${displayBody}` : `📨 Template: ${tpl.name}`;

      const now = new Date().toISOString();
      await window._sb.from('messages').insert({
        workspace_id: chatState.workspaceId,
        lead_id: leadId,
        direction: 'outbound', type: 'template',
        content,
        automated: false, responded_at: now,
        wa_message_id: result.wa_message_id || null,
      });
      closeNewConvoModal();
      console.log('[NewConvo Template OK] Meta response:', result.meta_response, 'status:', result.message_status);
      showChatToast('✅ Mensagem enviada!', 'success');
      // Reload leads to show the new one
      await loadLeads();
      // Open the conversation if it's a new lead
      if (leadId) {
        const newLead = chatState.leads.find(l => l.id === leadId);
        if (newLead) setTimeout(() => selectLead(leadId), 400);
      }
    } else {
      showChatToast(`❌ ${result.error || 'Erro ao enviar'}`, 'error');
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar ✓'; }
    }
  } catch (e) {
    showChatToast(`❌ ${e.message}`, 'error');
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar ✓'; }
  }
}

// ─── EXPOSE ─────────────────────────────────────────────────────────────
window.initChatAoVivo = initChatAoVivo;
window.refreshChatAoVivo = async function() {
  if (!chatState.workspaceId) return initChatAoVivo();
  await loadKPIs();
  await loadLeads();
  setupRealtime();
};
window.selectLead = selectLead;
window.setChatFilter = setChatFilter;
window.filterLeadsList = filterLeadsList;
window.toggleChatSidebar = toggleChatSidebar;
window.sendManualMessage = sendManualMessage;
window.handleChatKeydown = handleChatKeydown;
window.autoresizeTextarea = autoresizeTextarea;
window.handleChatSendButton = handleChatSendButton;
window.reactivateAI = reactivateAI;
window.toggleArchiveCurrentLead = toggleArchiveCurrentLead;
window.togglePinCurrentLead = togglePinCurrentLead;
window.toggleHighlightCurrentLead = toggleHighlightCurrentLead;
window.openLeadProfileDrawer = openLeadProfileDrawer;
window.closeLeadProfileDrawer = closeLeadProfileDrawer;
window.goToLinkedTask = goToLinkedTask;
window.openTemplateModal = openTemplateModal;
window.closeTemplateModal = closeTemplateModal;
window.selectTemplate = selectTemplate;
window.sendSelectedTemplate = sendSelectedTemplate;
window.handleChatFileAttach = handleChatFileAttach;
window.openBroadcastModal = openBroadcastModal;
window.closeBroadcastModal = closeBroadcastModal;
window.sendBroadcast = sendBroadcast;
window.setBroadcastAudience = setBroadcastAudience;
window.selectBroadcastTemplate = selectBroadcastTemplate;
window.openNewConvoModal = openNewConvoModal;
window.closeNewConvoModal = closeNewConvoModal;
window.selectNewConvoTemplate = selectNewConvoTemplate;
window.sendNewConversation = sendNewConversation;
window._lookupConvoPhone = _lookupConvoPhone;
window._updateNewConvoSendBtn = _updateNewConvoSendBtn;

// ─── AUDIO MEDIA FETCH ──────────────────────────────────────────────────────
// Called when an inbound audio message has a Meta media ID (not a URL)
// Fetches the temporary download URL from Meta via a helper EF, then injects player
async function playAudioMessage(msgId, mediaId) {
  const container = document.getElementById(`ap-${msgId}`);
  if (!container) return;
  const btn = container.querySelector('button');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Carregando...'; }

  try {
    const session = (await window._sb.auth.getSession()).data.session;
    const res = await fetch(`${EDGE_URL_CHAT}/whatsapp-get-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ workspace_id: chatState.workspaceId, media_id: mediaId }),
    });
    const data = await res.json();
    const audioSrc = data.data_url || data.url;
    if (data.ok && audioSrc) {
      container.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="flex-shrink:0;opacity:.7;"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
        <audio controls autoplay preload="auto" style="height:32px;flex:1;min-width:0;accent-color:#FFD700;">
          <source src="${audioSrc}">
        </audio>`;
    } else {
      if (btn) { btn.disabled = false; btn.textContent = data.error ? `❌ ${data.error}` : '❌ Falha ao carregar'; }
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = `❌ ${e.message}`; }
  }
}
window.playAudioMessage = playAudioMessage;
