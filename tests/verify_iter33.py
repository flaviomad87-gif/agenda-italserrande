import json, requests, sys
from dotenv import dotenv_values
env = dotenv_values("/app/frontend/.env")
API = env["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = json.load(open("/tmp/iter33_seed.json"))
h = {"Authorization": f"Bearer {s['token']}"}
rl = requests.get(f"{API}/rilievi-sezionali", headers=h).json()
for r in rl:
    print({k: r[k] for k in ("id", "client_id", "riferimento_cliente", "l", "motore", "fax", "tipo")})
cl = requests.get(f"{API}/clients", headers=h).json()
print("clients:", [(c["name"], c.get("pending"), c.get("updated_at")) for c in cl])
if len(sys.argv) > 1 and sys.argv[1] == "clean":
    for r in rl:
        requests.delete(f"{API}/rilievi-sezionali/{r['id']}", headers=h)
    for c in cl:
        requests.delete(f"{API}/clients/{c['id']}", headers=h)
    print("cleaned")
