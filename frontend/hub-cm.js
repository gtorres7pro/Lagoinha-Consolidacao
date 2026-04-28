/* ═══════════════════════════════════════════════════════════
   hub-cm.js — Módulo CRIE Mulheres — Zelo Pro
   v20260424p5 — Phase 5 final (check-in, CRIE App integration, config)
   Follows Rule #8: lazy-load via patchSwitchTab() IIFE
═══════════════════════════════════════════════════════════ */

// ── Module State ─────────────────────────────────────────────
window._cmEvents      = [];
window._cmAttendees   = [];
window._cmMembers     = [];
window._cmFinances    = [];
window._cmSettings    = null;
window._cmStripeConnected = false;
window._cmStripeStateLoading = false;
window._cmEventFilter = 'all';
window._cmMemberSearch = '';

// ── Helpers ───────────────────────────────────────────────────
function cmSb() { return window.supabaseClient || window._supabase || window.supabase; }
async function cmWsId() {
  if (window.currentWorkspaceId) return window.currentWorkspaceId;
  const sb = cmSb();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('users').select('workspace_id').eq('id', user.id).single();
  return data?.workspace_id || null;
}
function cmFmt(amount, sym) {
  sym = sym || (window._cmSettings?.currency_symbol || 'R$');
  return sym + ' ' + parseFloat(amount || 0).toFixed(2).replace('.', ',');
}
function cmDateStr(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
}
const CM_ROSE = '#d6336c';
const CM_ROSE2 = '#a61e4d';
const EDGE = 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1';

// ── Lazy-load patch (Rule #8) ─────────────────────────────────
(function patchSwitchTab() {
  const _orig = window.switchTab;
  if (!_orig) { setTimeout(patchSwitchTab, 100); return; }
  window.switchTab = function(tab, ...args) {
    _orig(tab, ...args);
    if (tab && tab.startsWith('cm-')) onCmTabSwitch(tab);
  };
})();

function onCmTabSwitch(tab) {
  if (tab === 'cm-inscritos')  loadCmInscritos();
  else if (tab === 'cm-membros')   loadCmMembros();
  else if (tab === 'cm-eventos')   loadCmEventos();
  else if (tab === 'cm-checkin')   loadCmCheckin();
  else if (tab === 'cm-relatorios') loadCmRelatorios();
}


// ═══════════════════════════════════════════════════════════
// SECTION 1 — SETTINGS (cm_settings on workspaces)
// ═══════════════════════════════════════════════════════════

async function loadCmSettings() {
  const sb = cmSb();
  const wsId = await cmWsId();
  if (!wsId) return null;
  const { data } = await sb.from('workspaces').select('cm_settings').eq('id', wsId).single();
  window._cmSettings = data?.cm_settings || {};
  return window._cmSettings;
}

async function _initCmStripeState() {
  if (window._cmStripeStateLoading) return;
  window._cmStripeStateLoading = true;
  const cfg = await loadCmSettings();
  window._cmStripeConnected = !!(cfg?.stripe_connected);
  window._cmStripeStateLoading = false;
}

// ── Load Relatorios / Configurações tab ──────────────────────
async function loadCmRelatorios() {
  const sb = cmSb();
  const wsId = await cmWsId();
  if (!wsId) return;

  // Load finances
  const { data: finances } = await sb.from('cm_finances')
    .select('*').eq('workspace_id', wsId)
    .order('created_at', { ascending: false });
  window._cmFinances = finances || [];
  renderCmFinances(window._cmFinances);

  // Init settings tab
  await _initCmStripeState();
  renderCmConfigTab();
}

