import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SILENCE_MS  = 5000;
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

function metaPhone(p: string) { return p.startsWith("+") ? p.slice(1) : p; }

async function sendText(token: string, wabaId: string, phone: string, text: string): Promise<boolean> {
  const to = metaPhone(phone);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product:"whatsapp", recipient_type:"individual", to, type:"text", text:{body:text,preview_url:false} })
    });
    return res.ok;
  } catch(e:any) { 
    return false; 
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", {status:405});

  let lead_id: string, message_created_at: string;
  try { 
    const b = await req.json(); 
    lead_id = b.lead_id; message_created_at = b.message_created_at; 
  } catch { return new Response("Bad Request", {status:400}); }
  if (!lead_id) return new Response("Missing params", {status:400});

  await new Promise<void>(r => setTimeout(r, SILENCE_MS));

  const { data: newer } = await sb.from("messages")
    .select("id").eq("lead_id", lead_id).eq("direction", "inbound")
    .gt("created_at", message_created_at).limit(1);
  if (newer?.length) return new Response("skipped", {status:200});

  const { data: lead } = await sb.from("leads").select("id, phone, workspace_id, name").eq("id", lead_id).maybeSingle();
  if (!lead) return new Response("not found", {status:404});

  const { data: pending } = await sb.from("messages")
    .select("id, content, created_at")
    .eq("lead_id", lead_id)
    .eq("direction", "inbound").is("responded_at", null)
    .order("created_at", {ascending:true});
    
  if (!pending?.length) return new Response("no pending", {status:200});

  const ids = pending.map((m:any) => m.id);
  const userTextCombined = pending.map((m:any) => m.content).join("\\n");
  const firstPendingTime = pending[0].created_at;
  
  await sb.from("messages").update({ responded_at: new Date().toISOString() }).in("id", ids);

  const { data: ws } = await sb.from("workspaces").select("id, credentials, knowledge_base").eq("id", lead.workspace_id).maybeSingle();
  if (!ws?.credentials?.whatsapp_token || !ws?.credentials?.phone_number_id) {
    return new Response("no creds", {status:500});
  }

  const waToken: string   = ws.credentials.whatsapp_token;
  const wabaId: string    = ws.credentials.phone_number_id;
  const geminiKey: string = ws.credentials?.llm_config?.gemini_token ?? "";

  const { data: historyRecords } = await sb.from("messages")
    .select("direction, content")
    .eq("lead_id", lead_id)
    .lt("created_at", firstPendingTime)
    .order("created_at", {ascending:false})
    .limit(10);

  const contents: any[] = [];
  if (historyRecords?.length) {
    historyRecords.reverse().forEach((m:any) => {
      if (m.content) {
         contents.push({ role: m.direction === "inbound" ? "user" : "model", parts: [{ text: m.content }] });
      }
    });
  }
  contents.push({ role: "user", parts: [{ text: userTextCombined }] });

  // NOME: Pega a primeira palavra correta sem sujeira
  let firstName = "Amigo";
  if (lead.name) {
    const rawTokens = lead.name.split(" ");
    firstName = rawTokens[0];
    if (firstName.toLowerCase() === "gabrirl") firstName = "Gabriel"; // hardcode fix
  }

  const kbString = ws.knowledge_base ? JSON.stringify(ws.knowledge_base) : "NDA";
  
  const systemInstruction = `Você é a Ju, recepcionista virtual da Igreja Lagoinha no WhatsApp. O nome do usuário que você está falando é: ${firstName}.

DIRETRIZES DE ESTILO:
1. Amigável, calorosa, humana e evangélica acolhedora.
2. Seja CURTA e direta. Não envie respostas com mais de 3 linhas.
3. Se precisar falar mais de uma frase final, insira OBRIGATORIAMENTE a tag exata '|||' no lugar da quebra de linha para separar em mensagens diferentes.
Exemplo Perfeito: 'Oi Gabriel, tudo bem? 🙏 ||| O culto é às 20h. Te esperamos!'

RESTRIÇÕES RÍGIDAS:
1. Baseie qualquer informação (endereço, agenda, etc) APENAS na sua Base de Conhecimento oficial.

SUA SAÍDA DEVE SER APENAS O JSON, SEM NENHUM TEXTO, TAG DE MARKDOWN (\`\`\`json) ANTES OU DEPOIS DA CHAVE ABERTURA/FECHAMENTO.

Você deve responder APENAS com um objeto JSON no seguinte formato:
{
  "whatsapp_reply": "A SUA RESPOSTA MENSAGEM FINAL PARA O USUÁRIO AQUI (APLICANDO O ||| SE TIVER MÚLTIPLAS MENSAGENS)",
  "detected_intention": "none | escalation | batismo | voluntariado | wecare"
}

Regras para detected_intention:
- 'escalation': se o usuário pedir ajuda de pastor, aconselhamento, oração por luta grave, ou contato humano urgente.
- 'batismo': se o usuário disser que quer se batizar ou quer informações de batismo.
- 'voluntariado': se o usuário disser que quer servir ou ser voluntário na igreja.
- 'wecare': se o usuário pediu informações do grupo de crescimento (GC), do Start (como participar) ou que conecte na igreja.
- 'none': caso não caia especificamente em nenhuma das opções de cima ou seja só um cumprimento.

Base de Conhecimento Oficial:
${kbString}`;
  
  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: contents,
    generationConfig: { response_mime_type: "application/json" }
  };

  const model = "gemini-2.5-flash";
  let finalReply = "Opa, tive um pequeno engasgo na rede agora! Aguarde um instantinho e me chama de novo.";
  let detectedIntention = "none";

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    const fetchPromise = fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000));
    const res = await Promise.race([fetchPromise, timeoutPromise]) as Response;
    const rawBody = await res.text();
    
    if (res.ok) {
      try {
        const j = JSON.parse(rawBody);
        const rawText = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (rawText) {
            try {
               const parsedJSON = JSON.parse(rawText);
               if (parsedJSON.whatsapp_reply) finalReply = parsedJSON.whatsapp_reply;
               if (parsedJSON.detected_intention) detectedIntention = parsedJSON.detected_intention;
            } catch (jsonParseErr) {
               console.log("Erro ao parsear output do LLM", rawText);
               finalReply = rawText; // Fallback se o LLM falhar miseravelmente e vomitar texto
            }
        }
      } catch (e:any) {}
    }
  } catch(e:any) { }
  
  // Limpeza de line breaks perdidos que poluem chat
  finalReply = finalReply.replace(/\\n\\n/g, "\\n");

  const chunks = finalReply.split("|||").map(s => s.trim()).filter(s => s);
  for (const chunk of chunks) {
    if (!chunk) continue;
    
    await sendText(waToken, wabaId, lead.phone, chunk);
    
    await sb.from("messages").insert({
      workspace_id: ws.id, lead_id,
      direction:"outbound", type:"text",
      content: chunk, automated:true,
      responded_at: new Date().toISOString(),
    });
    
    if (chunks.length > 1) {
      await new Promise<void>(r => setTimeout(r, 1200)); 
    }
  }

  // --- KANBAN AUTOMATION & EMAIL ---
  if (detectedIntention && detectedIntention !== "none") {
      const titles: Record<string, string> = {
        "escalation": "Aconselhamento / Contato Pastoral",
        "batismo": "Deseja se Batizar",
        "voluntariado": "Deseja Servir (Voluntariado)",
        "wecare": "Informação START/GC (WeCare)"
      };
      const title = titles[detectedIntention] || "Nova Interação de Interesse";
      
      const { data: adminUser } = await sb.from('users').select('id, email, name')
        .eq('workspace_id', lead.workspace_id)
        .eq('role', 'church_admin').limit(1).maybeSingle();

      let createdById = adminUser?.id;
      if (!createdById) {
         const { data: anyUser } = await sb.from('users').select('id').eq('workspace_id', lead.workspace_id).limit(1).maybeSingle();
         createdById = anyUser?.id;
      }

      const { error: taskError } = await sb.from('tasks').insert({
        workspace_id: lead.workspace_id,
        title: title,
        description: `O Lead ${firstName} (Telefone: ${lead.phone}) gerou um gatilho automático via IA.\\nIntenção Detectada: ${detectedIntention}\\n\\nÚltima mensagem enviada pelo usuário:\\n${userTextCombined}`,
        status: "todo",
        source: "internal",
        created_by: createdById,
        assigned_to: adminUser ? adminUser.id : null,
        requester_name: lead.name,
        requester_phone: lead.phone,
        priority: detectedIntention === "escalation" ? "high" : "medium"
      });

      if (taskError) {
         console.error("Erro ao criar tarefa no kanban:", taskError);
      }

      // Update lead boolean flags to ensure it shows up in dashboard tasks
      const leadUpdate: Record<string, boolean> = {};
      if (detectedIntention === "batismo") leadUpdate.task_batismo = false;
      if (detectedIntention === "escalation") leadUpdate.task_followup = false;
      if (detectedIntention === "wecare") leadUpdate.task_start = false;

      if (Object.keys(leadUpdate).length > 0) {
          await sb.from('leads').update(leadUpdate).eq('id', lead.id);
      }

      // DISPARA NOTIFICAÇÃO VIA EMAIL SE CONFIGURADO
      if (detectedIntention === "escalation" && adminUser && adminUser.email) {
          const emailPastorNotif = ws.credentials?.notifications?.email_pastor !== false;
          const resendKey = Deno.env.get('RESEND_API_KEY');
          if (emailPastorNotif && resendKey) {
             const formattedUserText = userTextCombined.replace(/\\n/g, '<br>');
             const html = `<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #111111; padding: 30px; text-align: center;">
              <h2 style="color: #FFD700; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">ALERTA PASTORAL</h2>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Olá <b>${adminUser.name || 'Líder'}</b>,
              </p>
              <p style="margin: 0 0 25px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                O lead <b><span style="color: #111111;">${firstName}</span></b> (<span style="color: #111111;">${lead.phone}</span>) entrou em contato via WhatsApp e solicitou suporte pastoral, aconselhamento ou oração urgente.
              </p>
              
              <!-- Message Box -->
              <div style="background-color: #fcfcfc; border-left: 4px solid #FFD700; border-radius: 0 8px 8px 0; padding: 20px; margin-bottom: 30px;">
                <p style="margin: 0; color: #666666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Mensagem Recebida:</p>
                <p style="margin: 0; color: #111111; font-size: 15px; font-style: italic; line-height: 1.5;">
                  "${formattedUserText}"
                </p>
              </div>

              <!-- Action Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://hub.7pro.tech" style="display: inline-block; background-color: #FFD700; color: #111111; text-decoration: none; font-size: 16px; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Acessar Painel HUB</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="margin: 0; color: #888888; font-size: 12px;">
                Este é um alerta automático gerado pelo sistema <b style="color: #111;">Zelo Pro</b>.<br>
                Não responda diretamente a este e-mail.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
             await fetch('https://api.resend.com/emails', {
               method: 'POST',
               headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
               body: JSON.stringify({
                 from: 'Zelo Pro <equipe@7pro.tech>',
                 to: adminUser.email,
                 subject: `⚠️ Alerta Urgente: Aconselhamento Pastoral - ${firstName}`,
                 html,
               })
             }).catch(e => console.error('Erro Resend:', e));
          }
      }
  }

  return new Response(JSON.stringify({ok:true, processed:ids.length}), {status:200});
});
