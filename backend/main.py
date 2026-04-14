import os
import json
import datetime
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ──────────────────────────────────────────────────────────────────

def _row(res) -> Optional[dict]:
    """Return first row from a .execute() result, or None. Safe for single/maybe_single."""
    if res is None:
        return None
    # maybe_single returns SingleAPIResponse or None
    if hasattr(res, 'data'):
        d = res.data
        if d is None:
            return None
        if isinstance(d, list):
            return d[0] if d else None
        if isinstance(d, dict):
            return d
    return None

def _rows(res) -> list:
    """Return list of rows from a .execute() result."""
    if res is None:
        return []
    if hasattr(res, 'data'):
        d = res.data
        if isinstance(d, list):
            return d
    return []


# ── AI / Response Generation ─────────────────────────────────────────────────

def generate_response(lead_id: str, lead_name: str, workspace_id: str, incoming_message: str) -> str:
    try:
        from tools.db_tool import supabase
        import google.generativeai as genai

        GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
        if not GEMINI_API_KEY:
            return None

        genai.configure(api_key=GEMINI_API_KEY)

        ws = supabase.table("workspaces").select("knowledge_base, name").eq("id", workspace_id).execute()
        ws_row = _row(ws)
        kb = ws_row.get("knowledge_base", {}) if ws_row else {}
        church_name = ws_row.get("name", "Igreja") if ws_row else "Igreja"

        history_res = supabase.table("messages") \
            .select("direction, content") \
            .eq("lead_id", lead_id) \
            .order("created_at", desc=False) \
            .limit(20) \
            .execute()
        history = _rows(history_res)

        events = kb.get("events", [])
        address = kb.get("address", "")
        pastors = kb.get("pastors", [])
        extra_info = kb.get("extra_info", "")

        events_text = "\n".join([f"- {e}" for e in events]) if events else "Não informado."
        pastors_text = ", ".join(pastors) if pastors else "Não informado."

        system_prompt = f"""Você é Ju, a assistente virtual da {church_name}. 
Responda em português, seja acolhedora, calorosa e concisa. 

INFORMAÇÕES DA IGREJA:
- Nome: {church_name}
- Endereço: {address or 'Não informado'}
- Pastores: {pastors_text}
- Eventos/Cultos:
{events_text}
{f'- Info Extra: {extra_info}' if extra_info else ''}

Regras:
- Máximo 2 parágrafos curtos por resposta
- Use emojis com moderação
- Se não souber algo, diga que um humano pode ajudar
- NÃO mencione que é uma IA ou robô, apenas diga que é Ju
- Se quiser enviar múltiplas mensagens separadas, use || entre elas"""

        conversation = []
        for msg in history[-10:]:
            role = "user" if msg["direction"] == "inbound" else "model"
            conversation.append({"role": role, "parts": [msg["content"]]})

        conversation.append({"role": "user", "parts": [incoming_message]})

        model = genai.GenerativeModel("gemini-2.0-flash", system_instruction=system_prompt)
        chat = model.start_chat(history=conversation[:-1])
        response = chat.send_message(incoming_message)

        return response.text.strip()
    except Exception as e:
        print(f"AI generate_response error: {e}")
        return None


# ── Webhook: Meta WhatsApp Inbound ────────────────────────────────────────────

# ── /webhook/new_lead — Postgres Trigger Automation ──────────────────────────

EDGE_URL = "https://uyseheucqikgcorrygzc.supabase.co/functions/v1"

import time
import httpx

