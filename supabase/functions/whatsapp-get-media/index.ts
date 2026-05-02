import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, OPERATOR_ROLES, authorizeWorkspaceUser, json, text } from "../_shared/auth.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return text("Method Not Allowed", 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Bad request" }, 400);
  }

  const workspaceId = body?.workspace_id;
  const mediaId = String(body?.media_id || "").trim();
  if (!workspaceId || !mediaId) {
    return json({ ok: false, error: "Missing required fields: workspace_id, media_id" }, 400);
  }
  if (!/^[A-Za-z0-9_-]{6,}$/.test(mediaId)) {
    return json({ ok: false, error: "Invalid media id" }, 400);
  }

  const authz = await authorizeWorkspaceUser(req, sb, workspaceId, OPERATOR_ROLES);
  if (!authz.ok) return json({ ok: false, error: authz.error }, authz.status);

  const { data: ws, error: wsErr } = await sb
    .from("workspaces")
    .select("id, credentials")
    .eq("id", workspaceId)
    .single();
  if (wsErr || !ws) return json({ ok: false, error: "Workspace not found" }, 404);

  const creds = ws.credentials ?? {};
  const token = creds.whatsapp_token;
  const phoneNumberId = creds.phone_number_id ?? creds.phone_id;
  if (!token || !phoneNumberId) {
    return json({ ok: false, error: "Workspace has no Meta Cloud API credentials configured" }, 400);
  }

  const mediaMetaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}?phone_number_id=${phoneNumberId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const mediaMeta = await mediaMetaRes.json();
  if (!mediaMetaRes.ok || !mediaMeta?.url) {
    return json({ ok: false, error: mediaMeta?.error?.message || "Could not retrieve media URL" }, 502);
  }

  const mediaRes = await fetch(mediaMeta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!mediaRes.ok) {
    return json({ ok: false, error: `Could not download media (${mediaRes.status})` }, 502);
  }

  const contentType = mediaRes.headers.get("content-type") || mediaMeta.mime_type || "application/octet-stream";
  const buffer = await mediaRes.arrayBuffer();
  return json({
    ok: true,
    mime_type: contentType,
    size: buffer.byteLength,
    data_url: `data:${contentType};base64,${arrayBufferToBase64(buffer)}`,
  });
});