function renderCmFinances(rows) {
  const tbody = document.getElementById('cm-finances-body');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">Nenhuma transação registrada</td></tr>';
    return;
  }
  const typeMap = { income:'Receita', expense:'Despesa', donation:'Doação' };
  const typeColor = { income:'#34d399', expense:'#f87171', donation:'#a78bfa' };
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${cmDateStr(r.created_at)}</td>
      <td><span style="color:${typeColor[r.type]||'#fff'};font-weight:700;">${typeMap[r.type]||r.type}</span></td>
      <td>${r.description||'—'}</td>
      <td>${r.payment_method||'—'}</td>
      <td style="color:${r.type==='expense'?'#f87171':'#34d399'};font-weight:700;">${cmFmt(r.amount)}</td>
    </tr>`).join('');

  // KPIs
  const receitas = rows.filter(r=>r.type!=='expense').reduce((s,r)=>s+parseFloat(r.amount||0),0);
  const despesas = rows.filter(r=>r.type==='expense').reduce((s,r)=>s+parseFloat(r.amount||0),0);
  const setEl = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('cm-kpi-receitas', cmFmt(receitas));
  setEl('cm-kpi-despesas', cmFmt(despesas));
  setEl('cm-kpi-saldo', cmFmt(receitas - despesas));

  // Mensalidades KPI (sum from cm_membership_payments)
  cmSb().from('cm_membership_payments').select('amount').eq('status','paid')
    .then(({data}) => {
      const total = (data||[]).reduce((s,p)=>s+parseFloat(p.amount||0),0);
      setEl('cm-kpi-mensalidades', cmFmt(total));
    });
}

// switchCmRelTab — handles financeiro / por-evento / config
window.switchCmRelTab = function(tab, btn) {
  ['financeiro','por-evento','cupons','config'].forEach(t => {
    const panel = document.getElementById(`cm-rel-tab-${t}`);
    if (panel) panel.style.display = t===tab ? 'block' : 'none';
  });
  document.querySelectorAll('.cm-tab-btn').forEach(b => {
    const isActive = b.dataset.tab === tab;
    b.style.color = isActive ? '#d6336c' : 'rgba(255,255,255,.4)';
    b.style.borderBottom = isActive ? '2px solid #d6336c' : '2px solid transparent';
  });
  if (tab === 'por-evento') populateCmEventFilter();
  if (tab === 'cupons') loadCmCoupons();
};

async function populateCmEventFilter() {
  if (!window._cmEvents.length) await loadCmEventos();
  const sel = document.getElementById('cm-fin-event-filter');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecionar Evento —</option>' +
    window._cmEvents.map(e=>`<option value="${e.id}">${e.title}</option>`).join('');
}

window.loadCmFinancesByEvent = async function() {
  const sb = cmSb(); const wsId = await cmWsId();
  const eventId = document.getElementById('cm-fin-event-filter')?.value;
  const tbody = document.getElementById('cm-fin-event-body');
  const kpisEl = document.getElementById('cm-evento-fin-kpis');
  if (!eventId) { if(tbody) tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">Selecione um evento</td></tr>'; return; }

  const { data } = await sb.from('cm_finances').select('*').eq('workspace_id',wsId).eq('event_id',eventId).order('created_at',{ascending:false});
  const rows = data || [];
  const typeMap = { income:'Receita', expense:'Despesa', donation:'Doação' };
  const typeColor = { income:'#34d399', expense:'#f87171', donation:'#a78bfa' };

  if (!tbody) return;
  if (!rows.length) { tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:30px;color:rgba(255,255,255,.3);">Sem transações para este evento</td></tr>'; }
  else {
    tbody.innerHTML = rows.map(r=>`<tr>
      <td>${cmDateStr(r.created_at)}</td>
      <td><span style="color:${typeColor[r.type]||'#fff'};font-weight:700;">${typeMap[r.type]||r.type}</span></td>
      <td>${r.description||'—'}</td>
      <td>${r.payment_method||'—'}</td>
      <td style="color:${r.type==='expense'?'#f87171':'#34d399'};font-weight:700;">${cmFmt(r.amount)}</td>
    </tr>`).join('');
  }

  // Event KPIs
  const receitas = rows.filter(r=>r.type!=='expense').reduce((s,r)=>s+parseFloat(r.amount||0),0);
  const despesas = rows.filter(r=>r.type==='expense').reduce((s,r)=>s+parseFloat(r.amount||0),0);
  if (kpisEl) kpisEl.innerHTML = [
    `<span style="font-size:.78rem;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.2);color:#34d399;border-radius:8px;padding:5px 12px;">Receitas ${cmFmt(receitas)}</span>`,
    `<span style="font-size:.78rem;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:#f87171;border-radius:8px;padding:5px 12px;">Despesas ${cmFmt(despesas)}</span>`,
    `<span style="font-size:.78rem;background:rgba(214,51,108,.08);border:1px solid rgba(214,51,108,.2);color:#d6336c;border-radius:8px;padding:5px 12px;">Saldo ${cmFmt(receitas-despesas)}</span>`,
  ].join('');
};

async function renderCmConfigTab() {
  const cfg = window._cmSettings || {};
  const v = (id, val) => { const el=document.getElementById(id); if(el) el.value=val||''; };
  v('cm-cfg-fee', cfg.membership_fee || '');
  v('cm-cfg-currency', cfg.membership_currency || 'BRL');
  v('cm-cfg-country', cfg.default_country_code || '+55');
  v('cm-cfg-timezone', cfg.timezone || 'America/Sao_Paulo');

  const statusEl = document.getElementById('cm-stripe-status');
  const btnConn  = document.getElementById('btn-cm-stripe-connect');
  const btnDisc  = document.getElementById('btn-cm-stripe-disconnect');
  const acctInfo = document.getElementById('cm-stripe-account-info');
  const keyFields= document.getElementById('cm-stripe-key-fields');
  if (cfg.stripe_connected) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#4ade80;">⬤ Conectado</span>';
    if (btnConn) btnConn.style.display = 'none';
    if (btnDisc) btnDisc.style.display = 'inline-flex';
    if (keyFields) keyFields.style.display = 'none';
    if (acctInfo && cfg.stripe_account_name) acctInfo.textContent = `Conta: ${cfg.stripe_account_name} (${cfg.stripe_account_email||cfg.stripe_account_id||''})`;
  } else {
    if (statusEl) statusEl.innerHTML = '<span style="color:rgba(255,255,255,.3);">⬤ Não conectado</span>';
    if (btnConn) btnConn.style.display = 'inline-flex';
    if (btnDisc) btnDisc.style.display = 'none';
    if (keyFields) keyFields.style.display = 'flex';
    if (acctInfo) acctInfo.textContent = '';
  }
}

// saveCmConfig is defined at bottom of file (Section 8) — reads timezone too


window.addCmTransaction = async function() {
  const sb = cmSb();
  const wsId = await cmWsId();
  const type = document.getElementById('cm-fin-type')?.value || 'income';
  const desc = document.getElementById('cm-fin-desc')?.value?.trim();
  const amount = parseFloat(document.getElementById('cm-fin-amount')?.value) || 0;
  const method = document.getElementById('cm-fin-method')?.value || 'cash';
  if (!desc || !amount) { showToast('Preencha descrição e valor', 'error'); return; }
  const { error } = await sb.from('cm_finances').insert({ workspace_id:wsId, type, description:desc, amount, payment_method:method });
  if (error) { showToast('Erro: '+error.message,'error'); return; }
  showToast('✅ Transação registrada!','success');
  loadCmRelatorios();
};


// ═══════════════════════════════════════════════════════════
// SECTION 2 — EVENTOS (cm_events) — Phase 2 full parity
// ═══════════════════════════════════════════════════════════

window._cmDrawerEventoId = null;
window._cmDrawerBannerUrl = null;

// ── Status helpers ──────────────────────────────────────────
const CM_STATUS_LABEL = { draft:'Rascunho', active:'Ativo', concluido:'Concluído' };
const CM_STATUS_COLOR = { draft:'#d6336c', active:'#4ade80', concluido:'rgba(255,255,255,.4)' };

function cmStatusBadge(status) {
  const lbl = CM_STATUS_LABEL[status] || status;
  const col = CM_STATUS_COLOR[status] || '#999';
  return `<span style="font-size:.65rem;font-weight:700;padding:2px 9px;border-radius:20px;background:${col}18;color:${col};border:1px solid ${col}44;">${lbl}</span>`;
}

// ── Load & Render ──────────────────────────────────────────
async function loadCmEventos() {
  const sb = cmSb(); const wsId = await cmWsId(); if (!wsId) return;
  const { data } = await sb.from('cm_events').select('*').eq('workspace_id', wsId)
    .order('event_date', { ascending: false });
  window._cmEvents = data || [];
  renderCmEventos(window._cmEvents);
}

function renderCmEventos(events) {
  const grpAtivos    = document.getElementById('cm-grupo-ativos');
  const grpRascunhos = document.getElementById('cm-grupo-rascunhos');
  const grpFinal     = document.getElementById('cm-grupo-finalizados');
  if (!grpAtivos) return;

  const ativos    = events.filter(e => e.status === 'active');
  const rascunhos = events.filter(e => e.status === 'draft');
  const finalizados = events.filter(e => e.status === 'concluido');

  const emptyMsg = (msg) => `<div style="text-align:center;padding:20px;color:rgba(255,255,255,.2);grid-column:1/-1;font-size:.82rem;">${msg}</div>`;
  const cardHtml = (e) => {
    const dateStr = e.event_date ? new Date(e.event_date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}) : 'Data TBD';
    const price = parseFloat(e.price||0);
    const sym = e.currency === 'EUR' ? '€' : e.currency === 'USD' ? '$' : e.currency === 'GBP' ? '£' : 'R$';
    const priceLabel = e.is_free ? 'Gratuito' : price > 0 ? sym+' '+price.toFixed(2).replace('.',',') : 'Gratuito';
    return `<div style="background:rgba(255,255,255,.02);border:1px solid rgba(214,51,108,.12);border-radius:14px;overflow:hidden;cursor:pointer;" onclick="openCmEventoDrawer('${e.id}')">
      ${e.banner_url ? `<img src="${e.banner_url}" style="width:100%;height:130px;object-fit:cover;">` : `<div style="height:130px;background:rgba(214,51,108,.06);display:flex;align-items:center;justify-content:center;font-size:2rem;">💜</div>`}
      <div style="padding:14px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">${cmStatusBadge(e.status)}</div>
        <div style="font-weight:800;font-size:.92rem;color:#fff;margin-bottom:4px;">${e.title}</div>
        <div style="font-size:.74rem;color:rgba(255,255,255,.4);margin-bottom:10px;">📅 ${dateStr}${e.location?' · 📍'+e.location:''}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:800;color:${CM_ROSE};">${priceLabel}</span>
          <div style="display:flex;gap:4px;">
            ${e.online_payment_enabled ? '<span style="font-size:.65rem;background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.2);color:#34d399;border-radius:6px;padding:2px 6px;">Stripe</span>' : ''}
            ${e.open_to_guests ? '<span style="font-size:.65rem;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);color:#60a5fa;border-radius:6px;padding:2px 6px;">Público</span>' : ''}
          </div>
        </div>
      </div>
    </div>`;
  };

  grpAtivos.innerHTML    = ativos.length    ? ativos.map(cardHtml).join('')    : emptyMsg('Nenhum evento ativo');
  grpRascunhos.innerHTML = rascunhos.length ? rascunhos.map(cardHtml).join('') : emptyMsg('Nenhum rascunho');
  grpFinal.innerHTML     = finalizados.length ? finalizados.map(cardHtml).join('') : emptyMsg('Nenhum evento finalizado');
}

window.toggleCmFinalizadosGroup = function() {
  const g = document.getElementById('cm-grupo-finalizados');
  const ch = document.getElementById('cm-finalizados-chevron');
  if (!g) return;
  const hidden = g.style.display === 'none';
  g.style.display = hidden ? 'grid' : 'none';
  if (ch) ch.style.transform = hidden ? '' : 'rotate(-90deg)';
};

// ── New Evento (quick create → opens drawer) ────────────────
window.openCmEventoModal = async function() {
  const sb = cmSb(); const wsId = await cmWsId(); if (!wsId) return;
  const { data, error } = await sb.from('cm_events').insert({
    workspace_id: wsId, title: 'Novo Evento CM', status: 'draft', price: 0, is_free: true
  }).select().single();
  if (error) { showToast('Erro ao criar evento: '+error.message,'error'); return; }
  window._cmEvents.unshift(data);
  renderCmEventos(window._cmEvents);
  openCmEventoDrawer(data.id);
};

// ── Drawer open/close ──────────────────────────────────────
window.openCmEventoDrawer = function(eventId) {
  const e = window._cmEvents.find(x => x.id === eventId);
  if (!e) return;
  window._cmDrawerEventoId = eventId;
  window._cmDrawerBannerUrl = null;

  // Header
  const v = (id, val) => { const el=document.getElementById(id); if(el) el.value=val||''; };
  const setTxt = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val||''; };
  setTxt('cm-drawer-ev-title', e.title);
  const dStr = e.event_date ? new Date(e.event_date).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}) : '';
  setTxt('cm-drawer-ev-date', dStr);
  const bd = document.getElementById('cm-drawer-ev-status-badge');
  if (bd) bd.innerHTML = cmStatusBadge(e.status);

  // Info fields
  document.getElementById('cm-dedit-id').value = e.id;
  v('cm-dedit-title', e.title);
  v('cm-dedit-desc', e.description);
  v('cm-dedit-location', e.location);
  v('cm-dedit-capacity', e.capacity);
  v('cm-dedit-price', e.price);
  if (e.event_date) {
    const d = new Date(e.event_date);
    v('cm-dedit-date', new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16));
  } else { v('cm-dedit-date',''); }

  // Currency
  const curSel = document.getElementById('cm-dedit-currency');
  if (curSel) { Array.from(curSel.options).forEach(o => o.selected = o.value === (e.currency||'BRL')); }

  // Status
  const stSel = document.getElementById('cm-dedit-status');
  if (stSel) { Array.from(stSel.options).forEach(o => o.selected = o.value === (e.status||'active')); }

  // Toggles helper
  const setToggle = (id, on) => {
    const t = document.getElementById(id); if (!t) return;
    const knob = t.querySelector('div');
    t.style.background = on ? '#d6336c' : 'rgba(255,255,255,.1)';
    if (knob) knob.style.left = on ? '21px' : '3px';
    t.dataset.val = on ? '1' : '0';
  };
  setToggle('cm-toggle-is-free', !!e.is_free);
  setToggle('cm-toggle-online-payment', !!e.online_payment_enabled);
  setToggle('cm-toggle-open-to-guests', !!e.open_to_guests);
  const pr = document.getElementById('cm-dedit-price-row');
  if (pr) pr.style.display = e.is_free ? 'none' : 'grid';

  // Banner
  const ph = document.getElementById('cm-dedit-banner-placeholder');
  const pw = document.getElementById('cm-dedit-banner-preview-wrap');
  const pi = document.getElementById('cm-dedit-banner-preview-img');
  if (e.banner_url) {
    if (ph) ph.style.display='none'; if (pw) pw.style.display='block'; if (pi) pi.src=e.banner_url;
  } else {
    if (ph) ph.style.display='block'; if (pw) pw.style.display='none';
  }

  // Fechar/reopen wrap
  const fw = document.getElementById('cm-drawer-fechar-wrap');
  const rw = document.getElementById('cm-drawer-reopen-wrap');
  const fb = document.getElementById('btn-fechar-cm-evento');
  if (e.status === 'concluido') {
    if (fw && fb) { fw.style.display='block'; fb.style.display='none'; }
    if (rw) rw.style.display='block';
  } else {
    if (fw) fw.style.display = e.status === 'active' ? 'block' : 'none';
    if (rw) rw.style.display='none';
    if (fb) fb.style.display='block';
  }

  // ── #27: Inscription link + QR ──────────────────────────────
  const inscLink = window.location.origin + '/cm-inscricao.html?id=' + eventId;
  const linkEl   = document.getElementById('cm-drawer-link-url');
  const qrEl     = document.getElementById('cm-drawer-link-qr');
  if (linkEl) linkEl.textContent = inscLink;
  if (qrEl) {
    qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(inscLink)}`;
    qrEl.style.display = 'block';
  }
  window._cmDrawerInscricaoLink = inscLink;

  // Show drawer on Info tab
  switchCmDrawerTab('info');
  document.getElementById('cm-evento-drawer-overlay').style.display='block';
  const drawer = document.getElementById('cm-evento-drawer');
  drawer.style.display='flex';
  drawer.scrollTop = 0;
};

window.closeCmEventoDrawer = function() {
  document.getElementById('cm-evento-drawer-overlay').style.display='none';
  document.getElementById('cm-evento-drawer').style.display='none';
};

window.switchCmDrawerTab = function(tab) {
  ['info','inscritas','financeiro'].forEach(t => {
    const btn = document.getElementById(`cm-dtab-${t}`);
    const pan = document.getElementById(`cm-drawer-panel-${t === 'inscritas' ? 'inscritas' : t}`);
    const active = t === tab;
    if (btn) { btn.style.color = active ? '#d6336c' : 'rgba(255,255,255,.4)'; btn.style.borderBottomColor = active ? '#d6336c' : 'transparent'; }
    if (pan) pan.style.display = active ? (t === 'info' ? 'flex' : 'block') : 'none';
  });
  if (tab === 'inscritas') loadCmDrawerInscritas();
  if (tab === 'financeiro') loadCmDrawerFinanceiro();
};

// ── Save drawer ────────────────────────────────────────────
window.saveCmEventoDrawer = async function() {
  const sb = cmSb(); const wsId = await cmWsId();
  const id = document.getElementById('cm-dedit-id').value;
  const title = document.getElementById('cm-dedit-title')?.value?.trim();
  if (!title) { showToast('Título obrigatório','error'); return; }

  const getToggle = (tid) => document.getElementById(tid)?.dataset?.val === '1';

  const payload = {
    title,
    location: document.getElementById('cm-dedit-location')?.value||null,
    description: document.getElementById('cm-dedit-desc')?.value||null,
    price: parseFloat(document.getElementById('cm-dedit-price')?.value)||0,
    capacity: parseInt(document.getElementById('cm-dedit-capacity')?.value)||null,
    currency: document.getElementById('cm-dedit-currency')?.value||'BRL',
    status: document.getElementById('cm-dedit-status')?.value||'draft',
    is_free: getToggle('cm-toggle-is-free'),
    online_payment_enabled: getToggle('cm-toggle-online-payment'),
    open_to_guests: getToggle('cm-toggle-open-to-guests'),
  };
  const dateVal = document.getElementById('cm-dedit-date')?.value;
  if (dateVal) payload.event_date = new Date(dateVal).toISOString();
  if (window._cmDrawerBannerUrl) payload.banner_url = window._cmDrawerBannerUrl;
  else {
    const existing = window._cmEvents.find(x => x.id === id);
    if (existing?.banner_url) payload.banner_url = existing.banner_url;
  }

  const { error } = await sb.from('cm_events').update(payload).eq('id',id).eq('workspace_id',wsId);
  if (error) { showToast('Erro: '+error.message,'error'); return; }
  window._cmDrawerBannerUrl = null;
  showToast('✅ Evento guardado!','success');
  await loadCmEventos();
  // Refresh header badge + status
  const updated = window._cmEvents.find(x => x.id === id);
  if (updated) {
    const setTxt=(i,v)=>{const el=document.getElementById(i);if(el)el.textContent=v||'';};
    setTxt('cm-drawer-ev-title', updated.title);
    const bd=document.getElementById('cm-drawer-ev-status-badge'); if(bd) bd.innerHTML=cmStatusBadge(updated.status);
  }
};

