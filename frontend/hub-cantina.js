/* ═══════════════════════════════════════════════════════════
   hub-cantina.js — Módulo Cantina — Zelo Pro
   v1.0 — 2026-04-11
═══════════════════════════════════════════════════════════ */

// ── Module state ────────────────────────────────────────────
window._cantinaConfig = null;
window._cantinaProducts = [];
window._cantinaPedidos = [];
window._cantinaTransactions = [];
window._posCart = [];
window._posPaymentMethod = null;
window._cantinaProductPhotos = []; // temp array during product modal
window._finPeriodDays = 7;
window._finTypeFilter = 'all';
window._pedidosFilter = 'all';
window._estoqueFilter = 'active';

// ── Sidebar Toggle ───────────────────────────────────────────
function toggleCantinaMenu() {
  const wrap = document.getElementById('cantina-submenu-wrap');
  const arrow = document.getElementById('cantina-arrow');
  if (!wrap) return;
  const isOpen = wrap.style.display === 'flex';
  wrap.style.display = isOpen ? 'none' : 'flex';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
}

// ── Tab switching hook (called by switchTab in hub-dashboard.js) ──
function onCantinaTabSwitch(tab) {
  if (tab === 'cantina-pedidos') {
    loadCantinaPedidos();
  } else if (tab === 'cantina-estoque') {
    loadCantinaEstoque();
  } else if (tab === 'cantina-financeiro') {
    loadCantinaFinanceiro();
  } else if (tab === 'cantina-pos') {
    initPOS();
  } else if (tab === 'cantina-config') {
    loadCantinaConfigView();
  }
}

// Patch into global switchTab — called after view-section switch
(function patchSwitchTab() {
  const _orig = window.switchTab;
  if (!_orig) return;
  window.switchTab = function(tab, ...args) {
    _orig(tab, ...args);
    if (tab && tab.startsWith('cantina-')) {
      onCantinaTabSwitch(tab);
    }
  };
})();

// ── Helpers ─────────────────────────────────────────────────
function cantinaFmt(amount) {
  const sym = window._cantinaConfig?.currency_symbol || 'R$';
  const n = parseFloat(amount) || 0;
  return sym + ' ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function cantinaTimeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return Math.floor(diff / 60) + 'min atrás';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h atrás';
  return d.toLocaleDateString('pt-BR');
}

function cantinaStatusLabel(status) {
  const map = {
    pending:   { label: 'Pendente',    color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'   },
    confirmed: { label: 'Confirmado',  color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'   },
    ready:     { label: 'Pronto',      color: '#34d399', bg: 'rgba(52,211,153,0.12)'   },
    delivered: { label: 'Entregue',    color: '#a78bfa', bg: 'rgba(167,139,250,0.12)'  },
    cancelled: { label: 'Cancelado',   color: '#f87171', bg: 'rgba(248,113,113,0.12)'  },
    expired:   { label: 'Expirado',    color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.04)' },
  };
  return map[status] || { label: status, color: '#fff', bg: 'rgba(255,255,255,0.04)' };
}

function paymentLabel(method) {
  const map = { cash: '💵 Dinheiro', pix: '📲 Pix', card: '💳 Cartão', stripe: '⚡ Stripe', other: 'Outro' };
  return map[method] || method || '—';
}

function getSupabase() {
  return window.supabaseClient || window._supabase || window.supabase;
}

async function getWorkspaceId() {
  // Always respect the workspace switcher (master admin may switch workspaces)
  if (window.currentWorkspaceId) return window.currentWorkspaceId;
  // Fallback: query DB for the user's own workspace
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('users').select('workspace_id').eq('id', user.id).single();
  return data?.workspace_id || null;
}

// ═══════════════════════════════════════════════════════════
// SECTION 1 — CONFIG
// ═══════════════════════════════════════════════════════════

async function loadCantinaConfig() {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  if (!wsId) return null;
  const { data } = await sb.from('cantina_config').select('*').eq('workspace_id', wsId).single();
  window._cantinaConfig = data || { workspace_id: wsId, currency_symbol: 'R$', payment_methods: ['cash','pix','card'], reservation_minutes: 20 };
  return window._cantinaConfig;
}

async function loadCantinaConfigView() {
  const cfg = await loadCantinaConfig();
  if (!cfg) return;

  const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const c = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

  v('cc-store-name', cfg.store_name);
  v('cc-store-desc', cfg.store_description);
  v('cc-currency', cfg.currency || 'BRL');
  v('cc-country-code', cfg.default_country_code || '+55');
  v('cc-reservation-min', cfg.reservation_minutes || 20);
  v('cc-resp-name', cfg.responsible_name);
  v('cc-resp-email', cfg.responsible_email);
  v('cc-resp-phone', cfg.responsible_phone);
  v('cc-stripe-pub', cfg.stripe_publishable_key);

  c('cc-stripe-enabled', cfg.stripe_enabled);
  c('cc-allow-counter', cfg.allow_counter_payment);
  c('cc-notif-stock', cfg.notif_low_stock);
  c('cc-notif-closing', cfg.notif_cash_closing);

  // payment methods checkboxes
  const methods = cfg.payment_methods || [];
  ['cash','pix','card','stripe'].forEach(m => {
    const el = document.getElementById('pm-' + m);
    if (el) el.checked = methods.includes(m);
  });

  // ── Stripe connection status ──────────────────────────────
  const statusEl  = document.getElementById('cantina-stripe-connection-status');
  const btnConn   = document.getElementById('btn-cantina-stripe-connect');
  const btnDisc   = document.getElementById('btn-cantina-stripe-disconnect');

  if (cfg.stripe_connected) {
    const displayName = cfg.stripe_account_name || cfg.stripe_account_email || 'Conta Stripe';
    if (statusEl) statusEl.innerHTML = `<span style="color:#4ade80;">⬤</span><span style="color:#4ade80;">Conectado: ${displayName}</span>`;
    if (btnConn)  btnConn.style.display  = 'none';
    if (btnDisc)  btnDisc.style.display  = 'inline-flex';
  } else {
    if (statusEl) statusEl.innerHTML = `<span style="color:rgba(255,255,255,0.2);">⬤</span><span style="color:rgba(255,255,255,0.3);">Não conectado</span>`;
    if (btnConn)  btnConn.style.display  = 'inline-flex';
    if (btnDisc)  btnDisc.style.display  = 'none';
  }

  window._cantinaStripeConnected = !!cfg.stripe_connected;

  // QR Code — using qrserver.com API (no library needed)
  const publicUrl = `${location.origin}/cantina.html?ws=${cfg.workspace_id}`;
  const urlEl = document.getElementById('cantina-public-url');
  if (urlEl) urlEl.textContent = publicUrl;

  const qrImg = document.getElementById('qr-cantina-public');
  if (qrImg) {
    const encoded = encodeURIComponent(publicUrl);
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=6&data=${encoded}`;
    qrImg.style.display = 'block';
  }
}

// toggleStripeSection is kept for the checkbox (enable/disable in orders), but no longer dims keys
function toggleStripeSection(enabled) {
  // No-op: kept for backward compat with the checkbox onchange handler
}

// ── Stripe Connect / Disconnect ─────────────────────────────

window.toggleCantinaSkVisibility = function() {
  const inp = document.getElementById('cc-stripe-sec');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
};

window.connectCantinaStripe = async function() {
  const pk  = (document.getElementById('cc-stripe-pub')?.value || '').trim();
  const sk  = (document.getElementById('cc-stripe-sec')?.value || '').trim();
  const msg = document.getElementById('cantina-stripe-connect-msg');
  const btn = document.getElementById('btn-cantina-stripe-connect');

  if (!pk || !sk) {
    if (msg) { msg.textContent = '⚠️ Insere ambas as chaves.'; msg.style.color = '#f87171'; }
    return;
  }
  if (!pk.startsWith('pk_')) {
    if (msg) { msg.textContent = '⚠️ Publishable Key inválida (deve começar com pk_).'; msg.style.color = '#f87171'; }
    return;
  }
  if (!sk.startsWith('sk_')) {
    if (msg) { msg.textContent = '⚠️ Secret Key inválida (deve começar com sk_).'; msg.style.color = '#f87171'; }
    return;
  }

  if (btn) { btn.textContent = '⏳ A conectar...'; btn.disabled = true; }
  if (msg) { msg.textContent = ''; }

  const wsId = await getWorkspaceId();
  const EDGE = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1';
  const { data: { session } } = await getSupabase().auth.getSession();

  try {
    const res = await fetch(`${EDGE}/cantina-stripe-connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ workspace_id: wsId, publishable_key: pk, secret_key: sk })
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const rawText = await res.text();
      console.error('[Cantina stripe] Non-JSON response:', res.status, rawText.substring(0, 200));
      throw new Error(`Erro de servidor (${res.status}) — tente novamente.`);
    }

    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Erro desconhecido');

    if (msg) { msg.textContent = `✓ Conectado como: ${json.account_name || json.email || 'Conta Stripe'}`; msg.style.color = '#4ade80'; }
    // Reload config to refresh status indicator (also updates _cantinaConfig cache)
    await loadCantinaConfigView();
  } catch (err) {
    if (msg) { msg.textContent = `❌ ${err.message}`; msg.style.color = '#f87171'; }
  } finally {
    if (btn) { btn.textContent = '⚡ Conectar Stripe'; btn.disabled = false; }
  }
};

