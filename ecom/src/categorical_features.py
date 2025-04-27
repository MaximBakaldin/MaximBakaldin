#src.categorical_features.py

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from tabulate import tabulate

def analyze_categorical_features(
    df_dict,
    top_n=5,
    max_cardinality=30,
    figsize=(8, 4),
    palette='viridis',
    exclude_tables=None,
    exclude_columns=None
):
    """
    Анализ категориальных признаков:
    - График распределения (топ-N категорий)
    - Компактная таблица в grid-формате
    - Автоматические рекомендации
    """
    if exclude_tables is None:
        exclude_tables = []
    if exclude_columns is None:
        exclude_columns = []

    analysis_report = {}

    for table_name, df in df_dict.items():
        if table_name in exclude_tables:
            continue

        # Выбор категориальных колонок
        cat_cols = [
            col for col in df.select_dtypes(include=['object', 'category', 'string']).columns
            if (df[col].nunique() <= max_cardinality) and (col not in exclude_columns)
        ]

        if not cat_cols:
            print(f"\n{'='*125}\nВ таблице {table_name.upper()} нет категориальных признаков\n")
            continue

        print(f"\n{'='*125}\nАнализ таблицы: {table_name.upper()}\n")
        
        for col in cat_cols:
            # Подготовка данных
            counts = df[col].value_counts(dropna=False)
            counts_sorted = counts.sort_values(ascending=False).head(top_n)
            total = len(df)
            percentages = (counts_sorted / total * 100).round(1)
            na_count = df[col].isna().sum()
            na_percent = na_count / total * 100
            dominant_pct = percentages.iloc[0] if len(percentages) > 0 else 0

            # 1. График распределения
            plt.figure(figsize=figsize)
            ax = sns.barplot(
                x=counts_sorted.values,
                y=counts_sorted.index,
                palette=palette,
                orient='h',
                order=counts_sorted.index
            )
            
            # Подписи значений
            max_val = counts_sorted.max()
            for i, (val, pct) in enumerate(zip(counts_sorted, percentages)):
                ax.text(
                    x=val + (0.01 * max_val),
                    y=i,
                    s=f"{val:,} ({pct}%)",
                    va='center',
                    ha='left',
                    fontsize=10
                )
            
            ax.set_title(f"Топ-{top_n} категорий - {col} ", fontsize=12, pad=20)
            ax.set_xlabel('Количество')
            ax.set_ylabel('')
            ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"{x:,.0f}"))
            sns.despine()
            plt.tight_layout()
            plt.show()

            # 2. Формирование данных для таблицы
            recommendations = []
            if dominant_pct > 50:
                recommendations.append("⚠️ Дисбаланс (>50%)")
            if na_percent > 5:
                recommendations.append(f"⚠️ Пропуски {na_percent:.1f}%")
            
            table_data = [[
                col,
                f"{len(counts):,}",
                f"{na_count:,} ({na_percent:.1f}%)",
                f"{counts_sorted.index[0]} ({percentages.iloc[0]:.1f}%)",
                ", ".join(recommendations) if recommendations else "🟢 Норма"
            ]]
            
            # 3. Вывод таблицы в grid-формате (как вы просили)
            print(tabulate(
                table_data,
                headers=["Колонка", "Уникальные", "Пропуски", "Топ-1 категория", "Рекомендации"],
                tablefmt="simple",
                stralign="left",
                numalign="left"
            ))
            print()

            # Сохранение в отчет
            analysis_report.setdefault(table_name, {})[col] = {
                'total': total,
                'unique': len(counts),
                'missing': (na_count, na_percent),
                'top_values': counts_sorted.head(5).to_dict(),
                'recommendations': recommendations
            }

    print("\n🏁 Анализ категориальных признаков завершен!")
    return analysis_report