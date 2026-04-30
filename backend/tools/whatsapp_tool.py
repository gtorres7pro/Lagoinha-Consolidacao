import os
import httpx
try:
    from tools.env import load_local_env
except ModuleNotFoundError:
    from env import load_local_env

load_local_env()

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
        response = httpx.post(url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        return {"status": "success", "data": response.json()}
    except httpx.HTTPStatusError as e:
        detail = e.response.text
        print(f"Meta API HTTP Error: {detail}")
        return {"error": str(e), "details": detail}
    except Exception as e:
        print(f"Meta API Exception: {str(e)}")
        return {"error": str(e)}


def send_whatsapp_template(phone_id: str, access_token: str, to: str, template_name: str, language_code: str, components: list) -> dict:
    """
    Sends an approved Meta WhatsApp template message.
    components example: [{"type":"body","parameters":[{"type":"text","text":"Gabriel"}]}]
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
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            "components": components
        }
    }

    try:
        response = httpx.post(url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        return {"status": "success", "data": response.json()}
    except httpx.HTTPStatusError as e:
        detail = e.response.text
        print(f"Meta Template API HTTP Error: {detail}")
        return {"error": str(e), "details": detail}
    except Exception as e:
        print(f"Meta Template API Exception: {str(e)}")
        return {"error": str(e)}


def list_whatsapp_templates(waba_id: str, access_token: str) -> list:
    """
    Fetches all APPROVED message templates from Meta Graph API for a given WABA.
    """
    url = f"https://graph.facebook.com/v22.0/{waba_id}/message_templates"
    params = {
        "access_token": access_token,
        "status": "APPROVED",
        "fields": "name,language,status,components,category",
        "limit": 50
    }
    try:
        response = httpx.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        return data.get("data", [])
    except Exception as e:
        print(f"Meta List Templates Error: {str(e)}")
        return []
