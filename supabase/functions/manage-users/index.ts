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

    if (!callerProfile || !['master_admin', 'church_admin'].includes(callerProfile.role)) {
      throw new Error('Permissões insuficientes')
    }

    // Initialize Admin Supabase Client explicitly for user creation/deletion
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    const { action, id, email, name, phone, role, workspace_id, password } = payload

    // Prevent church_admin from managing users outside their workspace
    if (callerProfile.role === 'church_admin') {
      if (workspace_id && workspace_id !== callerProfile.workspace_id) {
        throw new Error('Você só pode gerenciar usuários do seu próprio Workspace.')
      }
      if (['master_admin'].includes(role)) {
        throw new Error('Você não pode criar Master Admins.')
      }
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
          status: 'Ativo'
        }
      })
      if (createErr) throw createErr;

      // Send Custom Invitaton Email if RESEND_API_KEY is available
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        // Fetch workspace name
        const { data: wsData } = await supabaseAdmin.from('workspaces').select('name, slug').eq('id', workspace_id).single()
        
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
                  <p>Você acaba de ser adicionado à equipe da igreja <strong>${wsData?.name || ''}</strong> no Lago HUB.</p>
                  <p>Abaixo estão suas credenciais para o primeiro acesso:</p>
                  <div style="background-color: #222; padding: 15px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 16px;">
                    E-mail: ${email}<br/>
                    Senha: ${genPassword}
                  </div>
                  <p>Por favor, guarde esta senha ou altere-a ao entrar no painel.</p>
                  <div style="text-align: center; margin-top: 30px;">
                    <a href="https://app.consolidacao.7pro.tech/${wsData?.slug || ''}/login.html" style="background-color: #FFD700; color: #000; padding: 14px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Acessar o Painel</a>
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
      const targetUser = await supabaseAdmin.from('users').select('workspace_id, role').eq('id', id).single()

      if (callerProfile.role === 'church_admin') {
        if (targetUser.data?.workspace_id !== callerProfile.workspace_id) throw new Error('Acesso negado')
        if (targetUser.data?.role === 'master_admin' || role === 'master_admin') throw new Error('Bloqueado master')
      }

      // Update auth
      const updatePayload: any = {}
      if (email) updatePayload.email = email
      if (password) updatePayload.password = password
      const { error: authUpdErr } = await supabaseAdmin.auth.admin.updateUserById(id, updatePayload)
      if (authUpdErr) throw authUpdErr;

      // Update public row (if name, phone, role changed)
      const { error: pubUpdErr } = await supabaseAdmin.from('users').update({
        role: role || targetUser.data?.role,
        name: name,
        phone: phone
      }).eq('id', id)
      if (pubUpdErr) throw pubUpdErr;

      return new Response(JSON.stringify({ message: 'User updated successfully' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'delete') {
      if (!id) throw new Error('ID missing')
      const targetUser = await supabaseAdmin.from('users').select('workspace_id, role').eq('id', id).single()
      if (callerProfile.role === 'church_admin') {
        if (targetUser.data?.workspace_id !== callerProfile.workspace_id || targetUser.data?.role === 'master_admin') {
          throw new Error('Acesso negado para excluir')
        }
      }

      await supabaseAdmin.from('users').delete().eq('id', id)
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(id)
      if (delErr) throw delErr;

      return new Response(JSON.stringify({ message: 'User deleted' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'resend_invite') {
      // Just resets the password to a temp and re-emails it
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
                <a href="https://app.consolidacao.7pro.tech/${wsData?.slug}/login.html" style="color: #FFD700;">Acessar o Painel Agora</a>
              </div>
            `
          })
        })
      }
      return new Response(JSON.stringify({ message: 'Invite resent with new temp password', tempPassword: genPassword }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error('Invalid action')
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
