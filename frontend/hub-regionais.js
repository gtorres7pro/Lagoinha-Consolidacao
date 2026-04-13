// ═══════════════════════════════════════════════════════════════
// hub-regionais.js — Gestão de Regionais (Dev Hub)
// Lazy-loaded. Patches window.switchTab para tab 'dev-regionais'.
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  let _regionaisLoaded = false;
  let _allRegionais    = [];
  let _allWorkspaces   = [];
  let _editingId       = null;

  // ── Bootstrap ────────────────────────────────────────────────
  async function loadRegionais() {
    const sb = getSupabase();
    const wrap = document.getElementById('dev-regionais-list');
    if (wrap) wrap.innerHTML = `<div style="padding:40px;text-align:center;color:rgba(255,255,255,.3);">Carregando...</div>`;

    const [regRes, wsRes] = await Promise.all([
      sb.from('regionals')
        .select('id, name, slug, responsible_workspace_id, created_at')
        .order('name'),
      sb.from('workspaces')
        .select('id, name, slug, plan, level, regional_id')
        .order('name'),
    ]);

    if (regRes.error) { console.error(regRes.error); return; }
    _allRegionais  = regRes.data || [];
    _allWorkspaces = wsRes.data  || [];

    renderRegionaisList();
    populateResponsibleDropdown('new-regional-responsible'); // modal de criação
  }

  // ── Render list ───────────────────────────────────────────────
  function renderRegionaisList() {
    const wrap = document.getElementById('dev-regionais-list');
    if (!wrap) return;

    if (!_allRegionais.length) {
      wrap.innerHTML = `
        <div style="padding:60px;text-align:center;color:rgba(255,255,255,.25);">
          <div style="font-size:2.5rem;margin-bottom:12px;">🗺️</div>
          <div style="font-weight:700;">Nenhuma regional criada</div>
          <div style="font-size:.8rem;margin-top:4px;">Clique em "+ Nova Regional" para começar</div>
        </div>`;
      return;
    }

    wrap.innerHTML = _allRegionais.map(reg => {
      const members = _allWorkspaces.filter(w => w.regional_id === reg.id);
      const responsible = _allWorkspaces.find(w => w.id === reg.responsible_workspace_id);
      return `
        <div class="reg-card" id="reg-card-${reg.id}">
          <div class="reg-card-header">
            <div class="reg-card-info">
              <span class="reg-card-name">${reg.name}</span>
              <span class="reg-card-slug">/${reg.slug}</span>
            </div>
            <div class="reg-card-actions">
              ${responsible ? `<span class="reg-responsible-badge">⭐ ${responsible.name}</span>` : '<span class="reg-responsible-empty">Sem responsável</span>'}
              <span class="reg-member-count">${members.length} igreja${members.length !== 1 ? 's' : ''}</span>
              <button class="reg-btn-edit" onclick="openEditRegional('${reg.id}')">✏️ Editar</button>
              <button class="reg-btn-delete" onclick="deleteRegional('${reg.id}','${reg.name}')">🗑️</button>
            </div>
          </div>

          <div class="reg-members-list">
            ${members.map(ws => `
              <div class="reg-member-item">
                <span class="reg-member-dot" style="background:${planColor(ws.plan)}"></span>
                <span class="reg-member-name">${ws.name}</span>
                <span class="reg-member-plan">${ws.plan}</span>
                ${ws.id === reg.responsible_workspace_id
                  ? `<span style="font-size:.68rem;color:#FFD700;font-weight:700;">RESPONSÁVEL</span>`
                  : `<button class="reg-btn-unlink" onclick="unlinkWorkspaceFromRegional('${ws.id}','${ws.name}')">Desvincular</button>`}
              </div>`).join('') || '<div style="font-size:.75rem;color:rgba(255,255,255,.2);padding:6px 0;">Nenhum workspace vinculado</div>'}

            <!-- Add workspace input -->
            <div class="reg-add-ws-wrap" id="reg-add-${reg.id}">
              <select class="reg-add-select" id="reg-add-select-${reg.id}">
                <option value="">— Vincular workspace —</option>
                ${_allWorkspaces
                  .filter(w => !w.regional_id && w.slug !== 'demo-beta')
                  .map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
              </select>
              <button class="reg-btn-link" onclick="linkWorkspaceToRegional('${reg.id}')">Vincular</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function planColor(plan) {
    if (plan === 'founders') return '#FFD700';
    if (plan === 'trial')    return '#60a5fa';
    if (plan === 'essencial')return '#34d399';
    return '#888';
  }

  // ── Populate responsible dropdown ─────────────────────────────
  function populateResponsibleDropdown(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Workspace responsável (opcional) —</option>' +
      _allWorkspaces
        .filter(w => w.slug !== 'demo-beta')
        .map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  }

  // ── Create Regional Modal ─────────────────────────────────────
  window.openCreateRegionalModal = function () {
    document.getElementById('new-regional-name').value = '';
    document.getElementById('new-regional-slug').value = '';
    const sel = document.getElementById('new-regional-responsible');
    if (sel) { sel.value = ''; }
    const modal = document.getElementById('dev-regional-modal');
    if (modal) { modal.style.display = 'flex'; }
  };

  window.closeCreateRegionalModal = function () {
    const modal = document.getElementById('dev-regional-modal');
    if (modal) modal.style.display = 'none';
  };

  // Auto-slug from name
  document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('new-regional-name');
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        const slugEl = document.getElementById('new-regional-slug');
        if (slugEl && !slugEl._manuallyEdited) {
          slugEl.value = nameInput.value.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        }
      });
    }
    const slugEl = document.getElementById('new-regional-slug');
    if (slugEl) slugEl.addEventListener('input', () => { slugEl._manuallyEdited = true; });
  });

  window.submitCreateRegional = async function () {
    const sb   = getSupabase();
    const name = document.getElementById('new-regional-name')?.value?.trim();
    const slug = document.getElementById('new-regional-slug')?.value?.trim();
    const respWsId = document.getElementById('new-regional-responsible')?.value || null;

    if (!name || !slug) { showToast('Preencha nome e slug.', 'error'); return; }

    const btn = document.querySelector('#dev-regional-modal button');
    if (btn) { btn.textContent = 'Criando…'; btn.disabled = true; }

    const { data, error } = await sb.from('regionals')
      .insert({ name, slug, responsible_workspace_id: respWsId || null })
      .select().single();

    if (btn) { btn.textContent = 'Criar Regional'; btn.disabled = false; }

    if (error) { showToast('Erro: ' + error.message, 'error'); return; }

    // If responsible workspace selected → update its level to 'regional'
    if (respWsId) {
      await sb.from('workspaces')
        .update({ level: 'regional', regional_id: data.id })
        .eq('id', respWsId);
    }

    showToast(`Regional "${name}" criada! 🗺️`, 'success');
    window.closeCreateRegionalModal();
    _regionaisLoaded = false;
    loadRegionais();
  };

  // ── Edit Regional ─────────────────────────────────────────────
  window.openEditRegional = function (id) {
    const reg = _allRegionais.find(r => r.id === id);
    if (!reg) return;
    _editingId = id;

    document.getElementById('edit-regional-name').value = reg.name;
    document.getElementById('edit-regional-slug').value = reg.slug;
    populateResponsibleDropdown('edit-regional-responsible');
    const sel = document.getElementById('edit-regional-responsible');
    if (sel) sel.value = reg.responsible_workspace_id || '';

    const modal = document.getElementById('dev-regional-edit-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeEditRegionalModal = function () {
    const modal = document.getElementById('dev-regional-edit-modal');
    if (modal) modal.style.display = 'none';
    _editingId = null;
  };

  window.submitEditRegional = async function () {
    if (!_editingId) return;
    const sb = getSupabase();
    const prev = _allRegionais.find(r => r.id === _editingId);

    const name      = document.getElementById('edit-regional-name')?.value?.trim();
    const slug      = document.getElementById('edit-regional-slug')?.value?.trim();
    const respWsId  = document.getElementById('edit-regional-responsible')?.value || null;

    if (!name || !slug) { showToast('Preencha nome e slug.', 'error'); return; }

    const btn = document.getElementById('edit-regional-save-btn');
    if (btn) { btn.textContent = 'Salvando…'; btn.disabled = true; }

    const { error } = await sb.from('regionals')
      .update({ name, slug, responsible_workspace_id: respWsId || null })
      .eq('id', _editingId);

    if (btn) { btn.textContent = '💾 Salvar'; btn.disabled = false; }
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }

    // Reset old responsible's level if changed
    if (prev?.responsible_workspace_id && prev.responsible_workspace_id !== respWsId) {
      await sb.from('workspaces')
        .update({ level: 'local' })
        .eq('id', prev.responsible_workspace_id)
        .neq('level', 'global'); // never downgrade global
    }

    // Set new responsible's level
    if (respWsId) {
      await sb.from('workspaces')
        .update({ level: 'regional', regional_id: _editingId })
        .eq('id', respWsId)
        .neq('level', 'global');
    }

    showToast(`Regional "${name}" atualizada! ✅`, 'success');
    window.closeEditRegionalModal();
    _regionaisLoaded = false;
    loadRegionais();
  };

  // ── Link / Unlink Workspace ───────────────────────────────────
  window.linkWorkspaceToRegional = async function (regionalId) {
    const sb  = getSupabase();
    const sel = document.getElementById(`reg-add-select-${regionalId}`);
    const wsId = sel?.value;
    if (!wsId) { showToast('Selecione um workspace para vincular.', 'error'); return; }

    const ws = _allWorkspaces.find(w => w.id === wsId);
    const { error } = await sb.from('workspaces')
      .update({ regional_id: regionalId })
      .eq('id', wsId);

    if (error) { showToast('Erro: ' + error.message, 'error'); return; }

    showToast(`${ws?.name || 'Workspace'} vinculado à regional! 🔗`, 'success');
    _regionaisLoaded = false;
    loadRegionais();
  };

  window.unlinkWorkspaceFromRegional = async function (wsId, wsName) {
    if (!confirm(`Desvincular "${wsName}" desta regional?`)) return;
    const sb = getSupabase();

    const { error } = await sb.from('workspaces')
      .update({ regional_id: null })
      .eq('id', wsId);

    if (error) { showToast('Erro: ' + error.message, 'error'); return; }

    showToast(`${wsName} desvinculado! ✅`, 'success');
    _regionaisLoaded = false;
    loadRegionais();
  };

  // ── Delete Regional ───────────────────────────────────────────
  window.deleteRegional = async function (id, name) {
    if (!confirm(`Excluir a regional "${name}"? Os workspaces membros ficarão sem regional.`)) return;
    const sb = getSupabase();

    // Unlink members first
    await sb.from('workspaces').update({ regional_id: null }).eq('regional_id', id);
    // Reset responsible's level
    await sb.from('workspaces')
      .update({ level: 'local' })
      .eq('id', (await sb.from('regionals').select('responsible_workspace_id').eq('id', id).single()).data?.responsible_workspace_id || '')
      .neq('level', 'global');

    const { error } = await sb.from('regionals').delete().eq('id', id);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }

    showToast(`Regional "${name}" excluída.`, 'success');
    _regionaisLoaded = false;
    loadRegionais();
  };

  // ── Render grouped workspaces in Dev Hub ──────────────────────
  window.renderDevHubWorkspacesGrouped = function (workspaces, regionais) {
    const tbody = document.getElementById('dev-ws-tbody');
    if (!tbody) return;

    const global = workspaces.filter(w => w.level === 'global');
    const byRegional = {};
    regionais.forEach(r => { byRegional[r.id] = []; });
    workspaces
      .filter(w => w.regional_id && w.level !== 'global')
      .forEach(w => {
        if (byRegional[w.regional_id]) byRegional[w.regional_id].push(w);
        else byRegional[w.regional_id] = [w];
      });
    const noRegional = workspaces.filter(w => !w.regional_id && w.level !== 'global');

    let html = '';

    // Globals
    if (global.length) {
      html += `<tr><td colspan="9" style="padding:10px 16px 4px;font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,215,0,.5);">🌐 Global</td></tr>`;
      html += global.map(w => renderWsRow(w, null)).join('');
    }

    // Grouped by regional
    regionais.forEach(reg => {
      const members = byRegional[reg.id] || [];
      const responsible = workspaces.find(w => w.id === reg.responsible_workspace_id);
      html += `<tr><td colspan="9" style="padding:10px 16px 4px;font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:rgba(129,140,248,.55);">🗺️ ${reg.name}</td></tr>`;
      // Show responsible first, then members
      const sorted = [
        ...members.filter(w => w.id === reg.responsible_workspace_id),
        ...members.filter(w => w.id !== reg.responsible_workspace_id),
      ];
      html += sorted.map(w => renderWsRow(w, reg)).join('');
      if (!sorted.length) {
        html += `<tr><td colspan="9" style="padding:6px 28px;font-size:.75rem;color:rgba(255,255,255,.2);">Nenhum workspace nesta regional</td></tr>`;
      }
    });

    // Unassigned locals
    if (noRegional.length) {
      html += `<tr><td colspan="9" style="padding:10px 16px 4px;font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.2);">🏠 Locais (sem regional)</td></tr>`;
      html += noRegional.map(w => renderWsRow(w, null)).join('');
    }

    tbody.innerHTML = html;
  };

  function renderWsRow(ws, reg) {
    // This mirrors the existing row rendering from hub-dashboard.js
    // Will be patched via an event so hub-dashboard can keep its own renderer
    const ev = new CustomEvent('retencao:render-ws-row', { detail: { ws, reg }, bubbles: true });
    return `<!-- ws:${ws.id} -->`; // placeholder, actual render done by hub-dashboard
  }

  // ── Lazy-load ─────────────────────────────────────────────────
  (function patchSwitchTab() {
    const _orig = window.switchTab;
    window.switchTab = function (tabName) {
      _orig && _orig(tabName);
      if (tabName === 'dev' && !_regionaisLoaded) {
        _regionaisLoaded = true;
        // Preload data for grouped workspace list
        loadRegionais();
      }
    };

    // Also hook into the dev hub inner tab switch
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-dev-tab="regionais"]');
      if (btn) {
        loadRegionais();
      }
    });
  })();

  // Expose for hub-dashboard.js to call after loading its workspace list
  window.loadRegionais      = loadRegionais;
  window.getRegionaisData   = () => ({ regionais: _allRegionais, workspaces: _allWorkspaces });

})();