// ── Banner in drawer ───────────────────────────────────────
window.previewCmDrawerBanner = async function(input) {
  const file = input.files[0]; if (!file) return;
  const sb = cmSb(); const wsId = await cmWsId();
  const ext = file.name.split('.').pop();
  const path = `${wsId}/${Date.now()}.${ext}`;
  const { data, error } = await sb.storage.from('cm-banners').upload(path, file, {upsert:false});
  if (error||!data) { showToast('Erro no upload','error'); return; }
  const { data:{ publicUrl } } = sb.storage.from('cm-banners').getPublicUrl(path);
  window._cmDrawerBannerUrl = publicUrl;
  const ph=document.getElementById('cm-dedit-banner-placeholder');
  const pw=document.getElementById('cm-dedit-banner-preview-wrap');
  const pi=document.getElementById('cm-dedit-banner-preview-img');
  if(ph) ph.style.display='none'; if(pw) pw.style.display='block'; if(pi) pi.src=publicUrl;
  showToast('✅ Banner enviado!','success');
};

window.clearCmDrawerBanner = function() {
  window._cmDrawerBannerUrl = '__clear__';
  const ph=document.getElementById('cm-dedit-banner-placeholder');
  const pw=document.getElementById('cm-dedit-banner-preview-wrap');
  if(ph) ph.style.display='block'; if(pw) pw.style.display='none';
};

// ── Toggle helpers (inline toggle UI) ─────────────────────
window.toggleCmEventoGratuito = function(el) {
  const on = el.dataset.val !== '1';
  const knob = el.querySelector('div');
  el.style.background = on ? '#d6336c' : 'rgba(255,255,255,.1)';
  if(knob) knob.style.left = on ? '21px' : '3px';
  el.dataset.val = on ? '1' : '0';
  const pr = document.getElementById('cm-dedit-price-row');
  if(pr) pr.style.display = on ? 'none' : 'grid';
};
window.toggleCmEventoOnlinePayment = function(el) {
  const on = el.dataset.val !== '1';
  const knob = el.querySelector('div');
  el.style.background = on ? '#d6336c' : 'rgba(255,255,255,.1)';
  if(knob) knob.style.left = on ? '21px' : '3px';
  el.dataset.val = on ? '1' : '0';
};
window.toggleCmEventoOpenToGuests = function(el) {
  const on = el.dataset.val !== '1';
  const knob = el.querySelector('div');
  el.style.background = on ? '#d6336c' : 'rgba(255,255,255,.1)';
  if(knob) knob.style.left = on ? '21px' : '3px';
  el.dataset.val = on ? '1' : '0';
};

// ── Drawer Inscritas tab ───────────────────────────────────
async function loadCmDrawerInscritas() {
  const sb = cmSb(); const wsId = await cmWsId();
  const eventId = window._cmDrawerEventoId;
  const listEl = document.getElementById('cm-drawer-inscritas-list');
  if (!listEl || !eventId) return;
  listEl.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,.3);">A carregar…</div>';
  const { data } = await sb.from('cm_attendees').select('*')
    .eq('workspace_id', wsId).eq('event_id', eventId).order('name');
  const attendees = data || [];
  if (!attendees.length) { listEl.innerHTML='<div style="text-align:center;padding:30px;color:rgba(255,255,255,.3);">Nenhuma inscrita</div>'; return; }
  const payColor = { paid:'#34d399', unpaid:'#fbbf24', free:'#a78bfa' };
  const payLabel = { paid:'Pago', unpaid:'Pendente', free:'Gratuito' };
  listEl.innerHTML = attendees.map(a => `
    <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;">
      <div style="width:34px;height:34px;border-radius:50%;background:rgba(214,51,108,.1);display:flex;align-items:center;justify-content:center;font-weight:800;color:${CM_ROSE};flex-shrink:0;">${(a.name||'?').charAt(0).toUpperCase()}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;color:#fff;font-size:.88rem;">${a.name||'—'}</div>
        <div style="font-size:.72rem;color:rgba(255,255,255,.35);">${a.email||''} ${a.phone?'· '+a.phone:''}</div>
      </div>
      <span style="color:${payColor[a.payment_status]||'#999'};font-size:.75rem;font-weight:700;">${payLabel[a.payment_status]||a.payment_status}</span>
      <span style="${a.checked_in?'color:#34d399;':'color:rgba(255,255,255,.2);'} font-size:.85rem;">${a.checked_in?'✅':'⭕'}</span>
    </div>`).join('');
}

// ── Drawer Financeiro tab (event-scoped) ───────────────────
async function loadCmDrawerFinanceiro() {
  const sb = cmSb(); const wsId = await cmWsId();
  const eventId = window._cmDrawerEventoId; if (!eventId) return;
  const { data } = await sb.from('cm_finances').select('*')
    .eq('workspace_id', wsId).eq('event_id', eventId).order('created_at',{ascending:false});
  const rows = data || [];
  const receita  = rows.filter(r=>r.type!=='expense').reduce((s,r)=>s+parseFloat(r.amount||0),0);
  const despesas = rows.filter(r=>r.type==='expense').reduce((s,r)=>s+parseFloat(r.amount||0),0);
  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('cm-fin-receita',  cmFmt(receita));
  setEl('cm-fin-despesas', cmFmt(despesas));
  setEl('cm-fin-saldo',    cmFmt(receita-despesas));

  const listEl = document.getElementById('cm-fin-ev-list');
  if (!listEl) return;
  if (!rows.length) { listEl.innerHTML='<div style="text-align:center;padding:20px;color:rgba(255,255,255,.3);">Nenhuma transação</div>'; return; }
  const tc = { income:'#34d399', expense:'#f87171', donation:'#a78bfa' };
  const tl = { income:'Receita', expense:'Despesa', donation:'Doação' };
  listEl.innerHTML = rows.map(r => `
    <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:12px;">
      <span style="color:${tc[r.type]||'#fff'};font-weight:700;font-size:.78rem;min-width:56px;">${tl[r.type]||r.type}</span>
      <span style="flex:1;font-size:.82rem;color:rgba(255,255,255,.7);">${r.description||'—'}</span>
      <span style="color:${r.type==='expense'?'#f87171':'#34d399'};font-weight:700;font-size:.85rem;">${cmFmt(r.amount)}</span>
      <button onclick="deleteCmEventTransaction('${r.id}')" style="background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:.75rem;padding:2px 4px;">✕</button>
    </div>`).join('');
}

window.addCmEventTransaction = async function() {
  const sb = cmSb(); const wsId = await cmWsId();
  const eventId = window._cmDrawerEventoId; if (!eventId) return;
  const type   = document.getElementById('cm-fin-ev-type')?.value||'income';
  const amount = parseFloat(document.getElementById('cm-fin-ev-amount')?.value)||0;
  const desc   = document.getElementById('cm-fin-ev-desc')?.value?.trim();
  if (!amount) { showToast('Valor obrigatório','error'); return; }
  const { error } = await sb.from('cm_finances').insert({ workspace_id:wsId, event_id:eventId, type, amount, description:desc||null });
  if (error) { showToast('Erro: '+error.message,'error'); return; }
  document.getElementById('cm-fin-ev-amount').value='';
  document.getElementById('cm-fin-ev-desc').value='';
  showToast('✅ Transação adicionada!','success');
  loadCmDrawerFinanceiro();
};

window.deleteCmEventTransaction = async function(id) {
  const sb = cmSb(); const wsId = await cmWsId();
  await sb.from('cm_finances').delete().eq('id',id).eq('workspace_id',wsId);
  loadCmDrawerFinanceiro();
};

// ── Delete evento ──────────────────────────────────────────
window.deleteCmEvento = async function(id) {
  if (!confirm('Apagar este evento? As inscritas também serão removidas.')) return;
  const sb = cmSb(); const wsId = await cmWsId();
  await sb.from('cm_events').delete().eq('id',id).eq('workspace_id',wsId);
  closeCmEventoDrawer();
  showToast('Evento removido','info');
  loadCmEventos();
};

// ── Fechar / Reabrir Evento ────────────────────────────────
window.fecharCmEvento = async function() {
  const sb = cmSb(); const wsId = await cmWsId();
  const eventId = window._cmDrawerEventoId; if (!eventId) return;
  const btn = document.getElementById('btn-fechar-cm-evento');
  const email = document.getElementById('cm-dedit-report-email')?.value?.trim();
  if (btn) { btn.disabled=true; btn.textContent='A processar…'; }

  // Aggregate stats
  const [{ count: totalInscritos }, { count: totalCheckins }, { data: fins }] = await Promise.all([
    sb.from('cm_attendees').select('id',{count:'exact',head:true}).eq('workspace_id',wsId).eq('event_id',eventId),
    sb.from('cm_attendees').select('id',{count:'exact',head:true}).eq('workspace_id',wsId).eq('event_id',eventId).eq('checked_in',true),
    sb.from('cm_finances').select('type,amount').eq('workspace_id',wsId).eq('event_id',eventId)
  ]);
  const finRows = fins || [];
  const totalReceita  = finRows.filter(r=>r.type!=='expense').reduce((s,r)=>s+parseFloat(r.amount||0),0);
  const totalDespesas = finRows.filter(r=>r.type==='expense').reduce((s,r)=>s+parseFloat(r.amount||0),0);

  // Insert report
  await sb.from('cm_event_reports').insert({
    workspace_id: wsId, event_id: eventId,
    total_inscritos: totalInscritos||0, total_checkins: totalCheckins||0,
    total_receita: totalReceita, total_despesas: totalDespesas,
    sent_at: email ? new Date().toISOString() : null, sent_to_email: email||null
  });

  // Lock event
  await sb.from('cm_events').update({ status:'concluido', locked:true, report_sent_at:new Date().toISOString() })
    .eq('id',eventId).eq('workspace_id',wsId);

  showToast('✅ Evento fechado e relatório gerado!','success');
  await loadCmEventos();
  closeCmEventoDrawer();
};

window.reabrirCmEvento = async function() {
  const sb = cmSb(); const wsId = await cmWsId();
  const eventId = window._cmDrawerEventoId; if (!eventId) return;
  await sb.from('cm_events').update({ status:'active', locked:false }).eq('id',eventId).eq('workspace_id',wsId);
  showToast('✅ Evento reaberto!','success');
  await loadCmEventos();
  closeCmEventoDrawer();
};

// Legacy compat: old banner upload from file input (kept for old modal if still referenced)
window.handleCmBannerUpload = window.previewCmDrawerBanner || function(){};




// ═══════════════════════════════════════════════════════════
// SECTION 3 — INSCRITAS (cm_attendees) — Phase 3 full parity
// ═══════════════════════════════════════════════════════════

