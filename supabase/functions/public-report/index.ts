import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { workspace_slug, password, date_days } = body

    if (!workspace_slug || !password) throw new Error('workspace_slug e password são obrigatórios')

    // Auth
    const { data: ws, error: wsErr } = await sb
      .from('workspaces')
      .select('id, name, slug, report_password, report_enabled, knowledge_base')
      .eq('slug', workspace_slug)
      .single()

    if (wsErr || !ws) throw new Error('Workspace não encontrado')
    if (!ws.report_enabled) throw new Error('Acesso ao relatório público está desativado')
    if (ws.report_password !== password) throw new Error('Senha incorreta')

    // Date filter
    let dateFilter: string | null = null
    const days = parseInt(date_days || '7')
    if (days > 0) {
      const since = new Date()
      since.setDate(since.getDate() - days)
      dateFilter = since.toISOString()
    }

    // Fetch leads with all fields needed by the public report and CSV export
    let q = sb
      .from('leads')
      .select('id,name,phone,email,type,decisao,culto,pais,cidade,estado,gc_status,batizado,sexo,idade,estado_civil,melhor_horario,tags,created_at,last_interaction')
      .eq('workspace_id', ws.id)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (dateFilter) q = q.gte('created_at', dateFilter)

    const { data: leads, error: lErr } = await q
    if (lErr) throw new Error('Erro ao buscar leads: ' + lErr.message)

    // Fetch workspace tags
    const { data: wsTags } = await sb
      .from('workspace_tags')
      .select('id,name,color')
      .eq('workspace_id', ws.id)
      .order('name')

    const all = leads || []

    // KPIs
    const totalLeads    = all.length
    const salvos        = all.filter(l => l.type === 'saved').length
    const visitantes    = all.filter(l => l.type === 'visitor').length
    const batismoCount  = all.filter(l => {
      const b = (l.batizado || '').toLowerCase()
      return b.includes('batizar') || b.includes('baptiz')
    }).length
    const gcCount = all.filter(l => {
      const g = (l.gc_status || '').toLowerCase()
      return g === 'sim' || g.includes('participar') || g.includes('want')
    }).length
    const startCount = all.filter(l => {
      const d = (l.decisao || '').toLowerCase()
      return d.includes('start') || d.includes('welcome')
    }).length

    // Available filter options
    const allCultos   = [...new Set(all.map(l => l.culto).filter(Boolean))]
    const allDecisoes = [...new Set(all.map(l => l.decisao).filter(Boolean))]
    const allPaises   = [...new Set(all.map(l => l.pais).filter(Boolean))]

    return new Response(JSON.stringify({
      workspace: { name: ws.name, slug: workspace_slug, knowledge_base: ws.knowledge_base },
      kpis: { totalLeads, salvos, visitantes, batismoCount, gcCount, startCount },
      filterOptions: { cultos: allCultos, decisoes: allDecisoes, paises: allPaises },
      workspaceTags: wsTags || [],
      leads: all
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch(err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
