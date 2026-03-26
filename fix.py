import csv
import json
import urllib.request
import urllib.error
import datetime

SUPABASE_URL = 'https://uyseheucqikgcorrygzc.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI'

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def clean_phone(p):
    return ''.join(filter(str.isdigit, str(p))) if p else ''

def fetch_all_leads():
    all_leads = []
    limit = 1000
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/leads?select=*&limit={limit}&offset={offset}"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode('utf-8'))
                if not data:
                    break
                all_leads.extend(data)
                offset += limit
        except Exception as e:
            print("Error fetching:", e)
            break
    return all_leads

def update_lead(lead_id, payload):
    url = f"{SUPABASE_URL}/rest/v1/leads?id=eq.{lead_id}"
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='PATCH')
    try:
        with urllib.request.urlopen(req) as response:
            pass
    except Exception as e:
        print(f"Error updating {lead_id}:", e)

def main():
    dateMap = {}
    emailMap = {}
    print("Loading CSV...")
    try:
        with open('lista-visitantes.csv', 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                p = clean_phone(row.get('Telefone | Phone Number', ''))
                e = str(row.get('E-mail', '')).lower().strip()
                date_str = row.get('Submitted at')
                
                if p and date_str:
                    dateMap[p] = date_str
                if e and date_str:
                    emailMap[e] = date_str
    except Exception as e:
        print("CSV Error:", e)
        return

    print("Fetching leads from DB...")
    leads = fetch_all_leads()
    print(f"Loaded {len(leads)} leads.")

    updates_count = 0

    for lead in leads:
        updates = {}
        
        # 1. Date
        if lead.get('type') == 'visitor':
            lp = clean_phone(lead.get('phone', ''))
            le = str(lead.get('email') or '').lower().strip()
            
            target_date_str = dateMap.get(lp) or emailMap.get(le)
            if target_date_str:
                try:
                    target_dt = datetime.datetime.strptime(target_date_str, "%Y-%m-%d %H:%M:%S")
                    
                    db_dt_str = lead.get('created_at', '')
                    if db_dt_str:
                        db_dt_str = db_dt_str.replace('T', ' ')[:19]
                        db_dt = datetime.datetime.strptime(db_dt_str, "%Y-%m-%d %H:%M:%S")
                        
                        # diff > 2 hours to avoid timezone shift loops
                        if abs((db_dt - target_dt).total_seconds()) > 7200:
                            updates['created_at'] = target_dt.isoformat() + "Z"
                except Exception as e:
                    pass
        
        # 2. Pais
        old_p = lead.get('pais')
        raw_p = old_p.lower().strip() if old_p else None
        new_p = old_p
        
        if not raw_p or raw_p == 'null' or raw_p == 'não informado':
            new_p = 'Não Informado'
        elif raw_p in ['us', 'usa', 'united states', 'eua', 'estados', 'estados unidos']:
            new_p = 'US'
        elif raw_p in ['br', 'brasil', 'brazil']:
            new_p = 'BR'
        elif raw_p in ['pt', 'portugal']:
            new_p = 'PT'
        elif raw_p in ['ca', 'canada', 'canadá']:
            new_p = 'CA'
            
        if new_p != old_p:
            updates['pais'] = new_p

        # 3. Batizado
        old_b = lead.get('batizado')
        raw_b = old_b.lower().strip() if old_b else None
        new_b = old_b
        
        if not raw_b or raw_b == 'null' or old_b == 'Não Informado' or raw_b == 'não' or raw_b == 'no':
            new_b = 'Não'
        elif 'evangélico' in raw_b or 'christian' in raw_b:
            new_b = 'Sim, Evangélico'
        elif 'católico' in raw_b or 'catholic' in raw_b:
            new_b = 'Sim, Católico'
        elif 'quero me batizar' in raw_b:
            new_b = 'Quero me Batizar'

        if new_b != old_b:
            updates['batizado'] = new_b

        # 4. GC
        old_g = lead.get('gc_status')
        raw_g = old_g.lower().strip() if old_g else None
        new_g = old_g
        
        if not raw_g or raw_g == 'null' or old_g == 'Não Informado' or raw_g == 'não' or raw_g == 'no':
            new_g = 'Não'
        elif 'quero participar' in raw_g:
            new_g = 'Quero participar'
        elif 'sim' in raw_g or 'yes' in raw_g:
            new_g = 'Sim'
            
        if new_g != old_g:
            updates['gc_status'] = new_g

        if updates:
            print(f"Updating lead {lead.get('name', '')} {lead.get('id')} -> {updates}")
            update_lead(lead['id'], updates)
            updates_count += 1
            
    print(f"Done! Updated {updates_count} records.")

if __name__ == "__main__":
    main()
