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
            const emailHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Chamado Resolvido</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0d;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0d;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">

        <!-- LOGO -->
        <tr><td align="center" style="padding-bottom:32px;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:linear-gradient(135deg,#FBBF24,#F59E0B);border-radius:14px;width:44px;height:44px;text-align:center;vertical-align:middle;">
              <span style="color:#000;font-size:20px;font-weight:900;line-height:44px;display:block;">Z</span>
            </td>
            <td style="padding-left:10px;vertical-align:middle;">
              <span style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Zelo</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- CARD -->
        <tr><td style="background:#111117;border:1px solid rgba(255,255,255,0.06);border-radius:20px;overflow:hidden;">
          <tr><td style="height:3px;background:linear-gradient(90deg,#4ade80,rgba(74,222,128,0.1));"></td></tr>

          <tr><td style="padding:40px 40px 32px;">

            <!-- STATUS BADGE -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr><td style="background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);border-radius:50px;padding:6px 14px;">
                <span style="font-size:12px;font-weight:700;color:#4ade80;text-transform:uppercase;letter-spacing:1px;">✓ Chamado Resolvido</span>
              </td></tr>
            </table>

            <h1 style="margin:0 0 12px;font-size:24px;font-weight:900;color:#fff;letter-spacing:-0.6px;">Boas notícias! 🎉</h1>
            <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.6;">A equipe técnica do <strong style="color:#fff;">Zelo</strong> e a Mila resolveram o seu chamado. Confira o resumo abaixo.</p>

            <!-- TICKET BOX -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(0,0,0,0.25);border-left:3px solid #FBBF24;border-radius:0 12px 12px 0;margin-bottom:28px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 8px;font-size:16px;font-weight:800;color:#FBBF24;">${updatedTicket.title || 'Chamado Técnico'}</p>
                <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);line-height:1.6;">${updatedTicket.description || 'Sem descrição adicional.'}</p>
                ${resolutionText ? `<p style="margin:16px 0 0;font-size:13px;color:#4ade80;font-style:italic;"><strong style="color:#4ade80;">📝 Nota Técnica:</strong> ${resolutionText}</p>` : ''}
              </td></tr>
            </table>

            <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.6;">Se continuar a encontrar problemas, responda este e-mail ou acesse novamente a Mila no painel Zelo.</p>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
              <a href="https://zelo.7prolabs.com" style="display:inline-block;background:linear-gradient(135deg,#FBBF24,#F59E0B);color:#000;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:14px;font-weight:800;letter-spacing:0.3px;">Acessar o Painel →</a>
            </td></tr></table>

          </td></tr>

          <!-- FOOTER -->
          <tr><td style="padding:22px 40px;border-top:1px solid rgba(255,255,255,0.05);">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-size:12px;color:rgba(255,255,255,0.2);">Com carinho, equipe <strong style="color:rgba(255,255,255,0.35);">Zelo &amp; Mila</strong> 💛</td>
              <td align="right" style="font-size:12px;color:rgba(255,255,255,0.15);">Desenvolvido por 7 Pro Labs</td>
            </tr></table>
          </td></tr>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

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
