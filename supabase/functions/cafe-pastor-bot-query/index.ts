import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { workspace_id, action, phone, date } = await req.json()

        if (!workspace_id || !action) {
            throw new Error('Missing workspace_id or action')
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Se a requisição não tiver JWT, tentamos JWT de admin/service ou deixamos passar se RLS permitir (para n8n)
        // O n8n precisa poder consultar enviando a Service Role Key.
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        if (action === 'query_slots') {
            // Busca pastores disponíveis nesta data
            const { data: pastores } = await supabaseAdmin
                .from('cafe_pastor_pastors')
                .select('user_id, users!fk_cp_user(name)');

            if (!pastores) return new Response(JSON.stringify({ available: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

            // Busca slots bloqueados na data
            const queryDate = date || new Date().toISOString().split('T')[0];

            return new Response(JSON.stringify({
                status: 'success',
                pastors: pastores,
                message: `Consulta realizada para a data ${queryDate}`
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        if (action === 'check_appointment') {
            if (!phone) throw new Error('Phone is required for checking appointments');
            const { data: appt } = await supabaseAdmin
                .from('cafe_pastor_appointments')
                .select('*, cafe_pastor_pastors(users!fk_cp_user(name))')
                .eq('workspace_id', workspace_id)
                .eq('attendee_phone', phone)
                .order('appointment_date', { ascending: false })
                .limit(1)

            return new Response(JSON.stringify({
                status: 'success',
                appointment: appt?.[0] || null
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        throw new Error('Invalid action')

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