async function loadCmInscritos() {
  const sb = cmSb(); const wsId = await cmWsId();
  if (!wsId) return;
  if (!window._cmEvents || !window._cmEvents.length) await loadCmEventos();

  const { data: attendees } = await sb.from('cm_attendees')
    .select('*, cm_events(title)')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false });
  window._cmAttendees = attendees || [];

  // Populate event filter
  const sel = document.getElementById('cm-inscritos-event-filter');
  if (sel) {
    sel.innerHTML = '<option value="all">Todos os Eventos</option>' +
      window._cmEvents.map(e=>`<option value="${e.id}">${e.title}</option>`).join('');
  }
  renderCmInscritos(window._cmAttendees);
  updateCmInscritosKPIs(window._cmAttendees);
}

function filterCmInscritos() {
  const q   = (document.getElementById('cm-inscritos-search')?.value||'').toLowerCase();
  const evt = document.getElementById('cm-inscritos-event-filter')?.value||'all';
  const pay = document.getElementById('cm-inscritos-pay-filter')?.value||'all';
  let filtered = window._cmAttendees || [];
  if (q)       filtered = filtered.filter(a=>(a.name||'').toLowerCase().includes(q)||(a.email||'').includes(q)||(a.phone||'').includes(q));
  if (evt !== 'all') filtered = filtered.filter(a=>a.event_id===evt);
  if (pay !== 'all') filtered = filtered.filter(a=>a.payment_status===pay);
  window._cmInscritosFiltered = filtered;
  renderCmInscritos(filtered);
  updateCmInscritosKPIs(filtered);
}
window.filterCmInscritos = filterCmInscritos;

function updateCmInscritosKPIs(attendees) {
  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('cm-inscritos-kpi-total',   attendees.length);
  setEl('cm-inscritos-kpi-checkin', attendees.filter(a=>a.checked_in).length);
  setEl('cm-inscritos-kpi-pagos',   attendees.filter(a=>a.payment_status==='paid').length);
  setEl('cm-inscritos-kpi-pendentes', attendees.filter(a=>a.payment_status==='unpaid').length);
}

function renderCmInscritos(attendees) {
  const tbody = document.getElementById('cm-inscritos-body');
  if (!tbody) return;
  if (!attendees.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">Nenhuma inscrita encontrada</td></tr>';
    return;
  }
  tbody.innerHTML = attendees.map(a => {
    const payColor = { paid:'#34d399', unpaid:'#fbbf24', free:'#a78bfa' }[a.payment_status]||'#999';
    const payLabel = { paid:'Pago', unpaid:'Pendente', free:'Gratuito' }[a.payment_status]||a.payment_status;
    const waLink   = a.phone ? `https://wa.me/${a.phone.replace(/\D/g,'')}` : null;
    return `<tr id="cm-inscrita-row-${a.id}">
      <td>
        <div contenteditable="true" id="cm-ie-name-${a.id}" onblur="saveCmInscritaField('${a.id}','name',this.textContent)"
             style="outline:none;min-width:80px;cursor:text;" title="Clique para editar">${a.name||'—'}</div>
      </td>
      <td style="font-size:.8rem;">
        <div contenteditable="true" id="cm-ie-email-${a.id}" onblur="saveCmInscritaField('${a.id}','email',this.textContent)"
             style="outline:none;color:rgba(255,255,255,.5);cursor:text;" title="Clique para editar">${a.email||''}</div>
        <div contenteditable="true" id="cm-ie-phone-${a.id}" onblur="saveCmInscritaField('${a.id}','phone',this.textContent)"
             style="outline:none;color:rgba(255,255,255,.35);font-size:.76rem;cursor:text;" title="Clique para editar">${a.phone||''}</div>
      </td>
      <td style="font-size:.82rem;">${a.cm_events?.title||'—'}</td>
      <td>
        <select onchange="saveCmInscritaField('${a.id}','payment_status',this.value)"
                style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:4px 8px;color:${payColor};font-size:.78rem;font-weight:700;outline:none;cursor:pointer;">
          <option value="paid"   style="background:#1a1c23;" ${a.payment_status==='paid'  ?'selected':''}>Pago</option>
          <option value="unpaid" style="background:#1a1c23;" ${a.payment_status==='unpaid'?'selected':''}>Pendente</option>
          <option value="free"   style="background:#1a1c23;" ${a.payment_status==='free'  ?'selected':''}>Gratuito</option>
        </select>
      </td>
      <td>${a.checked_in?'<span style="color:#34d399;">✅ Presente</span>':'<span style="color:rgba(255,255,255,.3);">—</span>'}</td>
      <td>
        <div style="display:flex;gap:6px;align-items:center;">
          <button onclick="toggleCmCheckin('${a.id}',${!a.checked_in})"
                  style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);border-radius:6px;padding:4px 10px;font-size:.72rem;cursor:pointer;"
                  title="${a.checked_in?'Desfazer check-in':'Fazer check-in'}">${a.checked_in?'↩':'✅'}</button>
          ${waLink ? `<a href="${waLink}" target="_blank"
                  style="background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.2);color:#25d366;border-radius:6px;padding:4px 8px;font-size:.72rem;text-decoration:none;" title="WhatsApp">💬</a>` : ''}
          <button onclick="deleteCmInscrita('${a.id}')"
                  style="background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.15);color:#f87171;border-radius:6px;padding:4px 8px;font-size:.72rem;cursor:pointer;" title="Remover">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Inline field save ──────────────────────────────────────
window.saveCmInscritaField = async function(id, field, rawVal) {
  const val = (rawVal||'').trim();
  const sb = cmSb(); const wsId = await cmWsId();
  const { error } = await sb.from('cm_attendees').update({ [field]: val||null }).eq('id',id).eq('workspace_id',wsId);
  if (error) { showToast('Erro ao salvar: '+error.message,'error'); return; }
  // sync local cache
  const a = window._cmAttendees.find(x=>x.id===id);
  if (a) a[field] = val||null;
  showToast('✅ Atualizado!','success');
};

window.deleteCmInscrita = async function(id) {
  if (!confirm('Remover esta inscrita?')) return;
  const sb = cmSb(); const wsId = await cmWsId();
  await sb.from('cm_attendees').delete().eq('id',id).eq('workspace_id',wsId);
  showToast('Inscrita removida','info');
  loadCmInscritos();
};

window.toggleCmCheckin = async function(id, val) {
  const sb = cmSb(); const wsId = await cmWsId();
  await sb.from('cm_attendees').update({ checked_in:val, checked_in_at:val?new Date().toISOString():null }).eq('id',id).eq('workspace_id',wsId);
  showToast(val?'✅ Check-in registrado!':'Check-in removido','info');
  loadCmInscritos();
};

// ── #7 CSV Download ───────────────────────────────────────
window.downloadCmInscritasCSV = function() {
  const rows = window._cmInscritosFiltered || window._cmAttendees || [];
  if (!rows.length) { showToast('Nenhuma inscrita para exportar','error'); return; }
  const header = ['Nome','Email','Telefone','Evento','Pagamento','Check-in','Data'];
  const payLabel = { paid:'Pago', unpaid:'Pendente', free:'Gratuito' };
  const lines = rows.map(a => [
    `"${(a.name||'').replace(/"/g,'""')}"`,
    `"${(a.email||'').replace(/"/g,'""')}"`,
    `"${(a.phone||'').replace(/"/g,'""')}"`,
    `"${(a.cm_events?.title||'').replace(/"/g,'""')}"`,
    payLabel[a.payment_status]||a.payment_status,
    a.checked_in?'Sim':'Não',
    a.created_at?new Date(a.created_at).toLocaleDateString('pt-BR'):''
  ].join(','));
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `cm-inscritas-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
  // Confetti
  if (typeof confetti === 'function') {
    confetti({ particleCount:90, spread:80, origin:{y:.6}, colors:['#d6336c','#a855f7','#f472b6','#fff'] });
  }
  showToast('✅ CSV exportado!','success');
};

// ── #8 Email Report ────────────────────────────────────────
window.sendCmInscritasReport = async function() {
  const email = prompt('Enviar relatório para qual email?');
  if (!email) return;
  const rows = window._cmInscritosFiltered || window._cmAttendees || [];
  showToast('📧 A enviar relatório…','info');
  // Build a simple summary for the Edge Function
  const eventFilter = document.getElementById('cm-inscritos-event-filter')?.value;
  const ev = eventFilter && eventFilter !== 'all' ? window._cmEvents.find(x=>x.id===eventFilter) : null;
  const payLabel = { paid:'Pago', unpaid:'Pendente', free:'Gratuito' };
  const body = {
    to: email,
    subject: `Relatório CM Inscritas${ev?' — '+ev.title:''}`,
    total: rows.length,
    checkins: rows.filter(a=>a.checked_in).length,
    pagos: rows.filter(a=>a.payment_status==='paid').length,
    pendentes: rows.filter(a=>a.payment_status==='unpaid').length,
    event_title: ev?.title || 'Todos os Eventos',
  };
  try {
    const resp = await fetch(`https://uyseheucqikgcorrygzc.supabase.co/functions/v1/cm-send-report`, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+cmSb().auth.session()?.access_token},
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error(await resp.text());
    showToast('✅ Relatório enviado!','success');
  } catch(e) {
    showToast('Erro ao enviar: '+e.message,'error');
  }
};

// ── #9 Bulk WhatsApp Invite ────────────────────────────────
window.openCmWhatsAppModal = function() {
  const rows = window._cmInscritosFiltered || window._cmAttendees || [];
  const withPhone = rows.filter(a=>a.phone);
  const m = document.getElementById('modal-cm-whatsapp');
  if (!m) {
    // Build modal dynamically if not in HTML
    const overlay = document.createElement('div');
    overlay.id = 'modal-cm-whatsapp';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;';
    overlay.onclick = (e) => { if(e.target===overlay) overlay.remove(); };
    const evSel = window._cmEvents.map(e=>`<option value="${e.id}">${e.title}</option>`).join('');
    overlay.innerHTML = `<div style="background:#0d0f15;border:1px solid rgba(214,51,108,.2);border-radius:20px;padding:28px;width:min(500px,92vw);max-height:90vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
        <div style="font-weight:800;color:#fff;">💬 Convidar via WhatsApp</div>
        <button onclick="document.getElementById('modal-cm-whatsapp').remove()" style="background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:1.1rem;">✕</button>
      </div>
      <div style="font-size:.82rem;color:rgba(255,255,255,.45);margin-bottom:16px;">${withPhone.length} inscrita(s) com telefone disponível neste filtro atual.</div>
      <div style="margin-bottom:14px;">
        <label style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);display:block;margin-bottom:8px;">Mensagem</label>
        <textarea id="cm-wa-msg" rows="4" style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px;color:#fff;font-size:.88rem;font-family:inherit;outline:none;resize:vertical;box-sizing:border-box;">Olá {nome}! 😊 Você está convidada para o próximo evento CRIE Mulheres. Confirme sua presença!</textarea>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:220px;overflow-y:auto;margin-bottom:16px;">
        ${withPhone.map(a=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;">
          <span style="flex:1;font-size:.84rem;color:#fff;">${a.name||'—'}</span>
          <span style="font-size:.75rem;color:rgba(255,255,255,.35);">${a.phone}</span>
          <a href="https://wa.me/${(a.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(document.getElementById('cm-wa-msg')?.value?.replace('{nome}',a.name||'')||'')}" target="_blank"
             id="cm-wa-link-${a.id}"
             style="background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.2);color:#25d366;border-radius:8px;padding:5px 10px;font-size:.78rem;text-decoration:none;" onclick="updateCmWaLinks()">Abrir 💬</a>
        </div>`).join('')}
      </div>
      <button onclick="openAllCmWaLinks()" style="width:100%;padding:13px;background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.25);border-radius:12px;color:#25d366;font-weight:800;font-size:.9rem;cursor:pointer;">🚀 Abrir Todos (escalonado)</button>
    </div>`;
    document.body.appendChild(overlay);
    return;
  }
  m.style.display = 'flex';
};

window.openAllCmWaLinks = function() {
  const rows = window._cmInscritosFiltered || window._cmAttendees || [];
  const msg  = document.getElementById('cm-wa-msg')?.value || '';
  const withPhone = rows.filter(a=>a.phone);
  withPhone.forEach((a,i) => {
    setTimeout(() => {
      const text = msg.replace('{nome}', a.name||'');
      window.open(`https://wa.me/${(a.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(text)}`,'_blank');
    }, i * 400);
  });
};

