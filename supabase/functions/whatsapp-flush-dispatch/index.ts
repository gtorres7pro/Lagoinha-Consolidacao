import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isInternalRequest, json, text } from "../_shared/auth.ts";

const EDGE = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1`;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_SECRET = Deno.env.get("ZELO_INTERNAL_SECRET") ?? Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

function runInBackground(promise: Promise<unknown>) {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(promise);
    return;
  }
  promise.catch((e: any) => console.error("[FLUSH-DISPATCH] background error:", e?.message ?? e));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return text("Method Not Allowed", 405);
  if (!isInternalRequest(req)) return text("Unauthorized", 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return text("Bad Request", 400);
  }

  const leadId = body?.lead_id;
  if (!leadId) return json({ ok: false, error: "Missing lead_id" }, 400);

  runInBackground(
    fetch(`${EDGE}/whatsapp-flush`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
        ...(INTERNAL_SECRET ? { "x-zelo-internal-secret": INTERNAL_SECRET } : {}),
      },
      body: JSON.stringify({
        lead_id: leadId,
        message_created_at: body?.message_created_at ?? null,
      }),
    }).then(async (res) => {
      if (!res.ok) {
        console.error("[FLUSH-DISPATCH] whatsapp-flush failed:", res.status, await res.text());
      }
    }).catch((e: any) => {
      console.error("[FLUSH-DISPATCH] whatsapp-flush request error:", e?.message ?? e);
    }),
  );

  return json({ ok: true, queued: true });
});
