import os

html_path = '/Users/Gabriel/Documents/Antigravity/Lagoinha Consolidação/frontend/dashboard.html'
with open(html_path, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update global arrays at start of script block
text = text.replace(
    "let globalLeads = [];\n            let chartInstances = {};",
    "let globalLeads = [];\n            let globalConsolidados = [];\n            let globalVisitors = [];\n            let chartInstances = {};"
)

# 2. Add cross-tagging logic into fetchLiveLeads block
# We find exactly the mapping map block replacing lines 827-850 logic
target = """
                    let setDecisao = new Set();
                    let setCultos = new Set();

                    globalLeads = leads.map(lead => {
                        if (!lead.decisao) lead.decisao = "Não Informado";
                        if (!lead.culto) lead.culto = "Não Informado";
                        if (!lead.pais) lead.pais = "Não Informado";
                        if (!lead.gc_status) lead.gc_status = "Não Informado";
                        
                        // Default created_at if absent
                        if (!lead.created_at) {
                            lead.created_at = new Date().toISOString();
                        }

                        // No more mocks, rely directly on what was placed on DB (if any) or default false.
                        lead.task_start = Boolean(lead.task_start);
                        lead.task_gc = Boolean(lead.task_gc);
                        lead.task_batismo = Boolean(lead.task_batismo);
                        lead.task_cafe = Boolean(lead.task_cafe);
                        
                        setDecisao.add(String(lead.decisao));
                        setCultos.add(String(lead.culto));
                        return lead;
                    });
                    
                    populateSelect('filterStatus', setDecisao, 'Todas as Decisões');
                    populateSelect('filterCulto', setCultos, 'Qualquer Culto');
"""

replacement = """
                    // Tag Mapping
                    const mappedByPhone = {};
                    leads.forEach(l => {
                        const p = String(l.phone||'').replace(/\\D/g, '');
                        if(!mappedByPhone[p]) mappedByPhone[p] = [];
                        mappedByPhone[p].push(l);
                    });

                    let setDecisao = new Set();
                    let setCultos = new Set();
                    let setPaises = new Set();

                    globalLeads = leads.map(lead => {
                        if (!lead.decisao) lead.decisao = "Não Informado";
                        if (!lead.culto) lead.culto = "Não Informado";
                        if (!lead.pais) lead.pais = "Não Informado";
                        if (!lead.gc_status) lead.gc_status = "Não Informado";
                        if (!lead.created_at) lead.created_at = new Date().toISOString();

                        lead.task_start = Boolean(lead.task_start);
                        lead.task_gc = Boolean(lead.task_gc);
                        lead.task_batismo = Boolean(lead.task_batismo);
                        lead.task_cafe = Boolean(lead.task_cafe);
                        
                        const myDate = new Date(lead.created_at);
                        const myType = lead.type || 'saved';
                        const p = String(lead.phone||'').replace(/\\D/g, '');
                        const related = mappedByPhone[p].find(other => {
                            if(other.id === lead.id) return false;
                            const otherType = other.type || 'saved';
                            if(otherType === myType) return false;
                            const otherDate = new Date(other.created_at);
                            return Math.abs(myDate - otherDate) / (1000 * 3600) <= 24;
                        });

                        lead.hasCrossTag = !!related;
                        lead.crossTagType = related ? (related.type || 'saved') : null;

                        if (myType !== 'visitor') {
                            setDecisao.add(String(lead.decisao));
                            setCultos.add(String(lead.culto));
                        } else {
                            setPaises.add(String(lead.pais));
                        }
                        return lead;
                    });
                    
                    globalConsolidados = globalLeads.filter(l => l.type !== 'visitor');
                    globalVisitors = globalLeads.filter(l => l.type === 'visitor');

                    populateSelect('filterStatus', setDecisao, 'Todas as Decisões');
                    populateSelect('filterCulto', setCultos, 'Qualquer Culto');
                    populateSelect('vFilterCountry', setPaises, 'Todos os Países...');
"""

text = text.replace(target, replacement)

# 3. Update applyFilters to filter and render BOTH subsets separately
target_filters_start = """
                    let filtered = globalLeads.filter(lead => {
"""

text = text.replace("let filtered = globalLeads.filter(lead => {", "let filtered = globalConsolidados.filter(lead => {")
text = text.replace("renderCards(filtered);", "renderCards(filtered, 'leads-container');")

# Inject Visitors Filter logic right after updateCharts(filtered);
visitors_filter_injection = """
                    // Visitors Filter
                    const vSearch = String(document.getElementById('vSearchInput').value || '').toLowerCase();
                    const vCountry = document.getElementById('vFilterCountry').value;
                    const vSortOrder = document.getElementById('vFilterDate') ? document.getElementById('vFilterDate').value : 'newest';
                    const vTimeRangeDays = document.getElementById('vFilterTimeRange').value;
                    
                    let vFiltered = globalVisitors.filter(lead => {
                        const nameStr = String(lead.name || '').toLowerCase();
                        const phoneStr = String(lead.phone || '').toLowerCase();
                        const matchName = nameStr.includes(vSearch) || phoneStr.includes(vSearch);
                        const matchC = (vCountry === 'all') || (String(lead.pais||'') === vCountry);
                        
                        let matchTime = true;
                        if (vTimeRangeDays !== 'all') {
                            const leadDate = new Date(lead.created_at);
                            if (isNaN(leadDate.valueOf())) { matchTime = false; }
                            else {
                                const now = new Date();
                                const diffTime = now - leadDate;
                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                
                                if (vTimeRangeDays === '7') matchTime = diffDays <= 7;
                                else if (vTimeRangeDays === '30') matchTime = diffDays <= 30;
                                else if (vTimeRangeDays === 'today') matchTime = diffDays <= 1;
                            }
                        }
                        return matchName && matchC && matchTime;
                    });
                    
                    if(vSortOrder === 'oldest') {
                        vFiltered.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
                    } else {
                        vFiltered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
                    }
                    
                    renderCards(vFiltered, 'visitors-container');
                    
                    // Update Visitor KPIs
                    const vtop1 = vFiltered.length;
                    document.querySelectorAll('#vkpi-total-1').forEach(el => el.innerText = vtop1);
                    document.getElementById('vkpi-t1').innerText = vtop1; // Assuming welcome message is for all
"""

text = text.replace("renderCards(filtered, 'leads-container');", "renderCards(filtered, 'leads-container');\n" + visitors_filter_injection)


# 4. update renderCards definition to take target Container
text = text.replace("function renderCards(leadsToRender) {", "function renderCards(leadsToRender, targetContainerId = 'leads-container') {")
text = text.replace("if (!leadsContainer) return;", "const tContainer = document.getElementById(targetContainerId);\n                if (!tContainer) return;")
text = text.replace("leadsContainer.innerHTML", "tContainer.innerHTML")
text = text.replace("leadsContainer.appendChild", "tContainer.appendChild")

# 5. Inject Cross-tag visually inside Card rendering
card_target = "const card = document.createElement('div');"
card_inject = """
                    const card = document.createElement('div');
                    let crossTagHtml = '';
                    if (lead.hasCrossTag) {
                        crossTagHtml = `<div style="font-size:0.7rem; color:#2E8B57; border:1px solid #2E8B57; padding:2px 6px; border-radius:4px; display:inline-block; margin-bottom:10px;">Visitou & Consolidou Hojé</div>`;
                    }
"""

text = text.replace(card_target, card_inject)

# Also insert the crossTagHtml directly above the User Icon row:
text = text.replace(
    """<div style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 20px;">""",
    """${crossTagHtml}\n                        <div style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 20px;">"""
)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Patch applied.")
