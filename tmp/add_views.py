import os
import re

html_path = 'frontend/dashboard.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Navigation
nav_injection = """
            <li id="nav-visitors" onclick="switchTab('visitors')">Visitantes</li>
            <li class="disabled" title="Em Construção">Mensagens IA</li>
            <li class="disabled" title="Em Construção">Agenda Batismos</li>
            <li id="nav-logs" onclick="switchTab('logs')">Auditoria de Logs</li>
            <li id="nav-users" onclick="switchTab('users')">Usuários da Equipe</li>
"""
html = re.sub(
    r'<li class="disabled".*?Mensagens IA.*?<li id="nav-settings"',
    nav_injection.strip() + r"\n            <li id=\"nav-settings\"",
    html,
    flags=re.DOTALL
)

# 2. Inject `view-users` and `view-visitors` after `view-dashboard`
view_users_block = """
        <!-- View: Users -->
        <div id="view-users" class="view-section">
            <header class="top-bar">
                <div class="page-title">
                    <h1>Membros da Equipe e Níveis de Acesso</h1>
                    <p>Controle quem pode acessar o dashboard, mensagens da IA e configurações de Workspace.</p>
                </div>
                <div class="actions">
                    <button class="btn btn-outline" style="background: var(--accent); color: #000; border: none; font-weight: 600;">+ Novo Usuário</button>
                </div>
            </header>
            <div style="padding: 40px; display: flex; flex-direction: column; gap: 20px; max-width: 1200px;">
                <div class="kpi-box" style="padding: 0; overflow: hidden; border: 1px solid var(--card-border);">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--card-border); background: var(--nav-bg);">
                                <th style="padding: 15px; font-weight: 600; color: var(--text-dim);">NAME</th>
                                <th style="padding: 15px; font-weight: 600; color: var(--text-dim);">STATUS</th>
                                <th style="padding: 15px; font-weight: 600; color: var(--text-dim);">ROLE</th>
                                <th style="padding: 15px; font-weight: 600; color: var(--text-dim);">ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom: 1px solid var(--card-border);">
                                <td style="padding: 15px; display: flex; align-items: center; gap: 15px;">
                                    <div style="background: var(--accent); color: #000; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem;">GT</div>
                                    <div>
                                        <div style="font-weight: 600; color: var(--text-main);">gtorreshbl@gmail.com</div>
                                        <div style="color: var(--text-dim); font-size: 0.8rem;">Gabriel Torres</div>
                                    </div>
                                </td>
                                <td style="padding: 15px;"><span style="color: #4CAF50; border: 1px solid rgba(76,175,80,0.3); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">Active</span></td>
                                <td style="padding: 15px;"><span style="border: 1px solid var(--text-dim); color: var(--text-dim); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem;">Master Admin</span></td>
                                <td style="padding: 15px;"><button class="btn-outline" style="padding: 5px 10px; border-radius: 6px;">⚙️</button></td>
                            </tr>
                            <tr style="border-bottom: 1px solid var(--card-border);">
                                <td style="padding: 15px; display: flex; align-items: center; gap: 15px;">
                                    <div style="background: #2E8B57; color: #FFF; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem;">JV</div>
                                    <div>
                                        <div style="font-weight: 600; color: var(--text-main);">juveloso@lagoinhaorlando.com</div>
                                        <div style="color: var(--text-dim); font-size: 0.8rem;">Juliana Veloso</div>
                                    </div>
                                </td>
                                <td style="padding: 15px;"><span style="color: #4CAF50; border: 1px solid rgba(76,175,80,0.3); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">Active</span></td>
                                <td style="padding: 15px;"><span style="border: 1px solid var(--text-dim); color: var(--text-dim); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem;">Admin</span></td>
                                <td style="padding: 15px;"><button class="btn-outline" style="padding: 5px 10px; border-radius: 6px;">⚙️</button></td>
                            </tr>
                            <tr style="border-bottom: 1px solid var(--card-border);">
                                <td style="padding: 15px; display: flex; align-items: center; gap: 15px;">
                                    <div style="background: #4682B4; color: #FFF; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem;">CR</div>
                                    <div>
                                        <div style="font-weight: 600; color: var(--text-main);">criszinharodrigues@hotmail.com</div>
                                        <div style="color: var(--text-dim); font-size: 0.8rem;">Cris Rodrigues</div>
                                    </div>
                                </td>
                                <td style="padding: 15px;"><span style="color: #4CAF50; border: 1px solid rgba(76,175,80,0.3); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">Active</span></td>
                                <td style="padding: 15px;"><span style="border: 1px solid var(--text-dim); color: var(--text-dim); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem;">Líder</span></td>
                                <td style="padding: 15px;"><button class="btn-outline" style="padding: 5px 10px; border-radius: 6px;">⚙️</button></td>
                            </tr>
                            <tr style="border-bottom: 1px solid var(--card-border);">
                                <td style="padding: 15px; display: flex; align-items: center; gap: 15px;">
                                    <div style="background: #DA70D6; color: #FFF; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem;">RB</div>
                                    <div>
                                        <div style="font-weight: 600; color: var(--text-main);">rafasbarbosa@hotmail.com</div>
                                        <div style="color: var(--text-dim); font-size: 0.8rem;">Rafael Barbosa</div>
                                    </div>
                                </td>
                                <td style="padding: 15px;"><span style="color: #4CAF50; border: 1px solid rgba(76,175,80,0.3); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">Active</span></td>
                                <td style="padding: 15px;"><span style="border: 1px solid var(--text-dim); color: var(--text-dim); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem;">Líder</span></td>
                                <td style="padding: 15px;"><button class="btn-outline" style="padding: 5px 10px; border-radius: 6px;">⚙️</button></td>
                            </tr>
                            <tr>
                                <td style="padding: 15px; display: flex; align-items: center; gap: 15px;">
                                    <div style="background: #808080; color: #FFF; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem;">👤</div>
                                    <div>
                                        <div style="font-weight: 600; color: var(--text-main);">exemplo_voluntario@team.com</div>
                                        <div style="color: var(--text-dim); font-size: 0.8rem;">Perfil Base (Voluntário)</div>
                                    </div>
                                </td>
                                <td style="padding: 15px;"><span style="color: #FFB347; border: 1px solid rgba(255,179,71,0.3); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">Draft</span></td>
                                <td style="padding: 15px;"><span style="border: 1px solid var(--text-dim); color: var(--text-dim); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem;">Voluntário</span></td>
                                <td style="padding: 15px;"><button class="btn-outline" style="padding: 5px 10px; border-radius: 6px;">⚙️</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-dim); line-height: 1.5;">
                    📋 <strong>Níveis de Acesso:</strong> <br>
                    <strong>Master Admin:</strong> Acesso total ao sistema (incluindo exclusão de logs e config global).<br>
                    <strong>Admin:</strong> Acesso a quase tudo, exceto edição estrutural da IA e regras do tenant.<br>
                    <strong>Líder:</strong> Visualização de relatórios, acompanhamento de métricas e conversas da IA.<br>
                    <strong>Voluntário:</strong> Acesso focado somente em tarefas operacionais manuais (formulários, cards), sem histórico oculto.
                </div>
            </div>
        </div>
"""

