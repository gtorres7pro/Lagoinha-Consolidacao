const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://uyseheucqikgcorrygzc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

async function formatAndFix() {
    try {
        console.log("Loading CSV...");
        const csvData = fs.readFileSync('lista-visitantes.csv', 'utf8');
        const records = parse(csvData, { columns: true, skip_empty_lines: true });
        
        // Load All Leads from DB
        console.log("Fetching DB Leads...");
        let allLeads = [];
        let page = 0;
        while(true) {
            const { data, error } = await supabase.from('leads').select('*').range(page*1000, (page+1)*1000 - 1);
            if(error) throw error;
            if(!data || data.length === 0) break;
            allLeads = allLeads.concat(data);
            page++;
        }
        console.log(`Loaded ${allLeads.length} leads from DB`);

        // Create Map of Phone -> SubmittedAt
        const dateMap = {}; // phone -> string Date
        const dateMapEmail = {}; // email -> string Date
        for (const row of records) {
            let p = row['Telefone | Phone Number'] || '';
            let em = row['E-mail'] || '';
            p = p.replace(/\D/g, '');
            if (p) dateMap[p] = row['Submitted at'];
            if (em) dateMapEmail[em.toLowerCase().trim()] = row['Submitted at'];
        }

        console.log(`Built map with ${Object.keys(dateMap).length} phones and ${Object.keys(dateMapEmail).length} emails.`);

        // Iterate and prepare updates
        let updatesCount = 0;
        let batch = [];

        for (const lead of allLeads) {
            let changed = false;
            let updates = {};

            // 1. Check Date (Submitted At)
            if (lead.type === 'visitor') {
                const lp = lead.phone ? lead.phone.replace(/\D/g, '') : '';
                const le = lead.email ? lead.email.toLowerCase().trim() : '';
                let correctDateStr = dateMap[lp] || dateMapEmail[le];

                if (correctDateStr) {
                    // correctDateStr is like "2024-09-08 14:09:51" - convert to ISO
                    let targetDateObj = new Date(correctDateStr);
                    // se a DB estiver com uma data MUITO diferente (diferença de 1 dia), update.
                    const currDbDate = new Date(lead.created_at);
                    if (Math.abs(currDbDate.getTime() - targetDateObj.getTime()) > 1000 * 60 * 60 * 2) {
                        updates.created_at = targetDateObj.toISOString();
                        changed = true;
                    }
                }
            }

            // 2. Normalize Pais
            let p = lead.pais || null;
            let initialP = p;
            if (p) p = p.trim().toLowerCase();
            let newP = lead.pais;
            
            if (!p || p === "null" || p === "não informado") newP = "Não Informado";
            else if (['us', 'usa', 'united states', 'eua', 'estados', 'estados unidos'].includes(p)) newP = "US";
            else if (['br', 'brasil', 'brazil'].includes(p)) newP = "BR";
            else if (['pt', 'portugal'].includes(p)) newP = "PT";
            else if (['ca', 'canada', 'canadá'].includes(p)) newP = "CA";
            else newP = "Outro"; // If you keep strings for others, you can leave it, but they chose 'Não Informado'

            if (newP !== lead.pais) {
                updates.pais = newP;
                changed = true;
            }

            // 3. Normalize Batismo
            let b = lead.batizado || null;
            let newB = b;
            if (!b || String(b).toLowerCase() === 'null' || b === 'Não Informado') newB = 'Não';
            else if (String(b).includes('Evangélico')) newB = 'Sim, Evangélico';
            else if (String(b).includes('Católico')) newB = 'Sim, Católico';
            else if (String(b).includes('Quero me Batizar')) newB = 'Quero me Batizar';
            else if (String(b).toLowerCase() === 'não' || String(b).toLowerCase() === 'no') newB = 'Não';

            if (newB !== lead.batizado) {
                updates.batizado = newB;
                changed = true;
            }

            // 4. Normalize GC
            let g = lead.gc_status || null;
            let newG = g;
            if (!g || String(g).toLowerCase() === 'null' || g === 'Não Informado') newG = 'Não';
            else if (String(g).includes('Quero participar')) newG = 'Quero participar';
            else if (String(g).includes('Sim') || String(g).includes('Yes')) newG = 'Sim';
            else if (String(g).toLowerCase() === 'não' || String(g).toLowerCase() === 'no') newG = 'Não';

            if (newG !== lead.gc_status) {
                updates.gc_status = newG;
                changed = true;
            }

            if (changed) {
                updatesCount++;
                const { error } = await supabase.from('leads').update(updates).eq('id', lead.id);
                if (error) console.log("Erro no ID", lead.id, error.message);
            }
        }
        
        console.log(`FINISHED! Updated ${updatesCount} records successfully.`);
    } catch(e) {
        console.error("Fatal Error:", e);
    }
}

formatAndFix();
