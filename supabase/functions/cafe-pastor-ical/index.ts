import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) return new Response("Missing token", { status: 400 });

  const { data: pastor, error: pastorErr } = await sb.from("cafe_pastor_pastors")
    .select("id, display_name")
    .eq("ical_token", token)
    .single();

  if (pastorErr || !pastor) return new Response("Invalid token", { status: 401 });

  const { data: appointments } = await sb.from("cafe_pastor_appointments")
    .select("*")
    .eq("pastor_id", pastor.id)
    .in("status", ["confirmed", "pending"]);

  let ical = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Zelo Pro//Cafe com Pastor//PT\r\nCALSCALE:GREGORIAN\r\n`;

  if (appointments) {
    for (const app of appointments) {
      const dtstart = new Date(app.scheduled_at).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const dtend = new Date(new Date(app.scheduled_at).getTime() + app.duration_minutes * 60000).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      
      ical += `BEGIN:VEVENT\r\n`;
      ical += `UID:${app.id}@zelo.7prolabs.com\r\n`;
      ical += `DTSTAMP:${dtstart}\r\n`;
      ical += `DTSTART:${dtstart}\r\n`;
      ical += `DTEND:${dtend}\r\n`;
      ical += `SUMMARY:Café com Pastor - ${app.requester_name}\r\n`;
      ical += `DESCRIPTION:Atendimento ${app.appointment_type}\\nTelefone: ${app.requester_phone}\r\n`;
      ical += `END:VEVENT\r\n`;
    }
  }

  ical += `END:VCALENDAR\r\n`;

  return new Response(ical, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="pastor_agenda.ics"`
    }
  });
});
