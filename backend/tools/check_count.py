import sys, os
sys.path.append(os.path.join(os.getcwd(), "backend", "tools"))
from env import load_local_env
load_local_env(".env")
from db_tool import supabase
res = supabase.table("leads").select("*", count="exact").limit(1).execute()
print(f"Total rows: {res.count}")
