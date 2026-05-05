import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { CORS_HEADERS, isInternalRequest, json } from "../_shared/auth.ts";

const DEFAULT_TIME_ZONE = "America/New_York";
const DEFAULT_SEND_HOUR = 9;
const DEFAULT_TEMPLATE_NAME = "happy_birthday";
const DEFAULT_TEMPLATE_LANGUAGE = "en";

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  dateKey: string;
};

type TemplateDetails = {
  languageCode: string;
  status: string;
  variables: string[];
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function localParts(date: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value || "0");
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  return { year, month, day, hour, dateKey: `${year}-${pad2(month)}-${pad2(day)}` };
}

function extractTemplateVariables(body: string): string[] {
  const matches = body.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/[{}]/g, "").trim()).filter(Boolean))];
}

function firstName(name: unknown): string {
  return String(name ?? "").trim().split(/\s+/)[0] || "Amigo";
}

function normalizePhoneForMeta(raw: unknown, workspace: any): string {
  const original = String(raw ?? "").trim();
  let digits = original.replace(/\D/g, "");
  if (!digits) return "";

  if (original.startsWith("+")) return digits;

  const country = String(workspace?.country ?? "").trim().toUpperCase();
  const slug = String(workspace?.slug ?? "").trim().toLowerCase();

  if ((country === "US" || country === "USA" || slug === "orlando") && digits.length === 10) {
    return `1${digits}`;
  }

  if ((country === "BR" || country === "BRAZIL" || country === "BRASIL") && digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
    return `55${digits}`;
  }

  if ((country === "PT" || country === "PRT" || country === "PORTUGAL") && digits.length === 9) {
    return `351${digits}`;
  }

  return digits;
}

