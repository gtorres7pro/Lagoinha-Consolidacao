import os
from supabase import create_client, Client
try:
    from tools.env import load_local_env
except ModuleNotFoundError:
    from env import load_local_env

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env')
load_local_env(env_path)

# --- Initialize Supabase Connection ---
url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_KEY", "")
if not url or not key:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be configured")
supabase: Client = create_client(url, key)

# --- Database Operations ---

def get_workspace_config(workspace_id: str):
    """
    Fetches the church's knowledge base and token settings 
    so the LLM knows what to say in its prompt context.
    """
    response = supabase.table("workspaces").select("*").eq("id", workspace_id).execute()
    if response.data:
        return response.data[0]
    return None

def create_lead(workspace_id: str, first_name: str, last_name: str, phone: str, 
                preferred_lang: str, lead_type: str, tasks: list = None):
    """
    Inserts a newly parsed lead from the HTML form into Supabase.
    """
    # Simple deterministic task template on creation
    default_tasks = tasks or [
        {"task_name": "Welcome Message Sent", "status": "pending", "assigned_to": "ai"}
    ]
    
    data = {
        "workspace_id": workspace_id,
        "name": f"{first_name} {last_name}",
        "phone": phone,
        "preferred_language": preferred_lang,
        "type": lead_type,
        "tasks": default_tasks
    }
    
    res = supabase.table("leads").insert(data).execute()
    return res.data[0] if res.data else None

def log_message(workspace_id: str, lead_id: str, direction: str, content: str, is_automated: bool = True):
    """
    Logs every single incoming and outgoing WhatsApp message so the Dashboard can see them.
    """
    msg_data = {
        "workspace_id": workspace_id,
        "lead_id": lead_id,
        "direction": direction,  # 'inbound' or 'outbound'
        "type": "text",          # default to text for now
        "content": content,
        "automated": is_automated
    }
    supabase.table("messages").insert(msg_data).execute()

def update_lead_ai_lock(lead_id: str, lock_until_timestamp: str):
    """
    If a human intercepts the chat, lock the AI from responding for X minutes.
    """
    supabase.table("leads").update({"llm_lock_until": lock_until_timestamp}).eq("id", lead_id).execute()
