export const DEFAULT_CP_TIMEZONE = "America/Sao_Paulo";
const DEFAULT_PUBLIC_BASE_URL = "https://zelo.7prolabs.com";

type SupabaseClientLike = {
  from: (table: string) => any;
};

export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? String(timeZone) : DEFAULT_CP_TIMEZONE;
}

export async function getWorkspaceTimezone(sb: SupabaseClientLike, workspaceId: string): Promise<string> {
  const { data: cfg } = await sb.from("cafe_pastor_config")
    .select("timezone")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (isValidTimeZone(cfg?.timezone)) return cfg.timezone;

  const { data: ws } = await sb.from("workspaces")
    .select("crie_settings, cm_settings")
    .eq("id", workspaceId)
    .maybeSingle();

  return normalizeTimeZone(ws?.crie_settings?.timezone ?? ws?.cm_settings?.timezone);
}

export async function getCafePastorContext(sb: SupabaseClientLike, workspaceId: string) {
  const [{ data: cfg }, { data: ws }] = await Promise.all([
    sb.from("cafe_pastor_config")
      .select("timezone, church_address, meeting_link_instructions")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    sb.from("workspaces")
      .select("id, slug, name, crie_settings, cm_settings")
      .eq("id", workspaceId)
      .maybeSingle(),
  ]);

  return {
    config: cfg ?? {},
    workspace: ws ?? {},
    timeZone: normalizeTimeZone(cfg?.timezone ?? ws?.crie_settings?.timezone ?? ws?.cm_settings?.timezone),
  };
}

export function formatCpDateTime(iso: string, timeZone: string, includeYear = true): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: normalizeTimeZone(timeZone),
  };
  if (includeYear) options.year = "numeric";
  return new Date(iso).toLocaleString("pt-BR", options);
}

export function formatZonedDateKey(date: Date, timeZone: string): string {
  const parts = zonedParts(date, normalizeTimeZone(timeZone));
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function dayOfWeekForDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

export function zonedDateTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = getTimeZoneOffsetMs(new Date(wallClockAsUtc), normalizeTimeZone(timeZone));
  let utcMs = wallClockAsUtc - firstOffset;
  const secondOffset = getTimeZoneOffsetMs(new Date(utcMs), normalizeTimeZone(timeZone));
  if (secondOffset !== firstOffset) utcMs = wallClockAsUtc - secondOffset;
  return new Date(utcMs);
}

export function publicBaseUrl(): string {
  return (Deno.env.get("APP_PUBLIC_URL") || Deno.env.get("PUBLIC_SITE_URL") || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, "");
}

export function publicBookingUrl(workspaceSlugOrId: string): string {
  return `${publicBaseUrl()}/cafe-pastor.html?ws=${encodeURIComponent(workspaceSlugOrId)}`;
}

export async function buildManageAppointmentUrl(appt: any): Promise<string> {
  const token = await createAppointmentActionToken(appt);
  const qs = new URLSearchParams({
    appointment_id: String(appt.id),
    token,
  });
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/cafe-pastor-manage?${qs.toString()}`;
}

export async function createAppointmentActionToken(appt: any): Promise<string> {
  return hmacHex(appointmentTokenPayload(appt), actionSecret());
}

export async function verifyAppointmentActionToken(appt: any, token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await createAppointmentActionToken(appt);
  return timingSafeEqual(expected, token);
}

export function appointmentTokenPayload(appt: any): string {
  return `${appt.id}.${appt.workspace_id}.${appt.scheduled_at}`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function actionSecret(): string {
  const secret = Deno.env.get("CAFE_PASTOR_ACTION_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret) throw new Error("Missing action secret");
  return secret;
}

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  formatter.formatToParts(date).forEach((part) => {
    if (part.type !== "literal") map[part.type] = part.value;
  });
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
