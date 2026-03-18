import os
import google.generativeai as genai
from dotenv import load_dotenv
from tools.db_tool import supabase, get_workspace_config

load_dotenv()

# Initialize Gemini Client
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
genai.configure(api_key=GEMINI_KEY)

# Use the best fast model for chat
model = genai.GenerativeModel('gemini-1.5-flash')

def generate_response(lead_id: str, lead_name: str, workspace_id: str, incoming_message: str):
    """
    Generates a contextual WhatsApp response using the specific church's Knowledge Base.
    """
    
    # 1. Fetch Church Knowledge Base and Preferences 
    church_config = get_workspace_config(workspace_id)
    church_name = church_config.get("name", "our Church")
    kb = church_config.get("knowledge_base", {})
    
    # 2. Extract specific KB metrics (e.g., service times)
    events = kb.get("events", "No specific events available right now.")
    pastors = [p.get("name") for p in kb.get("pastors", [])]
    
    # 3. Fetch recent message history for context 
    # (So Gemini Remembers what it just talked about with this specific lead)
    # 📝 In production, we would query the `messages` table here and inject it into the prompt.
    
    # 4. Construct System Prompt (The AI's "Training" parameters)
    system_prompt = f"""
    You are an official digital consolidated and welcoming representative for {church_name}.
    You are currently chatting on WhatsApp with a newcomer or visitor named {lead_name}.
    
    YOUR RULES:
    1. Be incredibly warm, welcoming, and polite but NOT overly robotic. Tone: Joyful, pastoral care.
    2. Here are your Church's specific details to answer questions with:
       - Pastors: {', '.join(pastors) if pastors else 'Our Lead Pastors'}
       - Events & Cults: {events}
    3. WHATSAPP FORMATTING RULE (CRITICAL):
       If your response is longer than two sentences or introduces a new topic, you MUST insert '||' between 
       the paragraphs so our backend can split it into multiple fast WhatsApp messages. 
       Do not use bolding or markdown asterisks (**) as WhatsApp parses it differently.
    """
    
    # 5. Generate AI Response
    try:
        response = model.generate_content(
            f"{system_prompt}\n\nLEAD SUBMITTED A NEW MESSAGE:\n{incoming_message}"
        )
        return response.text
    except Exception as e:
        print(f"❌ Gemini Generation Failed: {str(e)}")
        return "Desculpe, estou em manutenção no momento! Um líder humano falará com você em breve."
