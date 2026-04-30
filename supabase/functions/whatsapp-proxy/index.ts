// ============================================================
// whatsapp-proxy — server-side proxy to Evolution API
// Keeps the Evolution admin key out of the browser.
// Caller (authenticated user) passes { action, workspace_id, ...params }.
// We verify the user belongs to the workspace, then make the Evolution call
// with the server-side EVOLUTION_API_KEY.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const EVOLUTION_URL = Deno.env.get("EVOLUTION_URL") ?? "https://evolution.7pro.tech";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_ROLES = ["master_admin", "pastor_senior", "church_admin", "admin"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function evoFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", "apikey": EVOLUTION_KEY },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(EVOLUTION_URL + path, opts);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  if (!EVOLUTION_KEY) {
    console.error("[PROXY] EVOLUTION_API_KEY env var not set");
    return json(500, { error: "Server misconfigured: EVOLUTION_API_KEY missing" });
  }

  // ── Authenticate caller ────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Missing auth" });

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json(401, { error: "Invalid session" });

  // ── Parse body ─────────────────────────────────────────────────────────────
  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "Bad JSON" }); }
  const { action, workspace_id, instance_name, params } = payload;
  if (!action || !workspace_id) return json(400, { error: "Missing action or workspace_id" });

  // ── Verify user belongs to this workspace (or is master) ───────────────────
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: profile } = await admin
    .from("users")
    .select("role, workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return json(403, { error: "User profile not found" });

  const isMaster = ["master_admin", "pastor_senior"].includes(profile.role);
  const isWorkspaceMember = profile.workspace_id === workspace_id;
  const isAdmin = ADMIN_ROLES.includes(profile.role) && isWorkspaceMember;

  if (!isMaster && !isAdmin) {
    return json(403, { error: "Admin access required for WhatsApp infrastructure" });
  }

  // ── Resolve instance name (from payload or workspace credentials) ─────────
  let instName: string = instance_name ?? "";
  if (!instName || action === "send_text") {
    const { data: ws } = await admin
      .from("workspaces")
      .select("credentials")
      .eq("id", workspace_id)
      .maybeSingle();
    if (!ws) return json(404, { error: "Workspace not found" });
    instName = instName || ws.credentials?.evolution_instance || "";
  }

  // Actions that don't need an instance name yet (list etc.) could go here

  try {
    switch (action) {
      // ── Create instance (idempotent — Evolution returns 409 if exists) ────
      case "instance_create": {
        const name = (params?.instanceName || instName || "").trim();
        if (!name) return json(400, { error: "instance_name required" });
        const res = await evoFetch("POST", "/instance/create", {
          instanceName: name,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        });
        const data = await res.json().catch(() => ({}));
        return json(res.status, data);
      }

      // ── Fetch QR (and current connection state) ───────────────────────────
      case "instance_connect": {
        if (!instName) return json(400, { error: "instance_name required" });
        const res = await evoFetch("GET", `/instance/connect/${encodeURIComponent(instName)}`);
        const data = await res.json().catch(() => ({}));
        return json(res.status, data);
      }

      // ── Get connection state ──────────────────────────────────────────────
      case "instance_state": {
        if (!instName) return json(400, { error: "instance_name required" });
        const res = await evoFetch("GET", `/instance/connectionState/${encodeURIComponent(instName)}`);
        const data = await res.json().catch(() => ({}));
        return json(res.status, data);
      }

      // ── Logout / disconnect instance ──────────────────────────────────────
      case "instance_logout": {
        if (!instName) return json(400, { error: "instance_name required" });
        const res = await evoFetch("DELETE", `/instance/logout/${encodeURIComponent(instName)}`);
        const data = await res.json().catch(() => ({}));
        return json(res.status, data);
      }

      // ── Send text message via Evolution ───────────────────────────────────
      case "send_text": {
        if (!instName) return json(400, { error: "Evolution instance not configured for workspace" });
        const number = params?.number;
        const text = params?.text;
        if (!number || !text) return json(400, { error: "params.number and params.text required" });
        const res = await evoFetch("POST", `/message/sendText/${encodeURIComponent(instName)}`, {
          number,
          text,
        });
        const data = await res.json().catch(() => ({}));
        return json(res.status, data);
      }

      default:
        return json(400, { error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    console.error(`[PROXY] ${action} error:`, e?.message);
    return json(502, { error: "Evolution API error", message: e?.message ?? String(e) });
  }
});
