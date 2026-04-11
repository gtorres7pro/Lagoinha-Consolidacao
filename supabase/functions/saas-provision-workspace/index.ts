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
                    <p>Olá ${user_name}, bem-vindo ao Zelo Pro!</p>
                    <p>Seu workspace <strong>${workspace_name}</strong> foi criado com sucesso e você tem 7 dias de trial gratuito do plano Founders.</p>
                    <p><strong>Acesse seu painel com a senha inicial:</strong> ${genPassword}</p>
                    <p><a href="https://zelo.7prolabs.com/${slug}/dashboard.html">Clique aqui para acessar o painel</a>.</p>
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
