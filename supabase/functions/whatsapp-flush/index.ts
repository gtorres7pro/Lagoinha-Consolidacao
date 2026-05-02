import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isInternalRequest } from "../_shared/auth.ts";

const SILENCE_MS = 1800;
const GEMINI_TIMEOUT_MS = 8000;
const GEMINI_MAX_ATTEMPTS = 1;
const OPENAI_TIMEOUT_MS = 8000;
const INTER_CHUNK_DELAY_MS = 600;
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const EVOLUTION_URL = Deno.env.get("EVOLUTION_URL") ?? "https://evolution.7pro.tech";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const OUTBOUND_SEND_TIMEOUT_MS = 10000;

function metaPhone(p: string) { return p.startsWith("+") ? p.slice(1) : p; }
function evoPhone(p: string)  { return p.startsWith("+") ? p.slice(1) : p; }
function phoneDigits(p: string) { return String(p || "").replace(/\D/g, ""); }

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function kbText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(kbText).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function buildKnowledgeBaseBlock(kb: any, workspaceName?: string): string {
  const field = (...keys: string[]) => {
    for (const key of keys) {
      const value = kbText(kb?.[key]);
      if (value) return value;
    }
    return "";
  };

  const rows = [
    workspaceName ? `Igreja: ${workspaceName}` : "",
    field("nome", "name") ? `Nome configurado: ${field("nome", "name")}` : "",
    field("ia_about", "sobre", "about") ? `Sobre a igreja: ${field("ia_about", "sobre", "about")}` : "",
    field("endereco", "address") ? `Endereco: ${field("endereco", "address")}` : "",
    field("cultos", "schedule", "ia_schedule") ? `Horarios e cultos: ${field("cultos", "schedule", "ia_schedule")}` : "",
    field("pastores", "pastor", "pastors") ? `Pastores/lideranca: ${field("pastores", "pastor", "pastors")}` : "",
    field("start", "ia_consolidation", "consolidation") ? `Integracao/Start/consolidacao: ${field("start", "ia_consolidation", "consolidation")}` : "",
    field("batismo", "ia_baptism", "baptism") ? `Batismo: ${field("batismo", "ia_baptism", "baptism")}` : "",
    field("cafe_novos_membros", "novos_membros") ? `Cafe de Novos Membros: ${field("cafe_novos_membros", "novos_membros")}` : "",
    field("eventos", "events") ? `Eventos: ${field("eventos", "events")}` : "",
    field("ia_faq", "faq") ? `Perguntas frequentes: ${field("ia_faq", "faq")}` : "",
    field("ia_limits", "limits") ? `Limites da IA: ${field("ia_limits", "limits")}` : "",
    field("phone", "telefone") ? `Telefone/WhatsApp da igreja: ${field("phone", "telefone")}` : "",
    field("social", "instagram") ? `Redes sociais: ${field("social", "instagram")}` : "",
  ].filter(Boolean);

  return rows.length ? rows.join("\n") : "Sem base de conhecimento configurada.";
}

function buildAutomationContextBlock(botContext: any): string {
  const automationContext = botContext?.automation_context;
  if (!automationContext || typeof automationContext !== "object") return "";

  const rows = [
    automationContext.instruction,
    automationContext.sent_message ? `Mensagem inicial enviada por template: ${automationContext.sent_message}` : "",
    automationContext.source ? `Origem do formulario: ${automationContext.source}` : "",
    automationContext.template_name ? `Template usado: ${automationContext.template_name}` : "",
  ].filter(Boolean);

  return rows.length
    ? `\n\nCONTEXTO DA CONVERSA INICIADA POR AUTOMACAO:\n${rows.join("\n")}`
    : "";
}

function splitOutgoingMessages(text: string): string[] {
  const separator = text.includes("|||") ? "|||" : "||";
  return text.split(separator).map((s: string) => s.trim()).filter(Boolean);
}

// ── Meta send helpers ──────────────────────────────────────────────────────

async function sendTextMeta(token: string, phoneNumberId: string, phone: string, text: string): Promise<boolean> {
  const to = metaPhone(phone);
  try {
    const res = await fetchWithTimeout(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text, preview_url: false } })
    }, OUTBOUND_SEND_TIMEOUT_MS);
    if (!res.ok) console.error("WA Meta send error:", await res.text());
    return res.ok;
  } catch (e: any) {
    console.error("WA Meta send exception:", e.message);
    return false;
  }
}

async function generateElevenLabsAudio(text: string, apiKey: string): Promise<ArrayBuffer | null> {
  const voiceId = "aCGr1Q44kFHtpFJqe5Ml"; // Kamila Torres
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=2`;
  try {
    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", "accept": "audio/mpeg" },
      body: JSON.stringify({
        text, model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.35, similarity_boost: 0.85 }
      })
    }, 15000);
    if (!res.ok) { console.error("ElevenLabs failed:", await res.text()); return null; }
    return await res.arrayBuffer();
  } catch (e: any) { console.error("ElevenLabs exception:", e.message); return null; }
}

async function uploadMediaToWhatsApp(token: string, phoneId: string, audioBuffer: ArrayBuffer): Promise<string | null> {
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  formData.append("file", blob, "audio.mp3");
  try {
    const res = await fetchWithTimeout(`https://graph.facebook.com/v20.0/${phoneId}/media`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData
    }, OUTBOUND_SEND_TIMEOUT_MS);
    const data = await res.json();
    if (data.id) return data.id;
    console.error("Meta media upload failed:", data); return null;
  } catch (e: any) { console.error("Meta media upload exception:", e.message); return null; }
}

