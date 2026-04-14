import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function metaPhone(p: string) {
  return p.startsWith("+") ? p.slice(1) : p;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400, headers: CORS }); }

  const { lead_id, workspace_id } = body;
  if (!lead_id || !workspace_id) {
    return new Response(JSON.stringify({ error: "Missing lead_id or workspace_id" }), { status: 400, headers: CORS });
  }

  // Dynamic template support — defaults keep consolida-form.html working with no changes
  const templateName: string = body.template_name ?? "consolidacao";
  const languageCode: string = body.language_code ?? "pt_BR";

  // Fetch lead
  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .select("id, name, phone")
    .eq("id", lead_id)
    .eq("workspace_id", workspace_id)
    .maybeSingle();

  if (leadErr || !lead) {
    console.error("[TMPL] Lead not found:", leadErr?.message);
    return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: CORS });
  }

  if (!lead.phone) {
    console.log("[TMPL] Lead has no phone — skipping.");
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_phone" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Idempotency guard — avoid double-sending if trigger fires twice
  const { data: existing } = await sb
    .from("messages")
    .select("id")
    .eq("lead_id", lead_id)
    .eq("workspace_id", workspace_id)
    .eq("type", "template")
    .eq("automated", true)
    .maybeSingle();

  if (existing) {
    console.log("[TMPL] Template already sent for this lead — skipping.");
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_sent" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Fetch workspace credentials
  const { data: ws, error: wsErr } = await sb
    .from("workspaces")
    .select("credentials")
    .eq("id", workspace_id)
    .maybeSingle();

  if (wsErr || !ws?.credentials?.whatsapp_token || !ws?.credentials?.phone_number_id) {
    console.error("[TMPL] Missing workspace credentials:", wsErr?.message);
    return new Response(JSON.stringify({ error: "Workspace WhatsApp credentials not configured" }), { status: 500, headers: CORS });
  }

  const waToken: string = ws.credentials.whatsapp_token;
  const phoneNumberId: string = ws.credentials.phone_number_id;
  const firstName = (lead.name || "").split(" ")[0] || "Amigo";
  const toPhone = metaPhone(lead.phone);

  // Build the template payload — first name variable used for all templates
  const templatePayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "name", text: firstName }
          ]
        }
      ]
    }
  };

  console.log(`[TMPL] Sending "${templateName}" (${languageCode}) to ${toPhone} (${firstName})`);

  let waMessageId: string | null = null;
  let sendOk = false;

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(templatePayload)
    });

    const resData = await res.json();

    if (res.ok) {
      sendOk = true;
      waMessageId = resData?.messages?.[0]?.id ?? null;
      console.log(`[TMPL] Sent OK. wa_message_id=${waMessageId}`);
    } else {
      console.error("[TMPL] Meta API error:", JSON.stringify(resData));
      return new Response(JSON.stringify({ error: "Meta API error", details: resData }), { status: 502, headers: CORS });
    }
  } catch (e: any) {
    console.error("[TMPL] Fetch exception:", e.message);
    return new Response(JSON.stringify({ error: "Network error", message: e.message }), { status: 500, headers: CORS });
  }

  // Save the outbound template message to messages table
  if (sendOk) {
    const now = new Date().toISOString();
    const templateBody = `[Template enviado: ${templateName}] Olá, ${firstName}!`;

    const { error: msgErr } = await sb.from("messages").insert({
      workspace_id,
      lead_id,
      direction: "outbound",
      type: "template",
      content: templateBody,
      automated: true,
      responded_at: now,
      wa_message_id: waMessageId,
    });

    if (msgErr) console.error("[TMPL] Failed to save message:", msgErr.message);
    else console.log("[TMPL] Message saved to DB.");

    // Update leads.last_message_at so Chat ao Vivo picks up this lead
    const { error: leadUpdateErr } = await sb.from("leads")
      .update({ last_message_at: now })
      .eq("id", lead_id)
      .eq("workspace_id", workspace_id);

    if (leadUpdateErr) console.error("[TMPL] Failed to update lead last_message_at:", leadUpdateErr.message);
    else console.log("[TMPL] lead.last_message_at updated — will appear in Chat ao Vivo.");
  }

  return new Response(JSON.stringify({ ok: true, sent: sendOk, wa_message_id: waMessageId, template: templateName }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS }
  });
});
