import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SILENCE_MS = 5000;
const GEMINI_TIMEOUT_MS = 25000;
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const EVOLUTION_URL = Deno.env.get("EVOLUTION_URL") ?? "https://evolution.7pro.tech";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

function metaPhone(p: string) { return p.startsWith("+") ? p.slice(1) : p; }
function evoPhone(p: string)  { return p.startsWith("+") ? p.slice(1) : p; }

// ── Meta send helpers ──────────────────────────────────────────────────────

async function sendTextMeta(token: string, phoneNumberId: string, phone: string, text: string): Promise<boolean> {
  const to = metaPhone(phone);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text, preview_url: false } })
    });
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
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", "accept": "audio/mpeg" },
      body: JSON.stringify({
        text, model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.35, similarity_boost: 0.85 }
      })
    });
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
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/media`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData
    });
    const data = await res.json();
    if (data.id) return data.id;
    console.error("Meta media upload failed:", data); return null;
  } catch (e: any) { console.error("Meta media upload exception:", e.message); return null; }
}

async function sendAudioMeta(token: string, phoneNumberId: string, phone: string, mediaId: string): Promise<boolean> {
  const to = metaPhone(phone);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "audio", audio: { id: mediaId } })
    });
    if (!res.ok) console.error("WA Meta audio send error:", await res.text());
    return res.ok;
  } catch (e: any) { console.error("WA Meta audio send exception:", e.message); return false; }
}

// ── Evolution send helpers ─────────────────────────────────────────────────

async function sendTextEvolution(instanceName: string, phone: string, text: string): Promise<boolean> {
  const number = evoPhone(phone);
  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
      body: JSON.stringify({ number, text })
    });
    if (!res.ok) { console.error("Evolution sendText error:", await res.text()); return false; }
    return true;
  } catch (e: any) { console.error("Evolution sendText exception:", e.message); return false; }
}

async function sendAudioEvolution(instanceName: string, phone: string, audioBuffer: ArrayBuffer): Promise<boolean> {
  const number = evoPhone(phone);
  // Evolution expects base64-encoded audio with mediatype
  const base64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendMedia/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
      body: JSON.stringify({
        number,
        mediatype: "audio",
        mimetype: "audio/mpeg",
        media: base64,
        fileName: "resposta.mp3"
      })
    });
    if (!res.ok) { console.error("Evolution sendAudio error:", await res.text()); return false; }
    return true;
  } catch (e: any) { console.error("Evolution sendAudio exception:", e.message); return false; }
}

// ── Provider-agnostic send wrappers ───────────────────────────────────────

async function sendText(mode: string, creds: any, phone: string, text: string): Promise<boolean> {
  if (mode === "evolution") {
    return sendTextEvolution(creds.evolution_instance, phone, text);
  }
  return sendTextMeta(creds.whatsapp_token, creds.phone_number_id, phone, text);
}

async function sendAudio(mode: string, creds: any, phone: string, audioBuffer: ArrayBuffer): Promise<boolean> {
  if (mode === "evolution") {
    return sendAudioEvolution(creds.evolution_instance, phone, audioBuffer);
  }
  // Meta: upload first, then send
  const mediaId = await uploadMediaToWhatsApp(creds.whatsapp_token, creds.phone_number_id, audioBuffer);
  if (!mediaId) return false;
  return sendAudioMeta(creds.whatsapp_token, creds.phone_number_id, phone, mediaId);
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

  let lead_id: string, message_created_at: string;
  try {
    const b = await req.json();
    lead_id = b.lead_id; message_created_at = b.message_created_at;
  } catch { return new Response("Bad Request", { status: 400 }); }
  if (!lead_id) return new Response("Missing params", { status: 400 });

  await new Promise<void>(r => setTimeout(r, SILENCE_MS));

  const { data: newer } = await sb.from("messages")
    .select("id").eq("lead_id", lead_id).eq("direction", "inbound")
    .gt("created_at", message_created_at).limit(1);
  if (newer?.length) return new Response("skipped", { status: 200 });

  const { data: lead } = await sb.from("leads").select("id, phone, workspace_id, name, llm_lock_until, bot_context").eq("id", lead_id).maybeSingle();
  if (!lead) return new Response("not found", { status: 404 });

  if (lead.llm_lock_until && new Date(lead.llm_lock_until) > new Date()) {
    return new Response("human lock active", { status: 200 });
  }

  const { data: pending } = await sb.from("messages")
    .select("id, content, type, created_at")
    .eq("lead_id", lead_id)
    .eq("direction", "inbound").is("responded_at", null)
    .order("created_at", { ascending: true });

  if (!pending?.length) return new Response("no pending", { status: 200 });

  const ids = pending.map((m: any) => m.id);
  const userTextCombined = pending.map((m: any) => m.content).join("\n");
  const firstPendingTime = pending[0].created_at;

  await sb.from("messages").update({ responded_at: new Date().toISOString() }).in("id", ids);

  const { data: ws } = await sb.from("workspaces").select("id, credentials, knowledge_base").eq("id", lead.workspace_id).maybeSingle();

  // ── CAFÉ COM PASTOR MULTI-TURN BOT ───────────────────────────────────────
  const cpCtx: any = (lead as any).bot_context ?? null;
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
    await sb.from("leads").update({ bot_context: ctx }).eq("id", lead.id);
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
        await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
        await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
        await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
        return new Response(JSON.stringify({ ok: true, cp_step: "no_pastors" }), { status: 200 });
      }

      // Show pastor list
      const pastorList = activePastors.map((p: any, i: number) => `${i+1}. ${p.display_name}`).join("
");
      const outMsg = `Ótimo! Que tipo de sessão prefere: *presencial* ou *online*? Aqui estão os pastores disponíveis:

