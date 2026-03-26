import csv
import json
import urllib.request
import urllib.error

def clean_phone(p):
    return ''.join(filter(str.isdigit, str(p))) if p else ''

def main():
    records = []
    try:
        with open('lista-visitantes.csv', 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                p = clean_phone(row.get('Telefone | Phone Number', ''))
                e = str(row.get('E-mail', '')).lower().strip()
                date_str = row.get('Submitted at')
                if (p or e) and date_str:
                    records.append({
                        "phone": p,
                        "email": e,
                        "date": date_str
                    })
    except Exception as e:
        print("CSV Error:", e)
        return

    print(f"Loaded {len(records)} records from CSV.")
    
    url = "https://uyseheucqikgcorrygzc.supabase.co/functions/v1/fix-data"
    payload = json.dumps({"records": records}).encode('utf-8')
    headers = {
        'Content-Type': 'application/json'
    }
    
    print("Calling Edge Function... this might take 10 seconds as it iterates the DB.")
    req = urllib.request.Request(url, data=payload, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            print("Response:", res_body)
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.read().decode('utf-8'))
    except Exception as e:
        print("Error calling function:", e)

if __name__ == "__main__":
    main()
