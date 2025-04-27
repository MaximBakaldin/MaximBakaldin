# src/db_utils.py

from sqlalchemy import create_engine
from .config import DB_CONFIG
from sqlalchemy.pool import NullPool
#DATABASE_URL = f"postgresql+psycopg2://{USER}:{PASSWORD}@{HOST}:{PORT}/{DBNAME}?sslmode=require"
def get_engine():
    """Создаёт подключение к БД из конфига"""
    return create_engine(
        f"postgresql+psycopg2://{DB_CONFIG['user']}:{DB_CONFIG['password']}"
        f"@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}?sslmode=require"
    )
    