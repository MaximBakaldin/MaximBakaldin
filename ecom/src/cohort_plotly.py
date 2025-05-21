# src/cohort_plotly.py
import plotly.express as px
import plotly.graph_objects as go  # Интерактивные графики
import plotly.io as pio  # Настройки рендеринга
from plotly.subplots import make_subplots
import pandas as pd


def plot_cohort_analysis(df, 
                         title="Когортный анализ",
                         value_col='retention_rate',
                         zmax=1,
                         zmin=0,
                         colorscale='Blues',
                         bar_color=None,
                         exclude_month_zero=True):  
    """
    Визуализация когортного анализа с тепловой картой и размерами когорт
    
    Параметры:
    ----------
    exclude_month_zero : bool, optional
        Исключать ли нулевой месяц (по умолчанию True)
    """
    
        # Автоматический подбор цвета для столбцов
    if bar_color is None:
        try:
            # Для стандартных палитр 
            if isinstance(colorscale, str):
                palette = getattr(px.colors.sequential, colorscale)
            else:
                palette = colorscale
            bar_color = palette[-1]  # Берём последний цвет из палитры
        except (AttributeError, IndexError, TypeError):
            bar_color = 'black'  # Фолбек

    
    # Фильтрация данных
    if exclude_month_zero:
        df = df[df['lifetime_month'] > 0]
        
    cohort_sizes = df.groupby('cohort_month')['cohort_size'].first()
    retention_matrix = df.pivot_table(
        index='cohort_month', 
        columns='lifetime_month',
        values=value_col,
    )
    
    if exclude_month_zero:
        zmax = retention_matrix.max().max() if exclude_month_zero else zmax
        
        
    # Создание фигуры
    fig = make_subplots(
        rows=1, cols=2,
        column_widths=[0.15, 0.85],
        shared_yaxes=True,
        horizontal_spacing=0.002
    )
    
    # 1. Столбцы с размерами когорт
    fig.add_trace(
        go.Bar(
            x=cohort_sizes.values,
            y=cohort_sizes.index.strftime('%m-%Y'),
            orientation='h',
            showlegend=False,
            marker_color=bar_color,
            text=cohort_sizes.values,
            textposition='auto',
            hoverinfo='none'
        ),
        row=1, col=1
    )
    
    # 2. Тепловая карта
    fig.add_trace(
        go.Heatmap(
            z=retention_matrix.values,
            x=retention_matrix.columns,
            y=retention_matrix.index.strftime('%Y-%m'),
            colorscale=colorscale,
            zmin=zmin,
            zmax=zmax,
            colorbar=dict(title=""),
            ygap=1,
            hoverinfo='x+y+z'
        ),
        row=1, col=2
    )
    
    # Настройки layout
    fig.update_layout(
        title_text=title,
        height=800,
        yaxis=dict(
            title="Когорты + размер",
            autorange="reversed",
            type='category',
            tickfont=dict(size=12)
        ),
        yaxis2=dict(
            autorange="reversed",
            showticklabels=False
        ),
        xaxis=dict(
            showticklabels=False,
            title=None,
            autorange="reversed"
        ),
        xaxis2=dict(
            title="Месяцев с первого заказа",
        ),
        margin=dict(l=100, r=100, b=100)
    )
    
    return fig