import { useState } from "react";
import type { Category, Kind } from "../types";
import { changeFrom, type MonthPoint } from "../lib/analysis";
import { currency, summaryCents, total } from "../lib/money";
import { monthLabel } from "../lib/dates";
import { Help } from "./Help";
const shortMonth = (m: string) =>
  new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" }).format(
    new Date(m + "-01T12:00:00Z"),
  );
function Change({ previous, current }: { previous: number; current: number }) {
  const c = changeFrom(previous, current);
  return (
    <span className="change">
      {c.difference > 0 ? "+" : ""}
      {currency(c.difference)}
      {c.percent !== null
        ? ` (${c.percent > 0 ? "+" : ""}${c.percent}%)`
        : " · нет базы для %"}
    </span>
  );
}
export function Analysis({
  points,
  cats,
  view,
  loading,
  error,
  onOperations,
}: {
  points: MonthPoint[];
  cats: Category[];
  view: "overview" | "categories";
  loading: boolean;
  error: string;
  onOperations: (category: string) => void;
}) {
  const [kind, setKind] = useState<Kind>("expense");
  const [category, setCategory] = useState("");
  if (loading) return <p role="status">Загружаем динамику…</p>;
  if (error)
    return (
      <p role="alert" className="error">
        Не удалось загрузить анализ: {error}
      </p>
    );
  if (!points.length) return null;
  const last = points.at(-1)!,
    prev = points.at(-2);
  const selected =
    category && cats.some((c) => c.id === category && c.kind === kind)
      ? category
      : "";
  const amounts = points.map((p) =>
    total(
      p.summary
        .filter(
          (s) => s.kind === kind && (!selected || s.category_id === selected),
        )
        .map((s) => summaryCents(s.cents)),
    ),
  );
  const maximum = Math.max(
    1,
    ...(view === "overview"
      ? points.flatMap((p) => [p.earned, p.spent])
      : amounts),
  );
  const categoryRows = cats
    .filter((c) => c.kind === kind)
    .map((c) => ({
      category: c,
      current: summaryCents(
        last.summary.find((s) => s.category_id === c.id)?.cents ?? "0",
      ),
      previous: summaryCents(
        prev?.summary.find((s) => s.category_id === c.id)?.cents ?? "0",
      ),
    }))
    .filter((c) => c.current || c.previous)
    .sort((a, b) => b.current - a.current);
  const expenseRows = cats
    .filter((c) => c.kind === "expense")
    .map((c) => ({
      category: c,
      current: summaryCents(
        last.summary.find((s) => s.category_id === c.id)?.cents ?? "0",
      ),
      previous: summaryCents(
        prev?.summary.find((s) => s.category_id === c.id)?.cents ?? "0",
      ),
    }));
  const largest = [...expenseRows].sort(
    (a, b) => b.current - b.previous - (a.current - a.previous),
  )[0];
  return (
    <div className="analysis-content">
      {view === "overview" ? (
        <>
          <div className="section-heading">
            <h2>Доходы и расходы</h2>
            <Help label="Динамика по месяцам">
              Шесть месяцев до выбранного включительно. Сравниваются полные
              календарные месяцы; текущий месяц ещё не завершён. Переводы
              накоплений не входят в доходы и расходы.
            </Help>
          </div>
          <div className="analysis-legend">
            <span>
              <i className="income-key" />
              Доходы
            </span>
            <span>
              <i className="expense-key" />
              Расходы
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="section-heading">
            <h2>Динамика категорий</h2>
            <Help label="Динамика категорий">
              Выберите тип и категорию. Внизу — суммы за выбранный месяц и
              изменение к предыдущему. Нажатие «Операции» открывает записи этой
              категории.
            </Help>
          </div>
          <div className="filters">
            <label>
              Тип анализа
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as Kind);
                  setCategory("");
                }}
              >
                <option value="expense">Расходы</option>
                <option value="income">Доходы</option>
              </select>
            </label>
            <label>
              Категория анализа
              <select
                value={selected}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Все категории</option>
                {cats
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.archived ? " · удалена" : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </>
      )}
      <article className="chart-card">
        <div
          className="month-chart"
          role="img"
          aria-label={
            view === "overview"
              ? "Доходы и расходы по месяцам; точные суммы в таблице под графиком"
              : "Суммы выбранной категории по месяцам; точные суммы в таблице под графиком"
          }
        >
          {points.map((p, i) => (
            <div className="month-column" key={p.month}>
              <div className="month-bars">
                {view === "overview" ? (
                  <>
                    <span
                      className="income-bar"
                      style={{ height: `${(p.earned / maximum) * 100}%` }}
                    />
                    <span
                      className="expense-bar"
                      style={{ height: `${(p.spent / maximum) * 100}%` }}
                    />
                  </>
                ) : (
                  <span
                    className={kind === "income" ? "income-bar" : "expense-bar"}
                    style={{ height: `${(amounts[i] / maximum) * 100}%` }}
                  />
                )}
              </div>
              <small>{shortMonth(p.month)}</small>
              <small className="chart-year">{p.month.slice(0, 4)}</small>
            </div>
          ))}
        </div>
        <details className="chart-data">
          <summary>Суммы по месяцам</summary>
          <table>
            <caption className="sr-only">Данные графика</caption>
            <thead>
              <tr>
                <th>Месяц</th>
                {view === "overview" ? (
                  <>
                    <th>Доходы</th>
                    <th>Расходы</th>
                  </>
                ) : (
                  <th>{kind === "expense" ? "Расходы" : "Доходы"}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.month}>
                  <th scope="row">{monthLabel(p.month)}</th>
                  {view === "overview" ? (
                    <>
                      <td>{currency(p.earned)}</td>
                      <td>{currency(p.spent)}</td>
                    </>
                  ) : (
                    <td>{currency(amounts[i])}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </article>
      {view === "overview" ? (
        <>
          <article>
            <div className="line">
              <h3>{monthLabel(last.month)}</h3>
              <Help label="Изменение к прошлому месяцу">
                Разница с предыдущим календарным месяцем. Если предыдущая сумма
                равна нулю, процент не рассчитывается.
              </Help>
            </div>
            <div className="comparison-row">
              <span>Доходы</span>
              <div>
                <b>{currency(last.earned)}</b>
                <Change previous={prev?.earned ?? 0} current={last.earned} />
              </div>
            </div>
            <div className="comparison-row">
              <span>Расходы</span>
              <div>
                <b>{currency(last.spent)}</b>
                <Change previous={prev?.spent ?? 0} current={last.spent} />
              </div>
            </div>
            <div className="comparison-row">
              <span>Доходы − расходы</span>
              <b className={last.earned - last.spent < 0 ? "danger" : "green"}>
                {currency(last.earned - last.spent)}
              </b>
            </div>
          </article>
          {largest && largest.current > largest.previous && (
            <article className="insight">
              <small>Наибольший рост расходов к прошлому месяцу</small>
              <div className="line">
                <b>{largest.category.name}</b>
                <b>+{currency(largest.current - largest.previous)}</b>
              </div>
              <button
                className="tiny"
                onClick={() => onOperations(largest.category.id)}
              >
                Посмотреть операции →
              </button>
            </article>
          )}
        </>
      ) : (
        <>
          <article className="category-summary">
            <small>
              {selected
                ? cats.find((c) => c.id === selected)?.name
                : kind === "expense"
                  ? "Все расходы"
                  : "Все доходы"}{" "}
              · {monthLabel(last.month)}
            </small>
            <h3>{currency(amounts.at(-1) ?? 0)}</h3>
            <Change
              previous={amounts.at(-2) ?? 0}
              current={amounts.at(-1) ?? 0}
            />
          </article>
          <h3>Категории за {monthLabel(last.month)}</h3>
          {categoryRows
            .filter((r) => !selected || r.category.id === selected)
            .map((r) => (
              <article className="analysis-category" key={r.category.id}>
                <div className="line">
                  <b>{r.category.name}</b>
                  <b>{currency(r.current)}</b>
                </div>
                <div className="line">
                  <Change previous={r.previous} current={r.current} />
                  <button
                    className="tiny"
                    onClick={() => onOperations(r.category.id)}
                  >
                    Операции →
                  </button>
                </div>
              </article>
            ))}
          {!categoryRows.length && (
            <p className="hint">За эти два месяца операций этого типа нет.</p>
          )}
        </>
      )}
    </div>
  );
}