window.disconnectCantinaStripe = async function() {
  if (!confirm('Desconectar o Stripe desta Cantina? Os pedidos e transações existentes não serão afetados.')) return;
  const sb   = getSupabase();
  const wsId = await getWorkspaceId();
  const { error } = await sb.from('cantina_config').update({
    stripe_connected: false,
    stripe_publishable_key: null,
    stripe_secret_key_enc: null,
    stripe_account_id: null,
    stripe_account_name: null,
    stripe_account_email: null,
  }).eq('workspace_id', wsId);

  if (error) { showToast('Erro ao desconectar: ' + error.message, 'error'); return; }
  window._cantinaStripeConnected = false;
  await loadCantinaConfigView();
  const msg = document.getElementById('cantina-stripe-connect-msg');
  if (msg) { msg.textContent = 'Stripe desconectado.'; msg.style.color = 'rgba(255,255,255,0.4)'; }
};

function copyCantinaPublicUrl() {
  const urlEl = document.getElementById('cantina-public-url');
  const url = urlEl?.textContent?.trim();
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    showToast('🔗 Link copiado!', 'success');
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('🔗 Link copiado!', 'success');
  });
}

async function saveCantinaConfig() {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  if (!wsId) return;

  const methods = ['cash','pix','card','stripe'].filter(m => {
    const el = document.getElementById('pm-' + m);
    return el && el.checked;
  });

  const payload = {
    workspace_id: wsId,
    store_name: document.getElementById('cc-store-name')?.value || null,
    store_description: document.getElementById('cc-store-desc')?.value || null,
    currency: document.getElementById('cc-currency')?.value || 'BRL',
    currency_symbol: { BRL: 'R$', EUR: '€', USD: '$', GBP: '£', AOA: 'Kz', MZN: 'MT' }[document.getElementById('cc-currency')?.value || 'BRL'],
    default_country_code: document.getElementById('cc-country-code')?.value || '+55',
    reservation_minutes: parseInt(document.getElementById('cc-reservation-min')?.value) || 20,
    responsible_name: document.getElementById('cc-resp-name')?.value || null,
    responsible_email: document.getElementById('cc-resp-email')?.value || null,
    responsible_phone: document.getElementById('cc-resp-phone')?.value || null,
    stripe_enabled: document.getElementById('cc-stripe-enabled')?.checked || false,
    stripe_publishable_key: document.getElementById('cc-stripe-pub')?.value || null,
    stripe_secret_key: document.getElementById('cc-stripe-sec')?.value || null,
    allow_counter_payment: document.getElementById('cc-allow-counter')?.checked || false,
    payment_methods: methods,
    notif_low_stock: document.getElementById('cc-notif-stock')?.checked || false,
    notif_cash_closing: document.getElementById('cc-notif-closing')?.checked || false,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from('cantina_config').upsert(payload, { onConflict: 'workspace_id' });
  if (error) {
    showToast('Erro ao salvar configurações: ' + error.message, 'error');
  } else {
    window._cantinaConfig = { ...window._cantinaConfig, ...payload };
    showToast('✅ Configurações salvas!', 'success');
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION 2 — ESTOQUE (Products)
// ═══════════════════════════════════════════════════════════

async function loadCantinaEstoque() {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  if (!wsId) return;

  const { data: products, error } = await sb
    .from('cantina_products')
    .select('*')
    .eq('workspace_id', wsId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) { console.error('Erro estoque:', error); return; }
  window._cantinaProducts = products || [];

  if (!window._cantinaConfig) await loadCantinaConfig();
  renderEstoqueGrid(window._cantinaProducts);
  updateEstoqueKPIs(window._cantinaProducts);
}

function filterCantinaEstoque(type, btn) {
  window._estoqueFilter = type;
  document.querySelectorAll('#view-cantina-estoque .hub-period-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEstoqueGrid(window._cantinaProducts);
}

function searchCantinaEstoque() {
  const q = (document.getElementById('estoque-search')?.value || '').toLowerCase();
  const filtered = window._cantinaProducts.filter(p =>
    p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
  );
  renderEstoqueGrid(filtered);
}

function renderEstoqueGrid(products) {
  const grid = document.getElementById('cantina-produtos-grid');
  if (!grid) return;

  let filtered = products;
  if (window._estoqueFilter === 'active') filtered = products.filter(p => !p.archived);
  if (window._estoqueFilter === 'archived') filtered = products.filter(p => p.archived);

  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:rgba(255,255,255,0.3);">
      <div style="font-size:2.5rem;margin-bottom:12px;">📦</div>
      <div>Nenhum produto encontrado</div>
      <button onclick="openProductModal()" style="margin-top:16px;background:linear-gradient(135deg,#fb7185,#f43f5e);color:#fff;border:none;border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer;">
        + Adicionar Primeiro Produto
      </button>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => renderProductCard(p)).join('');
}

function renderProductCard(p) {
  const photo = p.photos && p.photos.length > 0 ? p.photos[0] : null;
  const isLow = p.qty_total <= 2 && p.qty_total > 0;
  const isOut = p.qty_total === 0;
  const cfg = window._cantinaConfig;
  const sym = cfg?.currency_symbol || 'R$';

  return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,${p.archived ? '0.04' : '0.08'});border-radius:16px;overflow:hidden;transition:all .2s;opacity:${p.archived ? '0.5' : '1'};" 
    onmouseover="this.style.border='1px solid rgba(251,113,133,0.3)';this.style.transform='translateY(-2px)'" 
    onmouseout="this.style.border='1px solid rgba(255,255,255,${p.archived ? '0.04' : '0.08'})';this.style.transform=''">
    <!-- Photo -->
    <div style="height:160px;background:rgba(0,0,0,0.3);position:relative;overflow:hidden;">
      ${photo
        ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">`
        : `<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:rgba(255,255,255,0.15);">📦</div>`
      }
      <!-- Status badges -->
      <div style="position:absolute;top:8px;left:8px;display:flex;gap:4px;flex-wrap:wrap;">
        <span style="font-size:0.62rem;font-weight:700;padding:3px 8px;border-radius:20px;background:${p.available_online ? 'rgba(52,211,153,0.9)' : 'rgba(248,113,113,0.9)'};color:#fff;">
          ${p.available_online ? '🌐 ONLINE' : '🔒 OFFLINE'}
        </span>
        ${p.archived ? `<span style="font-size:0.62rem;font-weight:700;padding:3px 8px;border-radius:20px;background:rgba(255,255,255,0.15);color:#fff;">ARQUIVADO</span>` : ''}
        ${isOut ? `<span style="font-size:0.62rem;font-weight:700;padding:3px 8px;border-radius:20px;background:rgba(248,113,113,0.9);color:#fff;">SEM ESTOQUE</span>` : ''}
        ${isLow && !isOut ? `<span style="font-size:0.62rem;font-weight:700;padding:3px 8px;border-radius:20px;background:rgba(251,191,36,0.9);color:#000;">ESTOQUE BAIXO</span>` : ''}
      </div>
      ${p.photos && p.photos.length > 1 ? `<div style="position:absolute;bottom:6px;right:8px;font-size:0.65rem;color:rgba(255,255,255,0.6);background:rgba(0,0,0,0.5);padding:2px 7px;border-radius:10px;">+${p.photos.length-1} fotos</div>` : ''}
    </div>
    <!-- Info -->
    <div style="padding:14px;">
      <div style="font-weight:700;font-size:0.95rem;color:#fff;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
      ${p.description ? `<div style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-bottom:8px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${p.description}</div>` : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <span style="font-size:1.1rem;font-weight:800;color:#fb7185;">${sym} ${parseFloat(p.price).toFixed(2).replace('.',',')}</span>
        <span style="font-size:0.75rem;color:rgba(255,255,255,0.4);">
          🌐 ${p.qty_online} · 🏪 ${p.qty_physical}
        </span>
      </div>
      <!-- Actions -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button onclick="openProductModal('${p.id}')"
          title="Editar produto"
          style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.75);border-radius:8px;padding:7px 10px;font-size:0.78rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;"
          onmouseover="this.style.background='rgba(255,255,255,0.12)'"
          onmouseout="this.style.background='rgba(255,255,255,0.05)'">✏️ Editar</button>
        <button onclick="toggleProductOnline('${p.id}', ${!p.available_online})"
          title="${p.available_online ? '🔒 Tirar do Online — o produto ficará indisponível no portal público' : '🌐 Colocar Online — o produto ficará visível no portal público'}"
          style="background:${p.available_online ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.04)'};border:1px solid ${p.available_online ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.08)'};color:${p.available_online ? '#34d399' : 'rgba(255,255,255,0.5)'};border-radius:8px;padding:7px;font-size:0.85rem;cursor:pointer;width:36px;transition:all .15s;"
          onmouseover="this.style.filter='brightness(1.3)'"
          onmouseout="this.style.filter='brightness(1)'">${p.available_online ? '🌐' : '🔒'}</button>
        <button onclick="duplicateProduct('${p.id}')"
          title="📋 Duplicar — cria uma cópia deste produto (offline por padrão)"
          style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);border-radius:8px;padding:7px;font-size:0.85rem;cursor:pointer;width:36px;transition:all .15s;"
          onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">📋</button>
        <button onclick="archiveProduct('${p.id}', ${!p.archived})"
          title="${p.archived ? '♻️ Restaurar — tira do arquivo e volta para Ativos' : '🗄️ Arquivar — oculta o produto sem apagar. Acesse em "Arquivados"'}"
          style="background:${p.archived ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.04)'};border:1px solid ${p.archived ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.08)'};color:${p.archived ? '#fbbf24' : 'rgba(255,255,255,0.4)'};border-radius:8px;padding:7px;font-size:0.85rem;cursor:pointer;width:36px;transition:all .15s;"
          onmouseover="this.style.filter='brightness(1.3)'"
          onmouseout="this.style.filter='brightness(1)'">${p.archived ? '♻️' : '🗄️'}</button>
      </div>
    </div>
  </div>`;
}

function updateEstoqueKPIs(products) {
  const active = products.filter(p => !p.archived);
  const online = active.filter(p => p.available_online);
  const baixo = active.filter(p => p.qty_total <= 2);
  const cfg = window._cantinaConfig;
  const sym = cfg?.currency_symbol || 'R$';
  const valorTotal = active.reduce((s, p) => s + (p.price * p.qty_total), 0);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('estoque-kpi-total', active.length);
  set('estoque-kpi-online', online.length);
  set('estoque-kpi-baixo', baixo.length);
  set('estoque-kpi-valor', sym + ' ' + valorTotal.toFixed(2).replace('.', ','));
}

// ─── Product Modal ───────────────────────────────────────────

function openProductModal(productId = null) {
  const modal = document.getElementById('modal-cantina-produto');
  if (!modal) return;

  window._cantinaProductPhotos = [];
  document.getElementById('produto-id').value = productId || '';
  document.getElementById('modal-produto-title').textContent = productId ? '✏️ Editar Produto' : '➕ Novo Produto';
  document.getElementById('produto-name').value = '';
  document.getElementById('produto-price').value = '';
  document.getElementById('produto-desc').value = '';
  document.getElementById('produto-qty-online').value = 0;
  document.getElementById('produto-qty-physical').value = 0;
  document.getElementById('produto-qty-total').textContent = '0';
  document.getElementById('produto-available-online').checked = true;
  document.getElementById('produto-modal-msg').textContent = '';
  document.getElementById('produto-photos-preview').innerHTML = '';
  document.getElementById('produto-upload-progress').style.display = 'none';

  if (productId) {
    const p = window._cantinaProducts.find(x => x.id === productId);
    if (p) {
      document.getElementById('produto-name').value = p.name || '';
      document.getElementById('produto-price').value = p.price || '';
      document.getElementById('produto-desc').value = p.description || '';
      document.getElementById('produto-qty-online').value = p.qty_online || 0;
      document.getElementById('produto-qty-physical').value = p.qty_physical || 0;
      document.getElementById('produto-qty-total').textContent = (p.qty_total || 0);
      document.getElementById('produto-available-online').checked = p.available_online;
      window._cantinaProductPhotos = [...(p.photos || [])];
      renderProductPhotoPreviews();
    }
  }

  // live total update
  ['produto-qty-online','produto-qty-physical'].forEach(id => {
    document.getElementById(id).oninput = () => {
      const a = parseInt(document.getElementById('produto-qty-online').value)||0;
      const b = parseInt(document.getElementById('produto-qty-physical').value)||0;
      document.getElementById('produto-qty-total').textContent = a + b;
    };
  });

  modal.style.display = 'flex';
}

function closeProductModal() {
  const modal = document.getElementById('modal-cantina-produto');
  if (modal) modal.style.display = 'none';
}

function renderProductPhotoPreviews() {
  const container = document.getElementById('produto-photos-preview');
  if (!container) return;
  container.innerHTML = window._cantinaProductPhotos.map((url, i) => `
    <div style="position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
      <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
      <button onclick="removeProductPhoto(${i})" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.7);border:none;color:#fff;border-radius:4px;width:18px;height:18px;font-size:0.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">✕</button>
    </div>
  `).join('');
}

function removeProductPhoto(index) {
  window._cantinaProductPhotos.splice(index, 1);
  renderProductPhotoPreviews();
}

async function handleProductPhotoUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  const progress = document.getElementById('produto-upload-progress');
  if (progress) progress.style.display = 'block';

  const sb = getSupabase();
  const wsId = await getWorkspaceId();

  for (const file of files) {
    const ext = file.name.split('.').pop();
    const path = `${wsId}/${Date.now()}-${Math.random().toString(36).substr(2,6)}.${ext}`;
    const { data, error } = await sb.storage.from('cantina-products').upload(path, file, { upsert: false });
    if (!error && data) {
      const { data: { publicUrl } } = sb.storage.from('cantina-products').getPublicUrl(path);
      window._cantinaProductPhotos.push(publicUrl);
      renderProductPhotoPreviews();
    } else {
      console.error('Upload error:', error);
    }
  }

  if (progress) progress.style.display = 'none';
  event.target.value = '';
}

async function saveProduct() {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  if (!wsId) return;

  const id = document.getElementById('produto-id').value;
  const name = document.getElementById('produto-name').value.trim();
  const price = parseFloat(document.getElementById('produto-price').value) || 0;
  const desc = document.getElementById('produto-desc').value.trim();
  const qtyOnline = parseInt(document.getElementById('produto-qty-online').value) || 0;
  const qtyPhysical = parseInt(document.getElementById('produto-qty-physical').value) || 0;
  const availableOnline = document.getElementById('produto-available-online').checked;
  const msgEl = document.getElementById('produto-modal-msg');

  if (!name) { if (msgEl) msgEl.textContent = '⚠️ Nome é obrigatório'; return; }
  if (window._cantinaProductPhotos.length === 0) { if (msgEl) msgEl.textContent = '⚠️ Adicione pelo menos 1 foto'; return; }

  if (msgEl) msgEl.textContent = '';
  const saveBtn = document.getElementById('produto-save-btn');
  if (saveBtn) { saveBtn.textContent = '⏳ Salvando...'; saveBtn.disabled = true; }

  const payload = {
    workspace_id: wsId,
    name, price, description: desc || null,
    photos: window._cantinaProductPhotos,
    qty_online: qtyOnline,
    qty_physical: qtyPhysical,
    available_online: availableOnline,
    updated_at: new Date().toISOString(),
  };

  let error;
  if (id) {
    ({ error } = await sb.from('cantina_products').update(payload).eq('id', id).eq('workspace_id', wsId));
  } else {
    ({ error } = await sb.from('cantina_products').insert({ ...payload }));
  }

  if (saveBtn) { saveBtn.textContent = '💾 Salvar Produto'; saveBtn.disabled = false; }

  if (error) {
    if (msgEl) msgEl.textContent = '❌ Erro: ' + error.message;
  } else {
    closeProductModal();
    showToast(id ? '✅ Produto atualizado!' : '✅ Produto criado!', 'success');
    loadCantinaEstoque();
  }
}

async function toggleProductOnline(productId, value) {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  await sb.from('cantina_products').update({ available_online: value }).eq('id', productId).eq('workspace_id', wsId);
  showToast(value ? '🌐 Produto online!' : '🔒 Produto offline!', 'success');
  loadCantinaEstoque();
}

async function duplicateProduct(productId) {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  const p = window._cantinaProducts.find(x => x.id === productId);
  if (!p) return;
  const { id, created_at, updated_at, qty_total, ...rest } = p;
  await sb.from('cantina_products').insert({ ...rest, name: p.name + ' (cópia)', available_online: false });
  showToast('📋 Produto duplicado!', 'success');
  loadCantinaEstoque();
}

async function archiveProduct(productId, archived) {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  await sb.from('cantina_products').update({ archived }).eq('id', productId).eq('workspace_id', wsId);
  showToast(archived ? '🗄️ Produto arquivado' : '♻️ Produto restaurado', 'success');
  loadCantinaEstoque();
}

// ═══════════════════════════════════════════════════════════
// SECTION 3 — PEDIDOS
// ═══════════════════════════════════════════════════════════

async function loadCantinaPedidos() {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  if (!wsId) return;

  if (!window._cantinaConfig) await loadCantinaConfig();

  const { data: orders, error } = await sb
    .from('cantina_orders')
    .select('*')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) { console.error(error); return; }
  window._cantinaPedidos = orders || [];
  renderPedidosList(window._cantinaPedidos);
  updatePedidosKPIs(window._cantinaPedidos);
  updateCantinaBadge(window._cantinaPedidos);
}

function filterCantinaPedidos(status, btn) {
  window._pedidosFilter = status;
  document.querySelectorAll('#view-cantina-pedidos .hub-period-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderPedidosList(window._cantinaPedidos);
}

function renderPedidosList(orders) {
  const list = document.getElementById('cantina-pedidos-list');
  if (!list) return;

  let filtered = orders;
  if (window._pedidosFilter !== 'all') {
    filtered = orders.filter(o => o.status === window._pedidosFilter);
  }

  if (!filtered.length) {
    list.innerHTML = `<div style="text-align:center;padding:60px;color:rgba(255,255,255,0.3);">
      <div style="font-size:2.5rem;margin-bottom:12px;">📭</div>
      <div>Nenhum pedido encontrado</div>
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(o => renderPedidoCard(o)).join('');
}

