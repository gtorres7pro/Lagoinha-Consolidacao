import os
import csv
import re
from supabase import create_client, Client

URL = os.environ.get("SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_KEY", "")
if not URL or not KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be configured")
supabase: Client = create_client(URL, KEY)

CSV_PATH = "/Users/Gabriel/Documents/Antigravity/Lagoinha Consolidação/lista-visitantes.csv"

def clean_phone(phone_str: str) -> str:
    cleaned = re.sub(r'\D', '', phone_str)
    return cleaned

def import_visitors():
    print("Starting Visitors Import...")
    
    if not os.path.exists(CSV_PATH):
        print("CSV file not found:", CSV_PATH)
        return
        
    records = []
    
    with open(CSV_PATH, 'r', encoding='utf-8') as file:
        reader = csv.reader(file)
        headers = next(reader)
        # Headers: Submission ID,Respondent ID,Submitted at,Primeiro Nome,Sobrenome,Data,...Telefone,...
        
        for row in reader:
            if not row or len(row) < 18: continue
            
            created_at = row[2]
            fname = row[3].strip()
            lname = row[4].strip()
            phone = clean_phone(row[16])
            email = row[17].strip()
            country = row[15].strip()
            
            if not phone: continue
            if not fname: continue
            
            lead_data = {
                "workspace_id": "9c4e23cf-26e3-4632-addb-f28325aedac3", 
                "name": f"{fname} {lname}".strip(),
                "phone": "+"+phone if not phone.startswith('+') else phone,
                "preferred_language": "pt",
                "type": "visitor",
                "created_at": created_at,
                "pais": country,
                "tasks": [
                    {"task_name": "Welcome (IA)", "status": "pending", "assigned_to": "ai"},
                    {"task_name": "Follow-up Humano", "status": "pending", "assigned_to": "human"}
                ]
            }
            records.append(lead_data)

    print(f"Parsed {len(records)} visitors from CSV.")
    
    # Insert in chunks of 500
    chunk_size = 500
    for i in range(0, len(records), chunk_size):
        chunk = records[i:i + chunk_size]
        res = supabase.table("leads").insert(chunk).execute()
        print(f"Inserted chunk {i//chunk_size + 1}/{len(records)//chunk_size + 1} ({len(chunk)} records)")

    print("Success! Visitor import completed.")

if __name__ == "__main__":
    import_visitors()
