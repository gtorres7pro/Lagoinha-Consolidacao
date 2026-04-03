/**
 * Zelo Pro - Birthdays Module
 * Handles CSV parsing, database syncing, and rendering of birthdays.
 */

window.handleBirthdaysCSVUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!window.currentWorkspaceId) {
        alert('Por favor, selecione um workspace primeiro.');
        return;
    }

    const statusEl = document.getElementById('birthdays-upload-status');
    const msgEl = document.getElementById('birthdays-upload-msg');
    
    if (statusEl && msgEl) {
        statusEl.style.display = 'flex';
        msgEl.innerText = 'Lendo arquivo CSV...';
    }

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            try {
                if (msgEl) msgEl.innerText = 'Processando dados...';
                const rows = results.data;
                const formattedData = processCSVRows(rows);

                if (formattedData.length === 0) {
                    alert('Nenhum dado válido de aniversário encontrado. Verifique os cabeçalhos da planilha.');
                    if (statusEl) statusEl.style.display = 'none';
                    event.target.value = ''; // reset file input
                    return;
                }

                if (msgEl) msgEl.innerText = 'Limpando dados antigos...';
                // Delete old rows for this workspace
                const { error: deleteError } = await window.supabaseClient
                    .from('birthdays')
                    .delete()
                    .eq('workspace_id', window.currentWorkspaceId);

                if (deleteError) throw deleteError;

                if (msgEl) msgEl.innerText = `Salvando ${formattedData.length} aniversariantes...`;
                
                // Bulk insert using chunks of 1000 to avoid request size limits
                const chunkSize = 1000;
                for (let i = 0; i < formattedData.length; i += chunkSize) {
                    const chunk = formattedData.slice(i, i + chunkSize);
                    const { error: insertError } = await window.supabaseClient
                        .from('birthdays')
                        .insert(chunk);
                    if (insertError) throw insertError;
                }

                if (msgEl) msgEl.innerText = 'Importação concluída com sucesso!';
                setTimeout(() => {
                    if (statusEl) statusEl.style.display = 'none';
                    loadBirthdays(); // Refresh UI
                }, 2000);

            } catch (error) {
                console.error("Erro na importação de aniversariantes:", error);
                alert('Ocorreu um erro ao importar: ' + error.message);
                if (statusEl) statusEl.style.display = 'none';
            } finally {
                event.target.value = ''; // Reset file input
            }
        },
        error: function(err) {
            console.error("Erro no PapaParse:", err);
            alert("Erro ao ler o arquivo CSV.");
            if (statusEl) statusEl.style.display = 'none';
            event.target.value = '';
        }
    });
};

function processCSVRows(rows) {
    if (!rows || rows.length === 0) return [];
    
    // Auto-detect columns
    const headers = Object.keys(rows[0]).map(h => h.trim().toLowerCase());
    
    let nameKey = headers.find(h => (h.includes('nome') && !h.includes('sobre')) || h.includes('name')) || null;
    let lastNameKey = headers.find(h => h.includes('sobrenome')) || null;
    let phoneKey = headers.find(h => h.includes('telefone') || h.includes('whatsapp') || h.includes('celular') || h.includes('phone') || h.includes('contato')) || null;
    let emailKey = headers.find(h => h.includes('email') || h.includes('e-mail') || h.includes('correio')) || null;
    let dateKey = headers.find(h => h.includes('anivers') || h.includes('nasc') || h.includes('birth') || h.includes('dob')) || null;
    if (!dateKey) {
        dateKey = headers.find(h => h.includes('data')) || null;
    }

    if (!nameKey || !dateKey) {
        console.warn('Colunas obrigatórias "nome" ou "data" não encontradas. Cabeçalhos detectados:', headers);
        return [];
    }

    const processed = [];
    const workspaceId = window.currentWorkspaceId;

    for (let row of rows) {
        let name = getCaseInsensitiveKey(row, nameKey);
        let lastName = getCaseInsensitiveKey(row, lastNameKey);
        
        if (name && lastName) {
            name = name.trim() + ' ' + lastName.trim();
        }

        let phone = getCaseInsensitiveKey(row, phoneKey);
        let email = getCaseInsensitiveKey(row, emailKey);
        let dateStr = getCaseInsensitiveKey(row, dateKey);

        if (!name || !dateStr) continue;

        // Clean phone (Format to standard 55XX9XXXXYYYY, assuming BR if not specified)
        let cleanedPhone = phone ? phone.replace(/\D/g, '') : null;
        if (cleanedPhone && cleanedPhone.length >= 10 && !cleanedPhone.startsWith('55') && cleanedPhone.length <= 11) {
            // Probably BR missing country code
            cleanedPhone = '55' + cleanedPhone;
        }

        // Parse date
        // Try DD/MM/YYYY or YYYY-MM-DD
        let day = null, month = null;
        
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length >= 2) {
                day = parseInt(parts[0].trim(), 10);
                month = parseInt(parts[1].trim(), 10);
            }
        } else if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                // assume YYYY-MM-DD
                if (parts[0].length === 4) {
                    month = parseInt(parts[1].trim(), 10);
                    day = parseInt(parts[2].trim(), 10);
                } else {
                    // maybe DD-MM-YYYY
                    day = parseInt(parts[0].trim(), 10);
                    month = parseInt(parts[1].trim(), 10);
                }
            }
        } else {
            // maybe an excel serial date? We skip or try parsing with normal Date
            let d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                day = d.getUTCDate();
                month = d.getUTCMonth() + 1;
            }
        }

        if (day && month && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            processed.push({
                workspace_id: workspaceId,
                name: name.trim(),
                phone: cleanedPhone || null,
                email: email ? email.trim() : null,
                birth_day: day,
                birth_month: month
            });
        }
    }

    return processed;
}

