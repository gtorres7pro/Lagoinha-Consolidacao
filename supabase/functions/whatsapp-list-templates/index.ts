import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, OPERATOR_ROLES, authorizeWorkspaceUser, json, text } from "../_shared/auth.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return text("Method Not Allowed", 405);

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { workspace_id } = body ?? {};
  if (!workspace_id) {
    return json({ ok: false, error: "Missing workspace_id" }, 400);
  }

  const authz = await authorizeWorkspaceUser(req, sb, workspace_id, OPERATOR_ROLES);
  if (!authz.ok) return json({ ok: false, error: authz.error }, authz.status);

  // Load workspace credentials
  const { data: ws, error: wsErr } = await sb.from("workspaces")
    .select("id, credentials").eq("id", workspace_id).single();
  if (wsErr || !ws) {
    return json({ ok: false, error: "Workspace not found" }, 404);
  }

  const creds = ws.credentials ?? {};
  const wabaId = creds.waba_id || creds.business_id;
  const waToken = creds.whatsapp_token;

  if (!wabaId || !waToken) {
    return json({ ok: false, error: "Workspace has no Meta WABA credentials" }, 400);
  }

  // Fetch templates from Meta Graph API
  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,language,status,components&limit=100`,
      { headers: { "Authorization": `Bearer ${waToken}` } }
    );
    const metaData = await metaRes.json();

    if (!metaRes.ok) {
      const errMsg = metaData?.error?.message ?? JSON.stringify(metaData);
      console.error("[WA-TEMPLATES] Meta error:", errMsg);
      return json({ ok: false, error: errMsg }, 502);
    }

    // Filter: only APPROVED templates
    const templates = (metaData.data ?? [])
      .filter((t: any) => t.status === "APPROVED")
      .map((t: any) => ({
        name: t.name,
        language: t.language,
        status: t.status,
        components: t.components ?? [],
      }));

    console.log(`[WA-TEMPLATES] found ${templates.length} approved templates for waba=${wabaId}`);

    return json({ ok: true, templates });
  } catch (e: any) {
    console.error("[WA-TEMPLATES] fetch error:", e.message);
    return json({ ok: false, error: e.message }, 500);
  }
});