// ── Add Inscrita modal (enhanced) ─────────────────────────
window.openAddCmInscritoModal = function() {
  const m = document.getElementById('modal-cm-inscrito'); if(!m) return;
  ['cm-inscrito-name','cm-inscrito-email','cm-inscrito-phone'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const sel = document.getElementById('cm-inscrito-event');
  if (sel) sel.innerHTML = '<option value="">— Selecionar Evento —</option>' +
    window._cmEvents.filter(e=>e.status==='active').map(e=>`<option value="${e.id}">${e.title}</option>`).join('');
  const payEl = document.getElementById('cm-inscrito-payment');
  if (payEl) payEl.value = 'unpaid';
  const memberInfo = document.getElementById('cm-inscrito-member-info');
  if (memberInfo) memberInfo.style.display = 'none';
  m.style.display = 'flex';
};
window.closeAddCmInscritoModal = function() {
  const m=document.getElementById('modal-cm-inscrito'); if(m) m.style.display='none';
};

// Auto-detect existing member by email
window.cmLookupMember = async function() {
  const email = document.getElementById('cm-inscrito-email')?.value?.trim();
  if (!email || !email.includes('@')) return;
  const sb = cmSb(); const wsId = await cmWsId();
  const { data } = await sb.from('cm_members').select('id,name,phone').eq('workspace_id',wsId).eq('email',email).maybeSingle();
  const infoEl = document.getElementById('cm-inscrito-member-info');
  if (data) {
    const nameEl = document.getElementById('cm-inscrito-name');
    const phoneEl = document.getElementById('cm-inscrito-phone');
    if (nameEl && !nameEl.value) nameEl.value = data.name||'';
    if (phoneEl && !phoneEl.value) phoneEl.value = data.phone||'';
    if (infoEl) { infoEl.textContent='✅ Membra encontrada: '+data.name; infoEl.style.display='block'; infoEl.style.color='#34d399'; }
  } else {
    if (infoEl) { infoEl.textContent=''; infoEl.style.display='none'; }
  }
};

window.saveCmInscrito = async function() {
  const sb=cmSb(); const wsId=await cmWsId();
  const name    = document.getElementById('cm-inscrito-name')?.value?.trim();
  const email   = document.getElementById('cm-inscrito-email')?.value?.trim();
  const phone   = document.getElementById('cm-inscrito-phone')?.value?.trim();
  const eventId = document.getElementById('cm-inscrito-event')?.value;
  const payStatus = document.getElementById('cm-inscrito-payment')?.value || 'unpaid';
  if (!name||!eventId) { showToast('Nome e evento obrigatórios','error'); return; }
  const { error } = await sb.from('cm_attendees').insert({
    workspace_id:wsId, event_id:eventId, name, email:email||null, phone:phone||null, payment_status:payStatus
  });
  if (error) { showToast('Erro: '+error.message,'error'); return; }
  showToast('✅ Inscrita adicionada!','success');
  closeAddCmInscritoModal();
  loadCmInscritos();
};







// ═══════════════════════════════════════════════════════════
// SECTION 4 — MEMBRAS (cm_members + cm_member_applications)
// Phase 4: full member drawer, monthly_fee, notes, presence tabs
// ═══════════════════════════════════════════════════════════

window._cmMemberDrawerId = null;

async function loadCmMembros() {
  const sb = cmSb();
  let wsId;
  try { wsId = await cmWsId(); } catch(e) { wsId = null; }
  if (!wsId) { console.warn('[CM] wsId not ready'); return; }

  const [membrosRes, appsRes, billsRes] = await Promise.all([
    sb.from('cm_members').select('*').eq('workspace_id',wsId).order('name',{ascending:true}),
    sb.from('cm_member_applications').select('*, crie_app_users(name,email)').eq('workspace_id',wsId).eq('status','pending').order('created_at',{ascending:false}),
    sb.from('cm_member_bills').select('member_id, status').eq('workspace_id',wsId).in('status',['pending','overdue'])
  ]);
  window._cmMembers = membrosRes.data || [];
  const apps = appsRes.data || [];

  // Build overdue set: member IDs with any unpaid bill
  const overdueIds = new Set((billsRes.data || []).map(b => b.member_id));
  window._cmOverdueIds = overdueIds;

  // KPIs
  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  const ativos = window._cmMembers.filter(m=>m.status==='ativo');
  setEl('cm-membros-kpi-total', window._cmMembers.length);
  setEl('cm-membros-kpi-ativas', ativos.length);
  const feeMod = (window._cmSettings && window._cmSettings.membership_fee) || 0;
  setEl('cm-membros-kpi-mensalidade', feeMod > 0 ? cmFmt(feeMod * ativos.length) : '—');
  // Overdue KPI
  const overdueCount = ativos.filter(m => overdueIds.has(m.id)).length;
  setEl('cm-membros-kpi-overdue', overdueCount > 0 ? overdueCount : '0');
  const overdueKpiEl = document.getElementById('cm-membros-kpi-overdue');
  if (overdueKpiEl) overdueKpiEl.style.color = overdueCount > 0 ? '#f87171' : '#4ade80';

  updateCmMembersBadge(apps.length);
  renderCmPendingApps(apps);
  renderCmMembros(window._cmMembers);
}

function updateCmMembersBadge(count) {
  const badge = document.getElementById('nav-cm-membros-badge');
  if (!badge) return;
  if (count > 0) { badge.textContent=count; badge.style.display='inline-block'; }
  else { badge.style.display='none'; }
}

function renderCmPendingApps(apps) {
  const banner = document.getElementById('cm-pending-apps-banner');
  const label  = document.getElementById('cm-pending-apps-label');
  const list   = document.getElementById('cm-pending-apps-list');
  if (!banner) return;
  if (!apps.length) { banner.style.display='none'; return; }
  banner.style.display='block';
  if (label) label.textContent = `${apps.length} candidatura${apps.length!==1?'s':''} pendente${apps.length!==1?'s':''}`;
  if (list) {
    list.innerHTML = apps.map(app => {
      const name  = app.crie_app_users?.name || 'Desconhecido';
      const email = app.crie_app_users?.email || '';
      return `<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px 16px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:32px;height:32px;border-radius:50%;background:rgba(214,51,108,.1);display:flex;align-items:center;justify-content:center;font-weight:800;color:${CM_ROSE};">${name.charAt(0).toUpperCase()}</div>
          <div><div style="font-size:.85rem;font-weight:700;">${name}</div><div style="font-size:.72rem;color:rgba(255,255,255,.3);">${email}</div></div>
        </div>
        ${app.motivation?`<div style="font-size:.8rem;color:rgba(255,255,255,.4);margin-bottom:10px;font-style:italic;">"${app.motivation}"</div>`:''}
        <div style="display:flex;gap:8px;">
          <button onclick="reviewCmApplication('${app.id}','${app.app_user_id}','approved')" style="flex:1;padding:8px;border-radius:8px;background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.25);color:#34d399;font-size:.78rem;font-weight:700;cursor:pointer;">✅ Aprovar</button>
          <button onclick="reviewCmApplication('${app.id}','${app.app_user_id}','rejected')" style="flex:1;padding:8px;border-radius:8px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:#f87171;font-size:.78rem;font-weight:700;cursor:pointer;">❌ Rejeitar</button>
        </div>
      </div>`;
    }).join('');
  }
}

function renderCmMembros(members) {
  const grid = document.getElementById('cm-membros-grid');
  if (!grid) return;

  const ativos  = members.filter(function(m){ return m.status === 'ativo'; });
  const inativos = members.filter(function(m){ return m.status !== 'ativo'; });

  function buildCard(m) {
    var initials    = (m.name||'?').split(' ').slice(0,2).map(function(w){return w[0];}).join('').toUpperCase();
    var overdueIds  = window._cmOverdueIds || new Set();
    var hasOverdue  = overdueIds.has(m.id);
    var fee         = m.monthly_fee || ((window._cmSettings && window._cmSettings.membership_fee) || 0);
    var sym         = window._crieDefaultCurrencySymbol || '$';
    var feeStr      = fee > 0 ? sym + Number(fee).toFixed(2) + '/mês' : '';
    var sinceStr    = '';
    if (m.member_since) {
      var sd = new Date(m.member_since + 'T12:00:00');
      sinceStr = 'Membro desde ' + sd.toLocaleDateString('pt-BR', {month:'short', year:'numeric'});
    }
    var phoneClean = (m.phone||'').replace(/\D/g,'');
    var waLink = phoneClean ? 'https://wa.me/' + phoneClean : null;
    var statusColor = m.status === 'ativo' ? '#34d399' : '#f87171';
    var isActive = m.status === 'ativo';
    var payDot = `<span title="${hasOverdue ? 'Faturas em atraso' : 'Pagamentos em dia'}" style="position:absolute;bottom:0;right:0;width:11px;height:11px;border-radius:50%;background:${hasOverdue ? '#f87171' : '#4ade80'};border:2px solid #0d0f15;"></span>`;
    return `
        <div class="hub-announcement-card" style="cursor:pointer;transition:transform .15s,box-shadow .15s;" onclick="openCmMemberDrawer('${m.id}')"
             onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 30px rgba(214,51,108,.12)'"
             onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
                <div style="position:relative;flex-shrink:0;">
                    <div style="width:44px;height:44px;border-radius:50%;background:rgba(214,51,108,.12);border:1px solid rgba(214,51,108,.3);display:flex;align-items:center;justify-content:center;font-weight:900;color:${CM_ROSE};font-size:1rem;">${initials}</div>
                    ${payDot}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:800;color:#fff;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.name||'—'}</div>
                    <div style="font-size:.72rem;color:rgba(255,255,255,.4);margin-top:2px;">${sinceStr || m.company || m.industry || feeStr || 'Membra'}</div>
                </div>
                <span style="background:${isActive?'rgba(52,211,153,.12)':'rgba(248,113,113,.12)'};color:${statusColor};border:1px solid ${statusColor}44;padding:3px 8px;border-radius:6px;font-size:.68rem;font-weight:700;">${(m.status||'').toUpperCase()}</span>
            </div>
            <div style="font-size:.75rem;color:rgba(255,255,255,.4);display:flex;flex-direction:column;gap:4px;">
                <span>📧 ${m.email||'—'}</span>
                <span style="display:flex;align-items:center;gap:6px;">📞 ${m.phone||'—'}${waLink ? `<a href="${waLink}" target="_blank" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:rgba(37,211,102,.15);border-radius:50%;color:#25d366;text-decoration:none;font-size:.65rem;">💬</a>` : ''}</span>
                ${feeStr ? `<span>💳 ${feeStr}</span>` : ''}
            </div>
            <div style="margin-top:14px;display:flex;gap:8px;">
                <button onclick="event.stopPropagation();openCmMemberDrawer('${m.id}')" style="flex:1;padding:8px;background:rgba(214,51,108,.08);border:1px solid rgba(214,51,108,.2);border-radius:10px;color:${CM_ROSE};font-size:.72rem;font-weight:700;cursor:pointer;">✏️ Editar</button>
                <button onclick="event.stopPropagation();toggleCmMemberStatus('${m.id}','${isActive?'inativo':'ativo'}')" style="padding:8px 10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:rgba(255,255,255,.5);font-size:.72rem;cursor:pointer;" title="${isActive?'Desativar':'Reativar'}">${isActive?'⏸':'▶'}</button>
                <button onclick="event.stopPropagation();deleteCmMembro('${m.id}')" style="padding:8px 12px;background:rgba(255,100,100,.08);border:1px solid rgba(255,100,100,.15);border-radius:10px;color:#f87171;font-size:.72rem;cursor:pointer;">✕</button>
            </div>
        </div>`;
  }


  if (!members.length) {
    grid.innerHTML = '<div style="text-align:center;padding:60px;color:rgba(255,255,255,.3);grid-column:1/-1;">Nenhuma membra cadastrada</div>';
    return;
  }

  var html = ativos.length ? ativos.map(buildCard).join('') : '<div style="text-align:center;padding:30px;color:rgba(255,255,255,.2);grid-column:1/-1;font-size:.82rem;">Nenhuma membra ativa</div>';

  if (inativos.length) {
    html += '<div style="grid-column:1/-1;margin-top:24px;font-size:.68rem;font-weight:800;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.1em;">Membras Inativas (' + inativos.length + ')</div>';
    html += inativos.map(buildCard).join('');
  }

  grid.innerHTML = html;
}

// ── Member Drawer (#17) ───────────────────────────────────

window.openCmMemberDrawer = async function(memberId) {
  window._cmMemberDrawerId = memberId;
  const m = window._cmMembers.find(x=>x.id===memberId);
  if (!m) return;

  // Populate header
  const titleEl = document.getElementById('cm-mdrawer-title');
  const subEl   = document.getElementById('cm-mdrawer-sub');
  if (titleEl) titleEl.textContent = m.name || '—';
  if (subEl) subEl.textContent = m.email || m.phone || '—';

  // Populate Notas tab fields
  const setV = (id, val) => { const el=document.getElementById(id); if(el) el.value=val||''; };
  setV('cm-mdet-name', m.name);
  setV('cm-mdet-email', m.email);
  setV('cm-mdet-phone', m.phone);
  setV('cm-mdet-company', m.company);
  setV('cm-mdet-industry', m.industry);
  setV('cm-mdet-notes', m.notes);
  setV('cm-mdet-fee', m.monthly_fee || window._cmSettings?.membership_fee || '');
  const statusEl = document.getElementById('cm-mdet-status');
  if (statusEl) statusEl.value = m.status || 'ativo';

  // Show drawer
  const overlay = document.getElementById('cm-mdrawer-overlay');
  const drawer  = document.getElementById('cm-mdrawer');
  if (overlay) { overlay.style.display='block'; }
  if (drawer)  { drawer.style.display='flex'; }

  // Switch to Notas tab by default
  switchCmMemberTab('notas');

  // Load payments + presences async
  loadCmMemberPayments(memberId);
  loadCmMemberPresences(memberId);
};

window.closeCmMemberDrawer = function() {
  const overlay = document.getElementById('cm-mdrawer-overlay');
  const drawer  = document.getElementById('cm-mdrawer');
  if (overlay) overlay.style.display='none';
  if (drawer)  drawer.style.display='none';
};

window.switchCmMemberTab = function(tab) {
  ['notas','mensalidades','presencas'].forEach(t => {
    const btn = document.getElementById(`cm-mtab-${t}`);
    const pnl = document.getElementById(`cm-mpanel-${t}`);
    const isActive = t === tab;
    if (btn) { btn.style.color = isActive ? CM_ROSE : 'rgba(255,255,255,.4)'; btn.style.borderBottom = isActive ? `2px solid ${CM_ROSE}` : '2px solid transparent'; }
    if (pnl) pnl.style.display = isActive ? 'block' : 'none';
  });
};

window.saveCmMemberDetails = async function() {
  const sb = cmSb(); const wsId = await cmWsId();
  const id = window._cmMemberDrawerId;
  if (!id) return;
  const payload = {
    name:     document.getElementById('cm-mdet-name')?.value?.trim() || null,
    email:    document.getElementById('cm-mdet-email')?.value?.trim() || null,
    phone:    document.getElementById('cm-mdet-phone')?.value?.trim() || null,
    company:  document.getElementById('cm-mdet-company')?.value?.trim() || null,
    industry: document.getElementById('cm-mdet-industry')?.value?.trim() || null,
    notes:    document.getElementById('cm-mdet-notes')?.value?.trim() || null,
    monthly_fee: parseFloat(document.getElementById('cm-mdet-fee')?.value) || null,
    status:   document.getElementById('cm-mdet-status')?.value || 'ativo',
  };
  const { error } = await sb.from('cm_members').update(payload).eq('id', id).eq('workspace_id', wsId);
  if (error) { showToast('Erro: '+error.message, 'error'); return; }
  // Sync cache
  const m = window._cmMembers.find(x=>x.id===id);
  if (m) Object.assign(m, payload);
  showToast('✅ Membra atualizada!', 'success');
};

async function loadCmMemberPayments(memberId) {
  const sb = cmSb(); const wsId = await cmWsId();
  const sym = window._crieDefaultCurrencySymbol || '$';

  const { data } = await sb.from('cm_member_bills')
    .select('*').eq('workspace_id', wsId).eq('member_id', memberId)
    .order('reference_month', { ascending: false });
  const bills = data || [];

  const totalBilled = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const totalPaid   = bills.filter(b => b.status === 'paid').reduce((s, b) => s + (b.amount || 0), 0);
  const balance     = totalBilled - totalPaid;

  const billedEl  = document.getElementById('cm-mdr-total-billed');
  const paidEl    = document.getElementById('cm-mdr-total-paid');
  const balanceEl = document.getElementById('cm-mdr-balance');
  if (billedEl)  billedEl.textContent  = sym + totalBilled.toFixed(2);
  if (paidEl)    paidEl.textContent    = sym + totalPaid.toFixed(2);
  if (balanceEl) {
    balanceEl.textContent = sym + balance.toFixed(2);
    balanceEl.style.color = balance <= 0 ? '#4ade80' : '#fbbf24';
  }

  const listEl = document.getElementById('cm-mpayments-list');
  if (!listEl) return;

  if (!bills.length) {
    listEl.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.2);padding:20px;font-size:.82rem;">Nenhuma cobranca registada.</div>';
    return;
  }

  const byYear = {};
  bills.forEach(function(b) {
    const yr = b.reference_month ? b.reference_month.substring(0, 4) : '-';
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(b);
  });

  function statusBadge(s) {
    var map = {
      paid:    { label: 'PAGO',     color: '#4ade80', bg: 'rgba(74,222,128,.1)' },
      pending: { label: 'PENDENTE', color: '#fbbf24', bg: 'rgba(251,191,36,.1)' },
      overdue: { label: 'ATRASADO', color: '#f87171', bg: 'rgba(248,113,113,.1)' },
    };
    var m = map[s] || { label: s, color: '#aaa', bg: 'rgba(255,255,255,.05)' };
    return '<span style="font-size:.68rem;font-weight:700;padding:3px 9px;border-radius:20px;background:' + m.bg + ';color:' + m.color + ';">' + m.label + '</span>';
  }

  var MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var html = '';
  Object.keys(byYear).sort(function(a, b) { return b - a; }).forEach(function(yr) {
    html += '<div style="font-size:.68rem;font-weight:800;color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.08em;margin:14px 0 6px;">' + yr + '</div>';
    byYear[yr].forEach(function(b) {
      var refDate   = b.reference_month ? new Date(b.reference_month + '-02') : null;
      var monthName = refDate ? MONTHS[refDate.getMonth()] : '-';
      var paidDate  = b.paid_at  ? new Date(b.paid_at).toLocaleDateString('pt-BR')  : null;
      var dueDate   = b.due_date ? new Date(b.due_date).toLocaleDateString('pt-BR') : null;
      var markBtn   = b.status !== 'paid'
        ? `<button onclick="markCmBillPaid('${b.id}')" style="font-size:.68rem;padding:4px 10px;background:rgba(209,53,108,.1);border:1px solid rgba(209,53,108,.3);color:#fb7185;border-radius:8px;cursor:pointer;font-weight:700;">Pagar</button>`
        : '';
      var sub = (dueDate ? 'Vence: ' + dueDate : '') + (paidDate ? ' - Pago: ' + paidDate : '') + (b.description ? ' - ' + b.description : '');
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;margin-bottom:6px;">'
        + '<div style="flex:1;">'
        + '<div style="font-size:.84rem;color:#fff;font-weight:700;">' + monthName + ' ' + yr + ' - ' + sym + (b.amount||0).toFixed(2) + '</div>'
        + '<div style="font-size:.7rem;color:rgba(255,255,255,.3);margin-top:2px;">' + sub + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;">' + statusBadge(b.status) + markBtn + '</div>'
        + '</div>';
    });
  });
  listEl.innerHTML = html;
}

async function loadCmMemberPresences(memberId) {
  const sb = cmSb(); const wsId = await cmWsId();
  const { data } = await sb.from('cm_attendees')
    .select('*, cm_events(title,event_date)')
    .eq('workspace_id', wsId).eq('email', (window._cmMembers.find(x=>x.id===memberId)?.email||'__'))
    .order('created_at', { ascending: false });
  const rows = data || [];
  const listEl = document.getElementById('cm-mpresenças-list');
  if (!listEl) return;
  if (!rows.length) { listEl.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">Nenhuma presença registrada</div>'; return; }
  listEl.innerHTML = rows.map(a => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;margin-bottom:8px;">
      <div style="font-size:1.3rem;">${a.checked_in?'✅':'⭕'}</div>
      <div style="flex:1;">
        <div style="font-size:.84rem;color:#fff;font-weight:700;">${a.cm_events?.title||'—'}</div>
        <div style="font-size:.72rem;color:rgba(255,255,255,.35);">${cmDateStr(a.cm_events?.event_date||a.created_at)}</div>
      </div>
      <span style="font-size:.72rem;font-weight:700;color:${a.payment_status==='paid'?'#34d399':a.payment_status==='free'?'#a78bfa':'#fbbf24'};">${a.payment_status}</span>
    </div>`).join('');
}

window.markCmBillPaid = async function(billId) {
  const sb = cmSb(); const wsId = await cmWsId();
  const { error } = await sb.from('cm_member_bills')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', billId).eq('workspace_id', wsId);
  if (error) { showToast('Erro: ' + error.message, 'error'); return; }
  showToast('Mensalidade marcada como paga!', 'success');
  loadCmMemberPayments(window._cmMemberDrawerId);
};

window.addCmMemberBillEntry = async function() {
  const sb = cmSb(); const wsId = await cmWsId();
  const memberId = window._cmMemberDrawerId;
  const m = (window._cmMembers || []).find(function(x) { return x.id === memberId; });
  const type   = (document.getElementById('cm-mdr-txn-type') || {}).value || 'bill';
  const rawAmt = parseFloat((document.getElementById('cm-mdr-txn-amount') || {}).value);
  const amount = isNaN(rawAmt) ? ((m && m.monthly_fee) || (window._cmSettings && window._cmSettings.membership_fee) || 0) : rawAmt;
  const refMonth = (document.getElementById('cm-mdr-txn-month') || {}).value || null;
  const desc   = ((document.getElementById('cm-mdr-txn-desc') || {}).value || '').trim() || null;
  const curr   = window._crieDefaultCurrency || 'USD';

  if (!memberId || !amount) { showToast('Valor invalido', 'error'); return; }

  if (type === 'bill') {
    var dueDay    = window._crieBillDueDay || 1;
    var billMonth = refMonth || new Date().toISOString().substring(0, 7);
    var dueDate   = billMonth + '-' + String(dueDay).padStart(2,'0');
    var ins = await sb.from('cm_member_bills').insert({
      workspace_id: wsId, member_id: memberId, amount: amount, currency: curr,
      status: 'pending', reference_month: billMonth, due_date: dueDate, description: desc
    });
    if (ins.error) { showToast('Erro: ' + ins.error.message, 'error'); return; }
    showToast('Cobranca criada!', 'success');
  } else {
    var pend = await sb.from('cm_member_bills').select('id').eq('workspace_id', wsId).eq('member_id', memberId)
      .in('status', ['pending','overdue']).order('reference_month', { ascending: true }).limit(1);
    if (pend.data && pend.data.length) {
      await sb.from('cm_member_bills').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', pend.data[0].id);
    } else {
      var bm2 = refMonth || new Date().toISOString().substring(0, 7);
      await sb.from('cm_member_bills').insert({
        workspace_id: wsId, member_id: memberId, amount: amount, currency: curr,
        status: 'paid', reference_month: bm2, paid_at: new Date().toISOString(), description: desc
      });
    }
    showToast('Pagamento registado!', 'success');
  }
  ['cm-mdr-txn-amount','cm-mdr-txn-month','cm-mdr-txn-desc'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  loadCmMemberPayments(memberId);
};

window.toggleCmMemberStatus = async function(id, status) {
  const sb=cmSb(); const wsId=await cmWsId();
  await sb.from('cm_members').update({status}).eq('id',id).eq('workspace_id',wsId);
  showToast('Status atualizado','success'); loadCmMembros();
};

window.deleteCmMembro = async function(id) {
  if (!confirm('Remover esta membra?')) return;
  const sb=cmSb(); const wsId=await cmWsId();
  await sb.from('cm_members').delete().eq('id',id).eq('workspace_id',wsId);
  closeCmMemberDrawer();
  showToast('Membra removida','info'); loadCmMembros();
};

window.reviewCmApplication = async function(appId, appUserId, decision) {
  const sb=cmSb(); const wsId=await cmWsId();
  await sb.from('cm_member_applications').update({ status:decision, reviewed_at:new Date().toISOString() }).eq('id',appId);
  if (decision==='approved') {
    const { data:appUser } = await sb.from('crie_app_users').select('name,email,phone').eq('id',appUserId).single();
    if (appUser) {
      const { data:existing } = await sb.from('cm_members').select('id').eq('workspace_id',wsId).eq('email',appUser.email).single();
      if (existing) {
        await sb.from('cm_members').update({app_user_id:appUserId, status:'ativo'}).eq('id',existing.id);
      } else {
        await sb.from('cm_members').insert({ workspace_id:wsId, name:appUser.name, email:appUser.email, phone:appUser.phone||null, app_user_id:appUserId, status:'ativo', source:'app' });
      }
      try {
        fetch(`${EDGE}/crie-member-welcome`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ memberName:appUser.name, memberEmail:appUser.email, workspaceName:(window._allWorkspaces||[]).find(w=>w.id===wsId)?.name||'', appUrl:'https://crie-app.7prolabs.com' })
        }).catch(_=>{});
      } catch(_) {}
    }
    showToast('✅ Membra aprovada!','success');
  } else {
    showToast('Candidatura rejeitada.','info');
  }
  loadCmMembros();
};

