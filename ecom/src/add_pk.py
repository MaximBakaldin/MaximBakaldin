# src.add_pk.py

from sqlalchemy import text, inspect
from sqlalchemy.engine import Engine
from typing import Dict, List


def add_constraints_from_dicts(engine: Engine, pk_dict: Dict[str, List[str]], 
                             fk_dict: Dict[str, Dict[str, str]]) -> None:
    """Добавляет первичные и внешние ключи в таблицы базы данных на основе словарей.
    
    Args:
        engine: SQLAlchemy engine для подключения к БД
        pk_dict: Словарь первичных ключей в формате {table_name: [column_names]}
        fk_dict: Словарь внешних ключей в формате {table_name: {column: "ref_table(ref_column)"}}
        
    Example:
        >>> pk_dict = {
        ...     "orders": ["order_id"],
        ...     "customers": ["customer_id"]
        ... }
        >>> fk_dict = {
        ...     "orders": {
        ...         "customer_id": "customers(customer_id)"
        ...     }
        ... }
        >>> add_constraints_from_dicts(engine, pk_dict, fk_dict)
    """
    inspector = inspect(engine)

    with engine.begin() as conn:
        # Добавление первичных ключей
        for table, pk_columns in pk_dict.items():
            existing_pk = inspector.get_pk_constraint(table)["constrained_columns"]
            if set(existing_pk) == set(pk_columns):
                print(f"🔁 PK уже задан для {table}, пропускаем")
                continue

            pk_cols = ", ".join(pk_columns)
            sql = f'ALTER TABLE "{table}" ADD PRIMARY KEY ({pk_cols})'
            try:
                conn.execute(text(sql))
                print(f"✅ Добавлен PRIMARY KEY для {table}({pk_cols})")
            except Exception as e:
                print(f"❌ [Ошибка PK] {table}: {e}")

        # Добавление внешних ключей
        for table, columns in fk_dict.items():
            existing_fks = inspector.get_foreign_keys(table)
            existing_pairs = {
                (fk['constrained_columns'][0], fk['referred_table'], fk['referred_columns'][0])
                for fk in existing_fks
            }

            for col, ref in columns.items():
                ref_table, ref_column = ref.replace(")", "").split("(")
                constraint_name = f"fk_{table}_{col}"

                if (col, ref_table, ref_column) in existing_pairs:
                    print(f"🔁 FK уже существует: {table}.{col} → {ref_table}.{ref_column}")
                    continue

                sql = f'''
                    ALTER TABLE "{table}"
                    ADD CONSTRAINT {constraint_name}
                    FOREIGN KEY ({col})
                    REFERENCES "{ref_table}"({ref_column})
                '''
                try:
                    conn.execute(text(sql))
                    print(f"✅ Добавлен FK: {table}({col}) → {ref_table}({ref_column})")
                except Exception as e:
                    print(f"❌ [Ошибка FK] {table}.{col} → {ref_table}.{ref_column}: {e}")


if __name__ == "__main__":
    from sqlalchemy import create_engine
    
    # Словарь primary keys
    pk_dict = {
        "order_items": ["order_id", "order_item_id"],
        "orders": ["order_id"],
        "customers": ["customer_id"],
        "products": ["product_id"],
        "sellers": ["seller_id"],
        "closed_deals": ["mql_id"]
    }

    # Словарь foreign keys
    fk_dict = {
        "order_items": {
            "order_id": "orders(order_id)",
            "seller_id": "sellers(seller_id)"
        },
        "orders": {
            "customer_id": "customers(customer_id)"
        },
        "order_reviews": {
            "order_id": "orders(order_id)"
        },
        "order_payments": {
            "order_id": "orders(order_id)"
        }
    }
    
    # Вызов основной функции
    add_constraints_from_dicts(engine, pk_dict, fk_dict)