# src.corr_features.py

from scipy.stats import spearmanr, pearsonr
import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

def analyze_correlations(df_dict, method="pearson", threshold=0.6, figsize=(12, 6),
                        top_pairs=10, cmap='greys', show_scatter=True):
    """
    Улучшенный анализ корреляций с сабплотами:
    
    Parameters:
    - df_dict: словарь {название: DataFrame}
    - method: 'pearson', 'spearman', 'kendall' 
    - threshold: минимальное значение модуля корреляции для вывода
    - figsize: размер всего полотна (heatmap + scatter)
    - top_pairs: количество топ-пар для вывода
    - show_scatter: показывать scatter plot для сильно коррелирующих пар
    """
    
    def _find_strong_correlations(corr, threshold, top_pairs):
        corr_unstacked = corr.unstack()
        corr_unstacked = corr_unstacked[corr_unstacked.index.get_level_values(0) != corr_unstacked.index.get_level_values(1)]
        strong_corrs = corr_unstacked[abs(corr_unstacked) >= threshold]
        strong_corrs = strong_corrs.sort_values(key=abs, ascending=False)
        
        unique_pairs = []
        seen = set()
        for pair, value in strong_corrs.items():
            sorted_pair = tuple(sorted(pair))
            if sorted_pair not in seen:
                seen.add(sorted_pair)
                unique_pairs.append((pair, value))
        
        return unique_pairs[:top_pairs]
    
    for df_name, df in df_dict.items():
        print(f"\n{'='*125}\nАнализ корреляций: {df_name.upper()}")
        
        num_df = df.select_dtypes(include=[np.number]).copy()
        
        if num_df.empty:
            print("⚠️ Нет числовых признаков. Пропускаем.")
            continue
            
        if num_df.shape[1] < 2:
            print(f"⚠️ Только один числовой признак ({num_df.columns[0]}). Пропускаем.")
            continue
        
        methods = [method] if method != "both" else ["pearson", "spearman"]
        
        for m in methods:
            print(f"\n▸ Метод: {m.upper()}")
            corr = num_df.corr(method=m)

            # Поиск сильно коррелирующих пар
            strong_pairs = _find_strong_correlations(corr, threshold, top_pairs)

            # Построение сабплотов
            fig, axes = plt.subplots(1, 2 if show_scatter and strong_pairs else 1, figsize=figsize)

            if not isinstance(axes, np.ndarray):
                axes = [axes]  # Приводим к списку для единообразной работы

            # Первая панель: Heatmap 
            sns.heatmap(
                corr,
                annot=True,
                fmt=".2f",
                cmap=cmap,
                alpha=0.7,
                cbar=False,
                vmin=-0.8, vmax=0.8,
                center=0,
                square=True,
                linewidths=1.0,
                ax=axes[0]
            )
            axes[0].set_title(f"{m.title()} корреляции в {df_name}")
            axes[0].tick_params(axis='y', rotation=0)
            axes[0].tick_params(axis='x', rotation=45)

            
            # Вторая панель: Scatter plot топовой пары 
            if show_scatter and strong_pairs:
                best_pair, best_corr = strong_pairs[0]
                sns.regplot(
                    x=num_df[best_pair[0]],
                    y=num_df[best_pair[1]],
                    color='lightgrey',
                    scatter_kws={'alpha': 0.5, 'edgecolor': 'black'},
                    line_kws={'color': '#1f57ef'},
                    ax=axes[1]
                )
                axes[1].set_title(f"Топ корреляция: {best_pair[0]} vs {best_pair[1]}\n({m}: {best_corr:.2f})")
            sns.despine()
            plt.tight_layout()
            plt.show()
            
            if not strong_pairs:
                print(f"Нет пар с |корреляцией| ≥ {threshold}")
                continue
                
            # Вывод топ-пар
            print(f"\nТоп-{min(top_pairs, len(strong_pairs))} коррелирующих пар (|r| ≥ {threshold}):")
            for pair, value in strong_pairs:
                direction = "↑↑" if value > 0 else "↑↓"
                print(f"- {pair[0]} {direction} {pair[1]}: {value:.2f}")

    print("\n🏁 Анализ корреляций завершен!")
