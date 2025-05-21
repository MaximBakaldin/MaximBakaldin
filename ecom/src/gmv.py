import pandas as pd
import plotly.express as px
import plotly.graph_objects as go  # Интерактивные графики
import plotly.io as pio  # Настройки рендеринга
from plotly.subplots import make_subplots

#src.gmv.py
def plot_gmv_dynamics(df_growth, custom_palette):
    """
    Визуализирует помесячную динамику GMV и прирост GMV (MoM).

    Параметры:
    ----------
    df_growth : pd.DataFrame
        Датафрейм должен содержать столбцы:
        - 'month' (datetime или строка)
        - 'gmv' (float)
        - 'gmv_mom_growth' (float, прирост GMV в %)

    custom_palette : list
        Цветовая палитра, минимум два цвета: [положительный прирост, отрицательный прирост]
    """

    df_growth = df_growth.copy()
    df_growth['color'] = df_growth['gmv_mom_growth'].apply(
        lambda x: custom_palette[2] if x >= 0 else custom_palette[3]
    )

    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        row_heights=[0.4, 0.6],
        vertical_spacing=0.1,
        subplot_titles=[
            "Динамика GMV (млн руб)",
            "Прирост GMV по месяцам (MoM, %)"
        ]
    )

    # Линия GMV
    fig.add_trace(
        go.Scatter(
            x=df_growth['month'],
            y=df_growth['gmv'] / 1_000_000,
            mode='lines+markers',
            name='GMV',
            line=dict(color=custom_palette[0], width=3)
        ),
        row=1, col=1
    )

    # Столбцы прироста GMV
    fig.add_trace(
        go.Bar(
            x=df_growth['month'],
            y=df_growth['gmv_mom_growth'],
            name='GMV MoM Growth',
            text=df_growth['gmv_mom_growth'],
            textposition='outside',
            marker_color=df_growth['color'],
            showlegend=False
        ),
        row=2, col=1
    )

    # Настройки оформления
    fig.update_layout(
        height=700,
        title_text='<b>Динамика GMV и его прирост по месяцам</b>',
        hovermode='x unified',
        autosize=True,
        showlegend=False
    )

    fig.update_yaxes(title_text='GMV (млн ₽)', row=1, col=1)
    fig.update_yaxes(title_text='Прирост (%)', row=2, col=1,
                     zeroline=True, zerolinewidth=1, zerolinecolor='gray',
                     range=[-50, 120])

    fig.show()

