import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
  const token = authHeader.slice(7);
  const { data: { user }, error: userError } = await sb.auth.getUser(token);
  if (userError || !user) return new Response("Unauthorized", { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { workspace_id } = body ?? {};
  if (!workspace_id) {
    return new Response(JSON.stringify({ ok: false, error: "Missing workspace_id" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  // Load workspace credentials
  const { data: ws, error: wsErr } = await sb.from("workspaces")
    .select("id, credentials").eq("id", workspace_id).single();
  if (wsErr || !ws) {
    return new Response(JSON.stringify({ ok: false, error: "Workspace not found" }), {
      status: 404, headers: { "Content-Type": "application/json" }
    });
  }

  const creds = ws.credentials ?? {};
  const wabaId = creds.waba_id || creds.business_id;
  const waToken = creds.whatsapp_token;

  if (!wabaId || !waToken) {
    return new Response(JSON.stringify({ ok: false, error: "Workspace has no Meta WABA credentials" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
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
      return new Response(JSON.stringify({ ok: false, error: errMsg }), {
        status: 502, headers: { "Content-Type": "application/json" }
      });
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

    return new Response(JSON.stringify({ ok: true, templates }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    console.error("[WA-TEMPLATES] fetch error:", e.message);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
});
