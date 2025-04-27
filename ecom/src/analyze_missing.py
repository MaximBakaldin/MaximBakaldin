#src.analyze_missing.py

import pandas as pd
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt
from scipy.stats import pointbiserialr
import missingno as msno

def analyze_missing(df, show_plot=True, return_df=True, corr_threshold=0.3, excluded_columns=None):
    """
    Анализ пропущенных данных с компактным выводом в строку
    
    Параметры:
        df: DataFrame для анализа
        show_plot: показать визуализацию пропусков
        return_df: вернуть DataFrame с результатами
        corr_threshold: порог корреляции для определения зависимостей
        excluded_columns: колонки для исключения
        
    Возвращает:
        DataFrame с результатами (если return_df=True)
    """
    if excluded_columns is None:
        excluded_columns = []
        
    results = []
    na_matrix = df.isna()
    
    # Визуализация пропусков
    if show_plot and na_matrix.any().any():
       msno.matrix(
            df, filter="top", sort=None, figsize=(25, 10),
            color=(0.2, 0.5, 0.75), fontsize=16, labels=None, label_rotation=45, sparkline=False,
            freq=None, ax=None)
       plt.show()
       # plt.figure(figsize=(10, 4))
       # sns.heatmap(na_matrix, cbar=False, cmap='Greys_r', alpha=0.7)
       # plt.xticks(rotation=45, rotation_mode='anchor', ha='right')
       # plt.yticks([])
       # plt.title('Распределение пропусков в данных', loc='left')
       # plt.show()

    # Анализ каждой колонки
    for col in df.columns:
        if col in excluded_columns or not na_matrix[col].any():
            continue
            
        null_pct = na_matrix[col].mean()
        dtype = df[col].dtype
        
        # Определяем тип пропусков
        missing_type = "MCAR"  # По умолчанию считаем случайными
        
        # Проверяем MAR (зависимость от других колонок)
        corr_features = []
        for other_col in df.columns:
            if other_col == col or df[other_col].isna().any():
                continue
                
            try:
                if pd.api.types.is_numeric_dtype(df[other_col]):
                    corr, _ = pointbiserialr(df[col].isna(), df[other_col])
                else:
                    corr = 0  # Для нечисловых колонок упрощаем
                
                if abs(corr) > corr_threshold:
                    corr_features.append(f"{other_col} (r={corr:.2f})")
                    missing_type = "MAR"
            except:
                continue
        
        # Проверяем MNAR (зависимость от самой колонки)
        if pd.api.types.is_numeric_dtype(df[col]):
            present_mean = df[col].mean()
            missing_mean = df[df[col].isna()].mean(numeric_only=True).mean()
            if abs(present_mean - missing_mean) > 0.5*present_mean:
                missing_type = "MNAR"
        
        # Генерируем рекомендации
        action, details = _get_recommendation(col, null_pct, dtype, missing_type, corr_features)
        
        results.append({
            'Колонка': col,
            'Тип': str(dtype),
            'Пропуски': f"{null_pct:.1%}",
            'Тип пропуска': missing_type,
            'Рекомендация': action,
            'Детали': details
        })
    
    if not results:
        print("✅ Нет пропущенных значений для анализа")
        return None
    
    # Вывод результатов в компактной таблице
    return pd.DataFrame(results).sort_values(by='Пропуски', ascending=False) if return_df else None

def _get_recommendation(col, null_pct, dtype, missing_type, corr_features):
    """Генерирует рекомендации по обработке пропусков"""
    if null_pct > 0.5:
        return "Удалить", f"Слишком много пропусков ({null_pct:.1%})"
    
    if missing_type == "MCAR":
        if null_pct > 0.2:
            return "Заполнить + флаг", "Случайные пропуски, но их много"
        return "Заполнить", "Случайные пропуски (MCAR)"
    
    elif missing_type == "MAR":
        feats = ", ".join(corr_features[:2])
        code = _get_imputation_code(col, dtype, corr_features[0].split()[0] if corr_features else None)
        return "Заполнить по группам", f"Зависит от: {feats}\nКод: {code}"
    
    else:  # MNAR
        return "Анализировать вручную", "Возможны систематические пропуски (MNAR)"
           
    print("\n" + "=" * 120)
    print("Справка:")
    print("MCAR - случайные пропуски | MAR - зависят от других данных | MNAR - систематические пропуски")
    print("=" * 120)