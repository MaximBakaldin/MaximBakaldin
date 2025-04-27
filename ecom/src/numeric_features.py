# src.numeric_features.py

from scipy import stats
from scipy.stats import shapiro
import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
from tabulate import tabulate
from IPython.display import display, Markdown

def pretty_print(df, tablefmt='simple'):
    print(tabulate(df, headers='keys', tablefmt=tablefmt, showindex=False, ))


def analyze_numeric_features(df_dict, distributions=None, max_sample=5000, bins=30, exclude=None):
    """
    Анализирует числовые признаки в словаре DataFrame и возвращает результаты в виде словаря DataFrame

    Параметры:
        df_dict: Словарь {имя_таблицы: DataFrame}
        distributions: Список распределений для проверки
        max_sample: Максимальный размер выборки для тестов
        bins: Количество бинов для гистограмм
        exclude: Список таблиц для исключения  

    Возвращает:
        Словарь {имя_таблицы: DataFrame с результатами анализа}
    """
    if distributions is None:
        distributions = ['norm', 'expon', 'lognorm', 'gamma', 'beta', 'uniform']
    if exclude is None:
        exclude = []

    results = {}

    for df_name, df in df_dict.items():
        if df_name in exclude:
            continue

        numeric_cols = df.select_dtypes(include='number').columns
        if numeric_cols.empty:
            print(f"\n{'='*125}\n\n{df_name}: Нет числовых признаков для анализа\n")
            continue

        print(f"\n{'='*125}\n\nАнализ числовых признаков в таблице: {df_name.upper()}")

        report_rows = []

        for col in numeric_cols:
            data = df[col].dropna()
            data = data[np.isfinite(data)]
            data = data.astype(float)

            if len(data) > max_sample:
                data = data.sample(max_sample, random_state=42)

            skewness = stats.skew(data)
            kurt = stats.kurtosis(data)
            q1, q3 = np.percentile(data, [25, 75])
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            outliers = ((data < lower) | (data > upper)).sum()
            mean = np.mean(data)
            median = np.median(data)

            comments = []

            # Тест Шапиро
            try:
                p_value = shapiro(data)[1]
                if p_value > 0.05:
                    comments.append("Распределение похоже на нормальное (p > 0.05).")
                else:
                    comments.append("Распределение не похоже на нормальное (p ≤ 0.05).")
            except Exception:
                comments.append("Shapiro-Wilk не применим (слишком много данных).")

            if outliers / len(data) > 0.05:
                comments.append(f"Обнаружено много выбросов: {outliers} ({100 * outliers / len(data):.1f}%).")
            else:
                comments.append(f"Количество выбросов незначительно: {outliers}.")

            if abs(skewness) > 1:
                comments.append(f"Сильная скошенность (skew = {skewness:.2f}).")
            elif abs(skewness) > 0.5:
                comments.append(f"Умеренная скошенность (skew = {skewness:.2f}).")
            else:
                comments.append(f"Распределение симметрично (skew = {skewness:.2f}).")

            # Подбор распределения
            best_fit, best_sse, best_params = None, np.inf, None
            hist, bin_edges = np.histogram(data, bins=bins, density=True)
            x = np.linspace(data.min(), data.max(), 100)

            for dist_name in distributions:
                dist = getattr(stats, dist_name)
                try:
                    params = dist.fit(data)
                    pdf = dist.pdf(bin_edges[:-1], *params)
                    sse = np.sum((hist - pdf) ** 2)
                    if sse < best_sse:
                        best_fit, best_params, best_sse = dist_name, params, sse
                except Exception:
                    continue

            if best_fit:
                comments.append(f"Наилучшее распределение по ММП: {best_fit}.")

            # Визуализация
            plt.figure(figsize=(12, 2.5))
            sns.histplot(data, bins=bins, stat='density', color='lightgray')
            try:
                dist = getattr(stats, best_fit)
                plt.plot(x, dist.pdf(x, *best_params), label=f'Fit: {best_fit}', color='#f0a028')
            except Exception:
                pass

            try:
                kde = stats.gaussian_kde(data)
                x_kde = np.linspace(data.min(), data.max(), 100)
                plt.plot(x_kde, kde(x_kde), color='#1f57ef', label='KDE')
            except Exception as e:
                comments.append(f"KDE plot не построен: {e}")

            plt.axvline(x=mean, color='black', linestyle='--', label=f'Mean: {mean:.2f}')
            plt.title(f"{col}")
            plt.xlabel('')
            plt.legend(frameon=False)
            plt.grid(True)
            plt.tight_layout()
            plt.show()

            # Сохраняем строку для отчета
            report_rows.append({
                "Признак": col,
                "Среднее": mean,
                "Медиана": median,
                "Скошенность": skewness,
               # "Эксцесс": kurt,
                "Выбросы": outliers,
               # "Выбросы %": f"{100 * outliers / len(data):.1f}%",
               # "Лучшее распределение": best_fit,
                "Комментарии": "\n".join(comments)
            })

        # Создаем DataFrame для текущей таблицы
        report_df = pd.DataFrame(report_rows)
        results[df_name] = report_df
        pretty_print(results[df_name])
    print("\n🏁 Анализ числовых признаков завершен!")
    return results