function getCaseInsensitiveKey(obj, targetKey) {
    if (!targetKey) return null;
    for (let key in obj) {
        if (key.trim().toLowerCase() === targetKey) {
            return obj[key];
        }
    }
    return null;
}


// UI Rendering Logic
async function loadBirthdays() {
    if (!window.supabaseClient || !window.currentWorkspaceId) return;

    try {
        const { data, error } = await window.supabaseClient
            .from('birthdays')
            .select('*')
            .eq('workspace_id', window.currentWorkspaceId)
            .order('birth_month', { ascending: true })
            .order('birth_day', { ascending: true });

        if (error) throw error;

        renderBirthdays(data || []);
    } catch (e) {
        console.error("Failed to load birthdays:", e);
    }
}

function renderBirthdays(birthdays) {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();

    const resultToday = [];
    const resultNext7 = [];
    const resultPast7 = [];

    // Filter Logic
    birthdays.forEach(b => {
        // Calculate the difference in days from today to this year's birthday
        // To handle year wraps (e.g. late December assessing next January), we check both this year and next year.
        const currentYear = today.getFullYear();
        let bDayThisYear = new Date(currentYear, b.birth_month - 1, b.birth_day);
        
        let diffMs = bDayThisYear.getTime() - today.getTime();
        // Discard the time part of today to focus purely on date diffs
        const todayZero = new Date(currentYear, today.getMonth(), today.getDate()).getTime();
        const bDayZero = new Date(currentYear, b.birth_month - 1, b.birth_day).getTime();
        const diffDays = Math.round((bDayZero - todayZero) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            resultToday.push(b);
        } else if (diffDays > 0 && diffDays <= 7) {
            resultNext7.push(b);
        } else if (diffDays < 0 && diffDays >= -7) {
            resultPast7.push(b);
        } else {
            // Check wrap around (e.g. today is Dec 28, bday is Jan 2)
            if (diffDays < -300) {
                // bDay is next year
                let bDayNextYear = new Date(currentYear + 1, b.birth_month - 1, b.birth_day).getTime();
                let wrapDiff = Math.round((bDayNextYear - todayZero) / (1000 * 60 * 60 * 24));
                if (wrapDiff > 0 && wrapDiff <= 7) resultNext7.push(b);
            } else if (diffDays > 300) {
                // bDay was last year
                let bDayLastYear = new Date(currentYear - 1, b.birth_month - 1, b.birth_day).getTime();
                let wrapDiff = Math.round((bDayLastYear - todayZero) / (1000 * 60 * 60 * 24));
                if (wrapDiff < 0 && wrapDiff >= -7) resultPast7.push(b);
            }
        }
    });

    // Update Counts
    document.getElementById('birthdays-count-today').innerText = resultToday.length;
    document.getElementById('birthdays-count-next').innerText = resultNext7.length;
    document.getElementById('birthdays-count-past').innerText = resultPast7.length;

    // Render Tables
    const todayEl = document.getElementById('birthdays-list-today');
    const nextEl = document.getElementById('birthdays-list-next');
    const pastEl = document.getElementById('birthdays-list-past');

    if (todayEl) todayEl.innerHTML = generateBirthdayRows(resultToday, "Nenhum aniversariante hoje.");
    if (nextEl) nextEl.innerHTML = generateBirthdayRows(resultNext7, "Nenhum aniversariante próximo.");
    if (pastEl) pastEl.innerHTML = generateBirthdayRows(resultPast7, "Nenhum aniversariante recente.");
}

function generateBirthdayRows(list, emptyMsg) {
    if (list.length === 0) {
        return `<tr><td style="padding:20px; text-align:center; color:var(--text-dim);">${emptyMsg}</td></tr>`;
    }

    return list.map(b => {
        const contactLine = [
            b.phone ? `<span style="display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${b.phone} <a href="https://wa.me/${b.phone.replace(/\\D/g,'')}" target="_blank" style="margin-left:4px; padding:2px 6px; background:rgba(37, 211, 102, 0.1); color:#25D366; border-radius:4px; display:inline-flex; align-items:center; gap:4px; text-decoration:none; transition:all 0.2s;" onmouseover="this.style.background='rgba(37, 211, 102, 0.2)'" onmouseout="this.style.background='rgba(37, 211, 102, 0.1)'" title="Abrir no WhatsApp"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg><span style="font-size:0.7rem; font-weight:700;">Msg</span></a></span>` : '',
            b.email ? `<span style="display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> ${b.email}</span>` : ''
        ].filter(Boolean).join('<span style="margin:0 8px;opacity:0.3;">|</span>');

        const formattedDate = `${String(b.birth_day).padStart(2,'0')}/${String(b.birth_month).padStart(2,'0')}`;

        return `
            <tr style="border-bottom:1px solid rgba(255,255,255,.04);">
                <td style="padding:14px 20px;">
                    <div style="font-weight:700; color:#fff;">${b.name}</div>
                    <div style="font-size:0.75rem; color:rgba(255,255,255,.5); margin-top:4px;">${contactLine || 'Sem contato'}</div>
                </td>
                <td style="padding:14px 20px; text-align:right;">
                    <span style="background:rgba(255,255,255,0.06); padding:4px 10px; border-radius:8px; font-weight:700; font-size:0.8rem;">
                        ${formattedDate}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// Hook into the global switchTab from dashboard.js
const originalSwitchTabBday = window.switchTab;
window.switchTab = function(tabName) {
    if (originalSwitchTabBday) originalSwitchTabBday(tabName);
    
    if (tabName === 'birthdays') {
        loadBirthdays();
    }
};
