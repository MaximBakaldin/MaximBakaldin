#src.arpu.py
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go  # Интерактивные графики
import plotly.io as pio  # Настройки рендеринга
from plotly.subplots import make_subplots


def plot_arpu_aov_dynamics(df_arpu, custom_palette):
    """
    Визуализирует динамику ARPU и AOV с помесячными приростами (MoM).

    Параметры:
    ----------
    df_arpu : pd.DataFrame
        Датафрейм должен содержать столбцы:
        - 'month' (datetime или строка)
        - 'arpu' (float)
        - 'aov' (float)

    custom_palette : list
        Цветовая палитра для графиков (например: ['#636EFA', '#EF553B', '#00CC96', '#AB63FA'])
    """

    # Расчёт приростов
    df_arpu = df_arpu.copy()
    df_arpu['arpu_mom_growth'] = (df_arpu['arpu'].pct_change().fillna(0) * 100).round(2)
    df_arpu['aov_mom_growth'] = (df_arpu['aov'].pct_change().fillna(0) * 100).round(2)

    # Цвета прироста ARPU
    df_arpu['color_arpu'] = df_arpu['arpu_mom_growth'].apply(
        lambda x: custom_palette[0] if x >= 0 else custom_palette[3]
    )

    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        row_heights=[0.5, 0.5],
        vertical_spacing=0.1,
        subplot_titles=[
            "Динамика ARPU и AOV по месяцам",
            "Прирост ARPU (MoM, %)"
        ]
    )

    # Линии ARPU и AOV
    fig.add_trace(
        go.Scatter(
            x=df_arpu['month'],
            y=df_arpu['arpu'],
            name='ARPU',
            mode='lines+markers',
            line=dict(color=custom_palette[0], width=3)
        ),
        row=1, col=1
    )
    fig.add_trace(
        go.Scatter(
            x=df_arpu['month'],
            y=df_arpu['aov'],
            name='AOV',
            mode='lines+markers',
            line=dict(color=custom_palette[2], width=3)
        ),
        row=1, col=1
    )

    # Приросты ARPU (MoM)
    fig.add_trace(
        go.Bar(
            x=df_arpu['month'],
            y=df_arpu['arpu_mom_growth'],
            name='ARPU MoM',
            text=df_arpu['arpu_mom_growth'],
            textposition='outside',
            marker_color=df_arpu['color_arpu'],
            showlegend=False
        ),
        row=2, col=1
    )

    # Оформление
    fig.update_layout(
        height=700,
        title_text='ДИНАМИКА ARPU И AOV',
        hovermode='x unified',
        legend=dict(orientation='h', yanchor='bottom', y=0.92, xanchor='right', x=1)
    )

    fig.update_yaxes(title_text='ARPU / AOV (₽)', row=1, col=1)
    fig.update_yaxes(title_text='Прирост (%)', row=2, col=1)

    fig.show()
