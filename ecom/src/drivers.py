#src.drirvers.py
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots

def add_seasonality_traces(fig, dataframe, row, title):
    # агрегация
    df_seas = (
        dataframe
        .groupby(['month','category_name_translated'], as_index=False)
        ['category_gmv'].sum()
    )
    last = df_seas['month'].max()
    top5 = (
        df_seas[df_seas['month']==last]
        .nlargest(3,'category_gmv')['category_name_translated']
        .tolist()
    )
    gradient = px.colors.sequential.Blues_r[:5]
    cats = df_seas['category_name_translated'].unique()
    cmap = {c:(gradient[top5.index(c)] if c in top5 else '#CCCCCC') for c in cats}

    # линии
    for cat in cats:
        d = df_seas[df_seas['category_name_translated']==cat]
        fig.add_trace(
            go.Scatter(
                x=d.month, y=d.category_gmv,
                mode='lines',
                line=dict(color=cmap[cat], width=(3 if cat in top5 else 1)),
                name=cat, showlegend=(cat in top5),
                legendgroup=title
            ), row=row, col=1
        )
    # маркеры + подписи
    for i,cat in enumerate(top5):
        y = df_seas.loc[(df_seas.month==last)&(df_seas.category_name_translated==cat),'category_gmv'].iloc[0]
        fig.add_trace(
            go.Scatter(
                x=[last], y=[y],
                mode='markers+text',
                marker=dict(color=gradient[i],size=8),
                text=[f"{cat}"],
                textposition="middle right",
                showlegend=False, legendgroup=title
            ), row=row, col=1
        )
    # расширяем ось X
    fig.update_xaxes(
        range=[df_seas.month.min(), last + pd.Timedelta(days=110)],
        title_text='Месяц', row=row, col=1
    )
    fig.update_yaxes(title_text='GMV (₽)', row=row, col=1)

def add_top5_bar(fig, dataframe, row, col, palette):
    sum_cat = (dataframe
               .groupby('category_name_translated')['category_gmv']
               .sum().nlargest(3))
    fig.add_trace(
        go.Bar(
            x=sum_cat.index, y=sum_cat.values,
            marker_color=palette,
            showlegend=False
        ), row=row, col=col
    )
    fig.update_xaxes(title_text='Категория',
                     tickangle=0,
                     tickfont=dict(size=11),
                     row=row, col=col)
    fig.update_yaxes(title_text='Суммарный GMV (₽)', row=row, col=col)