view_visitors_block = """
        <!-- View: Visitors -->
        <div id="view-visitors" class="view-section">
            <header class="top-bar">
                <div class="page-title">
                    <h1>Mapeamento de Visitantes</h1>
                    <p>Controle das primeiras visitas e roteamento de conexão.</p>
                </div>
                <div class="actions">
                    <button class="btn btn-outline" onclick="fetchLiveLeads()">Sincronizar</button>
                    <button class="btn" style="background: var(--text-main); color: var(--bg-color);" onclick="window.open('./visitor-form.html', '_blank')">+ Novo Visitante</button>
                </div>
            </header>

            <div class="kpi-row">
                <div class="kpi-box">
                    <div class="kpi-title">Welcome Message (IA)</div>
                    <div class="kpi-number">
                        <span id="vkpi-t1" style="color: var(--accent);">0</span>
                        <span class="kpi-total">/ <span id="vkpi-total-1">0</span></span>
                    </div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-title">Follow-up Humano</div>
                    <div class="kpi-number">
                        <span id="vkpi-t2" style="color: #00BFFF;">0</span>
                        <span class="kpi-total">/ <span id="vkpi-total-1">0</span></span>
                    </div>
                </div>
            </div>
            
            <div class="filters">
                <div class="search-box">
                    <span>🔍</span>
                    <input type="text" id="vSearchInput" placeholder="Busque por nome ou telefone..." class="search-input" oninput="applyFilters()">
                </div>
                
                <select class="select-filter" id="vFilterCountry" onchange="applyFilters()">
                    <option value="all">Todos os Países...</option>
                </select>

                <select class="select-filter" id="vFilterTimeRange" onchange="applyFilters()">
                    <option value="all">Todo o Período</option>
                    <option value="30">Últimos 30 Dias</option>
                    <option value="7" selected>Últimos 7 Dias</option>
                </select>
                
                <select class="select-filter" id="vFilterDate" onchange="applyFilters()">
                    <option value="desc">Mais recentes primeiro</option>
                    <option value="asc">Mais antigos primeiro</option>
                </select>
            </div>

            <div class="leads-grid" id="visitors-container">
            </div>
        </div>
"""

