import os
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from tools.db_tool import create_lead, log_message
from tools.whatsapp_tool import send_welcome_message, get_whatsapp_status, get_whatsapp_qr
from tools.llm_tool import generate_response

load_dotenv()

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
    payload = await request.json()
    print("💬 Incoming WhatsApp Message Received!")
    
    # Send to background task to process with Gemini
    # background_tasks.add_task(handle_whatsapp_logic, payload)
    
    return {"status": "received"}


# --- WHATSAPP CONNECTION ENDPOINTS ---

@app.get("/whatsapp/status")
def check_wa_status():
    """ Called by the dashboard to see if WhatsApp is connected """
    return get_whatsapp_status()

@app.post("/whatsapp/connect")
def generate_wa_qr():
    """ Called by the dashboard to generate and fetch the base64 QR Image securely """
    return get_whatsapp_qr()


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
