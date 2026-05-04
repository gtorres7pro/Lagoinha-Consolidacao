import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { ADMIN_ROLES, CORS_HEADERS, authorizeWorkspaceUser, json } from "../_shared/auth.ts"

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v25.0";

async function exchangeToken(shortToken: string) {
  const APP_ID = Deno.env.get('FB_APP_ID');
  const APP_SECRET = Deno.env.get('FB_APP_SECRET');
  if (!APP_ID || !APP_SECRET) throw new Error('Missing FB_APP_ID or FB_APP_SECRET in environment variables');
  if (!shortToken) throw new Error('Missing Facebook access token');

  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: APP_ID,
    client_secret: APP_SECRET,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || 'Failed to exchange Facebook token');
  return data.access_token as string;
}

async function exchangeCode(code: string) {
  const APP_ID = Deno.env.get('FB_APP_ID');
  const APP_SECRET = Deno.env.get('FB_APP_SECRET');
  if (!APP_ID || !APP_SECRET) throw new Error('Missing FB_APP_ID or FB_APP_SECRET in environment variables');
  if (!code) throw new Error('Missing Embedded Signup authorization code');

  const params = new URLSearchParams({
    client_id: APP_ID,
    client_secret: APP_SECRET,
    code,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || 'Failed to exchange Embedded Signup code');
  return data.access_token as string;
}

async function fetchAccounts(longToken: string) {
  const bizRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/businesses`, {
    headers: { 'Authorization': `Bearer ${longToken}` },
  });
  const bizData = await bizRes.json();
  if (!bizRes.ok || bizData.error) throw new Error(bizData.error?.message || 'Failed to fetch businesses');

  const accounts: any[] = [];
  const businesses = bizData.data || [];
  for (const biz of businesses) {
    const wabaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${biz.id}/client_whatsapp_business_accounts`, {
      headers: { 'Authorization': `Bearer ${longToken}` },
    });
    const wabaData = await wabaRes.json();
    const wabas = wabaData.data || [];

    const wabaOwnedRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${biz.id}/owned_whatsapp_business_accounts`, {
      headers: { 'Authorization': `Bearer ${longToken}` },
    });
    const wabaOwnedData = await wabaOwnedRes.json();
    wabas.push(...(wabaOwnedData.data || []));

    for (const waba of wabas) {
      const phoneRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${waba.id}/phone_numbers`, {
        headers: { 'Authorization': `Bearer ${longToken}` },
      });
      const phoneData = await phoneRes.json();
      for (const phone of (phoneData.data || [])) {
        if (!accounts.some((a) => a.phone_id === phone.id)) {
          accounts.push({
            waba_id: waba.id,
            waba_name: waba.name,
            phone_id: phone.id,
            phone_display: phone.display_phone_number,
          });
        }
      }
    }
  }
  return accounts;
}

