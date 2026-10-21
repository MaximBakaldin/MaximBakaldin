import { useState } from "react";
import type { Category, Kind } from "../types";
import { changeFrom, type MonthPoint } from "../lib/analysis";
import { currency, summaryCents } from "../lib/money";
import { monthLabel } from "../lib/dates";
import { Help } from "./Help";
const shortMonth = (m: string) =>
  new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" }).format(
    new Date(m + "-01T12:00:00Z"),
  );
export function Analysis({
  points,
  cats,
  loading,
  error,
  onOperations,
}: {
  points: MonthPoint[];
  cats: Category[];
  loading: boolean;
  error: string;
  onOperations: (category: string, month: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [kind, setKind] = useState<Kind>("expense");
  if (loading) return <p role="status">Загружаем динамику…</p>;
  if (error)
    return (
      <p role="alert" className="error">
        Не удалось загрузить анализ: {error}
      </p>
    );
  if (!points.length) return null;
  const index = Math.max(
    0,
    selected && points.some((p) => p.month === selected)
      ? points.findIndex((p) => p.month === selected)
      : points.length - 1,
  );
  const point = points[index],
    previous = points[index - 1];
  const sum = kind === "expense" ? point.spent : point.earned;
  const rows = cats
    .filter((c) => c.kind === kind)
    .map((c) => ({
      category: c,
      amount: summaryCents(
        point.summary.find((s) => s.category_id === c.id && s.kind === kind)
          ?.cents ?? "0",
      ),
      previous: summaryCents(
        previous?.summary.find((s) => s.category_id === c.id && s.kind === kind)
          ?.cents ?? "0",
      ),
    }))
    .filter((r) => r.amount || r.previous)
    .sort((a, b) => b.amount - a.amount);
  const max = Math.max(1, ...points.flatMap((p) => [p.spent, p.earned]));
  return (
    <div className="analysis-content">
      <div className="section-heading">
        <h2>Динамика за 6 месяцев</h2>
        <Help label="Динамика по месяцам">
          Нажмите месяц на любом графике: детализация ниже покажет его
          категории. У графиков общая шкала. Текущий месяц может быть
          незавершённым. Переводы накоплений не входят в доходы и расходы.
        </Help>
      </div>
      {(["expense", "income"] as const).map((type) => {
        const name = type === "expense" ? "Расходы" : "Доходы";
        return (
          <article className="trend-chart-card" key={type}>
            <div className="line">
              <h3>{name}</h3>
              <b>{currency(type === "expense" ? point.spent : point.earned)}</b>
            </div>
            <div
              className="interactive-month-chart"
              role="group"
              aria-label={`${name} по месяцам`}
            >
              {points.map((p) => {
                const amount = type === "expense" ? p.spent : p.earned;
                return (
                  <button
                    type="button"
                    className={`chart-month ${p.month === point.month ? "selected" : ""}`}
                    key={p.month}
                    aria-pressed={p.month === point.month}
                    aria-label={`${name}: ${monthLabel(p.month)}, ${currency(amount)}`}
                    onClick={() => {
                      setSelected(p.month);
                      setKind(type);
                    }}
                  >
                    <span className="chart-bar-space">
                      <span
                        className={
                          type === "expense" ? "expense-bar" : "income-bar"
                        }
                        style={{ height: `${(amount / max) * 100}%` }}
                      />
                    </span>
                    <span>{shortMonth(p.month)}</span>
                    <small>{p.month.slice(0, 4)}</small>
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
      <details className="chart-data">
        <summary>Суммы по месяцам</summary>
        <table>
          <caption className="sr-only">Данные графиков</caption>
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Расходы</th>
              <th>Доходы</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month}>
                <th scope="row">{monthLabel(p.month)}</th>
                <td>{currency(p.spent)}</td>
                <td>{currency(p.earned)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <section
        className="category-detail"
        aria-label={`Категории за ${monthLabel(point.month)}`}
      >
        <h3>Категории · {monthLabel(point.month)}</h3>
        <div className="toggle" role="group" aria-label="Тип детализации">
          {(["expense", "income"] as const).map((type) => (
            <button
              key={type}
              className={kind === type ? "selected" : ""}
              aria-pressed={kind === type}
              onClick={() => setKind(type)}
            >
              {type === "expense" ? "Расходы" : "Доходы"}
            </button>
          ))}
        </div>
        <div className="line">
          <b>Всего {currency(sum)}</b>
          <Help label="Изменение категорий">
            Доля считается от суммы выбранного типа за выбранный месяц.
            Изменение — к предыдущему месяцу; при нулевой базе процент не
            рассчитывается.
          </Help>
        </div>
        {rows.map((r) => {
          const change = changeFrom(r.previous, r.amount);
          return (
            <article className="analysis-category" key={r.category.id}>
              <div className="line">
                <b>
                  {r.category.name}
                  {r.category.archived ? " · удалена" : ""}
                </b>
                <b>{currency(r.amount)}</b>
              </div>
              <div className="line">
                <small>
                  {sum ? Math.round((r.amount / sum) * 100) : 0}% ·{" "}
                  {previous
                    ? `${change.difference > 0 ? "+" : ""}${currency(change.difference)}${change.percent === null ? " · нет базы для %" : ` (${change.percent > 0 ? "+" : ""}${change.percent}%)`}`
                    : "нет предыдущего месяца"}
                </small>
                <button
                  className="tiny"
                  aria-label={`Операции: ${r.category.name}`}
                  onClick={() => onOperations(r.category.id, point.month)}
                >
                  Операции →
                </button>
              </div>
            </article>
          );
        })}
        {!rows.length && (
          <p className="hint">В выбранном месяце операций этого типа нет.</p>
        )}
      </section>
    </div>
  );
}
