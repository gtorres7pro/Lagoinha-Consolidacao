import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.20.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Não autorizado')

    // Read the user profile
    const { data: profile } = await supabaseClient
      .from('users')
      .select('workspace_id, role')
      .eq('id', user.id)
      .single()

    if (!profile || !['master_admin', 'pastor_senior', 'church_admin'].includes(profile.role)) {
      throw new Error('Apenas administradores podem gerenciar assinaturas')
    }

    const payload = await req.json()
    const { action, price_id } = payload

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Load workspace
    const { data: wsData, error: wsErr } = await supabaseAdmin
      .from('workspaces')
      .select('id, name, saas_stripe_customer_id')
      .eq('id', profile.workspace_id)
      .single()
      
    if (wsErr || !wsData) throw new Error('Workspace não encontrado')

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) throw new Error('Stripe não configurado no servidor')
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })

    // Find or create customer
    let customerId = wsData.saas_stripe_customer_id
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            name: wsData.name,
            metadata: { workspace_id: wsData.id }
        });
        customerId = customer.id;
        await supabaseAdmin.from('workspaces').update({
            saas_stripe_customer_id: customerId
        }).eq('id', wsData.id);
    }

    if (action === 'create_checkout') {
        if (!price_id) throw new Error('price_id é obrigatório para checkout')
        
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            line_items: [{ price: price_id, quantity: 1 }],
            mode: 'subscription',
            success_url: `https://zelo.7prolabs.com/dashboard.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `https://zelo.7prolabs.com/dashboard.html`,
            metadata: { workspace_id: wsData.id }
        })
        
        return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    
    if (action === 'create_portal') {
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `https://zelo.7prolabs.com/dashboard.html`,
        })
        return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error('Ação inválida')

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || JSON.stringify(err) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
