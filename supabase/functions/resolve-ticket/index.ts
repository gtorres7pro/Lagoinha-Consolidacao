import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
        
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { ticketId, resolutionText } = await req.json();
        
        if (!ticketId) {
            return new Response(JSON.stringify({ error: "Missing ticketId" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 1. Update ticket to published
        const { data: updatedTicket, error: updateError } = await supabase
            .from('app_logs')
            .update({ status: 'published' })
            .eq('id', ticketId)
            .select()
            .single();

        if (updateError || !updatedTicket) {
            console.error(updateError);
            throw new Error("Erro ao atualizar o ticket");
        }

        // 2. Get user email
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('email')
            .eq('id', updatedTicket.submitted_by)
            .single();
        
        if (!userError && user && user.email) {
            // 3. Send email to user
            const emailHtml = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <style>
                body { font-family: 'Inter', Helvetica, sans-serif; background-color: #111; color: #EEE; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 40px auto; background: #1A1A1A; border: 1px solid #333; border-radius: 16px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #FFD700, #F59E0B); padding: 30px 40px; text-align: center; }
                .header h1 { margin: 0; color: #111; font-size: 24px; font-weight: 800; }
                .content { padding: 40px; }
                .content p { font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
                .ticket-box { background: #222; border-left: 4px solid #FFD700; padding: 20px; border-radius: 4px; margin: 30px 0; }
                .ticket-title { font-weight: bold; font-size: 18px; margin-bottom: 8px; color: #FFD700; }
                .ticket-desc { color: #BBB; font-size: 14px; }
                .resolution-note { margin-top: 15px; font-style: italic; color: #4CAF50; }
                .footer { background: #0A0A0A; padding: 20px 40px; text-align: center; color: #666; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Solicitação Resolvida!</h1>
                </div>
                <div class="content">
                  <p>Olá,</p>
                  <p>Boas notícias! A equipe técnica do <strong>Zelo Pro</strong> e a Mila resolveram o seu chamado.</p>
                  
                  <div class="ticket-box">
                    <div class="ticket-title">${updatedTicket.title || 'Chamado Técnico'}</div>
                    <div class="ticket-desc">${updatedTicket.description || 'Nenhuma descrição fornecida.'}</div>
                    ${resolutionText ? `<div class="resolution-note"><strong>Nota Técnica:</strong> ${resolutionText}</div>` : ''}
                  </div>
                  
                  <p>Se você continuar enfrentando problemas com isso, responda a este e-mail ou chame a Mila novamente!</p>
                  <p>Abraços,<br>Equipe Zelo Pro & Mila 💛</p>
                </div>
                <div class="footer">
                  © 2026 Zelo Pro. Todos os direitos reservados.
                </div>
              </div>
            </body>
            </html>
            `;

            await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resendApiKey}`
                },
                body: JSON.stringify({
                    from: "Zelo Pro Suporte <mila@7pro.tech>",
                    to: user.email,
                    subject: "Zelo Pro: Chamado Resolvido 🎉",
                    html: emailHtml
                })
            });
        }

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
