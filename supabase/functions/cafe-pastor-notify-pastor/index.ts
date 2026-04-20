import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { record } = body ?? {};

  if (!record || !record.pastor_id) {
    return new Response("Missing data", { status: 400 });
  }

  // Fetch pastor user info to get email
  const { data: pastor } = await sb.from("cafe_pastor_pastors")
    .select("user_id, display_name")
    .eq("id", record.pastor_id)
    .single();

  if (!pastor) return new Response("Pastor not found", { status: 404 });

  const { data: user } = await sb.from("users")
    .select("email")
    .eq("id", pastor.user_id)
    .single();

  if (!user || !user.email) return new Response("Pastor email not found", { status: 404 });

  if (!RESEND_API_KEY) return new Response("Resend not configured", { status: 500 });
  
  const html = `
    <h2>Olá ${pastor.display_name},</h2>
    <p>Um novo atendimento de Café com Pastor foi agendado para sua agenda!</p>
    <p><strong>Pessoa:</strong> ${record.requester_name}</p>
    <p><strong>Data:</strong> ${new Date(record.scheduled_at).toLocaleString('pt-BR')}</p>
    <p><strong>Tipo:</strong> ${record.appointment_type}</p>
    <br/>
    <p>Equipe Zelo</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Contato <contato@7prolabs.com>",
      to: user.email,
      subject: "Novo Agendamento - Café com Pastor",
      html
    })
  });

  return new Response(JSON.stringify({ ok: res.ok }), { headers: { "Content-Type": "application/json" } });
});