${pastorList}

Responda com o número ou nome do pastor. 👆`;
      
      await cpSaveCtx({ flow: "cafe_pastor", step: "awaiting_pastor", appointment_type: apptType, pastors: activePastors });
      await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
      await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
      await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
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
        const list = storedPastors.map((p: any, i: number) => `${i+1}. ${p.display_name}`).join("
");
        const outMsg = `Não consegui identificar o pastor. Digite o *número* ou *nome*:

${list}`;
        await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
        await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
        await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
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
        await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
        await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
        await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
        return new Response(JSON.stringify({ ok: true, cp_step: "no_slots" }), { status: 200 });
      }

      const slotList = pastoSlots.map((s: any, i: number) => `${i+1}. ${fmtSlot(s)}`).join("
");
      const outMsg = `Ótimo! Aqui estão os horários disponíveis com ${chosenPastor.display_name}:

${slotList}

Digite o *número* do horário desejado. 📅`;
      await cpSaveCtx({ flow: "cafe_pastor", step: "awaiting_slot", pastor_id: chosenPastor.id, pastor_name: chosenPastor.display_name, appointment_type: apptType, slots: pastoSlots });
      await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
      await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
      await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
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
        const slotList = storedSlots.map((s: any, i: number) => `${i+1}. ${fmtSlot(s)}`).join("
");
        const outMsg = `Por favor, escolha o *número* de um dos horários:

