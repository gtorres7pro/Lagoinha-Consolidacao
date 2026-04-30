export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-zelo-internal-secret",
};

export const MASTER_ROLES = ["master_admin", "pastor_senior"];
export const ADMIN_ROLES = [...MASTER_ROLES, "church_admin", "admin"];
export const OPERATOR_ROLES = [...ADMIN_ROLES, "pastor", "lider_ministerio"];

type AuthResult = {
  ok: boolean;
  status: number;
  error?: string;
  internal?: boolean;
  user?: any;
  profile?: any;
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, ...headers, "Content-Type": "application/json" },
  });
}

export function text(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { ...CORS_HEADERS, ...headers } });
}

export function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  return auth.replace(/^bearer\s+/i, "").trim();
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isInternalRequest(req: Request): boolean {
  const internalSecret =
    Deno.env.get("ZELO_INTERNAL_SECRET") ||
    Deno.env.get("INTERNAL_FUNCTION_SECRET") ||
    Deno.env.get("CRON_SECRET") ||
    "";
  const presentedSecret = req.headers.get("x-zelo-internal-secret") ?? "";
  if (internalSecret && safeEqual(presentedSecret, internalSecret)) return true;

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = bearerToken(req);
  return !!serviceRole && safeEqual(token, serviceRole);
}

export async function authorizeWorkspaceUser(
  req: Request,
  supabaseAdmin: any,
  workspaceId: string,
  allowedRoles: string[] = ADMIN_ROLES,
): Promise<AuthResult> {
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("id, role, workspace_id, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) return { ok: false, status: 403, error: "Profile not found" };
  const status = String(profile.status || "").toLowerCase();
  if (status === "inactive" || status === "inativo") {
    return { ok: false, status: 403, error: "User inactive" };
  }

  if (MASTER_ROLES.includes(profile.role)) return { ok: true, status: 200, user, profile };

  if (String(profile.workspace_id) !== String(workspaceId)) {
    return { ok: false, status: 403, error: "Workspace access denied" };
  }

  if (!allowedRoles.includes(profile.role)) {
    return { ok: false, status: 403, error: "Insufficient role" };
  }

  return { ok: true, status: 200, user, profile };
}

export async function authorizeInternalOrWorkspaceUser(
  req: Request,
  supabaseAdmin: any,
  workspaceId: string,
  allowedRoles: string[] = ADMIN_ROLES,
): Promise<AuthResult> {
  if (isInternalRequest(req)) return { ok: true, status: 200, internal: true };
  return authorizeWorkspaceUser(req, supabaseAdmin, workspaceId, allowedRoles);
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
