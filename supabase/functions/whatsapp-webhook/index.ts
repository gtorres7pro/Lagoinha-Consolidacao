import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";

if (!VERIFY_TOKEN) console.error("[WH] WHATSAPP_VERIFY_TOKEN env var not set — Meta GET challenge will fail");

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

// ── HMAC-SHA256 verification for Meta webhooks (X-Hub-Signature-256) ─────────
async function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice(7);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== computed.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ computed.charCodeAt(i);
  return diff === 0;
}

function normPhone(r: string) { const c = r.trim(); return c.startsWith("+") ? c : "+" + c; }
function metaPhone(p: string) { return p.startsWith("+") ? p.slice(1) : p; }

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function transcribeAudioWithGemini(audioBuffer: ArrayBuffer, mimeType: string, apiKey: string): Promise<string> {
  const base64Data = arrayBufferToBase64(audioBuffer);
  const cleanMime = mimeType.split(";")[0];
  const payload = {
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: cleanMime, data: base64Data } },
        { text: "Transcreva exatamente o que foi dito neste áudio. Retorne apenas a transcrição final em texto puro, sem aspas e sem explicações." }
      ]
    }]
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

// ── n8n outbound webhook ─────────────────────────────────────────────────────
async function dispatchToN8N(ws: any, lead: any, messageCreatedAt: string) {
  const webhookUrl: string = ws.credentials?.n8n_webhook_url ?? "";
  const webhookSecret: string = ws.credentials?.n8n_webhook_secret ?? "";
  if (!webhookUrl) {
    console.warn(`[WH-N8N] workspace=${ws.id} has automation_mode=n8n but no n8n_webhook_url`);
    return;
  }

  const { data: lastMsg } = await sb.from("messages")
    .select("id, type, content, wa_message_id")
    .eq("lead_id", lead.id).eq("direction", "inbound")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const payload = JSON.stringify({
    workspace_id: ws.id,
    lead_id: lead.id,
    lead: { name: lead.name, phone: lead.phone, source: lead.source ?? null },
    message: lastMsg ? {
      id: lastMsg.id,
      type: lastMsg.type,
      content: lastMsg.content,
      wa_message_id: lastMsg.wa_message_id,
    } : null,
    provider: "meta",
    timestamp: messageCreatedAt,
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (webhookSecret) {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const sig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    headers["X-Signature-256"] = `sha256=${sig}`;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(webhookUrl, { method: "POST", headers, body: payload });
      if (res.ok) {
        console.log(`[WH-N8N] dispatched OK (attempt ${attempt})`);
        return;
      }
      console.warn(`[WH-N8N] n8n returned ${res.status} (attempt ${attempt})`);
    } catch (e: any) {
      console.warn(`[WH-N8N] fetch error attempt ${attempt}:`, e.message);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
  }
  console.error(`[WH-N8N] all 3 attempts failed for workspace=${ws.id}`);
  await sb.from("app_logs").insert({
    workspace_id: ws.id,
    type: "error",
    module: "whatsapp",
    action: "n8n_dispatch_failed",
    details: { lead_id: lead.id, webhook_url: webhookUrl },
  }).then(() => {}).catch(() => {});
}

// ── IA Atendente flush ───────────────────────────────────────────────────────
async function callFlush(lead_id: string, message_created_at: string) {
  const flushUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/whatsapp-flush";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internalSecret = Deno.env.get("ZELO_INTERNAL_SECRET") ?? Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  try {
    const res = await fetch(flushUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        ...(internalSecret ? { "x-zelo-internal-secret": internalSecret } : {}),
      },
      body: JSON.stringify({ lead_id, message_created_at })
    });
    if (!res.ok) {
      console.error("[WH] callFlush failed:", res.status, await res.text());
    }
  } catch (e: any) {
    console.error("[WH] callFlush error:", e.message);
  }
}

// ── Automation dispatcher ────────────────────────────────────────────────────
async function dispatchAutomation(ws: any, lead: any, now: string) {
  const mode: string = ws.credentials?.automation_mode ?? "off";
  console.log(`[WH] dispatchAutomation mode=${mode} lead=${lead.id}`);
  if (mode === "ia_atendente" && ws.credentials?.ia_active !== false) {
    await callFlush(lead.id, now);
  } else if (mode === "n8n") {
    await dispatchToN8N(ws, lead, now);
  }
}

