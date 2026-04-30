import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ADMIN_ROLES, authorizeInternalOrWorkspaceUser } from "../_shared/auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  // Accept { record } (DB webhook) or { appointment_id } (direct call)
  let appt: any = body?.record ?? null;
  if (!appt && body?.appointment_id) {
    const { data } = await sb.from("cafe_pastor_appointments")
      .select("*, cafe_pastor_pastors(display_name)")
      .eq("id", body.appointment_id)
      .single();
    appt = data;
  }

  const workspaceId = appt?.workspace_id ?? body?.workspace_id;
  if (!workspaceId) return new Response("Missing workspace", { status: 400 });
  const authz = await authorizeInternalOrWorkspaceUser(req, sb, workspaceId, ADMIN_ROLES);
  if (!authz.ok) {
    return new Response(JSON.stringify({ error: authz.error }), {
      status: authz.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const toEmail = appt?.requester_email;
  if (!toEmail) {
    // No email to send — not an error (WhatsApp-only bookings won't have email)
    console.log("[confirm-email] No requester_email, skipping.");
    return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (!RESEND_API_KEY) return new Response("Resend not configured", { status: 500 });

  const pastorName = appt.cafe_pastor_pastors?.display_name ?? appt.pastor_name ?? "o pastor";
  const requesterName = appt.requester_name || "Amigo(a)";

  const scheduledDate = new Date(appt.scheduled_at).toLocaleString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo"
  });
  const typeLabel = appt.appointment_type === "inperson" ? "☕ Presencial" : "💻 Online";
  const sessionLink = appt.session_link
    ? `<p style="margin:16px 0 0"><a href="${appt.session_link}" style="color:#FFD700;font-weight:600">📹 Link da Reunião Online</a></p>`
    : "";

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f4f4f5;padding:40px 20px;margin:0">
<table width="600" style="background:#fff;border-radius:16px;overflow:hidden;margin:0 auto;box-shadow:0 4px 20px rgba(0,0,0,.08)">
  <tr><td style="background:#111;padding:28px 32px;text-align:center">
    <h2 style="color:#FFD700;margin:0;font-size:20px;font-weight:700">☕ Café com Pastor</h2>
    <p style="color:#aaa;margin:6px 0 0;font-size:13px">Seu agendamento foi confirmado!</p>
  </td></tr>
  <tr><td style="padding:36px 32px">
    <p style="margin:0 0 20px">Olá <b>${requesterName}</b>!</p>
    <p style="margin:0 0 24px;color:#444">Que alegria! Seu atendimento foi agendado com sucesso. Aqui estão os detalhes:</p>
    <div style="background:#fffbef;border:1px solid #FFD700;border-radius:12px;padding:24px;margin-bottom:28px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="color:#888;font-size:13px;padding:7px 0;width:35%">☕ Pastor</td><td style="color:#111;font-weight:600;font-size:15px">${pastorName}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:7px 0">📅 Data</td><td style="color:#111;font-weight:600;font-size:15px;text-transform:capitalize">${scheduledDate}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:7px 0">Modalidade</td><td style="color:#111;font-size:14px">${typeLabel}</td></tr>
      </table>
      ${sessionLink}
    </div>
    <div style="background:#f9f9fa;border-radius:10px;padding:18px 20px;margin-bottom:28px">
      <p style="margin:0;color:#555;font-size:13px;line-height:1.6">📌 <b>Lembre-se:</b> Você pode cancelar ou remarcar seu atendimento com até 24 horas de antecedência. Em caso de dúvidas, entre em contato conosco.</p>
    </div>
    <div style="text-align:center">
      <p style="color:#888;font-size:13px;margin:0 0 8px">Com amor,</p>
      <p style="color:#111;font-weight:700;font-size:16px;margin:0">❤️ Equipe Pastoral</p>
    </div>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #eee">
    <p style="margin:0;color:#888;font-size:12px">Notificação automática — <b>Zelo Pro</b></p>
  </td></tr>
</table></body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Zelo Pro <nao-responda@7pro.tech>",
      to: toEmail,
      subject: `☕ Seu Café com Pastor está confirmado!`,
      html
    })
  });

  console.log(`[confirm-email] Sent to ${toEmail}: ${res.ok}`);
  return new Response(JSON.stringify({ ok: res.ok }), { headers: { ...cors, "Content-Type": "application/json" } });
});
