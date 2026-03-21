import os
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from tools.db_tool import create_lead, log_message
from tools.llm_tool import generate_response

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(env_path)

app = FastAPI(title="Lagoinha Consolidação - Orquestrador API")

# --- CORS Settings (Allows Frontend Dashboard to talk to this API) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to https://app.consolidacao.7pro.tech
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. JSON Data Schemas (Pydantic Models matching gemini.md) ---
class LeadInput(BaseModel):
    workspace_id: str
    first_name: str
    last_name: str
    phone: str
    email: str
    preferred_language: str
    type: str  # 'saved' or 'visitor'
    baptized: str
    gc_status: str

# --- 2. Endpoints (Navigation Layer) ---

@app.get("/")
def health_check():
    return {"status": "online", "message": "Lagoinha API is running ⚡"}

@app.post("/webhook/new_lead")
async def process_new_lead(lead: LeadInput, background_tasks: BackgroundTasks):
    """
    This webhook catches the POST from the Visitor/Saved Form.
    """
    print(f"✅ New Lead Received: {lead.first_name} ({lead.type})")
    
    # We use "BackgroundTasks" so the form submits instantly without making the user wait 
    # for the database insert or the WhatsApp message to actually send.
    background_tasks.add_task(handle_lead_logic, lead)
    
    return {"status": "processing", "lead_id": lead.phone}

@app.get("/webhook/meta")
def verify_meta_webhook(request: Request):
    """
    Meta Developer Portal Webhook Verification Endpoint.
    When you configure the webhook in the Meta App, it sends a GET request here 
    with a hub.challenge and hub.verify_token.
    """
    mode = request.query_params.get("hub.mode")
    verify_token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    # The token must exactly match what you paste in the Meta Developer Portal
    if mode == "subscribe" and verify_token == "lagoinhazxcvbnm1234":
        from fastapi.responses import PlainTextResponse
        print("✅ Meta Webhook Verified Successfully!")
        return PlainTextResponse(str(challenge))
    return {"status": "error", "message": "Invalid verification token"}


