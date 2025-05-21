# src/scatter_plotly.py
import pandas as pd
import plotly.express as px
import plotly.colors as pc

def scatter_quadrant_plot(
    df: pd.DataFrame,
    x_col: str,
    y_col: str,
    x_mean: float = None,
    y_mean: float = None,
    category_col: str = 'category',
    size_col: str = None,
    condition: str = '>',
    top_n: int = None,
    color: str = 'color_group',
    color_palette: list = None,
    title: str = '',
    labels: dict = None,
    show_labels: bool = False,
    show_legend: bool = True
):
    df = df.copy()

    x_mean = x_mean if x_mean is not None else df[x_col].mean()
    y_mean = y_mean if y_mean is not None else df[y_col].mean()

    # Отбор топ-категорий
    if top_n:
        top_categories = df.sort_values(y_col, ascending=False)[category_col].head(top_n).tolist()
    else:
        top_categories = df[category_col].tolist()

    # Назначаем цветовую группу
    if condition == '>':
        df['color_group'] = df.apply(lambda row: row[category_col]
                                     if row[y_col] > y_mean and row[x_col] > x_mean
                                     else 'Другое', axis=1)
    elif condition == '<':
        df['color_group'] = df.apply(lambda row: row[category_col]
                                     if row[y_col] < y_mean and row[x_col] < x_mean
                                     else 'Другое', axis=1)
    else:
        df['color_group'] = df[category_col]

    # Уникальные категории, отсортированные по y_col
    sorted_cats = df[df['color_group'] != 'Другое'].groupby(category_col
                                                           )[y_col].mean().sort_values(ascending=False).index.tolist()

# Генерация палитры по умолчанию
    if not color_palette or len(color_palette) < len(sorted_cats):
        # Если палитра передана, генерируем дополнительные цвета
        if color_palette:
            # Количество недостающих цветов
            remaining_colors_count = len(sorted_cats) - len(color_palette)
            
            # Генерируем недостающие цвета с правильным направлением
            remaining_colors = pc.sample_colorscale(
                'PuBu', [i/(remaining_colors_count-1) for i in range(remaining_colors_count)]
            )
        
            # Добавляем недостающие цвета в конец переданной палитры
            color_palette.extend(remaining_colors)
        else:
            # Если палитра не была передана, генерируем её целиком
            color_palette = pc.sample_colorscale(
                'PuBu', [i/(len(sorted_cats)-1) for i in range(len(sorted_cats))]
            )

    # Переворачиваем палитру, чтобы она шла от меньшего к большему
    color_palette = color_palette[::-1]

    # Назначение цветов
    color_discrete_map = {cat: color_palette[i] for i, cat in enumerate(sorted_cats)}
    color_discrete_map['Другое'] = 'lightgray'

    # Построение графика
    fig = px.scatter(
        df,
        x=x_col,
        y=y_col,
        color=color,
        size=size_col,
        hover_name=category_col,
        labels=labels,
        title=title,
        color_discrete_map=color_discrete_map,
        height=700
    )

    # Линии среднего
    fig.add_vline(
        x=x_mean,
        line_width=1,
        line_dash="dash",
        line_color="gray",
        annotation_text=f"Среднее по X: {int(x_mean)}",
        annotation_position="top right"
    )
    fig.add_hline(
        y=y_mean,
        line_width=1,
        line_dash="dash",
        line_color="gray",
        annotation_text=f"Среднее по У: {round(y_mean, 2)}",
        annotation_position="bottom right"
    )

    # Подписи на точках
    if show_labels:
        for _, row in df[df['color_group'] != 'Другое'].iterrows():
            fig.add_annotation(
                x=row[x_col],
                y=row[y_col],
                text=row[category_col],
                showarrow=False,
                font=dict(
                    family="Segoe UI, sans-serif",
                    size=14,
                    color="black"
                ),
                xanchor='center',
                yanchor='bottom',
                yshift=9
            )

    fig.update_layout(showlegend=show_legend)
    fig.update_traces(marker=dict(line=dict(width=1, color='DarkSlateGrey')))
    fig.update_layout(height=600, legend_title_text='')

    return fig
