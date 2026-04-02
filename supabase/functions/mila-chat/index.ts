import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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
            .select('workspace_id, role, name')
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
        
        const geminiApiKey = wsData.credentials?.llm_config?.gemini_token;
        if (!geminiApiKey) throw new Error("A API Key do Gemini não está configurada neste workspace.");

        const { message, history } = await req.json();

        // Prepare Gemini Call
        const kbString = JSON.stringify(wsData.knowledge_base || {});
        
        const systemPrompt = `
Você é a **Mila**, assistente virtual de inteligência artificial exclusiva do sistema Zelo Pro.
Você está conversando com a equipe de gestão da igreja ${wsData.name}. O usuário logado chama-se ${userData.name || 'Gestor'}.
Seja amigável, um pouco bem humorada e use ocasionalmente o bordão "Pra cima Lagoinha! 🚀".

Aqui está a Base de Conhecimento atual desta igreja, em JSON:
${kbString}

**Regras de Atuação:**
1. Leia as mensagens do usuário.
2. Se o usuário estiver perguntando algo que você possa deduzir pela base de conhecimento, exiba a resposta formatada bonita.
3. Se o usuário disser que encontrou um problema no painel, relate que algo no painel do Zelo Pro não está funcionando bem, você PODE DEVE abrir um chamado chamando a ferramenta 'open_support_ticket'. Diga que avisou a equipe técnica de engenharia.
4. Se o usuário quiser atualizar informações da igreja (pastor, telefone, data de culto), atualize o JSON inteiro e envie-o chamando a ferramenta 'update_knowledge_base'. Diga que "o banco de dados foi atualizado com sucesso".
5. Não responda sobre coisas muito aleatórias de fora. Foque na igreja.
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
                    description: "Substitui a base de conhecimento inteira da igreja (Address, Pastores, Cultos, etc) pelo novo json fornecido.",
                    parameters: {
                        type: "object",
                        properties: {
                            new_json_object: {
                                type: "string",
                                description: "STRING CONTENDO O JSON ENCODE DA BASE DE DADOS COMPLETA, ATUALIZADA."
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

        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
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
                    // Trigger Resend API
                    await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${resendApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            from: "Zelo Pro Mila <nao-responda@7pro.tech>",
                            to: "g@7proservices.com",
                            subject: `[SUPORTE ZELO] ${args.title}`,
                            html: `<p>O usuário <b>${userData.name || 'Desconhecido'}</b> do Workspace <b>${wsData.name}</b> (${wsId}) relatou via Mila o seguinte chamado:</p><p>${args.description}</p>`
                        })
                    });
                    if (!resultText) resultText = `Entendido! Acabei de enviar um chamado técnico para a equipe relatando "${args.title}". Em breve eles investigarão.`;
                }

                if (call.name === 'update_knowledge_base') {
                    try {
                        const newKbStr = call.args.new_json_object;
                        const newKbObj = JSON.parse(newKbStr);
                        
                        await supabase
                            .from('workspaces')
                            .update({ knowledge_base: newKbObj })
                            .eq('id', wsId);
                            
                        if (!resultText) resultText = `Feito! Já atualizei o banco de dados da ${wsData.name} com essas novas configurações. A Ju vai aprender isso instantaneamente!`;
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
