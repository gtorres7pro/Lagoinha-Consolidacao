import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, OPERATOR_ROLES, authorizeInternalOrWorkspaceUser, json } from "../_shared/auth.ts";

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const CORS = CORS_HEADERS;

const EVOLUTION_URL = Deno.env.get("EVOLUTION_URL") ?? "https://evolution.7pro.tech";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
if (!EVOLUTION_KEY) console.warn("[TMPL] EVOLUTION_API_KEY env var not set — Evolution sends will fail");

// ── helpers ───────────────────────────────────────────────────────────────────

/** Strip leading + for Meta API */
function metaPhone(p: string) { return p.startsWith("+") ? p.slice(1) : p; }

/** Strip leading + for Evolution API (needs number only) */
function evoPhone(p: string) { return p.replace(/^\+/, ""); }

/** Replace {{nome}}, {{culto}}, {{decisao}} in message body */
function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function extractTemplateVariables(body: string): string[] {
  const matches = body.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/[{}]/g, "").trim()).filter(Boolean))];
}

function fillTemplatePreview(body: string, values: string[]): string {
  let preview = body;
  values.forEach((value, index) => {
    preview = preview.replaceAll(`{{${index + 1}}}`, value);
  });
  extractTemplateVariables(preview).forEach((name, index) => {
    preview = preview.replaceAll(`{{${name}}}`, values[index] ?? "");
  });
  return preview.replace(/\s+/g, " ").trim();
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function firstHttpsUrl(values: unknown[]): string {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (/^https:\/\//i.test(text)) return text;
  }
  return "";
}

function templateHeaderMediaUrl(creds: Record<string, any>, templateName: string): string {
  const names = [...new Set([templateName, templateName.toLowerCase()].filter(Boolean))];
  const mediaConfig = objectValue(creds.whatsapp_template_media);
  const headerUrls = objectValue(creds.whatsapp_template_header_urls);
  const perTemplate = names.map((name) => mediaConfig[name]).find(Boolean);
  const perTemplateObj = objectValue(perTemplate);

  return firstHttpsUrl([
    perTemplate,
    perTemplateObj.header_url,
    perTemplateObj.header_image_url,
    perTemplateObj.image_url,
    ...names.map((name) => headerUrls[name]),
    ...names.map((name) => creds[`${name}_header_image_url`]),
  ]);
}

function templateHeaderMediaId(creds: Record<string, any>, templateName: string): string {
  const names = [...new Set([templateName, templateName.toLowerCase()].filter(Boolean))];
  const mediaConfig = objectValue(creds.whatsapp_template_media);
  const perTemplate = names.map((name) => mediaConfig[name]).find(Boolean);
  const perTemplateObj = objectValue(perTemplate);

  const configured = String(
    perTemplateObj.header_media_id
      ?? perTemplateObj.header_image_id
      ?? perTemplateObj.media_id
      ?? perTemplateObj.image_id
      ?? names.map((name) => creds[`${name}_header_image_id`]).find(Boolean)
      ?? "",
  ).trim();
  return configured;
}

function configuredHeaderParameters(creds: Record<string, any>, templateName: string): Record<string, any>[] {
  const mediaId = templateHeaderMediaId(creds, templateName);
  if (mediaId) return [{ type: "image", image: { id: mediaId } }];

  const mediaUrl = templateHeaderMediaUrl(creds, templateName);
  if (mediaUrl) return [{ type: "image", image: { link: mediaUrl } }];

  return [];
}

function buildHeaderParameters(component: any, overrideLink = "", overrideId = ""): Record<string, any>[] {
  if (!component || String(component.type || "").toUpperCase() !== "HEADER") return [];

  const format = String(component.format ?? "").toUpperCase();
  const handle = component.example?.header_handle?.[0];
  const link = overrideLink || (handle ? String(handle) : "");

  if (format === "IMAGE" && overrideId) {
    return [{ type: "image", image: { id: overrideId } }];
  }

  if (format === "IMAGE" && link) {
    return [{ type: "image", image: { link } }];
  }

  if (format === "VIDEO" && overrideId) {
    return [{ type: "video", video: { id: overrideId } }];
  }

  if (format === "VIDEO" && link) {
    return [{ type: "video", video: { link } }];
  }

  if (format === "DOCUMENT" && overrideId) {
    return [{ type: "document", document: { id: overrideId } }];
  }

  if (format === "DOCUMENT" && link) {
    return [{ type: "document", document: { link } }];
  }

  return [];
}

function resolveVariable(raw: unknown, variableName: string, index: number, lead: any, firstName: string): string {
  const value = String(raw ?? "").trim();
  const ctx: Record<string, string> = {
    "lead.name": lead.name ?? "",
    "lead.first_name": firstName,
    "lead.phone": lead.phone ?? "",
    "lead.source": lead.source ?? "",
    "lead.decisao": lead.decisao ?? "",
    "lead.culto": lead.culto ?? "",
    nome: firstName,
    name: firstName,
    firstName,
    source: lead.source ?? "",
    decisao: lead.decisao ?? "",
    culto: lead.culto ?? "",
  };

  if (!value) return index === 0 ? firstName : "";
  const wholeToken = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/)?.[1];
  if (wholeToken) return ctx[wholeToken] ?? "";
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => ctx[key] ?? "");
}