async function sendAudioMeta(token: string, phoneNumberId: string, phone: string, mediaId: string): Promise<boolean> {
  const to = metaPhone(phone);
  try {
    const res = await fetchWithTimeout(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "audio", audio: { id: mediaId } })
    }, OUTBOUND_SEND_TIMEOUT_MS);
    if (!res.ok) console.error("WA Meta audio send error:", await res.text());
    return res.ok;
  } catch (e: any) { console.error("WA Meta audio send exception:", e.message); return false; }
}

// ── Evolution send helpers ─────────────────────────────────────────────────

async function sendTextEvolution(instanceName: string, phone: string, text: string): Promise<boolean> {
  const number = evoPhone(phone);
  try {
    const res = await fetchWithTimeout(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
      body: JSON.stringify({ number, text })
    }, OUTBOUND_SEND_TIMEOUT_MS);
    if (!res.ok) { console.error("Evolution sendText error:", await res.text()); return false; }
    return true;
  } catch (e: any) { console.error("Evolution sendText exception:", e.message); return false; }
}

async function sendAudioEvolution(instanceName: string, phone: string, audioBuffer: ArrayBuffer): Promise<boolean> {
  const number = evoPhone(phone);
  // Evolution expects base64-encoded audio with mediatype
  const base64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
  try {
    const res = await fetchWithTimeout(`${EVOLUTION_URL}/message/sendMedia/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
      body: JSON.stringify({
        number,
        mediatype: "audio",
        mimetype: "audio/mpeg",
        media: base64,
        fileName: "resposta.mp3"
      })
    }, OUTBOUND_SEND_TIMEOUT_MS);
    if (!res.ok) { console.error("Evolution sendAudio error:", await res.text()); return false; }
    return true;
  } catch (e: any) { console.error("Evolution sendAudio exception:", e.message); return false; }
}

// ── Provider-agnostic send wrappers ───────────────────────────────────────

async function sendText(mode: string, creds: any, phone: string, text: string): Promise<boolean> {
  if (mode === "evolution") {
    return sendTextEvolution(creds.evolution_instance, phone, text);
  }
  const phoneNumberId = creds.phone_number_id ?? creds.phone_id;
  return sendTextMeta(creds.whatsapp_token, phoneNumberId, phone, text);
}

async function sendAudio(mode: string, creds: any, phone: string, audioBuffer: ArrayBuffer): Promise<boolean> {
  if (mode === "evolution") {
    return sendAudioEvolution(creds.evolution_instance, phone, audioBuffer);
  }
  // Meta: upload first, then send
  const phoneNumberId = creds.phone_number_id ?? creds.phone_id;
  const mediaId = await uploadMediaToWhatsApp(creds.whatsapp_token, phoneNumberId, audioBuffer);
  if (!mediaId) return false;
  return sendAudioMeta(creds.whatsapp_token, phoneNumberId, phone, mediaId);
}

// ── Validate workspace has enough creds to send ───────────────────────────

function hasValidCreds(mode: string, creds: any): boolean {
  if (mode === "evolution") {
    return !!creds?.evolution_instance && !!EVOLUTION_KEY;
  }
  return !!creds?.whatsapp_token && !!(creds?.phone_number_id || creds?.phone_id);
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!isInternalRequest(req)) return new Response("Unauthorized", { status: 401 });

  let lead_id: string;
  try {
    const b = await req.json();
    lead_id = b.lead_id;
  } catch { return new Response("Bad Request", { status: 400 }); }
  if (!lead_id) return new Response("Missing params", { status: 400 });

  await new Promise<void>(r => setTimeout(r, SILENCE_MS));

  const { data: leadRecord } = await sb.from("leads")
    .select("id, phone, workspace_id, name, llm_lock_until, bot_context, has_responded")
    .eq("id", lead_id)
    .maybeSingle();
  if (!leadRecord) return new Response("not found", { status: 404 });
  const lead = leadRecord;

  let conversationLeads: any[] = [lead];
  let conversationLeadIds: string[] = [lead.id];
  const leadPhoneDigits = phoneDigits(lead.phone);
  const searchPhone = leadPhoneDigits.slice(-10);
  if (searchPhone.length >= 7) {
    const { data: relatedLeads, error: relatedLeadsError } = await sb.from("leads")
      .select("id, phone, workspace_id, name, llm_lock_until, bot_context, has_responded, last_message_at, updated_at, created_at")
      .eq("workspace_id", lead.workspace_id)
      .ilike("phone", `%${searchPhone}%`);
    if (relatedLeadsError) {
      console.warn("[FLUSH] related lead lookup failed:", relatedLeadsError.message);
    } else if (relatedLeads?.length) {
      conversationLeads = relatedLeads;
      conversationLeadIds = [...new Set([lead.id, ...relatedLeads.map((l: any) => l.id).filter(Boolean)])];
    }
  }

  const lockActive = conversationLeads.some((l: any) => l.llm_lock_until && new Date(l.llm_lock_until) > new Date());
  if (lockActive) {
    await sb.from("messages")
      .update({ responded_at: new Date().toISOString() })
      .in("lead_id", conversationLeadIds)
      .eq("direction", "inbound")
      .is("responded_at", null);
    return new Response("human lock active", { status: 200 });
  }

  const { data: pending } = await sb.from("messages")
    .select("id, content, type, created_at")
    .in("lead_id", conversationLeadIds)
    .eq("direction", "inbound").is("responded_at", null)
    .order("created_at", { ascending: true });

  if (!pending?.length) return new Response("no pending", { status: 200 });

  const ids = pending.map((m: any) => m.id);
  const userTextCombined = pending.map((m: any) => m.content).join("\n");
  const firstPendingTime = pending[0].created_at;

  const { data: ws } = await sb.from("workspaces").select("id, name, credentials, knowledge_base").eq("id", lead.workspace_id).maybeSingle();
  const creds = ws?.credentials ?? {};
  const mode: string = creds.whatsapp_mode ?? "meta"; // "evolution" | "meta"

  // First name extraction
  let firstName = "Amigo";
  if (lead.name) firstName = lead.name.split(" ")[0];

  let outboundDelivered = false;
  let inboundMarkedResponded = false;

  async function logAppError(action: string, details: Record<string, any>) {
    try {
      await sb.from("app_logs").insert({
        workspace_id: ws?.id ?? lead.workspace_id,
        type: "error",
        title: `WhatsApp ${action}`,
        description: JSON.stringify({ lead_id, ...details }, null, 2),
        status: "pending",
        is_public: false,
      });
    } catch {
      // Logging should never block the WhatsApp response flow.
    }
  }

  async function markInboundResponded() {
    if (inboundMarkedResponded) return;
    await sb.from("messages").update({ responded_at: new Date().toISOString() }).in("id", ids);
    inboundMarkedResponded = true;
  }

  async function persistOutboundText(content: string) {
    await sb.from("messages").insert({
      workspace_id: ws!.id,
      lead_id,
      direction: "outbound",
      type: "text",
      content,
      automated: true,
      responded_at: new Date().toISOString(),
    });
  }

  async function sendOutboundText(content: string): Promise<boolean> {
    const sent = await sendText(mode, creds, lead.phone, content);
    console.log(`[FLUSH] sendText (${mode}) ${sent ? "OK" : "FAILED"}: ${content.substring(0, 80)}`);
    if (!sent) {
      await logAppError("whatsapp_send_failed", {
        lead_id,
        phone: lead.phone,
        mode,
        content_preview: content.substring(0, 160),
      });
      return false;
    }
    await persistOutboundText(content);
    outboundDelivered = true;
    await markInboundResponded();
    return true;
  }

  async function markLeadResponded(extra: Record<string, any> = {}) {
    await sb.from("leads").update({
      has_responded: true,
      last_message_at: new Date().toISOString(),
      ...extra,
    }).in("id", conversationLeadIds);
  }

  const latestLeadWithContext = [...conversationLeads]
    .filter((l: any) => l.bot_context)
    .sort((a: any, b: any) => String(b.last_message_at || b.updated_at || b.created_at || "").localeCompare(String(a.last_message_at || a.updated_at || a.created_at || "")))[0];
  const conversationBotContext = latestLeadWithContext?.bot_context ?? lead.bot_context ?? null;

  // ── CAFÉ COM PASTOR MULTI-TURN BOT ───────────────────────────────────────
  const cpCtx: any = conversationBotContext?.flow === "cafe_pastor" ? conversationBotContext : ((lead as any).bot_context ?? null);
  const EDGE = Deno.env.get("SUPABASE_URL") + "/functions/v1";
  const SRK  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  async function cpBotQuery() {
    const r = await fetch(`${EDGE}/cafe-pastor-bot-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
      body: JSON.stringify({ workspace_id: lead.workspace_id })
    });
    return r.ok ? await r.json() : { pastors: [], slots: [] };
  }

  async function cpBookAppt(slotIso: string, pastorId: string, apptType: string) {
    const r = await fetch(`${EDGE}/cafe-pastor-book`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
      body: JSON.stringify({
        workspace_id: lead.workspace_id,
        pastor_id: pastorId,
        scheduled_at: slotIso,
        appointment_type: apptType,
        requester_name: lead.name || firstName,
        requester_phone: lead.phone,
        briefing_data: { source: "whatsapp_bot" }
      })
    });
    return r.ok ? await r.json() : null;
  }

  async function cpNotifyPastor(apptId: string) {
    try {
      await fetch(`${EDGE}/cafe-pastor-notify-pastor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
        body: JSON.stringify({ appointment_id: apptId, workspace_id: lead.workspace_id })
      });
    } catch(e) { console.warn("[CP] notify-pastor failed:", e); }
  }

  async function cpSaveCtx(ctx: any | null) {
    await sb.from("leads").update({ bot_context: ctx }).in("id", conversationLeadIds);
  }

  // Helper: format a slot for display in WhatsApp
  function fmtSlot(s: any) {
    const days: Record<string,string> = { domingo:"Dom", segunda:"Seg", terça:"Ter", quarta:"Qua", quinta:"Qui", sexta:"Sex", sábado:"Sáb" };
    return `${days[s.day_label] || s.day_label} ${s.date.slice(8)} às ${s.time}`;
  }

  // ── Is cafe_pastor flow active? Check context OR freshly triggered ────────
  if (cpCtx?.flow === "cafe_pastor" && cpCtx?.step) {
    const step = cpCtx.step as string;
    const msgLower = userTextCombined.toLowerCase().trim();

    // ── Step: awaiting_type ─────────────────────────────────────────────────
    if (step === "awaiting_type") {
      let apptType = "both";
      if (/presencial|pessoalmente|igreja|em pessoa/.test(msgLower)) apptType = "inperson";
      else if (/online|virtual|vídeo|video|zoom|meet/.test(msgLower)) apptType = "online";

      // Fetch pastors
      const { pastors, slots } = await cpBotQuery();
      const activePastors = (pastors as any[]).filter((p: any) =>
        apptType === "both" ? true :
        slots.some((s: any) => s.pastor_id === p.id && (s.session_type === apptType || s.session_type === "both"))
      );

      if (!activePastors.length) {
        await cpSaveCtx(null);
        const outMsg = "Hmm, no momento não há pastores com horários disponíveis para esse tipo de sessão. 😕 Que tal tentar de forma diferente ou falar com nosso time? ☕";
        if (await sendOutboundText(outMsg)) {
          await markLeadResponded();
        }
        return new Response(JSON.stringify({ ok: true, cp_step: "no_pastors" }), { status: 200 });
      }

      // Show pastor list
      const pastorList = activePastors.map((p: any, i: number) => `${i+1}. ${p.display_name}`).join("\\n");
      const outMsg = `Ótimo! Que tipo de sessão prefere: *presencial* ou *online*? Aqui estão os pastores disponíveis:

${pastorList}

Responda com o número ou nome do pastor. 👆`;
      
      if (await sendOutboundText(outMsg)) {
        await cpSaveCtx({ flow: "cafe_pastor", step: "awaiting_pastor", appointment_type: apptType, pastors: activePastors });
        await markLeadResponded();
      }
      return new Response(JSON.stringify({ ok: true, cp_step: "awaiting_pastor" }), { status: 200 });
    }

    // ── Step: awaiting_pastor ───────────────────────────────────────────────
    if (step === "awaiting_pastor") {
      const storedPastors: any[] = cpCtx.pastors || [];
      const apptType: string = cpCtx.appointment_type || "both";

      // Try to match pastor by number or name
      let chosenPastor: any = null;
      const numMatch = msgLower.match(/^(\d+)/);
      if (numMatch) {
        const idx = parseInt(numMatch[1]) - 1;
        if (idx >= 0 && idx < storedPastors.length) chosenPastor = storedPastors[idx];
      }
      if (!chosenPastor) {
        chosenPastor = storedPastors.find((p: any) => msgLower.includes(p.display_name.split(" ")[0].toLowerCase()));
      }
      // "tanto faz" / "qualquer" → pick first
      if (!chosenPastor && /tanto faz|qualquer|nao importa|não importa|qualquer um/.test(msgLower)) {
        chosenPastor = storedPastors[0];
      }

      if (!chosenPastor) {
        // Didn't understand — re-ask
        const list = storedPastors.map((p: any, i: number) => `${i+1}. ${p.display_name}`).join("\\n");
        const outMsg = `Não consegui identificar o pastor. Digite o *número* ou *nome*:

${list}`;
        if (await sendOutboundText(outMsg)) {
          await markLeadResponded();
        }
        return new Response(JSON.stringify({ ok: true, cp_step: "re-ask_pastor" }), { status: 200 });
      }

      // Get available slots for this pastor
      const { slots } = await cpBotQuery();
      const pastoSlots = (slots as any[]).filter((s: any) =>
        s.pastor_id === chosenPastor.id &&
        (apptType === "both" || s.session_type === apptType || s.session_type === "both")
      ).slice(0, 5);

      if (!pastoSlots.length) {
        await cpSaveCtx(null);
        const outMsg = `😕 ${chosenPastor.display_name} não tem horários disponíveis nos próximos dias. Gostaria de escolher outro pastor? Diga *sim* para recomeçar, ou acesse o link: https://zelo.7prolabs.com/cafe-pastor.html?ws=${lead.workspace_id}`;
        if (await sendOutboundText(outMsg)) {
          await markLeadResponded();
        }
        return new Response(JSON.stringify({ ok: true, cp_step: "no_slots" }), { status: 200 });
      }

      const slotList = pastoSlots.map((s: any, i: number) => `${i+1}. ${fmtSlot(s)}`).join("\\n");
      const outMsg = `Ótimo! Aqui estão os horários disponíveis com ${chosenPastor.display_name}:

${slotList}

Digite o *número* do horário desejado. 📅`;
      if (await sendOutboundText(outMsg)) {
        await cpSaveCtx({ flow: "cafe_pastor", step: "awaiting_slot", pastor_id: chosenPastor.id, pastor_name: chosenPastor.display_name, appointment_type: apptType, slots: pastoSlots });
        await markLeadResponded();
      }
      return new Response(JSON.stringify({ ok: true, cp_step: "awaiting_slot" }), { status: 200 });
    }

    // ── Step: awaiting_slot ─────────────────────────────────────────────────
    if (step === "awaiting_slot") {
      const storedSlots: any[] = cpCtx.slots || [];
      const pastorId: string = cpCtx.pastor_id;
      const pastorName: string = cpCtx.pastor_name || "o pastor";
      const apptType: string = cpCtx.appointment_type || "both";

      const numMatch = userTextCombined.trim().match(/^(\d+)/);
      const idx = numMatch ? parseInt(numMatch[1]) - 1 : -1;

      if (idx < 0 || idx >= storedSlots.length) {
        const slotList = storedSlots.map((s: any, i: number) => `${i+1}. ${fmtSlot(s)}`).join("\\n");
        const outMsg = `Por favor, escolha o *número* de um dos horários:

${slotList}`;
        if (await sendOutboundText(outMsg)) {
          await markLeadResponded();
        }
        return new Response(JSON.stringify({ ok: true, cp_step: "re-ask_slot" }), { status: 200 });
      }

      const chosen = storedSlots[idx];
      // Confirm step
      const finalType = apptType === "both" ? chosen.session_type : apptType;
      const typeLabel = finalType === "inperson" ? "🏛️ Presencial" : "💻 Online";
      const outMsg = `Perfeito! Confirmo seu agendamento:

☕ *Café com Pastor*
👤 Pastor: *${pastorName}*
📅 Data: *${fmtSlot(chosen)}*
${typeLabel}

Confirma? (Sim / Não)`;
      if (await sendOutboundText(outMsg)) {
        await cpSaveCtx({ flow: "cafe_pastor", step: "awaiting_confirm", pastor_id: pastorId, pastor_name: pastorName, slot: chosen, appointment_type: finalType });
        await markLeadResponded();
      }
      return new Response(JSON.stringify({ ok: true, cp_step: "awaiting_confirm" }), { status: 200 });
    }

    // ── Step: awaiting_confirm ──────────────────────────────────────────────
    if (step === "awaiting_confirm") {
      const msgLower = userTextCombined.toLowerCase().trim();
      const isYes = /^s(im)?|^yes|confirm|ok|isso|exato|certo/.test(msgLower);
      const isNo  = /^n(ao|ão)?|^no|cancel|errado|nao quero|não quero/.test(msgLower);

      if (isNo) {
        await cpSaveCtx(null);
        const outMsg = `Tudo bem! Seu agendamento foi cancelado. Se quiser reagendar, é só falar comigo! 😊☕`;
        if (await sendOutboundText(outMsg)) {
          await markLeadResponded();
        }
        return new Response(JSON.stringify({ ok: true, cp_step: "cancelled" }), { status: 200 });
      }

      if (!isYes) {
        const outMsg = `Confirma o agendamento com ${cpCtx.pastor_name}? Responda *Sim* ou *Não*.`;
        if (await sendOutboundText(outMsg)) {
          await markLeadResponded();
        }
        return new Response(JSON.stringify({ ok: true, cp_step: "re-ask_confirm" }), { status: 200 });
      }

      // ── BOOK IT ────────────────────────────────────────────────────────────
      const result = await cpBookAppt(cpCtx.slot.slot_iso, cpCtx.pastor_id, cpCtx.appointment_type);
      await cpSaveCtx(null); // Clear state

      if (!result?.ok) {
        const outMsg = `Ops! Houve um erro ao confirmar o agendamento. 😕 Por favor, tente pelo link: https://zelo.7prolabs.com/cafe-pastor.html?ws=${lead.workspace_id}`;
        if (await sendOutboundText(outMsg)) {
          await markLeadResponded();
        }
        return new Response(JSON.stringify({ ok: true, cp_step: "book_error" }), { status: 200 });
      }

      // Notify pastor in background
      if (result.appointment?.id) {
        cpNotifyPastor(result.appointment.id).catch(() => {});
      }

      const slot = cpCtx.slot;
      const typeLabel = cpCtx.appointment_type === "inperson" ? "🏛️ Presencialmente" : "💻 Online";
      const outMsg = `✅ *Agendamento confirmado!* Que alegria, ${firstName}!

☕ *Café com Pastor*
👤 ${cpCtx.pastor_name}
📅 ${fmtSlot(slot)}
${typeLabel}

O pastor receberá uma notificação. Qualquer dúvida, pode nos chamar aqui! 🙏`;

      if (await sendOutboundText(outMsg)) {
        await markLeadResponded({ inbox_status: "highlighted", inbox_priority: "cafe_pastor" });
      }
      return new Response(JSON.stringify({ ok: true, cp_step: "booked", appointment: result.appointment }), { status: 200 });
    }
  }
  // ── END CAFÉ COM PASTOR MULTI-TURN ────────────────────────────────────────

  // ── Guard: IA must be active ─────────────────────────────────────────────
  if (creds.ia_active === false) {
    console.log(`[FLUSH] ia_active=false for workspace=${ws?.id} — skipping`);
    return new Response("ia_inactive", { status: 200 });
  }

  // ── Guard: need valid send credentials ───────────────────────────────────
  if (!hasValidCreds(mode, creds)) {
    console.error(`[FLUSH] workspace=${ws?.id} mode=${mode} — missing send credentials`);
    return new Response("no creds", { status: 500 });
  }

  const geminiKey: string = creds?.llm_config?.gemini_token
    ?? Deno.env.get("GEMINI_API_KEY")
    ?? Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")
    ?? "";
  const openAiKey: string = creds?.llm_config?.openai_token
    ?? creds?.llm_config?.openai_api_key
    ?? Deno.env.get("OPENAI_API_KEY")
    ?? "";
  const iaMemoryEnabled: boolean = creds?.ia_memory_enabled !== false; // default on
  const configuredMemoryLimit = Number(creds?.llm_config?.memory_limit ?? 6);
  const memoryLimit = iaMemoryEnabled ? Math.max(0, Math.min(Number.isFinite(configuredMemoryLimit) ? configuredMemoryLimit : 6, 12)) : 0;

  console.log(`[FLUSH] mode=${mode} lead=${lead.id} related=${conversationLeadIds.length} memory=${iaMemoryEnabled ? memoryLimit : 0} gemini=${!!geminiKey} openai=${!!openAiKey}`);

  // ── Build conversation history ────────────────────────────────────────────
  let historyRecords: any[] = [];
  if (memoryLimit > 0) {
    const { data } = await sb.from("messages")
      .select("direction, content")
      .in("lead_id", conversationLeadIds)
      .lt("created_at", firstPendingTime)
      .order("created_at", { ascending: false })
      .limit(memoryLimit);
    historyRecords = data ?? [];
  }

  const contents: any[] = [];
  if (historyRecords.length) {
    historyRecords.reverse().forEach((m: any) => {
      if (m.content) contents.push({ role: m.direction === "inbound" ? "user" : "model", parts: [{ text: m.content }] });
    });
  }
  contents.push({ role: "user", parts: [{ text: userTextCombined }] });

  // Current date/time context (Eastern Time — relevant for Orlando)
  const orlandoTime = new Date().toLocaleString("pt-BR", {
    timeZone: "America/New_York",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
  const dateContext = `DATA/HORA ATUAL (Eastern Time, Orlando): ${orlandoTime}`;

  const JSON_OUTPUT_FORMAT = `\n\n---\nFORMATO DE SAIDA OBRIGATORIO (JSON PURO):\nResponda APENAS com JSON valido, sem markdown, sem texto extra antes ou depois:\n{\n  "whatsapp_reply": "Sua resposta oficial em texto (use ||| para separar multiplas mensagens)",\n  "whatsapp_audio_script": "Se o usuario mandou [ÁUDIO TRANSCRITO], escreva aqui uma versao adaptada para TTS (coloquial, fala humana, diga 'o link que mandei no texto abaixo'). Sendo nulo se não houver áudio.",\n  "whatsapp_text_complement": "Se gerou audio E houver LINKS, coloque apenas os LINKS ou infos clicaveis aqui para irem como texto de acompanhamento. Se nao houver audio ou link, envie null.",\n  "detected_intention": "none | escalation | batismo | voluntariado | wecare | cafe_pastor"\n}\n\nMapeamento detected_intention:\n- escalation: pastor, aconselhamento, oracao urgente, contato humano\n- cafe_pastor: quer falar com pastor, agendar cafe com pastor, agendamento pastoral\n- batismo: quer se batizar ou info de batismo\n- voluntariado: quer ser voluntario ou servir\n- wecare: quer GC, Start, conexao comunitaria\n- none: saudacao simples ou pergunta informativa\n\nNAO use tags [ACAO:...]. Use EXCLUSIVAMENTE o JSON acima.`;
  const knowledgeBaseBlock = buildKnowledgeBaseBlock(ws?.knowledge_base ?? {}, ws?.name);
  const KNOWLEDGE_BASE_SECTION = `\n\nBASE DE CONHECIMENTO DA IGREJA:\n${knowledgeBaseBlock}\n\nUse a base acima como fonte principal. Se algo nao estiver nela, responda com cuidado e ofereca ajuda humana.`;
  const AUTOMATION_CONTEXT_SECTION = buildAutomationContextBlock(conversationBotContext);

  // ── Build system instruction ──────────────────────────────────────────────
  // Priority: ia_system_prompt from credentials > ju_prompt from KB > built-in default
  let systemInstruction: string;
  const customIaPrompt: string | null = creds.ia_system_prompt ?? null;
  const customJuPrompt: string | undefined = ws?.knowledge_base?.ju_prompt;

  if (customIaPrompt) {
    // Workspace-specific IA prompt configured via Automações > IA Atendente
    systemInstruction = dateContext + "\n\n" + customIaPrompt + KNOWLEDGE_BASE_SECTION + AUTOMATION_CONTEXT_SECTION + JSON_OUTPUT_FORMAT;
    systemInstruction = systemInstruction
      .replace(/\{firstName\}/g, firstName)
      .replace(/\{NOME\}/g, firstName);
    console.log(`[FLUSH] using ia_system_prompt from credentials`);
  } else if (customJuPrompt) {
    // Legacy KB ju_prompt
    systemInstruction = dateContext + "\n\n" + customJuPrompt + KNOWLEDGE_BASE_SECTION + AUTOMATION_CONTEXT_SECTION + JSON_OUTPUT_FORMAT;
    systemInstruction = systemInstruction
      .replace(/\{firstName\}/g, firstName)
      .replace(/\{NOME\}/g, firstName);
    console.log(`[FLUSH] using ju_prompt from knowledge_base`);
  } else {
    // Built-in default + KB fields
    systemInstruction = `${dateContext}\n\nVocê é a **Ju**, a assistente virtual e recepcionista exclusiva desta igreja no WhatsApp. Nome do usuário: ${firstName}.\nDIRETRIZES: Amigável, calorosa, humana. Máximo 3 linhas por mensagem. Use ||| para separar múltiplas mensagens.${KNOWLEDGE_BASE_SECTION}${AUTOMATION_CONTEXT_SECTION}` + JSON_OUTPUT_FORMAT;
    console.log(`[FLUSH] using built-in default prompt (Ju)`);
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { response_mime_type: "application/json", maxOutputTokens: 500 }
  };

  // ── Call OpenAI first, then Gemini as fallback ────────────────────────────
  const primaryGeminiModel = creds?.llm_config?.gemini_model ?? "gemini-2.0-flash";
  const fallbackGeminiModel = creds?.llm_config?.gemini_fallback_model ?? "gemini-2.5-flash";
  const geminiModels = [...new Set([primaryGeminiModel, fallbackGeminiModel].filter(Boolean))];
  const openAiModel = creds?.llm_config?.openai_model ?? "gpt-4.1-mini";
  let finalReply = "⚠️ Nenhum provedor de IA respondeu.";
  let detectedIntention = "none";
  let audioScript: string | null = null;
  let audioComplement: string | null = null;

  function consumeJsonResponse(rawText: string, providerLabel: string) {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsedJSON = JSON.parse(cleaned);
    if (parsedJSON.whatsapp_reply) {
      finalReply = parsedJSON.whatsapp_reply;
    } else {
      finalReply = `⚠️ ${providerLabel} não retornou 'whatsapp_reply'. Raw: ${cleaned.substring(0, 250)}`;
    }
    audioScript = parsedJSON.whatsapp_audio_script || null;
    audioComplement = parsedJSON.whatsapp_text_complement || null;
    detectedIntention = parsedJSON.detected_intention || "none";
  }

  const openAiMessages = contents.map((c: any) => ({
    role: c.role === "model" ? "assistant" : "user",
    content: c.parts[0].text
  }));

  if (!openAiKey) {
    console.error("[FLUSH] no OpenAI key available — trying Gemini fallback");
    finalReply = "⚠️ OpenAI token ausente.";
  } else {
    try {
      console.log(`[FLUSH] trying OpenAI primary model=${openAiModel}`);
      const openAiBody: Record<string, any> = {
        model: openAiModel,
        messages: [
          { role: "system", content: systemInstruction },
          ...openAiMessages
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      };
      if (/^(gpt-5|o\d)/.test(openAiModel)) {
        openAiBody.max_completion_tokens = 500;
      } else {
        openAiBody.max_tokens = 500;
      }

      const openAiRes = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openAiKey}`
        },
        body: JSON.stringify(openAiBody)
      }, OPENAI_TIMEOUT_MS);

      const raw = await openAiRes.text();
      if (openAiRes.ok) {
        const oData = JSON.parse(raw);
        const replyText = oData.choices?.[0]?.message?.content;
        if (replyText) {
          consumeJsonResponse(replyText, "OpenAI");
        } else {
          finalReply = "⚠️ OpenAI sem texto.";
        }
      } else {
        finalReply = `⚠️ OpenAI falhou. HTTP ${openAiRes.status}. Raw: ${raw.substring(0, 250)}`;
        console.error("[FLUSH] OpenAI HTTP error:", raw.substring(0, 300));
      }
    } catch (e: any) {
      finalReply = `⚠️ OpenAI exception: ${e.message}`;
      console.error("[FLUSH] OpenAI primary failed:", e?.message ?? e);
    }
  }

  if (finalReply.startsWith("⚠️") && !geminiKey) {
    console.error("[FLUSH] no Gemini key available for fallback");
  } else if (finalReply.startsWith("⚠️")) {
    console.log(`[FLUSH] OpenAI unavailable/failed. Falling back to Gemini...`);
    for (const model of geminiModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

        let retries = GEMINI_MAX_ATTEMPTS;
        let delay = 600;

        while (retries > 0) {
          try {
            const res = await fetchWithTimeout(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }, GEMINI_TIMEOUT_MS);

            const rawBody = await res.text();
            if (res.ok) {
              try {
                const j = JSON.parse(rawBody);
                const rawText = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
                const finishReason = j?.candidates?.[0]?.finishReason ?? "unknown";
                if (rawText) {
                  try {
                    consumeJsonResponse(rawText, "Gemini");
                  } catch (e: any) {
                    console.log("LLM non-JSON:", rawText.substring(0, 200));
                    finalReply = `⚠️ Gemini retornou JSON inválido: ${e.message}`;
                  }
                } else {
                  finalReply = `⚠️ LLM sem texto. finishReason: ${finishReason}. Raw: ${rawBody.substring(0, 250)}`;
                }
              } catch (e: any) {
                finalReply = `⚠️ Falha no parse do Gemini. Erro: ${e.message}`;
                console.error("Gemini parse error:", e.message);
              }
              break; // Success, exit retry loop
            } else {
              if (res.status === 503 || res.status === 429 || res.status >= 500) {
                console.error(`Gemini ${model} HTTP ${res.status}. Retrying in ${delay}ms...`);
                retries--;
                if (retries === 0) {
                  finalReply = `⚠️ Gemini ${model} falhou após retentativas. HTTP ${res.status}. Raw: ${rawBody.substring(0, 250)}`;
                  console.error("Gemini API error:", rawBody.substring(0, 300));
                } else {
                  await new Promise(resolve => setTimeout(resolve, delay));
                  delay *= 2;
                  continue;
                }
              } else {
                finalReply = `⚠️ Gemini ${model} falhou. HTTP ${res.status}. Raw: ${rawBody.substring(0, 250)}`;
                console.error("Gemini API error:", rawBody.substring(0, 300));
                break;
              }
            }
          } catch (e: any) {
            if (e.name === "AbortError" || e.message.includes("fetch")) {
              console.error(`Gemini ${model} ${e.name}. Retrying in ${delay}ms...`);
              retries--;
              if (retries === 0) {
                finalReply = `⚠️ Gemini ${model} Error após retentativas: ${e.message}`;
              } else {
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                continue;
              }
            } else {
              finalReply = `⚠️ Gemini ${model} Fetch Error: ${e.message}`;
              console.error("Gemini fetch error:", e.message);
              break;
            }
          }
        }
      } catch (e: any) {
        finalReply = `⚠️ Gemini ${model} outer error: ${e.message}`;
        console.error("Outer error:", e.message);
      }
      if (!finalReply.startsWith("⚠️")) break;
      console.warn(`[FLUSH] Gemini model ${model} failed; trying next available model if configured.`);
    }
  }

  // ── Send response ─────────────────────────────────────────────────────────
  const isError = finalReply.startsWith("⚠️");
  if (isError) {
    // Log technical error to app_logs so it doesn't appear as a sent WhatsApp message
    await logAppError("flush_generation_error", { reason: finalReply });
    // Send friendly fallback to user
    finalReply = "Opa, minha inteligência artificial teve um pequeno engasgo de conexão agora. Pode me mandar um 'Oi' novamente em um minutinho? 😊";
  }

  let chunks = splitOutgoingMessages(finalReply);

  const hasAudio = pending.some((m: any) => m.type === "audio");
  const elevenLabsKey = creds?.llm_config?.elevenlabs_token;
  let audioSent = false;

  if (hasAudio && elevenLabsKey && audioScript) {
    console.log("[TTS] Audio detected and script generated. Calling ElevenLabs TTS...");
    const audioBuffer = await generateElevenLabsAudio(audioScript, elevenLabsKey);
    if (audioBuffer) {
      console.log(`[TTS] Sending audio via ${mode}...`);
      const sent = await sendAudio(mode, creds, lead.phone, audioBuffer);
      if (sent) {
        audioSent = true;
        await sb.from("messages").insert({
          workspace_id: ws!.id, lead_id,
          direction: "outbound", type: "audio",
          content: `[ÁUDIO GERADO]: ${audioScript}`, automated: true,
          responded_at: new Date().toISOString(),
        });
        outboundDelivered = true;
        await markInboundResponded();
      } else { console.warn("[TTS] Audio send failed. Falling back to text."); }
    } else { console.warn("[TTS] ElevenLabs failed. Falling back to text."); }
  }

  if (audioSent) {
    chunks = audioComplement
      ? splitOutgoingMessages(audioComplement)
      : [];
  }

  for (const chunk of chunks) {
    if (!chunk) continue;
    await sendOutboundText(chunk);
    if (chunks.length > 1) await new Promise<void>(r => setTimeout(r, INTER_CHUNK_DELAY_MS));
  }

  if (!outboundDelivered) {
    await logAppError("flush_no_outbound_delivered", {
      lead_id,
      pending_ids: ids,
      mode,
      chunks: chunks.length,
    });
    return new Response(JSON.stringify({ ok: false, error: "no_outbound_delivered", processed: 0, mode }), { status: 502 });
  }

  // ─── KANBAN AUTOMATION ────────────────────────────────────────────────────
  if (detectedIntention && detectedIntention !== "none") {
    // ── If cafe_pastor detected: start the booking flow ───────────────────────
    if (detectedIntention === "cafe_pastor") {
      const { pastors, slots } = await cpBotQuery();
      const activePastors = pastors as any[];
      if (!activePastors.length) {
        const pubLink = `https://zelo.7prolabs.com/cafe-pastor.html?ws=${lead.workspace_id}`;
        const noMsg = `Olá ${firstName}! Adoramos a ideia de um Café com Pastor! ☕ No momento estamos organizando os horários. Acesse o link para agendar: ${pubLink}`;
        if (await sendOutboundText(noMsg)) {
          await markLeadResponded();
        }
        return new Response(JSON.stringify({ ok: true, cp_step: "no_pastors_initial" }), { status: 200 });
      }
      // Start flow: ask type
      const pastorList = activePastors.map((p: any, i: number) => `${i+1}. ${p.display_name}`).join("\\n");
      const startMsg = `Olá ${firstName}! Que boa iniciativa — adoramos o Café com Pastor! ☕

Temos os seguintes pastores disponíveis:

${pastorList}

Primeiro: prefere uma sessão *presencial* na igreja ou *online* (vídeo chamada)?`;
      if (await sendOutboundText(startMsg)) {
        await cpSaveCtx({ flow: "cafe_pastor", step: "awaiting_type" });
        await markLeadResponded({ inbox_status: "highlighted", inbox_priority: "cafe_pastor" });
      }
      return new Response(JSON.stringify({ ok: true, cp_step: "started" }), { status: 200 });
    }

    const titles: Record<string, string> = {
      "escalation": "Aconselhamento / Contato Pastoral",
      "batismo": "Deseja se Batizar",
      "voluntariado": "Deseja Servir (Voluntariado)",
      "wecare": "Informação START/GC (WeCare)"
    };
    const title = titles[detectedIntention] || "Nova Interação de Interesse";

    const { data: adminUser } = await sb.from("users").select("id, email, name")
      .eq("workspace_id", lead.workspace_id).eq("role", "church_admin").limit(1).maybeSingle();
    let createdById = adminUser?.id;
    if (!createdById) {
      const { data: anyUser } = await sb.from("users").select("id").eq("workspace_id", lead.workspace_id).limit(1).maybeSingle();
      createdById = anyUser?.id;
    }

    await sb.from("tasks").insert({
      workspace_id: lead.workspace_id, title,
      description: `Lead ${firstName} (${lead.phone}) — gatilho automático via IA.\nIntenção: ${detectedIntention}\n\nMensagem:\n${userTextCombined}`,
      status: "todo", source: "internal",
      created_by: createdById, assigned_to: adminUser?.id ?? null,
      requester_name: lead.name, requester_phone: lead.phone,
      priority: detectedIntention === "escalation" ? "high" : "medium"
    }).then(({ error }) => { if (error) console.error("Kanban error:", error); });

    const leadUpdate: Record<string, boolean> = {};
    if (detectedIntention === "batismo") leadUpdate.task_batismo = false;
    if (detectedIntention === "escalation") leadUpdate.task_followup = false;
    if (detectedIntention === "wecare") leadUpdate.task_start = false;
    if (Object.keys(leadUpdate).length > 0) await sb.from("leads").update(leadUpdate).in("id", conversationLeadIds);

    // Email escalation alert
    if (detectedIntention === "escalation" && adminUser?.email) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey && creds?.notifications?.email_pastor !== false) {
        const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f4f4f5;padding:40px 20px">
<table width="600" style="background:#fff;border-radius:16px;overflow:hidden;margin:0 auto">
  <tr><td style="background:#111;padding:30px;text-align:center"><h2 style="color:#FFD700;margin:0">ALERTA PASTORAL</h2></td></tr>
  <tr><td style="padding:40px 30px">
    <p>Olá <b>${adminUser.name || "Líder"}</b>,</p>
    <p>O lead <b>${firstName}</b> (${lead.phone}) solicitou suporte pastoral.</p>
    <div style="background:#fcfcfc;border-left:4px solid #FFD700;padding:20px;margin:20px 0">
      <p style="margin:0;color:#666;font-size:12px;text-transform:uppercase">Mensagem:</p>
      <p style="margin:8px 0 0;font-style:italic">"${userTextCombined.replace(/\n/g, "<br>")}"</p>
    </div>
    <a href="https://zelo.7prolabs.com" style="display:inline-block;background:#FFD700;color:#111;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none">Acessar Painel HUB</a>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #eee">
    <p style="margin:0;color:#888;font-size:12px">Alerta automático — <b>Zelo Pro</b></p>
  </td></tr>
</table></body></html>`;
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "Zelo Pro <equipe@7pro.tech>", to: adminUser.email, subject: `⚠️ Alerta Pastoral — ${firstName}`, html })
        }).catch(e => console.error("Resend error:", e));
      }
    }
  }

  // ── Update lead inbox fields ──────────────────────────────────────────────
  const inboxUpdate: Record<string, any> = {
    has_responded: true,
    last_message_at: new Date().toISOString(),
  };
  if (detectedIntention && detectedIntention !== "none") {
    inboxUpdate.inbox_priority = detectedIntention;
    inboxUpdate.inbox_status = "highlighted";
  } else if (!lead.has_responded) {
    inboxUpdate.inbox_status = "neutral";
  }
  await sb.from("leads").update(inboxUpdate).in("id", conversationLeadIds);

  return new Response(JSON.stringify({ ok: true, processed: ids.length, intention: detectedIntention, mode }), { status: 200 });
});