window.toggleCmPendingApps = function() {
  const list=document.getElementById('cm-pending-apps-list'); if(!list) return;
  list.style.display = list.style.display==='none'?'flex':'none';
};

window.filterCmMembros = function() {
  const q=(document.getElementById('cm-membro-search')?.value||'').toLowerCase();
  const filtered = window._cmMembers.filter(m=>(m.name||'').toLowerCase().includes(q)||(m.email||'').includes(q)||(m.company||'').includes(q));
  renderCmMembros(filtered);
};

// ── Stripe Connect wiring (#23 Phase 5 but exposed here) ──
window.connectCmStripe = async function() {
  const skEl = document.getElementById('cm-stripe-sk');
  const pkEl = document.getElementById('cm-stripe-pk');
  const key = skEl?.value?.trim() || prompt('Cole aqui a Stripe Secret Key (sk_live_...):');
  const pk  = pkEl?.value?.trim() || null;
  if (!key || !key.startsWith('sk_')) { showToast('Chave secreta inválida — deve começar com sk_','error'); return; }
  const wsId = await cmWsId();
  const { data: { session } } = await cmSb().auth.getSession();
  const token = session?.access_token || '';
  showToast('A verificar chave Stripe…','info');
  try {
    const resp = await fetch(`${EDGE}/cm-stripe-connect`, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body: JSON.stringify({ action:'connect', workspace_id:wsId, stripe_secret_key:key, stripe_publishable_key:pk })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error||'Erro');
    window._cmSettings = { ...(window._cmSettings||{}), stripe_connected:true, stripe_account_name:data.account_name, stripe_account_id:data.account_id };
    window._cmStripeConnected = true;
    window._cmStripeStateLoading = false;
    if (skEl) skEl.value = '';
    if (pkEl) pkEl.value = '';
    renderCmConfigTab();
    showToast(`✅ Stripe conectado: ${data.account_name||data.account_id}`,'success');
  } catch(e) {
    showToast('Erro: '+e.message,'error');
  }
};


