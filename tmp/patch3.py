import os

html_path = '/Users/Gabriel/Documents/Antigravity/Lagoinha Consolidação/frontend/dashboard.html'
with open(html_path, 'r', encoding='utf-8') as f:
    text = f.read()

start_marker = "card.innerHTML = `"
end_marker = "Acessar Histórico \u2794</a>\n                        </div>\n                    `;"

start_idx = text.find(start_marker)
end_idx = text.find(end_marker, start_idx) + len(end_marker)

if start_idx == -1 or end_idx < len(end_marker):
    print("Could not find block")
    exit(1)

target = text[start_idx:end_idx]

replacement = """                    
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
                    `;

                    let consoliTasksHtml = `
                        <div class="tasks-list">
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" checked disabled style="cursor: default; opacity: 1;">
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Celebração Aut. (IA)</span>
                                    <span class="task-meta"><span style="color:rgba(255,215,0,0.8);">Completado automático</span></span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Convidar p/ Start', this)" ${lead.task_start?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Convidar p/ Start</span>
                                    <span class="task-meta">${mkMeta(lead.task_start)}</span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Convidar p/ GC', this)" ${lead.task_gc?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Convidar p/ GC</span>
                                    <span class="task-meta">${mkMeta(lead.task_gc)}</span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Convite de Batismo', this)" ${lead.task_batismo?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Convite de Batismo</span>
                                    <span class="task-meta">${mkMeta(lead.task_batismo)}</span>
                                </div>
                            </label>
                            <label class="task-item">
                                <input type="checkbox" class="task-checkbox" onchange="toggleTask('${lead.id}', 'Café Novos Membros', this)" ${lead.task_cafe?'checked':''}>
                                <div style="display:flex; justify-content:space-between; flex-grow:1; align-items:center;">
                                    <span>Café Novos Membros</span>
                                    <span class="task-meta">${mkMeta(lead.task_cafe)}</span>
                                </div>
                            </label>
                        </div>
                    `;

                    card.innerHTML = `
                        <div class="card-header">
                            <div class="person-info">
                                <h3>${lead.name || 'Sem Nome'}</h3>
                                <p style="margin-top:2px;">📱 ${lead.phone || 'Sem número'}</p>
                            </div>
                            <div style="display:flex; gap: 6px;">
                                ${cleanPhone ? `
                                <a href="tel:+${cleanPhone}" class="icon-btn tooltip-container" aria-label="Ligar Normal">📞</a>
                                <a href="https://wa.me/${cleanPhone}" target="_blank" class="icon-btn tooltip-container" aria-label="Abrir WhatsApp">
                                    <svg style="width: 16px; fill: white;" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.12.552 4.197 1.6 6.012L.15 24l6.103-1.424A11.966 11.966 0 0 0 12.031 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0zm0 22.02c-1.815 0-3.593-.463-5.187-1.336l-.372-.211-3.66.853.864-3.551-.23-.38A10.024 10.024 0 0 1 1.954 12.03c0-5.556 4.516-10.071 10.077-10.071 5.56 0 10.076 4.515 10.076 10.076 0 5.557-4.516 10.072-10.076 10.072zm5.541-7.551c-.305-.152-1.8-.888-2.079-.99-.279-.101-.482-.152-.686.152-.204.305-.788.99-.965 1.194-.178.203-.356.228-.66.076-1.745-.88-2.909-1.543-4.045-3.32-.152-.254.041-.36.17-.5.127-.139.305-.355.457-.533.152-.177.203-.304.305-.507.102-.202.05-.38-.026-.532-.076-.152-.685-1.648-.94-2.257-.246-.593-.497-.513-.685-.522h-.585c-.203 0-.533.076-.813.381-.28.305-1.066 1.041-1.066 2.54s1.092 2.946 1.244 3.15c.152.203 2.15 3.282 5.205 4.6l.721.282c.762.247 1.455.212 2.004.129.615-.094 1.8-.736 2.054-1.447.254-.711.254-1.32.178-1.448-.076-.127-.28-.203-.585-.356z"/></svg>
                                </a>` : ''}
                                <div class="icon-btn tooltip-container" aria-label="Histórico de IA" style="background: rgba(255,215,0,0.1); color: var(--accent);">💬</div>
                            </div>
                        </div>
                        
                        ${crossTagHtml}

                        <div class="tags-area">
                            ${lead.type !== 'visitor' ? `<span class="tag decision">🔥 Decisão: ${cap(lead.decisao)}</span>` : ''}
                            ${lead.type !== 'visitor' ? `<span class="tag service">🏛 Culto: ${cap(lead.culto)}</span>` : ''}
                            <span class="tag baptism" style="background: rgba(255, 255, 255, 0.05); color: #FFF; border-color: rgba(255, 255, 255, 0.1);">🌍 País: ${cap(lead.pais)}</span>
                            ${lead.type !== 'visitor' ? `<span class="tag gc">👥 GC: ${cap(lead.gc_status)}</span>` : ''}
                        </div>

                        ${targetContainerId === 'visitors-container' ? visitorTasksHtml : consoliTasksHtml}

                        <div class="card-footer">
                            <span class="date">Registrado em ${dateStr}</span>
                            <a href="#" class="card-action">Acessar Histórico ➔</a>
                        </div>
                    `;"""

new_text = text[:start_idx] + replacement + text[end_idx:]

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(new_text)

print("PATCHED SUCCESS EXTRACTING")
