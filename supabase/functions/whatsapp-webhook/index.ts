import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const VERIFY_TOKEN = "lagoinha_consolida_secret_token";
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

function normPhone(r: string) { const c = r.trim(); return c.startsWith("+") ? c : "+" + c; }
function metaPhone(p: string) { return p.startsWith("+") ? p.slice(1) : p; }

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
  // Ensure we pass only audio/ogg or similar standard format
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

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const m = url.searchParams.get("hub.mode"), v = url.searchParams.get("hub.verify_token"), c = url.searchParams.get("hub.challenge");
    return m === "subscribe" && v === VERIFY_TOKEN ? new Response(c, {status:200}) : new Response("Forbidden", {status:403});
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", {status:405});

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", {status:400}); }

  const value = body?.entry?.[0]?.changes?.[0]?.value;
  if (!value?.messages?.length) { console.log("[WH] skip: no messages"); return new Response("EVENT_RECEIVED", {status:200}); }

  const msg = value.messages[0];
  if (!["text","audio","image"].includes(msg.type)) return new Response("EVENT_RECEIVED", {status:200});

  const pnid: string = value.metadata?.phone_number_id ?? "";
  console.log(`[WH] id=${msg.id} from=${msg.from} pnid=${pnid} type=${msg.type}`);

  // Find workspace
  const { data: wss } = await sb.from("workspaces").select("id,name,credentials");
  const ws = wss?.find((w:any) => w.credentials?.phone_number_id === pnid) ?? wss?.find((w:any) => !!w.credentials?.whatsapp_token);
  if (!ws) { console.error("[WH] no workspace"); return new Response("EVENT_RECEIVED", {status:200}); }

  // Idempotency
  const { data: dup } = await sb.from("messages").select("id").eq("wa_message_id", msg.id).maybeSingle();
  if (dup) { console.log("[WH] dup skip"); return new Response("EVENT_RECEIVED", {status:200}); }

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
  if (!lead) { console.error("[WH] no lead"); return new Response("EVENT_RECEIVED", {status:200}); }
  console.log(`[WH] lead=${lead.id} (${lead.name}) phone=${lead.phone}`);

  if (lead.llm_lock_until && new Date(lead.llm_lock_until) > new Date()) {
    console.log("[WH] human lock");
    return new Response("EVENT_RECEIVED", {status:200});
  }

  // Handle TEXT vs AUDIO
  let text = `[${msg.type}]`;
  if (msg.type === "text") {
    text = msg.text?.body ?? "";
  } else if (msg.type === "audio" && msg.audio?.id) {
    try {
      console.log(`[WH] Processing Audio. ID: ${msg.audio.id}`);
      const waToken = ws.credentials?.whatsapp_token;
      const geminiKey = ws.credentials?.llm_config?.gemini_token;
      
      if (waToken && geminiKey) {
        // 1. Get Media URL
        const mediaMetaRes = await fetch(`https://graph.facebook.com/v20.0/${msg.audio.id}`, {
          headers: { "Authorization": `Bearer ${waToken}` }
        });
        const mediaMeta = await mediaMetaRes.json();
        
        if (mediaMeta.url) {
          // 2. Download Media bytes
          const mediaRes = await fetch(mediaMeta.url, {
            headers: { "Authorization": `Bearer ${waToken}` }
          });
          const audioBuffer = await mediaRes.arrayBuffer();
          
          // 3. Transcribe via Gemini
          console.log(`[WH] Audio downloaded (${audioBuffer.byteLength} bytes). Transcribing via Gemini...`);
          const transcription = await transcribeAudioWithGemini(audioBuffer, msg.audio.mime_type || "audio/ogg", geminiKey);
          if (transcription) {
             text = `[ÁUDIO TRANSCRITO] "${transcription}"`;
             console.log(`[WH] Transcription success: ${text.substring(0, 50)}...`);
          } else {
             text = `[ÁUDIO TRANSCRITO]: (fala vazia ou ininteligível)`;
          }
        } else {
           console.error("[WH] Meta did not return a valid audio URL.", mediaMeta);
        }
      } else {
         console.warn("[WH] Missing either waToken or geminiKey. Cannot transcribe audio.");
      }
    } catch (e: any) {
       console.error("[WH] Error transcribing audio:", e.message);
       text = `[ÁUDIO]: Erro ao transcrever. Falha na integração Gemini.`;
    }
  }

  // Save inbound - trigger fires automatically after INSERT
  const { error: ie } = await sb.from("messages").insert({
    workspace_id: ws.id,
    lead_id: lead.id,
    direction: "inbound",
    type: msg.type,
    content: text,
    automated: false,
    responded_at: null,
    wa_message_id: msg.id,
  });
  if (ie) { console.error("[WH] insert error:", ie.message); return new Response("EVENT_RECEIVED", {status:200}); }
  console.log(`[WH] inbound saved: "${text.substring(0, 100)}" | trigger will call whatsapp-flush in background`);

  // Update lead: open 24h WhatsApp window and mark as responded
  const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sb.from("leads").update({
    wa_window_expires_at: windowExpiry,
    has_responded: true,
    last_message_at: new Date().toISOString(),
  }).eq("id", lead.id);

  // Return 200 immediately - pg_net trigger handles the rest
  return new Response("EVENT_RECEIVED", {status:200});
});
