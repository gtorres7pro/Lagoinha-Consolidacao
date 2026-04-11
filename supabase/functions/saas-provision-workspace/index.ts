import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const genPassword = Math.random().toString(36).slice(-8).toUpperCase() + 'A1!'; // e.g., ABCD123A1!
    
    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUsers?.users.find(u => u.email === email);
    if (emailExists) {
        // Technically, a user can be in multiple workspaces, but to keep registration simple,
        // we might block or we just link them. Let's assume unique emails for registration.
        throw new Error('Este email já está em uso na plataforma Zelo Pro.');
    }

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
                html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bem-vindo ao Zelo</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #111113; color: #f3f4f6;">
    <div style="width: 100%; background-color: #111113; padding: 40px 0;">
        <center>
            <div style="max-width: 600px; margin: 0 auto; background-color: #1e1b24; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.05); overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);">
                <div style="padding: 40px 40px 20px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #f59e0b; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Bem-vindo ao Zelo</h1>
                </div>
                <div style="padding: 20px 40px 40px 40px;">
                    <p style="font-size: 16px; line-height: 1.6; color: #d1d5db; margin: 0 0 20px 0;">Olá <strong style="color: #f9fafb; font-weight: 600;">${user_name}</strong>, é incrível ter você com a gente!</p>
                    <p style="font-size: 16px; line-height: 1.6; color: #d1d5db; margin: 0 0 20px 0;">Seu workspace <strong style="color: #f9fafb; font-weight: 600;">${workspace_name}</strong> foi criado com sucesso. O seu período de <strong style="color: #f9fafb; font-weight: 600;">Trial Gratuito de 7 dias</strong> (Plano Founders) já está ativo.</p>
                    
                    <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 24px; margin-bottom: 30px;">
                        <p style="margin: 0 0 5px 0; text-align: center; font-size: 14px; color: #9ca3af; font-weight: 600; letter-spacing: 1px;">SUA SENHA INICIAL DE ACESSO</p>
                        <div style="display: block; text-align: center; font-family: monospace; font-size: 24px; font-weight: bold; color: #f59e0b; background: rgba(245, 158, 11, 0.1); border: 1px dashed rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 16px; margin: 20px 0; letter-spacing: 2px;">
                            ${genPassword}
                        </div>
                        <p style="margin: 0; font-size: 13px; text-align: center; color: #9ca3af;">Recomendamos alterar sua senha após o primeiro login.</p>
                    </div>

                    <div style="text-align: center; margin-top: 10px;">
                        <a href="https://zelo.7prolabs.com" style="display: inline-block; background-color: #f59e0b; color: #000000; text-decoration: none; padding: 16px 32px; border-radius: 50px; font-weight: 600; font-size: 16px; letter-spacing: 0.5px;">Acessar Meu Painel</a>
                    </div>
                </div>
                <div style="padding: 30px 40px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.05);">
                    <p style="margin: 0 0 5px 0; font-size: 13px; color: #6b7280;">Zelo - Plataforma de Gestão e Consolidação</p>
                    <p style="margin: 0; font-size: 13px; color: #6b7280;">Desenvolvido por 7 Pro Labs</p>
                </div>
            </div>
        </center>
    </div>
</body>
</html>
                `
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
