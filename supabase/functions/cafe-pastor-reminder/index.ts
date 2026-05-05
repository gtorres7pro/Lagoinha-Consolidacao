import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildManageAppointmentUrl,
  escapeHtml,
  formatCpDateTime,
  getCafePastorContext,
} from "../_shared/cafe-pastor.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Accept both GET (cron trigger) and POST

  // Find appointments scheduled in the next 23-25 hours that haven't had a reminder sent
  const windowStart = new Date(Date.now() + 23 * 3600000).toISOString();
  const windowEnd   = new Date(Date.now() + 25 * 3600000).toISOString();

  const { data: appointments, error } = await sb
    .from("cafe_pastor_appointments")
    .select(`
      id, workspace_id, requester_name, requester_email, requester_phone,
      scheduled_at, appointment_type, session_link, duration_minutes,
      pastor_id, reminder_sent,
      cafe_pastor_pastors ( display_name, email, user_id )
    `)
    .gte("scheduled_at", windowStart)
    .lte("scheduled_at", windowEnd)
    .eq("reminder_sent", false)
    .not("status", "in", "(cancelled,no_show)");

  if (error) {
    console.error("[reminder] Query error:", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  if (!appointments?.length) {
    console.log("[reminder] No appointments due for reminder.");
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const appt of appointments as any[]) {
    const pastor = appt.cafe_pastor_pastors;
    const pastorNameRaw = pastor?.display_name ?? "o pastor";
    const pastorName = escapeHtml(pastorNameRaw);
    const context = await getCafePastorContext(sb, appt.workspace_id);
    const scheduledDate = formatCpDateTime(appt.scheduled_at, context.timeZone, false);
    const manageUrl = await buildManageAppointmentUrl(appt);
    const typeLabel = appt.appointment_type === "inperson" ? "🏛️ Presencial" : "💻 Online";
    const sessionLink = appt.session_link
      ? `<p style="margin:12px 0 0"><a href="${escapeHtml(appt.session_link)}" style="color:#FFD700;font-weight:600">📹 Entrar na reunião online</a></p>` : "";

    const requesterHtml = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f4f4f5;padding:40px 20px;margin:0">
<table width="600" style="background:#fff;border-radius:16px;overflow:hidden;margin:0 auto">
  <tr><td style="background:#111;padding:24px 32px;text-align:center">
    <h2 style="color:#FFD700;margin:0;font-size:18px">⏰ Lembrete — Café com Pastor</h2>
    <p style="color:#aaa;margin:6px 0 0;font-size:13px">Seu atendimento é amanhã!</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p>Olá <b>${escapeHtml(appt.requester_name || "Amigo(a)")}</b>!</p>
    <p style="color:#444">Apenas um lembrete de que você tem uma sessão de Café com Pastor amanhã:</p>
    <div style="background:#fffbef;border:1px solid #FFD700;border-radius:12px;padding:20px;margin:20px 0">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="color:#888;font-size:13px;padding:6px 0;width:35%">☕ Pastor</td><td style="color:#111;font-weight:600">${pastorName}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:6px 0">📅 Data</td><td style="color:#111;font-weight:600;text-transform:capitalize">${scheduledDate}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:6px 0">Modalidade</td><td style="color:#111">${typeLabel}</td></tr>
      </table>
      ${sessionLink}
    </div>
    <p style="color:#555;font-size:13px">📌 Se precisar cancelar ou remarcar, entre em contato com até 1 hora de antecedência.</p>
    <div style="text-align:center;margin:22px 0 4px">
      <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#111;color:#FFD700;border:1px solid #FFD700;padding:12px 24px;border-radius:999px;font-weight:700;text-decoration:none;font-size:14px">Cancelar ou remarcar</a>
    </div>
    <div style="text-align:center;margin-top:24px">
      <p style="color:#888;font-size:13px;margin:0 0 6px">Com amor,</p>
      <p style="color:#111;font-weight:700">❤️ Equipe Pastoral</p>
    </div>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #eee">
    <p style="margin:0;color:#888;font-size:12px">Notificação automática — <b>Zelo Pro</b></p>
  </td></tr>
</table></body></html>`;

    const pastorHtml = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f4f4f5;padding:40px 20px;margin:0">
<table width="600" style="background:#fff;border-radius:16px;overflow:hidden;margin:0 auto">
  <tr><td style="background:#111;padding:24px 32px;text-align:center">
    <h2 style="color:#FFD700;margin:0;font-size:18px">⏰ Lembrete de Atendimento</h2>
    <p style="color:#aaa;margin:6px 0 0;font-size:13px">Amanhã você tem um Café com Pastor agendado</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p>Olá <b>${pastorName}</b>,</p>
    <p style="color:#444">Lembramos que você tem um atendimento amanhã:</p>
    <div style="background:#f9f9fa;border-left:4px solid #FFD700;border-radius:8px;padding:20px;margin:20px 0">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="color:#888;font-size:13px;padding:6px 0;width:35%">👤 Pessoa</td><td style="color:#111;font-weight:600">${escapeHtml(appt.requester_name || "—")}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:6px 0">📱 Telefone</td><td style="color:#111">${escapeHtml(appt.requester_phone || "—")}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:6px 0">📅 Data</td><td style="color:#111;font-weight:600;text-transform:capitalize">${scheduledDate}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:6px 0">Modalidade</td><td style="color:#111">${typeLabel}</td></tr>
      </table>
    </div>
    <div style="text-align:center;margin-top:20px">
      <a href="https://zelo.7prolabs.com" style="display:inline-block;background:#FFD700;color:#111;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none">Ver no Painel Zelo</a>
    </div>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #eee">
    <p style="margin:0;color:#888;font-size:12px">Notificação automática — <b>Zelo Pro</b></p>
  </td></tr>
</table></body></html>`;

    if (!RESEND_API_KEY) { errors.push("No RESEND_API_KEY"); break; }

    // Send to requester if they have email
    if (appt.requester_email) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Zelo Pro <nao-responda@7pro.tech>",
            to: appt.requester_email,
            subject: `⏰ Lembrete: Café com Pastor amanhã — ${pastorNameRaw}`,
            html: requesterHtml
          })
        });
        if (!r.ok) errors.push(`requester email failed: ${await r.text()}`);
      } catch(e: any) { errors.push(`requester email exception: ${e.message}`); }
    }

    // Send to pastor
    let pastorEmail: string | null = pastor?.email ?? null;
    if (!pastorEmail && pastor?.user_id) {
      const { data: u } = await sb.from("users").select("email").eq("id", pastor.user_id).single();
      pastorEmail = u?.email ?? null;
    }
    if (pastorEmail) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Zelo Pro <nao-responda@7pro.tech>",
            to: pastorEmail,
            subject: `⏰ Lembrete: atendimento amanhã com ${appt.requester_name || "membro"}`,
            html: pastorHtml
          })
        });
        if (!r.ok) errors.push(`pastor email failed: ${await r.text()}`);
        else sent++;
      } catch(e: any) { errors.push(`pastor email exception: ${e.message}`); }
    } else { sent++; }

    // Mark reminder_sent = true
    await sb.from("cafe_pastor_appointments")
      .update({ reminder_sent: true })
      .eq("id", appt.id);
  }

  console.log(`[reminder] Done. Processed ${appointments.length}, sent ${sent}, errors: ${errors.length}`);
  return new Response(
    JSON.stringify({ ok: true, processed: appointments.length, sent, errors }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
});
