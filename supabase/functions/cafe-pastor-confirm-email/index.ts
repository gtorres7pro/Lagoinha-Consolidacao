import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { record } = body ?? {}; // Assuming webhook trigger

  if (!record || !record.requester_email) {
    return new Response("Missing email dat", { status: 400 });
  }

  if (!RESEND_API_KEY) return new Response("Resend not configured", { status: 500 });
  
  const html = `
    <h2>Olá ${record.requester_name},</h2>
    <p>Seu café com pastor foi agendado com sucesso!</p>
    <p>Data: ${new Date(record.scheduled_at).toLocaleString('pt-BR')}</p>
    <p>Tipo: ${record.appointment_type}</p>
    <br/>
    <p>Atenciosamente,<br/>Equipe Zelo</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Contato <contato@7prolabs.com>",
      to: record.requester_email,
      subject: "Agendamento Confirmado - Café com Pastor",
      html
    })
  });

  return new Response(JSON.stringify({ ok: res.ok }), { headers: { "Content-Type": "application/json" } });
});