type TemplateDetails = {
  body: string;
  languageCode: string;
  status: string;
  headerParameters: Record<string, any>[];
};

async function fetchTemplateDetails(
  token: string,
  wabaId: string,
  templateName: string,
  languageCode: string,
  headerMediaUrl = "",
  headerMediaId = "",
): Promise<TemplateDetails> {
  if (!token || !wabaId) return { body: "", languageCode, status: "", headerParameters: [] };
  const fields = encodeURIComponent("name,language,status,components");
  const res = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=${fields}&limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn("[TMPL] Could not fetch template body:", await res.text());
    return { body: "", languageCode, status: "", headerParameters: [] };
  }
  const data = await res.json();
  const candidates = (data?.data ?? []).filter((t: any) => t.name === templateName);
  const template =
    candidates.find((t: any) => t.language === languageCode && t.status === "APPROVED")
    ?? candidates.find((t: any) => t.language === languageCode)
    ?? candidates.find((t: any) => t.status === "APPROVED")
    ?? candidates[0];
  const body = template?.components?.find((c: any) => c.type === "BODY")?.text;
  const header = template?.components?.find((c: any) => String(c?.type ?? "").toUpperCase() === "HEADER");
  return {
    body: typeof body === "string" ? body : "",
    languageCode: template?.language || languageCode,
    status: template?.status || "",
    headerParameters: buildHeaderParameters(header, headerMediaUrl, headerMediaId),
  };
}

