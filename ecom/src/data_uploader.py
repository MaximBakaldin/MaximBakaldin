#src.data_uploader.py

import pandas as pd
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from tqdm import tqdm
import time
from typing import Dict, List

from src.db_utils import get_engine  # Предполагается, что этот модуль уже настроен

# Инициализация подключения к БД
engine = get_engine()

def table_has_data(table_name: str, engine) -> bool:
    """Проверяет, содержит ли таблица данные"""
    query = f"SELECT COUNT(*) FROM {table_name}"
    try:
        with engine.connect() as conn:
            result = conn.execute(text(query))
            return result.scalar() > 0
    except ProgrammingError:
        return False

def upload_data_to_db(df_dict: Dict[str, pd.DataFrame], engine) -> None:
    """
    Загружает данные в БД с прогресс-баром и обработкой ошибок
    
    Args:
        df_dict: Словарь {название_таблицы: DataFrame}
        engine: SQLAlchemy engine
    """
    for table_name, df in df_dict.items():
        if table_has_data(table_name, engine):
            print(f"⚠️ Пропускаем {table_name} — таблица уже содержит данные")
            continue

        print(f"⬆️ Загружаем: {table_name}")
        try:
            # Разбиваем на чанки для прогресс-бара
            total_chunks = len(df) // 1000 + 1
            
            with tqdm(total=total_chunks, desc=f"Загрузка {table_name}") as pbar:
                for chunk_start in range(0, len(df), 1000):
                    chunk = df.iloc[chunk_start:chunk_start + 1000]
                    chunk.to_sql(
                        table_name,
                        con=engine,
                        if_exists='append',
                        index=False,
                        chunksize=1000,
                        method='multi'
                    )
                    pbar.update(1)
            
            print(f"✅ Успешно загружено: {table_name}")
            
        except Exception as e:
            print(f"❌ Ошибка загрузки {table_name}: {e}")
            print("⏳ Повторная попытка через 10 секунд...")
            time.sleep(10)
            
            try:
                with tqdm(total=total_chunks, desc=f"Повторная загрузка {table_name}") as pbar:
                    for chunk_start in range(0, len(df), 1000):
                        chunk = df.iloc[chunk_start:chunk_start + 1000]
                        chunk.to_sql(
                            table_name,
                            con=engine,
                            if_exists='append',
                            index=False,
                            chunksize=1000,
                            method='multi'
                        )
                        pbar.update(1)
                print(f"✅ Успешно загружено при повторной попытке: {table_name}")
            except Exception as e:
                print(f"🚫 Ошибка при повторной загрузке {table_name}: {e}")

def run_pipeline(df_dict: Dict[str, pd.DataFrame], engine) -> None:
    """Основной пайплайн загрузки данных"""
    print("📌 Начало загрузки данных...")
    upload_data_to_db(df_dict, engine)
    print("🏁 Загрузка завершена.")

if __name__ == "__main__":
    # Пример использования
    from sqlalchemy import create_engine
    
    # Тестовые данные (замените на свои)
    test_data = {
        "test_table": pd.DataFrame({
            "id": [1, 2, 3],
            "name": ["Алексей", "Мария", "Иван"]
        })
    }
    
    # Инициализация подключения
    engine = create_engine("postgresql://user:password@localhost/dbname")
    
    # Запуск пайплайна
    run_pipeline(test_data, engine)