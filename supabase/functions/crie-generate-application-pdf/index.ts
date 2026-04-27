import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Colour palette (CRIE brand) ────────────────────────────────────────
const GOLD   = rgb(0.957, 0.620, 0.043);   // #F59E0B
const BLACK  = rgb(0.05,  0.05,  0.05);
const DARK   = rgb(0.12,  0.12,  0.16);
const GRAY   = rgb(0.45,  0.45,  0.50);
const WHITE  = rgb(1,     1,     1);
const GREEN  = rgb(0.29,  0.87,  0.50);
const RED    = rgb(0.97,  0.44,  0.44);

// ── Layout constants ───────────────────────────────────────────────────
const PW = 595, PH = 842;          // A4 points
const ML = 50, MR = 50;
const CW = PW - ML - MR;          // content width

function yFlip(page: any, y: number) { return PH - y; }

// Draw text helper
function drawText(page: any, text: string, x: number, y: number, opts: any = {}) {
  page.drawText(String(text ?? ""), {
    x, y: yFlip(page, y),
    size:  opts.size  || 10,
    font:  opts.font,
    color: opts.color || BLACK,
    maxWidth: opts.maxWidth,
    lineHeight: opts.lineHeight || 14,
  });
}

// Draw filled rect helper
function fillRect(page: any, x: number, y: number, w: number, h: number, color: any) {
  page.drawRectangle({ x, y: yFlip(page, y + h), width: w, height: h, color });
}

// Draw rect border
function strokeRect(page: any, x: number, y: number, w: number, h: number, color: any, t = 0.5) {
  page.drawRectangle({ x, y: yFlip(page, y + h), width: w, height: h, borderColor: color, borderWidth: t });
}