function runInBackground(promise: Promise<unknown>) {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(promise);
    return;
  }
  promise.catch((e: any) => console.error("[WH] background task error:", e?.message ?? e));
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER — Meta Cloud API only
// ════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── Meta webhook verification (GET) ────────────────────────────────────────
  if (req.method === "GET") {
    const m = url.searchParams.get("hub.mode");
    const v = url.searchParams.get("hub.verify_token");
    const c = url.searchParams.get("hub.challenge");
    return m === "subscribe" && v && VERIFY_TOKEN && v === VERIFY_TOKEN
      ? new Response(c, { status: 200 })
      : new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const rawBody = await req.text();
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return new Response("Bad Request", { status: 400 }); }

  // ── Parse Meta Cloud API format ────────────────────────────────────────────
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  if (!value?.messages?.length) {
    console.log("[WH] skip: no messages in payload");
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const msg = value.messages[0];
  if (!["text", "audio", "image"].includes(msg.type)) {
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const pnid: string = value.metadata?.phone_number_id ?? "";
  console.log(`[WH-META] id=${msg.id} from=${msg.from} pnid=${pnid} type=${msg.type}`);

  // Find workspace by phone_number_id
  const { data: wss } = await sb.from("workspaces").select("id,name,credentials");
  const ws = wss?.find((w: any) => w.credentials?.phone_id === pnid);
  if (!ws) {
    console.error(`[WH-META] no workspace for phone_id=${pnid}`);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  // Verify X-Hub-Signature-256
  const appSecret: string = ws.credentials?.app_secret ?? Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
  const sigHeader = req.headers.get("x-hub-signature-256");
  if (!appSecret) {
    console.error(`[WH-META] workspace=${ws.id} has no app_secret — rejecting unsigned webhook`);
    return new Response("Forbidden", { status: 403 });
  }
  const valid = await verifyMetaSignature(rawBody, sigHeader, appSecret);
  if (!valid) {
    console.error(`[WH-META] invalid signature for workspace=${ws.id}`);
    return new Response("Forbidden", { status: 403 });
  }

  // Idempotency
  const { data: dup } = await sb.from("messages").select("id").eq("wa_message_id", msg.id).maybeSingle();
  if (dup) { console.log("[WH-META] dup skip"); return new Response("EVENT_RECEIVED", { status: 200 }); }

  const phone = normPhone(msg.from);
  const contact = value.contacts?.[0] ?? null;

  // Find or create lead
  let lead: any = null;
  for (const p of [phone, metaPhone(phone)]) {
    const { data: r } = await sb.from("leads").select("*").eq("phone", p).eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(1);
    if (r?.[0]) { lead = r[0]; break; }
  }
  if (!lead) {
    const { data: nl } = await sb.from("leads").insert({
      workspace_id: ws.id,
      name: contact?.profile?.name ?? "Visitante",
      phone,
      type: "visitor",
    }).select().limit(1);
    lead = nl?.[0] ?? null;
  }
  if (!lead) { console.error("[WH-META] no lead"); return new Response("EVENT_RECEIVED", { status: 200 }); }

  // Human lock: save message but skip automation
  if (lead.llm_lock_until && new Date(lead.llm_lock_until) > new Date()) {
    console.log("[WH-META] human lock active — saving but skipping automation");
    let lockText = `[${msg.type}]`;
    if (msg.type === "text") lockText = msg.text?.body ?? "";
    const lockNow = new Date().toISOString();
    await sb.from("messages").insert({
      workspace_id: ws.id, lead_id: lead.id, direction: "inbound",
      type: msg.type, content: lockText, automated: false, responded_at: null, wa_message_id: msg.id,
    });
    const lockExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await sb.from("leads").update({ wa_window_expires_at: lockExpiry, has_responded: true, last_message_at: lockNow }).eq("id", lead.id);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  // Handle TEXT vs AUDIO vs IMAGE
  let text = `[${msg.type}]`;
  if (msg.type === "text") {
    text = msg.text?.body ?? "";
  } else if (msg.type === "audio" && msg.audio?.id) {
    try {
      const waToken = ws.credentials?.whatsapp_token;
      const geminiKey = ws.credentials?.llm_config?.gemini_token;
      if (waToken && geminiKey) {
        const mediaMetaRes = await fetch(`https://graph.facebook.com/v21.0/${msg.audio.id}`, {
          headers: { "Authorization": `Bearer ${waToken}` }
        });
        const mediaMeta = await mediaMetaRes.json();
        if (mediaMeta.url) {
          const mediaRes = await fetch(mediaMeta.url, { headers: { "Authorization": `Bearer ${waToken}` } });
          const audioBuffer = await mediaRes.arrayBuffer();
          const transcription = await transcribeAudioWithGemini(audioBuffer, msg.audio.mime_type || "audio/ogg", geminiKey);
          text = transcription ? `[ÁUDIO TRANSCRITO] "${transcription}"` : `[ÁUDIO TRANSCRITO]: (fala vazia ou ininteligível)`;
        }
      }
    } catch (e: any) {
      text = `[ÁUDIO]: Erro ao transcrever.`;
    }
  } else if (msg.type === "image") {
    text = msg.image?.caption ? `[IMAGEM] ${msg.image.caption}` : "[IMAGEM]";
  }

  const now = new Date().toISOString();
  const { error: ie } = await sb.from("messages").insert({
    workspace_id: ws.id, lead_id: lead.id, direction: "inbound",
    type: msg.type, content: text, automated: false, responded_at: null, wa_message_id: msg.id,
  });
  if (ie) { console.error("[WH-META] insert error:", ie.message); return new Response("DB_ERROR", { status: 500 }); }

  const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sb.from("leads").update({ wa_window_expires_at: windowExpiry, has_responded: true, last_message_at: now }).eq("id", lead.id);

  // Fire automation without delaying Meta's webhook acknowledgement.
  runInBackground(
    dispatchAutomation(ws, lead, now)
      .catch((e: any) => console.error("[WH] automation dispatch error:", e?.message ?? e))
  );

  return new Response("EVENT_RECEIVED", { status: 200 });
});