window.disconnectCmStripe = async function() {
  if (!confirm('Desconectar Stripe desta workspace?')) return;
  const wsId = await cmWsId();
  const token = cmSb().auth.session?.()?.access_token || '';
  const resp = await fetch(`${EDGE}/cm-stripe-connect`, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body: JSON.stringify({ action:'disconnect', workspace_id:wsId })
  });
  if (!resp.ok) { showToast('Erro ao desconectar','error'); return; }
  window._cmSettings = { ...(window._cmSettings||{}), stripe_connected:false };
  window._cmStripeConnected = false;
  window._cmStripeStateLoading = false;
  renderCmConfigTab();
  showToast('Stripe desconectado','info');
};




// ═══════════════════════════════════════════════════════════
// SECTION 5 — CHECK-IN
// ═══════════════════════════════════════════════════════════

async function loadCmCheckin() {
  const sb=cmSb(); const wsId=await cmWsId(); if(!wsId) return;
  if (!window._cmEvents.length) await loadCmEventos();

  // Populate event selector
  const sel=document.getElementById('cm-checkin-event-sel');
  if (sel) {
    sel.innerHTML = '<option value="">— Selecionar Evento —</option>' +
      window._cmEvents.map(e=>`<option value="${e.id}">${e.title}</option>`).join('');
  }
}

window._cmCheckinAll = [];

window.loadCmCheckinForEvent = async function() {
  const sb=cmSb(); const wsId=await cmWsId();
  const eventId=document.getElementById('cm-checkin-event-sel')?.value;
  if (!eventId) return;
  const { data:attendees } = await sb.from('cm_attendees').select('*').eq('workspace_id',wsId).eq('event_id',eventId).order('name');
  window._cmCheckinAll = attendees || [];
  renderCmCheckinGrid(window._cmCheckinAll);
  updateCmCheckinKpis(window._cmCheckinAll);
};

window.filterCmCheckin = function() {
  const q = (document.getElementById('cm-checkin-search')?.value || '').toLowerCase();
  const filtered = q
    ? window._cmCheckinAll.filter(a => (a.name||'').toLowerCase().includes(q) || (a.email||'').toLowerCase().includes(q) || (a.phone||'').includes(q))
    : window._cmCheckinAll;
  renderCmCheckinGrid(filtered);
};

function updateCmCheckinKpis(rows) {
  const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('cm-checkin-kpi-total',   rows.length);
  set('cm-checkin-kpi-present', rows.filter(a=>a.checked_in).length);
  set('cm-checkin-kpi-paid',    rows.filter(a=>a.payment_status==='paid').length);
  set('cm-checkin-kpi-pending', rows.filter(a=>a.payment_status==='unpaid').length);
  set('cm-checkin-kpi-free',    rows.filter(a=>a.payment_status==='free').length);
}

function renderCmCheckinGrid(attendees) {
  const grid=document.getElementById('cm-checkin-grid');
  if (!grid) return;
  if (!attendees.length) {
    grid.innerHTML='<div style="text-align:center;padding:40px;color:rgba(255,255,255,.3);grid-column:1/-1;">Nenhuma inscrita neste evento</div>';
    return;
  }
  const payColor = { paid:'#34d399', unpaid:'#fbbf24', free:'#a78bfa' };
  const payLabel = { paid:'Pago', unpaid:'Pendente', free:'Gratuito' };
  grid.innerHTML=attendees.map(a=>`
    <div style="background:rgba(255,255,255,.02);border:1px solid ${a.checked_in?'rgba(52,211,153,.3)':'rgba(255,255,255,.08)'};border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;background:${a.checked_in?'rgba(52,211,153,.15)':'rgba(255,255,255,.04)'};display:flex;align-items:center;justify-content:center;font-weight:900;color:${a.checked_in?'#34d399':CM_ROSE};font-size:.95rem;">${(a.name||'?').charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.name}</div>
          <div style="font-size:.72rem;color:rgba(255,255,255,.35);">${a.email||a.phone||'—'}</div>
        </div>
        <button onclick="toggleCmCheckin('${a.id}',${!a.checked_in})" style="background:${a.checked_in?'rgba(52,211,153,.1)':'rgba(255,255,255,.04)'};border:1px solid ${a.checked_in?'rgba(52,211,153,.3)':'rgba(255,255,255,.1)'};border-radius:8px;padding:6px 10px;color:${a.checked_in?'#34d399':'rgba(255,255,255,.3)'};cursor:pointer;font-size:.8rem;font-weight:700;white-space:nowrap;">${a.checked_in?'✅ Presente':'⭕ Ausente'}</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid rgba(255,255,255,.05);">
        <span style="font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:20px;background:${payColor[a.payment_status]||'#999'}18;color:${payColor[a.payment_status]||'#999'};border:1px solid ${payColor[a.payment_status]||'#999'}33;">${payLabel[a.payment_status]||a.payment_status||'—'}</span>
        <button onclick="toggleCmPayment('${a.id}','${a.payment_status}')" style="background:none;border:none;font-size:.72rem;color:rgba(255,255,255,.3);cursor:pointer;text-decoration:underline;">Alterar</button>
      </div>
    </div>`).join('');
}

