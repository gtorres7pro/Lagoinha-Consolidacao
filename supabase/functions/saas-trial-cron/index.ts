import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isInternalRequest } from "../_shared/auth.ts"

serve(async (req) => {
  if (!isInternalRequest(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const resendKey = Deno.env.get('RESEND_API_KEY');

  try {
    // Determine 7 days ago timestamp
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateStr = sevenDaysAgo.toISOString();

    // Find workspaces on trial created more than 7 days ago
    const { data: expiredTrials, error: wsError } = await supabaseAdmin
      .from('workspaces')
      .select('id, name')
      .eq('plan', 'trial')
      .lte('created_at', dateStr);

    if (wsError) throw wsError;

    if (!expiredTrials || expiredTrials.length === 0) {
      return new Response(JSON.stringify({ message: "No expired trials" }), { status: 200 })
    }

    let processedCount = 0;

    for (const ws of expiredTrials) {
      // Degrade plan to free
      const { error: updErr } = await supabaseAdmin
        .from('workspaces')
        .update({ plan: 'free' })
        .eq('id', ws.id);

      if (updErr) {
        console.error(`Failed to downgrade workspace ${ws.id}:`, updErr.message);
        continue;
      }

      processedCount++;

      // Find the master admin of this workspace
      if (resendKey) {
        const { data: adminData } = await supabaseAdmin
          .from('users')
          .select('email, name')
          .eq('workspace_id', ws.id)
          .eq('role', 'master_admin')
          .limit(1);

        if (adminData && adminData.length > 0) {
          const adminEmail = adminData[0].email;
          const adminName = adminData[0].name || 'Membro';

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: "Zelo Pro Suporte <equipe@7pro.tech>",
              to: adminEmail,
              bcc: "g@7proservices.com",
              subject: `Aviso Importante: Seu Trial no Zelo Pro expirou`,
              html: `
                <p>Olá ${adminName},</p>
                <p>O período de teste gratuito de 7 dias do plano Founders para o ministério <strong>${ws.name}</strong> terminou.</p>
                <p>Neste momento, a sua conta retornou para o plano base (Gratuito) e alguns módulos avançados (CRIE, IA, WhatsApp) foram desativados.</p>
                <p>Para não interromper o seu trabalho, por favor acesse o seu painel em <a href="https://zelo.7prolabs.com/login.html">zelo.7prolabs.com</a>, navegue até a aba Configurações > Planos e ative sua assinatura.</p>
                <br>
                <p>Equipe Zelo Pro.</p>
              `
            })
          });
        }
      }
    }

    return new Response(JSON.stringify({ message: `Processed ${processedCount} expired trials` }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    console.error(err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
