// ═══════════════════════════════════════════════════════════════
// hub-retencao.js — Relatório de Retenção (Funil de Crescimento)
// Lazy-loaded via patchSwitchTab when user navigates to 'retencao'
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────
  let _retencaoPeriod = '90d';
  let _retencaoScope  = 'local';  // 'local' | 'regional' | 'global'
  let _retencaoData   = null;
  let _retencaoLoaded = false;
  let _wsLevel        = null;     // 'local' | 'regional' | 'global'
  let _wsRegionalId   = null;
  let _wsGlobalId     = null;

  // ── Helpers ──────────────────────────────────────────────────
  function getDateFrom(period) {
    if (!period || period === 'all') return null;
    const n = parseInt(period);
    if (period.endsWith('d')) return new Date(Date.now() - n * 86400000).toISOString();
    if (period.endsWith('m')) return new Date(Date.now() - n * 30 * 86400000).toISOString();
    if (period === 'year') {
      const d = new Date(); d.setMonth(0); d.setDate(1); d.setHours(0,0,0,0);
      return d.toISOString();
    }
    return null;
  }

  function pct(a, b) {
    if (!b || b === 0) return 0;
    return Math.round((a / b) * 100);
  }

  function fmt(n) { return (n || 0).toLocaleString('pt-BR'); }

  // ── Scope Tab Init ───────────────────────────────────────────
  async function initRetencaoScopeTabs(wsId) {
    const sb = getSupabase();
    // Fetch workspace level + regional_id + global_id
    const { data: ws } = await sb
      .from('workspaces')
      .select('level, regional_id, global_id, slug')
      .eq('id', wsId)
      .single();

    if (!ws) return;
    _wsLevel      = ws.level || 'local';
    _wsRegionalId = ws.regional_id;
    _wsGlobalId   = ws.global_id;

    const tabWrap = document.getElementById('retencao-scope-tabs');
    if (!tabWrap) return;

    const isMaster = typeof window._isMasterAdmin !== 'undefined' ? window._isMasterAdmin : false;
    const isGlobal = _wsLevel === 'global' || isMaster;
    const isRegional = _wsLevel === 'regional' || isGlobal;

    tabWrap.innerHTML = `
      <button class="retencao-scope-tab active" onclick="setRetencaoScope('local',this)">🏠 Local</button>
      ${isRegional ? `<button class="retencao-scope-tab" onclick="setRetencaoScope('regional',this)">🗺️ Regional</button>` : ''}
      ${isGlobal   ? `<button class="retencao-scope-tab global" onclick="setRetencaoScope('global',this)">🌐 Global</button>` : ''}
    `;
  }

  // ── Scope Selector ───────────────────────────────────────────
  window.setRetencaoScope = function(scope, btn) {
    _retencaoScope  = scope;
    _retencaoLoaded = false;
    document.querySelectorAll('.retencao-scope-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadRetencaoFunnel();
  };

  // ── Main Load ────────────────────────────────────────────────
  async function loadRetencaoFunnel() {
    const sb = getSupabase();
    const wsId = await getWorkspaceId();
    if (!wsId) return;

    const dateFrom = getDateFrom(_retencaoPeriod);
    const container = document.getElementById('retencao-funnel-wrap');
    if (container) container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:14px;padding:60px;color:rgba(255,255,255,0.3);">
        <div class="hub-loader" style="width:28px;height:28px;border-width:3px;"></div>
        Carregando dados...
      </div>`;

    try {
      // Determine workspace IDs to query based on scope
      let wsIds = [wsId];

      if (_retencaoScope === 'regional' && _wsRegionalId) {
        const { data: siblings } = await sb
          .from('workspaces')
          .select('id')
          .eq('regional_id', _wsRegionalId)
          .neq('slug', 'demo-beta');
        wsIds = (siblings || []).map(w => w.id);
        if (!wsIds.length) wsIds = [wsId];
      } else if (_retencaoScope === 'global') {
        const { data: all } = await sb
          .from('workspaces')
          .select('id')
          .neq('slug', 'demo-beta');
        wsIds = (all || []).map(w => w.id);
        if (!wsIds.length) wsIds = [wsId];
      }

      // ── Parallel queries using wsIds (scope-aware) ──
      const applyFilters = (q) => {
        let qq = q.in('workspace_id', wsIds);
        if (dateFrom) qq = qq.gte('created_at', dateFrom);
        return qq;
      };

      const [
        visitantesRes, consolidadosRes, startRes,
        batismoRes, membrosRes, gcRes
      ] = await Promise.all([
        applyFilters(sb.from('leads').select('id,created_at,decisao', { count: 'exact', head: false }).eq('type', 'visitor')),
        applyFilters(sb.from('leads').select('id,created_at,decisao', { count: 'exact', head: false }).eq('type', 'saved')),
        applyFilters(sb.from('start_participants').select('id,created_at', { count: 'exact', head: false })),
        applyFilters(sb.from('baptism_registrations').select('id,created_at', { count: 'exact', head: false })),
        applyFilters(sb.from('member_registrations').select('id,created_at', { count: 'exact', head: false })),
        applyFilters(sb.from('leads').select('id,gc_status', { count: 'exact', head: false }).eq('type', 'saved').in('gc_status', ['Sim', 'Quero participar', 'Participa'])),
      ]);

      const visitantes   = visitantesRes.count   || 0;
      const consolidados = consolidadosRes.count  || 0;
      const start        = startRes.count         || 0;
      const batismo      = batismoRes.count        || 0;
      const membros      = membrosRes.count        || 0;
      const gcInt        = gcRes.count             || 0;

      // Decisão breakdown from consolidados
      const decisaoMap = {};
      (consolidadosRes.data || []).forEach(l => {
        const d = l.decisao || 'Não Informado';
        decisaoMap[d] = (decisaoMap[d] || 0) + 1;
      });

      _retencaoData = { visitantes, consolidados, start, batismo, membros, gcInt, decisaoMap, dateFrom };

      renderFunnel({ visitantes, consolidados, start, batismo, membros, gcInt, decisaoMap });
      await loadRetencaoTendencia(wsIds, dateFrom);

    } catch (err) {
      console.error('[Retenção] Erro:', err);
      if (container) container.innerHTML = `<div style="padding:40px;color:#f87171;text-align:center;">❌ Erro ao carregar dados: ${err.message}</div>`;
    }
  }

  // ── Funnel Renderer ──────────────────────────────────────────
  function renderFunnel({ visitantes, consolidados, start, batismo, membros, gcInt, decisaoMap }) {
    const label3 = (typeof window._currentWorkspaceStartLabel === 'string' && window._currentWorkspaceStartLabel)
      ? window._currentWorkspaceStartLabel
      : 'Start';

    // Max value for bar width calculations — use the largest of consolidados/visitantes
    const maxVal = Math.max(visitantes, consolidados, 1);

    const steps = [
      { emoji: '👣', label: 'Visitantes',      count: visitantes,   prev: null,         color: '#818cf8', pctOf: null },
      { emoji: '🙏', label: 'Consolidados',    count: consolidados, prev: null,         color: '#34d399', pctOf: null },
      { emoji: '📖', label: label3,            count: start,        prev: consolidados, color: '#fbbf24', pctOf: consolidados },
      { emoji: '💧', label: 'Batismo',         count: batismo,      prev: start || consolidados, color: '#60a5fa', pctOf: start || consolidados },
      { emoji: '🏠', label: 'Novos Membros',   count: membros,      prev: batismo || start || consolidados, color: '#f472b6', pctOf: batismo || start || consolidados },
    ];

    // ── Insights ──
    const insights = [
      { label: 'Visitantes → Consolidados', value: pct(consolidados, visitantes + consolidados), suffix: '%', note: 'do total de entradas' },
      { label: `Consolidados → ${label3}`,  value: pct(start, consolidados), suffix: '%', note: 'dos consolidados' },
      { label: `${label3} → Batismo`,       value: pct(batismo, start || 1), suffix: '%', note: `dos inscritos no ${label3}` },
      { label: 'Batismo → Novos Membros',   value: pct(membros, batismo || 1), suffix: '%', note: 'dos batizados' },
      { label: 'GC Integrados',             value: pct(gcInt, consolidados || 1), suffix: '%', note: 'dos consolidados' },
      { label: 'Consolidados (total)',       value: fmt(consolidados), suffix: '', note: 'registros no período' },
    ];

    // ── Top 3 decisões ──
    const topDecisoes = Object.entries(decisaoMap)
      .filter(([k]) => k !== 'Não Informado')
      .sort(([,a],[,b]) => b - a)
      .slice(0, 3);

    const container = document.getElementById('retencao-funnel-wrap');
    if (!container) return;

    container.innerHTML = `
      <!-- Funnel Steps -->
      <div class="retencao-section-title">🔽 Funil de Progressão</div>
      <div class="retencao-funnel-steps">
        ${steps.map((s, i) => {
          const barPct = Math.round((s.count / maxVal) * 100);
          const convPct = s.pctOf !== null ? pct(s.count, s.pctOf || 1) : null;
          return `
          <div class="retencao-step" style="--step-color:${s.color};animation-delay:${i * 80}ms">
            <div class="retencao-step-left">
              <span class="retencao-step-emoji">${s.emoji}</span>
              <div class="retencao-step-info">
                <span class="retencao-step-label">${s.label}</span>
                ${convPct !== null ? `<span class="retencao-step-conv">↳ ${convPct}% da etapa anterior</span>` : ''}
              </div>
            </div>
            <div class="retencao-step-right">
              <div class="retencao-bar-wrap">
                <div class="retencao-bar" style="width:${Math.max(barPct, s.count > 0 ? 2 : 0)}%;background:${s.color};"></div>
              </div>
              <span class="retencao-step-count">${fmt(s.count)}</span>
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- Insights Grid -->
      <div class="retencao-section-title" style="margin-top:32px;">📈 Taxas de Conversão</div>
      <div class="retencao-insights-grid">
        ${insights.map(ins => `
          <div class="retencao-insight-card">
            <div class="retencao-insight-value" style="color:var(--accent)">${ins.value}${ins.suffix}</div>
            <div class="retencao-insight-label">${ins.label}</div>
            <div class="retencao-insight-note">${ins.note}</div>
          </div>`).join('')}
      </div>

      <!-- Tipos de Decisão -->
      ${topDecisoes.length ? `
      <div class="retencao-section-title" style="margin-top:32px;">🙏 Principais Tipos de Decisão</div>
      <div class="retencao-decisoes-list">
        ${topDecisoes.map(([label, count]) => `
          <div class="retencao-decisao-item">
            <span class="retencao-decisao-label">${label}</span>
            <div class="retencao-decisao-bar-wrap">
              <div class="retencao-decisao-bar" style="width:${Math.round((count / Math.max(...Object.values(decisaoMap))) * 100)}%"></div>
            </div>
            <span class="retencao-decisao-count">${fmt(count)}</span>
          </div>`).join('')}
      </div>` : ''}

      <!-- Chart placeholder — filled by loadRetencaoTendencia -->
      <div class="retencao-section-title" style="margin-top:32px;">📅 Tendência Mensal</div>
      <div id="retencao-chart-wrap" style="min-height:160px;display:flex;align-items:center;justify-content:center;">
        <div style="color:rgba(255,255,255,0.2);font-size:.85rem;">Carregando gráfico...</div>
      </div>
    `;
  }

  // ── Monthly Trend Chart (SVG) ────────────────────────────────
  async function loadRetencaoTendencia(wsIds, dateFrom) {
    const sb = getSupabase();
    const since = dateFrom || new Date(Date.now() - 6 * 30 * 86400000).toISOString();

    const [leadsRes, startRes, batRes] = await Promise.all([
      sb.from('leads').select('type,created_at').in('workspace_id', wsIds).gte('created_at', since),
      sb.from('start_participants').select('created_at').in('workspace_id', wsIds).gte('created_at', since),
      sb.from('baptism_registrations').select('created_at').in('workspace_id', wsIds).gte('created_at', since),
    ]);

    // Group by month
    const months = {};
    const addToMonth = (date, key) => {
      const m = date.substring(0, 7); // YYYY-MM
      if (!months[m]) months[m] = { visitantes: 0, consolidados: 0, start: 0, batismo: 0 };
      months[m][key]++;
    };

    (leadsRes.data || []).forEach(l => {
      addToMonth(l.created_at, l.type === 'visitor' ? 'visitantes' : 'consolidados');
    });
    (startRes.data || []).forEach(l => addToMonth(l.created_at, 'start'));
    (batRes.data || []).forEach(l => addToMonth(l.created_at, 'batismo'));

    const sortedMonths = Object.keys(months).sort().slice(-6);
    renderSVGChart(sortedMonths, months);
  }

  function renderSVGChart(sortedMonths, months) {
    const chartWrap = document.getElementById('retencao-chart-wrap');
    if (!chartWrap || !sortedMonths.length) {
      if (chartWrap) chartWrap.innerHTML = `<div style="color:rgba(255,255,255,0.2);font-size:.85rem;padding:40px;">Sem dados suficientes para o gráfico.</div>`;
      return;
    }

    const W = 620, H = 200, PAD = { top: 20, right: 20, bottom: 40, left: 44 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const series = [
      { key: 'visitantes',   color: '#818cf8', label: 'Visitantes' },
      { key: 'consolidados', color: '#34d399', label: 'Consolidados' },
      { key: 'start',        color: '#fbbf24', label: 'Start' },
      { key: 'batismo',      color: '#60a5fa', label: 'Batismo' },
    ];

    const allVals = sortedMonths.flatMap(m => series.map(s => (months[m] || {})[s.key] || 0));
    const maxVal = Math.max(...allVals, 1);

    const xStep = plotW / Math.max(sortedMonths.length - 1, 1);
    const yScale = v => plotH - (v / maxVal) * plotH;

    const labelMonth = m => {
      const [y, mo] = m.split('-');
      return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(mo) - 1];
    };

    // Y-axis gridlines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const yy = PAD.top + yScale(maxVal * f);
      const val = Math.round(maxVal * f);
      return `<line x1="${PAD.left}" y1="${yy}" x2="${W - PAD.right}" y2="${yy}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4 4"/>
              <text x="${PAD.left - 6}" y="${yy + 4}" fill="rgba(255,255,255,0.3)" font-size="10" text-anchor="end">${val}</text>`;
    }).join('');

    // Lines + dots for each series
    const seriesMarkup = series.map(s => {
      const points = sortedMonths.map((m, i) => {
        const x = PAD.left + i * xStep;
        const y = PAD.top + yScale((months[m] || {})[s.key] || 0);
        return { x, y };
      });
      const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      const dots = points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${s.color}" opacity=".9"/>`).join('');
      return `<path d="${pathD}" fill="none" stroke="${s.color}" stroke-width="2" opacity=".85"/>
              ${dots}`;
    }).join('');

    // X labels
    const xLabels = sortedMonths.map((m, i) => {
      const x = PAD.left + i * xStep;
      return `<text x="${x.toFixed(1)}" y="${H - 8}" fill="rgba(255,255,255,0.4)" font-size="11" text-anchor="middle">${labelMonth(m)}</text>`;
    }).join('');

    // Legend
    const legend = series.map(s => `
      <span style="display:inline-flex;align-items:center;gap:5px;font-size:.72rem;color:rgba(255,255,255,0.5);">
        <span style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;"></span>${s.label}
      </span>`).join('');

    chartWrap.innerHTML = `
      <div style="width:100%;overflow-x:auto;">
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
          ${legend}
        </div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;display:block;">
          ${gridLines}
          ${seriesMarkup}
          ${xLabels}
        </svg>
      </div>`;
  }

  // ── Period Filter ─────────────────────────────────────────────
  window.setRetencaoPeriod = function(period, btn) {
    _retencaoPeriod = period;
    _retencaoLoaded = false;
    document.querySelectorAll('#retencao-period-btns .period-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadRetencaoFunnel();
  };

  // ── CSV Export ────────────────────────────────────────────────
  window.exportRetencaoCSV = function() {
    if (!_retencaoData) return;
    const { visitantes, consolidados, start, batismo, membros, gcInt } = _retencaoData;
    const label3 = window._currentWorkspaceStartLabel || 'Start';
    const rows = [
      ['Etapa', 'Total', '% da etapa anterior'],
      ['Visitantes', visitantes, '—'],
      ['Consolidados', consolidados, '—'],
      [label3, start, `${pct(start, consolidados)}%`],
      ['Batismo', batismo, `${pct(batismo, start || consolidados)}%`],
      ['Novos Membros', membros, `${pct(membros, batismo || 1)}%`],
      ['GC Integrados', gcInt, `${pct(gcInt, consolidados)}%`],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `relatorio-retencao-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    if (typeof triggerConfetti === 'function') triggerConfetti();
    showToast('📊 CSV exportado com sucesso!', 'success');
    window.logAudit && window.logAudit('retencao.export_csv', { entity_type: 'workspace', metadata: { period: _retencaoPeriod } });
  };

  // ── PDF Export ────────────────────────────────────────────────
  window.exportRetencaoPDF = function() {
    if (!_retencaoData) { showToast('Carregue o relatório primeiro.', 'error'); return; }
    const { visitantes, consolidados, start, batismo, membros, gcInt } = _retencaoData;
    const label3 = window._currentWorkspaceStartLabel || 'Start';
    const wsName = window._currentWorkspace?.name || 'Workspace';
    const periodLabel = { '30d':'30 dias','90d':'90 dias','6m':'6 meses','year':'Este ano','all':'Todo período' }[_retencaoPeriod] || _retencaoPeriod;

    if (typeof window.exportFinanceiroPDF === 'function') {
      window.exportFinanceiroPDF({
        title: '📊 Relatório de Retenção',
        workspace: wsName,
        period: periodLabel,
        kpis: [
          { label: 'Visitantes',       value: fmt(visitantes),   color: '#818cf8' },
          { label: 'Consolidados',     value: fmt(consolidados), color: '#34d399' },
          { label: label3,             value: fmt(start),        color: '#fbbf24' },
          { label: 'Batismo',          value: fmt(batismo),      color: '#60a5fa' },
          { label: 'Novos Membros',    value: fmt(membros),      color: '#f472b6' },
          { label: 'GC Integrados',    value: `${pct(gcInt, consolidados)}%`, color: '#a78bfa' },
        ],
        tableRows: [
          ['Etapa', 'Total', 'Conversão'],
          ['Visitantes', visitantes, '—'],
          ['Consolidados', consolidados, '—'],
          [label3, start, pct(start, consolidados) + '%'],
          ['Batismo', batismo, pct(batismo, start || consolidados) + '%'],
          ['Novos Membros', membros, pct(membros, batismo || 1) + '%'],
          ['GC Integrados', gcInt, pct(gcInt, consolidados) + '%'],
        ],
      });
    }
    window.logAudit && window.logAudit('retencao.export_pdf', { entity_type: 'workspace', metadata: { period: _retencaoPeriod } });
  };

  // ── Lazy-load via patchSwitchTab ─────────────────────────────
  (function patchSwitchTab() {
    const _orig = window.switchTab;
    window.switchTab = function (tabName) {
      _orig && _orig(tabName);
      if (tabName === 'retencao' && !_retencaoLoaded) {
        _retencaoLoaded = true;
        // Init scope tabs first, then load
        getWorkspaceId().then(wsId => {
          if (wsId && !_wsLevel) {
            initRetencaoScopeTabs(wsId).then(() => loadRetencaoFunnel());
          } else {
            loadRetencaoFunnel();
          }
        });
      }
    };
  })();

})();
