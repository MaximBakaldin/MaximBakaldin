#src.chains_validation.py
"""
Модуль для валидации целостности внешних ключей между таблицами данных.
Возвращает:
1. Словарь с результатами проверки
2. Словарь валидных внешних ключей (в том же формате как fk_dict)
"""

import pandas as pd
from typing import Dict, Tuple, Optional, List

def validate_foreign_keys(
    df_dict: Dict[str, pd.DataFrame],
    fk_dict: Dict[str, Dict[str, str]],
    verbose: bool = True
) -> Tuple[Dict[str, Tuple[Optional[int], Optional[float], str]], 
           Dict[str, Dict[str, str]]]:
    """
    Проверяет логическую целостность внешних ключей между таблицами.
    
    Args:
        df_dict: Словарь с таблицами {table_name: DataFrame}
        fk_dict: Словарь внешних ключей {table_name: {column: "ref_table(ref_column)"}}
        verbose: Если True, выводит подробный отчёт
        
    Returns:
        Кортеж из двух словарей:
        1. Результаты проверки:
            {
                "table.fk_col → ref_table.ref_col": (num_errors, error_percent, source_table),
                ...
            }
        2. Валидные внешние ключи (в том же формате как fk_dict):
            {
                "table": {"column": "ref_table(ref_column)"},
                ...
            }
    """
    results = {}
    valid_fk_dict = {}

    for table, relations in fk_dict.items():
        # Инициализируем словарь для валидных связей таблицы
        valid_relations = {}
        
        # Проверяем наличие исходной таблицы
        if table not in df_dict:
            if verbose:
                print(f"⚠️ Таблица '{table}' не найдена в данных, пропускаем")
            continue

        df = df_dict[table]

        for fk_col, ref in relations.items():
            # Парсим ссылку на таблицу и колонку
            try:
                ref_table, ref_col = ref.replace(")", "").split("(")
            except ValueError:
                results[f"{table}.{fk_col}"] = (None, None, "⚠️ Некорректный формат ссылки")
                continue

            # Формируем ключ для результата
            relation_key = f"{table}.{fk_col} → {ref_table}.{ref_col}"

            # Проверяем наличие референсной таблицы
            if ref_table not in df_dict:
                results[relation_key] = (None, None, "⚠️ Референсная таблица не найдена")
                continue

            ref_df = df_dict[ref_table]

            # Проверяем наличие колонок в таблицах
            if fk_col not in df.columns:
                results[relation_key] = (None, None, f"⚠️ Колонка '{fk_col}' не найдена в таблице '{table}'")
                continue

            if ref_col not in ref_df.columns:
                results[relation_key] = (None, None, f"⚠️ Колонка '{ref_col}' не найдена в таблице '{ref_table}'")
                continue

            # Проверяем целостность данных
            missing_mask = ~df[fk_col].isin(ref_df[ref_col])
            num_missing = missing_mask.sum()
            pct_missing = round(100 * num_missing / len(df), 2) if len(df) > 0 else 0

            results[relation_key] = (num_missing, pct_missing, table)
            
            # Если связь валидна, добавляем в словарь
            if num_missing == 0:
                valid_relations[fk_col] = f"{ref_table}({ref_col})"

        # Добавляем в общий словарь, если есть валидные связи
        if valid_relations:
            valid_fk_dict[table] = valid_relations

    if verbose:
        _print_validation_results(results, valid_fk_dict)

    return results, valid_fk_dict


def _print_validation_results(
    results: Dict[str, Tuple[Optional[int], Optional[float], str]],
    valid_fk_dict: Dict[str, Dict[str, str]]
) -> None:
    """Выводит результаты валидации в удобочитаемом формате."""
    print("\nВалидация внешних ключей между таблицами:")
    print("=" * 60)
    
    # Выводим проблемы
    print("\nПроблемные связи:")
    for rel, (num_missing, pct_missing, source_table) in results.items():
        if num_missing is None:
            print(f"⚠️ {rel}: {pct_missing}")  # pct_missing содержит сообщение об ошибке
        elif num_missing > 0:
            print(f"❌ {rel}")
            print(f"   Некорректных записей: {num_missing} ({pct_missing}%)")
    
    # Выводим валидные связи
    print("\nВалидные внешние ключи:")
    for table, relations in valid_fk_dict.items():
        print(f"✅ {table}:")
        for fk_col, ref in relations.items():
            print(f"   - {fk_col}: {ref}")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    # Пример использования
    import pandas as pd
    
    # Тестовые данные
    customers = pd.DataFrame({
        "customer_id": [1, 2, 3],
        "name": ["Alice", "Bob", "Charlie"]
    })
    
    sellers = pd.DataFrame({
        "seller_id": [101, 102],
        "name": ["Seller X", "Seller Y"]
    })
    
    orders = pd.DataFrame({
        "order_id": [1001, 1002, 1003],
        "customer_id": [1, 2, 3],  # Все ID валидны
        "status": ["new", "processed", "completed"]
    })
    
    order_items = pd.DataFrame({
        "order_id": [1001, 1002, 1003, 1004],  # Ошибка: 1004 нет в orders
        "seller_id": [101, 102, 101, 103],      # Ошибка: 103 нет в sellers
        "product_id": [1, 2, 3, 4],
        "price": [10.5, 22.3, 15.0, 18.7]
    })
    
    df_dict = {
        "customers": customers,
        "sellers": sellers,
        "orders": orders,
        "order_items": order_items
    }
    
    fk_dict = {
        "order_items": {
            "order_id": "orders(order_id)",
            "seller_id": "sellers(seller_id)"
        },
        "orders": {
            "customer_id": "customers(customer_id)"
        }
    }
    
    print("Запуск тестовой проверки целостности данных...")
    results, valid_fk_dict = validate_foreign_keys(df_dict, fk_dict)
    
    # Пример использования результатов
    print("\nВалидные внешние ключи для дальнейшего использования:")
    print(valid_fk_dict)