function renderPedidoCard(o) {
  const st = cantinaStatusLabel(o.status);
  const items = o.items || [];
  const itemsSummary = items.map(i => `${i.qty}x ${i.name}`).join(', ');
  const cfg = window._cantinaConfig;
  const sym = cfg?.currency_symbol || 'R$';

  const isExpiring = o.status === 'pending' && o.expires_at;
  let countdownHtml = '';
  if (isExpiring) {
    const msLeft = new Date(o.expires_at) - new Date();
    if (msLeft > 0) {
      const minsLeft = Math.ceil(msLeft / 60000);
      countdownHtml = `<span style="font-size:0.7rem;color:${minsLeft <= 5 ? '#f87171' : '#fbbf24'};font-weight:700;">⏱️ ${minsLeft}min restantes</span>`;
    }
  }

  return `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px 18px;display:flex;align-items:flex-start;gap:14px;">
    <!-- Status indicator -->
    <div style="width:4px;align-self:stretch;border-radius:4px;background:${st.color};flex-shrink:0;"></div>
    <!-- Main info -->
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
        <span style="font-weight:800;font-size:0.95rem;color:#fff;">${o.order_number || o.id.substr(0,6)}</span>
        <span style="font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:20px;background:${st.bg};color:${st.color};">${st.label}</span>
        <span style="font-size:0.7rem;color:rgba(255,255,255,0.3);">${o.order_type === 'pos' ? '🏪 Balcão' : '🌐 Online'}</span>
        ${countdownHtml}
      </div>
      <div style="font-size:0.85rem;color:#fff;font-weight:600;">${o.customer_name}</div>
      <div style="font-size:0.75rem;color:rgba(255,255,255,0.4);">${o.customer_phone}</div>
      <div style="font-size:0.78rem;color:rgba(255,255,255,0.5);margin-top:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${itemsSummary}</div>
    </div>
    <!-- Amount + time -->
    <div style="text-align:right;flex-shrink:0;">
      <div style="font-weight:800;font-size:1rem;color:#fb7185;">${sym} ${parseFloat(o.total||0).toFixed(2).replace('.',',')}</div>
      <div style="font-size:0.7rem;color:rgba(255,255,255,0.3);margin-top:2px;">${cantinaTimeAgo(o.created_at)}</div>
      <div style="font-size:0.7rem;color:${o.payment_status==='paid' ? '#34d399' : '#fbbf24'};margin-top:2px;font-weight:600;">${o.payment_status==='paid' ? '✅ Pago' : '⏳ Aguardando'}</div>
    </div>
    <!-- Actions -->
    <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
      ${o.status === 'pending' ? `<button onclick="updateOrderStatus('${o.id}','confirmed')" style="background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);color:#60a5fa;border-radius:8px;padding:5px 10px;font-size:0.72rem;cursor:pointer;white-space:nowrap;">✓ Confirmar</button>` : ''}
      ${o.status === 'confirmed' ? `<button onclick="updateOrderStatus('${o.id}','ready')" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);color:#34d399;border-radius:8px;padding:5px 10px;font-size:0.72rem;cursor:pointer;white-space:nowrap;">✓ Pronto</button>` : ''}
      ${o.status === 'ready' ? `<button onclick="updateOrderStatus('${o.id}','delivered')" style="background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);color:#a78bfa;border-radius:8px;padding:5px 10px;font-size:0.72rem;cursor:pointer;white-space:nowrap;">✓ Entregue</button>` : ''}
      ${o.payment_status === 'unpaid' && ['pending','confirmed','ready'].includes(o.status) ? `<button onclick="markOrderPaid('${o.id}')" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);color:#34d399;border-radius:8px;padding:5px 10px;font-size:0.72rem;cursor:pointer;white-space:nowrap;">💰 Pago</button>` : ''}
      ${['pending','confirmed'].includes(o.status) ? `<button onclick="updateOrderStatus('${o.id}','cancelled')" style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);color:#f87171;border-radius:8px;padding:5px 10px;font-size:0.72rem;cursor:pointer;white-space:nowrap;">✕ Cancelar</button>` : ''}
    </div>
  </div>`;
}

function updatePedidosKPIs(orders) {
  const today = new Date().toDateString();
  const hoje = orders.filter(o => new Date(o.created_at).toDateString() === today);
  const pendentes = orders.filter(o => o.status === 'pending');
  const prontos = orders.filter(o => o.status === 'ready');
  const receitaHoje = hoje.filter(o => o.payment_status === 'paid').reduce((s,o) => s + parseFloat(o.total||0), 0);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('cantina-kpi-hoje', hoje.length);
  set('cantina-kpi-pendentes', pendentes.length);
  set('cantina-kpi-prontos', prontos.length);
  set('cantina-kpi-receita', cantinaFmt(receitaHoje));
}

function updateCantinaBadge(orders) {
  const pending = orders.filter(o => ['pending','ready'].includes(o.status)).length;
  const badge = document.getElementById('cantina-pending-badge');
  if (badge) {
    badge.textContent = pending;
    badge.style.display = pending > 0 ? 'flex' : 'none';
  }
  const badge2 = document.getElementById('cantina-orders-badge');
  if (badge2) {
    badge2.textContent = pending;
    badge2.style.display = pending > 0 ? 'flex' : 'none';
  }
}

async function updateOrderStatus(orderId, status) {
  const sb = getSupabase();
  await sb.from('cantina_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
  showToast('Status atualizado!', 'success');
  loadCantinaPedidos();
}

async function markOrderPaid(orderId) {
  const sb = getSupabase();
  await sb.from('cantina_orders').update({ payment_status: 'paid', status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', orderId);
  // Log transaction
  const o = window._cantinaPedidos.find(x => x.id === orderId);
  if (o) {
    const wsId = await getWorkspaceId();
    await sb.from('cantina_transactions').insert({
      workspace_id: wsId,
      type: 'sale',
      description: `Pedido ${o.order_number || orderId.substr(0,6)} — ${o.customer_name}`,
      amount: parseFloat(o.total || 0),
      payment_method: o.payment_method || 'cash',
      order_id: orderId,
    });
  }
  showToast('💰 Pagamento registrado!', 'success');
  loadCantinaPedidos();
}

// ═══════════════════════════════════════════════════════════
// SECTION 4 — FINANCEIRO
// ═══════════════════════════════════════════════════════════

async function loadCantinaFinanceiro() {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  if (!wsId) return;
  if (!window._cantinaConfig) await loadCantinaConfig();

  let query = sb.from('cantina_transactions').select('*').eq('workspace_id', wsId).order('created_at', { ascending: false });

  if (window._finPeriodDays > 0) {
    const since = new Date();
    since.setDate(since.getDate() - window._finPeriodDays);
    query = query.gte('created_at', since.toISOString());
  }

  const { data: txns } = await query;
  window._cantinaTransactions = txns || [];
  renderFinanceiro(window._cantinaTransactions);
  updateFinKPIs(window._cantinaTransactions);
}

function setFinPeriod(days, btn) {
  window._finPeriodDays = days;
  document.querySelectorAll('#view-cantina-financeiro .hub-period-tab').forEach(b => {
    if (['7d','30d','Tudo'].some(l => b.textContent.trim() === l)) b.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
  loadCantinaFinanceiro();
}

function filterCantinaFin(type, btn) {
  window._finTypeFilter = type;
  const tabs = document.querySelectorAll('#view-cantina-financeiro .hub-period-tab');
  tabs.forEach(b => {
    if (['Tudo','Vendas','Despesas','Doações'].some(l => b.textContent.trim() === l)) b.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
  renderFinanceiro(window._cantinaTransactions);
}

function renderFinanceiro(txns) {
  const tbody = document.getElementById('cantina-fin-tbody');
  if (!tbody) return;

  let filtered = txns;
  if (window._finTypeFilter !== 'all') {
    filtered = txns.filter(t => t.type === window._finTypeFilter);
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:40px;text-align:center;color:rgba(255,255,255,0.3);">Nenhuma transação encontrada</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const isIn = t.amount > 0;
    const typeMap = { sale: '💰 Venda', expense: '📉 Despesa', donation: '🎁 Doação', adjustment: '🔧 Ajuste', refund: '↩️ Reembolso' };
    return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
      <td style="padding:10px 12px;color:rgba(255,255,255,0.5);font-size:0.78rem;">${new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
      <td style="padding:10px 12px;font-size:0.78rem;">${typeMap[t.type] || t.type}</td>
      <td style="padding:10px 12px;color:rgba(255,255,255,0.8);font-size:0.82rem;">${t.description}</td>
      <td style="padding:10px 12px;color:rgba(255,255,255,0.4);font-size:0.78rem;">${paymentLabel(t.payment_method)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;color:${isIn ? '#34d399' : '#f87171'};">${isIn ? '+' : ''}${cantinaFmt(t.amount)}</td>
    </tr>`;
  }).join('');
}

