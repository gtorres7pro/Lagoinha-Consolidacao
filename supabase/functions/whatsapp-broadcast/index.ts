import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
  const token = authHeader.slice(7);
  const { data: { user }, error: userError } = await sb.auth.getUser(token);
  if (userError || !user) return new Response("Unauthorized", { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { workspace_id, lead_ids, template_name, language_code, variables_count } = body ?? {};

  if (!workspace_id || !lead_ids?.length || !template_name) {
    return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // Load workspace
  const { data: ws, error: wsErr } = await sb.from("workspaces")
    .select("id, credentials").eq("id", workspace_id).single();
  if (wsErr || !ws) {
    return new Response(JSON.stringify({ ok: false, error: "Workspace not found" }), {
      status: 404, headers: { "Content-Type": "application/json" }
    });
  }

  const creds = ws.credentials ?? {};
  const waToken = creds.whatsapp_token;
  const phoneId = creds.phone_id;

  if (!waToken || !phoneId) {
    return new Response(JSON.stringify({ ok: false, error: "No Meta credentials configured" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // Fetch all leads
  const { data: leads, error: leadsErr } = await sb.from("leads")
    .select("id, name, phone")
    .in("id", lead_ids);

  if (leadsErr || !leads?.length) {
    return new Response(JSON.stringify({ ok: false, error: "No leads found" }), {
      status: 404, headers: { "Content-Type": "application/json" }
    });
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    const toPhone = (lead.phone || "").startsWith("+") ? lead.phone.slice(1) : lead.phone;
    if (!toPhone) { failed++; continue; }

    // Build template components (fill {{1}} with lead first name)
    const firstName = lead.name?.split(" ")[0] || lead.name || "Amigo";
    const components: any[] = [];
    if (variables_count && variables_count > 0) {
      const params = [firstName];
      for (let i = 1; i < variables_count; i++) params.push("");
      components.push({
        type: "body",
        parameters: params.map((v: string) => ({ type: "text", text: v })),
      });
    }

    const apiBody = {
      messaging_product: "whatsapp",
      to: toPhone,
      type: "template",
      template: {
        name: template_name,
        language: { code: language_code ?? "pt_BR" },
        components,
      },
    };

    try {
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${waToken}`,
        },
        body: JSON.stringify(apiBody),
      });
      const metaData = await metaRes.json();

      if (metaRes.ok) {
        sent++;
        const waMessageId = metaData?.messages?.[0]?.id ?? null;
        // Persist broadcast message to DB
        const now = new Date().toISOString();
        await sb.from("messages").insert({
          workspace_id,
          lead_id: lead.id,
          direction: "outbound",
          type: "template",
          content: `📢 Broadcast: ${template_name}`,
          automated: true,
          responded_at: now,
          wa_message_id: waMessageId,
        });
      } else {
        failed++;
        const errMsg = metaData?.error?.message ?? "Unknown error";
        errors.push(`${lead.phone}: ${errMsg}`);
        console.error(`[BROADCAST] failed for ${lead.phone}:`, errMsg);
      }
    } catch (e: any) {
      failed++;
      errors.push(`${lead.phone}: ${e.message}`);
    }

    // Rate limiting: Meta recommends ~80 messages/second
    // Add small delay between sends to be safe
    if (leads.length > 10) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log(`[BROADCAST] complete: sent=${sent} failed=${failed} total=${leads.length}`);

  return new Response(JSON.stringify({
    ok: true,
    sent,
    failed,
    total: leads.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  }), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
});
