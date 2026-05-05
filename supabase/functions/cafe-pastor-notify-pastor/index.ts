import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ADMIN_ROLES, authorizeInternalOrWorkspaceUser } from "../_shared/auth.ts";
import { escapeHtml, formatCpDateTime, getCafePastorContext } from "../_shared/cafe-pastor.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  // Accept either { appointment_id } (from WhatsApp bot) or { record } (from DB webhook)
  let appt: any = body?.record ?? null;
  if (!appt && body?.appointment_id) {
    const { data } = await sb.from("cafe_pastor_appointments")
      .select("*")
      .eq("id", body.appointment_id)
      .single();
    appt = data;
  }

  if (!appt || !appt.pastor_id) return new Response("Missing appointment data", { status: 400 });

  const workspaceId = appt.workspace_id ?? body?.workspace_id;
  if (!workspaceId) return new Response("Missing workspace", { status: 400 });
  const authz = await authorizeInternalOrWorkspaceUser(req, sb, workspaceId, ADMIN_ROLES);
  if (!authz.ok) {
    return new Response(JSON.stringify({ error: authz.error }), {
      status: authz.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Fetch pastor info
  const { data: pastor } = await sb.from("cafe_pastor_pastors")
    .select("user_id, display_name, email")
    .eq("id", appt.pastor_id)
    .single();

  if (!pastor) return new Response("Pastor not found", { status: 404 });

  // Determine email: pastor.email (custom field) OR users table
  let toEmail: string | null = pastor.email ?? null;
  if (!toEmail && pastor.user_id) {
    const { data: user } = await sb.from("users").select("email").eq("id", pastor.user_id).single();
    toEmail = user?.email ?? null;
  }

  if (!toEmail) { console.warn("[notify-pastor] No email for pastor", appt.pastor_id); return new Response("No email", { status: 200 }); }
  if (!RESEND_API_KEY) return new Response("Resend not configured", { status: 500 });

  const context = await getCafePastorContext(sb, workspaceId);
  const scheduledDate = formatCpDateTime(appt.scheduled_at, context.timeZone);
  const typeLabel = appt.appointment_type === "inperson" ? "🏛️ Presencial" : "💻 Online";
  const source = appt.briefing_data?.source === "whatsapp_bot" ? "WhatsApp (Ju)" : "Formulário Web";

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f4f4f5;padding:40px 20px;margin:0">
<table width="600" style="background:#fff;border-radius:16px;overflow:hidden;margin:0 auto;box-shadow:0 4px 20px rgba(0,0,0,.08)">
  <tr><td style="background:#111;padding:28px 32px;text-align:center">
    <h2 style="color:#FFD700;margin:0;font-size:20px;font-weight:700">☕ Novo Agendamento</h2>
    <p style="color:#aaa;margin:6px 0 0;font-size:13px">Café com Pastor — Zelo Pro</p>
  </td></tr>
  <tr><td style="padding:36px 32px">
    <p style="margin:0 0 20px">Olá <b>${escapeHtml(pastor.display_name)}</b>,</p>
    <p style="margin:0 0 24px;color:#444">Um novo atendimento foi agendado com você:</p>
    <div style="background:#f9f9fa;border-left:4px solid #FFD700;border-radius:8px;padding:20px 24px;margin-bottom:28px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="color:#888;font-size:13px;padding:5px 0;width:35%">👤 Pessoa</td><td style="color:#111;font-weight:600;font-size:14px">${escapeHtml(appt.requester_name || "—")}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:5px 0">📱 Telefone</td><td style="color:#111;font-size:14px">${escapeHtml(appt.requester_phone || "—")}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:5px 0">📅 Data/Hora</td><td style="color:#111;font-weight:600;font-size:14px">${scheduledDate}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:5px 0">Modalidade</td><td style="color:#111;font-size:14px">${typeLabel}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:5px 0">Origem</td><td style="color:#555;font-size:13px">${source}</td></tr>
      </table>
    </div>
    <div style="text-align:center">
      <a href="https://zelo.7prolabs.com" style="display:inline-block;background:#FFD700;color:#111;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px">Ver no Painel Zelo</a>
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
      subject: `☕ Novo agendamento com ${appt.requester_name || "um membro"} — Café com Pastor`,
      html
    })
  });

  console.log(`[notify-pastor] email sent to ${toEmail}: ${res.ok}`);
  return new Response(JSON.stringify({ ok: res.ok }), { headers: { ...cors, "Content-Type": "application/json" } });
});