// Wrap long text into lines
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── Main handler ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("Missing Authorization");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate caller
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { application_id } = await req.json();
    if (!application_id) throw new Error("Missing application_id");

    // Fetch application
    const { data: app, error: appErr } = await supabase
      .from("crie_member_applications_v2")
      .select("*")
      .eq("id", application_id)
      .single();
    if (appErr || !app) throw new Error("Application not found");

    // Fetch workspace
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name, slug")
      .eq("id", app.workspace_id)
      .single();

    // ── Build PDF ──────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // ─ Page 1: Header + Personal Info + Qualifications ─────────────────
    let page = pdfDoc.addPage([PW, PH]);
    let y = 0;

    // ─ HEADER BAND ──────────────────────────────────────────────────────
    fillRect(page, 0, 0, PW, 90, DARK);
    // Gold accent bar
    fillRect(page, 0, 90, PW, 4, GOLD);

    // CRIE logo text
    drawText(page, "C*", ML, 28, { size: 36, font: fontBold, color: GOLD });
    drawText(page, "CRIE", ML + 38, 42, { size: 14, font: fontBold, color: WHITE });
    drawText(page, "Centro de Referência de Influência Empreendedora", ML + 38, 58, { size: 7.5, font: fontRegular, color: rgb(0.6, 0.6, 0.65) });

    // Module badge
    const moduleLabel = app.module === "cm" ? "CRIE Mulheres" : "CRIE";
    const badgeColor  = app.module === "cm" ? rgb(0.83, 0.21, 0.42) : GOLD;
    fillRect(page, PW - MR - 90, 22, 90, 22, badgeColor);
    drawText(page, moduleLabel, PW - MR - 85, 28, { size: 8, font: fontBold, color: WHITE });

    // Document title
    drawText(page, "FORMULÁRIO DE APLICAÇÃO DE MEMBRESIA", ML, 70, { size: 11, font: fontBold, color: GOLD });
    drawText(page, `Workspace: ${ws?.name || "—"}  ·  ID: ${application_id.substring(0,8).toUpperCase()}  ·  Data: ${new Date(app.created_at).toLocaleDateString("pt-BR")}`, ML, 82, { size: 7.5, font: fontRegular, color: rgb(0.5,0.5,0.55) });

    y = 108;

    // ─ SECTION helper ──────────────────────────────────────────────────
    function section(title: string) {
      fillRect(page, ML, y, CW, 22, rgb(0.08,0.08,0.12));
      strokeRect(page, ML, y, CW, 22, GOLD, 0.5);
      drawText(page, title, ML + 10, y + 6, { size: 8.5, font: fontBold, color: GOLD });
      y += 30;
    }

    // ─ SECTION 1: Dados Pessoais ───────────────────────────────────────
    section("1. INFORMAÇÕES PESSOAIS");

    function row2(label1: string, val1: string, label2: string, val2: string) {
      const hw = CW / 2 - 6;
      drawText(page, label1, ML,        y - 1, { size: 6.5, font: fontRegular, color: GRAY });
      drawText(page, label2, ML + hw + 12, y - 1, { size: 6.5, font: fontRegular, color: GRAY });
      drawText(page, val1 || "—", ML,        y + 8, { size: 9, font: fontBold, color: BLACK, maxWidth: hw });
      drawText(page, val2 || "—", ML + hw + 12, y + 8, { size: 9, font: fontBold, color: BLACK, maxWidth: hw });
      strokeRect(page, ML,           y + 4, hw,     0.4, rgb(0.8,0.8,0.8));
      strokeRect(page, ML + hw + 12, y + 4, hw - 12, 0.4, rgb(0.8,0.8,0.8));
      y += 26;
    }

    row2("Nome Completo", app.full_name, "Data de Nascimento", app.birth_date ? new Date(app.birth_date + "T00:00:00").toLocaleDateString("pt-BR") : "");
    row2("Celular",       app.phone_mobile, "Tel. Residencial", app.phone_home || "");
    row2("E-mail",        app.email,        "Cônjuge",          app.spouse_name || "");
    row2("Tamanho Camiseta", app.shirt_size || "—", "Endereço", (app.address || "") + (app.address2 ? ", " + app.address2 : ""));
    row2("Cidade", app.city || "", "Estado / Zip", `${app.state || ""}  ${app.zip || ""}`);

    y += 6;

    // ─ SECTION 2: Qualificações ────────────────────────────────────────
    section("2. QUALIFICAÇÕES");

    function checkRow(label: string, value: boolean) {
      const boxSize = 8;
      // checkbox
      strokeRect(page, ML, y, boxSize, boxSize, GRAY, 0.8);
      if (value) {
        drawText(page, "✓", ML + 1, y + 1, { size: 7, font: fontBold, color: GREEN });
      }
      drawText(page, label, ML + boxSize + 6, y + 1, { size: 9, font: fontRegular, color: BLACK });
      y += 16;
    }

    checkRow("É membro da Igreja Batista da Lagoinha", app.is_lagoinha_member);
    if (app.lagoinha_member_since) {
      drawText(page, `   Há quanto tempo: ${app.lagoinha_member_since}`, ML + 14, y - 4, { size: 7.5, font: fontRegular, color: GRAY });
      y += 2;
    }
    checkRow("É batizado nas águas", app.is_baptized);
    if (app.baptism_details) {
      drawText(page, `   Detalhes: ${app.baptism_details}`, ML + 14, y - 4, { size: 7.5, font: fontRegular, color: GRAY });
      y += 2;
    }
    checkRow("Já participou de reunião do CRIE", app.attended_crie);
    if (app.sponsor_name) {
      drawText(page, `   Sponsor: ${app.sponsor_name}`, ML + 14, y - 4, { size: 7.5, font: fontRegular, color: GRAY });
      y += 2;
    }
    if (app.attended_dates?.length) {
      drawText(page, `   Datas: ${app.attended_dates.filter(Boolean).join("  ·  ")}`, ML + 14, y - 4, { size: 7.5, font: fontRegular, color: GRAY });
      y += 8;
    }
    checkRow("Proprietário(a) de empresa com funcionário ativo", app.owns_company);

    y += 6;

    // ─ SECTION 3: Empresa(s) ──────────────────────────────────────────
    const companies: any[] = app.companies || [];
    if (companies.length > 0) {
      section("3. DADOS DA(S) EMPRESA(S)");

      for (let ci = 0; ci < companies.length; ci++) {
        const co = companies[ci];
        if (!co?.name) continue;

        // Company sub-header
        fillRect(page, ML, y, CW, 16, rgb(0.12,0.10,0.05));
        drawText(page, `Empresa ${ci + 1}: ${co.name}${co.trade ? "  (DBA: " + co.trade + ")" : ""}`, ML + 8, y + 3, { size: 8, font: fontBold, color: GOLD });
        y += 22;

        row2("Cargo", co.role || "", "Ramo de Atividade", co.industry || "");
        row2("Website", co.website || "", "Instagram", co.instagram || "");
        row2("Cidade / Estado", `${co.city || ""} ${co.state || ""}`.trim(), "Endereço", co.address || "");

        if (co.description) {
          drawText(page, "Descrição:", ML, y, { size: 7, font: fontRegular, color: GRAY });
          y += 10;
          const descLines = wrapText(co.description, 90);
          for (const line of descLines.slice(0, 4)) {
            drawText(page, line, ML, y, { size: 8.5, font: fontRegular, color: BLACK });
            y += 12;
          }
        }
        if (co.mission) {
          drawText(page, "Missão:", ML, y, { size: 7, font: fontRegular, color: GRAY });
          y += 10;
          const mLines = wrapText(co.mission, 90);
          for (const line of mLines.slice(0, 3)) {
            drawText(page, line, ML, y, { size: 8.5, font: fontRegular, color: BLACK });
            y += 12;
          }
        }
        y += 6;
      }
    }

    // ─ Page 2: Directives + Signature ─────────────────────────────────
    page = pdfDoc.addPage([PW, PH]);
    y = 0;

    // Mini header
    fillRect(page, 0, 0, PW, 40, DARK);
    fillRect(page, 0, 40, PW, 3, GOLD);
    drawText(page, "C*  CRIE — Aplicação de Membresia", ML, 14, { size: 10, font: fontBold, color: GOLD });
    drawText(page, `${app.full_name || ""}  ·  ${application_id.substring(0,8).toUpperCase()}`, ML, 27, { size: 7.5, font: fontRegular, color: rgb(0.5,0.5,0.55) });

    y = 56;

    // Directives text
    fillRect(page, ML, y, CW, 22, rgb(0.08,0.08,0.12));
    strokeRect(page, ML, y, CW, 22, GOLD, 0.5);
    drawText(page, "4. DIRETRIZES E CONVÊNIO DE MEMBRESIA", ML + 10, y + 6, { size: 8.5, font: fontBold, color: GOLD });
    y += 30;

    const directives = [
      ["QUALIFICAÇÃO", "Somos cristãos, membros da Igreja Batista da Lagoinha. Cremos que Jesus Cristo é o Senhor e Salvador; cremos na Trindade e em toda a Bíblia."],
      ["EMPREENDEDORES", "É necessário que o empresário tenha pelo menos um funcionário ativo na empresa."],
      ["COMPROMETIMENTO", "A participação como membro do CRIE é focada em crescimento constante. CRIE não é para espectadores ou presença sem comprometimento."],
      ["PARTICIPAÇÃO ATIVA", "Membros devem chegar no horário. Membro inativo por 60 dias perde a membresia. Retorno requer novo depósito e nova aplicação."],
      ["SEM SOLICITAÇÕES", "Membros não devem fazer negócios entre si sem antes comunicar o grupo."],
      ["ELETRÔNICOS", "Durante a reunião os aparelhos eletrônicos devem permanecer guardados."],
      ["CANCELAMENTO", "Pedimos aviso com um mês de antecedência e participação em uma última reunião."],
      ["VALOR DA MEMBRESIA", "$300 mensais. Após 2 meses sem pagamento, a membresia é cancelada. Retorno requer pagamento dos atrasos + $600 de depósito."],
      ["DEPÓSITO", "$600 exigido após aprovação — cobre o primeiro mês e reserva um mês como garantia."],
    ];

    for (const [title, body] of directives) {
      drawText(page, title + ":", ML, y, { size: 7, font: fontBold, color: GOLD });
      y += 10;
      const bodyLines = wrapText(body, 92);
      for (const line of bodyLines) {
        drawText(page, line, ML, y, { size: 8, font: fontRegular, color: BLACK });
        y += 11;
      }
      y += 4;
    }

    // Covenant paragraph
    y += 4;
    strokeRect(page, ML, y, CW, 0.5, rgb(0.85,0.85,0.85));
    y += 10;
    drawText(page, "COMPROMISSO E CONVÊNIO", ML, y, { size: 7.5, font: fontBold, color: GOLD });
    y += 12;
    const covenant = "Eu me comprometo a seguir as diretrizes e certifico-me que qualifico para participar do grupo CRIE. Comprometo-me a manter todas as informações compartilhadas em sigilo, a não oferecer meus negócios sem o aval do grupo, a seguir os valores cristãos e a viver de maneira que meu caráter reflita o caráter de Cristo. A quebra destas regras resultará no cancelamento de minha membresia. A membresia é de mês a mês; toda mensalidade deve ser paga até a primeira reunião do mês. Antes do cancelamento comprometo-me a reunir-me uma última vez com o grupo.";
    const covenantLines = wrapText(covenant, 92);
    for (const line of covenantLines) {
      drawText(page, line, ML, y, { size: 8, font: fontRegular, color: BLACK });
      y += 11;
    }

    y += 20;

    // ─ Signature block ─────────────────────────────────────────────────
    strokeRect(page, ML, y, CW, 0.5, GOLD, 0.5);
    y += 12;

    drawText(page, "ASSINATURA DO APLICANTE", ML, y, { size: 7.5, font: fontBold, color: GOLD });
    y += 14;

    // Try to embed signature image
    let sigEmbedded = false;
    if (app.signature_url) {
      try {
        // Create a signed URL (1 hour)
        const { data: signedData } = await supabase.storage
          .from("crie-member-signatures")
          .createSignedUrl(app.signature_url, 3600);

        if (signedData?.signedUrl) {
          const imgRes  = await fetch(signedData.signedUrl);
          const imgBuf  = await imgRes.arrayBuffer();
          const sigImg  = await pdfDoc.embedPng(new Uint8Array(imgBuf));
          const { width: iw, height: ih } = sigImg.scale(1);
          const maxW = CW / 2, maxH = 60;
          const scale = Math.min(maxW / iw, maxH / ih, 1);
          const sw = iw * scale, sh = ih * scale;

          // White background box
          fillRect(page, ML, y, sw + 12, sh + 12, WHITE);
          strokeRect(page, ML, y, sw + 12, sh + 12, rgb(0.85, 0.85, 0.85), 0.5);
          page.drawImage(sigImg, { x: ML + 6, y: yFlip(page, y + sh + 6), width: sw, height: sh });
          sigEmbedded = true;
          y += sh + 20;
        }
      } catch (e) {
        console.warn("Failed to embed signature:", e);
      }
    }

    if (!sigEmbedded) {
      // Signature line placeholder
      strokeRect(page, ML, y + 30, 200, 0.7, BLACK, 0.8);
      drawText(page, "Assinatura capturada digitalmente", ML, y + 34, { size: 7, font: fontRegular, color: GRAY });
      y += 48;
    }

    // Date of signing
    const signedAt = app.signed_at ? new Date(app.signed_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" }) : new Date().toLocaleDateString("pt-BR");
    drawText(page, `Data de assinatura: ${signedAt}`, ML, y, { size: 8, font: fontRegular, color: BLACK });
    y += 20;

    // ─ Status block ────────────────────────────────────────────────────
    const statusColors: Record<string, any> = {
      approved: GREEN,
      rejected: RED,
      pending:  GOLD,
    };
    const statusLabels: Record<string, string> = {
      approved: "APROVADA",
      rejected: "REJEITADA",
      pending:  "PENDENTE",
    };
    const sColor = statusColors[app.status] || GOLD;
    fillRect(page, ML, y, 130, 24, rgb(0.06, 0.06, 0.08));
    strokeRect(page, ML, y, 130, 24, sColor, 1);
    drawText(page, `STATUS: ${statusLabels[app.status] || app.status.toUpperCase()}`, ML + 8, y + 7, { size: 9, font: fontBold, color: sColor });
    if (app.reviewed_at) {
      drawText(page, `Revisado em ${new Date(app.reviewed_at).toLocaleDateString("pt-BR")}`, ML + 140, y + 7, { size: 8, font: fontRegular, color: GRAY });
    }
    if (app.rejection_reason) {
      y += 30;
      drawText(page, `Motivo da rejeição: ${app.rejection_reason}`, ML, y, { size: 8, font: fontRegular, color: RED });
    }

    // ─ Footer ──────────────────────────────────────────────────────────
    fillRect(page, 0, PH - 28, PW, 28, DARK);
    drawText(page, `Documento gerado em ${new Date().toLocaleString("pt-BR")}  ·  Zelo Pro Platform  ·  7Pro Labs`, ML, PH - 18, { size: 7, font: fontRegular, color: rgb(0.4,0.4,0.45) });
    drawText(page, "Documento confidencial — uso exclusivo da diretoria CRIE", PW - MR - 200, PH - 18, { size: 7, font: fontRegular, color: rgb(0.4,0.4,0.45) });

    // ── Serialize ──────────────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save();

    // ── Upload to Storage ──────────────────────────────────────────────
    const pdfPath = `${app.workspace_id}/${application_id}_${Date.now()}.pdf`;
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from("crie-member-applications")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadErr) throw new Error("Upload failed: " + uploadErr.message);

    // ── Get public URL ─────────────────────────────────────────────────
    const { data: publicData } = supabase.storage
      .from("crie-member-applications")
      .getPublicUrl(pdfPath);

    const pdfUrl = publicData?.publicUrl || "";

    // ── Update application row ─────────────────────────────────────────
    await supabase
      .from("crie_member_applications_v2")
      .update({ pdf_url: pdfUrl })
      .eq("id", application_id);

    return new Response(JSON.stringify({ success: true, pdf_url: pdfUrl }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("crie-generate-application-pdf:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