${slotList}`;
        await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
        await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
        await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
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
      await cpSaveCtx({ flow: "cafe_pastor", step: "awaiting_confirm", pastor_id: pastorId, pastor_name: pastorName, slot: chosen, appointment_type: finalType });
      await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
      await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
      await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
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
        await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
        await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
        await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
        return new Response(JSON.stringify({ ok: true, cp_step: "cancelled" }), { status: 200 });
      }

      if (!isYes) {
        const outMsg = `Confirma o agendamento com ${cpCtx.pastor_name}? Responda *Sim* ou *Não*.`;
        await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
        await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
        await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
        return new Response(JSON.stringify({ ok: true, cp_step: "re-ask_confirm" }), { status: 200 });
      }

      // ── BOOK IT ────────────────────────────────────────────────────────────
      const result = await cpBookAppt(cpCtx.slot.slot_iso, cpCtx.pastor_id, cpCtx.appointment_type);
      await cpSaveCtx(null); // Clear state

      if (!result?.ok) {
        const outMsg = `Ops! Houve um erro ao confirmar o agendamento. 😕 Por favor, tente pelo link: https://zelo.7prolabs.com/cafe-pastor.html?ws=${lead.workspace_id}`;
        await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
        await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
        await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
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

      await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, outMsg);
      await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: outMsg, automated: true, responded_at: new Date().toISOString() });
      await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString(), inbox_status: "highlighted", inbox_priority: "cafe_pastor" }).eq("id", lead.id);
      return new Response(JSON.stringify({ ok: true, cp_step: "booked", appointment: result.appointment }), { status: 200 });
    }
  }
  // ── END CAFÉ COM PASTOR MULTI-TURN ────────────────────────────────────────

  const creds = ws?.credentials ?? {};
  const mode: string = creds.whatsapp_mode ?? "meta"; // "evolution" | "meta"

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

  const geminiKey: string = creds?.llm_config?.gemini_token ?? "";
  const iaMemoryEnabled: boolean = creds?.ia_memory_enabled !== false; // default on
  const memoryLimit = iaMemoryEnabled ? 8 : 0;

  console.log(`[FLUSH] mode=${mode} lead=${lead.id} memory=${iaMemoryEnabled} gemini=${!!geminiKey}`);

  // ── Build conversation history ────────────────────────────────────────────
  let historyRecords: any[] = [];
  if (memoryLimit > 0) {
    const { data } = await sb.from("messages")
      .select("direction, content")
      .eq("lead_id", lead_id)
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

  // First name extraction
  let firstName = "Amigo";
  if (lead.name) firstName = lead.name.split(" ")[0];

  // Current date/time context (Eastern Time — relevant for Orlando)
  const orlandoTime = new Date().toLocaleString("pt-BR", {
    timeZone: "America/New_York",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
  const dateContext = `DATA/HORA ATUAL (Eastern Time, Orlando): ${orlandoTime}`;

  const JSON_OUTPUT_FORMAT = `\n\n---\nFORMATO DE SAIDA OBRIGATORIO (JSON PURO):\nResponda APENAS com JSON valido, sem markdown, sem texto extra antes ou depois:\n{\n  "whatsapp_reply": "Sua resposta oficial em texto (use ||| para separar multiplas mensagens)",\n  "whatsapp_audio_script": "Se o usuario mandou [ÁUDIO TRANSCRITO], escreva aqui uma versao adaptada para TTS (coloquial, fala humana, diga 'o link que mandei no texto abaixo'). Sendo nulo se não houver áudio.",\n  "whatsapp_text_complement": "Se gerou audio E houver LINKS, coloque apenas os LINKS ou infos clicaveis aqui para irem como texto de acompanhamento. Se nao houver audio ou link, envie null.",\n  "detected_intention": "none | escalation | batismo | voluntariado | wecare | cafe_pastor"\n}\n\nMapeamento detected_intention:\n- escalation: pastor, aconselhamento, oracao urgente, contato humano\n- cafe_pastor: quer falar com pastor, agendar cafe com pastor, agendamento pastoral\n- batismo: quer se batizar ou info de batismo\n- voluntariado: quer ser voluntario ou servir\n- wecare: quer GC, Start, conexao comunitaria\n- none: saudacao simples ou pergunta informativa\n\nNAO use tags [ACAO:...]. Use EXCLUSIVAMENTE o JSON acima.`;

  // ── Build system instruction ──────────────────────────────────────────────
  // Priority: ia_system_prompt from credentials > ju_prompt from KB > built-in default
  let systemInstruction: string;
  const customIaPrompt: string | null = creds.ia_system_prompt ?? null;
  const customJuPrompt: string | undefined = ws?.knowledge_base?.ju_prompt;

  if (customIaPrompt) {
    // Workspace-specific IA prompt configured via Automações > IA Atendente
    systemInstruction = dateContext + "\n\n" + customIaPrompt + JSON_OUTPUT_FORMAT;
    systemInstruction = systemInstruction
      .replace(/\{firstName\}/g, firstName)
      .replace(/\{NOME\}/g, firstName);
    console.log(`[FLUSH] using ia_system_prompt from credentials`);
  } else if (customJuPrompt) {
    // Legacy KB ju_prompt
    systemInstruction = dateContext + "\n\n" + customJuPrompt + JSON_OUTPUT_FORMAT;
    systemInstruction = systemInstruction
      .replace(/\{firstName\}/g, firstName)
      .replace(/\{NOME\}/g, firstName);
    console.log(`[FLUSH] using ju_prompt from knowledge_base`);
  } else {
    // Built-in default + KB fields
    const kb = ws?.knowledge_base ?? {};
    const kbFields = [
      kb.ia_about     ? `Sobre a Igreja: ${kb.ia_about}` : null,
      kb.ia_schedule  ? `Programação: ${kb.ia_schedule}` : null,
      kb.ia_baptism   ? `Batismo: ${kb.ia_baptism}` : null,
      kb.ia_faq       ? `FAQ: ${kb.ia_faq}` : null,
      kb.ia_limits    ? `Limites/Regras: ${kb.ia_limits}` : null,
    ].filter(Boolean).join("\n\n");
    const kbBlock = kbFields || "Sem base de conhecimento configurada.";
    systemInstruction = `${dateContext}\n\nVocê é a assistente virtual desta igreja no WhatsApp. Nome do usuário: ${firstName}.\nDIRETRIZES: Amigável, calorosa, humana. Máximo 3 linhas por mensagem. Use ||| para separar múltiplas mensagens.\nBase de Conhecimento:\n${kbBlock}` + JSON_OUTPUT_FORMAT;
    console.log(`[FLUSH] using built-in default prompt`);
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { response_mime_type: "application/json" }
  };

  // ── Call Gemini ───────────────────────────────────────────────────────────
  const model = "gemini-2.5-flash";
  let finalReply = "Opa, tive um pequeno engasgo agora! Me chama de novo em um instante 😊";
  let detectedIntention = "none";
  let audioScript: string | null = null;
  let audioComplement: string | null = null;

  if (!geminiKey) {
    console.error("[FLUSH] no gemini_token in llm_config — cannot generate reply");
    return new Response("no_gemini_key", { status: 500 });
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const rawBody = await res.text();
      if (res.ok) {
        try {
          const j = JSON.parse(rawBody);
          const rawText = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          const finishReason = j?.candidates?.[0]?.finishReason ?? "unknown";
          if (rawText) {
            try {
              const parsedJSON = JSON.parse(rawText);
              if (parsedJSON.whatsapp_reply) finalReply = parsedJSON.whatsapp_reply;
              else finalReply = `⚠️ LLM não retornou 'whatsapp_reply'. Raw: ${rawText.substring(0, 250)}`;
              if (parsedJSON.whatsapp_audio_script) audioScript = parsedJSON.whatsapp_audio_script;
              if (parsedJSON.whatsapp_text_complement) audioComplement = parsedJSON.whatsapp_text_complement;
              if (parsedJSON.detected_intention) detectedIntention = parsedJSON.detected_intention;
            } catch {
              console.log("LLM non-JSON:", rawText.substring(0, 200));
              finalReply = rawText.replace(/```json|```/g, "").trim() || "⚠️ LLM retornou texto vazio.";
            }
          } else {
            finalReply = `⚠️ LLM sem texto. finishReason: ${finishReason}. Raw: ${rawBody.substring(0, 250)}`;
          }
        } catch (e: any) {
          finalReply = `⚠️ Falha no parse do Gemini. Erro: ${e.message}`;
          console.error("Gemini parse error:", e.message);
        }
      } else {
        finalReply = `⚠️ Gemini falhou. HTTP ${res.status}. Raw: ${rawBody.substring(0, 250)}`;
        console.error("Gemini API error:", rawBody.substring(0, 300));
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        finalReply = `⚠️ Gemini Timeout após ${GEMINI_TIMEOUT_MS}ms.`;
        console.error("Gemini AbortError");
      } else {
        finalReply = `⚠️ Gemini Fetch Error: ${e.message}`;
        console.error("Gemini fetch error:", e.message);
      }
    }
  } catch (e: any) { console.error("Outer error:", e.message); }

  // ── Send response ─────────────────────────────────────────────────────────
  let chunks = finalReply.split("|||").map((s: string) => s.trim()).filter((s: string) => s);

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
      } else { console.warn("[TTS] Audio send failed. Falling back to text."); }
    } else { console.warn("[TTS] ElevenLabs failed. Falling back to text."); }
  }

  if (audioSent) {
    chunks = audioComplement
      ? audioComplement.split("|||").map((s: string) => s.trim()).filter((s: string) => s)
      : [];
  }

  for (const chunk of chunks) {
    if (!chunk) continue;
    const sent = await sendText(mode, creds, lead.phone, chunk);
    console.log(`[FLUSH] sendText (${mode}) ${sent ? "OK" : "FAILED"}: ${chunk.substring(0, 80)}`);
    await sb.from("messages").insert({
      workspace_id: ws!.id, lead_id,
      direction: "outbound", type: "text",
      content: chunk, automated: true,
      responded_at: new Date().toISOString(),
    });
    if (chunks.length > 1) await new Promise<void>(r => setTimeout(r, 1200));
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
        await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, noMsg);
        await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: noMsg, automated: true, responded_at: new Date().toISOString() });
        await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString() }).eq("id", lead.id);
        return new Response(JSON.stringify({ ok: true, cp_step: "no_pastors_initial" }), { status: 200 });
      }
      // Start flow: ask type
      const pastorList = activePastors.map((p: any, i: number) => `${i+1}. ${p.display_name}`).join("
");
      const startMsg = `Olá ${firstName}! Que boa iniciativa — adoramos o Café com Pastor! ☕

Temos os seguintes pastores disponíveis:

${pastorList}

Primeiro: prefere uma sessão *presencial* na igreja ou *online* (vídeo chamada)?`;
      await cpSaveCtx({ flow: "cafe_pastor", step: "awaiting_type" });
      await sendText(creds.whatsapp_mode ?? "meta", ws?.credentials ?? {}, lead.phone, startMsg);
      await sb.from("messages").insert({ workspace_id: ws!.id, lead_id, direction: "outbound", type: "text", content: startMsg, automated: true, responded_at: new Date().toISOString() });
      await sb.from("leads").update({ has_responded: true, last_message_at: new Date().toISOString(), inbox_status: "highlighted", inbox_priority: "cafe_pastor" }).eq("id", lead.id);
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
    if (Object.keys(leadUpdate).length > 0) await sb.from("leads").update(leadUpdate).eq("id", lead.id);

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
  await sb.from("leads").update(inboxUpdate).eq("id", lead.id);

  return new Response(JSON.stringify({ ok: true, processed: ids.length, intention: detectedIntention, mode }), { status: 200 });
});
