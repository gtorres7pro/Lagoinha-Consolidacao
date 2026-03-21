import os
import google.generativeai as genai
from dotenv import load_dotenv
from tools.db_tool import supabase, get_workspace_config

load_dotenv()

# Initialize Gemini Client
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
genai.configure(api_key=GEMINI_KEY)

# gemini-2.5-flash: confirmed working with billing enabled
model = genai.GenerativeModel('gemini-2.5-flash')

def generate_response(lead_id: str, lead_name: str, workspace_id: str, incoming_message: str):
    """
    Generates a contextual WhatsApp response using the specific church's Knowledge Base.
    """
    
    # 1. Fetch Church data - null-safe with defaults
    church_config = get_workspace_config(workspace_id) or {}
    church_name = church_config.get("name", "Lagoinha Orlando")
    kb = church_config.get("knowledge_base", {}) or {}
    
    # 2. Extract Knowledge Base fields (saved via "Salvar Instruções" button)
    ju_prompt_override = kb.get("ju_prompt", "")
    address_info      = kb.get("address", "Lagoinha Orlando Church, 2040 Americana Blvd, Orlando FL 32809")
    batismo_info      = kb.get("batismo", "Próximo Batismo nas Águas: Dia 18 de Abril de 2026.")
    cafe_info         = kb.get("cafe_novos_membros", "Próximo Café de Novos Membros: Dia 25 de Abril.")
    eventos_info      = kb.get("eventos", "- Conferência de Homens e Mulheres: 10 a 12 de Maio de 2026.")
    
    # 3. Fetch recent conversation history for context (last 6 messages)
    history_text = ""
    try:
        history_res = supabase.table("messages")\
            .select("direction, content")\
            .eq("lead_id", lead_id)\
            .order("created_at", desc=True)\
            .limit(6)\
            .execute()
        if history_res.data:
            msgs = list(reversed(history_res.data))
            history_text = "\n".join([
                f"{'Ju' if m['direction'] == 'outbound' else lead_name}: {m['content']}"
                for m in msgs
            ])
    except Exception:
        pass

    # 4. Construct System Prompt - use custom persona if saved, else default
    if ju_prompt_override:
        system_prompt = f"""
{ju_prompt_override}

INFORMAÇÕES DA IGREJA PARA REFERÊNCIA:
- Nome da Igreja: {church_name}
- Endereço e Horários: {address_info}
- Próximo Batismo: {batismo_info}
- Café de Novos Membros: {cafe_info}
- Eventos em Destaque: {eventos_info}

CONVERSA ATÉ AGORA:
{history_text if history_text else "(Primeira mensagem)"}
"""
    else:
        system_prompt = f"""
Você é a Ju, uma pessoa cristã, acolhedora e espiritualmente fundamentada, representando a {church_name}. 
Você se comunica como uma pessoa real — calorosa, brevemente. NUNCA diga que é uma IA.

INFORMAÇÕES DA IGREJA:
- Endereço: {address_info}
- Próximo Batismo: {batismo_info}
- Café de Novos Membros: {cafe_info}
- Eventos: {eventos_info}

REGRAS:
1. Respostas curtas como mensagem de WhatsApp. Máximo 2 parágrafos.
2. Seja empática. Direcione para a vida da igreja e grupos de crescimento (GCs).
3. Se sobre batismo, compartilhe a data e incentive a inscrição.
4. Use '||' para separar mensagens distintas quando necessário.
5. Não use ** ou markdown.

HISTÓRICO DA CONVERSA:
{history_text if history_text else "(Primeira mensagem)"}
"""
    
    # 5. Generate AI Response
    try:
        response = model.generate_content(
            f"{system_prompt}\n\n{lead_name} disse: {incoming_message}"
        )
        return response.text
    except Exception as e:
        print(f"❌ Gemini Generation Failed: {str(e)}")
        return "Desculpe, estou em manutenção no momento! Um líder humano falará com você em breve. 🙏"
