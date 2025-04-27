#src.data_loader.py


import os
import pandas as pd
import re


def to_snake_case(name):
    """
    Преобразует строку в стиль snake_case.

    Преобразует все пробелы и дефисы в подчеркивания, а также вставляет подчеркивания 
    между заглавными и строчными буквами.

    Args:
        name (str): Строка для преобразования.

    Returns:
        str: Преобразованная строка в snake_case.
    """
    name = re.sub(r'[\s\-]+', '_', name)
    name = re.sub(r'(?<=[a-z])(?=[A-Z])', '_', name)
    return name.lower()


def convert_dates(df):
    """
    Преобразует столбцы с датой в тип datetime.

    Определяет все столбцы, содержащие 'date' или 'datetime' в названии, и преобразует их в формат pandas datetime.

    Args:
        df (pandas.DataFrame): Датафрейм для обработки.

    Returns:
        pandas.DataFrame: Датафрейм с преобразованными столбцами.
    """
    date_cols = [col for col in df.columns if 'date' in col or 'datetime' in col]
    for col in date_cols:
        df[col] = pd.to_datetime(df[col], errors='coerce')
    return df


def load_and_inspect(folder_path='datasets', verbose=True):
    """
    Загружает CSV файлы из папки, преобразует данные и проводит предварительный анализ.

    Осуществляется:
    - Преобразование названий столбцов в snake_case.
    - Обработка столбцов с датами.
    - Удаление полных дубликатов.
    - Проверка на пропуски и их обработка.
    - Классификация признаков.
    - Поиск возможного первичного ключа.

    Args:
        folder_path (str, optional): Путь к папке с CSV файлами. По умолчанию 'datasets'.
        verbose (bool, optional): Если True, выводит дополнительную информацию о процессе. По умолчанию True.

    Returns:
        dict: Словарь с обработанными датафреймами, где ключи - имена таблиц, а значения - датафреймы.
    """
    if not os.path.exists(folder_path):
        print(f"⚠️ Указанный путь {folder_path} не существует.")
        return {}

    csv_files = [file for file in os.listdir(folder_path) if file.endswith('.csv')]
    if not csv_files:
        print(f"⚠️ В папке {folder_path} не найдено файлов CSV.")
        return {}

    datasets = {}
    tables_with_missing = {}
    missing_report = {}

    for file in csv_files:
        table_name = file.replace('.csv', '')
        if verbose:
            print(f'\n📦 Загружается: {file} → `{table_name}`')

        path = os.path.join(folder_path, file)
        df = pd.read_csv(path)

        # Преобразуем названия столбцов и обработаем даты
        df.columns = [to_snake_case(col) for col in df.columns]
        df = convert_dates(df)

        if verbose:
            print(f'➡️ Размер: {df.shape[0]} строк × {df.shape[1]} колонок')
            print(f'🔁 Полных дубликатов: {df.duplicated().sum()}')

        # Удаление полных дубликатов
        initial_shape = df.shape
        df = df.drop_duplicates()
        removed_duplicates = initial_shape[0] - df.shape[0]
        if removed_duplicates > 0:
            print(f'❌ Удалено {removed_duplicates} полных дубликатов')

        # Пропуски
        na_percent = df.isna().mean() * 100
        na_present = na_percent[na_percent > 0].sort_values(ascending=False)

        if not na_present.empty:
            tables_with_missing[table_name] = list(na_present.index)
            missing_report[table_name] = na_present
            if verbose:
                print('⚠️ Пропуски в колонках (%)')
                print(na_present.round(2).to_string())
        else:
            if verbose:
                print('✅ Пропусков нет')

        # Классификация признаков
        date_cols = [col for col in df.columns if 'date' in col or 'datetime' in col]
        text_cols = [col for col in df.select_dtypes(include='object').columns if col not in date_cols]
        numeric_cols = df.select_dtypes(include='number').columns.tolist()

        if verbose:
            print(f'📅 Дата-признаки: {date_cols}')
            print(f'📝 Текстовые: {text_cols[:3]}{" ..." if len(text_cols) > 3 else ""}')
            print(f'🔢 Числовые: {numeric_cols[:3]}{" ..." if len(numeric_cols) > 3 else ""}')

        # Поиск первичного ключа
        primary_keys = [col for col in df.columns if df[col].is_unique and df[col].notna().all()]
        if primary_keys:
            pk = primary_keys[0]
            dupes_by_pk = df.duplicated(subset=[pk]).sum()

            if verbose:
                print(f'🔑 Возможный первичный ключ: {pk}')

            if dupes_by_pk > 0:
                # Если есть дубликаты, удаляем их
                if verbose:
                    print(f'⚠️ Неявные дубликаты по `{pk}`: {dupes_by_pk}')
                df = df.drop_duplicates(subset=[pk])

                if verbose:
                    print(f'✅ Удалено {dupes_by_pk} дубликатов по ключу `{pk}`')
            else:
                if verbose:
                    print(f'✅ Дубликатов по ключу `{pk}` не выявлено.') 

        print("=" * 125) 
        datasets[table_name] = df

    print("\n✅ Загружены датафреймы:")
    for name in datasets:
        print(f' {name}')

    if tables_with_missing:
        print("\n⚠️ Таблицы с пропусками:")
        for name, cols in tables_with_missing.items():
            print(f' {name}: {", ".join(cols)}')
    else:
        print("\n✅ Пропусков не найдено ни в одной таблице.")

    return datasets
