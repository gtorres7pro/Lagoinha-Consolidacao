import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only accept POST
    if (req.method !== 'POST') {
        throw new Error('Only POST requests allowed');
    }

    // Optional: secure this endpoint using the Supabase JWT or a custom secret
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    // Initialize Supabase Client with Service Role to bypass RLS and fetch all birthdays globally
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify invoker identity if needed via getUser, but since it's triggered by n8n, 
    // it's highly recommended to just use the Service Role key in the Authorization header of n8n.
    // If the token provided doesn't match the service key exactly (or a valid JWT that we trust), we can block.
    // In this case, we trust the Authorization header is valid if it passes the Edge Function's native verify_jwt setting (which we will set to false and handle manually or set to true and use anon/service key).
    
    // Determine the current local day targeting the typical timezone of the hub (America/Sao_Paulo or specified)
    // Defaulting to America/Sao_Paulo (UTC-3).
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        day: 'numeric',
        month: 'numeric'
    });
    const parts = formatter.formatToParts(now);
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10);

    if (day === 0 || month === 0) {
        throw new Error("Failed to parse local date");
    }

    // 1. Fetch birthdays for today
    const { data: birthdays, error: bError } = await supabaseAdmin
        .from('birthdays')
        .select(`
            *,
            workspaces (
                credentials
            )
        `)
        .eq('birth_day', day)
        .eq('birth_month', month);

    if (bError) throw bError;

    if (!birthdays || birthdays.length === 0) {
        return new Response(JSON.stringify({ message: `No birthdays found for ${day}/${month}` }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const results = [];

    // 2. Dispatch messages
    for (const b of birthdays) {
        try {
            const creds = b.workspaces?.credentials;
            if (!creds || !creds.whatsapp_token || !creds.phone_id) {
                results.push({ name: b.name, status: 'skipped (no whatsapp config)' });
                continue;
            }

            if (!b.phone) {
                results.push({ name: b.name, status: 'skipped (no phone number)' });
                continue;
            }

            // WhatsApp Business API request for Template Message
            // Replace 'happy_birthday' with the actual approved template name in Meta Business Manager.
            const url = `https://graph.facebook.com/v20.0/${creds.phone_id}/messages`;
            
            // Adjust payload according to your actual approved template requirements
            const payload = {
                messaging_product: "whatsapp",
                to: b.phone,
                type: "template",
                template: {
                    name: "happy_birthday", 
                    language: {
                        code: "pt_BR" // Or according to user preference
                    },
                    components: [
                        {
                            type: "body",
                            parameters: [
                                { type: "text", text: String(b.name).split(' ')[0] } // first name
                            ]
                        }
                    ]
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${creds.whatsapp_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Meta API error');
            }

            // Optional: log message in database
            await supabaseAdmin.from('messages').insert({
                lead_id: null,
                workspace_id: b.workspace_id,
                direction: 'outbound',
                type: 'template',
                content: `Automated Birthday Message: ${payload.template.name}`,
                automated: true
            });

            results.push({ name: b.name, status: 'success', metaResponse: data });

        } catch (dispatchError) {
            console.error(`Failed for ${b.name}:`, dispatchError);
            results.push({ name: b.name, status: 'failed', error: String(dispatchError) });
        }
    }

    return new Response(JSON.stringify({ 
        message: `Processed ${birthdays.length} birthdays`, 
        date: `${day}/${month}`,
        results 
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
