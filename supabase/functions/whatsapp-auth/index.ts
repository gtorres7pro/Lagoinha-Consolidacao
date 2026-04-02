import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, short_lived_token } = body;

    if (!action) {
      throw new Error('Action is required');
    }

    if (action === 'exchange') {
      const APP_ID = Deno.env.get('FB_APP_ID');
      const APP_SECRET = Deno.env.get('FB_APP_SECRET');

      if (!APP_ID || !APP_SECRET) {
        throw new Error('Missing FB_APP_ID or FB_APP_SECRET in environment variables');
      }

      const url = `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${short_lived_token}`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }
      
      return new Response(
        JSON.stringify({ long_lived_token: data.access_token }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (action === 'fetch-accounts') {
      const long_token = short_lived_token;
      
      if (!long_token) {
         throw new Error('Missing long_lived_token');
      }
      
      // Step 1: fetch businesses
      const bizRes = await fetch(`https://graph.facebook.com/v20.0/me/businesses`, {
        headers: { 'Authorization': `Bearer ${long_token}` }
      });
      const bizData = await bizRes.json();
      if (bizData.error) throw new Error(bizData.error.message);
      
      const accounts = [];
      const businesses = bizData.data || [];

      for (const biz of businesses) {
         const wabaRes = await fetch(`https://graph.facebook.com/v20.0/${biz.id}/client_whatsapp_business_accounts`, { 
            headers: { 'Authorization': `Bearer ${long_token}` } 
         });
         const wabaData = await wabaRes.json();
         const wabas = wabaData.data || [];
         
         const wabaOwnedRes = await fetch(`https://graph.facebook.com/v20.0/${biz.id}/owned_whatsapp_business_accounts`, { 
            headers: { 'Authorization': `Bearer ${long_token}` } 
         });
         const wabaOwnedData = await wabaOwnedRes.json();
         wabas.push(...(wabaOwnedData.data || []));

         for (const waba of wabas) {
             const phoneRes = await fetch(`https://graph.facebook.com/v20.0/${waba.id}/phone_numbers`, { 
                headers: { 'Authorization': `Bearer ${long_token}` } 
             });
             const phoneData = await phoneRes.json();
             
             for (const phone of (phoneData.data || [])) {
                 // Ignore if already added (due to owned / client duplication sometimes)
                 if (!accounts.some(a => a.phone_id === phone.id)) {
                     accounts.push({
                         waba_id: waba.id,
                         waba_name: waba.name,
                         phone_id: phone.id,
                         phone_display: phone.display_phone_number
                     });
                 }
             }
         }
      }

      return new Response(JSON.stringify({ accounts }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
