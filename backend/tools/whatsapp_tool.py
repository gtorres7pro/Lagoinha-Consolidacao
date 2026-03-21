import os
import requests
from dotenv import load_dotenv

load_dotenv()

def send_whatsapp_message(phone_id: str, access_token: str, to: str, message: str) -> dict:
    """
    Sends a text message using the Official Meta WhatsApp Cloud API v22.0.
    """
    url = f"https://graph.facebook.com/v22.0/{phone_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": message
        }
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return {"status": "success", "data": response.json()}
    except requests.exceptions.HTTPError as e:
        print(f"Meta API HTTP Error: {e.response.text}")
        return {"error": str(e), "details": e.response.text}
    except Exception as e:
        print(f"Meta API Exception: {str(e)}")
        return {"error": str(e)}
