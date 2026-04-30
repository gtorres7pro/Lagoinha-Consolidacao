import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, OPERATOR_ROLES, authorizeWorkspaceUser, json, text } from "../_shared/auth.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return text("Method Not Allowed", 405);

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { workspace_id, lead_id, message } = body ?? {};

  if (!workspace_id || !lead_id || !message?.type || !message?.content) {
    return json({ ok: false, error: "Missing required fields: workspace_id, lead_id, message.{type,content}" }, 400);
  }

  // Fetch workspace credentials (service role bypasses RLS)
  const { data: ws, error: wsErr } = await sb.from("workspaces")
    .select("id, credentials").eq("id", workspace_id).single();
  
  if (wsErr || !ws) return json({ ok: false, error: "Workspace not found" }, 404);

  const creds = ws.credentials ?? {};

  // Auth: workspace JWT role OR the workspace-specific n8n API key.
  const apiKeyHeader = req.headers.get("x-api-key");
  const apiKeyAuthorized = !!apiKeyHeader && !!creds.n8n_api_key && apiKeyHeader === creds.n8n_api_key;
  if (!apiKeyAuthorized) {
    const authz = await authorizeWorkspaceUser(req, sb, workspace_id, OPERATOR_ROLES);
    if (!authz.ok) return json({ ok: false, error: authz.error }, authz.status);
  }

  const token_wa = creds.whatsapp_token;
  const phone_id = creds.phone_id;

  if (!token_wa || !phone_id) {
    return json({ ok: false, error: "Workspace has no Meta Cloud API credentials configured" }, 400);
  }

  // Fetch lead phone
  const { data: lead, error: leadErr } = await sb.from("leads")
    .select("id, phone, name, workspace_id")
    .eq("id", lead_id)
    .eq("workspace_id", workspace_id)
    .single();
  if (leadErr || !lead) return json({ ok: false, error: "Lead not found" }, 404);

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
    return json({ ok: false, error: `Unsupported message type: ${message.type}` }, 400);
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
    return json({ ok: false, error: metaError }, 502);
  }

  const waMessageId: string = metaData?.messages?.[0]?.id ?? null;
  console.log(`[WA-SEND] sent ok wa_id=${waMessageId} to=${toPhone}`);

  return json({ ok: true, wa_message_id: waMessageId });
});
