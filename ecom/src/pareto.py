#src.paretto.py
import plotly.graph_objects as go
from plotly.subplots import make_subplots

def plot_gmv_concentration(df_concentration, custom_palette):
    """
    Строит график концентрации и распределения GMV между продавцами.
    
    Параметры:
    ----------
    df_concentration : pd.DataFrame
        Датафрейм с колонками:
        - 'cumulative_seller_percent'
        - 'cumulative_gmv_percent'
        - 'seller_id'
        - 'gmv'
        - 'percent_gmv'
        - 'gini_index' (одно значение для графика)

    custom_palette : list
        Список с цветами (как минимум один), например: ['#636EFA']
    """

    # Точка Парето: первые 20% продавцов
    pareto_point = df_concentration[df_concentration['cumulative_seller_percent'] >= 20].iloc[0]

    # Сабплот
    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=False,
        vertical_spacing=0.16,
        subplot_titles=[
            f'Концентрация GMV: индекс Джини = {df_concentration["gini_index"].iloc[0]:.2f}',
            'Распределение GMV между продавцами'
        ]
    )

    # Линия концентрации GMV 
    fig.add_trace(
        go.Scatter(
            x=df_concentration['cumulative_seller_percent'],
            y=df_concentration['cumulative_gmv_percent'],
            mode='lines+markers',
            name='Фактическое распределение',
            line=dict(color=custom_palette[0], width=3),
            hovertemplate='<b>Продавец</b>: %{customdata[0]}<br>GMV: %{customdata[1]: .0f}₽<extra></extra>',
            customdata=df_concentration[['seller_id', 'gmv']]
        ),
        row=1, col=1
    )

    # Линия равенства
    fig.add_trace(
        go.Scatter(
            x=[0, 100],
            y=[0, 100],
            mode='lines',
            line=dict(color='grey', dash='dot'),
            name='Идеальное равенство'
        ),
        row=1, col=1
    )

    # Линии Парето
    fig.add_shape(
        type='line',
        x0=20, y0=0, x1=20, y1=pareto_point['cumulative_gmv_percent'],
        line=dict(color='red', width=1, dash='dash'),
        row=1, col=1
    )
    fig.add_shape(
        type='line',
        x0=0, y0=pareto_point['cumulative_gmv_percent'], x1=20, y1=pareto_point['cumulative_gmv_percent'],
        line=dict(color='red', width=1, dash='dash'),
        row=1, col=1
    )

    # Аннотация Парето
    fig.add_annotation(
        x=20,
        y=pareto_point['cumulative_gmv_percent'],
        text=f"{pareto_point['cumulative_gmv_percent']:.1f}% GMV<br>от 20% продавцов",
        showarrow=True,
        arrowhead=1,
        ax=-50,
        ay=-30,
        row=1, col=1
    )

    # Нижний график: Гистограмма
    fig.add_trace(
        go.Histogram(
            x=df_concentration['percent_gmv'],
            nbinsx=50,
            marker_color=custom_palette[0],
            name='Распределение GMV'
        ),
        row=2, col=1
    )

    # Обновление оформления
    fig.update_layout(
        height=700,
        title='Концентрация и распределение GMV между продавцами',
        hovermode='x unified',
        showlegend=False
    )

    fig.update_xaxes(
        title_text='Кумулятивный % продавцов',
        row=1, col=1
    )
    fig.update_yaxes(
        title_text='Кумулятивный % GMV',
        row=1, col=1
    )

    fig.update_xaxes(
        range=[-0.2, 3],
        title_text='Доля GMV на продавца (%)',
        row=2, col=1
    )
    fig.update_yaxes(
        type='log',
        title_text='Количество продавцов',
        row=2, col=1
    )

    fig.show()
