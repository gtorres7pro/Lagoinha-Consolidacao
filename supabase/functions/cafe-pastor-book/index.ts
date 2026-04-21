import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const EDGE = Deno.env.get("SUPABASE_URL") + "/functions/v1";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const {
    workspace_id, pastor_id, requester_name, requester_email, requester_phone,
    appointment_type, scheduled_at, briefing_data, duration_minutes
  } = body ?? {};

  if (!workspace_id || !pastor_id || !scheduled_at) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing required fields (workspace_id, pastor_id, scheduled_at)" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Check for double-booking (simple conflict guard)
  const duration = duration_minutes || 60;
  const { data: conflicts } = await sb.from("cafe_pastor_appointments")
    .select("id")
    .eq("pastor_id", pastor_id)
    .eq("scheduled_at", scheduled_at)
    .not("status", "in", "(cancelled,no_show)")
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "Slot already booked. Please choose another time." }),
      { status: 409, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  const { data, error } = await sb.from("cafe_pastor_appointments").insert({
    workspace_id,
    pastor_id,
    requester_name: requester_name || null,
    requester_email: requester_email || null,
    requester_phone: requester_phone || null,
    appointment_type: appointment_type || "both",
    scheduled_at,
    duration_minutes: duration,
    briefing_data: briefing_data || null,
    status: "pending"
  }).select().single();

  if (error) {
    console.error("[cafe-pastor-book] Insert error:", error.message);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Fire-and-forget: send confirmation email to requester (if email exists)
  if (requester_email && data?.id) {
    fetch(`${EDGE}/cafe-pastor-confirm-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
      body: JSON.stringify({ appointment_id: data.id })
    }).catch(e => console.warn("[cafe-pastor-book] confirm-email fire failed:", e));
  }

  return new Response(
    JSON.stringify({ ok: true, appointment: data }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
  );
});
