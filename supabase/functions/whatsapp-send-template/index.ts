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

const EVOLUTION_URL = Deno.env.get("EVOLUTION_URL") ?? "https://evolution.7pro.tech";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
if (!EVOLUTION_KEY) console.warn("[TMPL] EVOLUTION_API_KEY env var not set — Evolution sends will fail");

// ── helpers ───────────────────────────────────────────────────────────────────

/** Strip leading + for Meta API */
function metaPhone(p: string) { return p.startsWith("+") ? p.slice(1) : p; }

/** Strip leading + for Evolution API (needs number only) */
function evoPhone(p: string) { return p.replace(/^\+/, ""); }

/** Replace {{nome}}, {{culto}}, {{decisao}} in message body */
function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

// ── main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let body: any;
  try { body = await req.json(); }
  catch { return new Response("Bad Request", { status: 400, headers: CORS }); }

  const { lead_id, workspace_id } = body;
  if (!lead_id || !workspace_id) {
    return new Response(JSON.stringify({ error: "Missing lead_id or workspace_id" }), { status: 400, headers: CORS });
  }

  // ── 1. Fetch lead ─────────────────────────────────────────────────────────
  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .select("id, name, phone, source, decisao, culto")
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
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // ── 2. Idempotency guard — scoped to (lead, today) ───────────────────────
  // Allows a returning lead to be welcomed again on a new day.
  // Still prevents duplicate sends from the same submission within a day.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: existing } = await sb
    .from("messages")
    .select("id")
    .eq("lead_id", lead_id)
    .eq("workspace_id", workspace_id)
    .in("type", ["template", "text"])
    .eq("automated", true)
    .eq("direction", "outbound")
    .gte("created_at", todayStart.toISOString())
    .maybeSingle();

  if (existing) {
    console.log("[TMPL] Already sent automated message to this lead today — skipping.");
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_sent_today" }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // ── 3. Fetch workspace credentials + automation rules ─────────────────────
  const { data: ws, error: wsErr } = await sb
    .from("workspaces")
    .select("credentials, automation_config")
    .eq("id", workspace_id)
    .maybeSingle();

  if (wsErr || !ws) {
    console.error("[TMPL] Workspace not found:", wsErr?.message);
    return new Response(JSON.stringify({ error: "Workspace not found" }), { status: 500, headers: CORS });
  }

  const creds          = ws.credentials ?? {};
  const automationCfg  = (ws as any).automation_config ?? {};
  const mode           = creds.whatsapp_mode ?? "meta"; // 'evolution' | 'meta' | 'none'

  // ── 4. Find matching automation rule for lead's source ────────────────────
  const rules: any[] = automationCfg.rules ?? [];
  const leadSource   = lead.source ?? body.source ?? "";
  const matchedRule  = rules.find(
    (r: any) => r.enabled !== false && r.source === leadSource
  );

  console.log(`[TMPL] lead source="${leadSource}" | workspace mode="${mode}" | matched rule: ${matchedRule ? JSON.stringify(matchedRule) : "none"}`);

  // Effective channel: rule overrides workspace default
  const effectiveChannel = matchedRule?.channel ?? mode;

  // Template / message overrides from request body (allows manual calls)
  const overrideTemplate: string | null = body.template_name ?? null;
  const overrideLang: string | null     = body.language_code ?? null;

  const firstName = (lead.name ?? "").split(" ")[0] || "Amigo";
  const vars      = { nome: firstName, culto: lead.culto ?? "", decisao: lead.decisao ?? "" };

  let sendOk      = false;
  let waMessageId: string | null = null;
  let sentContent = "";

  // ══════════════════════════════════════════════════════════════════════════
  // PATH A — Evolution API
  // ══════════════════════════════════════════════════════════════════════════
  if (effectiveChannel === "evolution") {
    const instanceName = creds.evolution_instance;
    if (!instanceName) {
      console.error("[TMPL] Evolution: no instance configured in workspace credentials.");
      return new Response(JSON.stringify({ error: "Evolution instance not configured" }), { status: 500, headers: CORS });
    }

    // Determine message body: rule body > body param > default
    const rawMsg = matchedRule?.message_body
      ?? body.message_body
      ?? `Olá ${firstName}! 🙏 Seja bem-vindo(a) à Lagoinha. Em breve um de nossos líderes entrará em contato com você!`;

    sentContent = interpolate(rawMsg, vars);
    const toPhone = evoPhone(lead.phone);

    console.log(`[TMPL] Evolution: sending to ${toPhone} via instance "${instanceName}"`);

    try {
      const evoRes = await fetch(
        `${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instanceName)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVOLUTION_KEY,
          },
          body: JSON.stringify({
            number: toPhone,
            text: sentContent,
          }),
        }
      );

      const evoData = await evoRes.json();
      console.log("[TMPL] Evolution response:", JSON.stringify(evoData));

      if (evoRes.ok && (evoData.key?.id || evoData.status === "PENDING" || evoData.status === "SENT")) {
        sendOk      = true;
        waMessageId = evoData.key?.id ?? null;
        console.log(`[TMPL] Evolution sent OK. msg_id=${waMessageId}`);
      } else {
        console.error("[TMPL] Evolution API error:", JSON.stringify(evoData));
        return new Response(JSON.stringify({ error: "Evolution API error", details: evoData }), { status: 502, headers: CORS });
      }
    } catch (e: any) {
      console.error("[TMPL] Evolution fetch exception:", e.message);
      return new Response(JSON.stringify({ error: "Network error", message: e.message }), { status: 500, headers: CORS });
    }

  // ══════════════════════════════════════════════════════════════════════════
  // PATH B — Meta Cloud API
  // ══════════════════════════════════════════════════════════════════════════
  } else if (effectiveChannel === "meta") {
    const waToken     = creds.whatsapp_token;
    const phoneNumId  = creds.phone_number_id ?? creds.phone_id;

    if (!waToken || !phoneNumId) {
      console.error("[TMPL] Meta: missing whatsapp_token or phone_number_id in workspace credentials.");
      return new Response(JSON.stringify({ error: "Meta WhatsApp credentials not configured" }), { status: 500, headers: CORS });
    }

    const templateName = overrideTemplate ?? matchedRule?.template ?? "consolidacao";
    const languageCode = overrideLang     ?? matchedRule?.language ?? "pt_BR";
    const toPhone      = metaPhone(lead.phone);
    sentContent        = `[Template: ${templateName}] Olá, ${firstName}!`;

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
            parameters: [{ type: "text", parameter_name: "name", text: firstName }],
          },
        ],
      },
    };

    console.log(`[TMPL] Meta: sending template="${templateName}" (${languageCode}) to ${toPhone}`);

    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(templatePayload),
      });

      const resData = await res.json();
      if (res.ok) {
        sendOk      = true;
        waMessageId = resData?.messages?.[0]?.id ?? null;
        console.log(`[TMPL] Meta sent OK. wa_message_id=${waMessageId}`);
      } else {
        console.error("[TMPL] Meta API error:", JSON.stringify(resData));
        return new Response(JSON.stringify({ error: "Meta API error", details: resData }), { status: 502, headers: CORS });
      }
    } catch (e: any) {
      console.error("[TMPL] Meta fetch exception:", e.message);
      return new Response(JSON.stringify({ error: "Network error", message: e.message }), { status: 500, headers: CORS });
    }

  // ══════════════════════════════════════════════════════════════════════════
  // PATH C — no channel / disabled
  // ══════════════════════════════════════════════════════════════════════════
  } else {
    console.log(`[TMPL] Channel="${effectiveChannel}" — no message sent.`);
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_channel" }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // ── 5. Persist message + update lead ─────────────────────────────────────
  if (sendOk) {
    const now = new Date().toISOString();

    // Evolution sends free-text (not a WA Business template), so store as 'text'
    const persistType = effectiveChannel === "evolution" ? "text" : "template";

    const { error: msgErr } = await sb.from("messages").insert({
      workspace_id,
      lead_id,
      direction: "outbound",
      type: persistType,
      content: sentContent,
      automated: true,
      responded_at: now,
      wa_message_id: waMessageId,
    });
    if (msgErr) console.error("[TMPL] Failed to save message:", msgErr.message);
    else console.log(`[TMPL] Message saved to DB (type=${persistType}).`);

    const { error: luErr } = await sb.from("leads")
      .update({ last_message_at: now })
      .eq("id", lead_id)
      .eq("workspace_id", workspace_id);
    if (luErr) console.error("[TMPL] Failed to update last_message_at:", luErr.message);
    else console.log("[TMPL] lead.last_message_at updated.");
  }

  return new Response(
    JSON.stringify({ ok: true, sent: sendOk, channel: effectiveChannel, wa_message_id: waMessageId }),
    { status: 200, headers: { "Content-Type": "application/json", ...CORS } }
  );
});
