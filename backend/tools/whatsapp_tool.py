import os
import requests
from dotenv import load_dotenv

load_dotenv()

# We will need these variables from Coolify later when you spin up Evolution API
EVOLUTION_API_URL = os.environ.get("EVOLUTION_API_URL", "http://localhost:8080")
EVOLUTION_GLOBAL_API_KEY = os.environ.get("EVOLUTION_GLOBAL_API_KEY", "")

# The name of the instance you will create inside Evolution API (e.g., "lagoinha_orlando")
INSTANCE_NAME = os.environ.get("EVOLUTION_INSTANCE_NAME", "default_instance")

def send_welcome_message(phone: str, name: str, lang: str):
    """
    Triggers a Pre-Approved Meta Template to officially open the 24-hour interaction window.
    """
    # Map the requested language to the specific Meta template name you created
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
    
    # Uncomment when we have the URL
    # try:
    #     response = requests.post(f"{EVOLUTION_API_URL}/message/sendTemplate/{INSTANCE_NAME}", json=payload, headers=headers)
    #     response.raise_for_status()
    #     print("✅ Template Sent Successfully!")
    # except Exception as e:
    #     print(f"❌ Failed to send Template: {str(e)}")


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
        
        # Uncomment when we have the URL
        # try:
        #     requests.post(f"{EVOLUTION_API_URL}/message/sendText/{INSTANCE_NAME}", json=payload, headers=headers)
        # except Exception as e:
        #     print(f"❌ Failed to send WhatsApp Text: {str(e)}")
