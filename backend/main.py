import os
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from tools.db_tool import create_lead, log_message
from tools.whatsapp_tool import send_welcome_message, get_whatsapp_status, get_whatsapp_qr
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


@app.post("/webhook/evolution")
async def process_whatsapp_message(request: Request, background_tasks: BackgroundTasks):
    """
    This webhook catches incoming WhatsApp messages from Evolution API.
    """
    try:
        payload = await request.json()
    except Exception:
        return {"status": "error", "message": "Invalid JSON"}
        
    print(f"💬 Incoming Webhook Payload Event: {payload.get('event')}")
    
    # Check if it is a message upsert event
    event = payload.get("event", "")
    if event != "messages.upsert":
        return {"status": "ignored", "reason": "Not a messages.upsert event"}

    data = payload.get("data", {})
    
    # Evolution API payload structure varies
    if "message" in data and isinstance(data["message"], dict):
        msg_data = data["message"]
    else:
        msg_data = data
        
    key = msg_data.get("key", {})
    from_me = key.get("fromMe", False)
    
    # Ignore messages sent by ourselves
    if from_me:
        return {"status": "ignored", "reason": "Outgoing message"}
        
    remote_jid = key.get("remoteJid", "")
    if not remote_jid or "@g.us" in remote_jid:
        return {"status": "ignored", "reason": "Group message or missing JID"}
        
    # Extract phone number
    phone = remote_jid.split("@")[0]
    
    # Extract message content
    content_obj = msg_data.get("message", {})
    
    text_content = ""
    msg_type = "text"
    
    if "conversation" in content_obj:
        text_content = content_obj["conversation"]
    elif "extendedTextMessage" in content_obj:
        text_content = content_obj["extendedTextMessage"].get("text", "")
    elif "imageMessage" in content_obj:
        msg_type = "image"
        text_content = "[Imagem Recebida] " + content_obj["imageMessage"].get("caption", "")
    elif "audioMessage" in content_obj:
        msg_type = "audio"
        text_content = "[Áudio Recebido]"
    elif "documentMessage" in content_obj:
        msg_type = "document"
        text_content = "[Documento Recebido]"
    elif "videoMessage" in content_obj:
        msg_type = "video"
        text_content = "[Vídeo Recebido]"
    else:
        msg_type = "other"
        
    if not text_content and msg_type == "text":
        return {"status": "ignored", "reason": "Empty text"}
        
    print(f"📥 Message from {phone}: {text_content} (Type: {msg_type})")
    
    # Now, save to Supabase!
    from tools.db_tool import supabase
    
    search_phone = phone[-8:] if len(phone) >= 8 else phone
    res = supabase.table("leads").select("*").ilike("phone", f"%{search_phone}%").execute()
    
    lead_id = None
    workspace_id = "9c4e23cf-26e3-4632-addb-f28325aedac3" # Default workspace
    
    if res.data and len(res.data) > 0:
        lead_id = res.data[0]["id"]
        workspace_id = res.data[0].get("workspace_id", workspace_id)
        from datetime import datetime
        supabase.table("leads").update({"last_interaction": datetime.now().isoformat()}).eq("id", lead_id).execute()
    else:
        push_name = msg_data.get("pushName") or "Desconhecido"
        print(f"⚠️ Lead {phone} not found. Creating a new visitor lead as '{push_name}'.")
        new_lead = supabase.table("leads").insert({
            "workspace_id": workspace_id,
            "name": push_name,
            "phone": phone,
            "type": "visitor"
        }).execute()
        
        if new_lead.data:
            lead_id = new_lead.data[0]["id"]
            
    if lead_id:
        supabase.table("messages").insert({
            "lead_id": lead_id,
            "workspace_id": workspace_id,
            "direction": "inbound",
            "content": text_content,
            "type": msg_type,
            "automated": False
        }).execute()
        print(f"✅ Message saved to DB for lead {lead_id}!")

    return {"status": "success"}


# --- WHATSAPP CONNECTION ENDPOINTS ---

@app.get("/whatsapp/status")
def check_wa_status():
    """ Called by the dashboard to see if WhatsApp is connected """
    return get_whatsapp_status()

@app.post("/whatsapp/connect")
def generate_wa_qr():
    """ Called by the dashboard to generate and fetch the base64 QR Image securely """
    return get_whatsapp_qr()

class WAProviderPayload(BaseModel):
    provider: str
    phone_id: str
    token: str

@app.post("/whatsapp/set-provider")
def set_wa_provider(data: WAProviderPayload):
    """ Save and activate Cloud API credentials via Evolution API (WHATSAPP-BUSINESS) """
    print(f"--> [WHATSAPP] Setup Cloud API for PhoneID={data.phone_id}")
    import requests
    from tools.whatsapp_tool import EVOLUTION_API_URL, EVOLUTION_GLOBAL_API_KEY
    headers = {"apikey": EVOLUTION_GLOBAL_API_KEY}
    
    # Pre-emptively delete if it exists
    requests.delete(f"{EVOLUTION_API_URL}/instance/delete/LagoinhaCloud", headers=headers)
    
    payload = {
        "instanceName": "LagoinhaCloud",
        "integration": "WHATSAPP-BUSINESS",
        "phoneId": data.phone_id,
        "token": data.token,
        "number": "00000000000",   # Fake number placeholder required by Evo
        "businessId": "00000000000" # Fake businessId placeholder required by Evo
    }
    
    res = requests.post(f"{EVOLUTION_API_URL}/instance/create", json=payload, headers=headers)
    
    if res.status_code in [200, 201]:
        return {"status": "success", "provider": "cloud_api", "message": "Instância Meta gerada na Evolution com sucesso!"}
    else:
        return {"status": "error", "error": res.text}

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
    
    # Trigger Evolution API
    send_welcome_message(phone=lead.phone, name=lead.first_name, lang=lead.preferred_language)
    
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
