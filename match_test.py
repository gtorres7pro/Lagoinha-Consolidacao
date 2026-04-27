import os
import csv
import glob
import unicodedata

def normalize(name):
    # Remove accents and lowercase
    n = ''.join(c for c in unicodedata.normalize('NFD', name) if unicodedata.category(c) != 'Mn')
    # Remove special chars and extra spaces
    n = n.lower().replace('-', ' ').strip()
    return ' '.join(n.split())

def extract_pdf_names(folder):
    pdfs = glob.glob(os.path.join(folder, "*.pdf"))
    names = set()
    for p in pdfs:
        base = os.path.basename(p)
        # e.g. "Abner-Bassani-2026.pdf", "Camila-Rodrigues-2026-2.pdf"
        base = base.replace('.pdf', '')
        # Remove trailing year and numbers
        parts = base.split('-')
        filtered = [x for x in parts if not x.isdigit()]
        name = ' '.join(filtered)
        names.add(normalize(name))
    return names

def check_matches(folder, csv_file):
    pdf_names = extract_pdf_names(folder)
    print(f"--- {folder} ---")
    print(f"PDF count: {len(pdf_names)}")
    
    csv_names = set()
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            n = row.get('Member', '').strip()
            if not n: n = row.get('Profile', '').strip()
            csv_names.add(normalize(n))
            
    matches = 0
    unmatched = []
    for p in pdf_names:
        # Check direct or partial match
        found = False
        for c in csv_names:
            if p in c or c in p:
                found = True
                break
        if found:
            matches += 1
        else:
            unmatched.append(p)
            
    print(f"Matched: {matches}")
    if unmatched:
        print("Unmatched:")
        for u in unmatched:
            print("  - " + u)

check_matches('./import/CRIE HOMENS', './import/CRIE HOMENS/1- FULL PAYMENTS REPORTS .csv')
check_matches('./import/CRIE MULHERES', './import/CRIE MULHERES/1- RELATORIO PAGAMENTOS CRIE MULHERES.csv')
