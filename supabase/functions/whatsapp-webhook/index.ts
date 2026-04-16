import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const EVOLUTION_URL = Deno.env.get("EVOLUTION_URL") ?? "https://evolution.7pro.tech";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
// Optional shared secret for Evolution webhooks: if set, Evolution must call us with ?s=<secret>
const EVOLUTION_WEBHOOK_SECRET = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";

if (!VERIFY_TOKEN) console.error("[WH] WHATSAPP_VERIFY_TOKEN env var not set — Meta GET challenge will fail");
if (!EVOLUTION_KEY) console.warn("[WH] EVOLUTION_API_KEY env var not set — Evolution media fetches will fail");

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

// ── HMAC-SHA256 verification for Meta webhooks (X-Hub-Signature-256) ────────
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

// Convert Evolution remoteJid (e.g. "5511999999999@s.whatsapp.net") to E.164
function evoPhoneToE164(remoteJid: string): string {
  const number = remoteJid.split("@")[0];
  return "+" + number;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function transcribeAudioWithGemini(audioBuffer: ArrayBuffer, mimeType: string, apiKey: string): Promise<string> {
  const base64Data = arrayBufferToBase64(audioBuffer);
  const cleanMime = mimeType.split(';')[0];
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: cleanMime, data: base64Data } },
          { text: "Transcreva exatamente o que foi dito neste áudio. Retorne apenas a transcrição final em texto puro, sem aspas e sem explicações." }
        ]
      }
    ]
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text.trim();
}

// ── Call whatsapp-flush in background (fire-and-forget) ─────────────────────
async function callFlush(lead_id: string, message_created_at: string) {
  const flushUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/whatsapp-flush";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    await fetch(flushUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({ lead_id, message_created_at })
    });
  } catch (e: any) {
    console.error("[WH] callFlush error:", e.message);
  }
}

// ── Automation dispatcher: IA Atendente or n8n ──────────────────────────────
// Called at end of both Meta and Evolution branches (fire-and-forget).
async function dispatchAutomation(ws: any, lead: any, now: string) {
  const mode: string = ws.credentials?.automation_mode ?? "off";
  console.log(`[WH] dispatchAutomation mode=${mode} lead=${lead.id}`);

  if (mode === "ia_atendente" && ws.credentials?.ia_active !== false) {
    console.log(`[WH] → calling whatsapp-flush for lead=${lead.id}`);
    callFlush(lead.id, now).catch(e => console.error("[WH] flush fire-and-forget error:", e));
  } else if (mode === "n8n") {
    dispatchToN8N(ws, lead, now).catch(e => console.error("[WH] n8n dispatch error:", e));
  }
}

