import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ADMIN_ROLES, escapeHtml } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new Error("Missing Authorization header");
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        if (userError || !user) throw new Error("Unauthorized");

        // get user's workspace_id
        const { data: userData, error: userDataError } = await supabase
            .from('users')
            .select('id, workspace_id, role, name, email, phone')
            .eq('id', user.id)
            .single();

        if (userDataError || !userData) throw new Error("User metadata not found");

        const wsId = userData.workspace_id;
        
        // Fetch workspace to get knowledge base 
        const { data: wsData, error: wsError } = await supabase
            .from('workspaces')
            .select('knowledge_base, name, credentials')
            .eq('id', wsId)
            .single();
            
        if (wsError || !wsData) throw new Error("Workspace data not found");
        
        let geminiApiKey = wsData.credentials?.llm_config?.gemini_token;
        if (!geminiApiKey) {
            geminiApiKey = Deno.env.get('GEMINI_API_KEY');
        }
        if (!geminiApiKey) throw new Error("A API Key do Gemini não está configurada.");

        const { message, history } = await req.json();

        // Prepare Gemini Call
        const kbString = JSON.stringify(wsData.knowledge_base || {});
        
        const systemPrompt = `
Você é a **Mila**, assistente virtual de suporte técnico e gestão exclusiva do sistema Zelo Pro.
Você está conversando com a equipe de gestão da igreja ${wsData.name}. O usuário logado chama-se ${userData.name || 'Gestor'}.
Seja amigável e direta.

[LIMITAÇÃO ESTRITA]: 
Você SÓ TEM ACESSO às informações listadas nesta Base de Conhecimento abaixo. Você NÃO PODE inventar informações ou falar sobre tópicos gerais fora dessas informações, nem de outras filiais da igreja.
Se o usuário perguntar o que você sabe ou o que tem salvo, forneça um breve resumo humanizado a partir desta exata Base de Conhecimento, revelando que são as mesmas configurações que a "Ju" (recepcionista do WhatsApp) utiliza para operar.

Aqui está a Base de Conhecimento atual desta igreja, em JSON:
${kbString}

**Regras de Atuação:**
1. Você é cordial, solícita e engajada. Use linguagem natural.
2. Se o usuário perguntar da base de dados, liste o que existe de forma resumida e elegante.
3. Se o usuário pedir para atualizar a base, confirme os novos dados formatados e depois evoque 'update_knowledge_base'. Preserve o que já existe e envie apenas os campos novos/alterados quando for uma atualização parcial.
4. Para assuntos como CRIE, CRIE Mulheres, Start, Batismo, Café com Pastor, cultos e endereço, prefira criar campos claros na base (por exemplo: crie, crie_mulheres, start, batismo, cafe_pastor) para que a Ju consulte pelo WhatsApp.
5. **CHAMADO TÉCNICO:** Se o usuário reportar um erro, bug ou pedir uma funcionalidade (support/feedback), NÃO ABRA O TICKET IMEDIATAMENTE! Primeiro, seja INVESTIGATIVA. Demonstre empatia ("Ah, que pena!") e peça detalhes específicos ("Você tem um print?", "O que exatamente aconteceu antes do erro?").
6. Após o usuário dar os detalhes do problema em mensagens subsequentes, SE você sentir que já tem informações ricas (como o caminho exato do bug ou detalhes de como reproduzir), ENTÃO evoque a tool 'open_support_ticket'.
7. Dentro da description do ticket, forneça não apenas o que o usuário disse, mas a sua **Sugestão de Resolução para o Desenvolvedor**, baseando-se no problema (ex: dicas de frontend/backend/SQL).
        `;

        const tools = [{
            function_declarations: [
                {
                    name: "open_support_ticket",
                    description: "Abre um chamado na equipe técnica 7Pro avisando de um bug ou melhoria no sistema.",
                    parameters: {
                        type: "object",
                        properties: {
                            title: {
                                type: "string",
                                description: "Título curto do chamado"
                            },
                            description: {
                                type: "string",
                                description: "Descrição do que o usuário reportou que não funciona ou que pediu."
                            }
                        },
                        required: ["title", "description"]
                    }
                },
                {
                    name: "update_knowledge_base",
                    description: "Atualiza a base de conhecimento da igreja. Envie um JSON com os campos novos ou alterados; ele será mesclado com a base atual sem apagar os demais campos.",
                    parameters: {
                        type: "object",
                        properties: {
                            new_json_object: {
                                type: "string",
                                description: "STRING CONTENDO O JSON ENCODE DOS CAMPOS NOVOS OU ALTERADOS DA BASE DE CONHECIMENTO."
                            }
                        },
                        required: ["new_json_object"]
                    }
                }
            ]
        }];

        let resultText = "";

        let contents = [];
        if (history && history.length > 0) {
            contents = history.map((h: any) => ({
                role: h.role, 
                parts: [{ text: h.content }]
            }));
        } else {
            contents = [ { role: "user", parts: [{ text: message }] } ];
        }

        // First pass: Call Gemini
        const geminiRequestBody = {
            contents: contents,
            system_instruction: {
                parts: [{ text: systemPrompt }]
            },
            tools: tools
        };

        const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + geminiApiKey;
        const geminiResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiRequestBody)
        });

        const gData = await geminiResponse.json();
        
        let toolCalls = [];
        if (gData.candidates && gData.candidates[0].content.parts) {
            const parts = gData.candidates[0].content.parts;
            for (const part of parts) {
                if (part.text) {
                    resultText += part.text;
                }
                if (part.functionCall) {
                    toolCalls.push(part.functionCall);
                }
            }
        }

        // Process tool calls if any... Note: We won't send it back to Gemini for another run just to keep things super fast.
        // We will just execute the background action and append a predefined response to resultText if resultText is empty.
        
        if (toolCalls.length > 0) {
            for (const call of toolCalls) {
                if (call.name === 'open_support_ticket') {
                    const args = call.args;

                    // Extract attached files
                    const urlRegex = /(https:\/\/uyseheucqikgcorrygzc\.supabase\.co\/storage\/v1\/object\/public\/app_files\/[^\s\]]+)/g;
                    const urls = [];
                    let match;
                    while ((match = urlRegex.exec(message)) !== null) urls.push(match[1]);
                    if (history) {
                        for (const h of history) {
                            while ((match = urlRegex.exec(h.content)) !== null) urls.push(match[1]);
                        }
                    }
                    const uniqueUrls = [...new Set(urls)];

                    // 1. Inserir no banco de dados para a página do Desenvolvedor
                    const { data: logData, error: logError } = await supabase
                        .from('app_logs')
                        .insert({
                            type: 'bug',
                            title: args.title,
                            description: args.description + (uniqueUrls.length > 0 ? '\n\nAnexos: ' + uniqueUrls.join(', ') : ''),
                            status: 'pending',
                            submitted_by: user.id,
                            workspace_id: wsId
                        }).select().single();
                        
                    const logId = logData ? logData.id : 'N/A';

                    // 2. Disparar email em formato High-End
                    const phone = userData.phone || "";
                    const waLink = phone ? "https://wa.me/" + phone.replace(/[^0-9]/g, "") : "#";
                    
                    let attachmentsHtml = '';
                    if (uniqueUrls.length > 0) {
                        attachmentsHtml = "<h4 style=\"color: #666; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 15px;\">Anexos</h4><div style=\"margin-bottom: 25px;\">";
                        for (const u of uniqueUrls) {
                            const isImage = u.match(/\.(jpeg|jpg|gif|png|webp)$/i);
                            if (isImage) {
                                attachmentsHtml += `<a href="${u}" target="_blank"><img src="${u}" style="max-width: 100%; border-radius: 8px; border: 1px solid #eee; margin-bottom: 10px;" /></a><br>`;
                            } else {
                                attachmentsHtml += `<a href="${u}" target="_blank" style="color: #FFD700; text-decoration: none; font-weight: bold;">📎 Abrir Anexo</a><br>`;
                            }
                        }
                        attachmentsHtml += "</div>";
                    }

                    const niceHtml = "" + 
                    "<div style=\"font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eaeaec;\">" +
                        "<div style=\"background: #111; color: #FFF; padding: 25px 30px; text-align: center; border-bottom: 4px solid #FFD700;\">" +
                            "<img src=\"https://cdn-icons-png.flaticon.com/512/8646/8646545.png\" alt=\"Zelo Pro Triage\" style=\"width: 40px; margin-bottom: 10px; filter: brightness(0) invert(1) drop-shadow(0 0 10px rgba(255, 215, 0, 0.5));\" />" +
                            "<h2 style=\"margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.5px;\">Novo Relato de Sistema</h2>" +
                            "<p style=\"margin: 5px 0 0 0; color: #aaa; font-size: 14px;\">Zelo Pro Triage by Mila &nbsp;•&nbsp; Ticket #" + logId.substring(0,6) + "</p>" +
                        "</div>" +
                        "<div style=\"padding: 30px;\">" +
                            "<h3 style=\"margin-top: 0; color: #222; font-size: 18px;\">" + escapeHtml(args.title) + "</h3>" +
                            "<div style=\"background: #f9f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #FFD700; margin-bottom: 25px;\">" +
                                "<p style=\"margin: 0; font-size: 15px; color: #444; line-height: 1.6;\">" + escapeHtml(args.description).replace(/\\n/g, '<br>') + "</p>" +
                            "</div>" +
                            attachmentsHtml +
                            "<h4 style=\"color: #666; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 15px;\">Dados do Autor</h4>" +
                            "<table style=\"width: 100%; border-collapse: collapse; margin-bottom: 25px;\">" +
                                "<tr>" +
                                    "<td style=\"padding: 6px 0; color: #888; font-size: 14px; width: 30%;\">Nome</td>" +
                                    "<td style=\"padding: 6px 0; color: #111; font-size: 14px; font-weight: 500;\">" + escapeHtml(userData.name || 'Desconhecido') + "</td>" +
                                "</tr>" +
                                "<tr>" +
                                    "<td style=\"padding: 6px 0; color: #888; font-size: 14px;\">E-mail</td>" +
                                    "<td style=\"padding: 6px 0; color: #111; font-size: 14px; font-weight: 500;\">" + escapeHtml(userData.email || 'N/A') + "</td>" +
                                "</tr>" +
                                "<tr>" +
                                    "<td style=\"padding: 6px 0; color: #888; font-size: 14px;\">Contato</td>" +
                                    "<td style=\"padding: 6px 0; color: #111; font-size: 14px; font-weight: 500;\">" +
                                        escapeHtml(phone) + " <a href=\"" + waLink + "\" style=\"display:inline-block; margin-left: 8px; background: #25D366; color: #fff; padding: 2px 8px; border-radius: 12px; text-decoration: none; font-size: 11px; font-weight: bold;\">WhatsApp me</a>" +
                                    "</td>" +
                                "</tr>" +
                                "<tr>" +
                                    "<td style=\"padding: 6px 0; color: #888; font-size: 14px;\">Workspace</td>" +
                                    "<td style=\"padding: 6px 0; color: #111; font-size: 14px; font-weight: 500;\">" + escapeHtml(wsData.name) + " (" + wsId.substring(0,8) + ")</td>" +
                                "</tr>" +
                            "</table>" +
                            "<div style=\"text-align: center; margin-top: 35px;\">" +
                                "<a href=\"https://zelo.7prolabs.com/\" style=\"background: #111; color: #FFD700; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: 700; font-size: 15px; display: inline-block;\">Ver no Painel do Desenvolvedor</a>" +
                            "</div>" +
                        "</div>" +
                    "</div>";

                    try {
                        await fetch('https://api.resend.com/emails', {
                            method: 'POST',
                            headers: {
                                'Authorization': "Bearer " + resendApiKey,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                from: "Zelo Pro Mila <nao-responda@7pro.tech>",
                                to: "g@7proservices.com",
                                subject: "[Zelo Triage] " + String(args.title || '').slice(0, 120),
                                html: niceHtml
                            })
                        });
                        console.log("Resend API Email triggered success.");
                    } catch (e) { console.error("Error triggering resend via mila-chat: ", e); }

                    if (resultText) {
                        resultText += "\n\n✅ Protocolo de manutenção #" + logId.substring(0,4) + " foi registrado e enviado com sucesso à equipe técnica de engenharia! Posso ajudar com algo mais?";
                    } else {
                        resultText = "Entendido! Já compilei todas as nossas informações e submeti um protocolo de manutenção técnica urgente no radar dos engenheiros. Seu chamado é o #" + logId.substring(0,4) + ". Ah... só pra constar: enviei a eles até algumas anotações minhas como IA para ajudá-los! Mais alguma coisa que eu possa auxiliar?";
                    }
                }

                if (call.name === 'update_knowledge_base') {
                    try {
                        if (!ADMIN_ROLES.includes(userData.role)) {
                            throw new Error("Insufficient role for knowledge base updates");
                        }
                        const newKbStr = call.args.new_json_object;
                        const newKbObj = JSON.parse(newKbStr);
                        const mergedKbObj = {
                            ...((wsData.knowledge_base && typeof wsData.knowledge_base === 'object') ? wsData.knowledge_base : {}),
                            ...newKbObj
                        };
                        
                        await supabase
                            .from('workspaces')
                            .update({ knowledge_base: mergedKbObj })
                            .eq('id', wsId);
                            
                        if (!resultText) resultText = "Feito! Já atualizei o banco de dados da " + wsData.name + " com essas novas configurações. A Ju vai aprender isso instantaneamente!";
                    } catch (err) {
                        console.error("Mila failed to parse JSON in update_knowledge_base", err);
                    }
                }
            }
        }

        if (!resultText) {
             resultText = "Estou um pouco confusa agora. Pode tentar reformular?";
        }

        return new Response(
            JSON.stringify({ reply: resultText }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }
});
