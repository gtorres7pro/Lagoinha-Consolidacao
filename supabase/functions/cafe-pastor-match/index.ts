import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

  // Fetch active pastors
  let query = sb.from("cafe_pastor_pastors")
    .select("id, display_name, gender, bio, photo_url, session_duration_minutes, appointment_type")
    .eq("workspace_id", workspace_id)
    .eq("is_active", true);

  // Optional gender filter (match casal or specific gender)
  if (gender && gender !== "nao_informado") {
    query = query.in("gender", [gender, "casal", "any"]);
  }

  const { data: pastors, error: pErr } = await query.order("display_name");
  if (pErr || !pastors?.length) return json({ ok: true, pastors: [], slots: [] });

  const pastorIds = pastors.map((p: any) => p.id);
  const todayStr = new Date().toISOString().split("T")[0];
  const in14Days = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

  // Fetch availability rules
  const { data: avail } = await sb.from("cafe_pastor_availability")
    .select("pastor_id, day_of_week, start_time, end_time, session_type, is_active")
    .in("pastor_id", pastorIds).eq("is_active", true);

  // Fetch blocked slots
  const { data: blocked } = await sb.from("cafe_pastor_blocked_slots")
    .select("pastor_id, blocked_date, blocked_start, blocked_end")
    .in("pastor_id", pastorIds).gte("blocked_date", todayStr).lte("blocked_date", in14Days);

  // Fetch existing appointments
  const { data: existing } = await sb.from("cafe_pastor_appointments")
    .select("pastor_id, scheduled_at, duration_minutes")
    .in("pastor_id", pastorIds)
    .gte("scheduled_at", new Date().toISOString())
    .lte("scheduled_at", new Date(Date.now() + 14 * 86400000).toISOString())
    .not("status", "in", "(cancelled,no_show)");

  const slots: any[] = [];
  const DAY_NAMES = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];

  for (let dayOffset = 0; dayOffset <= 13; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);
    const dateStr = date.toISOString().split("T")[0];
    const dow = date.getDay();

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
        const slotISO = `${dateStr}T${String(slotH).padStart(2,"0")}:${String(slotM).padStart(2,"0")}:00`;
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
          const slotStart = new Date(slotISO).getTime();
          return slotStart < exEnd && (slotStart + duration * 60000) > exStart;
        });

        const isPast = new Date(slotISO).getTime() < Date.now() + 2 * 3600000;

        if (!isBlocked && !isBooked && !isPast) {
          slots.push({
            pastor_id: pastor.id,
            pastor_name: pastor.display_name,
            pastor_photo: pastor.photo_url,
            date: dateStr,
            day_label: DAY_NAMES[dow],
            time: `${String(slotH).padStart(2,"0")}:${String(slotM).padStart(2,"0")}`,
            slot_iso: slotISO,
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

  return json({ ok: true, pastors, slots });
});
