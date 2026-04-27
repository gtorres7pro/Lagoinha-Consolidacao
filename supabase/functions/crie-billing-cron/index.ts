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

/* ── Helpers ──────────────────────────────────────────────────────── */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

  let totalBilled = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const summaryRows: string[] = [];

  try {
    // ── Get all workspaces with billing enabled ────────────────────
    const { data: workspaces, error: wsErr } = await sb
      .from("workspaces")
      .select("id, name, crie_settings")
      .not("crie_settings", "is", null);

    if (wsErr) throw new Error("Failed to fetch workspaces: " + wsErr.message);

    for (const ws of workspaces || []) {
      const settings = ws.crie_settings || {};
      // Skip workspaces without auto-billing enabled or without a fee
      if (!settings.auto_bill_enabled && !settings.membership_fee) continue;

      const fee = settings.membership_fee;
      const currency = settings.membership_currency || settings.default_currency || "USD";

      if (!fee || fee <= 0) continue;

      console.log(`[crie-billing-cron] Processing workspace "${ws.name}" (${ws.id}): ${fmtCurrency(fee, currency)}/mo`);

      // ── Process CRIE members ─────────────────────────────────────
      await processModule(ws.id, ws.name, "crie", fee, currency, refMonth, summaryRows);

      // ── Process CM members ───────────────────────────────────────
      await processModule(ws.id, ws.name, "cm", fee, currency, refMonth, summaryRows);
    }

    // ── Send summary email to admin ──────────────────────────────
    if (summaryRows.length > 0 && RESEND_API_KEY) {
      await sendSummaryEmail(refMonth, summaryRows);
    }

    const result = {
      month: refMonth,
      total_billed: summaryRows.filter((r) => r.includes("✅")).length,
      total_skipped: summaryRows.filter((r) => r.includes("⏭")).length,
      details: summaryRows,
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
  summaryRows: string[],
) {
  const membersTable = module === "cm" ? "cm_members" : "crie_members";
  const paymentsTable = module === "cm" ? "cm_membership_payments" : "crie_membership_payments";
  const label = module === "cm" ? "CM" : "CRIE";

  // Get active members
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

  // Get existing invoices for this month to avoid duplicates
  const { data: existing } = await sb
    .from(paymentsTable)
    .select("member_id")
    .eq("workspace_id", wsId)
    .eq("reference_month", refMonth);

  const alreadyBilled = new Set((existing || []).map((e: any) => e.member_id));

  // Generate invoices for members not yet billed
  const newInvoices: any[] = [];
  for (const member of members) {
    if (alreadyBilled.has(member.id)) {
      summaryRows.push(`⏭ ${wsName} · ${label} · ${member.name} — já faturado`);
      continue;
    }

    newInvoices.push({
      workspace_id: wsId,
      member_id: member.id,
      amount: fee,
      currency,
      reference_month: refMonth,
      status: "pending",
      payment_method: "manual",
      created_at: new Date().toISOString(),
    });

    summaryRows.push(`✅ ${wsName} · ${label} · ${member.name} — ${fmtCurrency(fee, currency)}`);
  }

  if (newInvoices.length === 0) return;

  // Batch insert
  const { error: insertErr } = await sb.from(paymentsTable).insert(newInvoices);

  if (insertErr) {
    console.error(`[crie-billing-cron] Insert error for ${label} in ${wsId}:`, insertErr.message);
    // Mark as errors
    for (let i = summaryRows.length - newInvoices.length; i < summaryRows.length; i++) {
      summaryRows[i] = summaryRows[i].replace("✅", "❌");
    }
  } else {
    console.log(`[crie-billing-cron] Created ${newInvoices.length} invoices for ${label} in "${wsName}"`);
  }
}

/* ── Send admin summary email ─────────────────────────────────────── */
async function sendSummaryEmail(refMonth: string, rows: string[]) {
  const billed = rows.filter((r) => r.includes("✅")).length;
  const skipped = rows.filter((r) => r.includes("⏭")).length;
  const errors = rows.filter((r) => r.includes("❌")).length;

  const tableRows = rows
    .map((r) => {
      const icon = r.charAt(0) === "✅" ? "🟢" : r.charAt(0) === "⏭" ? "🔵" : "🔴";
      return `<tr><td style="padding:6px 12px;font-size:13px;color:#444;border-bottom:1px solid #f0f0f0">${r}</td></tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',sans-serif">
<table width="600" style="margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);border:1px solid #eaeaec">
  <tr><td style="background:#111;padding:24px 32px;text-align:center;border-bottom:4px solid #F59E0B">
    <h2 style="color:#F59E0B;margin:0;font-size:18px">📊 CRIE Billing Report</h2>
    <p style="color:#888;margin:6px 0 0;font-size:13px">Relatório mensal de faturamento · ${refMonth}</p>
  </td></tr>
  <tr><td style="padding:28px 32px">
    <table style="width:100%;margin-bottom:24px">
      <tr>
        <td style="text-align:center;padding:12px"><div style="font-size:28px;font-weight:900;color:#4ade80">${billed}</div><div style="font-size:11px;color:#888;margin-top:4px">Faturadas</div></td>
        <td style="text-align:center;padding:12px"><div style="font-size:28px;font-weight:900;color:#60a5fa">${skipped}</div><div style="font-size:11px;color:#888;margin-top:4px">Já existentes</div></td>
        <td style="text-align:center;padding:12px"><div style="font-size:28px;font-weight:900;color:#f87171">${errors}</div><div style="font-size:11px;color:#888;margin-top:4px">Erros</div></td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px 12px;font-size:11px;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #eee">Detalhes</td></tr>
      ${tableRows}
    </table>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #eee">
    <p style="margin:0;color:#aaa;font-size:11px">Zelo Pro · CRIE Billing Cron · 7Pro Labs</p>
  </td></tr>
</table></body></html>`;

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
        subject: `[CRIE Billing] ${refMonth} — ${billed} faturas geradas`,
        html,
      }),
    });
    console.log("[crie-billing-cron] Summary email sent.");
  } catch (e: any) {
    console.warn("[crie-billing-cron] Email failed:", e.message);
  }
}
