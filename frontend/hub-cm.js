/* ═══════════════════════════════════════════════════════════
   hub-cm.js — Módulo CRIE Mulheres — Zelo Pro
   v1.0 — 2026-04-23
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
const CM_ROSE = '#f472b6';
const CM_ROSE2 = '#ec4899';
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
}

async function renderCmConfigTab() {
  const cfg = window._cmSettings || {};
  const v = (id, val) => { const el=document.getElementById(id); if(el) el.value=val||''; };
  v('cm-cfg-fee', cfg.membership_fee || '');
  v('cm-cfg-currency', cfg.membership_currency || 'BRL');
  v('cm-cfg-country', cfg.default_country_code || '+55');

  const statusEl = document.getElementById('cm-stripe-status');
  const btnConn  = document.getElementById('btn-cm-stripe-connect');
  const btnDisc  = document.getElementById('btn-cm-stripe-disconnect');
  if (cfg.stripe_connected) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#4ade80;">⬤ Conectado</span>';
    if (btnConn) btnConn.style.display = 'none';
    if (btnDisc) btnDisc.style.display = 'inline-flex';
  } else {
    if (statusEl) statusEl.innerHTML = '<span style="color:rgba(255,255,255,.3);">⬤ Não conectado</span>';
    if (btnConn) btnConn.style.display = 'inline-flex';
    if (btnDisc) btnDisc.style.display = 'none';
  }
}

window.saveCmConfig = async function() {
  const sb = cmSb();
  const wsId = await cmWsId();
  if (!wsId) return;
  const fee = parseFloat(document.getElementById('cm-cfg-fee')?.value) || 0;
  const currency = document.getElementById('cm-cfg-currency')?.value || 'BRL';
  const countryCode = document.getElementById('cm-cfg-country')?.value || '+55';
  const existing = window._cmSettings || {};
  const updated = { ...existing, membership_fee: fee, membership_currency: currency, default_country_code: countryCode };
  const { error } = await sb.from('workspaces').update({ cm_settings: updated }).eq('id', wsId);
  if (error) { showToast('Erro: ' + error.message, 'error'); return; }
  window._cmSettings = updated;
  showToast('✅ Configurações CM salvas!', 'success');
};

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
// SECTION 2 — EVENTOS (cm_events)
// ═══════════════════════════════════════════════════════════

async function loadCmEventos() {
  const sb = cmSb();
  const wsId = await cmWsId();
  if (!wsId) return;
  const { data } = await sb.from('cm_events')
    .select('*').eq('workspace_id', wsId)
    .order('event_date', { ascending: false });
  window._cmEvents = data || [];
  renderCmEventos(window._cmEvents);
}

function renderCmEventos(events) {
  const grid = document.getElementById('cm-eventos-grid');
  if (!grid) return;
  if (!events.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:rgba(255,255,255,.3);">
      <div style="font-size:2.5rem;margin-bottom:12px;">💜</div>
      <div>Nenhum evento criado ainda</div>
      <button onclick="openCmEventoModal()" style="margin-top:16px;background:rgba(244,114,182,.12);border:1px solid rgba(244,114,182,.3);color:${CM_ROSE};border-radius:9px;padding:9px 18px;font-weight:700;cursor:pointer;font-family:inherit;">
        + Criar Primeiro Evento
      </button></div>`;
    return;
  }
  grid.innerHTML = events.map(e => {
    const dateStr = e.event_date ? new Date(e.event_date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}) : 'Data TBD';
    const price = parseFloat(e.price||0);
    return `<div style="background:rgba(255,255,255,.02);border:1px solid rgba(244,114,182,.12);border-radius:14px;overflow:hidden;">
      ${e.banner_url ? `<img src="${e.banner_url}" style="width:100%;height:140px;object-fit:cover;">` : `<div style="height:140px;background:rgba(244,114,182,.06);display:flex;align-items:center;justify-content:center;font-size:2rem;">💜</div>`}
      <div style="padding:14px;">
        <div style="font-weight:800;font-size:.92rem;color:#fff;margin-bottom:4px;">${e.title}</div>
        <div style="font-size:.75rem;color:rgba(255,255,255,.4);margin-bottom:10px;">📅 ${dateStr}${e.location?' · 📍'+e.location:''}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:800;color:${CM_ROSE};">${price>0?cmFmt(price):'Gratuito'}</span>
          <div style="display:flex;gap:6px;">
            <button onclick="openCmEventoModal('${e.id}')" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);border-radius:7px;padding:5px 10px;font-size:.75rem;cursor:pointer;">✏️</button>
            <button onclick="deleteCmEvento('${e.id}')" style="background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.18);color:#f87171;border-radius:7px;padding:5px 10px;font-size:.75rem;cursor:pointer;">🗑️</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.openCmEventoModal = function(eventId) {
  const modal = document.getElementById('modal-cm-evento');
  if (!modal) return;
  const isNew = !eventId;
  document.getElementById('cm-evento-id').value = eventId || '';
  document.getElementById('cm-evento-modal-title').textContent = isNew ? '➕ Novo Evento CM' : '✏️ Editar Evento CM';
  ['cm-evento-title','cm-evento-location','cm-evento-price','cm-evento-capacity','cm-evento-desc'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('cm-evento-members-only').checked = false;
  document.getElementById('cm-evento-banner-preview').innerHTML = '';
  if (eventId) {
    const e = window._cmEvents.find(x=>x.id===eventId);
    if (e) {
      const v = (id,val) => { const el=document.getElementById(id); if(el) el.value=val||''; };
      v('cm-evento-title', e.title);
      v('cm-evento-location', e.location);
      v('cm-evento-price', e.price);
      v('cm-evento-capacity', e.capacity);
      v('cm-evento-desc', e.description);
      if (e.event_date) {
        const d = new Date(e.event_date);
        const local = new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
        const el = document.getElementById('cm-evento-date'); if(el) el.value=local;
      }
      document.getElementById('cm-evento-members-only').checked = !!e.is_members_only;
      if (e.banner_url) document.getElementById('cm-evento-banner-preview').innerHTML = `<img src="${e.banner_url}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-top:8px;">`;
    }
  }
  modal.style.display = 'flex';
};

window.closeCmEventoModal = function() {
  const m = document.getElementById('modal-cm-evento'); if(m) m.style.display='none';
};

window.saveCmEvento = async function() {
  const sb = cmSb(); const wsId = await cmWsId();
  const id = document.getElementById('cm-evento-id').value;
  const title = document.getElementById('cm-evento-title')?.value?.trim();
  if (!title) { showToast('Título obrigatório','error'); return; }
  const payload = {
    workspace_id: wsId, title,
    location: document.getElementById('cm-evento-location')?.value||null,
    description: document.getElementById('cm-evento-desc')?.value||null,
    price: parseFloat(document.getElementById('cm-evento-price')?.value)||0,
    capacity: parseInt(document.getElementById('cm-evento-capacity')?.value)||null,
    is_members_only: document.getElementById('cm-evento-members-only')?.checked||false,
  };
  const dateVal = document.getElementById('cm-evento-date')?.value;
  if (dateVal) payload.event_date = new Date(dateVal).toISOString();
  let error;
  if (id) {
    ({ error } = await sb.from('cm_events').update(payload).eq('id',id).eq('workspace_id',wsId));
  } else {
    ({ error } = await sb.from('cm_events').insert(payload));
  }
  if (error) { showToast('Erro: '+error.message,'error'); return; }
  showToast(id?'✅ Evento atualizado!':'✅ Evento criado!','success');
  closeCmEventoModal();
  loadCmEventos();
};

window.deleteCmEvento = async function(id) {
  if (!confirm('Apagar este evento? Os inscritos também serão removidos.')) return;
  const sb = cmSb(); const wsId = await cmWsId();
  await sb.from('cm_events').delete().eq('id',id).eq('workspace_id',wsId);
  showToast('Evento removido','info');
  loadCmEventos();
};

window.handleCmBannerUpload = async function(evt) {
  const file = evt.target.files[0]; if(!file) return;
  const sb = cmSb(); const wsId = await cmWsId();
  const ext = file.name.split('.').pop();
  const path = `${wsId}/${Date.now()}.${ext}`;
  const { data, error } = await sb.storage.from('cm-banners').upload(path, file, {upsert:false});
  if (error||!data) { showToast('Erro no upload','error'); return; }
  const { data:{ publicUrl } } = sb.storage.from('cm-banners').getPublicUrl(path);
  // Attach to current event form
  document.getElementById('cm-evento-banner-preview').innerHTML = `<img src="${publicUrl}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-top:8px;">`;
  // Store temporarily for save
  window._cmPendingBannerUrl = publicUrl;
  showToast('✅ Banner enviado!','success');
};


// ═══════════════════════════════════════════════════════════
// SECTION 3 — INSCRITOS (cm_attendees)
// ═══════════════════════════════════════════════════════════

async function loadCmInscritos() {
  const sb = cmSb(); const wsId = await cmWsId();
  if (!wsId) return;
  if (!window._cmEvents.length) await loadCmEventos();

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
  const q = (document.getElementById('cm-inscritos-search')?.value||'').toLowerCase();
  const evt = document.getElementById('cm-inscritos-event-filter')?.value||'all';
  let filtered = window._cmAttendees;
  if (q) filtered = filtered.filter(a=>(a.name||'').toLowerCase().includes(q)||(a.email||'').includes(q));
  if (evt!=='all') filtered = filtered.filter(a=>a.event_id===evt);
  renderCmInscritos(filtered);
}
window.filterCmInscritos = filterCmInscritos;

function updateCmInscritosKPIs(attendees) {
  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('cm-inscritos-kpi-total', attendees.length);
  setEl('cm-inscritos-kpi-checkin', attendees.filter(a=>a.checked_in).length);
  setEl('cm-inscritos-kpi-pagos', attendees.filter(a=>a.payment_status==='paid').length);
}

function renderCmInscritos(attendees) {
  const tbody = document.getElementById('cm-inscritos-body');
  if (!tbody) return;
  if (!attendees.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">Nenhum inscrito encontrado</td></tr>';
    return;
  }
  tbody.innerHTML = attendees.map(a => {
    const payColor = { paid:'#34d399', unpaid:'#fbbf24', free:'#a78bfa' }[a.payment_status]||'#999';
    const payLabel = { paid:'Pago', unpaid:'Pendente', free:'Gratuito' }[a.payment_status]||a.payment_status;
    return `<tr>
      <td>${a.name||'—'}</td>
      <td style="color:rgba(255,255,255,.5);font-size:.8rem;">${a.email||'—'}<br>${a.phone||''}</td>
      <td style="font-size:.82rem;">${a.cm_events?.title||'—'}</td>
      <td><span style="color:${payColor};font-weight:700;">${payLabel}</span></td>
      <td>${a.checked_in?'<span style="color:#34d399;">✅ Presente</span>':'<span style="color:rgba(255,255,255,.3);">—</span>'}</td>
      <td>
        <button onclick="toggleCmCheckin('${a.id}',${!a.checked_in})" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);border-radius:6px;padding:4px 10px;font-size:.72rem;cursor:pointer;">${a.checked_in?'Desfazer':'Check-in'}</button>
      </td>
    </tr>`;
  }).join('');
}

window.toggleCmCheckin = async function(id, val) {
  const sb = cmSb(); const wsId = await cmWsId();
  await sb.from('cm_attendees').update({ checked_in:val, checked_in_at: val?new Date().toISOString():null }).eq('id',id).eq('workspace_id',wsId);
  showToast(val?'✅ Check-in registrado!':'Check-in removido','success');
  loadCmInscritos();
};

window.openAddCmInscritoModal = function() {
  const m = document.getElementById('modal-cm-inscrito'); if(!m) return;
  document.getElementById('cm-inscrito-name').value='';
  document.getElementById('cm-inscrito-email').value='';
  document.getElementById('cm-inscrito-phone').value='';
  // populate event select
  const sel = document.getElementById('cm-inscrito-event');
  if (sel) sel.innerHTML = '<option value="">— Selecionar Evento —</option>' + window._cmEvents.map(e=>`<option value="${e.id}">${e.title}</option>`).join('');
  m.style.display='flex';
};
window.closeAddCmInscritoModal = function() {
  const m=document.getElementById('modal-cm-inscrito'); if(m) m.style.display='none';
};
window.saveCmInscrito = async function() {
  const sb=cmSb(); const wsId=await cmWsId();
  const name=document.getElementById('cm-inscrito-name')?.value?.trim();
  const email=document.getElementById('cm-inscrito-email')?.value?.trim();
  const phone=document.getElementById('cm-inscrito-phone')?.value?.trim();
  const eventId=document.getElementById('cm-inscrito-event')?.value;
  if (!name||!eventId) { showToast('Nome e evento obrigatórios','error'); return; }
  const { error } = await sb.from('cm_attendees').insert({ workspace_id:wsId, event_id:eventId, name, email:email||null, phone:phone||null, payment_status:'unpaid' });
  if (error) { showToast('Erro: '+error.message,'error'); return; }
  showToast('✅ Inscrito adicionado!','success');
  closeAddCmInscritoModal();
  loadCmInscritos();
};


// ═══════════════════════════════════════════════════════════
// SECTION 4 — MEMBROS (cm_members + cm_member_applications)
// ═══════════════════════════════════════════════════════════

async function loadCmMembros() {
  const sb = cmSb(); const wsId = await cmWsId();
  if (!wsId) return;

  const [membrosRes, appsRes] = await Promise.all([
    sb.from('cm_members').select('*').eq('workspace_id',wsId).order('created_at',{ascending:false}),
    sb.from('cm_member_applications').select('*, crie_app_users(name,email)').eq('workspace_id',wsId).eq('status','pending').order('created_at',{ascending:false})
  ]);
  window._cmMembers = membrosRes.data || [];
  const apps = appsRes.data || [];

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
          <div style="width:32px;height:32px;border-radius:50%;background:rgba(244,114,182,.1);display:flex;align-items:center;justify-content:center;font-weight:800;color:${CM_ROSE};">${name.charAt(0).toUpperCase()}</div>
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
  if (!members.length) {
    grid.innerHTML = '<div style="text-align:center;padding:60px;color:rgba(255,255,255,.3);grid-column:1/-1;">Nenhum membro cadastrado</div>';
    return;
  }
  grid.innerHTML = members.map(m => {
    const statusColor = m.status==='ativo'?'#34d399':'#f87171';
    return `<div style="background:rgba(255,255,255,.02);border:1px solid rgba(244,114,182,.1);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:42px;height:42px;border-radius:50%;background:rgba(244,114,182,.12);border:2px solid rgba(244,114,182,.3);display:flex;align-items:center;justify-content:center;font-weight:900;color:${CM_ROSE};font-size:1rem;">${(m.name||'?').charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.name}</div>
          <div style="font-size:.72rem;color:rgba(255,255,255,.35);">${m.email||m.phone||'—'}</div>
        </div>
        <span style="font-size:.65rem;font-weight:700;padding:3px 8px;border-radius:20px;background:${m.status==='ativo'?'rgba(52,211,153,.12)':'rgba(248,113,113,.1)'};color:${statusColor};">${m.status}</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button onclick="toggleCmMemberStatus('${m.id}','${m.status==='ativo'?'inativo':'ativo'}')" style="flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.5);border-radius:7px;padding:7px;font-size:.75rem;cursor:pointer;">${m.status==='ativo'?'Inativar':'Ativar'}</button>
        <button onclick="deleteCmMembro('${m.id}')" style="background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.15);color:#f87171;border-radius:7px;padding:7px 10px;font-size:.75rem;cursor:pointer;">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

window.toggleCmMemberStatus = async function(id, status) {
  const sb=cmSb(); const wsId=await cmWsId();
  await sb.from('cm_members').update({status}).eq('id',id).eq('workspace_id',wsId);
  showToast('Status atualizado','success'); loadCmMembros();
};
window.deleteCmMembro = async function(id) {
  if (!confirm('Remover este membro?')) return;
  const sb=cmSb(); const wsId=await cmWsId();
  await sb.from('cm_members').delete().eq('id',id).eq('workspace_id',wsId);
  showToast('Membro removido','info'); loadCmMembros();
};

window.reviewCmApplication = async function(appId, appUserId, decision) {
  const sb=cmSb(); const wsId=await cmWsId();
  await sb.from('cm_member_applications').update({ status:decision, reviewed_at:new Date().toISOString() }).eq('id',appId);
  if (decision==='approved') {
    const { data:appUser } = await sb.from('crie_app_users').select('name,email,phone').eq('id',appUserId).single();
    if (appUser) {
      const { data:existing } = await sb.from('cm_members').select('id').eq('workspace_id',wsId).eq('email',appUser.email).single();
      if (existing) {
        await sb.from('cm_members').update({app_user_id:appUserId}).eq('id',existing.id);
      } else {
        await sb.from('cm_members').insert({ workspace_id:wsId, name:appUser.name, email:appUser.email, phone:appUser.phone||null, app_user_id:appUserId, status:'ativo', source:'app' });
      }
      // Reuse crie-member-welcome edge function
      try {
        fetch(`${EDGE}/crie-member-welcome`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ memberName:appUser.name, memberEmail:appUser.email, workspaceName:(window._allWorkspaces||[]).find(w=>w.id===wsId)?.name||'', appUrl:'https://crie-app.7prolabs.com' })
        }).catch(_=>{});
      } catch(_) {}
    }
    showToast('✅ Membro aprovado!','success');
  } else {
    showToast('Candidatura rejeitada.','info');
  }
  loadCmMembros();
};

window.openAddCmMembroModal = function() {
  const m=document.getElementById('modal-cm-membro'); if(!m) return;
  ['cm-membro-name','cm-membro-email','cm-membro-phone'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  m.style.display='flex';
};
window.closeAddCmMembroModal = function() {
  const m=document.getElementById('modal-cm-membro'); if(m) m.style.display='none';
};
window.saveCmMembro = async function() {
  const sb=cmSb(); const wsId=await cmWsId();
  const name=document.getElementById('cm-membro-name')?.value?.trim();
  if (!name) { showToast('Nome obrigatório','error'); return; }
  const { error } = await sb.from('cm_members').insert({
    workspace_id:wsId,
    name,
    email: document.getElementById('cm-membro-email')?.value?.trim()||null,
    phone: document.getElementById('cm-membro-phone')?.value?.trim()||null,
    status:'ativo', source:'manual'
  });
  if (error) { showToast('Erro: '+error.message,'error'); return; }
  showToast('✅ Membro adicionado!','success');
  closeAddCmMembroModal(); loadCmMembros();
};

window.toggleCmPendingApps = function() {
  const list=document.getElementById('cm-pending-apps-list'); if(!list) return;
  list.style.display = list.style.display==='none'?'flex':'none';
};

window.filterCmMembros = function() {
  const q=(document.getElementById('cm-membro-search')?.value||'').toLowerCase();
  const filtered = window._cmMembers.filter(m=>(m.name||'').toLowerCase().includes(q)||(m.email||'').includes(q));
  renderCmMembros(filtered);
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

window.loadCmCheckinForEvent = async function() {
  const sb=cmSb(); const wsId=await cmWsId();
  const eventId=document.getElementById('cm-checkin-event-sel')?.value;
  if (!eventId) return;
  const { data:attendees } = await sb.from('cm_attendees').select('*').eq('workspace_id',wsId).eq('event_id',eventId).order('name');
  renderCmCheckinGrid(attendees||[]);
};

function renderCmCheckinGrid(attendees) {
  const grid=document.getElementById('cm-checkin-grid');
  if (!grid) return;
  if (!attendees.length) {
    grid.innerHTML='<div style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">Nenhum inscrito neste evento</div>';
    return;
  }
  grid.innerHTML=attendees.map(a=>`
    <div style="background:rgba(255,255,255,.02);border:1px solid ${a.checked_in?'rgba(52,211,153,.3)':'rgba(255,255,255,.08)'};border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="toggleCmCheckin('${a.id}',${!a.checked_in})">
      <div style="width:38px;height:38px;border-radius:50%;background:${a.checked_in?'rgba(52,211,153,.15)':'rgba(255,255,255,.04)'};display:flex;align-items:center;justify-content:center;font-weight:900;color:${a.checked_in?'#34d399':CM_ROSE};font-size:.95rem;">${(a.name||'?').charAt(0).toUpperCase()}</div>
      <div style="flex:1;">
        <div style="font-weight:700;color:#fff;">${a.name}</div>
        <div style="font-size:.72rem;color:rgba(255,255,255,.35);">${a.email||a.phone||'—'}</div>
      </div>
      ${a.checked_in?'<span style="color:#34d399;font-weight:800;">✅</span>':'<span style="color:rgba(255,255,255,.2);">⭕</span>'}
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════
// SECTION 6 — BADGE POLLER (pending applications)
// ═══════════════════════════════════════════════════════════

(function initCmBadgePoller() {
  async function pollCmBadge() {
    const wsId = window._currentWsId || (typeof currentWsId==='function'?currentWsId():null);
    if (!wsId) return;
    const sb = cmSb();
    // Only poll if cm module is active for this workspace
    if (!(window._wsModules||[]).includes('crie_mulheres')) return;
    const { count } = await sb.from('cm_member_applications')
      .select('id',{count:'exact',head:true})
      .eq('workspace_id',wsId).eq('status','pending');
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

