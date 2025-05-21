#src.ltv.py
import plotly.graph_objects as go
from plotly.subplots import make_subplots

def plot_cohort_ltv_analysis(df, custom_palette):
    """
    Строит график когортного анализа LTV:
    - Все месяцы жизни для каждой когорты
    - Сравнение LTV на 6-й месяц
    
    Параметры:
    ----------
    df : pd.DataFrame
        Датафрейм с колонками:
        - 'cohort_month' (datetime)
        - 'lifetime_month' (int)
        - 'cumulative_ltv' (float)
        - 'cumulative_gmv' (float)
    
    custom_palette : list
        Цветовая палитра, например: ['#636EFA', '#EF553B', '#00CC96', '#AB63FA']
    """

    # Находим топ-когорту по GMV и рассчитываем средний LTV
    top_cohort = df[df['cumulative_gmv'] == df['cumulative_ltv'].max()].sort_values(
        'cumulative_ltv', ascending=False
    ).iloc[0]['cohort_month']
    ltv_avg = df.groupby('lifetime_month')['cumulative_ltv'].mean().reset_index()
    ltv_60 = df[df['lifetime_month'] == 6]  # LTV на 6-й месяц

    fig = make_subplots(rows=2, cols=1, subplot_titles=(
        "LTV по когортам (все месяцы)", 
        "LTV на 6-й месяц жизни"
    ))

    # Линии по когортам
    for cohort in df['cohort_month'].unique():
        cohort_df = df[df['cohort_month'] == cohort]
        color = 'lightgray'
        width = 1
        if cohort == top_cohort:
            color = custom_palette[0]
            width = 2.5
        fig.add_trace(
            go.Scatter(
                x=cohort_df['lifetime_month'],
                y=cohort_df['cumulative_ltv'],
                mode='lines',
                name=f"Когорта {cohort.strftime('%m-%Y')}" if cohort == top_cohort else None,
                line=dict(color=color, width=width),
                showlegend=(cohort == top_cohort)
            ),
            row=1, col=1
        )

    # Средняя линия
    fig.add_trace(
        go.Scatter(
            x=ltv_avg['lifetime_month'],
            y=ltv_avg['cumulative_ltv'],
            mode='lines',
            name='Средний LTV',
            line=dict(color=custom_palette[3], width=2, dash='dash')
        ),
        row=1, col=1
    )

    # Столбцы по когортам на 6-м месяце
    fig.add_trace(
        go.Bar(
            x=ltv_60['cohort_month'],
            y=ltv_60['cumulative_ltv'],
            name='LTV на 6 месяц',
            marker=dict(color=custom_palette[0]),
            showlegend=False
        ),
        row=2, col=1
    )

    # Горизонтальная линия среднего LTV
    fig.add_hline(
        y=ltv_60['cumulative_ltv'].mean(), 
        line_width=2, 
        line_dash="dash", 
        line_color="orange",
        annotation_text=f"Среднее: {round(ltv_60['cumulative_ltv'].mean())}₽",
        row=2, col=1
    )

    # Общее оформление
    fig.update_layout(
        title_text='АНАЛИЗ LTV ПО КОГОРТАМ ПРОДАВЦОВ',
        height=700,
        showlegend=True,
        legend=dict(orientation='h', yanchor='bottom', y=1.03, xanchor='right', x=1)
    )

    fig.update_xaxes(title_text='Месяц жизни', row=1, col=1)
    fig.update_yaxes(title_text='Кумулятивный LTV', row=1, col=1)
    fig.update_xaxes(title_text='Когорта', row=2, col=1)
    fig.update_yaxes(title_text='LTV на 6 месяц', row=2, col=1)

    fig.show()
