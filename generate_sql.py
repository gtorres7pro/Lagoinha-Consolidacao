import csv
import json
import datetime
import re

def clean_phone(p):
    return ''.join(filter(str.isdigit, str(p))) if p else ''

def main():
    sql = []
    
    # Static Data Formatting
    sql.append("UPDATE leads SET pais = 'US' WHERE LOWER(pais) IN ('us', 'usa', 'united states', 'eua', 'estados', 'estados unidos');")
    sql.append("UPDATE leads SET pais = 'BR' WHERE LOWER(pais) IN ('br', 'brasil', 'brazil');")
    sql.append("UPDATE leads SET pais = 'PT' WHERE LOWER(pais) IN ('pt', 'portugal');")
    sql.append("UPDATE leads SET pais = 'CA' WHERE LOWER(pais) IN ('ca', 'canada', 'canatá', 'canadá');")
    sql.append("UPDATE leads SET pais = 'Não Informado' WHERE pais IS NULL OR LOWER(pais) IN ('null', 'não informado', '');")

    sql.append("UPDATE leads SET batizado = 'Não' WHERE batizado IS NULL OR LOWER(batizado) IN ('null', 'não informado', 'não', 'no', '');")
    sql.append("UPDATE leads SET batizado = 'Sim, Evangélico' WHERE batizado ILIKE '%evangélico%' OR batizado ILIKE '%christian%';")
    sql.append("UPDATE leads SET batizado = 'Sim, Católico' WHERE batizado ILIKE '%católico%' OR batizado ILIKE '%catholic%';")
    sql.append("UPDATE leads SET batizado = 'Quero me Batizar' WHERE batizado ILIKE '%quero me batizar%';")

    sql.append("UPDATE leads SET gc_status = 'Não' WHERE gc_status IS NULL OR LOWER(gc_status) IN ('null', 'não informado', 'não', 'no', '');")
    sql.append("UPDATE leads SET gc_status = 'Quero participar' WHERE gc_status ILIKE '%quero participar%';")
    sql.append("UPDATE leads SET gc_status = 'Sim' WHERE gc_status ILIKE '%sim%' OR gc_status ILIKE '%yes%';")
    
    sql.append("UPDATE leads SET type = 'visitor' WHERE type IS NULL;")
    
    try:
        with open('lista-visitantes.csv', 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                p = clean_phone(row.get('Telefone | Phone Number', ''))
                e = str(row.get('E-mail', '')).lower().strip().replace("'", "''")
                date_str = row.get('Submitted at')
                
                if date_str:
                    target_dt = datetime.datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
                    iso_str = target_dt.isoformat()
                    
                    if p:
                        sql.append(f"UPDATE leads SET created_at = '{iso_str}' WHERE phone LIKE '%{p}' AND type = 'visitor';")
                    elif e:
                        sql.append(f"UPDATE leads SET created_at = '{iso_str}' WHERE LOWER(email) = '{e}' AND type = 'visitor';")
                        
    except Exception as e:
        print("CSV Error:", e)

    with open('commands.sql', 'w', encoding='utf-8') as f:
        f.write('\n'.join(sql))
        
    print(f"Generated {len(sql)} SQL commands in commands.sql")

if __name__ == "__main__":
    main()