function updateFinKPIs(txns) {
  const receitas = txns.filter(t => t.amount > 0 && t.type !== 'donation').reduce((s,t) => s + parseFloat(t.amount), 0);
  const despesas = txns.filter(t => t.amount < 0 || t.type === 'expense').reduce((s,t) => s + Math.abs(parseFloat(t.amount)), 0);
  const doacoes = txns.filter(t => t.type === 'donation').reduce((s,t) => s + parseFloat(t.amount), 0);
  const pos = txns.filter(t => t.type === 'sale').reduce((s,t) => s + parseFloat(t.amount), 0);
  const saldo = receitas + doacoes - despesas;

  const set = (id, val, color) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = val; if (color) el.style.color = color; }
  };
  set('fin-kpi-receitas', cantinaFmt(receitas));
  set('fin-kpi-despesas', cantinaFmt(despesas));
  set('fin-kpi-saldo', cantinaFmt(saldo), saldo >= 0 ? '#34d399' : '#f87171');
  set('fin-kpi-pos', cantinaFmt(pos));
  set('fin-kpi-doacoes', cantinaFmt(doacoes));
}

// ─── Lançamentos ────────────────────────────────────────────

function openLancamentoModal(type) {
  const modal = document.getElementById('modal-cantina-lancamento');
  if (!modal) return;
  const isExpense = type === 'expense';
  document.getElementById('lancamento-type').value = isExpense ? 'expense' : 'donation';
  document.getElementById('lancamento-modal-title').textContent = isExpense ? '➖ Lançar Despesa' : '➕ Lançar Receita';
  document.getElementById('lancamento-desc').value = '';
  document.getElementById('lancamento-amount').value = '';
  document.getElementById('lancamento-msg').textContent = '';
  modal.style.display = 'flex';
}

