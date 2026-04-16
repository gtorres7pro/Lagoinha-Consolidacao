// ============================================================
// whatsapp-send-message — Inbound send API for n8n (and other external callers)
//
// Authenticates via X-API-Key header matching workspace credentials.n8n_api_key.
// Resolves workspace → provider (Evolution or Meta) → sends message.
// Persists outbound message to messages table.
//
// POST body:
//   { workspace_id, lead_id?, phone?, message: { type, content, template_name?, language? } }
// Returns:
//   { ok, wa_message_id, channel }
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const EVOLUTION_URL = Deno.env.get("EVOLUTION_URL") ?? "https://evolution.7pro.tech";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-api-key",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function metaPhone(p: string) { return p.startsWith("+") ? p.slice(1) : p; }
function evoPhone(p: string)  { return p.startsWith("+") ? p.slice(1) : p; }
function normPhone(r: string) { const c = r.trim(); return c.startsWith("+") ? c : "+" + c; }

// ── Send helpers ───────────────────────────────────────────────────────────

async function sendViaEvolution(instanceName: string, phone: string, text: string): Promise<{ ok: boolean; waMessageId: string | null }> {
  const number = evoPhone(phone);
  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
      body: JSON.stringify({ number, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.error("[SEND] Evolution error:", JSON.stringify(data)); return { ok: false, waMessageId: null }; }
    return { ok: true, waMessageId: data.key?.id ?? null };
  } catch (e: any) {
    console.error("[SEND] Evolution fetch exception:", e.message);
    return { ok: false, waMessageId: null };
  }
}

async function sendViaMeta(token: string, phoneId: string, phone: string, text: string): Promise<{ ok: boolean; waMessageId: string | null }> {
  const to = metaPhone(phone);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text, preview_url: false } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.error("[SEND] Meta error:", JSON.stringify(data)); return { ok: false, waMessageId: null }; }
    return { ok: true, waMessageId: data.messages?.[0]?.id ?? null };
  } catch (e: any) {
    console.error("[SEND] Meta fetch exception:", e.message);
    return { ok: false, waMessageId: null };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); }
  catch { return json(400, { error: "Invalid JSON" }); }

  const { workspace_id, lead_id, phone, message } = body;
  if (!workspace_id)               return json(400, { error: "workspace_id required" });
  if (!lead_id && !phone)          return json(400, { error: "lead_id or phone required" });
  if (!message?.content)           return json(400, { error: "message.content required" });
  const msgType: string = message.type ?? "text";

  // ── Authenticate: X-API-Key must match workspace credentials.n8n_api_key ──
  const apiKey = req.headers.get("x-api-key") ?? "";
  if (!apiKey) return json(401, { error: "X-API-Key header required" });

  // ── Load workspace ────────────────────────────────────────────────────────
  const { data: ws } = await sb.from("workspaces")
    .select("id, credentials")
    .eq("id", workspace_id)
    .maybeSingle();

  if (!ws) return json(404, { error: "Workspace not found" });

  const storedKey: string = ws.credentials?.n8n_api_key ?? "";
  if (!storedKey || storedKey !== apiKey) {
    console.warn(`[SEND] invalid API key for workspace=${workspace_id}`);
    return json(401, { error: "Invalid API key" });
  }

  const creds = ws.credentials ?? {};
  const mode: string = creds.whatsapp_mode ?? "meta";

  // ── Resolve lead ────────────────────────────────────────────────────────
  let lead: any = null;

  if (lead_id) {
    const { data } = await sb.from("leads").select("id, phone, workspace_id")
      .eq("id", lead_id).eq("workspace_id", workspace_id).maybeSingle();
    lead = data;
  } else if (phone) {
    const normalised = normPhone(phone);
    for (const p of [normalised, metaPhone(normalised)]) {
      const { data: r } = await sb.from("leads").select("id, phone, workspace_id")
        .eq("phone", p).eq("workspace_id", workspace_id).limit(1);
      if (r?.[0]) { lead = r[0]; break; }
    }
  }

  if (!lead) return json(404, { error: "Lead not found" });

  const toPhone: string = lead.phone;
  const now = new Date().toISOString();
  let sendResult: { ok: boolean; waMessageId: string | null } = { ok: false, waMessageId: null };

  // ── Send via provider ──────────────────────────────────────────────────
  if (mode === "evolution") {
    const instanceName = creds.evolution_instance;
    if (!instanceName) return json(500, { error: "Evolution instance not configured" });
    sendResult = await sendViaEvolution(instanceName, toPhone, message.content);
  } else if (mode === "meta") {
    const waToken = creds.whatsapp_token;
    const phoneId = creds.phone_number_id ?? creds.phone_id;
    if (!waToken || !phoneId) return json(500, { error: "Meta credentials not configured" });
    sendResult = await sendViaMeta(waToken, phoneId, toPhone, message.content);
  } else {
    return json(422, { error: `Unsupported whatsapp_mode: ${mode}` });
  }

  console.log(`[SEND] workspace=${workspace_id} lead=${lead.id} mode=${mode} ok=${sendResult.ok}`);

  // ── Persist outbound message ───────────────────────────────────────────
  if (sendResult.ok) {
    const { error: msgErr } = await sb.from("messages").insert({
      workspace_id,
      lead_id: lead.id,
      direction: "outbound",
      type: msgType === "template" ? "template" : "text",
      content: message.content,
      automated: true,
      responded_at: now,
      wa_message_id: sendResult.waMessageId,
    });
    if (msgErr) console.error("[SEND] Failed to persist message:", msgErr.message);

    // Update lead last_message_at + 24h window
    const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await sb.from("leads").update({
      last_message_at: now,
      wa_window_expires_at: windowExpiry,
    }).eq("id", lead.id);
  }

  if (!sendResult.ok) {
    return json(502, { error: "Send failed", channel: mode });
  }

  return json(200, { ok: true, wa_message_id: sendResult.waMessageId, channel: mode });
});