async function fetchAccountFromSession(longToken: string, sessionInfo: Record<string, any>) {
  const wabaIds = [
    sessionInfo?.waba_id,
    ...(Array.isArray(sessionInfo?.waba_ids) ? sessionInfo.waba_ids : []),
  ].filter(Boolean);

  const accounts: any[] = [];
  for (const wabaId of [...new Set(wabaIds)]) {
    const wabaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}?fields=id,name`, {
      headers: { 'Authorization': `Bearer ${longToken}` },
    });
    const waba = await wabaRes.json();
    if (!wabaRes.ok || waba.error) {
      console.warn(`[WA-AUTH] Could not fetch WABA ${wabaId}:`, waba.error?.message || JSON.stringify(waba));
      continue;
    }

    const phoneRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, {
      headers: { 'Authorization': `Bearer ${longToken}` },
    });
    const phoneData = await phoneRes.json();
    if (!phoneRes.ok || phoneData.error) {
      console.warn(`[WA-AUTH] Could not fetch phones for WABA ${wabaId}:`, phoneData.error?.message || JSON.stringify(phoneData));
      continue;
    }

    for (const phone of (phoneData.data || [])) {
      if (!accounts.some((a) => a.phone_id === phone.id)) {
        accounts.push({
          waba_id: waba.id,
          waba_name: waba.name,
          phone_id: phone.id,
          phone_display: phone.display_phone_number || phone.verified_name || phone.id,
        });
      }
    }
  }

  return accounts;
}

async function subscribeAppToWaba(longToken: string, wabaId: string) {
  if (!wabaId) throw new Error('Missing WABA ID for webhook subscription');
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${longToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error?.message || 'Failed to subscribe app to WABA webhooks');
  return data;
}

async function getWorkspaceCredentials(workspaceId: string) {
  const { data: ws, error } = await sb
    .from('workspaces')
    .select('credentials, knowledge_base')
    .eq('id', workspaceId)
    .single();
  if (error || !ws) throw new Error('Workspace not found');
  return {
    credentials: ws.credentials || {},
    knowledge_base: ws.knowledge_base || {},
  };
}

async function updateCredentials(workspaceId: string, credentials: Record<string, unknown>) {
  const { error } = await sb
    .from('workspaces')
    .update({ credentials })
    .eq('id', workspaceId);
  if (error) throw error;
}

function publicAccount(account: any) {
  return {
    waba_id: account?.waba_id || '',
    waba_name: account?.waba_name || '',
    phone_id: account?.phone_id || '',
    phone_display: account?.phone_display || account?.phone_id || '',
  };
}

async function persistMetaAccount(args: {
  workspaceId: string,
  longToken: string,
  account: any,
  signupMode?: string,
  sessionInfo?: Record<string, any>,
}) {
  const { credentials } = await getWorkspaceCredentials(args.workspaceId);
  const account = publicAccount(args.account);
  if (!account.phone_id || !account.waba_id) throw new Error('Missing WhatsApp account selection');

  let webhookSubscribed = false;
  try {
    await subscribeAppToWaba(args.longToken, account.waba_id);
    webhookSubscribed = true;
  } catch (e: any) {
    console.warn('[WA-AUTH] WABA webhook subscription failed:', e.message);
  }

  await updateCredentials(args.workspaceId, {
    ...credentials,
    whatsapp_mode: 'meta',
    whatsapp_token: args.longToken,
    phone_id: account.phone_id,
    business_id: account.waba_id,
    waba_id: account.waba_id,
    waba_name: account.waba_name,
    phone_display: account.phone_display,
    meta_connected_at: new Date().toISOString(),
    meta_signup_mode: args.signupMode || 'embedded_signup',
    meta_finish_event: args.sessionInfo?.finish_event || null,
    meta_business_id: args.sessionInfo?.business_id || null,
    ...(webhookSubscribed ? { meta_webhook_subscribed_at: new Date().toISOString() } : {}),
  });

  return { account, webhookSubscribed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { action, short_lived_token, workspace_id } = body;

    if (!action) {
      throw new Error('Action is required');
    }
    if (!workspace_id) {
      throw new Error('workspace_id is required');
    }

    const authz = await authorizeWorkspaceUser(req, sb, workspace_id, ADMIN_ROLES);
    if (!authz.ok) {
      return json({ error: authz.error }, authz.status);
    }

    if (action === 'fetch-accounts') {
      const longToken = await exchangeToken(short_lived_token);
      const accounts = await fetchAccounts(longToken);
      return json({ accounts: accounts.map(publicAccount) });
    }

    if (action === 'save-account') {
      const requested = publicAccount(body.account);
      if (!requested.phone_id || !requested.waba_id) throw new Error('Missing WhatsApp account selection');

      const longToken = await exchangeToken(short_lived_token);
      const accounts = await fetchAccounts(longToken);
      const matched = accounts.find((a) => a.phone_id === requested.phone_id && a.waba_id === requested.waba_id);
      if (!matched) throw new Error('Selected WhatsApp account is not available for this Facebook user');

      const { account, webhookSubscribed } = await persistMetaAccount({
        workspaceId: workspace_id,
        longToken,
        account: matched,
        signupMode: 'legacy_access_token',
      });
      return json({ status: 'saved', account, webhook_subscribed: webhookSubscribed });
    }

    if (action === 'complete-embedded-signup') {
      const code = String(body.code || '').trim();
      const sessionInfo = body.session_info && typeof body.session_info === 'object' ? body.session_info : {};
      const longToken = await exchangeCode(code);

      const sessionAccounts = await fetchAccountFromSession(longToken, sessionInfo);
      const fallbackAccounts = sessionAccounts.length ? [] : await fetchAccounts(longToken).catch((e) => {
        console.warn('[WA-AUTH] fallback fetchAccounts failed:', e.message);
        return [];
      });
      const accounts = sessionAccounts.length ? sessionAccounts : fallbackAccounts;
      if (!accounts.length) {
        throw new Error('Meta conectou o WABA, mas não retornou nenhum Phone Number ID. Complete a verificação do número no popup de coexistência e tente novamente.');
      }

      const requestedPhoneId = sessionInfo.phone_number_id || '';
      const requestedWabaId = sessionInfo.waba_id || '';
      const matched = accounts.find((a) =>
        (requestedPhoneId && a.phone_id === requestedPhoneId) ||
        (requestedWabaId && a.waba_id === requestedWabaId)
      ) || accounts[0];

      const { account, webhookSubscribed } = await persistMetaAccount({
        workspaceId: workspace_id,
        longToken,
        account: matched,
        signupMode: body.signup_mode || 'embedded_signup',
        sessionInfo,
      });
      return json({ status: 'saved', account, webhook_subscribed: webhookSubscribed });
    }

    if (action === 'status') {
      const { credentials } = await getWorkspaceCredentials(workspace_id);
      const connected = !!(credentials.whatsapp_token && credentials.phone_id);
      return json({
        connected,
        phone_display: credentials.phone_display || credentials.phone_id || '',
        phone_id: credentials.phone_id || '',
        waba_id: credentials.waba_id || credentials.business_id || '',
        waba_name: credentials.waba_name || 'WhatsApp Business Account',
        meta_connected_at: credentials.meta_connected_at || '',
        ia_active: credentials.ia_active !== false,
      });
    }

    if (action === 'set-ai-active') {
      const { credentials } = await getWorkspaceCredentials(workspace_id);
      await updateCredentials(workspace_id, { ...credentials, ia_active: body.is_active === true });
      return json({ ok: true });
    }

    if (action === 'disconnect') {
      const { credentials } = await getWorkspaceCredentials(workspace_id);
      delete credentials.whatsapp_token;
      delete credentials.phone_id;
      delete credentials.business_id;
      delete credentials.waba_id;
      delete credentials.waba_name;
      delete credentials.phone_display;
      delete credentials.meta_connected_at;
      delete credentials.whatsapp_mode;
      await updateCredentials(workspace_id, credentials);
      return json({ ok: true });
    }

    if (action === 'manual-save') {
      const phoneId = String(body.phone_id || '').trim();
      const token = String(body.token || '').trim();
      if (!phoneId || !token) throw new Error('Phone ID and Access Token are required');

      const { credentials } = await getWorkspaceCredentials(workspace_id);
      await updateCredentials(workspace_id, {
        ...credentials,
        whatsapp_mode: 'meta',
        whatsapp_token: token,
        phone_id: phoneId,
        phone_display: phoneId,
        business_id: String(body.business_id || '').trim() || credentials.business_id || credentials.waba_id || null,
        waba_id: String(body.business_id || '').trim() || credentials.waba_id || credentials.business_id || null,
        app_secret: String(body.app_secret || '').trim() || credentials.app_secret || null,
        meta_connected_at: new Date().toISOString(),
      });
      return json({ ok: true });
    }

    if (action === 'ia-settings-get') {
      const { credentials, knowledge_base } = await getWorkspaceCredentials(workspace_id);
      return json({
        settings: {
          ia_active: credentials.ia_active === true,
          ia_memory_enabled: credentials.ia_memory_enabled === true,
          ia_system_prompt: credentials.ia_system_prompt || '',
        },
        knowledge_base,
      });
    }

    if (action === 'ia-settings-save') {
      const { credentials } = await getWorkspaceCredentials(workspace_id);
      await updateCredentials(workspace_id, {
        ...credentials,
        ia_active: body.ia_active === true,
        ia_memory_enabled: body.ia_memory_enabled === true,
        ia_system_prompt: String(body.ia_system_prompt || '').trim() || null,
      });
      return json({ ok: true });
    }

    if (action === 'notification-settings-get') {
      const { credentials } = await getWorkspaceCredentials(workspace_id);
      return json({ notifications: credentials.notifications || {} });
    }

    if (action === 'notification-settings-save') {
      const { credentials } = await getWorkspaceCredentials(workspace_id);
      await updateCredentials(workspace_id, {
        ...credentials,
        notifications: {
          ...(credentials.notifications || {}),
          email_pastor: body.email_pastor !== false,
        },
      });
      return json({ ok: true });
    }

    if (action === 'financial-settings-get') {
      const { credentials } = await getWorkspaceCredentials(workspace_id);
      return json({
        local_currency: credentials.local_currency || '',
        financial_contact_email: credentials.financial_contact_email || '',
      });
    }

    throw new Error('Invalid action');

  } catch (error: any) {
    console.error('Error:', error.message);
    return json({ ok: false, error: error.message });
  }
});