def fire_welcome_template(
    lead_id: str,
    workspace_id: str,
    template_name: str,
    language_code: str,
    delay_minutes: int
):
    """Background task: optionally wait, then call the Edge Function to send the template."""
    if delay_minutes > 0:
        time.sleep(delay_minutes * 60)

    try:
        resp = httpx.post(
            f"{EDGE_URL}/whatsapp-send-template",
            json={
                "lead_id": lead_id,
                "workspace_id": workspace_id,
                "template_name": template_name,
                "language_code": language_code,
            },
            timeout=15,
        )
        print(f"[AUTO] whatsapp-send-template → {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"[AUTO] Fire template error: {e}")


@app.post("/webhook/new_lead")
async def new_lead_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Called by Postgres trigger on every lead INSERT.
    Reads automation_config from the workspace to decide whether and which
    WhatsApp welcome template to send, routing by lead.source (form name).
    """
    from tools.db_tool import supabase

    try:
        body = await request.json()
    except Exception:
        return {"status": "error", "reason": "invalid_json"}

    record = body.get("record", {})
    lead_id      = record.get("id")
    workspace_id = record.get("workspace_id")
    phone        = record.get("phone")
    source       = record.get("source") or "unknown"

    if not lead_id or not workspace_id:
        return {"status": "skipped", "reason": "missing_lead_or_workspace"}

    if not phone:
        print(f"[AUTO] Lead {lead_id} has no phone — skipping automation.")
        return {"status": "skipped", "reason": "no_phone"}

    # Load workspace automation config
    ws_res = supabase.table("workspaces").select("automation_config").eq("id", workspace_id).execute()
    ws_row = _row(ws_res)
    auto_config = (ws_row or {}).get("automation_config") or {}

    if not auto_config.get("enabled", False):
        print(f"[AUTO] Workspace {workspace_id} automation disabled — skipping.")
        return {"status": "skipped", "reason": "automation_disabled"}

    # Match source against rules array
    # Rule structure: { "source": "consolida-form", "template": "consolidacao", "language": "pt_BR" }
    rules = auto_config.get("rules", [])
    matched_template = None
    matched_language = auto_config.get("default_language", "pt_BR")

    for rule in rules:
        if rule.get("source") == source:
            matched_template = rule.get("template")  # None = explicitly disabled for this source
            matched_language = rule.get("language", matched_language)
            break
    else:
        # No rule matched → use workspace default
        matched_template = auto_config.get("default_template")

    if not matched_template:
        print(f"[AUTO] No template configured for source '{source}' in workspace {workspace_id}.")
        return {"status": "skipped", "reason": "no_template_for_source"}

    delay = int(auto_config.get("delay_minutes", 0))

    print(f"[AUTO] Queuing template '{matched_template}' for lead {lead_id} (source={source}, delay={delay}min)")

    background_tasks.add_task(
        fire_welcome_template,
        lead_id,
        workspace_id,
        matched_template,
        matched_language,
        delay,
    )

    return {"status": "queued", "template": matched_template, "delay_minutes": delay}


@app.get("/webhook")
def verify_webhook(request: Request):
    params = dict(request.query_params)
    if params.get("hub.verify_token") == "meu_token_secreto":
        return int(params.get("hub.challenge", 0))
    raise HTTPException(status_code=403, detail="Forbidden")


@app.post("/webhook")
async def receive_webhook(request: Request):
    from tools.db_tool import supabase

    body = await request.json()
    try:
        entry = body.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})

        wa_business_phone_id = value.get("metadata", {}).get("phone_number_id", "")
        messages = value.get("messages", [])
        contacts = value.get("contacts", [])

        if not messages:
            return {"status": "no_messages"}

        msg = messages[0]
        phone = msg["from"]
        msg_type = msg.get("type", "text")
        text_content = ""

        if msg_type == "text":
            text_content = msg.get("text", {}).get("body", "")
        elif msg_type == "audio":
            text_content = f"[ÁUDIO TRANSCRITO] \"{msg.get('audio', {}).get('id', 'audio')}\""
        elif msg_type == "image":
            text_content = "[Imagem recebida]"
        elif msg_type == "video":
            text_content = "[Video recebido]"
        elif msg_type == "document":
            text_content = "[Documento recebido]"

        contact_name = contacts[0].get("profile", {}).get("name", phone) if contacts else phone

        # --- Match workspace by phone_id ---
        ws_all = supabase.table("workspaces").select("id, credentials").execute()
        workspace_id = None
        for ws in _rows(ws_all):
            creds = ws.get("credentials") or {}
            if creds.get("phone_id") == wa_business_phone_id:
                workspace_id = ws["id"]
                break

        if not workspace_id:
            print(f"⚠️ No workspace for phone_id {wa_business_phone_id}")
            return {"status": "workspace_not_found"}

        phone_digits = phone.lstrip("+")

        # --- Find or create lead ---
        lead_res = supabase.table("leads").select("id, workspace_id").eq("phone", phone_digits).eq("workspace_id", workspace_id).execute()
        lead_rows = _rows(lead_res)
        lead_id = None

        if lead_rows:
            lead_id = lead_rows[0]["id"]
            workspace_id = lead_rows[0].get("workspace_id", workspace_id)
            supabase.table("leads").update({
                "last_interaction": datetime.now().isoformat(),
                "inbox_status": "highlighted",
                "wa_window_expires_at": (datetime.now() + datetime.timedelta(hours=24)).isoformat()
            }).eq("id", lead_id).execute()
        else:
            new_lead = supabase.table("leads").insert({
                "workspace_id": workspace_id,
                "name": contact_name,
                "phone": phone_digits,
                "type": "visitor",
                "last_interaction": datetime.now().isoformat(),
                "wa_window_expires_at": (datetime.now() + datetime.timedelta(hours=24)).isoformat()
            }).execute()
            if _rows(new_lead):
                lead_id = _rows(new_lead)[0]["id"]

        if lead_id:
            supabase.table("messages").insert({
                "lead_id": lead_id,
                "workspace_id": workspace_id,
                "direction": "inbound",
                "content": text_content,
                "type": msg_type if msg_type in ['text', 'image', 'audio', 'video', 'document'] else 'text',
                "automated": False
            }).execute()
            print(f"✅ Message saved for lead {lead_id}")

            if msg_type == "text" and text_content:
                lead_lock_res = supabase.table("leads").select("llm_lock_until, name").eq("id", lead_id).execute()
                lead_data = (_rows(lead_lock_res)[0]) if _rows(lead_lock_res) else {}

                lock_until = lead_data.get("llm_lock_until")
                is_locked = False
                if lock_until:
                    try:
                        from datetime import timezone
                        lock_dt = datetime.fromisoformat(lock_until.replace("Z", "+00:00"))
                        is_locked = datetime.now(timezone.utc) < lock_dt
                    except Exception:
                        pass

                if not is_locked:
                    try:
                        ai_reply = generate_response(
                            lead_id=lead_id,
                            lead_name=lead_data.get("name", contact_name),
                            workspace_id=workspace_id,
                            incoming_message=text_content
                        )
                        if ai_reply:
                            parts = [p.strip() for p in ai_reply.split("||") if p.strip()]
                            ws_row = supabase.table("workspaces").select("credentials").eq("id", workspace_id).execute()
                            creds = (_rows(ws_row)[0] or {}).get("credentials", {}) if _rows(ws_row) else {}
                            wa_token = creds.get("whatsapp_token")
                            wa_phone_id = creds.get("phone_id")
                            if wa_token and wa_phone_id:
                                from tools.whatsapp_tool import send_whatsapp_message
                                for part in parts:
                                    send_whatsapp_message(wa_phone_id, wa_token, phone, part)
                                    supabase.table("messages").insert({
                                        "lead_id": lead_id,
                                        "workspace_id": workspace_id,
                                        "direction": "outbound",
                                        "content": part,
                                        "type": "text",
                                        "automated": True
                                    }).execute()
                    except Exception as e:
                        print(f"❌ AI Error: {e}")
                else:
                    print(f"🔒 AI locked until {lock_until}")

    except Exception as e:
        import traceback
        print(f"[webhook ERROR] {traceback.format_exc()}")

    return {"status": "ok"}


# ── /whatsapp/send — Manual Message from Dashboard ────────────────────────────

class SendWAMessagePayload(BaseModel):
    phone: Optional[str] = None
    lead_id: Optional[str] = None
    text: str
    workspace_id: str

@app.post("/whatsapp/send")
def process_send_whatsapp_message(data: SendWAMessagePayload):
    from tools.db_tool import supabase
    from tools.whatsapp_tool import send_whatsapp_message
    from datetime import timezone, timedelta

    try:
        # Resolve phone
        phone = data.phone
        if not phone and data.lead_id:
            lead_res = supabase.table("leads").select("phone").eq("id", data.lead_id).execute()
            lead_row = _row(lead_res)
            if lead_row:
                phone = lead_row["phone"]

        if not phone:
            return {"error": "Telefone não encontrado", "ok": False}

        # Strip + from phone
        phone = phone.lstrip("+")

        # Fetch workspace credentials
        ws_res = supabase.table("workspaces").select("credentials").eq("id", data.workspace_id).execute()
        ws_row = _row(ws_res)
        if not ws_row or not ws_row.get("credentials"):
            return {"error": "Credenciais Meta não encontradas no Workspace", "ok": False}

        credentials = ws_row["credentials"]
        access_token = credentials.get("whatsapp_token")
        phone_id = credentials.get("phone_id")

        if not access_token or not phone_id:
            return {"error": "Sem Acesso (Falta Token ou Phone ID)", "ok": False}

        # Send via Meta API
        result = send_whatsapp_message(phone_id, access_token, phone, data.text)

        if "error" in result:
            return {"status": "failed", "details": result, "ok": False}

        # Log the message
        if data.lead_id:
            supabase.table("messages").insert({
                "lead_id": data.lead_id,
                "workspace_id": data.workspace_id,
                "direction": "outbound",
                "content": data.text,
                "type": "text",
                "automated": False
            }).execute()

            # Set human lock (30 min)
            lock_until = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
            supabase.table("leads").update({"llm_lock_until": lock_until}).eq("id", data.lead_id).execute()

        return {"status": "success", "ok": True, "lock_until": lock_until if data.lead_id else None}

    except Exception as e:
        import traceback
        print(f"[/whatsapp/send ERROR] {traceback.format_exc()}")
        return {"error": f"Erro interno: {str(e)}", "ok": False}


# ── /whatsapp/templates — List Approved Templates ─────────────────────────────

@app.get("/whatsapp/templates")
def get_whatsapp_templates(workspace_id: str):
    from tools.db_tool import supabase
    from tools.whatsapp_tool import list_whatsapp_templates

    try:
        ws_res = supabase.table("workspaces").select("credentials").eq("id", workspace_id).execute()
        ws_row = _row(ws_res)
        if not ws_row or not ws_row.get("credentials"):
            return {"error": "Credenciais não encontradas", "templates": []}

        creds = ws_row["credentials"]
        access_token = creds.get("whatsapp_token")
        waba_id = creds.get("waba_id") or creds.get("business_id")

        if not access_token:
            return {"error": "Token de acesso não configurado", "templates": []}

        if not waba_id:
            return {"error": "WABA ID não configurado. Configure em Configurações > WhatsApp.", "templates": []}

        templates = list_whatsapp_templates(waba_id, access_token)
        return {"templates": templates}

    except Exception as e:
        import traceback
        print(f"[/whatsapp/templates ERROR] {traceback.format_exc()}")
        return {"error": f"Erro interno: {str(e)}", "templates": []}


# ── /whatsapp/send-template — Send Approved Template ─────────────────────────

class SendTemplatePayload(BaseModel):
    lead_id: str
    workspace_id: str
    template_name: str
    language_code: str = "pt_BR"
    variables: List[str] = []

@app.post("/whatsapp/send-template")
def send_template_message(data: SendTemplatePayload):
    from tools.db_tool import supabase
    from tools.whatsapp_tool import send_whatsapp_template

    try:
        # Get lead phone
        lead_res = supabase.table("leads").select("phone, name").eq("id", data.lead_id).execute()
        lead_row = _row(lead_res)
        if not lead_row:
            return {"error": "Lead não encontrado", "ok": False}

        phone = lead_row["phone"].lstrip("+")
        lead_name = lead_row.get("name", "")

        # Get workspace credentials
        ws_res = supabase.table("workspaces").select("credentials").eq("id", data.workspace_id).execute()
        ws_row = _row(ws_res)
        if not ws_row or not ws_row.get("credentials"):
            return {"error": "Credenciais não encontradas", "ok": False}

        creds = ws_row["credentials"]
        access_token = creds.get("whatsapp_token")
        phone_id = creds.get("phone_id")

        if not access_token or not phone_id:
            return {"error": "Token ou Phone ID não configurados", "ok": False}

        # Build components (only if variables provided)
        components = []
        if data.variables:
            params = [{"type": "text", "text": v} for v in data.variables]
            components = [{"type": "body", "parameters": params}]

        result = send_whatsapp_template(phone_id, access_token, phone, data.template_name, data.language_code, components)

        if "error" in result:
            return {"status": "failed", "details": result, "ok": False}

        # Log to messages table
        var_preview = " / ".join(data.variables) if data.variables else ""
        supabase.table("messages").insert({
            "lead_id": data.lead_id,
            "workspace_id": data.workspace_id,
            "direction": "outbound",
            "content": f"[Template: {data.template_name}] {var_preview}".strip(),
            "type": "text",
            "automated": False
        }).execute()

        return {"status": "success", "ok": True}

    except Exception as e:
        import traceback
        print(f"[/whatsapp/send-template ERROR] {traceback.format_exc()}")
        return {"error": f"Erro interno: {str(e)}", "ok": False}


# ── Meta Embedded Signup (OAuth) ──────────────────────────────────────────────

META_APP_ID = os.environ.get("META_APP_ID", "934037612918640")
META_APP_SECRET = os.environ.get("META_APP_SECRET", "")

class WAShortTokenPayload(BaseModel):
    short_lived_token: str

@app.post("/whatsapp/exchange-token")
async def exchange_whatsapp_token(payload: WAShortTokenPayload):
    import requests as req
    try:
        # Step 1: Exchange short for long lived token
        r = req.get("https://graph.facebook.com/v22.0/oauth/access_token", params={
            "grant_type": "fb_exchange_token",
            "client_id": META_APP_ID,
            "client_secret": META_APP_SECRET,
            "fb_exchange_token": payload.short_lived_token,
        })
        data = r.json()
        if "access_token" not in data:
            return {"error": f"Could not exchange token: {data}"}

        long_token = data["access_token"]

        # Step 2: Get WABA & Phone details
        me = req.get(f"https://graph.facebook.com/v22.0/me", params={
            "access_token": long_token,
            "fields": "id,name,businesses"
        }).json()

        return {"access_token": long_token, "meta_info": me}
    except Exception as e:
        return {"error": str(e)}


@app.get("/")
def root():
    return {"status": "Zelo Pro API running", "version": "2.1.0"}
