import os

html_path = '/Users/Gabriel/Documents/Antigravity/Lagoinha Consolidação/frontend/dashboard.html'
with open(html_path, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update filter defaults to 7 days
text = text.replace('<option value="all">Todo o Período</option>\n                    <option value="7">Últimos 7 Dias</option>',
                    '<option value="all">Todo o Período</option>\n                    <option value="7" selected>Últimos 7 Dias</option>')
text = text.replace('<option value="all">Todo o Período</option>\n                    <option value="today">Hoje</option>\n                    <option value="7">Últimos 7 Dias</option>',
                    '<option value="all">Todo o Período</option>\n                    <option value="today">Hoje</option>\n                    <option value="7" selected>Últimos 7 Dias</option>')

text = text.replace("document.getElementById('filterTimeRange').value = 'all';", "document.getElementById('filterTimeRange').value = '7';")
text = text.replace("document.getElementById('vFilterTimeRange').value = 'all';", "document.getElementById('vFilterTimeRange').value = '7';")

# 2. Update Cross-Tag Logic to use Email OR Phone
target_cross="""
                        const myDate = new Date(lead.created_at);
                        const myType = lead.type || 'saved';
                        const p = String(lead.phone||'').replace(/\\D/g, '');
                        
                        let related = null;
                        if (p !== '') {
                            related = mappedByPhone[p].find(other => {
                                if(other.id === lead.id) return false;
                                const otherType = other.type || 'saved';
                                if(otherType === myType) return false;
                                const otherDate = new Date(other.created_at);
                                return Math.abs(myDate - otherDate) / (1000 * 3600) <= 24;
                            });
                        }
"""
replace_cross="""
                        const myDate = new Date(lead.created_at);
                        const myType = lead.type || 'saved';
                        const p = String(lead.phone||'').replace(/\\D/g, '');
                        const em = String(lead.email||'').trim().toLowerCase();
                        
                        let related = null;
                        if (p !== '' || em !== '') {
                            // Find any lead in the whole array that has different type and same phone OR email
                            related = leads.find(other => {
                                if(other.id === lead.id) return false;
                                const otherType = other.type || 'saved';
                                if(otherType === myType) return false; // Must be cross-form
                                
                                const op = String(other.phone||'').replace(/\\D/g, '');
                                const oem = String(other.email||'').trim().toLowerCase();
                                
                                const match = (p !== '' && p === op) || (em !== '' && em === oem);
                                if (!match) return false;
                                
                                const otherDate = new Date(other.created_at);
                                return Math.abs(myDate - otherDate) / (1000 * 3600) <= 24;
                            });
                        }
"""
text = text.replace(target_cross, replace_cross)


# 3. Update Visitors View KPIs and Pie Charts HTML
visitor_html_target = """
                <div class="kpi-row" style="margin-top: 20px;">
                    <div class="kpi-box">
                        <h4 class="kpi-title">WELCOME MESSAGE (IA)</h4>
                        <div class="kpi-value"><span id="vkpi-t1">0</span><span class="kpi-total"> / <span id="vkpi-total-1">0</span></span></div>
                    </div>
                    <div class="kpi-box">
                        <h4 class="kpi-title">FOLLOW-UP HUMANO</h4>
                        <div class="kpi-value"><span id="vkpi-t2">0</span><span class="kpi-total"> / <span class="vkpi-total-1">0</span></span></div>
                    </div>
                </div>
"""
if visitor_html_target not in text: # If it's slightly different
    visitor_html_target = """
                <div class="kpi-row" style="margin-top: 20px;">
                    <div class="kpi-box">
                        <h4 class="kpi-title">WELCOME MESSAGE (IA)</h4>
                        <div class="kpi-value"><span id="vkpi-t1">0</span><span class="kpi-total"> / <span id="vkpi-total-1">0</span></span></div>
                    </div>
                    <div class="kpi-box">
                        <h4 class="kpi-title">FOLLOW-UP HUMANO</h4>
                        <div class="kpi-value"><span id="vkpi-t2">0</span><span class="kpi-total"> / <span id="vkpi-total-1">0</span></span></div>
                    </div>
                </div>"""

visitor_html_replace = """
                <div class="kpi-row" style="margin-top: 20px; grid-template-columns: repeat(3, 1fr);">
                    <div class="kpi-box">
                        <h4 class="kpi-title">WELCOME MESSAGE (IA)</h4>
                        <div class="kpi-value"><span id="vkpi-t1" style="color:#FFD700;">0</span><span class="kpi-total"> / <span class="vkpi-total-all">0</span></span></div>
                    </div>
                    <div class="kpi-box">
                        <h4 class="kpi-title">CONVITE PARA GC</h4>
                        <div class="kpi-value"><span id="vkpi-t2" style="color:#00BFFF;">0</span><span class="kpi-total"> / <span class="vkpi-total-all">0</span></span></div>
                    </div>
                    <div class="kpi-box">
                        <h4 class="kpi-title">FOLLOW-UP HUMANO</h4>
                        <div class="kpi-value"><span id="vkpi-t3" style="color:#32CD32;">0</span><span class="kpi-total"> / <span class="vkpi-total-all">0</span></span></div>
                    </div>
                </div>
                
                <div class="charts-row" style="grid-template-columns: 1fr 1fr; margin-top: 20px; padding: 0 40px; gap: 20px; display: grid;">
                    <div class="kpi-box" style="flex-direction: column; align-items: flex-start;">
                        <h4 class="kpi-title">ESTADO CIVIL</h4>
                        <div style="width: 100%; height: 250px; position: relative;">
                            <canvas id="vChartEstadoCivil"></canvas>
                        </div>
                    </div>
                    <div class="kpi-box" style="flex-direction: column; align-items: flex-start;">
                        <h4 class="kpi-title">FAIXA ETÁRIA</h4>
                        <div style="width: 100%; height: 250px; position: relative;">
                            <canvas id="vChartIdade"></canvas>
                        </div>
                    </div>
                </div>
"""
if visitor_html_target in text:
    text = text.replace(visitor_html_target, visitor_html_replace)


# 4. Update JS for Visitor Tasks UI
task_ui_target = """
                    let visitorTasksHtml = `
                        <div class="tasks-list">
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" checked disabled style="cursor: default; opacity: 1;">
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Welcome Message (IA)</span>
                                    <span class="task-meta"><span style="color:rgba(255,215,0,0.8);">WhatsApp Enviado</span></span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Follow-up Humano', this)">
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Follow-up Humano</span>
                                    <span class="task-meta"></span>
                                </div>
                            </label>
                        </div>
                    `;"""

task_ui_replace = """
                    let visitorTasksHtml = `
                        <div class="tasks-list">
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" checked disabled style="cursor: default; opacity: 1;">
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Welcome Message (IA)</span>
                                    <span class="task-meta"><span style="color:rgba(255,215,0,0.8);">WhatsApp Enviado</span></span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Convite para GC', this)" ${lead.task_gc?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Convite para GC</span>
                                    <span class="task-meta">${mkMeta(lead.task_gc)}</span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Follow-up Humano', this)" ${lead.task_followup?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Follow-up Humano</span>
                                    <span class="task-meta">${mkMeta(lead.task_followup)}</span>
                                </div>
                            </label>
                        </div>
                    `;"""
text = text.replace(task_ui_target, task_ui_replace)

# 5. Connect toggleTask and KPIs
# Add lead.task_followup = Boolean(lead.task_followup) into fetchLiveLeads mapping
text = text.replace("lead.task_cafe = Boolean(lead.task_cafe);", "lead.task_cafe = Boolean(lead.task_cafe);\n                        lead.task_followup = Boolean(lead.task_followup);")

# Update Visitor KPIs calculation
v_kpi_target = """
                    // Update Visitor KPIs
                    const vtop1 = vFiltered.length;
                    document.querySelectorAll('#vkpi-total-1').forEach(el => el.innerText = vtop1);
                    document.getElementById('vkpi-t1').innerText = vtop1; // Assuming welcome message is for all
"""
v_kpi_replace = """
                    // Update Visitor KPIs
                    const vTotal = vFiltered.length;
                    document.querySelectorAll('.vkpi-total-all').forEach(el => el.innerText = vTotal);
                    document.getElementById('vkpi-t1').innerText = vTotal; // Welcome message (IA)
                    document.getElementById('vkpi-t2').innerText = vFiltered.filter(l => l.task_gc).length;
                    document.getElementById('vkpi-t3').innerText = vFiltered.filter(l => l.task_followup).length;
                    
                    if(window.updateVisitorCharts) window.updateVisitorCharts(vFiltered);
"""
text = text.replace(v_kpi_target, v_kpi_replace)

# Update target toggleTask function
toggle_target = """
                        if(taskName === 'Convidar p/ Start') ld.task_start = isChecked;
                        if(taskName === 'Convidar p/ GC') ld.task_gc = isChecked;
                        if(taskName === 'Convite de Batismo') ld.task_batismo = isChecked;
                        if(taskName === 'Café Novos Membros') ld.task_cafe = isChecked;
"""
toggle_replace = """
                        if(taskName === 'Convidar p/ Start') ld.task_start = isChecked;
                        if(taskName === 'Convidar p/ GC' || taskName === 'Convite para GC') ld.task_gc = isChecked;
                        if(taskName === 'Convite de Batismo') ld.task_batismo = isChecked;
                        if(taskName === 'Café Novos Membros') ld.task_cafe = isChecked;
                        if(taskName === 'Follow-up Humano') ld.task_followup = isChecked;
"""
text = text.replace(toggle_target, toggle_replace)


with open(html_path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Patch applied.")
