import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

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
    .in("status", ["confirmed", "pending"])
    .order("scheduled_at", { ascending: true });

  const now = toIcalDate(new Date());
  let ical = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Zelo Pro//Cafe com Pastor//PT\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Café com Pastor - ${escapeIcalText(pastor.display_name)}\r\n`;

  if (appointments) {
    for (const app of appointments) {
      const start = new Date(app.scheduled_at);
      const dtstart = toIcalDate(start);
      const dtend = toIcalDate(new Date(start.getTime() + (app.duration_minutes || 60) * 60000));
      
      ical += `BEGIN:VEVENT\r\n`;
      ical += `UID:${app.id}@zelo.7prolabs.com\r\n`;
      ical += `DTSTAMP:${now}\r\n`;
      ical += `DTSTART:${dtstart}\r\n`;
      ical += `DTEND:${dtend}\r\n`;
      ical += `SUMMARY:${escapeIcalText(`Café com Pastor - ${app.requester_name || "Atendimento"}`)}\r\n`;
      ical += `DESCRIPTION:${escapeIcalText(`Atendimento ${app.appointment_type || ""}\\nTelefone: ${app.requester_phone || "—"}`)}\r\n`;
      ical += `END:VEVENT\r\n`;
    }
  }

  ical += `END:VCALENDAR\r\n`;

  return new Response(ical, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="pastor_agenda.ics"`
    }
  });
});

function toIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcalText(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