window.toggleCmCheckin = async function(id, value) {
  const sb=cmSb(); const wsId=await cmWsId();
  await sb.from('cm_attendees').update({ checked_in: value }).eq('id',id).eq('workspace_id',wsId);
  const a = window._cmCheckinAll.find(x=>x.id===id);
  if (a) a.checked_in = value;
  const q = (document.getElementById('cm-checkin-search')?.value||'').toLowerCase();
  renderCmCheckinGrid(q ? window._cmCheckinAll.filter(x=>(x.name||'').toLowerCase().includes(q)) : window._cmCheckinAll);
  updateCmCheckinKpis(window._cmCheckinAll);
};

window.toggleCmPayment = async function(id, currentStatus) {
  const cycle = { unpaid:'paid', paid:'free', free:'unpaid' };
  const next = cycle[currentStatus] || 'paid';
  const sb=cmSb(); const wsId=await cmWsId();
  await sb.from('cm_attendees').update({ payment_status: next }).eq('id',id).eq('workspace_id',wsId);
  const a = window._cmCheckinAll.find(x=>x.id===id);
  if (a) a.payment_status = next;
  renderCmCheckinGrid(window._cmCheckinAll);
  updateCmCheckinKpis(window._cmCheckinAll);
  showToast(`Pagamento: ${next}`, 'success');
};

window.openCmQuickAddAttendee = function() {
  const eventId = document.getElementById('cm-checkin-event-sel')?.value;
  if (!eventId) { showToast('Selecione um evento primeiro', 'error'); return; }
  const name  = prompt('Nome da inscrita:');
  if (!name) return;
  const phone = prompt('Telefone (opcional):') || '';
  cmSb().then ? null : null; // noop (cmSb is sync)
  (async () => {
    const sb=cmSb(); const wsId=await cmWsId();
    const { error } = await sb.from('cm_attendees').insert({ workspace_id:wsId, event_id:eventId, name:name.trim(), phone:phone.trim()||null, payment_status:'unpaid', checked_in:false });
    if (error) { showToast('Erro: '+error.message,'error'); return; }
    showToast('✅ Inscrita adicionada!','success');
    loadCmCheckinForEvent();
  })();
};

// ═══════════════════════════════════════════════════════════
// SECTION 6 — COUPONS + BADGE POLLER (pending applications)
// ═══════════════════════════════════════════════════════════
async function loadCmCoupons() {
  const sb = cmSb(); const wsId = await cmWsId(); if (!wsId) return;
  const tbody = document.getElementById('cm-coupons-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:rgba(255,255,255,.3);">A carregar…</td></tr>';
  const { data, error } = await sb.from('cm_coupons')
    .select('*').eq('workspace_id', wsId)
    .order('created_at', { ascending: false });
  renderCmCoupons(data || []);
}

function renderCmCoupons(rows) {
  const tbody = document.getElementById('cm-coupons-body');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">Sem cupons criados</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(c => {
    const type = c.percent_off != null ? `${c.percent_off}%` : `${c.currency?.toUpperCase()||''} ${parseFloat(c.amount_off||0).toFixed(2)}`;
    const uses = `${c.times_redeemed||0}${c.max_redemptions ? ' / '+c.max_redemptions : ''}`;
    const active = c.active;
    return `<tr>
      <td><span style="font-family:monospace;font-weight:800;color:#fff;">${c.code}</span></td>
      <td><span style="font-size:.72rem;color:rgba(255,255,255,.4);">${c.percent_off!=null?'Percentual':'Valor fixo'}</span></td>
      <td style="color:${CM_ROSE};font-weight:700;">${type}</td>
      <td style="color:rgba(255,255,255,.5);font-size:.82rem;">${uses}</td>
      <td style="font-size:.68rem;color:rgba(255,255,255,.25);font-family:monospace;">${c.stripe_coupon_id||'—'}</td>
      <td><span style="font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px;background:${active?'rgba(52,211,153,.1)':'rgba(255,255,255,.04)'};color:${active?'#34d399':'rgba(255,255,255,.3)'};border:1px solid ${active?'rgba(52,211,153,.3)':'rgba(255,255,255,.08)'}">${active?'Ativo':'Inativo'}</span></td>
      <td><button onclick="toggleCmCouponActive('${c.id}',${!active})" style="background:none;border:none;color:rgba(255,255,255,.3);font-size:.75rem;cursor:pointer;text-decoration:underline;">${active?'Desativar':'Ativar'}</button></td>
    </tr>`;
  }).join('');
}

window.toggleCmCouponFields = function() {
  const type = document.getElementById('cm-coup-type')?.value;
  const wrap = document.getElementById('cm-coup-currency-wrap');
  if (wrap) wrap.style.display = type === 'fixed' ? 'block' : 'none';
};

window.createCmCoupon = async function() {
  const msg  = document.getElementById('cm-coup-msg');
  const code = document.getElementById('cm-coup-code')?.value?.trim().toUpperCase();
  const type = document.getElementById('cm-coup-type')?.value;
  const disc = parseFloat(document.getElementById('cm-coup-discount')?.value) || 0;
  const cur  = document.getElementById('cm-coup-currency')?.value || 'eur';
  const maxR = parseInt(document.getElementById('cm-coup-max')?.value) || null;
  const exp  = document.getElementById('cm-coup-expires')?.value || null;
  if (!code) { msg.textContent = 'Código obrigatório.'; return; }
  if (!disc) { msg.textContent = 'Desconto obrigatório.'; return; }
  const wsId = await cmWsId();
  const { data: { session } } = await cmSb().auth.getSession();
  msg.textContent = 'A criar no Stripe…';
  const resp = await fetch(`${EDGE}/cm-create-coupon`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+(session?.access_token||'') },
    body: JSON.stringify({ workspace_id:wsId, code, type, discount:disc, currency:cur, max_redemptions:maxR, expires_at:exp })
  });
  const json = await resp.json();
  if (!json.success) {
    msg.textContent = '❌ ' + (json.error || 'Erro desconhecido');
    msg.style.color = '#f87171';
    // If Stripe not connected, still save locally
    if (!json.error?.includes('Stripe')) return;
  } else {
    msg.style.color = '#34d399';
    msg.textContent = '✅ Cupom criado no Stripe!';
  }
  // Persist to cm_coupons regardless (Stripe may already have it)
  const sb = cmSb();
  await sb.from('cm_coupons').insert({
    workspace_id: wsId,
    stripe_coupon_id: json.coupon_id || null,
    code,
    percent_off: type === 'percent' ? disc : null,
    amount_off:  type === 'fixed'   ? disc : null,
    currency:    type === 'fixed'   ? cur  : null,
    max_redemptions: maxR,
    active: true
  });
  // Clear form
  ['cm-coup-code','cm-coup-discount','cm-coup-max','cm-coup-expires'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  setTimeout(() => { msg.textContent = ''; }, 4000);
  loadCmCoupons();
};

window.toggleCmCouponActive = async function(id, val) {
  const sb = cmSb(); const wsId = await cmWsId();
  await sb.from('cm_coupons').update({ active: val }).eq('id', id).eq('workspace_id', wsId);
  loadCmCoupons();
};

// #27 — Copy inscription link
window.copyCmInscricaoLink = function() {
  const link = window._cmDrawerInscricaoLink;
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => {
    showToast('📋 Link copiado!', 'success');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('📋 Link copiado!', 'success');
  });
};


(function initCmBadgePoller() {
  // Source of truth: crie_member_applications_v2 (module='cm')
  async function pollCmBadge() {
    const wsId = window._currentWsId || (typeof currentWsId==='function'?currentWsId():null);
    if (!wsId) return;
    const sb = cmSb();
    if (!(window._wsModules||[]).includes('crie_mulheres')) return;
    const { count } = await sb.from('crie_member_applications_v2')
      .select('id',{count:'exact',head:true})
      .eq('workspace_id',wsId).eq('status','pending').eq('module','cm');
    updateCmMembersBadge(count||0);
  }
  setTimeout(pollCmBadge, 4000);
  setInterval(pollCmBadge, 2*60*1000);
})();

// ── Helper: show toast (uses hub-dashboard's showHubToast if available)
function showToast(msg, type) {
  if (typeof showHubToast === 'function') { showHubToast(msg, type); return; }
  console.log('[CM]', msg);
}

// ═══════════════════════════════════════════════════════════
// SECTION 7 — saveCmMembro (Phase 5: picks up new modal fields)
// ═══════════════════════════════════════════════════════════

window.saveCmMembro = async function() {
  const sb = cmSb(); const wsId = await cmWsId();
  const name    = document.getElementById('cm-membro-name')?.value?.trim();
  const email   = document.getElementById('cm-membro-email')?.value?.trim() || null;
  const phone   = document.getElementById('cm-membro-phone')?.value?.trim() || null;
  const company = document.getElementById('cm-membro-company')?.value?.trim() || null;
  const industry= document.getElementById('cm-membro-industry')?.value?.trim() || null;
  const fee     = parseFloat(document.getElementById('cm-membro-fee')?.value) || null;
  const notes   = document.getElementById('cm-membro-notes')?.value?.trim() || null;
  if (!name) { showToast('Nome é obrigatório', 'error'); return; }
  const { error } = await sb.from('cm_members').insert({
    workspace_id: wsId, name, email, phone, company, industry,
    monthly_fee: fee, notes, status: 'ativo'
  });
  if (error) { showToast('Erro: '+error.message, 'error'); return; }
  showToast('✅ Membra adicionada!', 'success');
  closeAddCmMembroModal();
  loadCmMembros();
};

window.closeAddCmMembroModal = function() {
  const m = document.getElementById('modal-cm-membro');
  if (m) m.style.display = 'none';
  ['cm-membro-name','cm-membro-email','cm-membro-phone','cm-membro-company','cm-membro-industry','cm-membro-fee','cm-membro-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
};

window.openAddCmMembroModal = function() {
  const m = document.getElementById('modal-cm-membro');
  if (m) m.style.display = 'flex';
};

// ═══════════════════════════════════════════════════════════
// SECTION 8 — saveCmConfig (Phase 5: timezone + expanded selects)
// ═══════════════════════════════════════════════════════════

window.saveCmConfig = async function() {
  const sb = cmSb(); const wsId = await cmWsId();
  if (!wsId) return;
  const fee      = parseFloat(document.getElementById('cm-cfg-fee')?.value) || 0;
  const currency = document.getElementById('cm-cfg-currency')?.value || 'BRL';
  const country  = document.getElementById('cm-cfg-country')?.value || '+55';
  const timezone = document.getElementById('cm-cfg-timezone')?.value || 'America/Sao_Paulo';
  const existing = window._cmSettings || {};
  const updated  = { ...existing, membership_fee:fee, membership_currency:currency, default_country_code:country, timezone };
  const { error } = await sb.from('workspaces').update({ cm_settings: updated }).eq('id', wsId);
  if (error) { showToast('Erro: ' + error.message, 'error'); return; }
  window._cmSettings = updated;
  showToast('✅ Configurações CM salvas!', 'success');
};