async function readJson(req: Request): Promise<Record<string, any>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function fetchTemplateDetails(args: {
  token: string;
  wabaId: string;
  templateName: string;
  preferredLanguage: string;
}): Promise<TemplateDetails> {
  const fallback = {
    languageCode: args.preferredLanguage,
    status: "",
    variables: ["1"],
  };

  if (!args.token || !args.wabaId) return fallback;

  const fields = encodeURIComponent("name,language,status,components");
  const res = await fetch(`https://graph.facebook.com/v21.0/${args.wabaId}/message_templates?fields=${fields}&limit=100`, {
    headers: { Authorization: `Bearer ${args.token}` },
  });

  if (!res.ok) {
    console.warn("[birthday] Could not fetch Meta template metadata:", await res.text());
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

  const body = template.components?.find((component: any) => component.type === "BODY")?.text ?? "";
  const variables = extractTemplateVariables(body);
  return {
    languageCode: template.language || args.preferredLanguage,
    status: template.status || "",
    variables: variables.length ? variables : fallback.variables,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Only POST requests allowed" }, 405);
  }

  if (!isInternalRequest(req)) {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    const body = await readJson(req);
    const timeZone = String(body.timezone || DEFAULT_TIME_ZONE);
    const expectedHour = Number(body.expected_hour ?? DEFAULT_SEND_HOUR);
    const templateName = String(body.template_name || DEFAULT_TEMPLATE_NAME);
    const preferredLanguage = String(body.template_language || DEFAULT_TEMPLATE_LANGUAGE);
    const force = body.force === true;
    const workspaceId = body.workspace_id ? String(body.workspace_id) : "";
    const workspaceSlug = body.workspace_slug ? String(body.workspace_slug) : "";

    const nowParts = localParts(new Date(), timeZone);
    if (!force && nowParts.hour !== expectedHour) {
      return json({
        ok: true,
        skipped: true,
        reason: "outside_send_hour",
        time_zone: timeZone,
        local_date: nowParts.dateKey,
        local_hour: nowParts.hour,
        expected_hour: expectedHour,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabaseAdmin
      .from("birthdays")
      .select(`
        id,
        workspace_id,
        name,
        phone,
        birth_day,
        birth_month,
        workspaces!inner (
          id,
          name,
          slug,
          country,
          credentials
        )
      `)
      .eq("birth_day", nowParts.day)
      .eq("birth_month", nowParts.month);

    if (workspaceId) query = query.eq("workspace_id", workspaceId);
    if (workspaceSlug) query = query.eq("workspaces.slug", workspaceSlug);

    const { data: birthdays, error: bError } = await query;
    if (bError) throw bError;

    if (!birthdays || birthdays.length === 0) {
      return json({
        ok: true,
        message: `No birthdays found for ${nowParts.day}/${nowParts.month}`,
        date: nowParts.dateKey,
        workspace_slug: workspaceSlug || null,
      });
    }

    const templateCache = new Map<string, Promise<TemplateDetails>>();
    const results = [];

    for (const birthday of birthdays as any[]) {
      const workspace = birthday.workspaces ?? {};
      const creds = workspace.credentials ?? {};
      const waToken = creds.whatsapp_token;
      const phoneNumId = creds.phone_number_id ?? creds.phone_id;
      const wabaId = creds.waba_id ?? creds.business_id ?? "";
      const name = String(birthday.name ?? "");
      const sendKey = `birthday:${nowParts.dateKey}:${birthday.id}`;

      try {
        if (!waToken || !phoneNumId) {
          results.push({ id: birthday.id, name, status: "skipped", reason: "no_whatsapp_config" });
          continue;
        }

        const toPhone = normalizePhoneForMeta(birthday.phone, workspace);
        if (!toPhone) {
          results.push({ id: birthday.id, name, status: "skipped", reason: "no_phone" });
          continue;
        }

        const { data: existing } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("workspace_id", birthday.workspace_id)
          .eq("direction", "outbound")
          .eq("automated", true)
          .like("content", `%[${sendKey}]%`)
          .limit(1);

        if (existing?.length) {
          results.push({ id: birthday.id, name, status: "skipped", reason: "already_sent_today" });
          continue;
        }

        const cacheKey = `${wabaId}:${templateName}:${preferredLanguage}`;
        if (!templateCache.has(cacheKey)) {
          templateCache.set(cacheKey, fetchTemplateDetails({
            token: waToken,
            wabaId,
            templateName,
            preferredLanguage,
          }));
        }
        const template = await templateCache.get(cacheKey)!;

        if (template.status && template.status !== "APPROVED") {
          results.push({ id: birthday.id, name, status: "skipped", reason: "template_not_approved", template_status: template.status });
          continue;
        }

        const personFirstName = firstName(name);
        const parameters = template.variables.map((variableName, index) => ({
          type: "text",
          text: index === 0 ? personFirstName : "",
          ...(/^\d+$/.test(variableName) ? {} : { parameter_name: variableName }),
        }));

        const payload: Record<string, any> = {
          messaging_product: "whatsapp",
          to: toPhone,
          type: "template",
          template: {
            name: templateName,
            language: { code: template.languageCode },
            ...(parameters.length ? {
              components: [{ type: "body", parameters }],
            } : {}),
          },
        };

        const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${waToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || "Meta API error");
        }

        const waMessageId = data?.messages?.[0]?.id ?? null;
        await supabaseAdmin.from("messages").insert({
          lead_id: null,
          workspace_id: birthday.workspace_id,
          direction: "outbound",
          type: "template",
          content: `Automated Birthday Message: ${templateName} [${sendKey}]`,
          automated: true,
          wa_message_id: waMessageId,
        });

        results.push({ id: birthday.id, name, status: "success", wa_message_id: waMessageId });
      } catch (dispatchError) {
        console.error(`[birthday] Failed for ${name}:`, dispatchError);
        results.push({ id: birthday.id, name, status: "failed", error: String(dispatchError) });
      }
    }

    return json({
      ok: true,
      message: `Processed ${birthdays.length} birthdays`,
      date: nowParts.dateKey,
      time_zone: timeZone,
      workspace_slug: workspaceSlug || null,
      results,
    });
  } catch (error) {
    return json({ ok: false, error: String(error) }, 400);
  }
});
