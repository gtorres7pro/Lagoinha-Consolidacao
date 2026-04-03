import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SILENCE_MS = 5000;
const GEMINI_TIMEOUT_MS = 25000;
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

function metaPhone(p: string) { return p.startsWith("+") ? p.slice(1) : p; }

async function sendText(token: string, phoneNumberId: string, phone: string, text: string): Promise<boolean> {
  const to = metaPhone(phone);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text, preview_url: false } })
    });
    if (!res.ok) console.error("WA send error:", await res.text());
    return res.ok;
  } catch (e: any) {
    console.error("WA send exception:", e.message);
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

async function sendAudio(token: string, phoneNumberId: string, phone: string, mediaId: string): Promise<boolean> {
  const to = metaPhone(phone);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "audio", audio: { id: mediaId } })
    });
    if (!res.ok) console.error("WA audio send error:", await res.text());
    return res.ok;
  } catch (e: any) { console.error("WA audio send exception:", e.message); return false; }
}

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

  const { data: lead } = await sb.from("leads").select("id, phone, workspace_id, name, llm_lock_until").eq("id", lead_id).maybeSingle();
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
  if (!ws?.credentials?.whatsapp_token || !ws?.credentials?.phone_number_id) {
    return new Response("no creds", { status: 500 });
  }

  const waToken: string = ws.credentials.whatsapp_token;
  const phoneNumberId: string = ws.credentials.phone_number_id;
  const geminiKey: string = ws.credentials?.llm_config?.gemini_token ?? "";

  const { data: historyRecords } = await sb.from("messages")
    .select("direction, content")
    .eq("lead_id", lead_id)
    .lt("created_at", firstPendingTime)
    .order("created_at", { ascending: false })
    .limit(8);

  const contents: any[] = [];
  if (historyRecords?.length) {
    historyRecords.reverse().forEach((m: any) => {
      if (m.content) contents.push({ role: m.direction === "inbound" ? "user" : "model", parts: [{ text: m.content }] });
    });
  }
  contents.push({ role: "user", parts: [{ text: userTextCombined }] });

  // First name extraction
  let firstName = "Amigo";
  if (lead.name) firstName = lead.name.split(" ")[0];

  // Current date/time in Orlando (Eastern Time) — critical for schedule questions
  const orlandoTime = new Date().toLocaleString("pt-BR", {
    timeZone: "America/New_York",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
  const dateContext = `DATA/HORA ATUAL EM ORLANDO (Eastern Time): ${orlandoTime}`;

  const customJuPrompt: string | undefined = ws.knowledge_base?.ju_prompt;

  const JSON_OUTPUT_FORMAT = `\n\n---\nFORMATO DE SAIDA OBRIGATORIO (JSON PURO):\nResponda APENAS com JSON valido, sem markdown, sem texto extra antes ou depois:\n{\n  "whatsapp_reply": "Sua resposta oficial em texto (use ||| para separar multiplas mensagens)",\n  "whatsapp_audio_script": "Se o usuario mandou [ÁUDIO TRANSCRITO], escreva aqui uma versao adaptada para TTS (coloquial, fala humana, diga 'o link que mandei no texto abaixo'). Sendo nulo se não houver áudio.",\n  "whatsapp_text_complement": "Se gerou audio E houver LINKS, coloque apenas os LINKS ou infos clicaveis aqui para irem como texto de acompanhamento. Se nao houver audio ou link, envie null.",\n  "detected_intention": "none | escalation | batismo | voluntariado | wecare"\n}\n\nMapeamento detected_intention:\n- escalation: pastor, aconselhamento, oracao urgente, contato humano\n- batismo: quer se batizar ou info de batismo\n- voluntariado: quer ser voluntario ou servir\n- wecare: quer GC, Start, conexao comunitaria\n- none: saudacao simples ou pergunta informativa\n\nNAO use tags [ACAO:...]. Use EXCLUSIVAMENTE o JSON acima.`;

  let systemInstruction: string;
  if (customJuPrompt) {
    systemInstruction = dateContext + "\n\n" + customJuPrompt + JSON_OUTPUT_FORMAT;
    systemInstruction = systemInstruction
      .replace(/\{firstName\}/g, firstName)
      .replace(/\{NOME\}/g, firstName);
  } else {
    const kbString = ws.knowledge_base ? JSON.stringify(ws.knowledge_base) : "NDA";
    systemInstruction = `${dateContext}\n\nVocê é a Ju, recepcionista virtual da Igreja Lagoinha no WhatsApp. Nome do usuário: ${firstName}.\nDIRETRIZES: Amigável, calorosa, humana. Máximo 3 linhas por mensagem. Use ||| para separar múltiplas mensagens.\nBase de Conhecimento:\n${kbString}` + JSON_OUTPUT_FORMAT;
  }
  // ──────────────────────────────────────────────────────────────────────────

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { response_mime_type: "application/json" }
  };

  // gemini-2.5-flash: fast and stable — ideal for real-time WhatsApp chatbot
  const model = "gemini-2.5-flash";
  let finalReply = "Opa, tive um pequeno engasgo agora! Me chama de novo em um instante 😊";
  let detectedIntention = "none";
  let audioScript: string | null = null;
  let audioComplement: string | null = null;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

    // AbortController for TRUE timeout — cancels the fetch connection itself
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
              else finalReply = `⚠️ Debug: LLM não retornou a chave 'whatsapp_reply'.\nRaw: ${rawText.substring(0, 250)}`;

              if (parsedJSON.whatsapp_audio_script) audioScript = parsedJSON.whatsapp_audio_script;
              if (parsedJSON.whatsapp_text_complement) audioComplement = parsedJSON.whatsapp_text_complement;
              if (parsedJSON.detected_intention) detectedIntention = parsedJSON.detected_intention;
            } catch {
              console.log("LLM non-JSON:", rawText.substring(0, 200));
              finalReply = rawText.replace(/```json|```/g, "").trim();
              if (!finalReply) finalReply = `⚠️ Debug: LLM retornou texto vazio após limpeza.`;
            }
          } else {
             finalReply = `⚠️ Debug: LLM sem texto. Motivo (finishReason): ${finishReason}.\nRaw: ${rawBody.substring(0, 250)}`;
          }
        } catch (e: any) { 
            finalReply = `⚠️ Debug: Falha no Parse do Retorno Gemini. Erro: ${e.message}`;
            console.error("Gemini parse error:", e.message); 
        }
      } else {
        finalReply = `⚠️ Debug: API Gemini Falhou.\nHttp Error: ${res.status}\nRaw: ${rawBody.substring(0, 250)}`;
        console.error("Gemini API error:", rawBody.substring(0, 300));
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        finalReply = `⚠️ Debug: Gemini Timeout (AbortError após ${GEMINI_TIMEOUT_MS}ms).`;
        console.error(`Gemini AbortError`);
      } else {
        finalReply = `⚠️ Debug: Fetch Error: ${e.message}`;
        console.error("Gemini fetch error:", e.message);
      }
    }
  } catch (e: any) { console.error("Outer error:", e.message); }

  let chunks = finalReply.split("|||").map((s: string) => s.trim()).filter((s: string) => s);
  
  const hasAudio = pending.some((m: any) => m.type === "audio");
  const elevenLabsKey = ws.credentials?.llm_config?.elevenlabs_token;
  let audioSent = false;

  if (hasAudio && elevenLabsKey && audioScript) {
    console.log("[TTS] Audio detected and script generated. Calling TTS...");
    const audioBuffer = await generateElevenLabsAudio(audioScript, elevenLabsKey);
    if (audioBuffer) {
      console.log("[TTS] Uploading audio to Meta...");
      const mediaId = await uploadMediaToWhatsApp(waToken, phoneNumberId, audioBuffer);
      if (mediaId && lead.phone) {
        console.log(`[TTS] Sending audio message. MediaID: ${mediaId}`);
        const sent = await sendAudio(waToken, phoneNumberId, lead.phone, mediaId);
        if (sent) {
          audioSent = true;
          await sb.from("messages").insert({
            workspace_id: ws.id, lead_id,
            direction: "outbound", type: "audio",
            content: `[ÁUDIO GERADO]: ${audioScript}`, automated: true,
            responded_at: new Date().toISOString(),
          });
        }
      } else { console.warn("[TTS] Media upload failed. Falling back to text."); }
    } else { console.warn("[TTS] ElevenLabs failed. Falling back to text."); }
  }

  if (audioSent) {
    if (audioComplement) {
      chunks = audioComplement.split("|||").map((s: string) => s.trim()).filter((s: string) => s);
    } else {
      chunks = [];
    }
  }

  for (const chunk of chunks) {
    if (!chunk) continue;
    const sent = await sendText(waToken, phoneNumberId, lead.phone, chunk);
    console.log(`Sent (${sent ? "OK" : "FAILED"}): ${chunk.substring(0, 80)}`);
    await sb.from("messages").insert({
      workspace_id: ws.id, lead_id,
      direction: "outbound", type: "text",
      content: chunk, automated: true,
      responded_at: new Date().toISOString(),
    });
    if (chunks.length > 1) await new Promise<void>(r => setTimeout(r, 1200));
  }

  // ─── KANBAN AUTOMATION ────────────────────────────────────────────────────
  if (detectedIntention && detectedIntention !== "none") {
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
      if (resendKey && ws.credentials?.notifications?.email_pastor !== false) {
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
    <a href="https://hub.7pro.tech" style="display:inline-block;background:#FFD700;color:#111;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none">Acessar Painel HUB</a>
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

  // ─── A3: Update lead inbox fields ──────────────────────────────────────────
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

  return new Response(JSON.stringify({ ok: true, processed: ids.length, intention: detectedIntention }), { status: 200 });
});

