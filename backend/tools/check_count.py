import sys, os
from dotenv import load_dotenv
sys.path.append(os.path.join(os.getcwd(), "backend", "tools"))
load_dotenv(".env")
from db_tool import supabase
res = supabase.table("leads").select("*", count="exact").limit(1).execute()
print(f"Total rows: {res.count}")
