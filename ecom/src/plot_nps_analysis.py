from plotly.subplots import make_subplots
import plotly.graph_objects as go

def plot_nps_analysis(nps_df):
    colors = {
        'nps': '#4B9AC7',
        'trend': '#FF6B6B',
        'fill': 'rgba(75, 154, 199, 0.01)',
        'zones': [
            (0, 30, "Удовлетворительно", "rgba(255, 0, 0, 0.07)"),
            (30, 70, "Хорошо", "rgba(255, 165, 0, 0.0001)"),
            (70, 100, "Отлично", "rgba(0, 255, 0, 0.07)")
        ],
        'area': {
            'detractors': 'rgba(231, 76, 60, 0.4)',
            'neutrals': 'rgba(241, 196, 15, 0.04)',
            'promoters': 'rgba(46, 204, 113, 0.4)'
        }
    }

    fig = make_subplots(
        rows=2, cols=1,
        shared_xaxes=True,
        vertical_spacing=0.12,
        subplot_titles=(
            f"Средний уровень NPS {round(nps_df['nps_proxy'].mean())}%",
            f"Доля заказов с оценкой {round(nps_df['response_rate'].mean())}%"
        )
    )

    # NPS-прокси
    fig.add_trace(
        go.Scatter(
            x=nps_df['month'], y=nps_df['nps_proxy'],
            name="NPS-прокси",
            line=dict(color=colors['nps'], width=3),
            fill='tozeroy', fillcolor=colors['fill'],
            hovertemplate="%{x|%b %Y}<br><b>NPS: %{y}%</b>"
        ),
        row=1, col=1
    )

    # Зоны
    for y0, y1, label, color in colors['zones']:
        fig.add_hrect(
            y0=y0, y1=y1, fillcolor=color, line_width=0,
            annotation_text=label, annotation_position="top left",
            row=1, col=1
        )

    # Распределение оценок
    for col, label in zip(['detractors', 'neutrals', 'promoters'], ['1-3★', '4★', '5★']):
        fig.add_trace(
            go.Scatter(
                x=nps_df['month'], y=nps_df[col],
                name=label,
                stackgroup='one',
                mode='none',
                fillcolor=colors['area'][col]
            ),
            row=2, col=1
        )

    fig.update_layout(
        title_text="<b>Анализ пользовательской лояльности OLIST (2017–2018)</b>",
        height=700,
        hovermode="x unified",
        legend=dict(orientation='h', y=0.55, x=0.6)
    )

    fig.update_yaxes(title_text="NPS, %", range=[0, 100], row=1, col=1)
    fig.update_yaxes(title_text="Количество отзывов", row=2, col=1)
    fig.update_xaxes(title_text="Месяц", row=2, col=1)

    fig.show()
