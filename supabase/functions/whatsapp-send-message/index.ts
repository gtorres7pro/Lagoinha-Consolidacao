import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, OPERATOR_ROLES, authorizeWorkspaceUser, json, text } from "../_shared/auth.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

function phoneDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

type TemplateDetails = {
  languageCode: string;
  headerParameters: Record<string, any>[];
};

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

function hasTemplateComponent(components: any[], type: string): boolean {
  return components.some((component) => String(component?.type ?? "").toLowerCase() === type.toLowerCase());
}

async function fetchTemplateDetails(args: {
  token: string;
  wabaId: string;
  templateName: string;
  preferredLanguage: string;
  headerMediaUrl?: string;
  headerMediaId?: string;
}): Promise<TemplateDetails> {
  const fallback = {
    languageCode: args.preferredLanguage,
    headerParameters: [],
  };

  if (!args.token || !args.wabaId || !args.templateName) return fallback;

  const fields = encodeURIComponent("name,language,status,components");
  const res = await fetch(`https://graph.facebook.com/v21.0/${args.wabaId}/message_templates?fields=${fields}&limit=100`, {
    headers: { Authorization: `Bearer ${args.token}` },
  });

  if (!res.ok) {
    console.warn("[WA-SEND] Could not fetch Meta template metadata:", await res.text());
    return fallback;
  }

  const meta = await res.json();
  const candidates = (meta?.data ?? []).filter((template: any) => template.name === args.templateName);
  const template =
    candidates.find((item: any) => item.language === args.preferredLanguage && item.status === "APPROVED")
    ?? candidates.find((item: any) => item.language === args.preferredLanguage)
    ?? candidates.find((item: any) => item.status === "APPROVED")
    ?? candidates[0];

  if (!template) return fallback;

  const header = template.components?.find((component: any) => String(component?.type ?? "").toUpperCase() === "HEADER");
  return {
    languageCode: template.language || args.preferredLanguage,
    headerParameters: buildHeaderParameters(header, args.headerMediaUrl, args.headerMediaId),
  };
}

