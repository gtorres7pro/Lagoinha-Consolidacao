import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/**
 * Returns active pastors + their next available slots for the workspace.
 * Used by the Ju AI bot to present booking options via WhatsApp.
 */
async function queryAvailableSlots(workspace_id: string) {
  // 1. Get active pastors
  const { data: pastors, error: pErr } = await sb
    .from("cafe_pastor_pastors")
    .select("id, display_name, gender, session_duration_minutes, appointment_type")
    .eq("workspace_id", workspace_id)
    .eq("is_active", true)
    .order("display_name");

  if (pErr || !pastors?.length) {
    console.log(`[CPBotQuery] No active pastors for ws=${workspace_id}`);
    return { pastors: [], slots: [] };
  }

  console.log(`[CPBotQuery] Found ${pastors.length} active pastors`);

  // 2. Get availability rules for all these pastors
  const pastorIds = pastors.map((p: any) => p.id);
  const { data: avail } = await sb
    .from("cafe_pastor_availability")
    .select("pastor_id, day_of_week, start_time, end_time, session_type, is_active")
    .in("pastor_id", pastorIds)
    .eq("is_active", true);

  // 3. Get blocked slots for next 7 days
  const todayStr = new Date().toISOString().split("T")[0];
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  // Fetch config for min_advance_hours
  const { data: config } = await sb.from("cafe_pastor_config")
    .select("min_advance_hours")
    .eq("workspace_id", workspace_id)
    .maybeSingle();
  const advanceMs = (config?.min_advance_hours ?? 2) * 3600000;
  const { data: blocked } = await sb
    .from("cafe_pastor_blocked_slots")
    .select("pastor_id, blocked_date, blocked_start, blocked_end")
    .in("pastor_id", pastorIds)
    .gte("blocked_date", todayStr)
    .lte("blocked_date", in7Days);

  // 4. Get existing appointments for the next 7 days (to avoid double-booking)
  const { data: existing } = await sb
    .from("cafe_pastor_appointments")
    .select("pastor_id, scheduled_at, duration_minutes")
    .in("pastor_id", pastorIds)
    .gte("scheduled_at", new Date().toISOString())
    .lte("scheduled_at", new Date(Date.now() + 7 * 86400000).toISOString())
    .not("status", "in", "(cancelled,no_show)");

  // 5. Compute available slots per pastor for next 7 days
  const slots: any[] = [];
  const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  for (let dayOffset = 0; dayOffset <= 6; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);
    const dateStr = date.toISOString().split("T")[0];
    const dow = date.getDay(); // 0=Sun

    for (const pastor of pastors as any[]) {
      const rule = (avail ?? []).find(
        (a: any) => a.pastor_id === pastor.id && a.day_of_week === dow
      );
      if (!rule) continue;

      // Check if date is blocked (full day or time overlap)
      const dayBlocks = (blocked ?? []).filter(
        (b: any) => b.pastor_id === pastor.id && b.blocked_date === dateStr
      );

      // Generate hourly slots within availability window
      const [startH, startM] = rule.start_time.split(":").map(Number);
      const [endH, endM] = rule.end_time.split(":").map(Number);
      const duration = pastor.session_duration_minutes || 60;

      let slotH = startH, slotM = startM;
      while (slotH * 60 + slotM + duration <= endH * 60 + endM) {
        const slotISO = `${dateStr}T${String(slotH).padStart(2,"0")}:${String(slotM).padStart(2,"0")}:00`;
        const slotEnd = slotH * 60 + slotM + duration;

        // Skip if blocked
        const isBlocked = dayBlocks.some((b: any) => {
          if (!b.blocked_start && !b.blocked_end) return true; // full day
          const blockStartMins = b.blocked_start ? parseInt(b.blocked_start.split(":")[0]) * 60 + parseInt(b.blocked_start.split(":")[1]) : 0;
          const blockEndMins = b.blocked_end ? parseInt(b.blocked_end.split(":")[0]) * 60 + parseInt(b.blocked_end.split(":")[1]) : 1440;
          const sMin = slotH * 60 + slotM;
          return sMin < blockEndMins && slotEnd > blockStartMins;
        });

        // Skip if already booked
        const isBooked = (existing ?? []).some((e: any) => {
          if (e.pastor_id !== pastor.id) return false;
          const exStart = new Date(e.scheduled_at).getTime();
          const exEnd = exStart + (e.duration_minutes || duration) * 60000;
          const slotStart = new Date(slotISO).getTime();
          const slotEndTs = slotStart + duration * 60000;
          return slotStart < exEnd && slotEndTs > exStart;
        });

        // Skip if in the past (with 2hr buffer)
        const isPast = new Date(slotISO).getTime() < Date.now() + advanceMs;

        if (!isBlocked && !isBooked && !isPast) {
          slots.push({
            pastor_id: pastor.id,
            pastor_name: pastor.display_name,
            date: dateStr,
            day_label: DAY_NAMES[dow],
            time: `${String(slotH).padStart(2,"0")}:${String(slotM).padStart(2,"0")}`,
            slot_iso: slotISO,
            session_type: rule.session_type, // 'online' | 'inperson' | 'both'
          });
        }

        // Next slot
        slotM += duration;
        slotH += Math.floor(slotM / 60);
        slotM %= 60;
      }
    }
  }

  console.log(`[CPBotQuery] Computed ${slots.length} slots for ws=${workspace_id}`);
  return { pastors, slots };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad Request" }, 400); }

  const { workspace_id } = body ?? {};
  if (!workspace_id) return json({ error: "Missing workspace_id" }, 400);

  try {
    const result = await queryAvailableSlots(workspace_id);
    return json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[CPBotQuery]", e.message);
    return json({ error: e.message }, 500);
  }
});
