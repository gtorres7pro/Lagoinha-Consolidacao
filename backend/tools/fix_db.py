import csv
import json
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
    blocks = [row[4:18], row[18:32], row[32:46]]
    
    for b in blocks:
        if len(b) >= 11 and b[2].strip():
            decision = b[0].strip() or "Não Informado"
            service = b[1].strip() or "Não Informado"
            country = b[9].strip() or "Não Informado"
            phone = clean_phone(b[10].strip() if len(b) > 10 else "")
            gc = b[13].strip() if len(b) > 13 else "Não Informado"
            
            if submitted_at:
                try: 
                    submitted_at = submitted_at.replace(" ", "T") + "Z"
                except: pass
            else:
                submitted_at = "2024-01-01T00:00:00Z"
                
            return phone, decision, service, country, gc, submitted_at
            
    return None, None, None, None, None, None

def main():
    filepath = "lista-consolidacao.csv"
    with open(filepath, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        
        updates = {}
        for row in reader:
            if not row or not any(row): continue
            phone, decision, service, country, gc, submitted_at = parse_blocks(row)
            if phone:
                updates[phone] = {
                    "decisao": decision,
                    "culto": service,
                    "pais": country,
                    "gc_status": gc,
                    "created_at": submitted_at
                }

    print("Fetching leads from DB...")
    all_leads = []
    start = 0
    limit = 1000
    while True:
        res = supabase.table("leads").select("id, phone").range(start, start + limit - 1).execute()
        data = res.data
        if not data: break
        all_leads.extend(data)
        if len(data) < limit: break
        start += limit
        
    print(f"Matched {len(all_leads)} leads to update.")
    
    # 1by1 safe update
    for idx, lead in enumerate(all_leads):
        db_phone = clean_phone(lead.get('phone'))
        if db_phone in updates:
            data_up = updates[db_phone]
            try:
                supabase.table("leads").update(data_up).eq("id", lead["id"]).execute()
            except Exception as e:
                pass
            
            if idx % 100 == 0:
                print(f"Updated {idx}/{len(all_leads)}...")
            
    print("Done!")

if __name__ == '__main__':
    main()