async function buildTemplatePayload(tpl: any, creds: Record<string, any>): Promise<Record<string, any>> {
  if (!tpl?.name) throw new Error("Template name is required");

  const components = Array.isArray(tpl.components)
    ? tpl.components.filter((component: any) => component && typeof component === "object")
    : [];
  const preferredLanguage = String(tpl.language ?? "pt_BR");
  const templateName = String(tpl.name);
  const templateDetails = await fetchTemplateDetails({
    token: String(creds.whatsapp_token ?? ""),
    wabaId: String(creds.waba_id ?? creds.business_id ?? ""),
    templateName,
    preferredLanguage,
    headerMediaUrl: templateHeaderMediaUrl(creds, templateName),
    headerMediaId: templateHeaderMediaId(creds, templateName),
  });

  const enrichedComponents = [...components];
  const configuredHeader = configuredHeaderParameters(creds, templateName);
  const headerParameters = configuredHeader.length ? configuredHeader : templateDetails.headerParameters;
  if (headerParameters.length && !hasTemplateComponent(enrichedComponents, "header")) {
    enrichedComponents.unshift({ type: "header", parameters: headerParameters });
  }

  return {
    name: tpl.name,
    language: { code: templateDetails.languageCode },
    components: enrichedComponents,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return text("Method Not Allowed", 405);

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { workspace_id, lead_id, message } = body ?? {};

  if (!workspace_id || !lead_id || !message?.type || !message?.content) {
    return json({ ok: false, error: "Missing required fields: workspace_id, lead_id, message.{type,content}" }, 400);
  }

  // Fetch workspace credentials (service role bypasses RLS)
  const { data: ws, error: wsErr } = await sb.from("workspaces")
    .select("id, credentials").eq("id", workspace_id).single();
  
  if (wsErr || !ws) return json({ ok: false, error: "Workspace not found" }, 404);

  const creds = ws.credentials ?? {};

  // Auth: workspace JWT role OR the workspace-specific n8n API key.
  const apiKeyHeader = req.headers.get("x-api-key");
  const apiKeyAuthorized = !!apiKeyHeader && !!creds.n8n_api_key && apiKeyHeader === creds.n8n_api_key;
  if (!apiKeyAuthorized) {
    const authz = await authorizeWorkspaceUser(req, sb, workspace_id, OPERATOR_ROLES);
    if (!authz.ok) return json({ ok: false, error: authz.error }, authz.status);
  }

  const token_wa = creds.whatsapp_token;
  const phone_id = creds.phone_id;

  if (!token_wa || !phone_id) {
    return json({ ok: false, error: "Workspace has no Meta Cloud API credentials configured" }, 400);
  }

  // Fetch lead phone
  const { data: lead, error: leadErr } = await sb.from("leads")
    .select("id, phone, name, workspace_id")
    .eq("id", lead_id)
    .eq("workspace_id", workspace_id)
    .single();
  if (leadErr || !lead) return json({ ok: false, error: "Lead not found" }, 404);

  let relatedLeadIds = [lead.id];
  const searchPhone = phoneDigits(lead.phone).slice(-10);
  if (searchPhone.length >= 7) {
    const { data: samePhoneLeads, error: samePhoneErr } = await sb.from("leads")
      .select("id")
      .eq("workspace_id", workspace_id)
      .ilike("phone", `%${searchPhone}%`);
    if (samePhoneErr) {
      console.warn(`[WA-SEND] same-phone lead lookup failed lead=${lead_id}:`, samePhoneErr.message);
    } else if (samePhoneLeads?.length) {
      relatedLeadIds = [...new Set([lead.id, ...samePhoneLeads.map((l: any) => l.id).filter(Boolean)])];
    }
  }

  // Normalize phone for Meta (must be digits only, no +)
  const toPhone = String(lead.phone || "").replace(/\D/g, "");

  function mediaLinkFromMessage(): string {
    const content = message.content;
    const link = typeof content === "string"
      ? content
      : content?.link ?? content?.url;
    if (!link || !/^https:\/\//i.test(link)) {
      throw new Error(`${message.type} messages require a public HTTPS media link`);
    }
    return link;
  }

  function optionalText(value: unknown): string | undefined {
    const text = typeof value === "string" ? value.trim() : "";
    return text || undefined;
  }

  // Build Meta Cloud API request body
  let apiBody: any;
  try {
    if (message.type === "text") {
      apiBody = {
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: { body: message.content },
      };
    } else if (message.type === "template") {
      // message.content expected as: { name, language, components? }
      const tpl = typeof message.content === "string" ? JSON.parse(message.content) : message.content;
      const template = await buildTemplatePayload(tpl, creds);
      apiBody = {
        messaging_product: "whatsapp",
        to: toPhone,
        type: "template",
        template,
      };
    } else if (message.type === "image") {
      const image: Record<string, string> = { link: mediaLinkFromMessage() };
      const caption = optionalText(message.caption);
      if (caption) image.caption = caption;
      apiBody = {
        messaging_product: "whatsapp",
        to: toPhone,
        type: "image",
        image,
      };
    } else if (message.type === "audio" || message.type === "voice") {
      apiBody = {
        messaging_product: "whatsapp",
        to: toPhone,
        type: "audio",
        audio: { link: mediaLinkFromMessage() },
      };
    } else if (message.type === "video") {
      const video: Record<string, string> = { link: mediaLinkFromMessage() };
      const caption = optionalText(message.caption);
      if (caption) video.caption = caption;
      apiBody = {
        messaging_product: "whatsapp",
        to: toPhone,
        type: "video",
        video,
      };
    } else if (message.type === "document" || message.type === "file") {
      const document: Record<string, string> = { link: mediaLinkFromMessage() };
      const filename = optionalText(message.filename);
      const caption = optionalText(message.caption);
      if (filename) document.filename = filename;
      if (caption) document.caption = caption;
      apiBody = {
        messaging_product: "whatsapp",
        to: toPhone,
        type: "document",
        document,
      };
    } else {
      return json({ ok: false, error: `Unsupported message type: ${message.type}` }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }

  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phone_id}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token_wa}`,
    },
    body: JSON.stringify(apiBody),
  });

  const metaData = await metaRes.json();

  if (!metaRes.ok) {
    console.error(`[WA-SEND] Meta error:`, JSON.stringify(metaData));
    const metaError = metaData?.error?.message ?? JSON.stringify(metaData);
    return json({ ok: false, error: metaError }, 502);
  }

  const waMessageId: string = metaData?.messages?.[0]?.id ?? null;
  console.log(`[WA-SEND] sent ok wa_id=${waMessageId} to=${toPhone}`);

  let humanLockUntil: string | null = null;
  if (!apiKeyAuthorized) {
    const now = new Date();
    const nowIso = now.toISOString();
    humanLockUntil = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const waWindowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { error: lockErr } = await sb.from("leads")
      .update({
        llm_lock_until: humanLockUntil,
        last_message_at: nowIso,
        wa_window_expires_at: waWindowExpiresAt,
      })
      .eq("workspace_id", workspace_id)
      .in("id", relatedLeadIds);

    if (lockErr) {
      console.error(`[WA-SEND] failed to set human lock lead=${lead_id}:`, lockErr.message);
      return json({ ok: false, error: "Message sent, but failed to pause Ju for human takeover" }, 500);
    }

    const { error: pendingErr } = await sb.from("messages")
      .update({ responded_at: nowIso, bot_processing_at: null })
      .eq("workspace_id", workspace_id)
      .in("lead_id", relatedLeadIds)
      .eq("direction", "inbound")
      .is("responded_at", null);

    if (pendingErr) {
      console.error(`[WA-SEND] failed to mark pending inbound handled lead=${lead_id}:`, pendingErr.message);
      return json({ ok: false, error: "Message sent and Ju paused, but failed to close pending inbound messages" }, 500);
    }
  }

  return json({ ok: true, wa_message_id: waMessageId, human_lock_until: humanLockUntil });
});
