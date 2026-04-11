import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.20.0?target=deno'

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')
  if (!signature) {
    return new Response('No signature provided', { status: 400 })
  }

  const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SAAS_SECRET')
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  
  if (!endpointSecret || !stripeKey) {
    console.error("Missing Stripe env vars")
    return new Response('Stripe env vars missing', { status: 500 })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })
  
  try {
    const body = await req.text()
    
    // Verify signature
    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret)
    } catch (err: any) {
      console.error(`⚠️  Webhook signature verification failed.`, err.message)
      return new Response(err.message, { status: 400 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Handle different event types
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        
        // Find workspace by customer ID
        const { data: wsData } = await supabaseAdmin.from('workspaces').select('id').eq('saas_stripe_customer_id', customerId).single();
        if (wsData) {
            // Update workspace status based on subscription status
            // mapping price_ids to plans can be done here or in metadata
            const status = subscription.status === 'active' ? 'active' : (subscription.status === 'past_due' ? 'past_due' : 'inactive');
            // get price/product ID to determine the plan (Founders, Advanced, Starter, etc)
            let plan = 'starter';
            const priceId = subscription.items.data[0]?.price.id;
            // You can map price IDs here:
            // if (priceId === 'price_founders_123') plan = 'founders';
            
            await supabaseAdmin.from('workspaces').update({
                saas_subscription_status: status,
                saas_stripe_subscription_id: subscription.id,
                plan: plan
            }).eq('id', wsData.id);
        }
    } else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        
        const { data: wsData } = await supabaseAdmin.from('workspaces').select('id').eq('saas_stripe_customer_id', customerId).single();
        if (wsData) {
            await supabaseAdmin.from('workspaces').update({
                saas_subscription_status: 'canceled',
                plan: 'free' // Downgrade to free/inactive
            }).eq('id', wsData.id);
        }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
