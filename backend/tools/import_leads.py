import csv
import json
import re
import os
import sys

# Get Supabase client from existing tools
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)
if current_dir not in sys.path:
    sys.path.append(current_dir)

try:
    from tools.db_tool import supabase
except ImportError:
    try:
        from db_tool import supabase
    except ImportError:
        print("Erro: Não foi possível encontrar db_tool.py. Verifique se está na pasta backend/tools.")
        sys.exit(1)




def clean_phone(phone_str):
    """Keep only digits"""
    if not phone_str:
        return ""
    cleaned = re.sub(r'\D', '', str(phone_str))
    return cleaned

def parse_blocks(row):
    """
    Search across the 3 language blocks in the CSV to find the filled data.
    Block 1: Index 4-17
    Block 2: Index 18-31
    Block 3: Index 32-45
    """
    blocks = [
        row[4:18],
        row[18:32],
        row[32:46]
    ]
    
    for b in blocks:
        # First Name is index 2 in the block, Last Name is 3, Phone is 10
        if len(b) >= 11 and b[2].strip():
            first_name = b[2].strip()
            last_name = b[3].strip() if len(b) > 3 else ""
            phone = b[10].strip() if len(b) > 10 else ""
            return f"{first_name} {last_name}".strip(), phone
            
    return "", ""

def main():
    filename = "../../lista-consolidacao.csv"
    filepath = os.path.abspath(os.path.join(os.path.dirname(__file__), filename))
    
    if not os.path.exists(filepath):
        print(f"Error: File not found at {filepath}")
        return

    workspace_id = "9c4e23cf-26e3-4632-addb-f28325aedac3"
    leads_to_insert = []
    
    with open(filepath, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        
        for row in reader:
            if not row or not any(row):
                continue
                
            name, phone_raw = parse_blocks(row)
            phone = clean_phone(phone_raw)
            
            if not name or not phone:
                continue
                
            lead_data = {
                "workspace_id": workspace_id,
                "name": name,
                "phone": phone,
                "preferred_language": "pt",
                "type": "saved",
                "tasks": [
                    {
                        "task_name": "Boas Vindas",
                        "status": "completed", # Marking as completed to prevent spamming 3000 old leads
                        "assigned_to": "ai",
                        "completed_at": "2024-01-01T00:00:00Z" # Dummy past date
                    }
                ],
                "last_interaction": None,
                "llm_lock_until": None
            }
            leads_to_insert.append(lead_data)

    print(f"Found {len(leads_to_insert)} valid leads to import.")
    
    # Supabase allows inserting up to 1000 rows at a time, let's chunk in 500
    chunk_size = 500
    for i in range(0, len(leads_to_insert), chunk_size):
        chunk = leads_to_insert[i:i+chunk_size]
        print(f"Uploading chunk {i} to {i+len(chunk)}...")
        res = supabase.table("leads").insert(chunk).execute()

    print("Import successfully completed!")

if __name__ == '__main__':
    main()
