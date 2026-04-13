// ═══════════════════════════════════════════════════════════════
// hub-bi.js — Dashboard de BI Cross-Workspace (Master Admin Only)
// Lazy-loaded via switchDevTab('analytics')
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────
  let _biPeriod  = '30d';
  let _biLoaded  = false;
  let _biLoading = false;
  let _biData    = null;

  // ── Helpers ──────────────────────────────────────────────────
  function getDateFrom(period) {
    if (!period || period === 'all') return null;
    const n = parseInt(period);
    if (period.endsWith('d')) return new Date(Date.now() - n * 86400000).toISOString();
    if (period.endsWith('m')) return new Date(Date.now() - n * 30 * 86400000).toISOString();
    if (period === 'year') {
      const d = new Date(); d.setMonth(0); d.setDate(1); d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    return null;
  }

  function fmt(n)  { return (n || 0).toLocaleString('pt-BR'); }
  function pct(a, b) { if (!b) return 0; return Math.round((a / b) * 100); }
  function fmtCur(n, sym) { return (sym || 'R$') + ' ' + (parseFloat(n) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  // ── Period Switch ────────────────────────────────────────────
  window.setBIPeriod = function (period, btn) {
    _biPeriod = period;
    _biLoaded = false;
    document.querySelectorAll('#bi-period-btns .hub-period-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadBIDashboard();
  };

  // ── Main Load ────────────────────────────────────────────────
  async function loadBIDashboard() {
    if (_biLoading) return;
    _biLoading = true;

    const sb    = getSupabase();
    const dateFrom = getDateFrom(_biPeriod);
    const wrap  = document.getElementById('bi-content-wrap');
    if (wrap) wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:14px;padding:80px;color:rgba(255,255,255,0.3);">
        <div class="hub-loader" style="width:30px;height:30px;border-width:3px;"></div>
        Carregando analytics...
      </div>`;

    try {
      // 1. Fetch all workspaces (except demo-beta)
      const { data: allWS } = await sb
        .from('workspaces')
        .select('id, name, slug, level, regional_id, plan, status')
        .neq('slug', 'demo-beta')
        .order('name');

      const wsIds = (allWS || []).map(w => w.id);
      if (!wsIds.length) { _biLoading = false; return; }

      // 2. Fetch leads, start, batismo, membros, cantina — all in parallel
      const applyFilters = (q) => {
        let qq = q.in('workspace_id', wsIds);
        if (dateFrom) qq = qq.gte('created_at', dateFrom);
        return qq;
      };

      const [
        visitantesRes, consolidadosRes, startRes,
        batismoRes, membrosRes,
        cantinaRes, cantinaOrdersRes
      ] = await Promise.all([
        applyFilters(sb.from('leads').select('id,workspace_id', { count: 'exact' }).eq('type', 'visitor')),
        applyFilters(sb.from('leads').select('id,workspace_id', { count: 'exact' }).eq('type', 'saved')),
        applyFilters(sb.from('start_participants').select('id,workspace_id', { count: 'exact' })),
        applyFilters(sb.from('baptism_registrations').select('id,workspace_id', { count: 'exact' })),
        applyFilters(sb.from('member_registrations').select('id,workspace_id', { count: 'exact' })),
        applyFilters(sb.from('cantina_transactions').select('amount,workspace_id,type')),
        applyFilters(sb.from('cantina_orders').select('id,workspace_id,status,total', { count: 'exact' })),
      ]);

      // 3. Build per-workspace breakdown
      const wsMap = {};
      (allWS || []).forEach(w => {
        wsMap[w.id] = {
          ...w,
          visitantes: 0, consolidados: 0, start: 0,
          batismo: 0, membros: 0,
          receita: 0, pedidos: 0
        };
      });

      const countByWS = (rows, field) => {
        (rows || []).forEach(r => {
          if (wsMap[r.workspace_id]) wsMap[r.workspace_id][field]++;
        });
      };

      countByWS(visitantesRes.data,   'visitantes');
      countByWS(consolidadosRes.data, 'consolidados');
      countByWS(startRes.data,        'start');
      countByWS(batismoRes.data,      'batismo');
      countByWS(membrosRes.data,      'membros');
      countByWS(cantinaOrdersRes.data,'pedidos');

      (cantinaRes.data || []).forEach(t => {
        if (wsMap[t.workspace_id] && t.type === 'sale') {
          wsMap[t.workspace_id].receita += parseFloat(t.amount) || 0;
        }
      });

      // 4. Aggregate totals
      const totals = Object.values(wsMap).reduce((acc, w) => {
        acc.visitantes   += w.visitantes;
        acc.consolidados += w.consolidados;
        acc.start        += w.start;
        acc.batismo      += w.batismo;
        acc.membros      += w.membros;
        acc.receita      += w.receita;
        acc.pedidos      += w.pedidos;
        return acc;
      }, { visitantes: 0, consolidados: 0, start: 0, batismo: 0, membros: 0, receita: 0, pedidos: 0 });

      // 5. Fetch regionals for grouping
      const { data: regionals } = await sb
        .from('regionals')
        .select('id, name, responsible_workspace_id');

      _biData = { allWS, wsMap, totals, regionals: regionals || [], dateFrom };
      renderBIDashboard(_biData);

    } catch (err) {
      console.error('[BI] Erro:', err);
      if (wrap) wrap.innerHTML = `<div style="padding:60px;color:#f87171;text-align:center;">❌ Erro ao carregar BI: ${err.message}</div>`;
    } finally {
      _biLoading = false;
      _biLoaded  = true;
    }
  }

  // ── Renderer ─────────────────────────────────────────────────
  function renderBIDashboard({ allWS, wsMap, totals, regionals }) {
    const wrap = document.getElementById('bi-content-wrap');
    if (!wrap) return;

    const wsArr = Object.values(wsMap);
    const globalWS = wsArr.find(w => w.level === 'global');

    // Sort workspaces: global first, then by regional, then local by name
    const grouped = groupByHierarchy(wsArr, regionals);

    wrap.innerHTML = `
      <!-- ── Global KPIs ── -->
      <div class="bi-section-title">🌐 Visão Geral da Rede</div>
      <div class="bi-kpi-grid">
        ${biKPI('👣', 'Visitantes', fmt(totals.visitantes), '#818cf8', 'Total de novos visitantes')}
        ${biKPI('🙏', 'Consolidados', fmt(totals.consolidados), '#34d399', `${pct(totals.consolidados, totals.visitantes + totals.consolidados)}% do total`)}
        ${biKPI('📖', 'Start/Welcome', fmt(totals.start), '#fbbf24', `${pct(totals.start, totals.consolidados)}% dos consolidados`)}
        ${biKPI('💧', 'Batismos', fmt(totals.batismo), '#60a5fa', `${pct(totals.batismo, totals.start || 1)}% do Start`)}
        ${biKPI('🏠', 'Novos Membros', fmt(totals.membros), '#f472b6', `${pct(totals.membros, totals.batismo || 1)}% dos batizados`)}
        ${biKPI('💰', 'Receita Cantina', fmtCur(totals.receita), '#a78bfa', `${fmt(totals.pedidos)} pedidos`)}
        ${biKPI('🏢', 'Workspaces Ativos', fmt(allWS.filter(w => w.status === 'active').length), '#fb923c', `de ${fmt(allWS.length)} total`)}
      </div>

      <!-- ── Funnel Global ── -->
      <div class="bi-section-title" style="margin-top:36px;">🔽 Funil Global de Conversão</div>
      ${renderMiniGlobalFunnel(totals)}

      <!-- ── Regional Breakdown ── -->
      <div class="bi-section-title" style="margin-top:36px;">🗺️ Breakdown por Regional</div>
      ${renderRegionalBreakdown(grouped, regionals)}

      <!-- ── Workspace Table ── -->
      <div class="bi-section-title" style="margin-top:36px;">🏢 Ranking de Workspaces</div>
      ${renderWorkspaceTable(wsArr)}

      <!-- ── SVG Trend Chart ── -->
      <div class="bi-section-title" style="margin-top:36px;">📅 Crescimento da Rede (últimos 6 meses)</div>
      <div id="bi-chart-wrap" style="min-height:160px;">
        <div style="color:rgba(255,255,255,0.2);font-size:.85rem;text-align:center;padding:40px;">Carregando gráfico...</div>
      </div>
    `;

    // Load trend chart async
    loadBITrendChart(Object.keys(wsMap).filter(id => wsMap[id]));
  }

  // ── UI Helpers ───────────────────────────────────────────────
  function biKPI(emoji, label, value, color, note) {
    return `
      <div class="bi-kpi-card" style="--kpi-color:${color}">
        <div class="bi-kpi-top">
          <span class="bi-kpi-emoji">${emoji}</span>
          <span class="bi-kpi-value" style="color:${color}">${value}</span>
        </div>
        <div class="bi-kpi-label">${label}</div>
        <div class="bi-kpi-note">${note}</div>
      </div>`;
  }

  function renderMiniGlobalFunnel({ visitantes, consolidados, start, batismo, membros }) {
    const steps = [
      { label: 'Visitantes',    count: visitantes,   color: '#818cf8' },
      { label: 'Consolidados',  count: consolidados, color: '#34d399' },
      { label: 'Start',         count: start,        color: '#fbbf24' },
      { label: 'Batismo',       count: batismo,      color: '#60a5fa' },
      { label: 'Membros',       count: membros,      color: '#f472b6' },
    ];
    const maxVal = Math.max(...steps.map(s => s.count), 1);

    return `<div class="bi-funnel-wrap">
      ${steps.map((s, i) => {
        const barW = Math.round((s.count / maxVal) * 100);
        const conv = i > 0 ? pct(s.count, steps[i-1].count || 1) : null;
        return `
        <div class="bi-funnel-row">
          <div class="bi-funnel-label">${s.label}</div>
          <div class="bi-funnel-bar-wrap">
            <div class="bi-funnel-bar" style="width:${Math.max(barW, s.count > 0 ? 1 : 0)}%;background:${s.color};"></div>
          </div>
          <div class="bi-funnel-count" style="color:${s.color}">${fmt(s.count)}</div>
          ${conv !== null ? `<div class="bi-funnel-conv">↳ ${conv}%</div>` : `<div class="bi-funnel-conv"></div>`}
        </div>`;
      }).join('')}
    </div>`;
  }

  function groupByHierarchy(wsArr, regionals) {
    const regionalMap = {};
    regionals.forEach(r => { regionalMap[r.id] = { ...r, workspaces: [] }; });

    const unassigned = [];
    wsArr.forEach(w => {
      if (w.level === 'global') return; // shown separately
      if (w.regional_id && regionalMap[w.regional_id]) {
        regionalMap[w.regional_id].workspaces.push(w);
      } else {
        unassigned.push(w);
      }
    });

    return { regionalMap, unassigned };
  }

  function renderRegionalBreakdown({ regionalMap, unassigned }, regionals) {
    if (!regionals.length) {
      return `<div style="padding:30px;text-align:center;color:rgba(255,255,255,.2);font-size:.85rem;">Nenhuma regional configurada. Crie regionais na aba Regionais.</div>`;
    }

    const rows = Object.values(regionalMap).map(reg => {
      const wsList = reg.workspaces;
      const totR = wsList.reduce((acc, w) => {
        acc.visitantes   += w.visitantes;
        acc.consolidados += w.consolidados;
        acc.batismo      += w.batismo;
        acc.membros      += w.membros;
        acc.receita      += w.receita;
        return acc;
      }, { visitantes: 0, consolidados: 0, batismo: 0, membros: 0, receita: 0 });

      return `
        <div class="bi-regional-card">
          <div class="bi-regional-header">
            <span class="bi-regional-name">🗺️ ${reg.name}</span>
            <span class="bi-regional-count">${wsList.length} igrejas</span>
          </div>
          <div class="bi-regional-kpis">
            <span>👣 ${fmt(totR.visitantes)}</span>
            <span>🙏 ${fmt(totR.consolidados)}</span>
            <span>💧 ${fmt(totR.batismo)}</span>
            <span>🏠 ${fmt(totR.membros)}</span>
            <span>💰 ${fmtCur(totR.receita)}</span>
          </div>
          <div class="bi-regional-ws-list">
            ${wsList.sort((a,b) => b.consolidados - a.consolidados).map(w => `
              <div class="bi-regional-ws-row">
                <span class="bi-ws-name">${w.name}</span>
                <span class="bi-ws-stat">🙏 ${fmt(w.consolidados)}</span>
                <span class="bi-ws-stat">💧 ${fmt(w.batismo)}</span>
                <span class="bi-ws-stat" title="Conversão Consolidado→Batismo">${pct(w.batismo, w.consolidados || 1)}%</span>
              </div>`).join('')}
          </div>
        </div>`;
    });

    if (unassigned.length) {
      rows.push(`
        <div class="bi-regional-card" style="opacity:.7;">
          <div class="bi-regional-header">
            <span class="bi-regional-name">📌 Sem Regional</span>
            <span class="bi-regional-count">${unassigned.length} igrejas</span>
          </div>
          <div class="bi-regional-ws-list">
            ${unassigned.map(w => `
              <div class="bi-regional-ws-row">
                <span class="bi-ws-name">${w.name}</span>
                <span class="bi-ws-stat">🙏 ${fmt(w.consolidados)}</span>
                <span class="bi-ws-stat">💧 ${fmt(w.batismo)}</span>
              </div>`).join('')}
          </div>
        </div>`);
    }

    return `<div class="bi-regional-grid">${rows.join('')}</div>`;
  }

  function renderWorkspaceTable(wsArr) {
    const sorted = [...wsArr].sort((a, b) => b.consolidados - a.consolidados);
    return `
      <div class="bi-table-wrap">
        <table class="bi-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Igreja</th>
              <th>Plano</th>
              <th>👣 Visitantes</th>
              <th>🙏 Consolidados</th>
              <th>💧 Batismos</th>
              <th>🏠 Membros</th>
              <th>📊 Conv.</th>
              <th>💰 Receita</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((w, i) => `
              <tr class="bi-table-row ${w.level === 'global' ? 'bi-row-global' : ''}">
                <td class="bi-table-rank">${i + 1}</td>
                <td class="bi-table-name">
                  ${w.level === 'global' ? '🌐 ' : w.level === 'regional' ? '🗺️ ' : '🏢 '}
                  <strong>${w.name}</strong>
                  ${w.level !== 'local' ? `<span class="bi-level-badge bi-level-${w.level}">${w.level}</span>` : ''}
                </td>
                <td><span class="bi-plan-badge">${w.plan || 'free'}</span></td>
                <td>${fmt(w.visitantes)}</td>
                <td>${fmt(w.consolidados)}</td>
                <td>${fmt(w.batismo)}</td>
                <td>${fmt(w.membros)}</td>
                <td>
                  <span style="color:${pct(w.batismo, w.consolidados || 1) > 20 ? '#34d399' : pct(w.batismo, w.consolidados || 1) > 10 ? '#fbbf24' : '#fb7185'}">
                    ${pct(w.batismo, w.consolidados || 1)}%
                  </span>
                </td>
                <td>${fmtCur(w.receita)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── Trend Chart ──────────────────────────────────────────────
  async function loadBITrendChart(wsIds) {
    const sb    = getSupabase();
    const since = new Date(Date.now() - 6 * 30 * 86400000).toISOString();

    const [leadsRes, batRes] = await Promise.all([
      sb.from('leads').select('type,created_at').in('workspace_id', wsIds).gte('created_at', since),
      sb.from('baptism_registrations').select('created_at').in('workspace_id', wsIds).gte('created_at', since),
    ]);

    const months = {};
    const add = (date, key) => {
      const m = date.substring(0, 7);
      if (!months[m]) months[m] = { visitantes: 0, consolidados: 0, batismo: 0 };
      months[m][key]++;
    };

    (leadsRes.data || []).forEach(l => add(l.created_at, l.type === 'visitor' ? 'visitantes' : 'consolidados'));
    (batRes.data  || []).forEach(l => add(l.created_at, 'batismo'));

    const sortedM = Object.keys(months).sort().slice(-6);
    renderBIChart(sortedM, months);
  }

  function renderBIChart(sortedM, months) {
    const wrap = document.getElementById('bi-chart-wrap');
    if (!wrap || !sortedM.length) {
      if (wrap) wrap.innerHTML = `<div style="color:rgba(255,255,255,.2);text-align:center;padding:40px;font-size:.85rem;">Sem dados suficientes.</div>`;
      return;
    }

    const W = 680, H = 210, PAD = { top: 20, right: 20, bottom: 42, left: 48 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top  - PAD.bottom;

    const series = [
      { key: 'visitantes',   color: '#818cf8', label: 'Visitantes' },
      { key: 'consolidados', color: '#34d399', label: 'Consolidados' },
      { key: 'batismo',      color: '#60a5fa', label: 'Batismos' },
    ];

    const allVals = sortedM.flatMap(m => series.map(s => (months[m] || {})[s.key] || 0));
    const maxVal  = Math.max(...allVals, 1);
    const xStep   = plotW / Math.max(sortedM.length - 1, 1);
    const yScale  = v => plotH - (v / maxVal) * plotH;

    const labelM = m => ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m.split('-')[1]) - 1];

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const yy = PAD.top + yScale(maxVal * f);
      return `<line x1="${PAD.left}" y1="${yy}" x2="${W - PAD.right}" y2="${yy}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4 4"/>
              <text x="${PAD.left - 6}" y="${yy + 4}" fill="rgba(255,255,255,.3)" font-size="10" text-anchor="end">${Math.round(maxVal * f)}</text>`;
    }).join('');

    const seriesSVG = series.map(s => {
      const pts = sortedM.map((m, i) => ({
        x: PAD.left + i * xStep,
        y: PAD.top  + yScale((months[m] || {})[s.key] || 0)
      }));
      const d    = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      const dots = pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${s.color}"/>`).join('');
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>
              ${dots}`;
    }).join('');

    const xLabels = sortedM.map((m, i) =>`<text x="${(PAD.left + i * xStep).toFixed(1)}" y="${H - 10}" fill="rgba(255,255,255,.4)" font-size="11" text-anchor="middle">${labelM(m)}</text>`).join('');

    const legend = series.map(s => `
      <span style="display:inline-flex;align-items:center;gap:5px;font-size:.72rem;color:rgba(255,255,255,.5);">
        <span style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;"></span>${s.label}
      </span>`).join('');

    wrap.innerHTML = `
      <div style="width:100%;overflow-x:auto;">
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">${legend}</div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;display:block;">
          ${gridLines}
          ${seriesSVG}
          ${xLabels}
        </svg>
      </div>`;
  }

  // ── Wire into switchDevTab ───────────────────────────────────
  const _origSwitchDevTab = window.switchDevTab;
  window.switchDevTab = function (tab) {
    if (_origSwitchDevTab) _origSwitchDevTab(tab);
    if (tab === 'analytics' && !_biLoaded) {
      loadBIDashboard();
    }
  };

  // Expose for manual refresh
  window.loadBIDashboard = loadBIDashboard;

})();
