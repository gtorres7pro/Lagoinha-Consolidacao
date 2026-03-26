import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Roles with full access (no restrictions)
const ADMIN_ROLES = ['master_admin', 'pastor_senior', 'church_admin', 'admin']
// Roles that cannot be assigned by non-master callers
const PROTECTED_ROLES = ['master_admin', 'pastor_senior']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify caller privileges
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Não autorizado')

    const { data: callerProfile } = await supabaseClient
      .from('users')
      .select('role, workspace_id')
      .eq('id', user.id)
      .single()

    if (!callerProfile || !ADMIN_ROLES.includes(callerProfile.role)) {
      throw new Error('Permissões insuficientes')
    }

    // Initialize Admin Supabase Client explicitly for user creation/deletion
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    const { action, id, email, name, phone, role, workspace_id, password, status, modules } = payload

    const callerIsMaster = ['master_admin', 'pastor_senior'].includes(callerProfile.role)

    // Prevent non-master admins from managing users outside their workspace
    if (!callerIsMaster) {
      if (workspace_id && workspace_id !== callerProfile.workspace_id) {
        throw new Error('Você só pode gerenciar usuários do seu próprio Workspace.')
      }
      if (role && PROTECTED_ROLES.includes(role)) {
        throw new Error('Você não pode criar usuários com este papel.')
      }
    }

    if (action === 'list') {
      // Use admin client to bypass RLS — master_admin needs to see any workspace
      if (!workspace_id) throw new Error('workspace_id missing')
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, phone, status, modules')
        .eq('workspace_id', workspace_id)
        .order('role')
      if (error) throw error
      return new Response(JSON.stringify({ users: data || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'create') {
      if (!email || !role || !workspace_id) throw new Error('Dados faltando (email, role, workspace_id)')
      
      const genPassword = password || Math.random().toString(36).slice(-8) + 'A1!'
      
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: genPassword,
        email_confirm: true,
        user_metadata: {
          name: name || '',
          phone: phone || '',
          role,
          workspace_id,
          status: 'Ativo',
          level: 'workspace'
        }
      })
      if (createErr) throw createErr;

      // Insert into public.users (trigger may also do this, but we need modules)
      await supabaseAdmin.from('users').upsert({
        id: newUser.user!.id,
        email,
        name: name || '',
        phone: phone || null,
        role,
        workspace_id,
        status: 'Ativo',
        level: 'workspace',
        modules: modules || null,
      }, { onConflict: 'id' })

      // Send Invitation Email if RESEND_API_KEY is available
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        const { data: wsData } = await supabaseAdmin.from('workspaces').select('name, slug').eq('id', workspace_id).single()
        const roleLabel: Record<string,string> = {
          pastor_senior: 'Pastor Sênior', admin: 'Admin', pastor: 'Pastor',
          lider_ministerio: 'Líder de Ministério', user: 'Voluntário'
        }
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: "Lago HUB <equipe@7pro.tech>",
            to: email,
            subject: `Convite para acesso ao Lago HUB - ${wsData?.name || 'Sua Igreja'}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; color: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #333;">
                <div style="background-color: #FFD700; padding: 20px; text-align: center;">
                  <h1 style="color: #000; margin: 0;">Bem-vindo ao Lago HUB</h1>
                </div>
                <div style="padding: 30px;">
                  <h2>Olá${name ? ' ' + name : ''},</h2>
                  <p>Você acaba de ser adicionado à equipe da igreja <strong>${wsData?.name || ''}</strong> no Lago HUB como <strong>${roleLabel[role] || role}</strong>.</p>
                  <p>Abaixo estão suas credenciais para o primeiro acesso:</p>
                  <div style="background-color: #222; padding: 15px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 16px;">
                    E-mail: ${email}<br/>
                    Senha: ${genPassword}
                  </div>
                  <p>Por favor, guarde esta senha ou altere-a ao entrar no painel.</p>
                  <div style="text-align: center; margin-top: 30px;">
                    <a href="https://hub.7pro.tech/${wsData?.slug || ''}/dashboard.html" style="background-color: #FFD700; color: #000; padding: 14px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Acessar o Painel</a>
                  </div>
                </div>
              </div>
            `
          })
        })
      }

      return new Response(JSON.stringify({ message: 'User created', user: newUser, tempPassword: genPassword }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'update') {
      if (!id) throw new Error('Falta o ID do usuário')
      const { data: targetUser } = await supabaseAdmin.from('users').select('workspace_id, role').eq('id', id).single()

      if (!callerIsMaster) {
        if (targetUser?.workspace_id !== callerProfile.workspace_id) throw new Error('Acesso negado')
        if (PROTECTED_ROLES.includes(targetUser?.role) || (role && PROTECTED_ROLES.includes(role))) {
          throw new Error('Bloqueado: papel protegido')
        }
      }

      // Update auth email/password
      const updatePayload: any = {}
      if (email) updatePayload.email = email
      if (password) updatePayload.password = password
      if (Object.keys(updatePayload).length) {
        const { error: authUpdErr } = await supabaseAdmin.auth.admin.updateUserById(id, updatePayload)
        if (authUpdErr) throw authUpdErr;
      }

      // Update public row
      const publicUpdate: any = {}
      if (name !== undefined) publicUpdate.name = name
      if (phone !== undefined) publicUpdate.phone = phone || null
      if (role) publicUpdate.role = role
      if (status) publicUpdate.status = status
      if (modules !== undefined) publicUpdate.modules = modules

      const { error: pubUpdErr } = await supabaseAdmin.from('users').update(publicUpdate).eq('id', id)
      if (pubUpdErr) throw pubUpdErr;

      return new Response(JSON.stringify({ message: 'User updated successfully' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'delete') {
      if (!id) throw new Error('ID missing')
      const { data: targetUser } = await supabaseAdmin.from('users').select('workspace_id, role').eq('id', id).single()
      if (!callerIsMaster) {
        if (targetUser?.workspace_id !== callerProfile.workspace_id || PROTECTED_ROLES.includes(targetUser?.role)) {
          throw new Error('Acesso negado para excluir')
        }
      }
      await supabaseAdmin.from('users').delete().eq('id', id)
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(id)
      if (delErr) throw delErr;

      return new Response(JSON.stringify({ message: 'User deleted' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'resend_invite') {
      if (!id || !email) throw new Error('ID or Email missing')
      const genPassword = Math.random().toString(36).slice(-8) + 'A1!'
      await supabaseAdmin.auth.admin.updateUserById(id, { password: genPassword })
      
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        const { data: wsData } = await supabaseAdmin.from('workspaces').select('name, slug').eq('id', workspace_id || callerProfile.workspace_id).single()
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: "Lago HUB <equipe@7pro.tech>",
            to: email,
            subject: `Redefinição de Acesso - Lago HUB`,
            html: `
              <div style="font-family: Arial, sans-serif; background-color: #0a0a0a; color: #fff; padding: 20px;">
                <h2 style="color: #FFD700;">Nova Senha Temporária</h2>
                <p>O administrador solicitou o reenvio do seu acesso.</p>
                <div style="background-color: #222; padding: 15px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 16px;">
                  Nova Senha: ${genPassword}
                </div>
                <a href="https://hub.7pro.tech/${wsData?.slug}/dashboard.html" style="color: #FFD700;">Acessar o Painel Agora</a>
              </div>
            `
          })
        })
      }
      return new Response(JSON.stringify({ message: 'Invite resent', tempPassword: genPassword }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error('Ação inválida')
  } catch (err: any) {
    // ALWAYS RETURN 200 IN ORDER FOR THE FRONTEND'S JS SDK TO PROPERLY PARSE THE CUSTOM JSON ERROR MESSAGE! 
    // IF WE RETURN 40X, THE JS SDK OBFUSCATES IT BEHIND "FunctionsHttpError: Edge Function returned a non-2xx status code"
    return new Response(JSON.stringify({ error: err.message || JSON.stringify(err) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
