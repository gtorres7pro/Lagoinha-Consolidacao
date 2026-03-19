import os
import requests
from dotenv import load_dotenv

load_dotenv()

# We will need these variables from Coolify later when you spin up Evolution API
EVOLUTION_API_URL = os.environ.get("EVOLUTION_API_URL", "https://consolidacao.7pro.tech")
EVOLUTION_GLOBAL_API_KEY = os.environ.get("EVOLUTION_GLOBAL_API_KEY", "lagoinhazxcvbnm1234")

# The name of the instance you will create inside Evolution API (e.g., "lagoinha_orlando")
INSTANCE_NAME = os.environ.get("EVOLUTION_INSTANCE_NAME", "LagoinhaBR")

def get_whatsapp_status():
    """
    Checks if the Evolution API instance 'Lagoinha' is currently connected to WhatsApp.
    """
    headers = {"apikey": EVOLUTION_GLOBAL_API_KEY}
    try:
        response = requests.get(f"{EVOLUTION_API_URL}/instance/connectionState/{INSTANCE_NAME}", headers=headers)
        if response.status_code == 200:
            data = response.json()
            return {"state": data.get("instance", {}).get("state", "disconnected")}
        return {"state": "disconnected"}
    except Exception as e:
        print(f"Error checking WA status: {e}")
        return {"state": "error"}

def get_whatsapp_qr():
    """
    Attempts to create the instance if it doesn't exist, and fetches the base64 QR code.
    Added a small retry loop because Evolution API takes a second to load the Baileys session.
    """
    import time
    headers = {"apikey": EVOLUTION_GLOBAL_API_KEY, "Content-Type": "application/json"}
    
    # 1. Try to create the instance (fails silently if it already exists)
    create_payload = {
        "instanceName": INSTANCE_NAME,
        "qrcode": True,
        "integration": "WHATSAPP-BAILEYS"
    }
    requests.post(f"{EVOLUTION_API_URL}/instance/create", json=create_payload, headers=headers)
    
    # 2. Fetch the QR code or connection state (retry up to 3 times)
    try:
        for _ in range(3):
            response = requests.get(f"{EVOLUTION_API_URL}/instance/connect/{INSTANCE_NAME}", headers=headers)
            if response.status_code == 200:
                data = response.json()
                
                if "base64" in data and data["base64"]:
                    return {"status": "qr", "qr_code": data["base64"]}
                elif "qrcode" in data and "base64" in data["qrcode"] and data["qrcode"]["base64"]:
                    return {"status": "qr", "qr_code": data["qrcode"]["base64"]}
                elif data.get("instance", {}).get("state") == "open":
                    return {"status": "connected"}
                
            time.sleep(1.5) # Wait for Baileys to emit the QR code
            
        return {"status": "wait"} # Still connecting
    except Exception as e:
        print(f"Error fetching QR: {e}")
        return {"status": "error"}

def send_welcome_message(phone: str, name: str, lang: str):
    """
    Triggers a Pre-Approved Meta Template to officially open the 24-hour interaction window.
    """
    template_map = {
        "pt": "welcome_visitor_pt",
        "en": "welcome_visitor_en",
        "es": "welcome_visitor_es"
    }
    
    template_name = template_map.get(lang, "welcome_visitor_pt")
    
    print(f"[Evolution API] Attempting to send '{template_name}' template to {phone}...")
    
    # Example payload specific to Evolution API v2 for Template Messages
    payload = {
        "number": phone,
        "template": {
            "name": template_name,
            "language": {
                "policy": "deterministic",
                "code": lang if lang != "pt" else "pt_BR" 
            },
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {
                            "type": "text",
                            "text": name # This replaces {{1}} in the Meta template
                        }
                    ]
                }
            ]
        }
    }
    
    headers = {
        "apikey": EVOLUTION_GLOBAL_API_KEY,
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(f"{EVOLUTION_API_URL}/message/sendTemplate/{INSTANCE_NAME}", json=payload, headers=headers)
        response.raise_for_status()
        print("✅ Template Sent Successfully!")
    except Exception as e:
        print(f"❌ Failed to send Template: {str(e)}")


def send_standard_text(phone: str, message: str):
    """
    Sends a standard text message. If the message contains '||', it splits it 
    and sends multiple sequential messages to simulate human typing.
    """
    headers = {
        "apikey": EVOLUTION_GLOBAL_API_KEY,
        "Content-Type": "application/json"
    }
    
    # The LLM prompt forces the AI to use '||' for splitting large paragraphs.
    message_chunks = [chunk.strip() for chunk in message.split("||") if chunk.strip()]
    
    for chunk in message_chunks:
        payload = {
            "number": phone,
            "text": chunk
        }
        print(f"[Evolution API] Sending Text Chunk: {chunk}")
        
        try:
            requests.post(f"{EVOLUTION_API_URL}/message/sendText/{INSTANCE_NAME}", json=payload, headers=headers)
        except Exception as e:
            print(f"❌ Failed to send WhatsApp Text: {str(e)}")
