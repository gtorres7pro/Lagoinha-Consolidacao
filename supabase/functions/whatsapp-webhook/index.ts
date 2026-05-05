import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";

if (!VERIFY_TOKEN) console.error("[WH] WHATSAPP_VERIFY_TOKEN env var not set — Meta GET challenge will fail");

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

async function logAppEvent(args: {
  workspaceId?: string | null;
  type?: string;
  title: string;
  description: string;
}) {
  try {
    await sb.from("app_logs").insert({
      workspace_id: args.workspaceId ?? null,
      type: args.type ?? "error",
      title: args.title,
      description: args.description,
      status: "pending",
      is_public: false,
    });
  } catch (e: any) {
    console.warn("[WH-LOG] app_logs insert failed:", e?.message ?? e);
  }
}

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
function phoneDigits(p: string) { return String(p || "").replace(/\D/g, ""); }

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

async function buildInboundMessageText(ws: any, msg: any): Promise<string> {
  if (msg.type === "text") return msg.text?.body ?? "";

  if (msg.type === "audio" && msg.audio?.id) {
    const mediaLine = `[MEDIA_ID: ${msg.audio.id}]`;
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
          return transcription
            ? `[ÁUDIO TRANSCRITO] "${transcription}"\n${mediaLine}`
            : `[ÁUDIO TRANSCRITO]: (fala vazia ou ininteligível)\n${mediaLine}`;
        }
      }
      return `[ÁUDIO]\n${mediaLine}`;
    } catch (_e: any) {
      return `[ÁUDIO]: Erro ao transcrever.\n${mediaLine}`;
    }
  }

  if (msg.type === "image") {
    const mediaLine = msg.image?.id ? `\n[MEDIA_ID: ${msg.image.id}]` : "";
    return msg.image?.caption ? `[IMAGEM] ${msg.image.caption}${mediaLine}` : `[IMAGEM]${mediaLine}`;
  }

  return `[${msg.type}]`;
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
  await logAppEvent({
    workspaceId: ws.id,
    title: "WhatsApp n8n dispatch failed",
    description: JSON.stringify({ lead_id: lead.id, webhook_url: webhookUrl }, null, 2),
  });
}

