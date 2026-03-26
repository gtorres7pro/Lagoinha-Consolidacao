import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js';

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read CSV data from request body
    const payload = await req.json();
    const records = payload.records || [];
    
    let updatesCount = 0;
    
    // First apply static global fixes
    await supabase.rpc('execute_sql_not_exists', {}); // we can't do this easily.
    
    // Manual updates for global rules
    const { data: allLeads } = await supabase.from('leads').select('*');
    
    if (allLeads) {
        for (const lead of allLeads) {
            let updates = {};
            let changed = false;
            
            // 1. Date
            if (lead.type === 'visitor') {
                const lp = lead.phone ? lead.phone.replace(/\D/g, '') : '';
                const le = lead.email ? lead.email.toLowerCase().trim() : '';
                
                let targetDateStr = null;
                for (const r of records) {
                    if ((lp && r.phone === lp) || (le && r.email === le)) {
                        targetDateStr = r.date;
                        break;
                    }
                }
                
                if (targetDateStr) {
                    const targetDt = new Date(targetDateStr);
                    const dbDt = new Date(lead.created_at);
                    if (Math.abs(dbDt.getTime() - targetDt.getTime()) > 1000 * 60 * 60 * 2) {
                        updates.created_at = targetDt.toISOString();
                        changed = true;
                    }
                }
            }
            
            // 2. Pais
            let raw_p = lead.pais ? lead.pais.toLowerCase().trim() : '';
            let new_p = lead.pais;
            
            if (!raw_p || raw_p === 'null' || raw_p === 'não informado') new_p = 'Não Informado';
            else if (['us', 'usa', 'united states', 'eua', 'estados', 'estados unidos'].includes(raw_p)) new_p = 'US';
            else if (['br', 'brasil', 'brazil'].includes(raw_p)) new_p = 'BR';
            else if (['pt', 'portugal'].includes(raw_p)) new_p = 'PT';
            else if (['ca', 'canada', 'canadá'].includes(raw_p)) new_p = 'CA';
            
            if (new_p !== lead.pais) { updates.pais = new_p; changed = true; }

            // 3. Batizado
            let raw_b = lead.batizado ? lead.batizado.toLowerCase().trim() : '';
            let new_b = lead.batizado;
            
            if (!raw_b || raw_b === 'null' || raw_b === 'não informado' || raw_b === 'não' || raw_b === 'no') new_b = 'Não';
            else if (raw_b.includes('evangélico') || raw_b.includes('christian')) new_b = 'Sim, Evangélico';
            else if (raw_b.includes('católico') || raw_b.includes('catholic')) new_b = 'Sim, Católico';
            else if (raw_b.includes('quero me batizar')) new_b = 'Quero me Batizar';
            
            if (new_b !== lead.batizado) { updates.batizado = new_b; changed = true; }

            // 4. GC
            let raw_g = lead.gc_status ? lead.gc_status.toLowerCase().trim() : '';
            let new_g = lead.gc_status;
            
            if (!raw_g || raw_g === 'null' || raw_g === 'não informado' || raw_g === 'não' || raw_g === 'no') new_g = 'Não';
            else if (raw_g.includes('quero participar')) new_g = 'Quero participar';
            else if (raw_g.includes('sim') || raw_g.includes('yes')) new_g = 'Sim';
            
            if (new_g !== lead.gc_status) { updates.gc_status = new_g; changed = true; }
            
            // Visitor type fallback
            if (!lead.type) { updates.type = 'visitor'; changed = true; }

            if (changed) {
                await supabase.from('leads').update(updates).eq('id', lead.id);
                updatesCount++;
            }
        }
    }

    return new Response(JSON.stringify({ success: true, updatesCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
