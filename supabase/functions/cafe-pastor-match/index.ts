import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  addDaysToDateKey,
  dayOfWeekForDateKey,
  formatZonedDateKey,
  normalizeTimeZone,
  zonedDateTimeToUtc,
} from "../_shared/cafe-pastor.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad Request" }, 400); }

  const { workspace_id, session_type, gender } = body ?? {};
  if (!workspace_id) return json({ error: "Missing workspace_id" }, 400);

  console.log(`[CPMatch] ws=${workspace_id} session_type=${session_type} gender=${gender}`);

  // Fetch workspace config for local-time slot generation.
  const { data: config } = await sb.from("cafe_pastor_config")
    .select("min_advance_hours, booking_window_days, timezone")
    .eq("workspace_id", workspace_id)
    .maybeSingle();
  const minAdvanceHours = config?.min_advance_hours ?? 2;
  const bookingWindowDays = Math.max(1, Math.min(config?.booking_window_days ?? 14, 90));
  const timeZone = normalizeTimeZone(config?.timezone);

  // Fetch active pastors
  let query = sb.from("cafe_pastor_pastors")
    .select("id, display_name, gender, bio, photo_url, session_duration_minutes")
    .eq("workspace_id", workspace_id)
    .eq("is_active", true);

  // Optional gender filter (match casal or specific gender)
  if (gender && gender !== "nao_informado") {
    query = query.in("gender", [gender, "casal", "any"]);
  }

  const { data: pastors, error: pErr } = await query.order("display_name");
  console.log(`[CPMatch] pastors found: ${pastors?.length ?? 0} error: ${pErr?.message ?? "none"}`);

  if (pErr || !pastors?.length) {
    // If gender filter returned empty, retry without gender filter as fallback
    if (gender && gender !== "nao_informado" && !pastors?.length) {
      console.log(`[CPMatch] No pastors matched gender=${gender}, retrying without gender filter`);
      const { data: allPastors, error: allErr } = await sb.from("cafe_pastor_pastors")
        .select("id, display_name, gender, bio, photo_url, session_duration_minutes")
        .eq("workspace_id", workspace_id)
        .eq("is_active", true)
        .order("display_name");
      if (allErr || !allPastors?.length) {
        return json({ ok: true, pastors: [], slots: [], _debug: { reason: "no_active_pastors" } });
      }
      // Use all pastors as fallback (cross-gender matching)
      return await computeSlots(allPastors, workspace_id, session_type, minAdvanceHours, bookingWindowDays, timeZone);
    }
    return json({ ok: true, pastors: [], slots: [], _debug: { reason: "no_pastors_match" } });
  }

  return await computeSlots(pastors, workspace_id, session_type, minAdvanceHours, bookingWindowDays, timeZone);
});

async function computeSlots(
  pastors: any[],
  workspace_id: string,
  session_type: string | undefined,
  minAdvanceHours: number,
  bookingWindowDays: number,
  timeZone: string,
) {
  const pastorIds = pastors.map((p: any) => p.id);
  const todayStr = formatZonedDateKey(new Date(), timeZone);
  const windowEndDate = addDaysToDateKey(todayStr, bookingWindowDays - 1);
  const windowEndIso = zonedDateTimeToUtc(windowEndDate, "23:59:59", timeZone).toISOString();

  // Fetch availability rules
  const { data: avail } = await sb.from("cafe_pastor_availability")
    .select("pastor_id, day_of_week, start_time, end_time, session_type, is_active")
    .in("pastor_id", pastorIds).eq("is_active", true);

  console.log(`[CPMatch] availability rules found: ${avail?.length ?? 0}`);

  // Fetch blocked slots
  const { data: blocked } = await sb.from("cafe_pastor_blocked_slots")
    .select("pastor_id, blocked_date, blocked_start, blocked_end")
    .in("pastor_id", pastorIds).gte("blocked_date", todayStr).lte("blocked_date", windowEndDate);

  // Fetch existing appointments
  const { data: existing } = await sb.from("cafe_pastor_appointments")
    .select("pastor_id, scheduled_at, duration_minutes")
    .in("pastor_id", pastorIds)
    .gte("scheduled_at", new Date().toISOString())
    .lte("scheduled_at", windowEndIso)
    .not("status", "in", "(cancelled,no_show)");

  const slots: any[] = [];
  const DAY_NAMES = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
  const advanceMs = minAdvanceHours * 3600000;

  for (let dayOffset = 0; dayOffset < bookingWindowDays; dayOffset++) {
    const dateStr = addDaysToDateKey(todayStr, dayOffset);
    const dow = dayOfWeekForDateKey(dateStr);

    for (const pastor of pastors as any[]) {
      const rule = (avail ?? []).find((a: any) =>
        a.pastor_id === pastor.id && a.day_of_week === dow &&
        (!session_type || session_type === "both" || a.session_type === session_type || a.session_type === "both")
      );
      if (!rule) continue;

      const dayBlocks = (blocked ?? []).filter((b: any) => b.pastor_id === pastor.id && b.blocked_date === dateStr);
      const duration = pastor.session_duration_minutes || 60;
      const [startH, startM] = rule.start_time.split(":").map(Number);
      const [endH, endM] = rule.end_time.split(":").map(Number);

      let slotH = startH, slotM = startM;
      while (slotH * 60 + slotM + duration <= endH * 60 + endM) {
        const wallTime = `${String(slotH).padStart(2,"0")}:${String(slotM).padStart(2,"0")}:00`;
        const slotStartUtc = zonedDateTimeToUtc(dateStr, wallTime, timeZone);
        const slotISO = slotStartUtc.toISOString();
        const slotEndMins = slotH * 60 + slotM + duration;

        const isBlocked = dayBlocks.some((b: any) => {
          if (!b.blocked_start && !b.blocked_end) return true;
          const bs = b.blocked_start ? parseInt(b.blocked_start.split(":")[0]) * 60 + parseInt(b.blocked_start.split(":")[1]) : 0;
          const be = b.blocked_end ? parseInt(b.blocked_end.split(":")[0]) * 60 + parseInt(b.blocked_end.split(":")[1]) : 1440;
          const sm = slotH * 60 + slotM;
          return sm < be && slotEndMins > bs;
        });

        const isBooked = (existing ?? []).some((e: any) => {
          if (e.pastor_id !== pastor.id) return false;
          const exStart = new Date(e.scheduled_at).getTime();
          const exEnd = exStart + (e.duration_minutes || duration) * 60000;
          const slotStart = slotStartUtc.getTime();
          return slotStart < exEnd && (slotStart + duration * 60000) > exStart;
        });

        // Use config min_advance_hours instead of hardcoded 2h
        const isPast = slotStartUtc.getTime() < Date.now() + advanceMs;

        if (!isBlocked && !isBooked && !isPast) {
          slots.push({
            pastor_id: pastor.id,
            pastor_name: pastor.display_name,
            pastor_photo: pastor.photo_url,
            date: dateStr,
            day_label: DAY_NAMES[dow],
            time: wallTime.slice(0, 5),
            slot_iso: slotISO,
            timezone: timeZone,
            session_type: rule.session_type,
            duration_minutes: duration,
          });
        }

        slotM += duration;
        slotH += Math.floor(slotM / 60);
        slotM %= 60;
      }
    }
  }

  console.log(`[CPMatch] total slots computed: ${slots.length}`);
  return json({ ok: true, pastors, slots });
}
