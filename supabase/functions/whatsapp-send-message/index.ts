import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { workspace_id, lead_id, message } = body ?? {};

  if (!workspace_id || !lead_id || !message?.type || !message?.content) {
    return new Response(JSON.stringify({ ok: false, error: "Missing required fields: workspace_id, lead_id, message.{type,content}" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // Fetch workspace credentials (service role bypasses RLS)
  const { data: ws, error: wsErr } = await sb.from("workspaces")
    .select("id, credentials").eq("id", workspace_id).single();
  
  if (wsErr || !ws) return new Response(JSON.stringify({ ok: false, error: "Workspace not found" }), { status: 404, headers: { "Content-Type": "application/json" } });

  const creds = ws.credentials ?? {};

  // Auth calculation: JWT Bearer OR X-API-Key
  let isAuthorized = false;
  
  const apiKeyHeader = req.headers.get("x-api-key");
  if (apiKeyHeader && creds.n8n_api_key && apiKeyHeader === creds.n8n_api_key) {
    isAuthorized = true;
  } else {
    // Fallback to JWT Check
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user }, error: userError } = await sb.auth.getUser(token);
      if (!userError && user) {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const token_wa = creds.whatsapp_token;
  const phone_id = creds.phone_id;

  if (!token_wa || !phone_id) {
    return new Response(JSON.stringify({ ok: false, error: "Workspace has no Meta Cloud API credentials configured" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // Fetch lead phone
  const { data: lead, error: leadErr } = await sb.from("leads")
    .select("id, phone, name").eq("id", lead_id).single();
  if (leadErr || !lead) return new Response(JSON.stringify({ ok: false, error: "Lead not found" }), { status: 404, headers: { "Content-Type": "application/json" } });

  // Normalize phone for Meta (must be digits only, no +)
  const toPhone = lead.phone.startsWith("+") ? lead.phone.slice(1) : lead.phone;

  // Build Meta Cloud API request body
  let apiBody: any;
  if (message.type === "text") {
    apiBody = {
      messaging_product: "whatsapp",
      to: toPhone,
      type: "text",
      text: { body: message.content },
    };
  } else if (message.type === "template") {
    // message.content expected as: { name, language, components? }
    const tpl = typeof message.content === "string" ? JSON.parse(message.content) : message.content;
    apiBody = {
      messaging_product: "whatsapp",
      to: toPhone,
      type: "template",
      template: {
        name: tpl.name,
        language: { code: tpl.language ?? "pt_BR" },
        components: tpl.components ?? [],
      },
    };
  } else {
    return new Response(JSON.stringify({ ok: false, error: `Unsupported message type: ${message.type}` }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phone_id}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token_wa}`,
    },
    body: JSON.stringify(apiBody),
  });

  const metaData = await metaRes.json();

  if (!metaRes.ok) {
    console.error(`[WA-SEND] Meta error:`, JSON.stringify(metaData));
    const metaError = metaData?.error?.message ?? JSON.stringify(metaData);
    return new Response(JSON.stringify({ ok: false, error: metaError }), {
      status: 502, headers: { "Content-Type": "application/json" }
    });
  }

  const waMessageId: string = metaData?.messages?.[0]?.id ?? null;
  console.log(`[WA-SEND] sent ok wa_id=${waMessageId} to=${toPhone}`);

  return new Response(JSON.stringify({ ok: true, wa_message_id: waMessageId }), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
});
