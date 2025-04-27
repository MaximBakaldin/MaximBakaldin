# src.optimize_data_types
import pandas as pd
from tabulate import tabulate

def optimize_data_type(dfs: dict, dtype_rules: dict = None, verbose: bool = False) -> dict:
    """
    Оптимизирует типы данных во всех DataFrame с учетом явных правил и формирует отчет.

    Параметры:
    - dfs: словарь DataFrame'ов.
    - dtype_rules: словарь с шаблонами колонок и целевыми типами. Пример: {'_id': 'str', '_city': 'category'}
    - verbose: выводить ли детальную информацию о преобразованиях.

    Возвращает:
    - Кортеж из:
        - Словарь с оптимизированными DataFrame.
        - Словарь с подробными отчетами.
    """
    
    # Если dtype_rules не задан, создаём пустой словарь
    dtype_rules = dtype_rules or {}
    reports = {}
    total_memory_saved = 0

    for df_name, df in dfs.items():
        original_memory = df.memory_usage(deep=True).sum()
        optimized_df = df.copy()
        type_changes = []

        for col in optimized_df.columns:
            col_data = optimized_df[col]
            original_type = col_data.dtype

            # Применяем модуль для преобразования временных меток
            rule_applied = False
            for pattern, target_dtype in dtype_rules.items():
                if pattern in col:
                    try:
                        if target_dtype == 'datetime':
                            optimized_df[col] = pd.to_datetime(col_data, errors='coerce')
                        else:
                            optimized_df[col] = col_data.astype(target_dtype)
                        log_change(col, original_type, optimized_df[col].dtype, type_changes, verbose)
                        rule_applied = True
                    except Exception as e:
                        if verbose:
                            print(f"❌ Ошибка преобразования {col} в {target_dtype}: {e}")
                    break  # Только первое совпадение

            if rule_applied:
                continue  # Пропускаем автообработку

            # Автоматическое преобразование
            if 'date' in col.lower() or 'time' in col.lower() or 'timestamp' in col.lower():
                optimized_df[col] = pd.to_datetime(col_data, errors='coerce')
                log_change(col, original_type, optimized_df[col].dtype, type_changes, verbose)
            elif pd.api.types.is_numeric_dtype(col_data):
                optimized_df[col] = optimize_numeric_type(col_data)
                log_change(col, original_type, optimized_df[col].dtype, type_changes, verbose)
            elif pd.api.types.is_object_dtype(col_data):
                optimized_df[col] = optimize_categorical_type(col_data)
                log_change(col, original_type, optimized_df[col].dtype, type_changes, verbose)

        # --- Отчёт по датафрейму ---
        new_memory = optimized_df.memory_usage(deep=True).sum()
        memory_diff = original_memory - new_memory
        total_memory_saved += memory_diff
        
        # Формирование отчета
        reports[df_name] = {
            'dataframe': optimized_df,
            'report': {
                'original_memory': original_memory,
                'optimized_memory': new_memory,
                'memory_saved': memory_diff,
                'type_changes': type_changes,
                'columns': len(optimized_df.columns),
                'rows': len(optimized_df)
            }
        }
        # Вывод отчета
        print_report(df_name, reports[df_name]['report'])

    # Итоговый отчет по экономии памяти
    total_original_memory = sum([df.memory_usage(deep=True).sum() for df in dfs.values()])
    print(f"\n🏁 Итоговая экономия памяти по всем датафреймам: {total_memory_saved / 1024**2:.2f} MB "
          f"({(total_memory_saved / total_original_memory) * 100:.1f}%)")

    return {k: v['dataframe'] for k, v in reports.items()}, reports


def log_change(col: str, old_type, new_type, changes: list, verbose: bool):
    """Логирует изменения типов данных."""
    if old_type != new_type:
        changes.append({
            'column': col,
            'old_type': str(old_type),
            'new_type': str(new_type)
        })


def optimize_numeric_type(col_data: pd.Series) -> pd.Series:
    """Оптимизирует числовые типы данных."""
    # Если бинарные (0 или 1)
    if col_data.dropna().isin([0, 1]).all():
        return col_data.astype('boolean')
    
    # Если все значения целые (включая float, но без дробей)
    is_all_integer = (
        pd.api.types.is_integer_dtype(col_data) or
        (pd.api.types.is_float_dtype(col_data) and
         (col_data.dropna() % 1 == 0).all())
    )

    return pd.to_numeric(
        col_data,
        downcast='integer' if is_all_integer else 'float'
    )



def optimize_categorical_type(col_data: pd.Series) -> pd.Series:
    """Оптимизирует категориальные данные."""
    nunique = col_data.nunique()
    if 1 < nunique < len(col_data) // 2:
        return col_data.astype('category')
    return col_data


def print_report(df_name: str, report: dict):
    """Форматирует и выводит отчет с использованием tabulate."""
    print(f"\n📊 Отчет оптимизации для: {df_name}")
    
    # Таблица изменений типов
    if report['type_changes']:
        print("\n🔀 Изменения типов данных:")
        print(tabulate(
            report['type_changes'],
            headers={'column': 'Признак', 'old_type': 'Исходный тип', 'new_type': 'Новый тип'},
            tablefmt='Pretty_Table',
            stralign='left'
        ))
    else:
        print("\nℹ️ Изменений типов данных не обнаружено")
    
    # Статистика памяти
    mem_table = [
        ["Исходный размер", f"{report['original_memory'] / 1024**2:.2f} MB"],
        ["Оптимизированный размер", f"{report['optimized_memory'] / 1024**2:.2f} MB"],
        ["Экономия памяти", f"{report['memory_saved'] / 1024**2:.2f} MB" 
        f"({report['memory_saved'] /report['original_memory']:.1%})"]
    ]
    print("\n💾 Статистика использования памяти:")
    print(tabulate(mem_table, tablefmt='Pretty_Table'))
    
    # Общая статистика
 #   print(f"\n📈 Общая статистика: ")
 #   print(f"• Колонок: {report['columns']}")
 #   print(f"• Строк: {report['rows']}")
 #   print(f"• Оптимизировано колонок: {len(report['type_changes'])}")
    print("=" * 125)
