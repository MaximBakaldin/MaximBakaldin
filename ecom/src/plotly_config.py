
import plotly.io as pio 
import plotly.graph_objects as go
# Копируем базовый шаблон
base_template = pio.templates['plotly_white']

# Создаём кастомный шаблон с нужными параметрами
custom_template = go.layout.Template(
    layout=go.Layout(
        font=dict(
            family="Segoe UI, sans-serif",
            size=14,
            color="#2A3F5F"
        ),
        title=dict(
            font=dict(
                family="Segoe UI Bold, sans-serif",
                size=22,
                color="#2A3F5F"
            ),
            x=0.05,
            xanchor="left"
        ),
        legend=dict(
            title_font=dict(
                family="Segoe UI, sans-serif",
                size=16,
                color="#2A3F5F"
            ),
            font=dict(
                family="Segoe UI, sans-serif",
                size=14,
                color="#2A3F5F"
            )
        ),
        xaxis=dict(
            title_font=dict(
                family="Segoe UI, sans-serif",
                size=16,
                color="#2A3F5F"
            ),
            tickfont=dict(
                family="Segoe UI, sans-serif",
                size=14,
                color="#2A3F5F"
            )
        ),
        yaxis=dict(
            title_font=dict(
                family="Segoe UI, sans-serif",
                size=16,
                color="#2A3F5F"
            ),
            tickfont=dict(
                family="Segoe UI, sans-serif",
                size=14,
                color="#2A3F5F"
            )
        )
    )
)


# Объединяем шаблон с базовым plotly_white
custom_template.layout.update(base_template.layout)

# Регистрируем кастомный шаблон
pio.templates['custom_white'] = custom_template

# Назначаем его как шаблон по умолчанию (можно и локально в .update_layout(template='custom_white'))
pio.templates.default = 'custom_white'
