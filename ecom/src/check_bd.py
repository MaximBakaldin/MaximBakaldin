# src.check_bd.py

from sqlalchemy import text
import pandas as pd
from tabulate import tabulate


def check_table_exists(engine, table_name):
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT to_regclass('{table_name}');"))
        return result.fetchone()[0] is not None


def check_row_count(engine, table_name, expected_count):
    with engine.connect() as conn:
        db_count = conn.execute(text(f"SELECT COUNT(*) FROM {table_name};")).scalar()
        return db_count == expected_count


def check_missing_values(engine, table_name, df):
    with engine.connect() as conn:
        for col in df.columns:
            db_nulls = conn.execute(text(
                f"SELECT COUNT(*) FROM {table_name} WHERE {col} IS NULL;"
            )).scalar()
            df_nulls = df[col].isnull().sum()
            if db_nulls != df_nulls:
                return False
    return True


def run_validation(df_dict, engine):
    print("📌 Старт проверки...")
    results = []

    for table_name, df in df_dict.items():
        result = {
            "Название таблицы": table_name,
            "Наличие таблицы": "✅" if check_table_exists(engine, table_name) else "❌",
            "Совпадение строк": "✅" if check_row_count(engine, table_name, len(df)) else "❌",
            "Совпадение пропусков": "✅" if check_missing_values(engine, table_name, df) else "❌",
        }
        results.append(result)

    report = pd.DataFrame(results)
    
    issues = report[
        (report['Наличие таблицы'] != "✅") |
        (report['Совпадение строк'] != "✅") |
        (report['Совпадение пропусков'] != "✅") 
    ]
    
    if issues.empty:
        print("✅ Все проверки пройдены!")
    else:
        print("\n⚠️ Найдены проблемы:")
    
    print("\n🏁 Проверка законена.")
    print()
    return report
