import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* ── Types ────────────────────────────────────────────────────────── */
interface BillRecord {
  status: "billed" | "skip" | "error";
  workspace: string;
  module: "CRIE" | "CM";
  name: string;
  amount: string;
  currency: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function fmtCurrency(amount: number, currency: string): string {
  const sym: Record<string, string> = { USD: "$", EUR: "€", BRL: "R$" };
  return `${sym[currency] || currency + " "}${amount.toFixed(2)}`;
}

/* ── Main ─────────────────────────────────────────────────────────── */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const refMonth = currentMonth();
  console.log(`[crie-billing-cron] Running for month: ${refMonth}`);

  const records: BillRecord[] = [];

  try {
    const { data: workspaces, error: wsErr } = await sb
      .from("workspaces")
      .select("id, name, crie_settings")
      .not("crie_settings", "is", null);

    if (wsErr) throw new Error("Failed to fetch workspaces: " + wsErr.message);

    for (const ws of workspaces || []) {
      const settings = ws.crie_settings || {};
      if (!settings.auto_bill_enabled && !settings.membership_fee) continue;

      const fee = settings.membership_fee;
      const currency = settings.membership_currency || settings.default_currency || "USD";
      if (!fee || fee <= 0) continue;

      await processModule(ws.id, ws.name, "crie", fee, currency, refMonth, records);
      await processModule(ws.id, ws.name, "cm", fee, currency, refMonth, records);
    }

    if (records.length > 0 && RESEND_API_KEY) {
      await sendSummaryEmail(refMonth, records);
    }

    const result = {
      month: refMonth,
      total_billed: records.filter((r) => r.status === "billed").length,
      total_skipped: records.filter((r) => r.status === "skip").length,
      total_errors: records.filter((r) => r.status === "error").length,
      records,
    };

    console.log("[crie-billing-cron] Done:", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[crie-billing-cron] Fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

/* ── Process one module (crie or cm) for a workspace ──────────────── */
async function processModule(
  wsId: string,
  wsName: string,
  module: "crie" | "cm",
  fee: number,
  currency: string,
  refMonth: string,
  records: BillRecord[],
) {
  const membersTable = module === "cm" ? "cm_members" : "crie_members";
  const paymentsTable = module === "cm" ? "cm_member_bills" : "crie_member_bills";
  const label = module === "cm" ? "CM" : "CRIE";

  const { data: members, error: memErr } = await sb
    .from(membersTable)
    .select("id, name, email, phone")
    .eq("workspace_id", wsId)
    .eq("status", "ativo");

  if (memErr) {
    console.error(`[crie-billing-cron] Error fetching ${label} members for ${wsId}:`, memErr.message);
    return;
  }
  if (!members || members.length === 0) return;

  const { data: existing } = await sb
    .from(paymentsTable)
    .select("member_id")
    .eq("workspace_id", wsId)
    .eq("reference_month", refMonth);

  const alreadyBilled = new Set((existing || []).map((e: any) => e.member_id));

  const newInvoices: any[] = [];
  for (const member of members) {
    if (alreadyBilled.has(member.id)) {
      records.push({ status: "skip", workspace: wsName, module: label as "CRIE"|"CM", name: member.name, amount: fmtCurrency(fee, currency), currency });
      continue;
    }

    newInvoices.push({
      workspace_id: wsId,
      member_id: member.id,
      amount: fee,
      currency,
      reference_month: refMonth,
      due_date: `${refMonth}-01`,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    records.push({ status: "billed", workspace: wsName, module: label as "CRIE"|"CM", name: member.name, amount: fmtCurrency(fee, currency), currency });
  }

  if (newInvoices.length === 0) return;

  const { error: insertErr } = await sb.from(paymentsTable).insert(newInvoices);

  if (insertErr) {
    console.error(`[crie-billing-cron] Insert error for ${label} in ${wsId}:`, insertErr.message);
    for (let i = records.length - newInvoices.length; i < records.length; i++) {
      if (records[i].status === "billed") records[i].status = "error";
    }
  }
}

/* ── Premium Summary Email ────────────────────────────────────────── */
async function sendSummaryEmail(refMonth: string, records: BillRecord[]) {
  const billed  = records.filter((r) => r.status === "billed");
  const skipped = records.filter((r) => r.status === "skip");
  const errors  = records.filter((r) => r.status === "error");

  const billedCount  = billed.length;
  const skippedCount = skipped.length;
  const errorCount   = errors.length;
  const totalCount   = records.length;

  // ── Compute total revenue billed ───────────────────────────────
  const totalRevenue = billed.reduce((sum, r) => {
    const num = parseFloat(r.amount.replace(/[^0-9.]/g, "")) || 0;
    return sum + num;
  }, 0);
  const mainCurrency = billed[0]?.currency || "USD";

  // ── Group records by workspace ─────────────────────────────────
  const byWorkspace = new Map<string, BillRecord[]>();
  for (const r of records) {
    if (!byWorkspace.has(r.workspace)) byWorkspace.set(r.workspace, []);
    byWorkspace.get(r.workspace)!.push(r);
  }

  // ── Build workspace sections ───────────────────────────────────
  let workspaceSections = "";
  for (const [wsName, wsRecords] of byWorkspace) {
    const wsBilled = wsRecords.filter((r) => r.status === "billed").length;
    const wsSkip   = wsRecords.filter((r) => r.status === "skip").length;
    const wsErr    = wsRecords.filter((r) => r.status === "error").length;

    // Workspace header
    workspaceSections += `
    <tr><td colspan="4" style="padding:16px 0 6px;border-bottom:2px solid #F59E0B">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:14px;font-weight:800;color:#111;letter-spacing:.3px">${wsName}</td>
        <td align="right" style="font-size:11px;color:#888">${wsBilled} faturada${wsBilled !== 1 ? "s" : ""}${wsSkip > 0 ? " &middot; " + wsSkip + " existente" + (wsSkip !== 1 ? "s" : "") : ""}${wsErr > 0 ? " &middot; " + wsErr + " erro" + (wsErr !== 1 ? "s" : "") : ""}</td>
      </tr></table>
    </td></tr>`;

    // Member rows
    for (const r of wsRecords) {
      const statusDot = r.status === "billed"
        ? '<div style="width:8px;height:8px;border-radius:50%;background:#4ade80"></div>'
        : r.status === "skip"
        ? '<div style="width:8px;height:8px;border-radius:50%;background:#94a3b8"></div>'
        : '<div style="width:8px;height:8px;border-radius:50%;background:#f87171"></div>';

      const statusLabel = r.status === "billed" ? "Faturada" : r.status === "skip" ? "Existente" : "Erro";
      const statusColor = r.status === "billed" ? "#4ade80" : r.status === "skip" ? "#94a3b8" : "#f87171";

      const moduleBadgeBg    = r.module === "CM" ? "rgba(214,51,108,.1)"  : "rgba(245,158,11,.08)";
      const moduleBadgeColor = r.module === "CM" ? "#D6336C"             : "#D97706";
      const moduleBadgeBorder= r.module === "CM" ? "rgba(214,51,108,.2)" : "rgba(245,158,11,.2)";

      const amountColor = r.status === "billed" ? "#111" : "#bbb";

      workspaceSections += `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;vertical-align:middle;width:20px">${statusDot}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f4f4f5;vertical-align:middle">
          <div style="font-size:13px;font-weight:600;color:#222">${r.name}</div>
          <div style="font-size:10px;color:${statusColor};margin-top:2px;font-weight:600">${statusLabel}</div>
        </td>
        <td style="padding:10px 4px;border-bottom:1px solid #f4f4f5;vertical-align:middle;text-align:center">
          <span style="display:inline-block;font-size:10px;font-weight:700;color:${moduleBadgeColor};background:${moduleBadgeBg};border:1px solid ${moduleBadgeBorder};padding:2px 8px;border-radius:10px">${r.module}</span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;vertical-align:middle;text-align:right;font-size:13px;font-weight:700;color:${amountColor};font-variant-numeric:tabular-nums">${r.amount}</td>
      </tr>`;
    }
  }

  // ── Full HTML ──────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CRIE Billing Report</title></head>
<body style="margin:0;padding:0;background:#0c0c10;font-family:'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif">

<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0c0c10">
  ${billedCount} faturas geradas para ${fmtMonth(refMonth)}. Total: ${fmtCurrency(totalRevenue, mainCurrency)}.
</div>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c10;padding:40px 16px">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.35)">

  <!-- ▓▓ HEADER ▓▓ -->
  <tr><td style="background:linear-gradient(135deg,#111318 0%,#1a1c24 100%);padding:0">
    <div style="height:4px;background:linear-gradient(90deg,#F59E0B,#FFD700,#F59E0B)"></div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:32px 36px 24px">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:34px;font-weight:900;color:#F59E0B;line-height:1;vertical-align:middle;padding-right:12px">C*</td>
          <td style="vertical-align:middle">
            <div style="font-size:15px;font-weight:800;color:#fff;letter-spacing:1px">BILLING REPORT</div>
            <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:2px;letter-spacing:.5px">Faturamento Mensal de Membresia</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:0 36px 32px">
        <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#fff;line-height:1.2">${fmtMonth(refMonth)}</h1>
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,.4)">Relatorio gerado em ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- ▓▓ KPI CARDS ▓▓ -->
  <tr><td style="padding:32px 36px 24px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <!-- Total Revenue -->
        <td style="width:50%;vertical-align:top;padding-right:8px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#111318,#1a1c24);border-radius:14px;border:1px solid rgba(245,158,11,.2)">
            <tr><td style="padding:20px 22px">
              <div style="font-size:10px;font-weight:700;color:#F59E0B;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px">Receita Gerada</div>
              <div style="font-size:28px;font-weight:900;color:#fff;line-height:1">${fmtCurrency(totalRevenue, mainCurrency)}</div>
              <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:6px">${billedCount} fatura${billedCount !== 1 ? "s" : ""} nova${billedCount !== 1 ? "s" : ""}</div>
            </td></tr>
          </table>
        </td>
        <!-- Stats -->
        <td style="width:50%;vertical-align:top;padding-left:8px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border-radius:14px;border:1px solid #eee">
            <tr><td style="padding:16px 22px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0"><div style="width:8px;height:8px;border-radius:50%;background:#4ade80;display:inline-block;vertical-align:middle"></div></td>
                  <td style="padding:4px 8px;font-size:12px;color:#555;width:100%">Faturadas</td>
                  <td style="padding:4px 0;font-size:15px;font-weight:800;color:#111;text-align:right">${billedCount}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0"><div style="width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block;vertical-align:middle"></div></td>
                  <td style="padding:4px 8px;font-size:12px;color:#555">Ja existentes</td>
                  <td style="padding:4px 0;font-size:15px;font-weight:800;color:#111;text-align:right">${skippedCount}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0"><div style="width:8px;height:8px;border-radius:50%;background:#f87171;display:inline-block;vertical-align:middle"></div></td>
                  <td style="padding:4px 8px;font-size:12px;color:#555">Erros</td>
                  <td style="padding:4px 0;font-size:15px;font-weight:800;color:#111;text-align:right">${errorCount}</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ▓▓ DETAIL TABLE ▓▓ -->
  <tr><td style="padding:0 36px 32px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <!-- Table header -->
      <tr>
        <td style="padding:10px 0;border-bottom:2px solid #eee;font-size:10px;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:1px;width:20px"></td>
        <td style="padding:10px 8px;border-bottom:2px solid #eee;font-size:10px;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:1px">Membro</td>
        <td style="padding:10px 4px;border-bottom:2px solid #eee;font-size:10px;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:1px;text-align:center">Modulo</td>
        <td style="padding:10px 0;border-bottom:2px solid #eee;font-size:10px;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:1px;text-align:right">Valor</td>
      </tr>
      ${workspaceSections}
    </table>
  </td></tr>

  <!-- ▓▓ TOTAL BAR ▓▓ -->
  <tr><td style="padding:0 36px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border-radius:12px;border:1px solid rgba(245,158,11,.15)">
      <tr>
        <td style="padding:16px 22px;font-size:13px;font-weight:700;color:#92400E">Total processado</td>
        <td style="padding:16px 22px;text-align:center;font-size:12px;color:#92400E">${totalCount} membro${totalCount !== 1 ? "s" : ""}</td>
        <td style="padding:16px 22px;text-align:right;font-size:16px;font-weight:900;color:#92400E">${fmtCurrency(totalRevenue, mainCurrency)}</td>
      </tr>
    </table>
  </td></tr>

  <!-- ▓▓ CTA ▓▓ -->
  <tr><td style="padding:0 36px 36px;text-align:center">
    <a href="https://zelo.7prolabs.com/orlando/dashboard.html" target="_blank"
       style="display:inline-block;background:linear-gradient(135deg,#F59E0B,#D97706);color:#fff;font-weight:800;font-size:14px;padding:14px 36px;border-radius:30px;text-decoration:none;letter-spacing:.3px;box-shadow:0 4px 16px rgba(245,158,11,.3)">
      Ver Dashboard
    </a>
  </td></tr>

  <!-- ▓▓ FOOTER ▓▓ -->
  <tr><td style="background:#f9fafb;border-top:1px solid #eee;padding:24px 36px;text-align:center">
    <p style="margin:0 0 4px;font-size:11px;color:#aaa">Relatorio automatico do sistema de cobranca</p>
    <p style="margin:0;font-size:10px;color:#ccc">Powered by <b>Zelo Pro</b> &middot; 7Pro Labs &middot; Orlando, FL</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Zelo Pro Billing <nao-responda@7pro.tech>",
        to: "g@7proservices.com",
        subject: `[CRIE] ${fmtMonth(refMonth)} — ${billedCount} fatura${billedCount !== 1 ? "s" : ""} (${fmtCurrency(totalRevenue, mainCurrency)})`,
        html,
      }),
    });
    console.log("[crie-billing-cron] Summary email sent.");
  } catch (e: any) {
    console.warn("[crie-billing-cron] Email failed:", e.message);
  }
}
