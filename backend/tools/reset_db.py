import csv
import re
import os
import sys

sys.path.append(os.path.join(os.getcwd(), "backend", "tools"))
from env import load_local_env
load_local_env(".env")
from db_tool import supabase

def clean_phone(phone_str):
    if not phone_str: return ""
    return re.sub(r'\D', '', str(phone_str))

def parse_blocks(row):
    submitted_at = row[2]
    # Block mappings
    blocks = [row[4:18], row[18:32], row[32:46]]
    
    for b in blocks:
        if len(b) >= 11 and b[2].strip():
            decision = b[0].strip() or "Não Informado"
            service = b[1].strip() or "Não Informado"
            first_name = b[2].strip()
            last_name = b[3].strip() if len(b) > 3 else ""
            name = f"{first_name} {last_name}".strip()
            country = b[9].strip() if len(b) > 9 else "Não Informado"
            phone = clean_phone(b[10].strip() if len(b) > 10 else "")
            gc = b[13].strip() if len(b) > 13 else "Não Informado"
            
            if submitted_at:
                try: 
                    submitted_at = submitted_at.replace(" ", "T") + "Z"
                except: pass
            else:
                submitted_at = "2024-01-01T00:00:00Z"
                
            return phone, decision, service, country, gc, submitted_at, name
            
    return None, None, None, None, None, None, None

def main():
    print("Fetching all ids to delete...")
    all_ids = []
    start = 0
    limit = 1000
    while True:
        res = supabase.table("leads").select("id").range(start, start + limit - 1).execute()
        if not res.data: break
        for x in res.data:
            all_ids.append(x["id"])
        if len(res.data) < limit: break
        start += limit
        
    print(f"Total old records to delete: {len(all_ids)}")
    for i in range(0, len(all_ids), 100):
        chunk = all_ids[i:i+100]
        try:
            supabase.table("leads").delete().in_("id", chunk).execute()
        except Exception as e:
            print(f"Error delete: {e}")
            
    print("Reading CSV...")
    filepath = "lista-consolidacao.csv"
    workspace_id = "9c4e23cf-26e3-4632-addb-f28325aedac3"
    leads_to_insert = []
    
    with open(filepath, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        
        for row in reader:
            if not row or not any(row): continue
            phone, decision, service, country, gc, submitted_at, name = parse_blocks(row)
            if phone and name:
                
                # Check duplicate
                if any(x["phone"] == phone for x in leads_to_insert):
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
                            "status": "completed",
                            "assigned_to": "ai",
                            "completed_at": submitted_at
                        }
                    ],
                    "decisao": decision,
                    "culto": service,
                    "pais": country,
                    "gc_status": gc,
                    "created_at": submitted_at
                }
                leads_to_insert.append(lead_data)

    print(f"Found {len(leads_to_insert)} unique robust leads. Inserting...")
    
    for i in range(0, len(leads_to_insert), 500):
        chunk = leads_to_insert[i:i+500]
        supabase.table("leads").insert(chunk).execute()

    print("DONE DB WIPE & IMPORT!")

if __name__ == '__main__':
    main()