async function saveLancamento() {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  if (!wsId) return;

  const type = document.getElementById('lancamento-type').value;
  const desc = document.getElementById('lancamento-desc').value.trim();
  const rawAmount = parseFloat(document.getElementById('lancamento-amount').value) || 0;
  const payMethod = document.getElementById('lancamento-payment').value;
  const msgEl = document.getElementById('lancamento-msg');

  if (!desc) { if (msgEl) msgEl.textContent = '⚠️ Descrição obrigatória'; return; }
  if (!rawAmount) { if (msgEl) msgEl.textContent = '⚠️ Valor inválido'; return; }

  const amount = type === 'expense' ? -Math.abs(rawAmount) : Math.abs(rawAmount);

  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('cantina_transactions').insert({
    workspace_id: wsId,
    type,
    description: desc,
    amount,
    payment_method: payMethod,
    created_by: user?.id,
  });

  if (error) {
    if (msgEl) msgEl.textContent = '❌ ' + error.message;
  } else {
    document.getElementById('modal-cantina-lancamento').style.display = 'none';
    showToast('✅ Lançamento registrado!', 'success');
    loadCantinaFinanceiro();
  }
}

// ─── Fechar Caixa ────────────────────────────────────────────

async function fecharCaixa() {
  const cfg = window._cantinaConfig;
  if (!cfg) { showToast('Carregue as configurações primeiro', 'error'); return; }

  const txns = window._cantinaTransactions;
  const totalSales = txns.filter(t => t.amount > 0 && t.type !== 'donation').reduce((s,t) => s + parseFloat(t.amount), 0);
  const totalExpenses = txns.filter(t => t.amount < 0 || t.type === 'expense').reduce((s,t) => s + Math.abs(parseFloat(t.amount)), 0);
  const totalDonations = txns.filter(t => t.type === 'donation').reduce((s,t) => s + parseFloat(t.amount), 0);
  const net = totalSales + totalDonations - totalExpenses;
  const orderCount = window._cantinaPedidos.filter(o => o.payment_status === 'paid').length;

  // breakdown by payment method
  const breakdown = {};
  txns.filter(t => t.amount > 0).forEach(t => {
    const m = t.payment_method || 'other';
    breakdown[m] = (breakdown[m] || 0) + parseFloat(t.amount);
  });

  const sym = cfg.currency_symbol || 'R$';
  const fmt = v => sym + ' ' + Math.abs(v).toFixed(2).replace('.', ',');

  const breakdownText = Object.entries(breakdown).map(([m,v]) => `${paymentLabel(m)}: ${fmt(v)}`).join('\n');

  if (!confirm(`🔒 Fechar Caixa\n\n` +
    `Receitas: ${fmt(totalSales)}\n` +
    `Despesas: ${fmt(totalExpenses)}\n` +
    `Doações: ${fmt(totalDonations)}\n` +
    `Saldo líquido: ${fmt(net)}\n` +
    `Pedidos pagos: ${orderCount}\n\n` +
    `${breakdownText}\n\n` +
    `Confirmar fechamento?`)) return;

  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  const { data: { user } } = await sb.auth.getUser();

  const now = new Date().toISOString();
  const since = window._finPeriodDays > 0
    ? new Date(Date.now() - window._finPeriodDays * 86400000).toISOString()
    : new Date(0).toISOString();

  const { error } = await sb.from('cantina_cash_closings').insert({
    workspace_id: wsId,
    period_start: since,
    period_end: now,
    total_sales: totalSales,
    total_expenses: totalExpenses,
    total_donations: totalDonations,
    net,
    order_count: orderCount,
    payment_breakdown: breakdown,
    email_sent_to: cfg.responsible_email || null,
    closed_by: user?.id,
  });

  if (error) { showToast('Erro ao fechar caixa: ' + error.message, 'error'); return; }

  // Send email via Resend Edge Function (if configured)
  if (cfg.responsible_email && cfg.notif_cash_closing) {
    try {
      await sendCashClosingEmail({ totalSales, totalExpenses, totalDonations, net, orderCount, breakdown, sym, cfg });
    } catch(e) { console.warn('Email não enviado:', e); }
  }

  // Confetti!
  if (typeof triggerConfetti === 'function') triggerConfetti();

  showToast('✅ Caixa fechado! Relatório enviado.', 'success');
  loadCantinaFinanceiro();
}

