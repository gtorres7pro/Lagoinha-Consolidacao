import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * cm-stripe-connect — mirrors crie-stripe-connect but targets cm_settings on workspaces.
 * verify_jwt: false — manual auth via supabaseAdmin.auth.getUser(token)
 *
 * Body: { action: 'connect' | 'disconnect', workspace_id, stripe_secret_key?, stripe_publishable_key? }
 */

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ── Auth ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

  const body = await req.json().catch(() => ({}));
  const { action, workspace_id, stripe_secret_key, stripe_publishable_key } = body;

  if (!workspace_id) {
    return new Response(JSON.stringify({ error: "workspace_id required" }), { status: 400, headers: cors });
  }

  // ── Fetch existing cm_settings ────────────────────────────────────
  const { data: ws, error: wsErr } = await supabaseAdmin
    .from("workspaces")
    .select("cm_settings")
    .eq("id", workspace_id)
    .single();
  if (wsErr) return new Response(JSON.stringify({ error: wsErr.message }), { status: 400, headers: cors });

  const existing = ws?.cm_settings || {};

  if (action === "disconnect") {
    const updated = {
      ...existing,
      stripe_connected: false,
      stripe_secret_key_enc: null,
      stripe_publishable_key: null,
      stripe_account_id: null,
      stripe_account_name: null,
      stripe_account_email: null,
    };
    await supabaseAdmin.from("workspaces").update({ cm_settings: updated }).eq("id", workspace_id);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // action === 'connect'
  if (!stripe_secret_key || !stripe_secret_key.startsWith("sk_")) {
    return new Response(JSON.stringify({ error: "Stripe SK inválida — deve começar com sk_" }), { status: 400, headers: cors });
  }

  // ── Validate SK against Stripe API ───────────────────────────────
  let accountName = "";
  let accountId = "";
  let accountEmail = "";
  try {
    const stripeRes = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${stripe_secret_key}` },
    });
    if (!stripeRes.ok) {
      const err = await stripeRes.json();
      throw new Error(err.error?.message || "Stripe key inválida");
    }
    const acct = await stripeRes.json();
    accountId    = acct.id || "";
    accountName  = acct.business_profile?.name || acct.display_name || acct.id || "";
    accountEmail = acct.email || "";
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: cors });
  }

  // ── Encode SK in base64 for storage ──────────────────────────────
  const skEnc = btoa(stripe_secret_key);

  const updated = {
    ...existing,
    stripe_connected: true,
    stripe_secret_key_enc: skEnc,
    stripe_publishable_key: stripe_publishable_key || existing.stripe_publishable_key || null,
    stripe_account_id: accountId,
    stripe_account_name: accountName,
    stripe_account_email: accountEmail,
  };

  const { error: updateErr } = await supabaseAdmin
    .from("workspaces")
    .update({ cm_settings: updated })
    .eq("id", workspace_id);

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: cors });
  }

  return new Response(
    JSON.stringify({ ok: true, account_id: accountId, account_name: accountName }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
