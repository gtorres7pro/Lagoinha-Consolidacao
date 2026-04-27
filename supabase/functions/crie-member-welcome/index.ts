import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* ── Helpers ──────────────────────────────────────────────────────── */
function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* ── Main ─────────────────────────────────────────────────────────── */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { application_id, pdf_url } = await req.json();
    if (!application_id) throw new Error("Missing application_id");

    // Fetch application
    const { data: app, error: appErr } = await sb
      .from("crie_member_applications_v2")
      .select("*")
      .eq("id", application_id)
      .single();
    if (appErr || !app) throw new Error("Application not found");
    if (!app.email) throw new Error("No email on application");

    // Fetch workspace
    const { data: ws } = await sb
      .from("workspaces")
      .select("name, slug")
      .eq("id", app.workspace_id)
      .single();

    const wsName = ws?.name || "CRIE";
    const firstName = (app.full_name || "Membro").split(" ")[0];
    const isCM = app.module === "cm";

    // ── Brand tokens ─────────────────────────────────────────────────
    const accent     = isCM ? "#D6336C" : "#F59E0B";
    const accentLt   = isCM ? "#FFF0F6" : "#FFFBEB";
    const accentDim  = isCM ? "rgba(214,51,108,.12)" : "rgba(245,158,11,.12)";
    const logo       = isCM ? "C* Mulheres" : "C* CRIE";
    const tagline    = isCM
      ? "Centro de Referência de Influência Empreendedora — Mulheres"
      : "Centro de Referência de Influência Empreendedora";
    const subject    = isCM
      ? `🌹 Bem-vinda ao ${logo}, ${firstName}!`
      : `⭐ Bem-vindo ao ${logo}, ${firstName}!`;

    // ── PDF CTA block ────────────────────────────────────────────────
    const finalPdfUrl = pdf_url || app.pdf_url || null;
    const pdfBlock = finalPdfUrl
      ? `<tr><td style="padding:0 40px 32px">
           <table width="100%" cellpadding="0" cellspacing="0" style="background:${accentDim};border:1px dashed ${accent};border-radius:14px">
             <tr><td style="padding:20px 24px;text-align:center">
               <p style="margin:0 0 10px;font-size:13px;color:#666">Seu formulário assinado está disponível para download:</p>
               <a href="${finalPdfUrl}" target="_blank" style="display:inline-block;background:${accent};color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:30px;text-decoration:none;letter-spacing:.3px">📄 Baixar Formulário PDF</a>
             </td></tr>
           </table>
         </td></tr>`
      : "";

    // ── Companies summary ────────────────────────────────────────────
    const companies: any[] = app.companies || [];
    const coRows = companies
      .filter((c: any) => c?.name)
      .map(
        (c: any) => `<tr>
        <td style="padding:7px 0;color:#888;font-size:13px;width:35%">🏢 Empresa</td>
        <td style="color:#222;font-weight:600;font-size:14px">${c.name}${c.role ? " · " + c.role : ""}</td>
      </tr>`,
      )
      .join("");

    // ── Build HTML ───────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0c0c10;font-family:'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif">

<!-- Preheader -->
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0c0c10">
  Sua membresia foi aprovada. Bem-vindo à comunidade ${logo}.
