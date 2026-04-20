import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } }); }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { workspace_id, gender, session_type, requested_date } = body ?? {};

  if (!workspace_id) {
    return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
      status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // Very basic matching logic for now
  const { data: pastors, error: pastorErr } = await sb.from("cafe_pastor_pastors")
    .select("id, gender, display_name")
    .eq("workspace_id", workspace_id)
    .eq("is_active", true)
    .in("gender", [gender, 'couple']); // example logic

  if (pastorErr) return new Response(JSON.stringify({ ok: false, error: "Error fetching pastors" }), { status: 500 });

  return new Response(JSON.stringify({ ok: true, matches: pastors }), {
    status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
});
