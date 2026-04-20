import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } }); }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { workspace_id, pastor_id, requester_name, requester_email, requester_phone, appointment_type, scheduled_at, briefing_data } = body ?? {};

  if (!workspace_id || !pastor_id || !requester_name || !scheduled_at) {
    return new Response(JSON.stringify({ ok: false, error: "Missing required booking fields" }), {
      status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  const { data, error } = await sb.from("cafe_pastor_appointments").insert({
    workspace_id,
    pastor_id,
    requester_name,
    requester_email,
    requester_phone,
    appointment_type,
    scheduled_at,
    briefing_data, // Encrypt via DB trigger or client later if needed
    status: 'pending'
  }).select().single();

  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });

  // Optional: Trigger confirmation email Edge Function here

  return new Response(JSON.stringify({ ok: true, appointment: data }), {
    status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
});