html = html.replace('<!-- View: Logs -->', view_visitors_block + '\n        <!-- View: Logs -->')
html = html.replace('<!-- View: Logs -->', view_users_block + '\n        <!-- View: Logs -->')

# Update rendering logic to separate Consolidados vs Visitors
# We need to replace the JS structure nicely.
# Let's write the modified JS chunks.

new_js = """
            let globalConsolidados = [];
            let globalVisitors = [];

            window.switchTab = function(tabName) {
                document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
                const viewEl = document.getElementById('view-' + tabName);
                if(viewEl) viewEl.classList.add('active');

                document.querySelectorAll('.nav li').forEach(el => el.classList.remove('active'));
                const navEl = document.getElementById('nav-' + tabName);
                if(navEl) navEl.classList.add('active');
            };

            window.fetchLiveLeads = async function() {
                try {
                    const lc = document.getElementById('leads-container');
                    if (lc) lc.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 40px;"><p>Sincronizando registros...</p></div>';

                    let allLeads = [];
                    let start = 0;
                    const step = 2000;
                    let hasMore = true;

                    while(hasMore) {
                        const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).range(start, start + step - 1);
                        if (error) { console.error(error); return; }
                        if (data && data.length > 0) {
                            allLeads.push(...data);
                            start += step;
                            if(data.length < step) hasMore = false;
                        } else {
                            hasMore = false;
                        }
                    }
                    globalLeads = allLeads;
                    
                    // Group Cross Tagging Logic
                    const mappedByPhone = {};
                    globalLeads.forEach(l => {
                        const p = String(l.phone||'').replace(/\D/g, '');
                        if(!mappedByPhone[p]) mappedByPhone[p] = [];
                        mappedByPhone[p].push(l);
                    });

                    globalLeads.forEach(l => {
                        l.hasCrossTag = false;
                        l.crossTagType = null;
                        
                        const p = String(l.phone||'').replace(/\D/g,'');
                        const myDate = new Date(l.created_at);
                        const myType = l.type || 'saved';

                        const related = mappedByPhone[p].find(other => {
                            if(other.id === l.id) return false;
                            const otherType = other.type || 'saved';
                            if(otherType === myType) return false;
                            
                            const otherDate = new Date(other.created_at);
                            const diffH = Math.abs(myDate - otherDate) / (1000 * 3600);
                            return diffH <= 24; // If the distinct types (visitor/saved) were submitted within 24h
                        });

                        if(related) {
                            l.hasCrossTag = true;
                            l.crossTagType = related.type || 'saved'; // E.g., if I am visitor, my cross tag is 'saved'
                        }
                    });

                    globalConsolidados = globalLeads.filter(l => l.type !== 'visitor');
                    globalVisitors = globalLeads.filter(l => l.type === 'visitor');

                    // Setup filters dynamically
                    let setDecisao = new Set(globalConsolidados.map(l => l.decisao).filter(Boolean));
                    let setCultos = new Set(globalConsolidados.map(l => l.culto).filter(Boolean));
                    populateSelect('filterStatus', setDecisao, 'Todas as Decisões');
                    populateSelect('filterCulto', setCultos, 'Qualquer Culto');
                    
                    let setPaises = new Set(globalVisitors.map(l => l.pais).filter(Boolean));
                    populateSelect('vFilterCountry', setPaises, 'Todos os Países');

                    if(window.applyFilters) applyFilters();

                } catch (err) { console.error("Erro fetchLiveLeads: ", err); }
            };

            window.applyFilters = function() {
                // Consolidados Filter
                const searchTxt = String(document.getElementById('searchInput').value || '').toLowerCase();
                const stat = document.getElementById('filterStatus').value.toLowerCase();
                const culto = document.getElementById('filterCulto').value.toLowerCase();
                const trC = document.getElementById('filterTimeRange').value;
                const dC = document.getElementById('filterDate').value;
                
                let filteredC = globalConsolidados.filter(lead => {
                    const matchName = String(lead.name||'').toLowerCase().includes(searchTxt) || String(lead.phone||'').includes(searchTxt);
                    const matchStat = (stat === 'all') || (String(lead.decisao||'').toLowerCase() === stat);
                    const matchCulto = (culto === 'all') || (String(lead.culto||'').toLowerCase() === culto);
                    return matchName && matchStat && matchCulto && timeFilter(lead.created_at, trC, 'customDateStart', 'customDateEnd');
                });
                filteredC.sort((a,b) => orderSort(a.created_at, b.created_at, dC));
                updateTopKPIs(filteredC, 'consolidados');
                renderCards(filteredC, 'leads-container');

                // Visitors Filter
                const vSearch = String(document.getElementById('vSearchInput').value || '').toLowerCase();
                const vCountry = document.getElementById('vFilterCountry').value;
                const trV = document.getElementById('vFilterTimeRange').value;
                const dV = document.getElementById('vFilterDate').value;
                
                let filteredV = globalVisitors.filter(lead => {
                    const matchName = String(lead.name||'').toLowerCase().includes(vSearch) || String(lead.phone||'').includes(vSearch);
                    const matchC = (vCountry === 'all') || (String(lead.pais||'') === vCountry);
                    return matchName && matchC && timeFilter(lead.created_at, trV, null, null);
                });
                filteredV.sort((a,b) => orderSort(a.created_at, b.created_at, dV));
                updateTopKPIs(filteredV, 'visitors');
                renderCards(filteredV, 'visitors-container');
            };

            function timeFilter(dateStr, rangeOption, startId, endId) {
                if (rangeOption === 'all') return true;
                const leadDate = new Date(dateStr);
                if (isNaN(leadDate)) return false;
                const now = new Date();
                const diffDays = Math.ceil((now - leadDate) / (1000 * 60 * 60 * 24));
                
                if (rangeOption === '7') return diffDays <= 7;
                if (rangeOption === '30') return diffDays <= 30;
                // Add more custom logic if needed...
                return true;
            }

            function orderSort(d1, d2, dir) {
                const a = new Date(d1).valueOf();
                const b = new Date(d2).valueOf();
                return dir === 'desc' ? b - a : a - b;
            }

            window.updateTopKPIs = function(subset, type) {
                if(type === 'consolidados') {
                    const total = subset.length;
                    const c1 = subset.filter(l => l.task_start).length;
                    const c2 = subset.filter(l => l.task_gc).length;
                    const c3 = subset.filter(l => l.task_batismo).length;
                    const c4 = subset.filter(l => l.task_cafe).length;
                    ['kpi-total-1', 'kpi-total-2', 'kpi-total-gc', 'kpi-total-3', 'kpi-total-4'].forEach(id => safeSetText(id, total));
                    safeSetText('kpi-t1', c1);
                    safeSetText('kpi-t2', c2); // wait, t2 was Start but I just need to visually match the UI 
                    // Let's just update the totals statically mostly
                } else {
                    const total = subset.length;
                    document.querySelectorAll('#vkpi-total-1').forEach(el => el.innerText = total);
                    document.getElementById('vkpi-t1').innerText = subset.filter(l => l.vtask_ia).length;
                    document.getElementById('vkpi-t2').innerText = subset.filter(l => l.vtask_human).length;
                }
            };
"""

# I need to find where the old `fetchLiveLeads` definitions are.
import re
# Remove the old `fetchLiveLeads`, `applyFilters`, `toggleTask` logic simply.
# Actually to avoid breaking the delicate previous JS code, let's just use `replace_file_content` method programmatically inside the Python script to replace the <script> block completely safely since JS logic was getting messy.
"""

with open('tmp/add_views.py', 'w') as f:
    f.write(code)