// ── Automation dispatcher ────────────────────────────────────────────────────
async function dispatchAutomation(ws: any, lead: any, now: string) {
  const mode: string = ws.credentials?.automation_mode ?? "off";
  console.log(`[WH] dispatchAutomation mode=${mode} lead=${lead.id}`);
  if (mode === "ia_atendente" && ws.credentials?.ia_active !== false) {
    console.log("[WH] IA dispatch handled by on_inbound_message_insert trigger");
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

async function findWorkspaceForPhoneNumberId(phoneNumberId: string) {
  const { data: wss, error } = await sb.from("workspaces").select("id,name,credentials");
  if (error) {
    console.error("[WH-META] workspace lookup error:", error.message);
    await logAppEvent({
      title: "WhatsApp webhook workspace lookup failed",
      description: JSON.stringify({ phone_number_id: phoneNumberId, error: error.message }, null, 2),
    });
    return null;
  }
  return wss?.find((w: any) =>
    w.credentials?.phone_id === phoneNumberId ||
    w.credentials?.phone_number_id === phoneNumberId
  ) ?? null;
}

async function verifyWorkspaceWebhook(rawBody: string, req: Request, ws: any): Promise<boolean> {
  const appSecret: string = ws.credentials?.app_secret ?? Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
  const sigHeader = req.headers.get("x-hub-signature-256");
  if (!appSecret) {
    console.error(`[WH-META] workspace=${ws.id} has no app_secret — rejecting unsigned webhook`);
    await logAppEvent({
      workspaceId: ws.id,
      title: "WhatsApp webhook missing app secret",
      description: JSON.stringify({ phone_number_id: ws.credentials?.phone_id ?? ws.credentials?.phone_number_id ?? null }, null, 2),
    });
    return false;
  }
  const valid = await verifyMetaSignature(rawBody, sigHeader, appSecret);
  if (!valid) {
    console.error(`[WH-META] invalid signature for workspace=${ws.id}`);
    await logAppEvent({
      workspaceId: ws.id,
      title: "WhatsApp webhook invalid signature",
      description: JSON.stringify({ has_signature_header: !!sigHeader }, null, 2),
    });
    return false;
  }
  return true;
}

async function handleStatusWebhook(value: any, rawBody: string, req: Request) {
  const pnid: string = value.metadata?.phone_number_id ?? "";
  const ws = await findWorkspaceForPhoneNumberId(pnid);
  if (!ws) {
    console.error(`[WH-META] no workspace for status phone_id=${pnid}`);
    await logAppEvent({
      title: "WhatsApp status phone_id without workspace",
      description: JSON.stringify({ phone_number_id: pnid }, null, 2),
    });
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const verified = await verifyWorkspaceWebhook(rawBody, req, ws);
  if (!verified) return new Response("Forbidden", { status: 403 });

  for (const status of value.statuses ?? []) {
    const waMessageId = status.id;
    const state = status.status;
    console.log(`[WH-META] status=${state} wa_message_id=${waMessageId}`);
    if (state !== "failed") continue;

    const { data: msg } = await sb.from("messages")
      .select("id, lead_id, content, direction, automated, created_at")
      .eq("wa_message_id", waMessageId)
      .maybeSingle();

    const failureText = JSON.stringify(status.errors ?? []);

    await logAppEvent({
      workspaceId: ws.id,
      title: "WhatsApp message delivery failed",
      description: JSON.stringify({
        wa_message_id: waMessageId,
        lead_id: msg?.lead_id ?? null,
        recipient_id: status.recipient_id ?? null,
        errors: status.errors ?? [],
        content_preview: msg?.content ? String(msg.content).slice(0, 180) : null,
      }, null, 2),
    });

    await sb.from("birthday_message_sends")
      .update({
        status: "failed",
        error: failureText.slice(0, 1000),
      })
      .eq("wa_message_id", waMessageId);

    if (msg?.id && msg.direction === "outbound") {
      const { data: inboundAfter } = await sb.from("messages")
        .select("id")
        .eq("workspace_id", ws.id)
        .eq("lead_id", msg.lead_id)
        .eq("direction", "inbound")
        .gt("created_at", msg.created_at)
        .limit(1);

      const { error: deleteErr } = await sb.from("messages").delete().eq("id", msg.id);
      if (deleteErr) {
        console.warn("[WH-META] failed delivery message cleanup failed:", deleteErr.message);
      } else {
        console.log(`[WH-META] removed failed outbound chat row ${msg.id}`);
      }

      if (msg.automated && !inboundAfter?.length) {
        await sb.from("leads")
          .update({ inbox_status: "archived" })
          .eq("id", msg.lead_id)
          .eq("workspace_id", ws.id);
      }
    }
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
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
    if (value?.statuses?.length) {
      return await handleStatusWebhook(value, rawBody, req);
    }
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
  const ws = await findWorkspaceForPhoneNumberId(pnid);
  if (!ws) {
    console.error(`[WH-META] no workspace for phone_id=${pnid}`);
    await logAppEvent({
      title: "WhatsApp webhook phone_id without workspace",
      description: JSON.stringify({ phone_number_id: pnid, message_id: msg.id, from: msg.from }, null, 2),
    });
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  // Verify X-Hub-Signature-256
  const valid = await verifyWorkspaceWebhook(rawBody, req, ws);
  if (!valid) return new Response("Forbidden", { status: 403 });

  // Idempotency
  const { data: dup } = await sb.from("messages").select("id").eq("wa_message_id", msg.id).maybeSingle();
  if (dup) { console.log("[WH-META] dup skip"); return new Response("EVENT_RECEIVED", { status: 200 }); }

  const phone = normPhone(msg.from);
  const contact = value.contacts?.[0] ?? null;
  const searchPhone = phoneDigits(phone).slice(-10);

  // Find or create lead
  let lead: any = null;
  for (const p of [phone, metaPhone(phone)]) {
    const { data: r } = await sb.from("leads").select("*").eq("phone", p).eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(1);
    if (r?.[0]) { lead = r[0]; break; }
  }
  if (!lead && searchPhone.length >= 7) {
    const { data: r } = await sb.from("leads")
      .select("*")
      .eq("workspace_id", ws.id)
      .ilike("phone", `%${searchPhone}%`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (r?.[0]) lead = r[0];
  }
  if (!lead) {
    const { data: nl } = await sb.from("leads").insert({
      workspace_id: ws.id,
      name: contact?.profile?.name ?? "Visitante",
      phone,
      type: "visitor",
      source: "whatsapp-inbound",
    }).select().limit(1);
    lead = nl?.[0] ?? null;
  }
  if (!lead) {
    console.error("[WH-META] no lead");
    await logAppEvent({
      workspaceId: ws.id,
      title: "WhatsApp webhook could not create lead",
      description: JSON.stringify({ phone, message_id: msg.id, contact_name: contact?.profile?.name ?? null }, null, 2),
    });
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const contactName = contact?.profile?.name ?? null;
  if (contactName && (!lead.name || lead.name === "Visitante" || lead.name === lead.phone)) {
    const { data: updatedLead } = await sb.from("leads")
      .update({ name: contactName })
      .eq("id", lead.id)
      .select()
      .maybeSingle();
    if (updatedLead) lead = updatedLead;
  }

  let relatedLeadIds: string[] = [lead.id];
  let relatedLeads: any[] = [lead];
  if (searchPhone.length >= 7) {
    const { data: samePhoneLeads, error: samePhoneError } = await sb.from("leads")
      .select("id, name, phone, llm_lock_until, bot_context")
      .eq("workspace_id", ws.id)
      .ilike("phone", `%${searchPhone}%`);
    if (samePhoneError) {
      console.warn("[WH-META] same-phone lead lookup failed:", samePhoneError.message);
    } else if (samePhoneLeads?.length) {
      relatedLeads = samePhoneLeads;
      relatedLeadIds = [...new Set([lead.id, ...samePhoneLeads.map((l: any) => l.id).filter(Boolean)])];
    }
  }

  if (contactName) {
    await Promise.all(relatedLeads.map((l: any) => {
      const existingContext = l?.bot_context && typeof l.bot_context === "object" && !Array.isArray(l.bot_context)
        ? l.bot_context
        : {};
      const botContext = {
        ...existingContext,
        whatsapp_profile_name: contactName,
        whatsapp_wa_id: msg.from,
      };
      const updatePayload: Record<string, any> = { bot_context: botContext };
      if (!l.name || l.name === "Visitante" || l.name === l.phone) updatePayload.name = contactName;
      return sb.from("leads").update(updatePayload).eq("id", l.id);
    }));
    lead = {
      ...lead,
      bot_context: {
        ...(lead?.bot_context && typeof lead.bot_context === "object" && !Array.isArray(lead.bot_context) ? lead.bot_context : {}),
        whatsapp_profile_name: contactName,
        whatsapp_wa_id: msg.from,
      },
    };
  }

  const inboundText = await buildInboundMessageText(ws, msg);

  // Human lock: save message but skip automation
  const humanLockActive = relatedLeads.some((l: any) => l.llm_lock_until && new Date(l.llm_lock_until) > new Date());
  if (humanLockActive) {
    console.log("[WH-META] human lock active — saving but skipping automation");
    const lockNow = new Date().toISOString();
    const { error: lockInsertErr } = await sb.from("messages").insert({
      workspace_id: ws.id, lead_id: lead.id, direction: "inbound",
      type: msg.type, content: inboundText, automated: false, responded_at: lockNow, wa_message_id: msg.id,
    });
    if (lockInsertErr) {
      await logAppEvent({
        workspaceId: ws.id,
        title: "WhatsApp locked inbound insert failed",
        description: JSON.stringify({ lead_id: lead.id, message_id: msg.id, error: lockInsertErr.message }, null, 2),
      });
      return new Response("DB_ERROR", { status: 500 });
    }
    const lockExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: lockLeadErr } = await sb.from("leads")
      .update({ wa_window_expires_at: lockExpiry, has_responded: true, last_message_at: lockNow, inbox_status: "highlighted" })
      .in("id", relatedLeadIds);
    if (lockLeadErr) {
      await logAppEvent({
        workspaceId: ws.id,
        title: "WhatsApp locked lead update failed",
        description: JSON.stringify({ lead_id: lead.id, message_id: msg.id, error: lockLeadErr.message }, null, 2),
      });
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const now = new Date().toISOString();
  const { error: ie } = await sb.from("messages").insert({
    workspace_id: ws.id, lead_id: lead.id, direction: "inbound",
    type: msg.type, content: inboundText, automated: false, responded_at: null, wa_message_id: msg.id,
  });
  if (ie) {
    console.error("[WH-META] insert error:", ie.message);
    await logAppEvent({
      workspaceId: ws.id,
      title: "WhatsApp inbound message insert failed",
      description: JSON.stringify({ lead_id: lead.id, message_id: msg.id, error: ie.message }, null, 2),
    });
    return new Response("DB_ERROR", { status: 500 });
  }

  const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sb.from("leads")
    .update({ wa_window_expires_at: windowExpiry, has_responded: true, last_message_at: now, inbox_status: "highlighted" })
    .in("id", relatedLeadIds);

  // Fire automation without delaying Meta's webhook acknowledgement.
  runInBackground(
    dispatchAutomation(ws, lead, now)
      .catch((e: any) => console.error("[WH] automation dispatch error:", e?.message ?? e))
  );

  return new Response("EVENT_RECEIVED", { status: 200 });
});