@app.post("/webhook/meta")
async def process_meta_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Catches incoming real-time WhatsApp messages sent directly from Meta Servers.
    """
    try:
        payload = await request.json()
    except Exception:
        return {"status": "error"}
        
    # Check if this is a WhatsApp Business Account webhook
    if payload.get("object") == "whatsapp_business_account":
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                
                # We only care about user messages, not status updates for now
                if "messages" in value:
                    for msg in value["messages"]:
                        # Extract sender contact name if available
                        contacts = value.get("contacts", [])
                        contact_name = contacts[0].get("profile", {}).get("name", "Desconhecido") if contacts else "Desconhecido"
                        
                        background_tasks.add_task(handle_meta_message_logic, msg, contact_name)
    
    # Meta requires a 200 OK instantly, otherwise it retries.
    return {"status": "success"}


def handle_meta_message_logic(msg_obj: dict, contact_name: str):
    from tools.db_tool import supabase
    from datetime import datetime

    phone = msg_obj.get("from", "")
    msg_type = msg_obj.get("type", "unknown")
    text_content = ""
    
    if msg_type == "text":
        text_content = msg_obj.get("text", {}).get("body", "")
    elif msg_type == "image":
        # Meta sends a media ID, downloading it requires another Graph API call
        text_content = "[Imagem Recebida]" 
    elif msg_type == "audio":
        text_content = "[Áudio Recebido]"
    elif msg_type == "video":
        text_content = "[Vídeo Recebido]"
    elif msg_type == "document":
        text_content = "[Documento Recebido]"
    else:
        text_content = f"[{msg_type} Recebido]"

    print(f"📥 Meta Message from {phone} ({contact_name}): {text_content}")

    # Normalize phone: strip + and non-digits, search by last 10 digits to handle country code variants
    phone_digits = ''.join(filter(str.isdigit, phone))
    search_phone = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits
    
    res = supabase.table("leads").select("*").ilike("phone", f"%{search_phone}%").order("last_interaction", desc=True).execute()
    
    lead_id = None
    workspace_id = "9c4e23cf-26e3-4632-addb-f28325aedac3"  # Default workspace
    
    if res.data and len(res.data) > 0:
        # Use the most recently interacted lead (avoids duplicates from old test entries)
        lead_id = res.data[0]["id"]
        workspace_id = res.data[0].get("workspace_id", workspace_id)
        supabase.table("leads").update({"last_interaction": datetime.now().isoformat()}).eq("id", lead_id).execute()
    else:
        # Create new lead with normalized phone (no + prefix)
        new_lead = supabase.table("leads").insert({
            "workspace_id": workspace_id,
            "name": contact_name,
            "phone": phone_digits,  # Normalized: digits only
            "type": "visitor",
            "last_interaction": datetime.now().isoformat()
        }).execute()
        
        if new_lead.data:
            lead_id = new_lead.data[0]["id"]
            
    if lead_id:
        supabase.table("messages").insert({
            "lead_id": lead_id,
            "workspace_id": workspace_id,
            "direction": "inbound",
            "content": text_content,
            "type": msg_type if msg_type in ['text', 'image', 'audio', 'video', 'document'] else 'text',
            "automated": False
        }).execute()
        print(f"✅ Meta Message logically saved to DB for lead {lead_id}!")

        # --- JU AI AUTO-REPLY ---
        # Only reply to text messages and only if the AI lock is not active
        if msg_type == "text" and text_content:
            lead_row = supabase.table("leads").select("llm_lock_until, name").eq("id", lead_id).single().execute()
            lead_data = lead_row.data or {}
            
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
                        # Support multi-part replies split by ||
                        parts = [p.strip() for p in ai_reply.split("||") if p.strip()]
                        
                        # Fetch credentials for this workspace
                        ws = supabase.table("workspaces").select("credentials").eq("id", workspace_id).single().execute()
                        creds = ws.data.get("credentials", {}) if ws.data else {}
                        access_token = creds.get("whatsapp_token")
                        phone_id = creds.get("phone_id")
                        
                        if access_token and phone_id:
                            from tools.whatsapp_tool import send_whatsapp_message
                            for part in parts:
                                send_whatsapp_message(phone_id, access_token, phone, part)
                                supabase.table("messages").insert({
                                    "lead_id": lead_id,
                                    "workspace_id": workspace_id,
                                    "direction": "outbound",
                                    "content": part,
                                    "type": "text",
                                    "automated": True
                                }).execute()
                            print(f"🤖 Ju replied to {phone} with {len(parts)} message(s).")
                        else:
                            print("⚠️ Ju AI: No WhatsApp credentials configured for this workspace.")
                except Exception as e:
                    print(f"❌ Ju AI Error: {e}")
            else:
                print(f"🔒 AI locked until {lock_until} — skipping Ju reply.")


# --- WHATSAPP INTERNAL PROXY EXTENSION ---

class SendWAMessagePayload(BaseModel):
    phone: str
    text: str
    workspace_id: str

@app.post("/whatsapp/send")
def process_send_whatsapp_message(data: SendWAMessagePayload):
    from tools.db_tool import supabase
    from tools.whatsapp_tool import send_whatsapp_message
    
    # 1. Fetch credentials from DB dynamically
    res = supabase.table("workspaces").select("credentials").eq("id", data.workspace_id).execute()
    if not res.data or not res.data[0].get("credentials"):
        return {"error": "Credenciais Meta não encontradas no Workspace"}
        
    credentials = res.data[0]["credentials"]
    access_token = credentials.get("whatsapp_token")
    phone_id = credentials.get("phone_id")
    
    if not access_token or not phone_id:
        return {"error": "Sem Acesso (Falta Token ou Phone ID)"}
        
    # 2. Fire to Meta Directly
    result = send_whatsapp_message(phone_id, access_token, data.phone, data.text)
    
    if "error" in result:
        return {"status": "failed", "details": result}
    return {"status": "success", "meta_response": result}

# --- EMAIL ENDPOINTS (RESEND) ---
from tools.email_tool import send_credentials_email, send_reset_password_email, send_report_email

class EmailCredentials(BaseModel):
    user_email: str
    user_name: str
    temp_password: str

@app.post("/api/email/send-credentials")
def api_send_credentials(data: EmailCredentials):
    return send_credentials_email(data.user_email, data.user_name, data.temp_password)

class EmailReset(BaseModel):
    user_email: str
    reset_link: str

@app.post("/api/email/forgot-password")
def api_send_forgot_password(data: EmailReset):
    return send_reset_password_email(data.user_email, data.reset_link)

class EmailReport(BaseModel):
    user_email: str
    report_type: str
    total_count: int
    csv_link: str
    leads: list = []

@app.post("/api/email/send-report")
def api_send_report(data: EmailReport):
    return send_report_email(data.user_email, data.report_type, data.total_count, data.csv_link, data.leads)


# --- 3. Business Logic Orchestrators ---

def handle_lead_logic(lead: LeadInput):
    """
    1. Insert into Supabase 'leads' table.
    2. Tell Evolution API to send the Welcome Message.
    """
    full_name = f"{lead.first_name} {lead.last_name}"
    print(f"--> [DB] Inserting {full_name} into Supabase...")
    
    # Insert into database
    lead_id = create_lead(
        workspace_id=lead.workspace_id,
        first_name=lead.first_name,
        last_name=lead.last_name,
        phone=lead.phone,
        preferred_lang=lead.preferred_language,
        lead_type=lead.type
    )
    
    print(f"--> [WHATSAPP] Sending Welcome Template to {lead.phone}...")
    
    # Trigger Meta API
    welcome_msg = f"Olá {lead.first_name}, seja bem-vindo(a) à Lagoinha!"
    process_send_whatsapp_message(SendWAMessagePayload(
        phone=lead.phone,
        text=welcome_msg,
        workspace_id=lead.workspace_id
    ))
    
    # Log the outbound message to the database
    if lead_id:
        log_message(
            workspace_id=lead.workspace_id,
            lead_id=lead_id,
            direction='outbound',
            content="[Template enviado / apertando janela 24h]",
            is_automated=True
        )
    
    print("✅ Lead Logic Completed.")
