# src.pretty_table.py

import pandas as pd
from tabulate import tabulate


def pretty_print(df, tablefmt='pretty'):
    print(tabulate(df, headers='keys', tablefmt=tablefmt, showindex=False))


def style_report(df):
    styled = (
        df.style
        .set_table_styles(
            [{'selector': 'th', 'props': [('font-size', '120%'), ('background-color', 'white'), ('color', 'black')]}]
        )
        .set_properties(**{
            'font-size': '110%',
            'white-space': 'nowrap'
        })
        .set_table_attributes('style="width:100%;"')
        .highlight_null('red')
       #.highlight_max(color='lightgreen')
    )
    return styled