// ── n8n outbound webhook ────────────────────────────────────────────────────
// POST a normalized payload to the workspace's n8n_webhook_url, signed with HMAC.
async function dispatchToN8N(ws: any, lead: any, messageCreatedAt: string) {
  const webhookUrl: string = ws.credentials?.n8n_webhook_url ?? "";
  const webhookSecret: string = ws.credentials?.n8n_webhook_secret ?? "";
  if (!webhookUrl) {
    console.warn(`[WH-N8N] workspace=${ws.id} has automation_mode=n8n but no n8n_webhook_url`);
    return;
  }

  // Get the latest inbound message for this lead
  const { data: lastMsg } = await sb.from("messages")
    .select("id, type, content, wa_message_id")
    .eq("lead_id", lead.id).eq("direction", "inbound")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const provider = ws.credentials?.whatsapp_mode === "meta" ? "meta" : "evolution";
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
    provider,
    timestamp: messageCreatedAt,
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Sign with HMAC-SHA256 if secret is configured
  if (webhookSecret) {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const sig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    headers["X-Signature-256"] = `sha256=${sig}`;
  }

  // Retry with backoff (3 attempts)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(webhookUrl, { method: "POST", headers, body: payload });
      if (res.ok) {
        console.log(`[WH-N8N] dispatched to n8n OK (attempt ${attempt})`);
        return;
      }
      console.warn(`[WH-N8N] n8n returned ${res.status} (attempt ${attempt})`);
    } catch (e: any) {
      console.warn(`[WH-N8N] fetch error attempt ${attempt}:`, e.message);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
  }
  console.error(`[WH-N8N] all 3 attempts failed for workspace=${ws.id}`);
  // Log failure to app_logs
  await sb.from("app_logs").insert({
    workspace_id: ws.id,
    type: "error",
    module: "whatsapp",
    action: "n8n_dispatch_failed",
    details: { lead_id: lead.id, webhook_url: webhookUrl },
  }).then(() => {}).catch(() => {});
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── Meta webhook verification (GET) ────────────────────────────────────────
  if (req.method === "GET") {
    const m = url.searchParams.get("hub.mode"), v = url.searchParams.get("hub.verify_token"), c = url.searchParams.get("hub.challenge");
    return m === "subscribe" && v && VERIFY_TOKEN && v === VERIFY_TOKEN ? new Response(c, {status:200}) : new Response("Forbidden", {status:403});
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", {status:405});

  // Read raw body once — needed for HMAC verification on Meta path
  const rawBody = await req.text();
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return new Response("Bad Request", {status:400}); }

  // ════════════════════════════════════════════════════════════════════════════
  // EVOLUTION API format detection
  // Evolution sends: { event: "messages.upsert", instance: "...", data: { key: { remoteJid, fromMe, id }, message: {...}, pushName } }
  // ════════════════════════════════════════════════════════════════════════════
  if (body?.event === "messages.upsert" || (body?.event && body?.instance && body?.data)) {
    // Optional shared-secret gate for Evolution webhook (Evolution doesn't sign payloads).
    // If EVOLUTION_WEBHOOK_SECRET is set, require it as ?s=<secret> on the webhook URL.
    if (EVOLUTION_WEBHOOK_SECRET && url.searchParams.get("s") !== EVOLUTION_WEBHOOK_SECRET) {
      console.warn("[WH-EVO] rejected: missing/invalid ?s= secret");
      return new Response("Forbidden", {status:403});
    }
    return await handleEvolutionWebhook(body);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // META CLOUD API format
  // ════════════════════════════════════════════════════════════════════════════
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  if (!value?.messages?.length) { console.log("[WH] skip: no messages"); return new Response("EVENT_RECEIVED", {status:200}); }

  const msg = value.messages[0];
  if (!["text","audio","image"].includes(msg.type)) return new Response("EVENT_RECEIVED", {status:200});

  const pnid: string = value.metadata?.phone_number_id ?? "";
  console.log(`[WH-META] id=${msg.id} from=${msg.from} pnid=${pnid} type=${msg.type}`);

  // Find workspace by phone_number_id — strict match, no fallback
  const { data: wss } = await sb.from("workspaces").select("id,name,credentials");
  const ws = wss?.find((w:any) => w.credentials?.phone_number_id === pnid);
  if (!ws) { console.error(`[WH-META] no workspace for phone_number_id=${pnid}`); return new Response("EVENT_RECEIVED", {status:200}); }

  // ── Verify X-Hub-Signature-256 with the workspace's Meta app_secret ────────
  // Transitional: if a workspace hasn't configured app_secret yet, log a warning
  // but still process. Once all workspaces have saved their app_secret, this
  // block becomes strict-reject-on-missing.
  const appSecret: string = ws.credentials?.app_secret ?? "";
  const sigHeader = req.headers.get("x-hub-signature-256");
  if (appSecret) {
    const valid = await verifyMetaSignature(rawBody, sigHeader, appSecret);
    if (!valid) {
      console.error(`[WH-META] invalid signature for workspace=${ws.id}`);
      return new Response("Forbidden", {status:403});
    }
  } else {
    console.warn(`[WH-META] workspace=${ws.id} has no app_secret set — accepting unsigned webhook (configure app_secret to enable HMAC verification)`);
  }

  // Idempotency
  const { data: dup } = await sb.from("messages").select("id").eq("wa_message_id", msg.id).maybeSingle();
  if (dup) { console.log("[WH-META] dup skip"); return new Response("EVENT_RECEIVED", {status:200}); }

  const phone = normPhone(msg.from);
  const contact = value.contacts?.[0] ?? null;

  // Find or create lead
  let lead: any = null;
  for (const p of [phone, metaPhone(phone)]) {
    const { data: r } = await sb.from("leads").select("*").eq("phone", p).eq("workspace_id", ws.id).order("created_at",{ascending:false}).limit(1);
    if (r?.[0]) { lead = r[0]; break; }
  }
  if (!lead) {
    const { data: nl } = await sb.from("leads").insert({workspace_id:ws.id, name:contact?.profile?.name??"Visitante", phone, type:"visitor"}).select().limit(1);
    lead = nl?.[0] ?? null;
  }
  if (!lead) { console.error("[WH-META] no lead"); return new Response("EVENT_RECEIVED", {status:200}); }

  // Human lock — still save the message so it appears in operator's inbox, just skip AI
  if (lead.llm_lock_until && new Date(lead.llm_lock_until) > new Date()) {
    console.log("[WH-META] human lock active — saving message but skipping automation");
    // We need to extract text first before saving
    let lockText = `[${msg.type}]`;
    if (msg.type === "text") lockText = msg.text?.body ?? "";
    const lockNow = new Date().toISOString();
    await sb.from("messages").insert({
      workspace_id: ws.id, lead_id: lead.id, direction: "inbound",
      type: msg.type, content: lockText, automated: false, responded_at: null, wa_message_id: msg.id,
    });
    const lockExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await sb.from("leads").update({ wa_window_expires_at: lockExpiry, has_responded: true, last_message_at: lockNow }).eq("id", lead.id);
    return new Response("EVENT_RECEIVED", {status:200});
  }

  // Handle TEXT vs AUDIO
  let text = `[${msg.type}]`;
  if (msg.type === "text") {
    text = msg.text?.body ?? "";
  } else if (msg.type === "audio" && msg.audio?.id) {
    try {
      const waToken = ws.credentials?.whatsapp_token;
      const geminiKey = ws.credentials?.llm_config?.gemini_token;
      if (waToken && geminiKey) {
        const mediaMetaRes = await fetch(`https://graph.facebook.com/v20.0/${msg.audio.id}`, {
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
  }

  const now = new Date().toISOString();
  const { error: ie } = await sb.from("messages").insert({
    workspace_id: ws.id, lead_id: lead.id, direction: "inbound",
    type: msg.type, content: text, automated: false, responded_at: null, wa_message_id: msg.id,
  });
  if (ie) { console.error("[WH-META] insert error:", ie.message); return new Response("DB_ERROR", {status:500}); }

  const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sb.from("leads").update({ wa_window_expires_at: windowExpiry, has_responded: true, last_message_at: now }).eq("id", lead.id);

  // Fire automation dispatcher (IA Atendente or n8n) — non-blocking
  dispatchAutomation(ws, lead, now);

  return new Response("EVENT_RECEIVED", {status:200});
});

// ════════════════════════════════════════════════════════════════════════════
// EVOLUTION API HANDLER
// ════════════════════════════════════════════════════════════════════════════
async function handleEvolutionWebhook(body: any): Promise<Response> {
  const event: string = body.event ?? "";
  const instanceName: string = body.instance ?? "";
  const data: any = body.data ?? {};

  console.log(`[WH-EVO] event=${event} instance=${instanceName}`);

  // Only handle incoming messages (not fromMe)
  if (event !== "messages.upsert") {
    return new Response("EVENT_RECEIVED", {status:200});
  }

  // Skip messages sent by us (fromMe = true)
  const key = data.key ?? {};
  if (key.fromMe === true) {
    console.log("[WH-EVO] skip fromMe message");
    return new Response("EVENT_RECEIVED", {status:200});
  }

  // Skip group messages (remoteJid contains @g.us)
  const remoteJid: string = key.remoteJid ?? "";
  if (remoteJid.includes("@g.us")) {
    console.log("[WH-EVO] skip group message");
    return new Response("EVENT_RECEIVED", {status:200});
  }

  const msgId: string = key.id ?? "";
  const pushName: string = data.pushName ?? data.sender ?? "";
  const phone = evoPhoneToE164(remoteJid);

  // Detect message type & extract content
  const msgData = data.message ?? {};
  let msgType = "text";
  let text = "";

  if (msgData.conversation) {
    text = msgData.conversation;
    msgType = "text";
  } else if (msgData.extendedTextMessage?.text) {
    text = msgData.extendedTextMessage.text;
    msgType = "text";
  } else if (msgData.audioMessage) {
    msgType = "audio";
    text = "[ÁUDIO]";
  } else if (msgData.imageMessage) {
    msgType = "image";
    text = msgData.imageMessage.caption ? `[IMAGEM] ${msgData.imageMessage.caption}` : "[IMAGEM]";
  } else if (msgData.documentMessage) {
    msgType = "text";
    text = `[DOCUMENTO: ${msgData.documentMessage.title || "arquivo"}]`;
  } else if (msgData.stickerMessage) {
    text = "[STICKER]";
    msgType = "text";
  } else {
    // Unknown message type — skip
    console.log("[WH-EVO] unknown message type:", JSON.stringify(msgData).slice(0, 200));
    return new Response("EVENT_RECEIVED", {status:200});
  }

  console.log(`[WH-EVO] id=${msgId} from=${phone} type=${msgType} text="${text.substring(0, 80)}"`);

  // Find workspace by evolution_instance name
  const { data: wss } = await sb.from("workspaces").select("id,name,credentials");
  const ws = wss?.find((w:any) => w.credentials?.evolution_instance === instanceName && w.credentials?.whatsapp_mode === "evolution");

  if (!ws) {
    console.error(`[WH-EVO] no workspace found for instance "${instanceName}"`);
    return new Response("EVENT_RECEIVED", {status:200});
  }

  // Idempotency
  const { data: dup } = await sb.from("messages").select("id").eq("wa_message_id", msgId).maybeSingle();
  if (dup) { console.log("[WH-EVO] dup skip"); return new Response("EVENT_RECEIVED", {status:200}); }

  // Find or create lead
  let lead: any = null;
  for (const p of [phone, metaPhone(phone)]) {
    const { data: r } = await sb.from("leads").select("*").eq("phone", p).eq("workspace_id", ws.id).order("created_at",{ascending:false}).limit(1);
    if (r?.[0]) { lead = r[0]; break; }
  }
  if (!lead) {
    console.log(`[WH-EVO] creating new lead: ${pushName || "Visitante"} (${phone})`);
    const { data: nl } = await sb.from("leads").insert({
      workspace_id: ws.id,
      name: pushName || "Visitante",
      phone,
      type: "visitor"
    }).select().limit(1);
    lead = nl?.[0] ?? null;
  }
  if (!lead) { console.error("[WH-EVO] failed to find/create lead"); return new Response("EVENT_RECEIVED", {status:200}); }

  console.log(`[WH-EVO] lead=${lead.id} (${lead.name}) phone=${lead.phone}`);

  // Check human lock
  if (lead.llm_lock_until && new Date(lead.llm_lock_until) > new Date()) {
    console.log("[WH-EVO] human lock active — saving message but skipping AI");
    // Still save the message so it appears in the chat
    await sb.from("messages").insert({
      workspace_id: ws.id, lead_id: lead.id, direction: "inbound",
      type: msgType, content: text, automated: false, responded_at: null, wa_message_id: msgId,
    });
    const now = new Date().toISOString();
    const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await sb.from("leads").update({ wa_window_expires_at: windowExpiry, has_responded: true, last_message_at: now }).eq("id", lead.id);
    return new Response("EVENT_RECEIVED", {status:200});
  }

  // ── Handle audio transcription via Gemini ────────────────────────────────
  if (msgType === "audio" && msgData.audioMessage) {
    try {
      const geminiKey = ws.credentials?.llm_config?.gemini_token;
      if (geminiKey && msgData.audioMessage.url) {
        // Download audio from Evolution API
        const audioRes = await fetch(msgData.audioMessage.url, {
          headers: { "apikey": EVOLUTION_KEY }
        });
        if (audioRes.ok) {
          const audioBuffer = await audioRes.arrayBuffer();
          const mimeType = msgData.audioMessage.mimetype || "audio/ogg; codecs=opus";
          const transcription = await transcribeAudioWithGemini(audioBuffer, mimeType, geminiKey);
          text = transcription ? `[ÁUDIO TRANSCRITO] "${transcription}"` : `[ÁUDIO TRANSCRITO]: (fala vazia ou ininteligível)`;
          console.log(`[WH-EVO] Audio transcribed: ${text.substring(0, 80)}`);
        }
      } else {
        // Try to download via Evolution mediaMessage endpoint
        const evoMediaRes = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
          body: JSON.stringify({ message: { ...data }, convertToMp4: false })
        });
        if (evoMediaRes.ok) {
          const mediaData = await evoMediaRes.json();
          if (mediaData.base64) {
            const geminiKey = ws.credentials?.llm_config?.gemini_token;
            if (geminiKey) {
              const mimeType = msgData.audioMessage?.mimetype || "audio/ogg; codecs=opus";
              const binary = atob(mediaData.base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const transcription = await transcribeAudioWithGemini(bytes.buffer, mimeType, geminiKey);
              text = transcription ? `[ÁUDIO TRANSCRITO] "${transcription}"` : `[ÁUDIO TRANSCRITO]: (fala vazia ou ininteligível)`;
            }
          }
        }
      }
    } catch (e: any) {
      console.error("[WH-EVO] Audio transcription error:", e.message);
      text = `[ÁUDIO]: Recebido.`;
    }
  }

  // Save inbound message
  const now = new Date().toISOString();
  const { error: ie } = await sb.from("messages").insert({
    workspace_id: ws.id, lead_id: lead.id, direction: "inbound",
    type: msgType, content: text, automated: false, responded_at: null, wa_message_id: msgId,
  });
  if (ie) { console.error("[WH-EVO] insert error:", ie.message); return new Response("DB_ERROR", {status:500}); }

  console.log(`[WH-EVO] inbound saved: "${text.substring(0, 100)}"`);

  // Update lead: open 24h WhatsApp window and mark as responded
  const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sb.from("leads").update({
    wa_window_expires_at: windowExpiry,
    has_responded: true,
    last_message_at: now,
  }).eq("id", lead.id);

  // Fire automation dispatcher (IA Atendente or n8n) — non-blocking
  dispatchAutomation(ws, lead, now);

  return new Response("EVENT_RECEIVED", {status:200});
}
