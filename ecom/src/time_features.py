# src/time_features.py

import pandas as pd
import numpy as np
import missingno as msno
from tabulate import tabulate
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.stats import chi2_contingency, f_oneway
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.linear_model import LinearRegression
import logging

def time_series_eda(df_dict, time_freq='W', figsize=(12, 4), palette='Set2', save_plots=False):
    """
    Анализ временных рядов с цветовым кодированием трендов:
    - 📈 Рост: зеленый
    - 📉 Падение: красный
    - ➡️ Стабильность: синий
    """

    def analyze_table(name, df):
        datetime_cols = df.select_dtypes(include=['datetime']).columns
        if len(datetime_cols) == 0:
            return  # Пропускаем таблицы без временных меток

        print(f"\n{'='*125}\nАнализ таблицы: {name.upper()}")

        date_col = datetime_cols[0]
        df = df.dropna(subset=[date_col])
        start_date, end_date = df[date_col].min(), df[date_col].max()

        print(f"📅 Временной диапазон для '{date_col}':\n   Начало: {start_date}\n   Конец:  {end_date}")

        # Агрегация по времени
        ts = df.resample(time_freq, on=date_col).agg({date_col: 'count'}).rename(columns={date_col: 'metric'})
        full_range = pd.date_range(start=start_date, end=end_date, freq=time_freq)
        missing_periods = full_range.difference(ts.index)

        print(f"🔍 Обнаружены пропуски: {len(missing_periods)} периодов.")

        if len(ts) < 2:
            print("📉 Недостаточно точек для тренда.")
            return

        # Анализ тренда
        trend_data = ts.reset_index().rename(columns={ts.index.name or 'index': 'timestamp'})
        trend_data['days'] = (trend_data['timestamp'] - trend_data['timestamp'].min()).dt.days
        X, y = trend_data[['days']], trend_data['metric'].values

        reg = LinearRegression().fit(X, y)
        slope = reg.coef_[0]
        trend_pred = reg.predict(X)

        # Определение типа и цвета тренда
        if slope > 0.05:
            trend_label = '📈 Рост'
            trend_color = '#7eb170'  # Зеленый
        elif slope < -0.05:
            trend_label = '📉 Падение'
            trend_color = '#e64e36'  # Красный
        else:
            trend_label = '➡️ Стабильность'
            trend_color = '#3498db'  # Синий

        print(f"→ Тренд: {trend_label} (наклон = {slope:.2f})")

        # Визуализация
        plt.figure(figsize=figsize)
        
        # Преобразуем временные метки в numpy array перед построением
        timestamps = np.array(trend_data['timestamp'])
        
        # Фактические значения
        sns.lineplot(x=timestamps, y=trend_data['metric'], 
                    label='Факт', color='grey', linewidth=2.5)
        
        # Линия тренда
        plt.plot(timestamps, trend_pred, '--', 
                color=trend_color, linewidth=2.5, alpha=0.8,
                label=f'Тренд ({trend_label})')

        # Настройка графика
        plt.title(f"Анализ временного ряда — {name}\nЧастота: {time_freq}", pad=20)
        plt.xlabel('Дата', labelpad=10)
        plt.ylabel('Количество событий', labelpad=10)
        
        # Улучшенная легенда
        legend = plt.legend(frameon=False, framealpha=0.9)
        legend.get_frame().set_edgecolor('#bdc3c7')
        
        # Сетка и оформление
        plt.grid(axis='y', linestyle='--', alpha=0.4)
        sns.despine()
        plt.tight_layout()

        if save_plots:
            plt.savefig(f"time_series_{name}_{time_freq}.png", dpi=120, bbox_inches='tight')
            plt.close()
        else:
            plt.show()

        # Автоматические выводы
        print("\n📝 Автокомментарии:")
        if slope > 0.1:
            print(f" - 🟢 Сильный рост ({slope:.2f} ед./период)")
        elif slope < -0.1:
            print(f" - 🔴 Сильное снижение ({abs(slope):.2f} ед./период)")
        
        if np.std(y) > 0.3 * np.mean(y):
            print(" - 🔄 Значительные колебания вокруг тренда")
            
        if len(missing_periods) > 0:
            print(f" - ⚠️ Пропущенные периоды: {len(missing_periods)}")
            
        if trend_data['timestamp'].dt.month.value_counts().std() > 2:
            print(" - 🌦️ Обнаружена месячная сезонность")

    # Обработка всех таблиц
    for name, df in df_dict.items():
        analyze_table(name, df)

    print("\n🏁 Анализ временных рядов завершен!")