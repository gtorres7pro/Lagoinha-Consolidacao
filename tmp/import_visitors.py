import csv
import json
import requests
import re

URL = 'https://uyseheucqikgcorrygzc.supabase.co/rest/v1/leads'
HEADERS = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def clean_phone(p):
    if not p: return ''
    return re.sub(r'\D', '', str(p))

def process():
    print("Deleting existing visitors...")
    requests.delete(URL + "?type=eq.visitor", headers=HEADERS)
    
    inserted = 0
    with open('/Users/Gabriel/Documents/Antigravity/Lagoinha Consolidação/lista-visitantes.csv', 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            phone_raw = row.get('Telefone | Phone Number', '')
            phone = clean_phone(phone_raw)
            if not phone: continue
            
            if len(phone) > 10 and not phone.startswith('+'):
                phone_db = '+' + phone
            else:
                phone_db = phone

            fname = row.get('Primeiro Nome | First Name', '').strip()
            lname = row.get('Sobrenome | Last Name', '').strip()
            name = f"{fname} {lname}".strip()
            
            idade_str = row.get('Idade | Age', '').strip()
            idade = re.sub(r'\D', '', idade_str) if idade_str else "Não Informado"
                
            s_raw = row.get('Sexo | Gender', '').strip()
            if 'Male' in s_raw or 'Masculino' in s_raw: sexo = "M"
            elif 'Female' in s_raw or 'Feminino' in s_raw: sexo = "F"
            else: sexo = "Não Informado"
            
            civil_raw = row.get('Estado Civil | Marital Status', '').strip()
            estado_civil = civil_raw.split(" | ")[0] if civil_raw else "Não Informado"
                
            pais_1 = row.get('País | Country', '').strip()
            if not pais_1:
                # the CSV might have multiple duplicate column headers for "País | Country"
                pass 
            pais = pais_1.title() if pais_1 else "Não Informado"
            
            email = row.get('E-mail', '').strip()
            
            bat_raw = row.get('Você é Batizado? | Are you Baptized?', '').strip()
            if bat_raw:
                batizado = bat_raw.split(" | ")[0]
            else: 
                batizado = "Não Informado"
                if row.get('Você é Batizado? | Are you Baptized? (Católico | Catholic)') == 'TRUE': batizado = "Católico"
                elif row.get('Você é Batizado? | Are you Baptized? (Evangélico | Christian)') == 'TRUE': batizado = "Evangélico"
                elif row.get('Você é Batizado? | Are you Baptized? (Quero me Batizar | I want to Baptize)') == 'TRUE': batizado = "Quero me Batizar"
                elif row.get('Você é Batizado? | Are you Baptized? (Não | No)') == 'TRUE': batizado = "Não"
                
            g_raw = row.get('Você participa de um GC? | Are you part of a GC (Small Group)?', '').strip()
            if g_raw:
                gc = g_raw.split(" | ")[0]
            else:
                gc = "Não Informado"
                if row.get('Você participa de um GC? | Are you part of a GC (Small Group)? (Sim | Yes)') == 'TRUE': gc = "Sim"
                elif row.get('Você participa de um GC? | Are you part of a GC (Small Group)? (Quero participar | I want to be part)') == 'TRUE': gc = "Quero participar"
                elif row.get('Você participa de um GC? | Are you part of a GC (Small Group)? (Não | No)') == 'TRUE': gc = "Não"
                
            lead_data = {
                "workspace_id": "9c4e23cf-26e3-4632-addb-f28325aedac3",
                "name": name,
                "phone": phone_db,
                "email": email,
                "pais": pais,
                "idade": idade,
                "estado_civil": estado_civil,
                "sexo": sexo,
                "batizado": batizado,
                "gc_status": gc,
                "type": "visitor",
                "tasks": [{"task_name": "Welcome Message Required", "status": "pending", "assigned_to": "ai"}],
                "preferred_language": "pt"
            }
            
            insert_resp = requests.post(URL, json=lead_data, headers=HEADERS)
            if insert_resp.status_code in (201, 200, 204):
                inserted += 1
            else:
                print("Failed to insert:", lead_data["name"], insert_resp.text)
                    
    print(f"Done! Inserted {inserted} new visitors.")
    
if __name__ == "__main__":
    process()
