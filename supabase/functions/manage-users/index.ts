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
    // verify_jwt: false — we do manual JWT validation here to avoid gateway 401s
    // (clock-skew or local dev environments can cause gateway to reject valid tokens)
    // Rule #10 from GEMINI.md: always use verify_jwt: false + manual auth.getUser()
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Token de autenticação ausente')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify caller via getUser (works with any valid Supabase JWT)
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Não autorizado — sessão inválida')

    const { data: callerProfile } = await supabaseClient
      .from('users')
      .select('role, workspace_id')
      .eq('id', user.id)
      .maybeSingle()

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
        .select('id, name, email, role, phone, status, modules, temp_password, password_changed')
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
      const { error: upsertErr } = await supabaseAdmin.from('users').upsert({
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
      if (upsertErr) console.error('[create] upsert error:', upsertErr.message)

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
            from: "Zelo Pro <equipe@7pro.tech>",
            to: email,
            subject: `Convite para acesso ao Zelo Pro - ${wsData?.name || 'Sua Igreja'}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #1a1a1a; padding: 40px 20px; min-height: 100vh;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
                  <!-- Header -->
                  <div style="background-color: #FFD700; padding: 32px 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; text-shadow: 0px 1px 2px rgba(0,0,0,0.1);">Bem-vindo ao Zelo Pro</h1>
                  </div>
                  
                  <!-- Body -->
                  <div style="padding: 40px 30px;">
                    <h2 style="color: #1a1a1a; margin-top: 0; margin-bottom: 24px; font-size: 22px; font-weight: 700;">Olá${name ? ' ' + name : ''},</h2>
                    
                    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                      Você foi adicionado à equipe de <strong>${wsData?.name || ''}</strong> como <strong>${roleLabel[role] || role}</strong>.
                    </p>
                    
                    <p style="color: #4a4a4a; font-size: 16px; margin-bottom: 16px;">Suas credenciais de acesso:</p>
                    
                    <!-- Credentials Box -->
                    <div style="background-color: #f3f4f6; border: 1px solid #e5e7eb; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                      <p style="margin: 0 0 8px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 15px; color: #1a1a1a;">
                        <span style="color: #6b7280;">E-mail:</span> <a href="mailto:${email}" style="color: #3b82f6; text-decoration: underline;">${email}</a>
                      </p>
                      <p style="margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 15px; color: #1a1a1a;">
                        <span style="color: #6b7280;">Senha:</span> <strong>${genPassword}</strong>
                      </p>
                    </div>
                    
                    <p style="color: #4a4a4a; font-size: 15px; margin-bottom: 32px;">Altere a senha após o primeiro acesso.</p>
                    
                    <!-- Button -->
                    <div style="text-align: center;">
                      <a href="https://zelo.7prolabs.com/${wsData?.slug || ''}/dashboard.html" style="background-color: #FFD700; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 700; display: inline-block; box-shadow: 0 2px 4px rgba(255, 215, 0, 0.3);">
                        Acessar o Painel
                      </a>
                    </div>
                  </div>
                </div>
                
                <!-- Footer -->
                <div style="text-align: center; margin-top: 24px;">
                  <p style="color: #666666; font-size: 12px;">Esta é uma mensagem automática. Por favor, não responda.</p>
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
      // Use a SECURITY DEFINER RPC to atomically delete from both public.users and auth.users
      const { error: rpcErr } = await supabaseAdmin.rpc('delete_user_by_id', { user_id: id })
      if (rpcErr) throw new Error(`Falha ao excluir: ${rpcErr.message}`)

      return new Response(JSON.stringify({ message: 'User deleted' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'resend_invite') {
      if (!id || !email) throw new Error('ID or Email missing')
      const genPassword = Math.random().toString(36).slice(-8) + 'A1!'
      
      // Update password in auth.users
      const { error: pwdErr } = await supabaseAdmin.auth.admin.updateUserById(id, { password: genPassword })
      if (pwdErr) throw new Error(`Falha ao redefinir senha: ${pwdErr.message}`)
      
      // Persist temp password in public.users so the admin can see it in the dashboard
      const { error: dbErr } = await supabaseAdmin.from('users').update({ 
        temp_password: genPassword, 
        password_changed: false 
      }).eq('id', id)
      if (dbErr) {
        console.error('[resend_invite] Failed to update temp_password:', dbErr.message)
      }

      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        const { data: wsData } = await supabaseAdmin.from('workspaces').select('name, slug').eq('id', workspace_id || callerProfile.workspace_id).single()
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: "Zelo Pro <equipe@7pro.tech>",
            to: email,
            subject: `Redefinição de Acesso - Zelo Pro`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #1a1a1a; padding: 40px 20px; min-height: 100vh;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
                  <div style="background-color: #FFD700; padding: 32px 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800;">Nova Senha</h1>
                  </div>
                  <div style="padding: 40px 30px;">
                    <h2 style="color: #1a1a1a; margin-top: 0;">Acesso redefinido,</h2>
                    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">O administrador solicitou o reenvio do seu acesso para a equipe de <strong>${wsData?.name || ''}</strong>.</p>
                    <div style="background-color: #f3f4f6; border: 1px solid #e5e7eb; padding: 20px; border-radius: 12px; margin: 24px 0;">
                      <p style="margin: 0 0 8px 0; font-family: monospace; font-size: 15px;"><span style="color: #6b7280;">E-mail:</span> ${email}</p>
                      <p style="margin: 0; font-family: monospace; font-size: 15px;"><span style="color: #6b7280;">Nova Senha:</span> <strong>${genPassword}</strong></p>
                    </div>
                    <div style="text-align: center;">
                      <a href="https://zelo.7prolabs.com/${wsData?.slug || ''}/dashboard.html" style="background-color: #FFD700; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 700; display: inline-block;">Acessar o Painel</a>
                    </div>
                  </div>
                </div>
              </div>
            `
          })
        })
      }
      return new Response(JSON.stringify({ message: 'Invite resent', tempPassword: genPassword }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error('Ação inválida')
  } catch (err: any) {
    // ALWAYS RETURN 200 so the JS SDK can parse the custom JSON error body
    // If we return 40x, the JS SDK obfuscates it behind "FunctionsHttpError: Edge Function returned a non-2xx status code"
    return new Response(JSON.stringify({ error: err.message || JSON.stringify(err) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