async function sendCashClosingEmail({ totalSales, totalExpenses, totalDonations, net, orderCount, breakdown, sym, cfg }) {
  const fmt = v => sym + ' ' + Math.abs(v).toFixed(2).replace('.', ',');
  const bkHtml = Object.entries(breakdown).map(([m,v]) => `<tr><td>${paymentLabel(m)}</td><td><b>${fmt(v)}</b></td></tr>`).join('');

  const html = `
    <h2>🔒 Fechamento de Caixa — ${cfg.store_name || 'Cantina'}</h2>
    <p>${new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' })}</p>
    <table border="0" cellpadding="8" style="border-collapse:collapse;width:100%;max-width:400px;">
      <tr style="background:#f9f9f9;"><td>💰 Receitas</td><td><b>${fmt(totalSales)}</b></td></tr>
      <tr><td>📉 Despesas</td><td><b style="color:red;">${fmt(totalExpenses)}</b></td></tr>
      <tr style="background:#f9f9f9;"><td>🎁 Doações</td><td><b>${fmt(totalDonations)}</b></td></tr>
      <tr style="font-size:1.1em;"><td><b>Saldo Líquido</b></td><td><b style="color:${net>=0?'green':'red'}">${fmt(net)}</b></td></tr>
      <tr><td>🧾 Pedidos pagos</td><td><b>${orderCount}</b></td></tr>
    </table>
    <h3>Por forma de pagamento:</h3>
    <table border="0" cellpadding="8">${bkHtml}</table>
    <p style="color:#999;font-size:0.85em;">Enviado automaticamente pelo Zelo Pro</p>
  `;

  // Use the existing Resend function pattern from the project
  const SUPABASE_URL = getSupabase().supabaseUrl || window.SUPABASE_URL;
  const anon = window.SUPABASE_ANON_KEY || '';
  await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anon}` },
    body: JSON.stringify({
      to: cfg.responsible_email,
      from: 'donotreply@7pro.tech',
      subject: `🔒 Fechamento de Caixa — ${cfg.store_name || 'Cantina'} — ${new Date().toLocaleDateString('pt-BR')}`,
      html,
    }),
  });
}

// ═══════════════════════════════════════════════════════════
// SECTION 5 — POS
// ═══════════════════════════════════════════════════════════

async function initPOS() {
  if (!window._cantinaConfig) await loadCantinaConfig();
  if (!window._cantinaProducts.length) await loadCantinaEstoque();
  window._posCart = [];
  window._posPaymentMethod = null;
  renderPOSProducts(window._cantinaProducts.filter(p => !p.archived));
  renderPaymentMethodButtons();
  renderPOSCart();
}

function switchPOSMode(mode, btn) {
  document.querySelectorAll('#view-cantina-pos .hub-period-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const salePanel = document.getElementById('pos-sale-panel');
  const deliveryPanel = document.getElementById('pos-delivery-panel');
  const checkoutBtn = document.getElementById('pos-checkout-btn');

  if (mode === 'sale') {
    if (salePanel) salePanel.style.display = 'block';
    if (deliveryPanel) deliveryPanel.style.display = 'none';
    if (checkoutBtn) checkoutBtn.textContent = '✓ Finalizar Venda';
    renderPOSProducts(window._cantinaProducts.filter(p => !p.archived));
  } else {
    if (salePanel) salePanel.style.display = 'none';
    if (deliveryPanel) deliveryPanel.style.display = 'block';
    if (checkoutBtn) checkoutBtn.onclick = () => {};
    loadPOSDeliveries();
  }
}

function renderPOSProducts(products) {
  const grid = document.getElementById('pos-products-grid');
  if (!grid) return;

  const cfg = window._cantinaConfig;
  const sym = cfg?.currency_symbol || 'R$';

  if (!products.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:rgba(255,255,255,0.3);">Nenhum produto disponível</div>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const photo = p.photos?.[0];
    const isOut = p.qty_total <= 0;
    return `<div onclick="${isOut ? '' : `addToCart('${p.id}')`}" 
      style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,${isOut?'0.04':'0.08'});border-radius:14px;overflow:hidden;cursor:${isOut?'not-allowed':'pointer'};opacity:${isOut?'0.4':'1'};transition:all .15s;user-select:none;"
      ${isOut ? '' : `onmouseover="this.style.background='rgba(251,113,133,0.08)';this.style.border='1px solid rgba(251,113,133,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.04)';this.style.border='1px solid rgba(255,255,255,0.08)'"`}>
      <div style="height:100px;background:rgba(0,0,0,0.2);overflow:hidden;">
        ${photo ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;color:rgba(255,255,255,0.15);">📦</div>`}
      </div>
      <div style="padding:10px;">
        <div style="font-weight:700;font-size:0.85rem;color:#fff;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:800;color:#fb7185;font-size:0.9rem;">${sym} ${parseFloat(p.price).toFixed(2).replace('.',',')}</span>
          <span style="font-size:0.65rem;color:rgba(255,255,255,0.3);">${isOut ? 'SEM ESTOQUE' : `${p.qty_total} un`}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function searchPOSProducts() {
  const q = (document.getElementById('pos-search')?.value || '').toLowerCase();
  const filtered = window._cantinaProducts.filter(p => !p.archived && p.name.toLowerCase().includes(q));
  renderPOSProducts(filtered);
}

function renderPaymentMethodButtons() {
  const container = document.getElementById('pos-payment-methods');
  if (!container) return;
  const methods = window._cantinaConfig?.payment_methods || ['cash','pix','card'];
  const labels = { cash: '💵 Dinheiro', pix: '📲 Pix', card: '💳 Cartão', stripe: '⚡ Stripe' };
  container.innerHTML = methods.map(m => `
    <button onclick="selectPOSPayment('${m}',this)" id="pos-pm-${m}"
      style="padding:7px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.7);font-size:0.78rem;cursor:pointer;transition:all .15s;">
      ${labels[m] || m}
    </button>
  `).join('');
}

function selectPOSPayment(method, btn) {
  window._posPaymentMethod = method;
  document.querySelectorAll('#pos-payment-methods button').forEach(b => {
    b.style.background = 'rgba(255,255,255,0.05)';
    b.style.borderColor = 'rgba(255,255,255,0.12)';
    b.style.color = 'rgba(255,255,255,0.7)';
  });
  if (btn) {
    btn.style.background = 'rgba(251,113,133,0.15)';
    btn.style.borderColor = 'rgba(251,113,133,0.4)';
    btn.style.color = '#fb7185';
  }
}

function addToCart(productId) {
  const p = window._cantinaProducts.find(x => x.id === productId);
  if (!p) return;
  const existing = window._posCart.find(x => x.product_id === productId);
  if (existing) {
    existing.qty += 1;
    existing.subtotal = existing.qty * existing.unit_price;
  } else {
    window._posCart.push({
      product_id: productId,
      name: p.name,
      qty: 1,
      unit_price: parseFloat(p.price),
      subtotal: parseFloat(p.price),
    });
  }
  renderPOSCart();
  // little bounce animation on cart
  const totalEl = document.getElementById('pos-cart-total');
  if (totalEl) { totalEl.style.transform = 'scale(1.2)'; setTimeout(() => totalEl.style.transform = '', 200); }
}

function renderPOSCart() {
  const container = document.getElementById('pos-cart-items');
  const countEl = document.getElementById('pos-cart-count');
  const totalEl = document.getElementById('pos-cart-total');
  if (!container) return;

  const cfg = window._cantinaConfig;
  const sym = cfg?.currency_symbol || 'R$';
  const total = window._posCart.reduce((s, i) => s + i.subtotal, 0);
  const count = window._posCart.reduce((s, i) => s + i.qty, 0);

  if (countEl) countEl.textContent = count + (count === 1 ? ' item' : ' itens');
  if (totalEl) totalEl.textContent = sym + ' ' + total.toFixed(2).replace('.', ',');

  if (!window._posCart.length) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.2);font-size:0.85rem;">Carrinho vazio</div>`;
    return;
  }

  container.innerHTML = window._posCart.map((item, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(255,255,255,0.03);border-radius:10px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.82rem;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);">${sym} ${item.unit_price.toFixed(2).replace('.',',')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <button onclick="changePOSQty(${i},-1)" style="background:rgba(255,255,255,0.08);border:none;color:#fff;border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:1rem;font-weight:700;display:flex;align-items:center;justify-content:center;">−</button>
        <span style="font-size:0.85rem;font-weight:700;color:#fff;min-width:20px;text-align:center;">${item.qty}</span>
        <button onclick="changePOSQty(${i},1)" style="background:rgba(255,255,255,0.08);border:none;color:#fff;border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:1rem;font-weight:700;display:flex;align-items:center;justify-content:center;">+</button>
      </div>
      <div style="font-size:0.82rem;font-weight:700;color:#fb7185;min-width:50px;text-align:right;">${sym} ${item.subtotal.toFixed(2).replace('.',',')}</div>
    </div>
  `).join('');
}

function changePOSQty(index, delta) {
  const item = window._posCart[index];
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { window._posCart.splice(index, 1); }
  else { item.subtotal = item.qty * item.unit_price; }
  renderPOSCart();
}

function clearPOSCart() {
  window._posCart = [];
  window._posPaymentMethod = null;
  document.querySelectorAll('#pos-payment-methods button').forEach(b => {
    b.style.background = 'rgba(255,255,255,0.05)';
    b.style.borderColor = 'rgba(255,255,255,0.12)';
    b.style.color = 'rgba(255,255,255,0.7)';
  });
  renderPOSCart();
}

async function processPOSSale() {
  if (!window._posCart.length) { showToast('⚠️ Carrinho vazio', 'error'); return; }
  if (!window._posPaymentMethod) { showToast('⚠️ Selecione a forma de pagamento', 'error'); return; }

  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  if (!wsId) return;

  const total = window._posCart.reduce((s, i) => s + i.subtotal, 0);
  const customerName = document.getElementById('pos-customer-name')?.value.trim() || 'Venda POS';
  const { data: { user } } = await sb.auth.getUser();

  const btn = document.getElementById('pos-checkout-btn');
  if (btn) { btn.textContent = '⏳ Processando...'; btn.disabled = true; }

  const isStripe = window._posPaymentMethod === 'stripe';

  const { data: order, error: orderError } = await sb.from('cantina_orders').insert({
    workspace_id: wsId,
    customer_name: customerName,
    customer_phone: 'POS',
    items: window._posCart,
    total,
    status: 'delivered',
    payment_method: window._posPaymentMethod,
    payment_status: isStripe ? 'unpaid' : 'paid',
    order_type: 'pos',
  }).select().single();

  if (orderError) {
    showToast('Erro ao registrar venda: ' + orderError.message, 'error');
    if (btn) { btn.textContent = '✓ Finalizar Venda'; btn.disabled = false; }
    return;
  }

  if (isStripe) {
    btn.textContent = '🔗 Gerando Pagamento...';
    try {
      const EDGE_URL = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1';
      const res = await fetch(`${EDGE_URL}/cantina-stripe-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: wsId,
          order_id: order.id,
          order_number: order.order_number || order.id.substring(0,6),
          items: window._posCart.map(i => ({ name: i.name, qty: i.qty, unit_price: i.unit_price })),
          total,
          currency: window._cantinaConfig?.currency || 'BRL',
          success_url: location.origin + location.pathname,
          cancel_url: location.origin + location.pathname
        })
      });

      if (!res.ok) throw new Error('Erro ao gerar link Stripe');
      const data = await res.json();
      
      if (data.url) {
        const modal = document.getElementById('modal-pos-stripe-qr');
        const qrImg = document.getElementById('pos-stripe-qr-img');
        const amtEl = document.getElementById('pos-stripe-amount');
        if (modal && qrImg && amtEl) {
          const sym = window._cantinaConfig?.currency_symbol || 'R$';
          amtEl.textContent = `${sym} ${total.toFixed(2).replace('.',',')}`;
          qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.url)}`;
          modal.style.display = 'flex';
          showToast('💳 Mostre o QR Code ao cliente', 'success');
        }
      } else {
        throw new Error('URL Stripe não retornada');
      }
    } catch (err) {
      showToast('❌ Falha ao criar link Stripe', 'error');
      console.error(err);
      if (btn) { btn.textContent = '✓ Finalizar Venda'; btn.disabled = false; }
      return;
    }
  } else {
    // Log financial transaction for non-Stripe
    await sb.from('cantina_transactions').insert({
      workspace_id: wsId,
      type: 'sale',
      description: `Venda POS — ${customerName} — ${order.order_number || order.id.substr(0,6)}`,
      amount: total,
      payment_method: window._posPaymentMethod,
      order_id: order.id,
      created_by: user?.id,
    });
    
    showToast('✅ Venda registrada! ' + (window._cantinaConfig?.currency_symbol || 'R$') + ' ' + total.toFixed(2).replace('.',','), 'success');
    if (typeof triggerConfetti === 'function') triggerConfetti();
  }

  if (btn) { btn.textContent = '✓ Finalizar Venda'; btn.disabled = false; }
  clearPOSCart();
}

async function loadPOSDeliveries() {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  const { data: orders } = await sb.from('cantina_orders')
    .select('*').eq('workspace_id', wsId)
    .in('status', ['pending','confirmed','ready'])
    .eq('order_type', 'online')
    .order('created_at', { ascending: true });

  const list = document.getElementById('pos-orders-list');
  if (!list) return;

  if (!orders || !orders.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">Nenhuma encomenda pendente</div>`;
    return;
  }

  const cfg = window._cantinaConfig;
  const sym = cfg?.currency_symbol || 'R$';

  list.innerHTML = orders.map(o => {
    const st = cantinaStatusLabel(o.status);
    const items = (o.items || []).map(i => `${i.qty}x ${i.name}`).join(', ');
    return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;">
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
          <span style="font-weight:800;color:#fff;">${o.order_number || o.id.substr(0,6)}</span>
          <span style="font-size:0.68rem;padding:2px 7px;border-radius:20px;background:${st.bg};color:${st.color};">${st.label}</span>
        </div>
        <div style="font-size:0.82rem;color:rgba(255,255,255,0.7);">${o.customer_name} · ${o.customer_phone}</div>
        <div style="font-size:0.75rem;color:rgba(255,255,255,0.4);">${items}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:800;color:#fb7185;">${sym} ${parseFloat(o.total||0).toFixed(2).replace('.',',')}</div>
        <button onclick="deliverOrder('${o.id}')" style="margin-top:6px;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:0.75rem;font-weight:700;cursor:pointer;">✓ Entregar</button>
      </div>
    </div>`;
  }).join('');
}

async function deliverOrder(orderId) {
  const sb = getSupabase();
  const wsId = await getWorkspaceId();
  await sb.from('cantina_orders').update({
    status: 'delivered',
    payment_status: 'paid',
    payment_method: window._posPaymentMethod || 'cash',
    updated_at: new Date().toISOString(),
  }).eq('id', orderId);

  const o = (await sb.from('cantina_orders').select('*').eq('id', orderId).single()).data;
  if (o) {
    const { data: { user } } = await sb.auth.getUser();
    await sb.from('cantina_transactions').insert({
      workspace_id: wsId,
      type: 'sale',
      description: `Entrega ${o.order_number || orderId.substr(0,6)} — ${o.customer_name}`,
      amount: parseFloat(o.total || 0),
      payment_method: window._posPaymentMethod || 'cash',
      order_id: orderId,
      created_by: user?.id,
    });
  }

  showToast('✅ Entrega registrada!', 'success');
  loadPOSDeliveries();
}

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════

function copyCantinaPublicUrl() {
  const wsId = window._cantinaConfig?.workspace_id;
  if (!wsId) return;
  const url = `${location.origin}/cantina.html?ws=${wsId}`;
  navigator.clipboard.writeText(url).then(() => showToast('📋 Link copiado!', 'success'));
}

function showToast(msg, type = 'success') {
  // Use existing global toast if available, else create one
  if (typeof window.showToast === 'function' && window.showToast !== showToast) {
    return window.showToast(msg, type);
  }
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:12px;font-weight:600;font-size:0.88rem;font-family:inherit;color:#fff;background:${type==='success'?'#059669':type==='error'?'#dc2626':'#374151'};box-shadow:0 8px 24px rgba(0,0,0,0.4);animation:slideInRight .3s ease;`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Init on load ─────────────────────────────────────────────
(function initCantina() {
  // Pre-load config when module loads (non-blocking)
  if (typeof getSupabase === 'function') {
    loadCantinaConfig().catch(e => console.warn('Cantina config load deferred:', e));
  }
})();
