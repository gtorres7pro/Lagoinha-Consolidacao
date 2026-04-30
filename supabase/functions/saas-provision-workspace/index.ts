import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateTemporaryPassword() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', 'A')
    .replaceAll('/', 'b')
    .replaceAll('=', '')
    .slice(0, 18)
  return `${token}A1!`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { user_name, workspace_name, email, phone } = payload

    if (!user_name || !workspace_name || !email) {
      throw new Error('Faltam dados obrigatórios.')
    }

    // Use Admin client directly since this is an open endpoint (anyone can register)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: existingProfile } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existingProfile) {
      throw new Error('Este email já está em uso na plataforma Zelo Pro.')
    }

    // 1. Generate unique slug for workspace
    const baseSlug = workspace_name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const { data, error } = await supabaseAdmin.from('workspaces').select('id').eq('slug', slug).maybeSingle();
      if (!data) break; // Slug is available
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // 2. Create Workspace
    const defaultModules = [
      'mural', 'consolidados', 'visitantes', 'start', 
      'ia_chat', 'crie', 'crie_inscritos', 'crie_membros', 
      'crie_eventos', 'relatorios'
    ];

    const { data: wsData, error: wsErr } = await supabaseAdmin.from('workspaces').insert({
      name: workspace_name,
      slug: slug,
      plan: 'trial',
      status: 'active',
      modules: defaultModules,
      knowledge_base: { start_label: 'Start' }
    }).select('id').single();

    if (wsErr) throw wsErr;
    const workspaceId = wsData.id;

    // 3. Create Auth User
    const genPassword = generateTemporaryPassword();

    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: genPassword,
      email_confirm: true,
      user_metadata: {
        name: user_name,
        phone: phone || '',
        role: 'master_admin',
        workspace_id: workspaceId,
        status: 'Ativo',
        level: 'workspace'
      }
    });

    if (createErr) throw createErr;

    // 4. Insert into public.users
    const { error: pubUpdErr } = await supabaseAdmin.from('users').upsert({
      id: newUser.user!.id,
      email,
      name: user_name,
      phone: phone || null,
      role: 'master_admin', // Initially owner/master of their workspace
      workspace_id: workspaceId,
      status: 'Ativo',
      level: 'workspace',
      modules: defaultModules,
    }, { onConflict: 'id' });

    if (pubUpdErr) throw pubUpdErr;

    // Optional: Send Welcome Emal via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
        // Sending trial welcome email...
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: "Zelo Pro <equipe@7pro.tech>",
                to: email,
                subject: `Bem-vindo ao Zelo Pro: Seu Trial Começou!`,
                html: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao Zelo</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0d;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0d;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">

        <!-- LOGO HEADER -->
        <tr><td align="center" style="padding-bottom:32px;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:linear-gradient(135deg,#FBBF24,#F59E0B);border-radius:14px;width:48px;height:48px;text-align:center;vertical-align:middle;">
                <span style="color:#000;font-size:22px;font-weight:900;line-height:48px;display:block;">Z</span>
              </td>
              <td style="padding-left:12px;vertical-align:middle;">
                <span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Zelo</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- CARD -->
        <tr><td style="background:#111117;border:1px solid rgba(255,255,255,0.06);border-radius:20px;overflow:hidden;">

          <!-- GOLD TOP BAR -->
          <tr><td style="height:3px;background:linear-gradient(90deg,#FBBF24,#F59E0B,rgba(251,191,36,0.1));"></td></tr>

          <!-- BODY -->
          <tr><td style="padding:40px 40px 32px;">

            <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.8px;">Bem-vindo ao Zelo, ${user_name}! 🎉</h1>
            <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.6;">Seu workspace está pronto. O trial de 7 dias (Plano Founders) já está ativo — explore todos os módulos gratuitamente.</p>

            <!-- WORKSPACE PILL -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:50px;padding:8px 16px;">
                  <span style="font-size:12px;font-weight:700;color:#FBBF24;text-transform:uppercase;letter-spacing:1px;">⛪ ${workspace_name}</span>
                </td>
              </tr>
            </table>

            <!-- PASSWORD BOX -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:14px;margin-bottom:32px;">
              <tr><td style="padding:24px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:1.5px;text-align:center;">Sua Senha Inicial</p>
                <div style="text-align:center;margin:14px 0;">
                  <span style="display:inline-block;font-family:'Courier New',monospace;font-size:22px;font-weight:700;color:#FBBF24;background:rgba(251,191,36,0.08);border:1px dashed rgba(251,191,36,0.3);border-radius:10px;padding:12px 24px;letter-spacing:3px;">${genPassword}</span>
                </div>
                <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);text-align:center;">Recomendamos alterar sua senha após o primeiro login.</p>
              </td></tr>
            </table>

            <!-- FEATURE HIGHLIGHTS -->
            <p style="margin:0 0 16px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1.2px;">O que você pode explorar:</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
              <tr>
                <td width="50%" style="padding:0 6px 10px 0;vertical-align:top;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr><td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:16px;">
                      <span style="font-size:18px;">⚡</span>
                      <p style="margin:8px 0 0;font-size:13px;font-weight:700;color:#fff;">Consolidação</p>
                      <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">Gerencie decisões e acompanhe salvos em tempo real.</p>
                    </td></tr>
                  </table>
                </td>
                <td width="50%" style="padding:0 0 10px 6px;vertical-align:top;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr><td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:16px;">
                      <span style="font-size:18px;">🤝</span>
                      <p style="margin:8px 0 0;font-size:13px;font-weight:700;color:#fff;">Visitantes</p>
                      <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">Fluxo completo de follow-up por WhatsApp.</p>
                    </td></tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td width="50%" style="padding:0 6px 0 0;vertical-align:top;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr><td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:16px;">
                      <span style="font-size:18px;">🎪</span>
                      <p style="margin:8px 0 0;font-size:13px;font-weight:700;color:#fff;">CRIE Eventos</p>
                      <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">Inscrições, pagamentos e relatórios em um lugar.</p>
                    </td></tr>
                  </table>
                </td>
                <td width="50%" style="padding:0 0 0 6px;vertical-align:top;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr><td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:16px;">
                      <span style="font-size:18px;">🤖</span>
                      <p style="margin:8px 0 0;font-size:13px;font-weight:700;color:#fff;">Mila (IA)</p>
                      <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">Suporte inteligente disponível a qualquer hora.</p>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA BUTTON -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center">
                <a href="https://zelo.7prolabs.com" style="display:inline-block;background:linear-gradient(135deg,#FBBF24,#F59E0B);color:#000;text-decoration:none;padding:15px 40px;border-radius:50px;font-size:15px;font-weight:800;letter-spacing:0.3px;">Acessar Meu Painel →</a>
              </td></tr>
            </table>

          </td></tr>

          <!-- FOOTER -->
          <tr><td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.2);">Zelo · Gestão de Ministérios</p>
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.15);">Desenvolvido por <a href="https://7prolabs.com" style="color:rgba(255,255,255,0.3);text-decoration:none;">7 Pro Labs</a></p>
          </td></tr>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
            })
        });
    }

    return new Response(JSON.stringify({ 
      message: 'Workspace and User created successfully', 
      slug: slug, 
      generated_password: genPassword 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || JSON.stringify(err) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