</div>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c10;padding:40px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.35)">

  <!-- ▓▓ HEADER ▓▓ -->
  <tr><td style="background:linear-gradient(135deg,#111318 0%,#1a1c24 100%);padding:0">
    <!-- Gold accent line -->
    <div style="height:4px;background:linear-gradient(90deg,${accent},${isCM ? '#F472B6' : '#FFD700'},${accent})"></div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:36px 40px 28px">
        <!-- Logo -->
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:38px;font-weight:900;color:${accent};line-height:1;vertical-align:middle;padding-right:12px">C*</td>
            <td style="vertical-align:middle">
              <div style="font-size:16px;font-weight:800;color:#fff;letter-spacing:1px">${isCM ? "CRIE MULHERES" : "CRIE"}</div>
              <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:2px;letter-spacing:.5px">${tagline}</div>
            </td>
          </tr>
        </table>
      </td></tr>
      <!-- Hero section -->
      <tr><td style="padding:0 40px 40px">
        <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#fff;line-height:1.2">
          ${isCM ? "Bem-vinda" : "Bem-vindo"}, ${firstName}! 🎉
        </h1>
        <p style="margin:0;font-size:15px;color:rgba(255,255,255,.55);line-height:1.6">
          Sua aplicação de membresia foi <span style="color:${accent};font-weight:700">aprovada</span> pela diretoria.
        </p>
      </td></tr>
    </table>
  </td></tr>

  <!-- ▓▓ BODY ▓▓ -->

  <!-- Welcome message -->
  <tr><td style="padding:36px 40px 24px">
    <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.8">
      É com muita alegria que comunicamos que você agora faz parte da nossa comunidade
      de empreendedores que buscam crescimento integral — profissional, espiritual e pessoal.
    </p>
    <p style="margin:0;font-size:15px;color:#333;line-height:1.8">
      A partir de hoje, você tem acesso a todas as reuniões, conteúdos exclusivos e à rede
      de contatos do ${logo}. Estamos ansiosos para caminhar junto com você!
    </p>
  </td></tr>

  <!-- Member summary card -->
  <tr><td style="padding:0 40px 28px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${accentLt};border-radius:16px;border:1px solid ${accent}22;overflow:hidden">
      <tr><td style="padding:24px 28px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <!-- Avatar circle -->
            <td width="56" style="vertical-align:top;padding-right:18px">
              <div style="width:52px;height:52px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;text-align:center;line-height:52px;font-size:20px;font-weight:900;color:#fff">${initials(app.full_name || "?")}</div>
            </td>
            <td style="vertical-align:top">
              <div style="font-size:18px;font-weight:800;color:#111;margin-bottom:12px">${app.full_name}</div>
              <table style="border-collapse:collapse;width:100%">
                <tr>
                  <td style="padding:5px 0;color:#888;font-size:13px;width:35%">📧 Email</td>
                  <td style="color:#222;font-size:14px">${app.email}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#888;font-size:13px">📱 Celular</td>
                  <td style="color:#222;font-size:14px">${app.phone_mobile || "—"}</td>
                </tr>
                ${coRows}
                <tr>
                  <td style="padding:5px 0;color:#888;font-size:13px">📅 Membro desde</td>
                  <td style="color:#222;font-weight:600;font-size:14px">${fmtDate(app.reviewed_at || app.created_at)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- PDF download -->
  ${pdfBlock}

  <!-- Next steps -->
  <tr><td style="padding:0 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border-radius:14px;border:1px solid #eee">
      <tr><td style="padding:24px 28px">
        <p style="margin:0 0 14px;font-size:13px;font-weight:800;color:${accent};text-transform:uppercase;letter-spacing:1px">Próximos Passos</p>
        <table cellpadding="0" cellspacing="0" style="width:100%">
          <tr>
            <td style="padding:8px 0;vertical-align:top;width:28px;font-size:16px">1️⃣</td>
            <td style="padding:8px 0;font-size:14px;color:#444;line-height:1.6"><b>Depósito de Membresia</b> — Complete o pagamento do depósito inicial de $600 (primeiro mês + garantia).</td>
          </tr>
          <tr>
            <td style="padding:8px 0;vertical-align:top;width:28px;font-size:16px">2️⃣</td>
            <td style="padding:8px 0;font-size:14px;color:#444;line-height:1.6"><b>Baixe o App</b> — Acesse conteúdos, playlists e a agenda do grupo pelo app do CRIE.</td>
          </tr>
          <tr>
            <td style="padding:8px 0;vertical-align:top;width:28px;font-size:16px">3️⃣</td>
            <td style="padding:8px 0;font-size:14px;color:#444;line-height:1.6"><b>Participe da próxima reunião</b> — Chegue no horário e venha preparado para crescer!</td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Inspirational quote -->
  <tr><td style="padding:0 40px 36px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid ${accent};padding-left:20px">
      <tr><td style="padding:4px 0">
        <p style="margin:0;font-size:15px;color:#555;font-style:italic;line-height:1.7">
          "Dois são melhores do que um, porque têm melhor paga do seu trabalho. Porque se caírem, um levanta o companheiro."
        </p>
        <p style="margin:8px 0 0;font-size:12px;color:#999;font-weight:700">— Eclesiastes 4:9-10</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA Button -->
  <tr><td style="padding:0 40px 40px;text-align:center">
    <a href="https://crie-app.7prolabs.com" target="_blank"
       style="display:inline-block;background:linear-gradient(135deg,${accent},${isCM ? '#A61E4D' : '#D97706'});color:#fff;font-weight:800;font-size:15px;padding:16px 40px;border-radius:40px;text-decoration:none;letter-spacing:.4px;box-shadow:0 6px 24px ${accent}44">
      Acessar Minha Conta →
    </a>
  </td></tr>

  <!-- ▓▓ FOOTER ▓▓ -->
  <tr><td style="background:#f9fafb;border-top:1px solid #eee;padding:28px 40px;text-align:center">
    <p style="margin:0 0 6px;font-size:12px;color:#aaa">
      Este é um email automático do <b style="color:#666">${logo}</b> — ${wsName}
    </p>
    <p style="margin:0;font-size:11px;color:#ccc">
      Powered by <b>Zelo Pro</b> · 7Pro Labs · Orlando, FL
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    // ── Send via Resend ──────────────────────────────────────────────
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${logo} <nao-responda@7pro.tech>`,
        to: app.email,
        cc: "g@7proservices.com",
        subject,
        html,
      }),
    });

    const resBody = await res.json();
    console.log(
      `[crie-member-welcome] Sent to ${app.email}: ${res.ok}`,
      resBody,
    );

    return new Response(
      JSON.stringify({ ok: res.ok, email: app.email }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[crie-member-welcome]", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
