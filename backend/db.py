"""MongoDB connection singleton.

Loaded once at import time. `db` è l'istanza AsyncIOMotorDatabase usata da tutti
i router e servizi. `client` è esposto per la shutdown hook.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
