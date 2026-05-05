import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ADMIN_ROLES, CORS_HEADERS, authorizeWorkspaceUser, json, text } from "../_shared/auth.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

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
    console.warn("[BROADCAST] Could not fetch Meta template metadata:", await res.text());
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return text("Method Not Allowed", 405);

  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const { workspace_id, lead_ids, template_name, language_code, variables_count } = body ?? {};

  if (!workspace_id || !lead_ids?.length || !template_name) {
    return json({ ok: false, error: "Missing required fields" }, 400);
  }

  const authz = await authorizeWorkspaceUser(req, sb, workspace_id, ADMIN_ROLES);
  if (!authz.ok) return json({ ok: false, error: authz.error }, authz.status);

  // Load workspace
  const { data: ws, error: wsErr } = await sb.from("workspaces")
    .select("id, credentials").eq("id", workspace_id).single();
  if (wsErr || !ws) {
    return json({ ok: false, error: "Workspace not found" }, 404);
  }

  const creds = ws.credentials ?? {};
  const waToken = creds.whatsapp_token;
  const phoneId = creds.phone_id;
  const wabaId = creds.waba_id ?? creds.business_id ?? "";

  if (!waToken || !phoneId) {
    return json({ ok: false, error: "No Meta credentials configured" }, 400);
  }

  const preferredLanguage = language_code ?? "pt_BR";
  const templateDetails = await fetchTemplateDetails({
    token: waToken,
    wabaId,
    templateName: template_name,
    preferredLanguage,
    headerMediaUrl: templateHeaderMediaUrl(creds, template_name),
    headerMediaId: templateHeaderMediaId(creds, template_name),
  });
  const configuredHeader = configuredHeaderParameters(creds, template_name);
  const headerParameters = configuredHeader.length ? configuredHeader : templateDetails.headerParameters;

  // Fetch all leads
  const { data: leads, error: leadsErr } = await sb.from("leads")
    .select("id, name, phone, workspace_id")
    .eq("workspace_id", workspace_id)
    .in("id", lead_ids);

  if (leadsErr || !leads?.length) {
    return json({ ok: false, error: "No leads found" }, 404);
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    const toPhone = (lead.phone || "").startsWith("+") ? lead.phone.slice(1) : lead.phone;
    if (!toPhone) { failed++; continue; }

    // Build template components (fill {{1}} with lead first name)
    const firstName = lead.name?.split(" ")[0] || lead.name || "Amigo";
    const components: any[] = [];
    if (headerParameters.length) {
      components.push({
        type: "header",
        parameters: headerParameters,
      });
    }
    if (variables_count && variables_count > 0) {
      const params = [firstName];
      for (let i = 1; i < variables_count; i++) params.push("");
      components.push({
        type: "body",
        parameters: params.map((v: string) => ({ type: "text", text: v })),
      });
    }

    const apiBody = {
      messaging_product: "whatsapp",
      to: toPhone,
      type: "template",
      template: {
        name: template_name,
        language: { code: templateDetails.languageCode },
        components,
      },
    };

    try {
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${waToken}`,
        },
        body: JSON.stringify(apiBody),
      });
      const metaData = await metaRes.json();

      if (metaRes.ok) {
        sent++;
        const waMessageId = metaData?.messages?.[0]?.id ?? null;
        // Persist broadcast message to DB
        const now = new Date().toISOString();
        await sb.from("messages").insert({
          workspace_id,
          lead_id: lead.id,
          direction: "outbound",
          type: "template",
          content: `📢 Broadcast: ${template_name}`,
          automated: true,
          responded_at: now,
          wa_message_id: waMessageId,
        });
      } else {
        failed++;
        const errMsg = metaData?.error?.message ?? "Unknown error";
        errors.push(`${lead.phone}: ${errMsg}`);
        console.error(`[BROADCAST] failed for ${lead.phone}:`, errMsg);
      }
    } catch (e: any) {
      failed++;
      errors.push(`${lead.phone}: ${e.message}`);
    }

    // Rate limiting: Meta recommends ~80 messages/second
    // Add small delay between sends to be safe
    if (leads.length > 10) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log(`[BROADCAST] complete: sent=${sent} failed=${failed} total=${leads.length}`);

  return json({
    ok: true,
    sent,
    failed,
    total: leads.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
});
