import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  escapeHtml,
  formatCpDateTime,
  getCafePastorContext,
  publicBookingUrl,
  verifyAppointmentActionToken,
} from "../_shared/cafe-pastor.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  let appointmentId = url.searchParams.get("appointment_id");
  let token = url.searchParams.get("token");
  let action = url.searchParams.get("action") || "";

  if (req.method === "POST") {
    const form = await req.formData();
    appointmentId = String(form.get("appointment_id") || appointmentId || "");
    token = String(form.get("token") || token || "");
    action = String(form.get("action") || action || "");
  } else if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: cors });
  }

  if (!appointmentId || !token) return htmlPage("Link inválido", "Não foi possível validar este agendamento.", null, 400);

  const { data: appt, error } = await sb.from("cafe_pastor_appointments")
    .select("*, cafe_pastor_pastors(display_name)")
    .eq("id", appointmentId)
    .single();

  if (error || !appt) return htmlPage("Agendamento não encontrado", "Este link não corresponde a um agendamento ativo.", null, 404);

  const valid = await verifyAppointmentActionToken(appt, token);
  if (!valid) return htmlPage("Link expirado", "Por segurança, este link não pode mais alterar o agendamento.", null, 401);

  const context = await getCafePastorContext(sb, appt.workspace_id);
  const workspaceKey = context.workspace?.slug || appt.workspace_id;
  const bookingUrl = publicBookingUrl(workspaceKey);
  const scheduledDate = formatCpDateTime(appt.scheduled_at, context.timeZone);
  const pastorName = appt.cafe_pastor_pastors?.display_name ?? "Equipe Pastoral";

  if (req.method === "POST" && (action === "cancel" || action === "reschedule")) {
    if (appt.status !== "cancelled") {
      const { error: updateError } = await sb.from("cafe_pastor_appointments")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
          pastor_notes: appendNote(appt.pastor_notes, action === "reschedule" ? "Cancelado pelo link de remarcacao." : "Cancelado pelo link do email."),
        })
        .eq("id", appt.id);

      if (updateError) return htmlPage("Não foi possível cancelar", escapeHtml(updateError.message), null, 500);
    }

    if (action === "reschedule") {
      return Response.redirect(`${bookingUrl}&rescheduled=1`, 303);
    }

    return htmlPage(
      "Agendamento cancelado",
      "Seu Café com Pastor foi cancelado. Se precisar, você pode marcar um novo horário.",
      `<a class="primary" href="${escapeHtml(bookingUrl)}">Marcar novo horário</a>`,
    );
  }

  if (appt.status === "cancelled") {
    return htmlPage(
      "Agendamento já cancelado",
      "Este horário já está cancelado. Você pode marcar um novo atendimento quando desejar.",
      `<a class="primary" href="${escapeHtml(bookingUrl)}">Marcar novo horário</a>`,
    );
  }

  return htmlPage(
    "Gerenciar agendamento",
    `Você está gerenciando o Café com Pastor com ${escapeHtml(pastorName)} em ${escapeHtml(scheduledDate)}.`,
    `<div class="actions">
      <form method="POST">
        <input type="hidden" name="appointment_id" value="${escapeHtml(appt.id)}">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <input type="hidden" name="action" value="reschedule">
        <button class="primary" type="submit">Remarcar horário</button>
      </form>
      <form method="POST">
        <input type="hidden" name="appointment_id" value="${escapeHtml(appt.id)}">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <input type="hidden" name="action" value="cancel">
        <button class="secondary" type="submit">Cancelar atendimento</button>
      </form>
    </div>`,
  );
});

function appendNote(existing: string | null, note: string): string {
  const stamp = new Date().toISOString();
  return [existing, `[${stamp}] ${note}`].filter(Boolean).join("\n");
}

function htmlPage(title: string, message: string, actions: string | null, status = 200): Response {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Café com Pastor</title>
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0f0f13; color:#f0ede8; font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; padding:24px; }
    main { width:min(520px,100%); background:#17151c; border:1px solid rgba(212,165,116,.22); border-radius:18px; padding:30px; box-shadow:0 30px 80px rgba(0,0,0,.45); text-align:center; }
    .icon { font-size:48px; margin-bottom:14px; }
    h1 { margin:0 0 10px; color:#d4a574; font-size:26px; line-height:1.15; }
    p { margin:0 0 24px; color:rgba(240,237,232,.72); line-height:1.6; }
    .actions { display:grid; gap:12px; }
    form { margin:0; }
    button, a { width:100%; box-sizing:border-box; display:inline-block; border-radius:999px; padding:13px 18px; font-weight:800; font-size:15px; text-decoration:none; cursor:pointer; font-family:inherit; }
    .primary { background:#d4a574; color:#111; border:1px solid #d4a574; }
    .secondary { background:transparent; color:#f0ede8; border:1px solid rgba(240,237,232,.22); }
  </style>
</head>
<body>
  <main>
    <div class="icon">☕</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${message}</p>
    ${actions ?? ""}
  </main>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
  });
}