function buildAutomationContext(args: {
  templateName: string;
  languageCode: string;
  source: string;
  firstName: string;
  preview: string;
  lead: any;
}) {
  const details = [
    `Template: ${args.templateName} (${args.languageCode})`,
    `Origem: ${args.source || "formulario"}`,
    `Nome: ${args.lead.name ?? args.firstName}`,
    args.lead.decisao ? `Decisao: ${args.lead.decisao}` : "",
    args.lead.culto ? `Culto: ${args.lead.culto}` : "",
  ].filter(Boolean).join(" | ");
  const preview = args.preview ? `\nMensagem enviada: ${args.preview}` : "";
  return `[AUTOMACAO_FORMULARIO] Ju iniciou esta conversa automaticamente apos o preenchimento de formulario. Quando a pessoa responder, continue a conversa considerando este contexto. ${details}.${preview}`;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// ── main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let body: any;
  try { body = await req.json(); }
  catch { return new Response("Bad Request", { status: 400, headers: CORS }); }

  const { lead_id, workspace_id } = body;
  if (!lead_id || !workspace_id) {
    return new Response(JSON.stringify({ error: "Missing lead_id or workspace_id" }), { status: 400, headers: CORS });
  }

  const authz = await authorizeInternalOrWorkspaceUser(req, sb, workspace_id, OPERATOR_ROLES);
  if (!authz.ok) return json({ ok: false, error: authz.error }, authz.status);

  // ── 1. Fetch lead ─────────────────────────────────────────────────────────
  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .select("id, name, phone, source, decisao, culto, bot_context")
    .eq("id", lead_id)
    .eq("workspace_id", workspace_id)
    .maybeSingle();

  if (leadErr || !lead) {
    console.error("[TMPL] Lead not found:", leadErr?.message);
    return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: CORS });
  }

  if (!lead.phone) {
    console.log("[TMPL] Lead has no phone — skipping.");
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_phone" }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // ── 2. Idempotency guard — scoped to (lead, today) ───────────────────────
  // Allows a returning lead to be welcomed again on a new day.
  // Still prevents duplicate sends from the same submission within a day.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: existing } = await sb
    .from("messages")
    .select("id")
    .eq("lead_id", lead_id)
    .eq("workspace_id", workspace_id)
    .in("type", ["template", "text"])
    .eq("automated", true)
    .eq("direction", "outbound")
    .gte("created_at", todayStart.toISOString())
    .maybeSingle();

  if (existing) {
    console.log("[TMPL] Already sent automated message to this lead today — skipping.");
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_sent_today" }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // ── 3. Fetch workspace credentials + automation rules ─────────────────────
  const { data: ws, error: wsErr } = await sb
    .from("workspaces")
    .select("credentials, automation_config")
    .eq("id", workspace_id)
    .maybeSingle();

  if (wsErr || !ws) {
    console.error("[TMPL] Workspace not found:", wsErr?.message);
    return new Response(JSON.stringify({ error: "Workspace not found" }), { status: 500, headers: CORS });
  }

  const creds          = ws.credentials ?? {};
  const automationCfg  = (ws as any).automation_config ?? {};
  const mode           = creds.whatsapp_mode ?? "meta"; // 'evolution' | 'meta' | 'none'

  if (automationCfg.enabled === false) {
    console.log("[TMPL] Workspace automation_config.enabled=false — skipping.");
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "automation_disabled" }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // ── 4. Find matching automation rule for lead's source ────────────────────
  const rules: any[] = automationCfg.rules ?? [];
  const leadSource   = lead.source ?? body.source ?? "";
  const ruleForSource = rules.find((r: any) => r.source === leadSource);
  const matchedRule  = ruleForSource?.enabled === false ? null : ruleForSource;
  const defaultTemplate = String(automationCfg.default_template ?? "").trim() || null;
  const defaultLanguage = String(automationCfg.default_language ?? "pt_BR").trim() || "pt_BR";

  // Template / message overrides from request body (allows manual calls)
  const overrideTemplate: string | null = body.template_name ?? null;
  const overrideLang: string | null     = body.language_code ?? null;

  console.log(`[TMPL] lead source="${leadSource}" | workspace mode="${mode}" | matched rule: ${matchedRule ? JSON.stringify(matchedRule) : "none"}`);

  if (ruleForSource?.enabled === false) {
    console.log("[TMPL] Automation rule for this source is disabled — skipping.");
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "rule_disabled", source: leadSource }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  if (matchedRule && !matchedRule.template && !matchedRule.message_body && !overrideTemplate && !body.message_body) {
    console.log("[TMPL] Automation rule matched but has no template or message body — skipping.");
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "rule_has_no_message", source: leadSource }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  if (!matchedRule && !overrideTemplate && !body.message_body && !defaultTemplate) {
    console.log("[TMPL] No automation rule matched this lead source — skipping.");
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_matching_rule", source: leadSource }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Effective channel: rule overrides workspace default
  const effectiveChannel = matchedRule?.channel ?? mode;

  const firstName = (lead.name ?? "").split(" ")[0] || "Amigo";
  const vars      = { nome: firstName, culto: lead.culto ?? "", decisao: lead.decisao ?? "" };

  let sendOk      = false;
  let waMessageId: string | null = null;
  let sentContent = "";
  let automationContext = "";
  let sentPreview = "";

  // ══════════════════════════════════════════════════════════════════════════
  // PATH A — Evolution API
  // ══════════════════════════════════════════════════════════════════════════
  if (effectiveChannel === "evolution") {
    const instanceName = creds.evolution_instance;
    if (!instanceName) {
      console.error("[TMPL] Evolution: no instance configured in workspace credentials.");
      return new Response(JSON.stringify({ error: "Evolution instance not configured" }), { status: 500, headers: CORS });
    }

    // Determine message body: rule body > body param > default
    const rawMsg = matchedRule?.message_body
      ?? body.message_body
      ?? `Olá ${firstName}! 🙏 Seja bem-vindo(a) à Lagoinha. Em breve um de nossos líderes entrará em contato com você!`;

    sentContent = interpolate(rawMsg, vars);
    sentPreview = sentContent;
    automationContext = buildAutomationContext({
      templateName: matchedRule?.template ?? defaultTemplate ?? "message_body",
      languageCode: matchedRule?.language ?? defaultLanguage ?? "custom",
      source: leadSource,
      firstName,
      preview: sentPreview,
      lead,
    });
    const toPhone = evoPhone(lead.phone);

    console.log(`[TMPL] Evolution: sending to ${toPhone} via instance "${instanceName}"`);

    try {
      const evoRes = await fetch(
        `${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instanceName)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVOLUTION_KEY,
          },
          body: JSON.stringify({
            number: toPhone,
            text: sentContent,
          }),
        }
      );

      const evoData = await evoRes.json();
      console.log("[TMPL] Evolution response:", JSON.stringify(evoData));

      if (evoRes.ok && (evoData.key?.id || evoData.status === "PENDING" || evoData.status === "SENT")) {
        sendOk      = true;
        waMessageId = evoData.key?.id ?? null;
        console.log(`[TMPL] Evolution sent OK. msg_id=${waMessageId}`);
      } else {
        console.error("[TMPL] Evolution API error:", JSON.stringify(evoData));
        return new Response(JSON.stringify({ error: "Evolution API error", details: evoData }), { status: 502, headers: CORS });
      }
    } catch (e: any) {
      console.error("[TMPL] Evolution fetch exception:", e.message);
      return new Response(JSON.stringify({ error: "Network error", message: e.message }), { status: 500, headers: CORS });
    }

  // ══════════════════════════════════════════════════════════════════════════
  // PATH B — Meta Cloud API
  // ══════════════════════════════════════════════════════════════════════════
  } else if (effectiveChannel === "meta") {
    const waToken     = creds.whatsapp_token;
    const phoneNumId  = creds.phone_number_id ?? creds.phone_id;

    if (!waToken || !phoneNumId) {
      console.error("[TMPL] Meta: missing whatsapp_token or phone_number_id in workspace credentials.");
      return new Response(JSON.stringify({ error: "Meta WhatsApp credentials not configured" }), { status: 500, headers: CORS });
    }

    const templateName = overrideTemplate ?? matchedRule?.template ?? defaultTemplate ?? "consolidacao";
    const preferredLanguage = overrideLang ?? matchedRule?.language ?? defaultLanguage;
    const toPhone      = metaPhone(lead.phone);
    const wabaId       = creds.waba_id ?? creds.business_id ?? "";
    const templateDetails = await fetchTemplateDetails(
      waToken,
      wabaId,
      templateName,
      preferredLanguage,
      templateHeaderMediaUrl(creds, templateName),
      templateHeaderMediaId(creds, templateName),
    );
    const languageCode = templateDetails.languageCode;
    const templateBody = templateDetails.body;
    const configuredHeader = configuredHeaderParameters(creds, templateName);
    const headerParameters = configuredHeader.length ? configuredHeader : templateDetails.headerParameters;
    const ruleVars     = matchedRule?.variables ?? {};
    const templateVars = templateBody
      ? extractTemplateVariables(templateBody)
      : Object.keys(ruleVars).filter(Boolean);
    const varValues    = templateVars.map((variableName, index) =>
      resolveVariable(ruleVars[variableName], variableName, index, lead, firstName)
    );
    const previewBody  = templateBody ? fillTemplatePreview(templateBody, varValues) : `Template ${templateName} enviado para ${firstName}`;
    sentPreview        = previewBody;
    automationContext  = buildAutomationContext({
      templateName,
      languageCode,
      source: leadSource,
      firstName,
      preview: previewBody,
      lead,
    });
    sentContent = `📨 Template: ${templateName} | ${previewBody}`;

    const components: any[] = [];
    if (headerParameters.length) {
      components.push({
        type: "header",
        parameters: headerParameters,
      });
    }
    if (templateVars.length) {
      components.push({
        type: "body",
        parameters: templateVars.map((variableName, index) => {
          const parameter: Record<string, string> = { type: "text", text: varValues[index] || firstName };
          if (!/^\d+$/.test(variableName)) parameter.parameter_name = variableName;
          return parameter;
        }),
      });
    }

    const templatePayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    };

    console.log(`[TMPL] Meta: sending template="${templateName}" (${languageCode}) to ${toPhone}`);

    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(templatePayload),
      });

      const resData = await res.json();
      if (res.ok) {
        sendOk      = true;
        waMessageId = resData?.messages?.[0]?.id ?? null;
        console.log(`[TMPL] Meta sent OK. wa_message_id=${waMessageId}`);
      } else {
        console.error("[TMPL] Meta API error:", JSON.stringify(resData));
        return new Response(JSON.stringify({ error: "Meta API error", details: resData }), { status: 502, headers: CORS });
      }
    } catch (e: any) {
      console.error("[TMPL] Meta fetch exception:", e.message);
      return new Response(JSON.stringify({ error: "Network error", message: e.message }), { status: 500, headers: CORS });
    }

  // ══════════════════════════════════════════════════════════════════════════
  // PATH C — no channel / disabled
  // ══════════════════════════════════════════════════════════════════════════
  } else {
    console.log(`[TMPL] Channel="${effectiveChannel}" — no message sent.`);
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_channel" }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // ── 5. Persist message + update lead ─────────────────────────────────────
  if (sendOk) {
    const now = new Date().toISOString();

    // Evolution sends free-text (not a WA Business template), so store as 'text'
    const persistType = effectiveChannel === "evolution" ? "text" : "template";

    const { error: msgErr } = await sb.from("messages").insert({
      workspace_id,
      lead_id,
      direction: "outbound",
      type: persistType,
      content: sentContent,
      automated: true,
      responded_at: now,
      wa_message_id: waMessageId,
    });
    if (msgErr) console.error("[TMPL] Failed to save message:", msgErr.message);
    else console.log(`[TMPL] Message saved to DB (type=${persistType}).`);

    const nextBotContext = {
      ...objectOrEmpty(lead.bot_context),
      automation_context: {
        source: leadSource,
        template_name: effectiveChannel === "meta" ? (overrideTemplate ?? matchedRule?.template ?? defaultTemplate ?? "consolidacao") : matchedRule?.template ?? defaultTemplate ?? "message_body",
        language_code: effectiveChannel === "meta" ? (overrideLang ?? matchedRule?.language ?? defaultLanguage) : matchedRule?.language ?? defaultLanguage ?? "custom",
        sent_message: sentPreview,
        instruction: automationContext,
        sent_at: now,
      },
    };

    const { error: luErr } = await sb.from("leads")
      .update({ last_message_at: now, bot_context: nextBotContext })
      .eq("id", lead_id)
      .eq("workspace_id", workspace_id);
    if (luErr) console.error("[TMPL] Failed to update last_message_at:", luErr.message);
    else console.log("[TMPL] lead.last_message_at updated.");
  }

  return new Response(
    JSON.stringify({ ok: true, sent: sendOk, channel: effectiveChannel, wa_message_id: waMessageId }),
    { status: 200, headers: { "Content-Type": "application/json", ...CORS } }
  );
});
