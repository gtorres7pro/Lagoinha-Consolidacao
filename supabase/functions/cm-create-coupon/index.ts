import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ADMIN_ROLES, authorizeWorkspaceUser } from "../_shared/auth.ts";

/**
 * cm-create-coupon — mirrors crie-create-coupon but reads Stripe key from cm_settings
 * and writes coupons to cm_coupons table.
 * verify_jwt: false — manual auth (per Arch Rule #10).
 *
 * Body: {
 *   workspace_id, code, type: 'percent'|'fixed', discount,
 *   currency?, max_redemptions?, expires_at?
 * }
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
  const { workspace_id, code, type, discount, currency, max_redemptions, expires_at } = body;

  if (!workspace_id || !code || !type || !discount) {
    return new Response(JSON.stringify({ error: "workspace_id, code, type, discount required" }), { status: 400, headers: cors });
  }

  const authz = await authorizeWorkspaceUser(req, supabaseAdmin, workspace_id, ADMIN_ROLES);
  if (!authz.ok) {
    return new Response(JSON.stringify({ error: authz.error }), { status: authz.status, headers: cors });
  }

  // ── Get Stripe SK from cm_settings ────────────────────────────────
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("cm_settings")
    .eq("id", workspace_id)
    .single();

  const skEnc: string = ws?.cm_settings?.stripe_secret_key_enc || "";
  if (!skEnc) {
    return new Response(
      JSON.stringify({ success: false, error: "Stripe não conectado para CM. Configure nas Configurações CM." }),
      { status: 400, headers: cors },
    );
  }
  const sk = atob(skEnc);

  // ── Build Stripe coupon payload ───────────────────────────────────
  const stripeBody = new URLSearchParams({ name: code });
  if (type === "percent") {
    stripeBody.set("percent_off", String(discount));
  } else {
    stripeBody.set("amount_off", String(Math.round(Number(discount) * 100)));
    stripeBody.set("currency", (currency || "eur").toLowerCase());
  }
  if (max_redemptions) stripeBody.set("max_redemptions", String(max_redemptions));
  if (expires_at) stripeBody.set("redeem_by", String(Math.floor(new Date(expires_at).getTime() / 1000)));

  let couponId: string | null = null;
  try {
    const stripeRes = await fetch("https://api.stripe.com/v1/coupons", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sk}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: stripeBody.toString(),
    });
    const stripeJson = await stripeRes.json();
    if (!stripeRes.ok) throw new Error(stripeJson.error?.message || "Stripe error");
    couponId = stripeJson.id;
  } catch (e: any) {
    // Stripe failed — still return coupon_id null but success=false
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 400, headers: cors });
  }

  return new Response(
    JSON.stringify({ success: true, coupon_id: couponId }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
